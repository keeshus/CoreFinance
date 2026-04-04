import express from 'express';
import { getRules, addRule, updateRuleStatus, deleteRule } from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const rules = await getRules();
    res.json(rules);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

router.post('/', async (req, res) => {
  const { name, pattern } = req.body;
  try {
    await addRule(name, pattern, false);
    res.json({ message: 'Rule added successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add rule' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { is_active, is_proposed } = req.body;
  try {
    await updateRuleStatus(id, is_active, is_proposed);
    res.json({ message: 'Rule updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await deleteRule(id);
    res.json({ message: 'Rule deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

export default router;
