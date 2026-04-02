import { pool, getSettings, getRules, addRule, getAccountNames, updateJob } from '../db.js';
import { AIService } from './ai.js';

export async function processAIAsync(transactions, jobId) {
  try {
    const config = await getSettings('vertex_ai_config');
    if (!config || !config.enabled) {
      await updateJob(jobId, { status: 'completed', progress: 100, log: 'AI processing is disabled.' });
      return;
    }

    await updateJob(jobId, { status: 'processing', progress: 10, log: 'Initializing AI Service...' });

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
    
    // Chunking processing to 10 transactions at a time
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
        
        // Update transaction metadata
        await pool.query(
          "UPDATE transactions SET metadata = metadata || $2::jsonb WHERE id = $1",
          [id, JSON.stringify({ ai_categories, is_anomalous, anomaly_reason, rule_violations })]
        );

        // Insert proposed rules
        if (proposed_rules && proposed_rules.length > 0) {
          for (const ruleText of proposed_rules) {
            await addRule('Proposed Rule', ruleText, true);
          }
        }
      }
    }

    await updateJob(jobId, { status: 'completed', progress: 100, log: 'AI categorization completed successfully.' });
  } catch (err) {
    console.error('AI background processing error:', err);
    await updateJob(jobId, { status: 'failed', error: err.message, log: `Error: ${err.message}` });
  }
}
