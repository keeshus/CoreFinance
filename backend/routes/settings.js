import express from 'express';
import {
  getAccountNames, setAccountName, getSettings, updateSettings, deleteAccount,
  upsertAIModel, getAIModels, getUnenrichedTransactions, createJob,
  getPontoAccounts, upsertPontoAccount, setPontoAccountStatus
} from '../db.js';
import { AIService } from '../../shared/services/ai.js';
import { PontoService } from '../ponto.js';
import { aiQueue } from '../queue.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const accountNames = await getAccountNames();
    const categories = await getSettings('categories');
    res.json({ account_names: accountNames, categories: categories || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    await updateSettings('categories', req.body);
    res.json({ message: 'Categories updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update categories' });
  }
});

router.get('/ai_config', async (req, res) => {
  try {
    const config = await getSettings('ai_config');
    const models = await getAIModels();
    const unenriched = await getUnenrichedTransactions();
    res.json({
      ...(config || { enabled: false, apiKey: '', model: 'gemini-2.0-flash' }),
      availableModels: models,
      unenrichedCount: unenriched.length
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

router.get('/ponto_config', async (req, res) => {
  try {
    const config = await getSettings('ponto_config');
    const accounts = await getPontoAccounts();
    const token = await PontoService.getValidToken().catch(() => null);
    
    res.json({
      ...(config || { clientId: '', clientSecret: '' }),
      accounts: accounts,
      isConnected: !!token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch Ponto config' });
  }
});

router.post('/ponto_config', async (req, res) => {
  try {
    await updateSettings('ponto_config', req.body);
    res.json({ message: 'Ponto configuration updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update Ponto config' });
  }
});

router.post('/ponto_sync_accounts', async (req, res) => {
  try {
    const pontoAccounts = await PontoService.fetchAccounts();
    const savedAccounts = [];
    
    for (const pa of pontoAccounts) {
      const account = {
        ponto_id: pa.id,
        account_id: pa.attributes.reference, // Usually IBAN
        name: pa.attributes.description,
        currency: pa.attributes.currency,
        institution_name: pa.relationships?.financialInstitution?.data?.id // Simplified
      };
      const saved = await upsertPontoAccount(account);
      savedAccounts.push(saved);
    }
    
    res.json(savedAccounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Failed to sync Ponto accounts: ${err.message}` });
  }
});

router.post('/ponto_account_status', async (req, res) => {
  try {
    const { pontoId, isActive } = req.body;
    const updated = await setPontoAccountStatus(pontoId, isActive);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update Ponto account status' });
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

    const categoryStats = transactions.reduce((acc, t) => {
      const cat = t.metadata?.ai_category || 'Uncategorized';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    await aiQueue.add('ai-processing', { 
      transactions: transactions.map(t => ({ id: t.id, account: t.account, name_description: t.name_description, counterparty: t.counterparty, amount: t.amount, currency: t.currency, date: t.date })),
      jobId 
    });

    res.json({ 
      message: 'AI enrichment job started', 
      jobId, 
      count: transactions.length,
      categories: categoryStats
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to trigger AI enrichment' });
  }
});

export default router;
