import { useState, useCallback } from 'react';
import { api } from '../services/api';

export function useFinanceData() {
  const [summary, setSummary] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.get('/transactions/summary');
      setSummary(data);
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  }, []);

  const fetchTransactions = useCallback(async (filters = {}) => {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          if (Array.isArray(value)) {
            value.forEach(v => queryParams.append(key, v));
          } else {
            queryParams.append(key, value);
          }
        }
      });
      const data = await api.get(`/transactions?${queryParams.toString()}`);
      setTransactions(data);
    } catch (err) {
      console.error('Error fetching transactions:', err);
    }
  }, []);

  const fetchTrend = useCallback(async () => {
    try {
      const data = await api.get('/transactions/trend');
      setTrend(data.map(item => ({
        ...item,
        balance: parseFloat(item.balance)
      })));
    } catch (err) {
      console.error('Error fetching trend:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchSummary(), fetchTransactions(), fetchTrend()]);
    } finally {
      setLoading(false);
    }
  }, [fetchSummary, fetchTransactions, fetchTrend]);

  return {
    summary,
    transactions,
    trend,
    loading,
    fetchSummary,
    fetchTransactions,
    fetchTrend,
    refreshAll,
    totalAssets: summary.reduce((acc, curr) => acc + parseFloat(curr.balance), 0)
  };
}
