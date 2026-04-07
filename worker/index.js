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
      console.log(`[Worker] Starting chunk ${chunkNum}/${totalChunks} (${transactions.length} transactions) for job ${jobId}`);
      
      // Update DB progress occasionally
      if (chunkNum === 1 || chunkNum % 5 === 0) {
        await updateJob(jobId, { 
          status: 'processing',
          progress: 10 + Math.floor((chunkNum / totalChunks) * 80), 
          log: `Analyzing chunk ${chunkNum} of ${totalChunks}...`,
          workerId 
        });
      }

      const aiService = new AIService(config);
      const results = await aiService.processBatch(transactions, activeRules, { 
        disableAnomalyDetection,
        historicalContext 
      });

      console.log(`[Worker] Chunk ${chunkNum} AI call finished. Received ${results?.length} results.`);

      for (const res of results) {
        const { id, ai_category, is_anomalous, anomaly_reason, rule_violations, proposed_rules } = res;
        
        await pool.query(
          "UPDATE transactions SET metadata = metadata || $2::jsonb, ai_enriched = true WHERE id = $1",
          [id, JSON.stringify({ ai_category, is_anomalous, anomaly_reason, rule_violations })]
        );

        if (proposed_rules && proposed_rules.length > 0) {
          for (const ruleObj of proposed_rules) {
            // Distributed deduplication: check DB before adding
            const existingRes = await pool.query(
              "SELECT id FROM rules WHERE LOWER(name) = LOWER($1) OR LOWER(pattern) = LOWER($2)",
              [ruleObj.name, ruleObj.description]
            );

            if (existingRes.rows.length === 0) {
              await addRule(ruleObj.name, ruleObj.description, true, ruleObj.expected_amount, ruleObj.amount_margin, ruleObj.type || 'validation', ruleObj.category);
            }
          }
        }
      }
      console.log(`[Worker] Chunk ${chunkNum} fully processed.`);
      return { chunkNum, count: transactions.length };
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
