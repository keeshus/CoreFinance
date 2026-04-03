import express from 'express';
import { getAccountNames, setAccountName, getSettings, updateSettings, deleteAccount, upsertAIModel, getAIModels, getUnenrichedTransactions, createJob } from '../db.js';
import { AIService } from '../../shared/services/ai.js';
import { aiQueue } from '../queue.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const accountNames = await getAccountNames();
    res.json({ account_names: accountNames });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.get('/ai_config', async (req, res) => {
  try {
    const config = await getSettings('ai_config');
    const models = await getAIModels();
    res.json({
      ...(config || { enabled: false, apiKey: '', model: 'gemini-2.0-flash' }),
      availableModels: models
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch AI config' });
  }
});

router.post('/ai_config', async (req, res) => {
  try {
    await updateSettings('ai_config', req.body);
    res.json({ message: 'AI configuration updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update AI config' });
  }
});

router.post('/ai_models', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ error: 'API Key is required to fetch models' });
    }
    const models = await AIService.listModels(apiKey);
    
    // Cache models in database
    for (const model of models) {
      await upsertAIModel(model.name, model.displayName, model.description);
    }
    
    res.json(models);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch AI models' });
  }
});

router.post('/account-name', async (req, res) => {
  const { account, display_name, ai_enabled } = req.body;
  if (!account || !display_name) {
    return res.status(400).json({ error: 'Account and display_name are required' });
  }
  try {
    await setAccountName(account, display_name, ai_enabled);
    res.json({ message: 'Account updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

router.delete('/account/:id', async (req, res) => {
  try {
    await deleteAccount(req.params.id);
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

router.post('/trigger-ai-enrichment', async (req, res) => {
  try {
    const transactions = await getUnenrichedTransactions();
    if (transactions.length === 0) {
      return res.json({ message: 'No transactions to enrich' });
    }

    const jobId = await createJob('ai-processing', { 
      transactions: transactions.map(t => ({ id: t.id, account: t.account, name_description: t.name_description, counterparty: t.counterparty, amount: t.amount, currency: t.currency, date: t.date })),
      count: transactions.length 
    });

    await aiQueue.add('ai-processing', { 
      transactions: transactions.map(t => ({ id: t.id, account: t.account, name_description: t.name_description, counterparty: t.counterparty, amount: t.amount, currency: t.currency, date: t.date })),
      jobId 
    });

    res.json({ message: 'AI enrichment job started', jobId, count: transactions.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to trigger AI enrichment' });
  }
});

export default router;
