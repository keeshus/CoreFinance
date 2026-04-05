import express from 'express';
import multer from 'multer';
import { insertTransaction, upsertDailyBalance, pool, createJob } from '../db.js';
import { parseBankCsv, parseBalanceCsv } from '../parser.js';
import { aiQueue } from '../queue.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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

    const toDateStr = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Sort and get dates
    const sortedTxs = [...filteredTxs].sort((a, b) => a.date - b.date);
    const earliestTxDate = sortedTxs[0].date;
    const latestTxDate = sortedTxs[sortedTxs.length - 1].date;

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

    // 2. Daily cross-reference validation
    const discrepancies = [];
    const dailyBalanceMap = filteredBalances.reduce((acc, b) => {
      acc[toDateStr(b.date)] = b.balance;
      return acc;
    }, {});

    const txsByDay = sortedTxs.reduce((acc, t) => {
      const dStr = toDateStr(t.date);
      acc[dStr] = (acc[dStr] || 0) + t.amount;
      return acc;
    }, {});

    // Iterate through transaction days and validate balance movement
    let currentBalance = startingBalanceEntry.balance;
    const txDays = [...new Set(sortedTxs.map(t => toDateStr(t.date)))].sort();
    const latestTxDateStr = toDateStr(latestTxDate);

    // Sort all reported balance days to iterate through them, but only up to the last transaction date
    const balanceDays = Object.keys(dailyBalanceMap)
      .filter(dStr => dStr <= latestTxDateStr)
      .sort();
    const allDays = [...new Set([...txDays, ...balanceDays])].sort();

    for (const dayStr of allDays) {
      const dayChange = txsByDay[dayStr] || 0;
      currentBalance = Math.round((currentBalance + dayChange) * 100) / 100;
      
      const reportedBalance = dailyBalanceMap[dayStr];
      if (reportedBalance !== undefined) {
        const reportedBalanceRounded = Math.round(reportedBalance * 100) / 100;
        if (Math.abs(currentBalance - reportedBalanceRounded) > 0.001) {
          discrepancies.push({
            date: dayStr,
            expected: reportedBalance,
            calculated: currentBalance,
            diff: reportedBalance - currentBalance
          });
        }
      }
    }

    if (discrepancies.length > 0) {
      return res.status(400).json({ 
        error: 'Balance validation failed. Transactions do not match balance overview.',
        discrepancies,
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

  try {
    const normalizedRows = parseBankCsv(txContent);
    const dailyBalances = balContent ? parseBalanceCsv(balContent) : [];

    if (normalizedRows.length === 0) {
      return res.status(400).json({ error: 'No transactions found in CSV. Please ensure your CSV uses English or Dutch headers and has a valid date format (yyyyMMdd).' });
    }

    // Validation: Ensure all rows match the selected account
    // If a row has an account, it MUST match the selected accountId exactly (ignoring whitespace)
    const invalidRows = normalizedRows.filter(row => {
      if (!row.account) return false;
      return row.account.replace(/\s/g, '') !== accountId.replace(/\s/g, '');
    });

    if (invalidRows.length > 0) {
      const distinctBadAccounts = [...new Set(invalidRows.map(r => r.account))];
      return res.status(400).json({
        error: `CSV contains transactions for different accounts: ${distinctBadAccounts.join(', ')}. Target account was: ${accountId}. Please ensure the account exists in Settings.`
      });
    }

    if (!balContent) {
      return res.status(400).json({ error: 'Balance overview file is now required for all imports to ensure data integrity.' });
    }

    const toDateStr = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const sortedTxsForVal = [...normalizedRows].sort((a, b) => a.date - b.date);
    const earliestTxDate = sortedTxsForVal[0].date;
    const latestTxDate = sortedTxsForVal[sortedTxsForVal.length - 1].date;

    const preDay = new Date(earliestTxDate);
    preDay.setDate(preDay.getDate() - 1);
    const preDayStr = toDateStr(preDay);

    const filteredBalancesForVal = dailyBalances.filter(b => b.account.replace(/\s/g, '') === accountId.replace(/\s/g, ''));
    
    // 1. Validate pre-day (starting balance)
    const startingBalanceEntry = filteredBalancesForVal.find(b => toDateStr(b.date) === preDayStr);
    if (!startingBalanceEntry) {
      return res.status(400).json({
        error: `Missing starting balance for ${preDayStr} (day before first transaction). Balance overview must start at least one day before transactions.`
      });
    }

    // 2. Daily cross-reference validation
    const discrepancies = [];
    const dailyBalanceMap = filteredBalancesForVal.reduce((acc, b) => {
      acc[toDateStr(b.date)] = b.balance;
      return acc;
    }, {});

    const txsByDay = sortedTxsForVal.reduce((acc, t) => {
      const dStr = toDateStr(t.date);
      acc[dStr] = (acc[dStr] || 0) + t.amount;
      return acc;
    }, {});

    let validationBalance = startingBalanceEntry.balance;
    const txDays = [...new Set(sortedTxsForVal.map(t => toDateStr(t.date)))].sort();
    const latestTxDateStr = toDateStr(latestTxDate);
    
    // Sort all reported balance days to iterate through them, but only up to the last transaction date
    const balanceDays = Object.keys(dailyBalanceMap)
      .filter(dStr => dStr <= latestTxDateStr)
      .sort();
    const allDays = [...new Set([...txDays, ...balanceDays])].sort();

    for (const dayStr of allDays) {
      const dayChange = txsByDay[dayStr] || 0;
      validationBalance = Math.round((validationBalance + dayChange) * 100) / 100;
      
      const reportedBalance = dailyBalanceMap[dayStr];
      if (reportedBalance !== undefined) {
        const reportedBalanceRounded = Math.round(reportedBalance * 100) / 100;
        if (Math.abs(validationBalance - reportedBalanceRounded) > 0.001) {
          discrepancies.push({
            date: dayStr,
            expected: reportedBalance,
            calculated: validationBalance,
            diff: reportedBalance - validationBalance
          });
        }
      }
    }

    if (discrepancies.length > 0) {
      return res.status(400).json({
        error: 'Balance validation failed. Transactions do not match balance overview.',
        discrepancies
      });
    }

    const client = await pool.connect();
    const rowIds = [];
    
    try {
      const accountSettings = await getAccountSettings(client, accountId);

      await client.query('BEGIN');
      
      // Use pre-day balance to set or adjust initial balance
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
        external_id: `initial_balance_${accountId}_${preDayStr}`,
        metadata: { source: 'balance_file', anchor_type: 'pre_day', anchor_date: preDayStr }
      });
      if (initialBalId) rowIds.push(initialBalId);
      // Save official daily balances
      for (const bal of filteredBalancesForVal) {
          await upsertDailyBalance(client, {
              date: bal.date,
              account: accountId,
              balance: bal.balance
          });
      }

      for (const row of normalizedRows) {
        const id = await insertTransaction(client, row);
        if (id) {
          rowIds.push(id);
          row.id = id;
        }
      }

      await client.query('COMMIT');
      
      let jobId = null;
      if (rowIds.length > 0 && accountSettings?.ai_enabled) {
        // Trigger AI analysis in the background via BullMQ
        const jobPayload = { transactionIds: rowIds, disableAnomalyDetection };
        jobId = await createJob('ai_categorization', jobPayload);
        
        await aiQueue.add('analyze', {
          transactions: normalizedRows.filter(r => rowIds.includes(r.id)),
          jobId: jobId,
          disableAnomalyDetection
        });
      }

      res.json({
        message: `Successfully processed ${normalizedRows.length} records for account ${accountId}`,
        job_id: jobId
      });
    } catch (err) {
      await client.query('ROLLBACK');
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
