import express from 'express';
import { getRules, addRule, updateRule, deleteRule } from '../../shared/db.js';

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
  const { name, pattern, expected_amount, amount_margin, type, category } = req.body;
  try {
    await addRule(name, pattern, false, expected_amount, amount_margin, type, category);
    res.json({ message: 'Rule added successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add rule' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, pattern, is_active, is_proposed, expected_amount, amount_margin, type, category } = req.body;
  try {
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (pattern !== undefined) updates.pattern = pattern;
    if (is_active !== undefined) updates.is_active = is_active;
    if (is_proposed !== undefined) updates.is_proposed = is_proposed;
    if (expected_amount !== undefined) updates.expected_amount = expected_amount;
    if (amount_margin !== undefined) updates.amount_margin = amount_margin;
    if (type !== undefined) updates.type = type;
    if (category !== undefined) updates.category = category;
    
    await updateRule(id, updates);
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

router.get('/export', async (req, res) => {
  try {
    const rules = await getRules();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=smart_rules.json');
    res.json(rules);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export rules' });
  }
});

router.post('/import', async (req, res) => {
  const rules = req.body;
  if (!Array.isArray(rules)) {
    return res.status(400).json({ error: 'Invalid format, expected an array of rules' });
  }

  try {
    let importedCount = 0;
    for (const rule of rules) {
      const { name, pattern, is_proposed, expected_amount, amount_margin, type, category } = rule;
      if (name && pattern) {
        await addRule(
          name,
          pattern,
          is_proposed || false,
          expected_amount,
          amount_margin,
          type || 'validation',
          category
        );
        importedCount++;
      }
    }
    res.json({ message: `Successfully imported ${importedCount} rules` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to import rules' });
  }
});

export default router;
