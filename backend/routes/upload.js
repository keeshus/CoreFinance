import express from 'express';
import multer from 'multer';
import { insertTransaction, upsertDailyBalance, pool, createJob, updateJob, getSettings, getRules } from '../../shared/db.js';
import { parseBankCsv, parseBalanceCsv } from '../../shared/parser.js';
import { flowProducer } from '../../shared/queue.js';
import { AIService } from '../../shared/services/ai.js';
import { toDateStr, validateBalanceMovements } from '../../shared/utils/validation.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per file
});

const getUploadFiles = (req) => {
  const txFile = req.files?.['transactionFile']?.[0];
  const balFile = req.files?.['balanceFile']?.[0];
  return {
    txContent: txFile ? txFile.buffer.toString('utf-8') : null,
    balContent: balFile ? balFile.buffer.toString('utf-8') : null
  };
};

const getAccountSettings = async (client, accountId) => {
  const res = await client.query('SELECT ai_enabled FROM account_names WHERE account = $1', [accountId]);
  if (res.rows.length === 0) {
    throw new Error(`Account ${accountId} does not exist. Please create it in Settings first.`);
  }
  return res.rows[0];
};

router.post('/verify', upload.fields([{ name: 'transactionFile', maxCount: 1 }, { name: 'balanceFile', maxCount: 1 }]), async (req, res) => {
  const { txContent, balContent } = getUploadFiles(req);
  const accountId = req.body.accountId;

  if (!txContent || !balContent) {
    return res.status(400).json({ error: 'Both transaction and balance files are required' });
  }
  if (!accountId) {
    return res.status(400).json({ error: 'Target account ID is required' });
  }

  try {
    const client = await pool.connect();
    try {
      await getAccountSettings(client, accountId);
    } finally {
      client.release();
    }

    const transactions = parseBankCsv(txContent);
    const dailyBalances = parseBalanceCsv(balContent);

    // Filter transactions and balances for the selected account
    const filteredTxs = transactions.filter(t => t.account.replace(/\s/g, '') === accountId.replace(/\s/g, ''));
    const filteredBalances = dailyBalances.filter(b => b.account.replace(/\s/g, '') === accountId.replace(/\s/g, ''));

    if (filteredTxs.length === 0) {
      console.log(`DEBUG: No transactions for ${accountId}. First 3 txs:`, transactions.slice(0, 3));
      return res.status(400).json({ error: `No transactions found for account ${accountId} in the uploaded file.` });
    }

    // Sort and get dates
    const sortedTxs = [...filteredTxs].sort((a, b) => a.date - b.date);
    const earliestTxDate = sortedTxs[0].date;

    const preDay = new Date(earliestTxDate);
    preDay.setDate(preDay.getDate() - 1);
    const preDayStr = toDateStr(preDay);

    // 1. Validate pre-day (starting balance)
    const startingBalanceEntry = filteredBalances.find(b => toDateStr(b.date) === preDayStr);
    if (!startingBalanceEntry) {
      return res.status(400).json({ 
        error: `Missing starting balance for ${preDayStr} (day before first transaction). Balance overview must start at least one day before transactions.` 
      });
    }

    const dailyBalanceMap = filteredBalances.reduce((acc, b) => {
      acc[toDateStr(b.date)] = b.balance;
      return acc;
    }, {});

    const validation = validateBalanceMovements(sortedTxs, dailyBalanceMap, startingBalanceEntry.balance);

    if (!validation.isValid) {
      return res.status(400).json({ 
        error: 'Balance validation failed. Transactions do not match balance overview.',
        discrepancies: validation.discrepancies,
        summary: [{
          account: accountId,
          txCount: filteredTxs.length,
          reportedDays: filteredBalances.length
        }]
      });
    }

    res.json({ 
      transactionCount: filteredTxs.length,
      discrepancies: [],
      summary: [{
        account: accountId,
        txCount: filteredTxs.length,
        reportedDays: filteredBalances.length
      }]
    });


  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/', upload.fields([{ name: 'transactionFile', maxCount: 1 }, { name: 'balanceFile', maxCount: 1 }]), async (req, res) => {
  const { txContent, balContent } = getUploadFiles(req);
  if (!txContent) {
    return res.status(400).json({ error: 'Transaction file is required' });
  }
  const accountId = req.body.accountId;
  const disableAnomalyDetection = req.body.disableAnomaly === 'true';

  if (!accountId) {
    return res.status(400).json({ error: 'Target account ID is required' });
  }

  const transactionFile = req.files?.['transactionFile']?.[0];
  const importJobId = await createJob('csv-import', { 
    accountId, 
    fileName: transactionFile?.originalname || 'unknown', 
    disableAnomalyDetection 
  });

  try {
    await updateJob(importJobId, { status: 'processing', progress: 5, log: 'Starting CSV import process...' });
    
    const normalizedRows = parseBankCsv(txContent);
    const dailyBalances = balContent ? parseBalanceCsv(balContent) : [];

    if (normalizedRows.length === 0) {
      await updateJob(importJobId, { status: 'failed', error: 'No transactions found in CSV' });
      return res.status(400).json({ error: 'No transactions found in CSV. Please ensure your CSV uses English or Dutch headers and has a valid date format (yyyyMMdd).' });
    }

    // Validation: Ensure all rows match the selected account
    const invalidRows = normalizedRows.filter(row => {
      if (!row.account) return false;
      return row.account.replace(/\s/g, '') !== accountId.replace(/\s/g, '');
    });

    if (invalidRows.length > 0) {
      const distinctBadAccounts = [...new Set(invalidRows.map(r => r.account))];
      const errorMsg = `CSV contains transactions for different accounts: ${distinctBadAccounts.join(', ')}. Target account was: ${accountId}.`;
      await updateJob(importJobId, { status: 'failed', error: errorMsg });
      return res.status(400).json({ error: errorMsg });
    }

    if (!balContent) {
      await updateJob(importJobId, { status: 'failed', error: 'Balance overview file is required' });
      return res.status(400).json({ error: 'Balance overview file is now required for all imports to ensure data integrity.' });
    }

    await updateJob(importJobId, { progress: 20, log: `Parsed ${normalizedRows.length} transactions and ${dailyBalances.length} balance entries. Validating...` });

    const sortedTxsForVal = [...normalizedRows].sort((a, b) => a.date - b.date);
    const earliestTxDate = sortedTxsForVal[0].date;

    const preDay = new Date(earliestTxDate);
    preDay.setDate(preDay.getDate() - 1);
    const preDayStr = toDateStr(preDay);

    const filteredBalancesForVal = dailyBalances.filter(b => b.account.replace(/\s/g, '') === accountId.replace(/\s/g, ''));
    
    const startingBalanceEntry = filteredBalancesForVal.find(b => toDateStr(b.date) === preDayStr);
    if (!startingBalanceEntry) {
      const errorMsg = `Missing starting balance for ${preDayStr} (day before first transaction).`;
      await updateJob(importJobId, { status: 'failed', error: errorMsg });
      return res.status(400).json({ error: errorMsg });
    }

    const dailyBalanceMap = filteredBalancesForVal.reduce((acc, b) => {
      acc[toDateStr(b.date)] = b.balance;
      return acc;
    }, {});

    const validation = validateBalanceMovements(sortedTxsForVal, dailyBalanceMap, startingBalanceEntry.balance);

    if (!validation.isValid) {
      const errorMsg = `Balance validation failed at ${validation.discrepancies[0].date}. Expected ${validation.discrepancies[0].expected}, calculated ${validation.discrepancies[0].calculated}.`;
      await updateJob(importJobId, { status: 'failed', error: errorMsg });
      return res.status(400).json({ error: errorMsg });
    }

    await updateJob(importJobId, { progress: 50, log: 'Validation successful. Preparing database insertion...' });

    const client = await pool.connect();
    const rowIds = [];
    
    try {
      const accountSettings = await getAccountSettings(client, accountId);

      await client.query('BEGIN');
      
      const initialBalId = await insertTransaction(client, {
        date: preDay,
        time: '00:00:00',
        account: accountId,
        name_description: 'Initial Balance Adjustment',
        counterparty: 'SYSTEM',
        amount: startingBalanceEntry.balance,
        currency: 'EUR',
        type: 'INITIAL_BALANCE',
        source: 'system',
        import_method: 'system',
        external_id: `initial_balance_${accountId}_${preDayStr}`,
        metadata: { source: 'balance_file', anchor_type: 'pre_day', anchor_date: preDayStr }
      });
      if (initialBalId) rowIds.push(initialBalId);
      
      for (const bal of filteredBalancesForVal) {
          await upsertDailyBalance(client, {
              date: bal.date,
              account: accountId,
              balance: bal.balance
          });
      }

      for (const row of normalizedRows) {
        row.import_method = 'csv';
        const id = await insertTransaction(client, row);
        if (id) {
          rowIds.push(id);
          row.id = id;
        }
      }

      await client.query('COMMIT');
      await updateJob(importJobId, { progress: 80, log: `Successfully saved ${normalizedRows.length} transactions to database.` });
      
      let nextJobId = null;
      if (rowIds.length > 0) {
        nextJobId = await createJob('local-categorization', { transactionIds: rowIds });
        const { localCategorizationQueue } = await import('../../shared/queue.js');
        await localCategorizationQueue.add('local-categorization', { jobId: nextJobId, transactionIds: rowIds });
        await updateJob(importJobId, { log: `Triggered downstream pipeline, started with local-categorization job #${nextJobId}` });
      }

      await updateJob(importJobId, { status: 'completed', progress: 100, log: 'CSV import completed successfully.' });

      res.json({
        message: `Successfully processed ${normalizedRows.length} records for account ${accountId}`,
        job_id: nextJobId || importJobId
      });
    } catch (err) {
      await client.query('ROLLBACK');
      await updateJob(importJobId, { status: 'failed', error: err.message });
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to process CSV file' });
  }
});

export default router;
