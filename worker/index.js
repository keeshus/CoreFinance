import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pool, getSettings, getRules, addRule, getAccountNames, updateJob, createJob } from '../shared/db.js';

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
  if (job.name === 'analyze-chunk') {
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
          const batchResults = await aiService.processBatch(currentTransactions, activeRules, { 
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
    } catch (err) {
      console.error(`[Worker] Failed to finalize job ${jobId}:`, err);
      throw err;
    }
  }
}, { connection, lockDuration: 120000, concurrency: 5 });

const pontoWorker = new Worker('ponto-sync', async (job) => {
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
