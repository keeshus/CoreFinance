import express from 'express';
import { getTransactions, getSummary, getTrend } from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { page, pageSize, account, search, startDate, endDate, sortField, sortOrder, deviationsOnly, category } = req.query;
    const transactions = await getTransactions({
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 50,
      account: account || 'all',
      category: category || 'all',
      search: search || '',
      startDate: startDate || '',
      endDate: endDate || '',
      sortField: sortField || 'date',
      sortOrder: sortOrder || 'desc',
      deviationsOnly: deviationsOnly === 'true'
    });
    res.json(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const summary = await getSummary();
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

router.get('/trend', async (req, res) => {
  try {
    const trend = await getTrend();
    res.json(trend);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trend' });
  }
});

export default router;
