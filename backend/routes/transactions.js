import express from 'express';
import { getTransactions, getSummary, getTrend, updateTransactionCategory } from '../../shared/db.js';

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

router.patch('/:id/category', async (req, res) => {
  try {
    const { id } = req.params;
    const { category } = req.body;
    
    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    const updatedTx = await updateTransactionCategory(id, category);
    
    if (!updatedTx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(updatedTx);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update transaction category' });
  }
});

export default router;
