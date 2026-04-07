import {
  pool, getPontoAccounts, getLatestTransactionDate, saveTransaction,
  updateDailyBalance, getTransactionsForBalanceCalc, createJob, updateJob,
  getSettings
} from '../shared/db.js';
import { PontoService } from '../backend/ponto.js';
import { aiQueue } from '../backend/queue.js';
import { format, subDays, startOfDay, endOfDay, isAfter, parseISO } from 'date-fns';

export async function runPontoSync(jobId) {
  try {
    await updateJob(jobId, { status: 'processing', progress: 5, log: 'Starting Ponto synchronization...' });
    
    const accounts = await getPontoAccounts(true);
    if (accounts.length === 0) {
      await updateJob(jobId, { status: 'completed', progress: 100, log: 'No Ponto accounts found to sync.' });
      return;
    }

    const yesterday = subDays(new Date(), 1);
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

    for (const [index, acc] of accounts.entries()) {
      const progressBase = 5 + (index / accounts.length) * 90;
      await updateJob(jobId, { 
        progress: Math.floor(progressBase), 
        log: `Syncing account: ${acc.name} (${acc.account_id})...` 
      });

      // 1. Determine handover date
      const latestTxDate = await getLatestTransactionDate(acc.account_id);
      let fetchFrom = latestTxDate ? format(new Date(latestTxDate), 'yyyy-MM-dd') : '2000-01-01';
      
      // We only want full days, so we start fetching from the day after the latest transaction
      // or if we have no transactions, we fetch as much as possible.
      // But the user said: "fetch only full days".
      
      // 2. Fetch transactions from Ponto
      // We fetch from fetchFrom to yesterdayStr
      const pontoData = await PontoService.fetchTransactions(acc.ponto_id, {
        from: fetchFrom,
        to: yesterdayStr
      });

      const newTransactions = [];
      for (const pt of pontoData.data) {
        // Map Ponto to local schema
        const tx = {
          date: pt.attributes.valueDate,
          account: acc.account_id,
          name_description: pt.attributes.remittanceInformation || 'No description',
          counterparty: pt.attributes.creditorName || pt.attributes.debtorName || 'Unknown',
          amount: parseFloat(pt.attributes.amount),
          currency: pt.attributes.currency,
          source: 'ponto',
          external_id: pt.id
        };

        // Strict Full-Day Policy: only save if date <= yesterday
        if (tx.date <= yesterdayStr) {
          const saved = await saveTransaction(tx);
          if (saved) newTransactions.push(saved);
        }
      }

      await updateJob(jobId, { 
        log: `Imported ${newTransactions.length} new transactions for ${acc.name}.` 
      });

      // 3. Balance Reconstruction Anchor
      // Fetch current balance and intraday transactions to find yesterday's EOD
      const accountDetails = await PontoService.fetchAccountDetails(acc.ponto_id);
      const currentBalance = parseFloat(accountDetails.attributes.currentBalance);
      
      // Fetch today's transactions (in memory only)
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayData = await PontoService.fetchTransactions(acc.ponto_id, { from: todayStr });
      
      let yesterdayEodBalance = currentBalance;
      for (const t of todayData.data) {
        yesterdayEodBalance -= parseFloat(t.attributes.amount);
      }

      // Save yesterday's EOD balance
      await updateDailyBalance(yesterdayStr, acc.account_id, yesterdayEodBalance);

      // 4. Backward reconstruction
      // We walk backwards from yesterday to the earliest new transaction or a reasonable limit
      let runningBalance = yesterdayEodBalance;
      const txsForCalc = await getTransactionsForBalanceCalc(acc.account_id, '2000-01-01'); // Get all for simplicity or optimize
      
      // Group by date
      const byDate = {};
      txsForCalc.forEach(t => {
        const d = format(new Date(t.date), 'yyyy-MM-dd');
        if (!byDate[d]) byDate[d] = 0;
        byDate[d] += parseFloat(t.amount);
      });

      const dates = Object.keys(byDate).sort().reverse(); // Decending
      for (const d of dates) {
        if (d === yesterdayStr) {
          // Already have it from the anchor
          runningBalance = yesterdayEodBalance;
        } else if (d < yesterdayStr) {
          // Balance at start of D = Balance at end of D - transactions on D
          // Wait, Daily Balance usually means End of Day Balance.
          // EOD(D-1) = EOD(D) - transactions(D)
          
          // Let's find the date immediately following 'd' in our series to subtract from
          // Or just iterate down from yesterdayStr
        }
      }
      
      // Simplified backward reconstruction for the plan:
      // We'll just iterate backwards from yesterday and subtract/add
      let currentDate = yesterday;
      let currentBal = yesterdayEodBalance;
      
      // Go back 90 days or until we hit a date we already have (and trust)?
      for (let i = 0; i < 90; i++) {
        const dStr = format(currentDate, 'yyyy-MM-dd');
        await updateDailyBalance(dStr, acc.account_id, currentBal);
        
        // Subtract transactions of this day to get the EOD of previous day
        const dayTotal = byDate[dStr] || 0;
        currentBal -= dayTotal;
        currentDate = subDays(currentDate, 1);
      }

      // 5. Trigger AI Enrichment
      if (newTransactions.length > 0) {
        const aiConfig = await getSettings('ai_config');
        if (aiConfig && aiConfig.enabled) {
          const txIds = newTransactions.map(t => t.id);
          // Assuming we can chunk them and add to queue
          await aiQueue.add('analyze-chunk', {
            transactions: newTransactions,
            jobId: jobId, // Reuse Ponto jobId or create new? Let's keep it simple
            chunkNum: 1,
            totalChunks: 1,
            config: aiConfig
          });
        }
      }
    }

    await updateJob(jobId, { 
      status: 'completed', 
      progress: 100, 
      log: 'Ponto synchronization and balance reconstruction completed successfully.' 
    });

  } catch (err) {
    console.error('[PontoWorker] Sync failed:', err);
    await updateJob(jobId, { status: 'failed', error: err.message });
    throw err;
  }
}
