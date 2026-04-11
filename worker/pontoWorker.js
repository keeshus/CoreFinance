import {
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
            const normalizedDate = normalizeDate(pt.attributes.valueDate);
            return normalizedDate >= keepFromDate && normalizedDate <= yesterdayStr;
          });

          if (filteredData.length < pontoData.data.length) {
            await updateJob(jobId, { log: `Filtered out ${pontoData.data.length - filteredData.length} transactions outside range ${keepFromDate} - ${yesterdayStr}` });
          }

          allPontoTransactions.push(...filteredData);
          
          if (filteredData.length > 0) {
            const firstDate = normalizeDate(filteredData[0].attributes.valueDate);
            const lastDate = normalizeDate(filteredData[filteredData.length - 1].attributes.valueDate);
            await updateJob(jobId, { log: `Page ${pagesFetched + 1} kept ${filteredData.length} txs. Date range in kept: ${firstDate} to ${lastDate}` });
          }

          // If we received ANY transaction older than our 'keep' date, Ponto has definitely 
          // gone past our relevant window, so we stop fetching entirely.
          const lastNormalizedDate = normalizeDate(pontoData.data[pontoData.data.length - 1].attributes.valueDate);

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

        const normalizedValueDate = normalizeDate(attr.valueDate);

        // Map Ponto to local schema
        const tx = {
          date: normalizedValueDate,
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

      // 3. Balance Reconstruction Anchor
      // Fetch current balance and intraday transactions to find yesterday's EOD
      const accountDetails = await PontoService.fetchAccountDetails(acc.ponto_id);
      const currentBalance = parseFloat(accountDetails.attributes.currentBalance);
      
      // Fetch today's transactions (in memory only) to subtract from current balance
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayData = await PontoService.fetchTransactions(acc.ponto_id, { from: todayStr });
      
      let yesterdayEodBalance = currentBalance;
      if (todayData.data) {
        for (const t of todayData.data) {
          // Only subtract if it's ACTUALLY today local time
          if (normalizeDate(t.attributes.valueDate) === todayStr) {
            yesterdayEodBalance -= parseFloat(t.attributes.amount);
          }
        }
      }

      await updateJob(jobId, { log: `Anchor: Current balance is ${currentBalance}, Today's txs subtracted. Yesterday (${yesterdayStr}) EOD balance: ${yesterdayEodBalance}` });

      // Save yesterday's EOD balance
      await updateDailyBalance(yesterdayStr, acc.account_id, yesterdayEodBalance);

      // 4. Backward reconstruction
      // We walk backwards from yesterday to rebuild history based on actual transactions
      const txsForCalc = await getTransactionsForBalanceCalc(acc.account_id, '2000-01-01');
      
      // Group by date
      const byDate = {};
      txsForCalc.forEach(t => {
        const d = format(new Date(t.date), 'yyyy-MM-dd');
        if (!byDate[d]) byDate[d] = 0;
        byDate[d] += parseFloat(t.amount);
      });

      // We'll iterate backwards from yesterday and subtract/add
      let currentDate = yesterday;
      let currentBal = yesterdayEodBalance;
      
      // Go back 90 days to ensure the graph is updated correctly
      for (let i = 0; i < 90; i++) {
        const dStr = format(currentDate, 'yyyy-MM-dd');
        
        // Save balance for this day
        await updateDailyBalance(dStr, acc.account_id, currentBal);
        
        // Subtract transactions of this day to get the EOD of the PREVIOUS day
        const dayTotal = byDate[dStr] || 0;
        currentBal = Math.round((currentBal - dayTotal) * 100) / 100;
        
        currentDate = subDays(currentDate, 1);
      }

      await updateJob(jobId, { log: `Backward balance reconstruction completed for 90 days.` });

      // 5. Trigger AI Enrichment
      if (newTransactions.length > 0) {
        const aiConfig = await getSettings('ai_config');
        if (aiConfig && aiConfig.enabled) {
          const aiJobId = await createJob('ai-processing', { transactionIds: newTransactions.map(t => t.id) });
          await updateJob(jobId, { log: `Triggering separate AI enrichment job: ${aiJobId}` });

          const rules = await getRules();
          const activeRules = rules.filter(r => r.is_active && !r.is_proposed);
          const aiService = new AIService(aiConfig);
          const historicalContext = await aiService.getHistoricalContext();

          const chunkSize = 50;
          const chunks = [];
          for (let i = 0; i < newTransactions.length; i += chunkSize) {
            chunks.push(newTransactions.slice(i, i + chunkSize));
          }

          await flowProducer.add({
            name: 'finalize',
            queueName: 'ai-processing',
            data: { jobId: aiJobId, totalChunks: chunks.length },
            opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
            children: chunks.map((chunk, index) => ({
              name: 'analyze-chunk',
              queueName: 'ai-processing',
              data: {
                transactions: chunk,
                jobId: aiJobId,
                chunkNum: index + 1,
                totalChunks: chunks.length,
                historicalContext,
                activeRules,
                config: aiConfig
              },
              opts: { 
                attempts: 3, 
                backoff: { type: 'exponential', delay: 2000 },
                removeOnComplete: true
              }
            }))
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
