import express from 'express';
import { saveWebPushSubscription } from '../../shared/db.js';

const router = express.Router();

router.get('/vapid-public-key', async (req, res) => {
  // Ideally, this should come from process.env or settings. 
  // We'll return the hardcoded key or one from env.
  const publicKey = process.env.VAPID_PUBLIC_KEY || 'BC9RxrtPWpNK45tEzgTPYNCuFognpnFTpk9u1Oy9a4AeRbzA5P0yTVq35eBRETzV_VW0ZCT8llJg_gyexpyrhxc';
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
