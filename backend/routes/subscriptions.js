import express from 'express';
import { getSubscriptions, addSubscription, updateSubscription, deleteSubscription } from '../../shared/db.js';

const router = express.Router();

// GET all subscriptions
router.get('/', async (req, res) => {
  try {
    const subscriptions = await getSubscriptions();
    res.json(subscriptions);
  } catch (err) {
    console.error('Failed to fetch subscriptions:', err);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// POST a new subscription (manual tagging)
router.post('/', async (req, res) => {
  try {
    const { match_key, name, category, amount, frequency, next_billing_date } = req.body;
    if (!match_key || !name) {
      return res.status(400).json({ error: 'match_key and name are required' });
    }
    const newSub = await addSubscription(match_key, name, category, amount, frequency, next_billing_date);
    res.status(201).json(newSub);
  } catch (err) {
    console.error('Failed to create subscription:', err);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// PUT update an existing subscription
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updatedSub = await updateSubscription(id, updates);
    if (!updatedSub) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    res.json(updatedSub);
  } catch (err) {
    console.error('Failed to update subscription:', err);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// DELETE a subscription
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await deleteSubscription(id);
    if (!success) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('Failed to delete subscription:', err);
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

export default router;