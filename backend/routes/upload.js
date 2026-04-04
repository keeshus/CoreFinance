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
      return res.status(400).json({ error: `No transactions found for account ${accountId} in the uploaded file.` });
    }

    const discrepancies = [];
    // 1. Use the selected account
    const affectedAccounts = [accountId];
    
    // 2. Sort transactions by date to simulate import
    const sortedTxs = [...filteredTxs].sort((a, b) => a.date - b.date);
    
    // Use a consistent date string helper
    const toDateStr = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // 3. Group transactions by date and account for cross-checking
    const txsByDayAndAccount = sortedTxs.reduce((acc, t) => {
      const dStr = toDateStr(t.date);
      if (!acc[dStr]) acc[dStr] = {};
      const accId = t.account.replace(/\s/g, '');
      if (!acc[dStr][accId]) acc[dStr][accId] = 0;
      acc[dStr][accId] += t.amount;
      return acc;
    }, {});

    // 4. Group balance overview by day and account
    const dailyBalanceMap = filteredBalances.reduce((acc, b) => {
      const dStr = toDateStr(b.date);
      if (!acc[dStr]) acc[dStr] = {};
      acc[dStr][b.account.replace(/\s/g, '')] = b.balance;
      return acc;
    }, {});

    // 5. Cross check
    const days = [...new Set([...Object.keys(txsByDayAndAccount), ...Object.keys(dailyBalanceMap)])].sort();
    
    for (const day of days) {
      for (const account of affectedAccounts) {
        const accId = account.replace(/\s/g, '');
        const reportedBalance = dailyBalanceMap[day]?.[accId];
        
        if (reportedBalance !== undefined) {
           // To verify the reported balance for 'day', we need the LAST reported balance before 'day'.
           const prevReportedDay = days.slice(0, days.indexOf(day)).reverse().find(d => dailyBalanceMap[d]?.[accId] !== undefined);

           if (prevReportedDay) {
             const startingBalance = dailyBalanceMap[prevReportedDay][accId];
             
             // Find transactions that happened AFTER prevReportedDay up to and including 'day'
             const periodTxs = sortedTxs.filter(t => {
               const tDateStr = toDateStr(t.date);
               return t.account.replace(/\s/g, '') === accId && tDateStr > prevReportedDay && tDateStr <= day;
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
      transactionCount: filteredTxs.length,
      summary: affectedAccounts.map(acc => ({
        account: acc,
        txCount: filteredTxs.filter(t => t.account.replace(/\s/g, '') === acc.replace(/\s/g, '')).length,
        reportedDays: filteredBalances.filter(b => b.account.replace(/\s/g, '') === acc.replace(/\s/g, '')).length
      }))
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/', upload.fields([{ name: 'transactionFile', maxCount: 1 }, { name: 'balanceFile', maxCount: 1 }]), async (req, res) => {
  const { txContent, balContent } = getUploadFiles(req);
  console.log('Upload Route: Received upload request');
  if (!txContent) {
    return res.status(400).json({ error: 'Transaction file is required' });
  }
  const accountId = req.body.accountId;
  console.log('Upload Route: Target account ID:', accountId);
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

    const client = await pool.connect();
    const rowIds = [];
    
    try {
      const accountSettings = await getAccountSettings(client, accountId);

      await client.query('BEGIN');
      
      // If we have a balance file, try to establish or update the initial balance anchor
      if (dailyBalances.length > 0) {
          const earliestTxDate = normalizedRows.reduce((min, r) => r.date < min ? r.date : min, normalizedRows[0].date);
          
          const toDateStr = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          };

          // Strategy 1: Look for the balance on the day BEFORE the first transaction (Cleanest anchor)
          const dayBeforeTxDate = new Date(earliestTxDate);
          dayBeforeTxDate.setDate(dayBeforeTxDate.getDate() - 1);
          const dayBeforeTxDateStr = toDateStr(dayBeforeTxDate);

          const reportedBalanceDayBefore = dailyBalances.find(b => {
            return b.account.replace(/\s/g, '') === accountId.replace(/\s/g, '') && toDateStr(b.date) === dayBeforeTxDateStr;
          });

          if (reportedBalanceDayBefore) {
            const id = await insertTransaction(client, {
              date: dayBeforeTxDate,
              time: '00:00:00',
              account: accountId,
              name_description: 'Initial Balance Adjustment',
              counterparty: 'SYSTEM',
              amount: reportedBalanceDayBefore.balance,
              currency: 'EUR',
              type: 'INITIAL_BALANCE',
              source: 'system',
              external_id: `initial_balance_${accountId}`,
              metadata: { source: 'balance_file', anchor_type: 'day_before', anchor_date: dayBeforeTxDateStr }
            });
            if (id) rowIds.push(id);
          } else {
            // Strategy 2: Look for the balance on the EARLIEST day available in the balance file
            // as long as it's NOT after the earliest transaction.
            const sortedBalances = [...dailyBalances]
              .filter(b => b.account.replace(/\s/g, '') === accountId.replace(/\s/g, ''))
              .sort((a, b) => a.date - b.date);
            
            const earliestReportedBalance = sortedBalances[0];
            
            if (earliestReportedBalance) {
               const reportedDateStr = toDateStr(earliestReportedBalance.date);
               
               // If it's on the same day as earliest transaction, calculate start-of-day balance
               if (reportedDateStr === toDateStr(earliestTxDate)) {
                  const dayTxsSum = normalizedRows
                    .filter(r => toDateStr(r.date) === reportedDateStr)
                    .reduce((sum, r) => sum + r.amount, 0);
                  const startingBalance = earliestReportedBalance.balance - dayTxsSum;
                  
                  const initDate = new Date(earliestTxDate);
                  initDate.setDate(initDate.getDate() - 1);

                  const id = await insertTransaction(client, {
                    date: initDate,
                    time: '00:00:00',
                    account: accountId,
                    name_description: 'Initial Balance Adjustment (Calculated)',
                    counterparty: 'SYSTEM',
                    amount: startingBalance,
                    currency: 'EUR',
                    type: 'INITIAL_BALANCE',
                    source: 'system',
                    external_id: `initial_balance_${accountId}`,
                    metadata: { source: 'balance_file', anchor_type: 'same_day_calculation', anchor_date: reportedDateStr }
                  });
                  if (id) rowIds.push(id);
               }
               // If it's even earlier, just use it as is
               else if (earliestReportedBalance.date < earliestTxDate) {
                  const id = await insertTransaction(client, {
                    date: earliestReportedBalance.date,
                    time: '00:00:00',
                    account: accountId,
                    name_description: 'Initial Balance Adjustment',
                    counterparty: 'SYSTEM',
                    amount: earliestReportedBalance.balance,
                    currency: 'EUR',
                    type: 'INITIAL_BALANCE',
                    source: 'system',
                    external_id: `initial_balance_${accountId}`,
                    metadata: { source: 'balance_file', anchor_type: 'early_reported', anchor_date: reportedDateStr }
                  });
                  if (id) rowIds.push(id);
               }
            }
          }
      }

      // Save official daily balances if provided
      for (const bal of dailyBalances) {
          if (bal.account.replace(/\s/g, '') === accountId.replace(/\s/g, '')) {
              await upsertDailyBalance(client, {
                  date: bal.date,
                  account: accountId,
                  balance: bal.balance
              });
          }
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
        const jobPayload = { transactionIds: rowIds };
        jobId = await createJob('ai_categorization', jobPayload);
        
        await aiQueue.add('analyze', {
          transactions: normalizedRows.filter(r => rowIds.includes(r.id)),
          jobId: jobId
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
