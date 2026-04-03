import express from 'express';
import multer from 'multer';
import { insertTransaction, pool, createJob } from '../db.js';
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

const validateAccount = async (client, accountId) => {
  const accountExistsRes = await client.query('SELECT 1 FROM account_names WHERE account = $1', [accountId]);
  if (accountExistsRes.rows.length === 0) {
    throw new Error(`Account ${accountId} does not exist. Please create it in Settings first.`);
  }
};

router.post('/verify', upload.fields([{ name: 'transactionFile', maxCount: 1 }, { name: 'balanceFile', maxCount: 1 }]), async (req, res) => {
  const { txContent, balContent } = getUploadFiles(req);
  if (!txContent || !balContent) {
    return res.status(400).json({ error: 'Both transaction and balance files are required' });
  }

  try {
    const transactions = parseBankCsv(txContent);
    const dailyBalances = parseBalanceCsv(balContent);

    const discrepancies = [];
    // 1. Get current balances for the accounts in the uploaded file
    const affectedAccounts = [...new Set(transactions.map(t => t.account))];
    
    // 2. Sort transactions by date to simulate import
    const sortedTxs = [...transactions].sort((a, b) => a.date - b.date);
    
    // 3. Group transactions by date and account for cross-checking
    const txsByDayAndAccount = sortedTxs.reduce((acc, t) => {
      const dStr = t.date.toISOString().split('T')[0];
      if (!acc[dStr]) acc[dStr] = {};
      if (!acc[dStr][t.account]) acc[dStr][t.account] = 0;
      acc[dStr][t.account] += t.amount;
      return acc;
    }, {});

    // 4. Group balance overview by day and account
    const dailyBalanceMap = dailyBalances.reduce((acc, b) => {
      const dStr = b.date.toISOString().split('T')[0];
      if (!acc[dStr]) acc[dStr] = {};
      acc[dStr][b.account] = b.balance;
      return acc;
    }, {});

    // 5. Cross check
    const days = [...new Set([...Object.keys(txsByDayAndAccount), ...Object.keys(dailyBalanceMap)])].sort();
    
    for (const day of days) {
      for (const account of affectedAccounts) {
        const reportedBalance = dailyBalanceMap[day]?.[account];
        
        if (reportedBalance !== undefined) {
           // To verify the reported balance for 'day', we need the LAST reported balance before 'day'.
           const prevReportedDay = days.slice(0, days.indexOf(day)).reverse().find(d => dailyBalanceMap[d]?.[account] !== undefined);

           if (prevReportedDay) {
             const startingBalance = dailyBalanceMap[prevReportedDay][account];
             
             // Find transactions that happened AFTER prevReportedDay up to and including 'day'
             const periodTxs = sortedTxs.filter(t => {
               const tDateStr = t.date.toISOString().split('T')[0];
               return t.account === account && tDateStr > prevReportedDay && tDateStr <= day;
             });
             const periodChange = periodTxs.reduce((sum, t) => sum + t.amount, 0);
             
             const calculatedEndingBalance = Math.round((startingBalance + periodChange) * 100) / 100;
             const reportedBalanceRounded = Math.round(reportedBalance * 100) / 100;
             
             if (Math.abs(calculatedEndingBalance - reportedBalanceRounded) > 0.001) {
               discrepancies.push({
                 account,
                 date: day,
                 expected: reportedBalance,
                 calculated: calculatedEndingBalance,
                 diff: reportedBalance - calculatedEndingBalance,
                 periodStart: prevReportedDay,
                 periodEnd: day
               });
             }
           }
        }
      }
    }

    res.json({ 
      discrepancies,
      transactionCount: transactions.length,
      summary: affectedAccounts.map(acc => ({
        account: acc,
        txCount: transactions.filter(t => t.account === acc).length,
        reportedDays: dailyBalances.filter(b => b.account === acc).length
      }))
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
    const invalidRows = normalizedRows.filter(row => row.account && row.account.replace(/\s/g, '') !== accountId.replace(/\s/g, ''));
    if (invalidRows.length > 0) {
      const distinctBadAccounts = [...new Set(invalidRows.map(r => r.account))];
      return res.status(400).json({ 
        error: `CSV contains transactions for different accounts: ${distinctBadAccounts.join(', ')}. Target account was: ${accountId}` 
      });
    }

    const client = await pool.connect();
    const rowIds = [];
    
    try {
      await validateAccount(client, accountId);

      // Check for new accounts (in transactions table)
      const existingAccountInTxsRes = await client.query('SELECT 1 FROM transactions WHERE account = $1 LIMIT 1', [accountId]);
      const isFirstImport = existingAccountInTxsRes.rows.length === 0;

      await client.query('BEGIN');
      
      // Insert initial balance transactions from balance overview if available
      if (isFirstImport) {
          const earliestDate = normalizedRows.reduce((min, r) => r.date < min ? r.date : min, normalizedRows[0].date);
          
          const initDate = new Date(earliestDate);
          initDate.setDate(initDate.getDate() - 1);
          const initDateStr = initDate.toISOString().split('T')[0];

          const reportedBalance = dailyBalances.find(b => {
            const bDateStr = b.date.toISOString().split('T')[0];
            return b.account.replace(/\s/g, '') === accountId.replace(/\s/g, '') && bDateStr === initDateStr;
          });

          if (reportedBalance) {
            const id = await insertTransaction(client, {
              date: initDate,
              account: accountId,
              name_description: 'Initial Balance Adjustment',
              counterparty: 'SYSTEM',
              amount: reportedBalance.balance,
              currency: 'EUR',
              type: 'INITIAL_BALANCE',
              source: 'system',
              external_id: `initial_balance_${accountId}`
            });
            if (id) rowIds.push(id);
          }
      }

      for (const row of normalizedRows) {
        const id = await insertTransaction(client, row);
        if (id) rowIds.push(id);
      }

      await client.query('COMMIT');
      
      // Trigger AI analysis in the background via BullMQ
      const jobPayload = { transactionIds: rowIds };
      const jobId = await createJob('ai_categorization', jobPayload);
      
      await aiQueue.add('analyze', {
        transactions: normalizedRows,
        jobId: jobId
      });

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
