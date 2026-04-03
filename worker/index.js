import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { pool, getSettings, getRules, addRule, getAccountNames, updateJob } from '../shared/db.js';
import { AIService } from '../shared/services/ai.js';

const connection = new IORedis(process.env.VALKEY_URL || 'valkey://localhost:6379', {
  maxRetriesPerRequest: null,
});

console.log('Worker starting...');

const worker = new Worker('ai-processing', async (job) => {
  const { transactions, jobId } = job.data;
  
  try {
    const config = await getSettings('vertex_ai_config');
    if (!config || !config.enabled) {
      await updateJob(jobId, { status: 'completed', progress: 100, log: 'AI processing is disabled.' });
      return;
    }

    await updateJob(jobId, { status: 'processing', progress: 10, log: 'Initializing AI Service in Worker...' });

    const accountInfo = await getAccountNames();
    const enabledAccounts = accountInfo.filter(a => a.ai_enabled).map(a => a.account);
    
    const filteredTransactions = transactions.filter(t => enabledAccounts.includes(t.account));
    
    if (filteredTransactions.length === 0) {
      await updateJob(jobId, { status: 'completed', progress: 100, log: 'No transactions found for AI-enabled accounts.' });
      return;
    }

    await updateJob(jobId, { progress: 20, log: `Processing ${filteredTransactions.length} transactions...` });

    const rules = await getRules();
    const activeRules = rules.filter(r => r.is_active && !r.is_proposed);

    const aiService = new AIService(config);
    
    const chunkSize = 10;
    const totalChunks = Math.ceil(filteredTransactions.length / chunkSize);

    for (let i = 0; i < filteredTransactions.length; i += chunkSize) {
      const chunk = filteredTransactions.slice(i, i + chunkSize);
      const chunkNum = Math.floor(i / chunkSize) + 1;
      
      await updateJob(jobId, { 
        progress: 20 + Math.floor((chunkNum / totalChunks) * 70), 
        log: `Analyzing chunk ${chunkNum} of ${totalChunks}...` 
      });

      const results = await aiService.processBatch(chunk, activeRules);

      for (const res of results) {
        const { id, ai_categories, is_anomalous, anomaly_reason, rule_violations, proposed_rules } = res;
        
        await pool.query(
          "UPDATE transactions SET metadata = metadata || $2::jsonb WHERE id = $1",
          [id, JSON.stringify({ ai_categories, is_anomalous, anomaly_reason, rule_violations })]
        );

        if (proposed_rules && proposed_rules.length > 0) {
          for (const ruleText of proposed_rules) {
            await addRule('Proposed Rule', ruleText, true);
          }
        }
      }
    }

    await updateJob(jobId, { status: 'completed', progress: 100, log: 'AI categorization completed successfully by worker.' });
  } catch (err) {
    console.error('Worker job processing error:', err);
    await updateJob(jobId, { status: 'failed', error: err.message, log: `Error: ${err.message}` });
    throw err; // Allow BullMQ to handle retry if configured
  }
}, { connection });

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with ${err.message}`);
});
