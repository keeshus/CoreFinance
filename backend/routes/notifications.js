import express from 'express';
import { saveWebPushSubscription } from '../../shared/db.js';

const router = express.Router();

router.get('/vapid-public-key', async (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(500).json({ error: 'VAPID_PUBLIC_KEY environment variable is not configured.' });
  }
  res.json({ publicKey });
});

router.post('/subscribe', async (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  try {
    await saveWebPushSubscription(subscription);
    res.status(201).json({ message: 'Subscription saved successfully.' });
  } catch (error) {
    console.error('Error saving subscription:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

export default router;
