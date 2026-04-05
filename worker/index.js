import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pool, getSettings, getRules, addRule, getAccountNames, updateJob } from '../shared/db.js';

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
  const { transactions, jobId, disableAnomalyDetection } = job.data;
  
  try {
    const config = await getSettings('ai_config');
    console.log(`[Worker] Job ${jobId} started. AI config enabled: ${config?.enabled}`);
    
    if (!config || !config.enabled) {
      await updateJob(jobId, { status: 'completed', progress: 100, log: 'AI processing is disabled.' });
      return;
    }

    await updateJob(jobId, { status: 'processing', progress: 10, log: 'Initializing AI Service in Worker...', workerId });

    const accountInfo = await getAccountNames();
    const enabledAccounts = accountInfo.filter(a => a.ai_enabled).map(a => a.account);
    console.log(`[Worker] Enabled accounts: ${enabledAccounts.join(', ')}`);
    
    const filteredTransactions = transactions.filter(t => enabledAccounts.includes(t.account));
    console.log(`[Worker] Transactions to process: ${filteredTransactions.length} (total received: ${transactions.length})`);
    
    if (filteredTransactions.length === 0) {
      await updateJob(jobId, { status: 'completed', progress: 100, log: 'No transactions found for AI-enabled accounts.' });
      return;
    }

    await updateJob(jobId, { progress: 20, log: `Processing ${filteredTransactions.length} transactions...` });

    const rules = await getRules();
    const activeRules = rules.filter(r => r.is_active && !r.is_proposed);
    console.log(`[Worker] Loaded ${activeRules.length} active rules`);
    const aiService = new AIService(config);
    
    const chunkSize = 10;
    const totalChunks = Math.ceil(filteredTransactions.length / chunkSize);

    for (let i = 0; i < filteredTransactions.length; i += chunkSize) {
      const chunk = filteredTransactions.slice(i, i + chunkSize);
      const chunkNum = Math.floor(i / chunkSize) + 1;
      
      const startTime = Date.now();
      console.log(`[Worker] Starting chunk ${chunkNum}/${totalChunks} (${chunk.length} transactions)`);

      await updateJob(jobId, { 
        progress: 20 + Math.floor((chunkNum / totalChunks) * 70), 
        log: `Analyzing chunk ${chunkNum} of ${totalChunks}...` 
      });

      // Update BullMQ job progress as a heartbeat
      await job.updateProgress(Math.floor((chunkNum / totalChunks) * 100));

      const results = await aiService.processBatch(chunk, activeRules, { disableAnomalyDetection });
      const duration = (Date.now() - startTime) / 1000;
      console.log(`[Worker] Chunk ${chunkNum} finished in ${duration.toFixed(2)}s`);

      for (const res of results) {
        const { id, ai_categories, is_anomalous, anomaly_reason, rule_violations, proposed_rules } = res;
        
        await pool.query(
          "UPDATE transactions SET metadata = metadata || $2::jsonb, ai_enriched = true WHERE id = $1",
          [id, JSON.stringify({ ai_categories, is_anomalous, anomaly_reason, rule_violations })]
        );

        if (proposed_rules && proposed_rules.length > 0) {
          for (const ruleObj of proposed_rules) {
            const isDuplicate = rules.some(r => 
              r.name.toLowerCase() === ruleObj.name.toLowerCase() || 
              r.pattern.toLowerCase() === ruleObj.description.toLowerCase()
            );

            if (!isDuplicate) {
              await addRule(ruleObj.name, ruleObj.description, true, ruleObj.expected_amount, ruleObj.amount_margin);
              rules.push({ 
                name: ruleObj.name, 
                pattern: ruleObj.description, 
                is_proposed: true,
                expected_amount: ruleObj.expected_amount,
                amount_margin: ruleObj.amount_margin
              });
            }
          }
        }
      }
    }

    await updateJob(jobId, { status: 'completed', progress: 100, log: 'AI categorization completed successfully by worker.' });
  } catch (err) {
    console.error(`[Worker] Job ${jobId} failed:`, err);
    await updateJob(jobId, { status: 'failed', error: err.message, log: `Error: ${err.message}` });
    throw err;
  }
}, { connection, lockDuration: 120000 });

console.log(`Worker starting (ID: ${workerId})...`);
console.log(`BullMQ Worker configuration: lockDuration=${worker.opts.lockDuration}ms`);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with ${err.message}`);
});
