import express from 'express';
import multer from 'multer';
import { insertTransaction, pool, getSettings, getRules, addRule, getAccountNames } from '../db.js';
import { parseBankCsv, parseBalanceCsv } from '../parser.js';
import { AIService } from '../services/ai.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

async function processAIAsync(transactions) {
  const config = await getSettings('vertex_ai_config');
  if (!config || !config.enabled) return;

  const accountInfo = await getAccountNames();
  const enabledAccounts = accountInfo.filter(a => a.ai_enabled).map(a => a.account);
  
  const filteredTransactions = transactions.filter(t => enabledAccounts.includes(t.account));
  
  if (filteredTransactions.length === 0) return;

  const rules = await getRules();
  const activeRules = rules.filter(r => r.is_active && !r.is_proposed);

  const aiService = new AIService(config);
  const results = await aiService.processBatch(filteredTransactions, activeRules);

  for (const res of results) {
    const { id, ai_category, is_anomalous, anomaly_reason, rule_violations, proposed_rules } = res;
    
    // Update transaction metadata
    await pool.query(
      "UPDATE transactions SET metadata = metadata || $2::jsonb WHERE id = $1",
      [id, JSON.stringify({ ai_category, is_anomalous, anomaly_reason, rule_violations })]
    );

    // Insert proposed rules
    if (proposed_rules && proposed_rules.length > 0) {
      for (const ruleText of proposed_rules) {
        await addRule('Proposed Rule', ruleText, true);
      }
    }
  }
}

router.post('/verify', upload.fields([{ name: 'transactionFile', maxCount: 1 }, { name: 'balanceFile', maxCount: 1 }]), async (req, res) => {
  if (!req.files || !req.files['transactionFile'] || !req.files['balanceFile']) {
    return res.status(400).json({ error: 'Both transaction and balance files are required' });
  }

    try {
      const txContent = req.files['transactionFile'][0].buffer.toString('utf-8');
      const balContent = req.files['balanceFile'][0].buffer.toString('utf-8');
      
      const transactions = parseBankCsv(txContent);
      const dailyBalances = parseBalanceCsv(balContent);

      const client = await pool.connect();
      const discrepancies = [];

      try {
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

      } finally {
        client.release();
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Verification failed' });
    }
});

router.post('/', upload.fields([{ name: 'transactionFile', maxCount: 1 }, { name: 'balanceFile', maxCount: 1 }]), async (req, res) => {
  if (!req.files || !req.files['transactionFile']) {
    return res.status(400).json({ error: 'Transaction file is required' });
  }
  req.files['transactionFile'][0].buffer.toString('utf-8');
  req.files['balanceFile'] ? req.files['balanceFile'][0].buffer.toString('utf-8') : null;
  try {
    const txContent = req.files['transactionFile'][0].buffer.toString('utf-8');
    const balContent = req.files['balanceFile'] ? req.files['balanceFile'][0].buffer.toString('utf-8') : null;
    
    const normalizedRows = parseBankCsv(txContent);
    const dailyBalances = balContent ? parseBalanceCsv(balContent) : [];

    const client = await pool.connect();
    
    try {
      // Check for new accounts
      const existingAccountsRes = await client.query('SELECT DISTINCT account FROM transactions');
      const existingAccounts = new Set(existingAccountsRes.rows.map(r => r.account));
      
      const newAccounts = [...new Set(normalizedRows.map(r => r.account))].filter(acc => !existingAccounts.has(acc));

        await client.query('BEGIN');
        
        // Insert initial balance transactions from balance overview if available
        for (const account of newAccounts) {
            // Find earliest date in CSV for this account
            const accountTxs = normalizedRows.filter(r => r.account === account);
            if (accountTxs.length === 0) continue;

            const earliestDate = accountTxs.reduce((min, r) => r.date < min ? r.date : min, accountTxs[0].date);
            
            // The starting balance of 01-01-2020 is the ending balance of 31-12-2019 in the balance overview.
            const initDate = new Date(earliestDate);
            initDate.setDate(initDate.getDate() - 1);
            const initDateStr = initDate.toISOString().split('T')[0];

            const reportedBalance = dailyBalances.find(b => {
              const bDateStr = b.date.toISOString().split('T')[0];
              return (b.account === account || b.account === account.replace(/\s/g, '')) && bDateStr === initDateStr;
            });

            if (reportedBalance) {
              await insertTransaction(client, {
                date: initDate,
                account: account,
                name_description: 'Initial Balance Adjustment',
                counterparty: 'SYSTEM',
                amount: reportedBalance.balance,
                currency: 'EUR',
                type: 'INITIAL_BALANCE',
                source: 'system',
                external_id: `initial_balance_${account}`
              });
            }
        }
for (const row of normalizedRows) {
        await insertTransaction(client, row);
      }

      await client.query('COMMIT');
      
      // Trigger AI analysis in the background
      processAIAsync(normalizedRows).catch(err => console.error('AI background processing error:', err));

      res.json({ message: `Successfully processed ${normalizedRows.length} records` });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process CSV file' });
  }
});

export default router;
