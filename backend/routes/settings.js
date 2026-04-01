import express from 'express';
import { getAccountNames, setAccountName, getSettings, updateSettings, deleteAccount } from '../db.js';

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

router.get('/vertex_ai_config', async (req, res) => {
  try {
    const config = await getSettings('vertex_ai_config');
    res.json(config || { enabled: false, projectId: '', location: 'us-central1', model: 'gemini-3.0-flash' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch AI config' });
  }
});

router.post('/vertex_ai_config', async (req, res) => {
  try {
    await updateSettings('vertex_ai_config', req.body);
    res.json({ message: 'AI configuration updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update AI config' });
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

export default router;
