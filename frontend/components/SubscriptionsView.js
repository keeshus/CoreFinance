import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Calendar, Trash2, Edit2, Check, X, CreditCard, Clock, ChevronRight } from 'lucide-react';

export default function SubscriptionsView() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const data = await api.get('/subscriptions');
      setSubscriptions(data);
    } catch (err) {
      console.error('Failed to fetch subscriptions', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to remove this subscription?')) return;
    const previous = [...subscriptions];
    setSubscriptions(prev => prev.filter(s => String(s.id) !== String(id)));
    try {
      await api.delete(`/subscriptions/${id}`);
    } catch (err) {
      setSubscriptions(previous);
      console.error('Failed to delete subscription', err);
    }
  };

  const startEditing = (sub) => {
    setEditingId(sub.id);
    setEditForm({ ...sub });
  };

  const handleUpdate = async () => {
    try {
      await api.put(`/subscriptions/${editingId}`, editForm);
      setEditingId(null);
      fetchSubscriptions(); // Re-fetch to ensure sync
    } catch (err) {
      console.error('Failed to update subscription', err);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount || 0);
  };

  const calculateMonthlyCost = (amount, frequency) => {
    const amt = parseFloat(amount || 0);
    switch (frequency?.toLowerCase()) {
      case 'weekly': return amt * 4.33;
      case 'monthly': return amt;
      case 'quarterly': return amt / 3;
      case 'yearly': return amt / 12;
      default: return amt;
    }
  };

  const totalMonthly = subscriptions.reduce((acc, sub) => acc + calculateMonthlyCost(sub.amount, sub.frequency), 0);
  const totalYearly = totalMonthly * 12;

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading subscriptions...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '0.9em', marginBottom: '10px' }}>
            <Clock size={16} /> Total Monthly Run-rate
          </div>
          <div style={{ fontSize: '1.8em', fontWeight: '800', color: '#1e293b' }}>{formatCurrency(totalMonthly)}</div>
        </div>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '0.9em', marginBottom: '10px' }}>
            <Calendar size={16} /> Total Yearly Run-rate
          </div>
          <div style={{ fontSize: '1.8em', fontWeight: '800', color: '#1e293b' }}>{formatCurrency(totalYearly)}</div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
          <span>Active Subscriptions ({subscriptions.length})</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '350px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', fontSize: '0.75em', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>
                <th style={{ padding: '15px 20px' }}>Subscription</th>
                <th className="hide-mobile" style={{ padding: '15px 20px' }}>Category</th>
                <th style={{ padding: '15px 20px' }}>Amount</th>
                <th className="hide-mobile" style={{ padding: '15px 20px' }}>Frequency</th>
                <th className="hide-mobile" style={{ padding: '15px 20px' }}>Monthly Cost</th>
                <th style={{ padding: '15px 20px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map(sub => (
                <tr
                  key={sub.id}
                  style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 20px' }}>
                    {editingId === sub.id ? (
                      <input 
                        value={editForm.name} 
                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%' }}
                      />
                    ) : (
                      <div style={{ fontWeight: '600' }}>{sub.name}</div>
                    )}
                  </td>
                  <td className="hide-mobile" style={{ padding: '12px 20px' }}>
                    {editingId === sub.id ? (
                      <input
                        value={editForm.category}
                        onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%' }}
                      />
                    ) : (
                      <span style={{ fontSize: '0.85em', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', color: '#475569' }}>
                        {sub.category}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 20px', fontWeight: 'bold', fontSize: '0.85em' }}>
                    {editingId === sub.id ? (
                      <input 
                        type="number"
                        value={editForm.amount} 
                        onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '80px' }}
                      />
                    ) : (
                      formatCurrency(sub.amount)
                    )}
                  </td>
                  <td className="hide-mobile" style={{ padding: '12px 20px', fontSize: '0.8em', color: '#64748b' }}>
                    {editingId === sub.id ? (
                      <select
                        value={editForm.frequency}
                        onChange={e => setEditForm({ ...editForm, frequency: e.target.value })}
                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    ) : (
                      <span style={{ textTransform: 'capitalize' }}>{sub.frequency}</span>
                    )}
                  </td>
                  <td className="hide-mobile" style={{ padding: '12px 20px', color: '#64748b', fontSize: '0.85em' }}>
                    {formatCurrency(calculateMonthlyCost(sub.amount, sub.frequency))}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {editingId === sub.id ? (
                        <>
                          <button onClick={handleUpdate} style={{ color: '#16a34a', border: 'none', background: 'none', cursor: 'pointer' }}><Check size={18} /></button>
                          <button onClick={() => setEditingId(null)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}><X size={18} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEditing(sub)} style={{ color: '#64748b', border: 'none', background: 'none', cursor: 'pointer' }}><Edit2 size={18} /></button>
                          <button onClick={() => handleDelete(sub.id)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}><Trash2 size={18} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

      <style jsx>{`
        @media (max-width: 640px) {
          .hide-mobile {
            display: none !important;
          }
          .show-mobile-only {
            display: block !important;
          }
        }
        @media (min-width: 641px) {
          .show-mobile-only {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}