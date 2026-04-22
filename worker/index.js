import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pool, addRule, updateJob, createJob } from '../shared/db.js';

const connection = new IORedis(process.env.VALKEY_URL || 'valkey://localhost:6379', {
  maxRetriesPerRequest: null,
});

connection.on('connect', () => {
  console.log('Valkey (Redis) connected successfully in Worker');
});

connection.on('error', (err) => {
  console.error('Valkey (Redis) connection error in Worker:', err.message);
});
import { AIService } from '../shared/services/ai.js';
import os from 'os';

const workerId = `worker-${os.hostname()}-${process.pid}`;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'default-dev-key';

import { runPontoSync } from './pontoWorker.js';
import { runCategorizationAudit, localCategorizeTransactions } from '../shared/db.js';
import { aiCategorizationQueue, anomalyDetectionQueue, detectSubscriptionsQueue, flowProducer } from '../shared/queue.js';

const pingBackend = async () => {
  if (!INTERNAL_API_KEY) {
    console.error('INTERNAL_API_KEY not set in Worker, cannot ping backend');
    return;
  }
  try {
    const res = await fetch(`${BACKEND_URL}/api/workers/ping`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': INTERNAL_API_KEY
      },
      body: JSON.stringify({
        workerId,
        metadata: {
          hostname: os.hostname(),
          platform: os.platform(),
          uptime: os.uptime(),
          memory: os.freemem(),
        }
      })
    });
    if (res.ok) {
      console.log(`Successfully connected and pinged backend as ${workerId}`);
    } else {
      console.error(`Backend rejected ping with status ${res.status}`);
    }
  } catch (err) {
    console.error('Failed to ping backend:', err.message);
  }
};

// Ping every 60 seconds
setInterval(pingBackend, 60000);
pingBackend(); // Initial ping

// Event loop lag monitor
let lastCheck = Date.now();
setInterval(() => {
  const now = Date.now();
  const lag = now - lastCheck - 1000;
  if (lag > 100) {
    console.warn(`[Worker] Event loop lag detected: ${lag}ms`);
  }
  lastCheck = now;
}, 1000);

const worker = new Worker('ai-processing', async (job) => {
  console.log(`[Worker] Received job: ${job.name} (ID: ${job.id})`);
  if (job.name === 'categorization-audit') {
    const { jobId } = job.data;
    const result = await runCategorizationAudit(jobId);
    const subJobId = await createJob('detect-subscriptions', { parentJobId: jobId });
    await detectSubscriptionsQueue.add('detect-subscriptions', { jobId: subJobId, parentJobId: jobId });
    return result;
  } else if (job.name === 'analyze-chunk') {
    const { 
      transactions, 
      jobId, 
      chunkNum, 
      totalChunks, 
      disableAnomalyDetection, 
      historicalContext, 
      activeRules,
      config 
    } = job.data;
    
    try {
      const jobLogger = async (msg) => {
        console.log(`[Job ${jobId}] ${msg}`);
        await updateJob(jobId, { log: msg });
      };

      const aiService = new AIService(config, jobLogger);
      
      let currentTransactions = [...transactions];
      let enrichedIds = new Set();
      let attempts = 0;
      const maxAttempts = 3;

      while (currentTransactions.length > 0 && attempts < maxAttempts) {
        attempts++;
        if (attempts > 1) {
          await jobLogger(`Retry attempt ${attempts}/${maxAttempts} for ${currentTransactions.length} remaining transactions...`);
        }

        try {
          await aiService.processBatch(currentTransactions, activeRules, {
            disableAnomalyDetection,
            historicalContext,
            onTransactionEnriched: async (enriched) => {
              try {
                // Ensure we use a consistent ID type (int) for deduplication
                const numericId = parseInt(enriched.id);
                if (isNaN(numericId)) {
                  console.error(`[Worker] Received invalid ID from AI: ${enriched.id}`);
                  return;
                }

                await pool.query(
                    'UPDATE transactions SET ai_enriched = true, metadata = metadata || $1::jsonb WHERE id = $2',
                    [JSON.stringify(enriched), numericId]
                );
                enrichedIds.add(numericId);

                if (enriched.proposed_rules && Array.isArray(enriched.proposed_rules)) {
                  for (const rule of enriched.proposed_rules) {
                    await addRule(rule.name, rule.description, true, rule.expected_amount, rule.amount_margin, rule.type, rule.category);
                  }
                }

                // Update progress for each item in the batch
                const baseProgress = Math.floor(((chunkNum - 1) / totalChunks) * 100);
                const chunkContribution = Math.floor((enrichedIds.size / transactions.length) * (100 / totalChunks));
                const totalProgress = Math.min(99, baseProgress + chunkContribution);

                await updateJob(jobId, {
                  status: 'processing',
                  progress: totalProgress,
                  workerId
                });
              } catch (e) {
                console.error(`[Worker] Failed to save transaction ${enriched.id}:`, e);
              }
            }
          });
        } catch (batchErr) {
          await jobLogger(`Gemini error in attempt ${attempts}: ${batchErr.message}`);
          if (attempts >= maxAttempts) {
            throw batchErr;
          }
          // Continue to next while iteration for retry
        }

        // Clean currentTransactions by filtering out what we just enriched
        const previousCount = currentTransactions.length;
        currentTransactions = currentTransactions.filter(t => !enrichedIds.has(parseInt(t.id)));
        const newlyEnriched = previousCount - currentTransactions.length;

        if (currentTransactions.length > 0 && attempts < maxAttempts) {
          await jobLogger(`Chunk ${chunkNum}: Processed ${newlyEnriched} items. ${currentTransactions.length} items still remaining. Waiting before retry...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
        }
      }

      if (currentTransactions.length > 0) {
        await jobLogger(`Warning: ${currentTransactions.length}/${transactions.length} transactions in this chunk were not enriched after ${maxAttempts} attempts.`);
        if (enrichedIds.size === 0) {
          throw new Error('No transactions were enriched in this batch after multiple attempts.');
        }
      }

      return { processed: enrichedIds.size, total: transactions.length };
    } catch (err) {
      console.error(`[Worker] Chunk ${chunkNum} failed:`, err);
      // We don't mark the whole jobId as failed here yet, 
      // let the retry mechanism handle it or let finalize detect it.
      throw err;
    }
  } else if (job.name === 'finalize') {
    const { jobId, totalChunks } = job.data;
    console.log(`[Worker] Finalizing job ${jobId}. All ${totalChunks} chunks reported complete.`);
    
    try {
      await updateJob(jobId, {
        status: 'completed',
        progress: 100,
        log: `AI categorization completed successfully. Processed ${totalChunks} parallel chunks.`
      });
      console.log(`[Worker] Job ${jobId} marked as completed.`);

      // Check for deviations and send push notification
      try {
        const { getJob, pool } = await import('../shared/db.js');
        const { sendPushNotification } = await import('../shared/notifications.js');
        
        const jobRecord = await getJob(jobId);
        if (jobRecord && jobRecord.payload && jobRecord.payload.transactionIds) {
          const ids = jobRecord.payload.transactionIds;
          
          if (ids.length > 0) {
            const res = await pool.query(`
              SELECT id, name_description, amount, currency
              FROM transactions
              WHERE id = ANY($1) AND (
                metadata->>'is_anomalous' = 'true'
                OR (
                  jsonb_typeof(metadata->'rule_violations') = 'array'
                  AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements(metadata->'rule_violations') AS v
                    WHERE v::text != '"none"' AND v::text != '"None"'
                  )
                )
              )
            `, [ids]);
            
            const deviations = res.rows;
            if (deviations.length > 0) {
              const title = `Ponto Sync: ${deviations.length} deviation(s) found`;
              const body = deviations.map(d => `${d.name_description} (${d.amount} ${d.currency})`).join(', ');
              await sendPushNotification(title, body, '/?tab=deviations');
            } else {
              await sendPushNotification('Ponto Sync Finished', `Processed ${ids.length} transactions, no deviations found.`, '/');
            }
          }
        }
      } catch (notifErr) {
        console.error('Error sending push notification on finalize:', notifErr);
      }
    } catch (err) {
      console.error(`[Worker] Failed to finalize job ${jobId}:`, err);
      throw err;
    }
  }
}, { connection, lockDuration: 120000, concurrency: 5 });
new Worker('ponto-sync', async (job) => {
  if (job.name === 'ponto-sync') {
    let { jobId } = job.data;

    // If this is a scheduled job without a pre-created DB record, create one now
    if (!jobId) {
      jobId = await createJob('ponto-sync', { scheduled: true });
      console.log(`[Worker] Created new DB job record ${jobId} for scheduled Ponto sync`);
    }

    await runPontoSync(jobId);
  }
}, { connection, lockDuration: 300000, concurrency: 1 });
console.log(`Worker starting (ID: ${workerId})...`);
console.log(`BullMQ Worker configuration: lockDuration=${worker.opts.lockDuration}ms`);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with ${err.message}`);
});

// New separated workers

new Worker('local-categorization', async (job) => {
  const { jobId, transactionIds } = job.data;
  console.log(`[Worker] Running local-categorization for job ${jobId}`);
  const { localCategorizeTransactions } = await import('../shared/db.js');
  await localCategorizeTransactions(jobId, transactionIds);
  
  // Enqueue next step
  const { aiCategorizationQueue } = await import('../shared/queue.js');
  await aiCategorizationQueue.add('ai-categorization', { jobId, transactionIds });
}, { connection, lockDuration: 120000, concurrency: 1 });

new Worker('ai-categorization', async (job) => {
  if (job.name === 'ai-categorization') {
  const { jobId, transactionIds } = job.data;
  console.log(`[Worker] Running ai-categorization for job ${jobId}`);
  
  const { getSettings, getRules, createJob } = await import('../shared/db.js');
  const aiConfig = await getSettings('ai_config');
  if (!aiConfig || !aiConfig.enabled) {
     await updateJob(jobId, { log: 'AI categorization disabled, skipping.' });
     const subJobId = await createJob('detect-subscriptions', { parentJobId: jobId });
     await detectSubscriptionsQueue.add('detect-subscriptions', { jobId: subJobId, parentJobId: jobId, transactionIds });
     return;
  }
  
  // Only process uncategorized transactions
  const res = await pool.query('SELECT * FROM transactions WHERE id = ANY($1) AND (metadata->>\'ai_category\' IS NULL OR metadata->>\'ai_category\' = \'Uncategorized\')', [transactionIds]);
  const uncategorizedTxs = res.rows;
  
  if (uncategorizedTxs.length === 0) {
     await updateJob(jobId, { log: 'No uncategorized transactions to process with AI.' });
     await detectSubscriptionsQueue.add('detect-subscriptions', { jobId, transactionIds });
     return;
  }
  
  const rules = await getRules();
  const catRules = rules.filter(r => r.is_active && !r.is_proposed && r.type === 'categorization');
  
  const chunkSize = 50;
  const chunks = [];
  for (let i = 0; i < uncategorizedTxs.length; i += chunkSize) {
    chunks.push(uncategorizedTxs.slice(i, i + chunkSize));
  }
  
  const aiCatJobId = await createJob('ai-categorization', { parentJobId: jobId });
  await updateJob(jobId, { log: `Triggering AI categorization job ${aiCatJobId} for ${uncategorizedTxs.length} txs` });
  
  await flowProducer.add({
    name: 'finalize-ai-cat',
    queueName: 'ai-categorization',
    data: { jobId: aiCatJobId, parentJobId: jobId, transactionIds, totalChunks: chunks.length },
    opts: { attempts: 3 },
    children: chunks.map((chunk, index) => ({
      name: 'analyze-chunk-cat',
      queueName: 'ai-categorization',
      data: {
        transactions: chunk,
        jobId: aiCatJobId,
        chunkNum: index + 1,
        totalChunks: chunks.length,
        activeRules: catRules,
        config: aiConfig,
        jobType: 'categorization'
      },
      opts: { attempts: 3, removeOnComplete: true }
    }))
  });
  } else if (job.name === 'analyze-chunk-cat' || job.name === 'analyze-chunk-anomaly') {
    const { transactions, jobId, chunkNum, totalChunks, activeRules, config, jobType } = job.data;
    const { AIService } = await import('../shared/services/ai.js');
    const aiService = new AIService(config, async (msg) => { console.log(msg); await updateJob(jobId, { log: msg }); });
    let currentTransactions = [...transactions];
    let enrichedIds = new Set();
    
    await aiService.processBatch(currentTransactions, activeRules, {
      jobType,
      historicalContext: jobType === 'anomaly' ? await aiService.getHistoricalContext() : [],
      onTransactionEnriched: async (enriched) => {
        try {
          const { addRule } = await import('../shared/db.js');
          const numericId = parseInt(enriched.id);
          if (isNaN(numericId)) return;
          await pool.query(
            'UPDATE transactions SET ai_enriched = true, metadata = metadata || $1::jsonb WHERE id = $2',
            [JSON.stringify(enriched), numericId]
          );
          enrichedIds.add(numericId);
          if (enriched.proposed_rules) {
            for (const rule of enriched.proposed_rules) {
              await addRule(rule.name, rule.description, true, rule.expected_amount, rule.amount_margin, rule.type, rule.category);
            }
          }
          await updateJob(jobId, { status: 'processing', progress: Math.min(99, Math.floor(((chunkNum - 1) / totalChunks) * 100) + Math.floor((enrichedIds.size / transactions.length) * (100 / totalChunks))) });
        } catch (e) {
          console.error(`Failed to save transaction ${enriched.id}:`, e);
        }
      }
    });
    return { processed: enrichedIds.size, total: transactions.length };
  } else if (job.name === 'finalize-ai-cat') {
    const { jobId, parentJobId, transactionIds } = job.data;
    await updateJob(jobId, { status: 'completed', progress: 100, log: 'AI Categorization completed.' });
    await updateJob(parentJobId, { log: 'AI Categorization completed.' });
    const subJobId = await createJob('detect-subscriptions', { parentJobId });
    await detectSubscriptionsQueue.add('detect-subscriptions', { jobId: subJobId, parentJobId, transactionIds });
  } else if (job.name === 'finalize-ai-anomaly') {
    const { jobId, parentJobId, transactionIds } = job.data;
    await updateJob(jobId, { status: 'completed', progress: 100, log: 'Anomaly Detection completed.' });
    await updateJob(parentJobId, { status: 'completed', progress: 100, log: 'Job pipeline fully completed.' });
    // Subscriptions handled before anomaly detection
    
    // Notification logic
    const { sendPushNotification } = await import('../shared/notifications.js');
    if (transactionIds.length > 0) {
      const res = await pool.query(`SELECT id, name_description, amount, currency FROM transactions WHERE id = ANY($1) AND (metadata->>'is_anomalous' = 'true' OR (jsonb_typeof(metadata->'rule_violations') = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(metadata->'rule_violations') AS v WHERE v::text != '"none"' AND v::text != '"None"')))`, [transactionIds]);
      const deviations = res.rows;
      if (deviations.length > 0) {
        await sendPushNotification(`Ponto Sync: ${deviations.length} deviation(s) found`, deviations.map(d => `${d.name_description} (${d.amount} ${d.currency})`).join(', '), '/?tab=deviations');
      } else {
        await sendPushNotification('Ponto Sync Finished', `Processed ${transactionIds.length} transactions, no deviations found.`, '/');
      }
    }
  }
}, { connection, lockDuration: 120000, concurrency: 5 });
new Worker('anomaly-detection'
, async (job) => {
  const { jobId, transactionIds } = job.data;
  console.log(`[Worker] Running anomaly-detection for job ${jobId}`);
  
  const { getSettings, getRules, createJob } = await import('../shared/db.js');
  const aiConfig = await getSettings('ai_config');
  if (!aiConfig || !aiConfig.enabled) {
     await updateJob(jobId, { status: 'completed', progress: 100, log: 'Job pipeline fully completed (AI disabled).' });
     // Subscriptions handled before anomaly detection
     return;
  }
  
  const res = await pool.query('SELECT * FROM transactions WHERE id = ANY($1)', [transactionIds]);
  const txs = res.rows;
  
  const rules = await getRules();
  const validationRules = rules.filter(r => r.is_active && !r.is_proposed && r.type === 'validation');
  
  const chunkSize = 50;
  const chunks = [];
  for (let i = 0; i < txs.length; i += chunkSize) {
    chunks.push(txs.slice(i, i + chunkSize));
  }
  
  const aiAnomJobId = await createJob('anomaly-detection', { parentJobId: jobId });
  await updateJob(jobId, { log: `Triggering Anomaly Detection job ${aiAnomJobId} for ${txs.length} txs` });
  
  await flowProducer.add({
    name: 'finalize-ai-anomaly',
    queueName: 'ai-categorization', // Reusing the same queue for actual processing handler
    data: { jobId: aiAnomJobId, parentJobId: jobId, transactionIds, totalChunks: chunks.length },
    opts: { attempts: 3 },
    children: chunks.map((chunk, index) => ({
      name: 'analyze-chunk-anomaly',
      queueName: 'ai-categorization',
      data: {
        transactions: chunk,
        jobId: aiAnomJobId,
        chunkNum: index + 1,
        totalChunks: chunks.length,
        activeRules: validationRules,
        config: aiConfig,
        jobType: 'anomaly'
      },
      opts: { attempts: 3, removeOnComplete: true }
    }))
  });
}, { connection, lockDuration: 120000, concurrency: 1 });

new Worker('detect-subscriptions', async (job) => {
  const { jobId, transactionIds } = job.data;
  console.log(`[Worker] Running detect-subscriptions for job ${jobId}`);
  
  const { getSubscriptionGroupsForDetection, addSubscription, getSettings, updateJob } = await import('../shared/db.js');
  const aiConfig = await getSettings('ai_config');
  if (!aiConfig || !aiConfig.enabled) {
     if (jobId) await updateJob(jobId, { log: 'Subscription detection skipped (AI disabled).' });
     return;
  }

  if (jobId) await updateJob(jobId, { status: 'processing', progress: 0, log: 'Starting subscription detection...' });
  
  try {
    const groups = await getSubscriptionGroupsForDetection(transactionIds);
    if (groups.length === 0) {
       if (jobId) await updateJob(jobId, { status: 'completed', progress: 100, log: 'No new subscription groups found.' });
       return;
    }

    const aiService = new AIService(aiConfig, async (msg) => { 
      console.log(msg); 
      if (jobId) await updateJob(jobId, { log: msg }); 
    });

    const { getRules } = await import('../shared/db.js');
    const allRules = await getRules();
    const subRules = allRules.filter(r => r.type === 'subscription' && r.is_active);
    
    let addedCount = 0;
    let remainingGroups = [];

    // Local Rules Pass
    for (const group of groups) {
      let matched = false;
      const sampleTx = group.transactions[0];
      const searchText = `${sampleTx.counterparty || ''} ${sampleTx.name_description || ''}`.toLowerCase();

      for (const rule of subRules) {
        if (searchText.includes(rule.pattern.toLowerCase())) {
          await addSubscription(
            group.match_key,
            rule.name,
            rule.category || 'Subscriptions',
            group.avg_amount,
            'monthly', // Default for local rules if not specified
            null
          );
          addedCount++;
          matched = true;
          if (jobId) await updateJob(jobId, { log: `Local match for ${rule.name} (${group.match_key})` });
          break;
        }
      }
      if (!matched) remainingGroups.push(group);
    }

    if (remainingGroups.length > 0) {
      const results = await aiService.detectSubscriptionsFromGroups(remainingGroups);
      for (const res of results) {
        if (res.is_subscription) {
          const group = remainingGroups.find(g => g.match_key === res.match_key);
          if (group) {
             await addSubscription(
               res.match_key, 
               res.name || 'Unknown Subscription', 
               res.category || 'Subscriptions', 
               group.avg_amount, 
               res.frequency || 'monthly', 
               null
             );
             addedCount++;
          }
        }
      }
    }

    if (jobId) await updateJob(jobId, { status: 'completed', progress: 100, log: `Subscription detection completed. Added ${addedCount} new subscriptions.` });
    
    // Chain to anomaly detection only if we have specific transaction IDs (from a sync)
    // Avoids massive job spam during global audits
    if (transactionIds && Array.isArray(transactionIds) && transactionIds.length > 0) {
      const { anomalyDetectionQueue } = await import('../shared/queue.js');
      await anomalyDetectionQueue.add('anomaly-detection', { jobId, transactionIds });
    } else if (jobId) {
      await updateJob(jobId, { status: 'completed', progress: 100, log: 'Subscription detection completed. Skipping anomaly detection for global audit.' });
    }
  } catch (err) {
    console.error('Subscription detection failed', err);
    if (jobId) await updateJob(jobId, { status: 'failed', error: err.message });
  }
}, { connection, lockDuration: 120000, concurrency: 1 });
