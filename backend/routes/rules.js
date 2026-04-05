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
  const { name, pattern, is_active, is_proposed } = req.body;
  try {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (pattern !== undefined) updates.pattern = pattern;
    if (is_active !== undefined) updates.is_active = is_active;
    if (is_proposed !== undefined) updates.is_proposed = is_proposed;
    
    await updateRuleStatus(id, updates.is_active, updates.is_proposed, updates.name, updates.pattern);
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
