import {
  pool,
  getPontoAccounts, getLatestTransactionDate, saveTransaction,
  updateDailyBalance, getTransactionsForBalanceCalc, updateJob,
  getSettings, getRules, createJob
} from '../shared/db.js';
import { PontoService } from '../shared/ponto.js';
import { flowProducer } from '../shared/queue.js';
import { AIService } from '../shared/services/ai.js';
import { format, subDays, addDays, parseISO } from 'date-fns';

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
      await updateJob(jobId, { log: `Latest transaction date for ${acc.account_id}: ${latestTxDate}` });
      
      let fetchFromDate; // The date we send to Ponto filter (ge)
      let keepFromDate;  // The date we use for our manual filter
      if (latestTxDate) {
        const latestDate = typeof latestTxDate === 'string' ? parseISO(latestTxDate) : new Date(latestTxDate);
        fetchFromDate = format(latestDate, 'yyyy-MM-dd'); // Ask Ponto from the SAME day to catch late-night UTC entries
        keepFromDate = format(addDays(latestDate, 1), 'yyyy-MM-dd'); // But only KEEP those that fall on the NEXT day local
      } else {
        fetchFromDate = '2000-01-01';
        keepFromDate = '2000-01-01';
      }
      await updateJob(jobId, { log: `Ponto filter ge: ${fetchFromDate}, Keeping from: ${keepFromDate}, Fetching to: ${yesterdayStr}` });

      // Helper for robust date normalization to YYYY-MM-DD in Europe/Amsterdam
      const normalizeDate = (rawDate) => {
        if (!rawDate) return null;
        if (!rawDate.includes('T')) return rawDate;
        try {
          const date = parseISO(rawDate);
          return new Intl.DateTimeFormat('en-CA', { 
            timeZone: 'Europe/Amsterdam', 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
          }).format(date);
        } catch (e) {
          return rawDate.split('T')[0];
        }
      };

      // 2. Fetch transactions from Ponto
      const allPontoTransactions = [];
      let nextUrl = null;
      let pagesFetched = 0;
      
      const pontoConfig = await getSettings('ponto_config');
      const maxTransactions = pontoConfig?.maxTransactions || 500;
      const maxPages = Math.ceil(maxTransactions / 100);

      let reachedOldTransactions = false;
      do {
        await updateJob(jobId, { log: `Fetching page ${pagesFetched + 1} from Ponto (ge: ${fetchFromDate}, le: ${yesterdayStr}, nextUrl: ${nextUrl})` });
        const pontoData = await PontoService.fetchTransactions(acc.ponto_id, {
          from: fetchFromDate,
          to: yesterdayStr,
          nextUrl: nextUrl
        });

        if (pontoData.data && pontoData.data.length > 0) {
          // Double check the range manually to ensure we only keep what we asked for
          const filteredData = pontoData.data.filter(pt => {
            const normalizedDateVal = normalizeDate(pt.attributes.executionDate || pt.attributes.valueDate);
            return normalizedDateVal >= keepFromDate && normalizedDateVal <= yesterdayStr;
          });

          if (filteredData.length < pontoData.data.length) {
            await updateJob(jobId, { log: `Filtered out ${pontoData.data.length - filteredData.length} transactions outside range ${keepFromDate} - ${yesterdayStr}` });
          }

          allPontoTransactions.push(...filteredData);
          
          if (filteredData.length > 0) {
            const firstDate = normalizeDate(filteredData[0].attributes.executionDate || filteredData[0].attributes.valueDate);
            const lastDate = normalizeDate(filteredData[filteredData.length - 1].attributes.executionDate || filteredData[filteredData.length - 1].attributes.valueDate);
            await updateJob(jobId, { log: `Page ${pagesFetched + 1} kept ${filteredData.length} txs. Date range in kept: ${firstDate} to ${lastDate}` });
          }

          // If we received ANY transaction older than our 'keep' date, Ponto has definitely
          // gone past our relevant window, so we stop fetching entirely.
          const lastNormalizedDate = normalizeDate(pontoData.data[pontoData.data.length - 1].attributes.executionDate || pontoData.data[pontoData.data.length - 1].attributes.valueDate);

          if (lastNormalizedDate < fetchFromDate) {
            reachedOldTransactions = true;
            await updateJob(jobId, { log: `Reached transactions older than ${fetchFromDate} (${lastNormalizedDate}). Stopping fetch.` });
          }
        }
        
        nextUrl = pontoData.links?.next;
        pagesFetched++;
      } while (nextUrl && !reachedOldTransactions && pagesFetched < maxPages && allPontoTransactions.length < maxTransactions);

      const newTransactions = [];
      for (const pt of allPontoTransactions.slice(0, maxTransactions)) {
        const attr = pt.attributes;
        
        // Extract time from executionDate if it's a full ISO string
        let time = null;
        if (attr.executionDate && attr.executionDate.includes('T')) {
          try {
            time = format(parseISO(attr.executionDate), 'HH:mm:ss');
          } catch (e) {
            // Ignore
          }
        }

        // Clean up HTML from remittanceInformation
        const cleanRemittance = (attr.remittanceInformation || '')
          .replace(/<[^>]*>?/gm, '') // Strip HTML tags
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();

        const cleanDescription = (attr.description || '')
          .replace(/<[^>]*>?/gm, '')
          .trim();

        const counterpartyName = attr.counterpartyName || attr.counterpartName || 'Unknown';
        const counterpartReference = attr.counterpartyReference || attr.counterpartReference || 'Unknown';
        
        // Title is only the Counterpartname
        const nameDescription = counterpartyName !== 'Unknown' 
          ? counterpartyName 
          : (cleanDescription || cleanRemittance || 'No description');

        const normalizedDate = normalizeDate(attr.executionDate || attr.valueDate);

        // Map Ponto to local schema
        const tx = {
          date: normalizedDate,
          time: time,
          account: acc.account_id,
          name_description: nameDescription,
          counterparty: counterpartReference,
          amount: parseFloat(attr.amount),
          currency: attr.currency,
          source: 'ponto',
          import_method: 'ponto',
          external_id: pt.id,
          metadata: {
            ponto_id: pt.id,
            remittance_information: cleanRemittance,
            description: cleanDescription,
            counterparty_name: counterpartyName,
            counterparty_reference: counterpartReference,
            currency: attr.currency,
            amount: attr.amount,
            value_date: attr.valueDate,
            execution_date: attr.executionDate
          }
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

      // 3. Balance Reconstruction
      const dbRes = await pool.query("SELECT date, balance FROM daily_balances WHERE account = $1 ORDER BY date DESC LIMIT 1", [acc.account_id]);
      
      if (dbRes.rows.length > 0) {
        // Forward calculation from the last known balance
        const lastKnownDateStr = format(new Date(dbRes.rows[0].date), 'yyyy-MM-dd');
        let currentBal = parseFloat(dbRes.rows[0].balance);
        await updateJob(jobId, { log: `Anchor: Found last known reliable EOD balance: ${currentBal} on ${lastKnownDateStr}` });
        
        const txsForCalc = await getTransactionsForBalanceCalc(acc.account_id, lastKnownDateStr);
        const byDate = {};
        txsForCalc.forEach(t => {
          const d = format(new Date(t.date), 'yyyy-MM-dd');
          if (d > lastKnownDateStr) {
            if (!byDate[d]) byDate[d] = 0;
            byDate[d] += parseFloat(t.amount);
          }
        });

        let currentDate = addDays(parseISO(lastKnownDateStr), 1);
        while (currentDate <= yesterday) {
          const dStr = format(currentDate, 'yyyy-MM-dd');
          const dayTotal = byDate[dStr] || 0;
          currentBal = Math.round((currentBal + dayTotal) * 100) / 100;
          
          await updateDailyBalance(dStr, acc.account_id, currentBal);
          currentDate = addDays(currentDate, 1);
        }
        await updateJob(jobId, { log: `Forward balance reconstruction completed.` });
      } else {
        // Fallback: Backward calculation if no history exists
        const accountDetails = await PontoService.fetchAccountDetails(acc.ponto_id);
        const currentBalance = parseFloat(accountDetails.attributes.currentBalance);
        
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const todayData = await PontoService.fetchTransactions(acc.ponto_id, { from: todayStr });
        
        let yesterdayEodBalance = currentBalance;
        if (todayData.data) {
          for (const t of todayData.data) {
            if (normalizeDate(t.attributes.executionDate || t.attributes.valueDate) === todayStr) {
              yesterdayEodBalance -= parseFloat(t.attributes.amount);
            }
          }
        }

        await updateJob(jobId, { log: `Fallback Anchor: Current balance ${currentBalance}. Yesterday EOD: ${yesterdayEodBalance}` });
        await updateDailyBalance(yesterdayStr, acc.account_id, yesterdayEodBalance);

        const txsForCalc = await getTransactionsForBalanceCalc(acc.account_id, '2000-01-01');
        const byDate = {};
        txsForCalc.forEach(t => {
          const d = format(new Date(t.date), 'yyyy-MM-dd');
          if (!byDate[d]) byDate[d] = 0;
          byDate[d] += parseFloat(t.amount);
        });

        let currentDate = yesterday;
        let currentBal = yesterdayEodBalance;
        
        for (let i = 0; i < 90; i++) {
          const dStr = format(currentDate, 'yyyy-MM-dd');
          await updateDailyBalance(dStr, acc.account_id, currentBal);
          const dayTotal = byDate[dStr] || 0;
          currentBal = Math.round((currentBal - dayTotal) * 100) / 100;
          currentDate = subDays(currentDate, 1);
        }

        await updateJob(jobId, { log: `Backward balance reconstruction fallback completed for 90 days.` });
      }

      // 5. Trigger Local Categorization Pipeline
      if (newTransactions.length > 0) {
        const transactionIds = newTransactions.map(t => t.id);
        const nextJobId = await createJob('local-categorization', { transactionIds });
        await updateJob(jobId, { log: `Triggering downstream pipeline, started with local-categorization job: ${nextJobId}` });
        
        const { localCategorizationQueue } = await import('../shared/queue.js');
        await localCategorizationQueue.add('local-categorization', { jobId: nextJobId, transactionIds });
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
