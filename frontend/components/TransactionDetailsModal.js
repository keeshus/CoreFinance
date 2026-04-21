import React, { useState } from 'react';
import { X, Info, FileText, Globe, AlertCircle, ShieldCheck } from 'lucide-react';
import CategoryBadge, { CATEGORY_MAP } from './CategoryBadge';
import { api } from '../services/api';

export default function TransactionDetailsModal({ transaction, onClose, onUpdate, formatCurrency, formatDate }) {
  const [editingCategory, setEditingCategory] = useState(false);
  const [newCategoryValue, setNewCategoryValue] = useState('');
  const [editingAnomaly, setEditingAnomaly] = useState(false);
  const [newAnomalyReason, setNewAnomalyReason] = useState('');
  const [editingRuleViolations, setEditingRuleViolations] = useState(false);
  const [newRuleViolations, setNewRuleViolations] = useState('');

  if (!transaction) return null;

  const handleClose = () => {
    setEditingCategory(false);
    setEditingAnomaly(false);
    setEditingRuleViolations(false);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
      backdropFilter: 'blur(4px)'
    }} onClick={handleClose}>
      <div style={{
        background: '#fff', padding: '30px', borderRadius: '24px', maxWidth: '500px', width: '90%',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        display: 'flex', flexDirection: 'column', gap: '20px'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25em', fontWeight: 'bold' }}>Transaction Details</h2>
            <div style={{ fontSize: '0.85em', color: '#64748b', marginTop: '4px' }}>{formatDate(transaction.date, transaction.time)}</div>
          </div>
          <button onClick={handleClose} style={{ background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '12px', cursor: 'pointer' }}>
            <X size={20} color="#64748b" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>Description</div>
            <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#1e293b', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{transaction.name_description}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>Amount</div>
              <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: parseFloat(transaction.amount) < 0 ? '#ef4444' : '#22c55e' }}>
                {formatCurrency(transaction.amount)}
              </div>
            </div>
            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>Account</div>
              <div style={{ fontSize: '0.9em', fontWeight: 'bold', color: '#1e293b' }}>{transaction.account_display_name}</div>
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>Import Method</div>
            <div style={{ fontSize: '0.9em', fontWeight: 'bold', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {transaction.import_method === 'csv' && <><FileText size={16} color="#64748b" /> CSV Upload</>}
              {transaction.import_method === 'ponto' && <><Globe size={16} color="#3b82f6" /> Ponto Synchronization</>}
              {transaction.import_method === 'system' && <><Info size={16} color="#94a3b8" /> System Generated</>}
              {!transaction.import_method && <><Info size={16} color="#94a3b8" /> Unknown</>}
            </div>
          </div>

          {transaction.counterparty && (
            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>Counterparty</div>
              <div style={{ fontSize: '0.9em', color: '#1e293b', wordBreak: 'break-word' }}>{transaction.counterparty}</div>
            </div>
          )}

          {transaction.metadata?.is_anomalous ? (
            <div style={{ background: '#fff1f2', padding: '15px', borderRadius: '16px', border: '1px solid #fecaca' }}>
              <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#e11d48', fontWeight: 'bold', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <AlertCircle size={14} /> Anomaly Detected
                </div>
                {!editingAnomaly && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => { setEditingAnomaly(true); setNewAnomalyReason(transaction.metadata.anomaly_reason || ''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e11d48', fontSize: '1em', fontWeight: 'bold', padding: 0 }}>Edit</button>
                    <button onClick={async () => {
                      try {
                        const updatedTx = await api.patch(`/transactions/${transaction.id}/anomaly`, { is_anomalous: false, anomaly_reason: '' });
                        onUpdate(updatedTx);
                      } catch (err) {
                        alert('Failed to remove anomaly status');
                      }
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1em', fontWeight: 'bold', padding: 0 }}>Remove</button>
                  </div>
                )}
              </div>
              {editingAnomaly ? (
                <div style={{ marginTop: '10px' }}>
                  <input type="text" value={newAnomalyReason} onChange={e => setNewAnomalyReason(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #fecaca', marginBottom: '10px', boxSizing: 'border-box' }} placeholder="Reason for deviation" />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={async () => {
                      try {
                        const updatedTx = await api.patch(`/transactions/${transaction.id}/anomaly`, { is_anomalous: true, anomaly_reason: newAnomalyReason });
                        setEditingAnomaly(false);
                        onUpdate(updatedTx);
                      } catch (err) {
                        alert('Failed to update anomaly reason');
                      }
                    }} style={{ background: '#e11d48', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8em' }}>Save</button>
                    <button onClick={() => setEditingAnomaly(false)} style={{ background: '#fecaca', color: '#9f1239', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8em' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '0.9em', color: '#9f1239', fontWeight: '500', marginBottom: '10px' }}>{transaction.metadata.anomaly_reason}</div>
              )}
            </div>
          ) : (
            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85em', color: '#64748b', fontWeight: 'bold' }}>Is this transaction anomalous?</div>
              <button onClick={() => {
                setEditingAnomaly(true);
                setNewAnomalyReason('');
                onUpdate({
                  ...transaction,
                  metadata: {
                    ...transaction.metadata,
                    is_anomalous: true
                  }
                }, true); // The second param could indicate optimistic update without refetch
              }} style={{ background: '#e11d48', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <AlertCircle size={14} /> Mark as Anomaly
              </button>
            </div>
          )}

          {transaction.metadata?.rule_violations?.filter(v => v && v !== 'none' && v !== 'None').length > 0 ? (
            <div style={{ background: '#fffbeb', padding: '15px', borderRadius: '16px', border: '1px solid #fef3c7' }}>
              <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#d97706', fontWeight: 'bold', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <ShieldCheck size={14} /> Rule Violations
                </div>
                {!editingRuleViolations && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => {
                      setEditingRuleViolations(true);
                      setNewRuleViolations(transaction.metadata.rule_violations.filter(v => v && v !== 'none' && v !== 'None').map(v => typeof v === 'object' ? v.reason : v).join(', '));
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d97706', fontSize: '1em', fontWeight: 'bold', padding: 0 }}>Edit</button>
                    <button onClick={async () => {
                      try {
                        const updatedTx = await api.patch(`/transactions/${transaction.id}/rule-violations`, { violations: ['none'] });
                        onUpdate(updatedTx);
                      } catch (err) {
                        alert('Failed to remove rule violations');
                      }
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1em', fontWeight: 'bold', padding: 0 }}>Remove</button>
                  </div>
                )}
              </div>
              {editingRuleViolations ? (
                <div style={{ marginTop: '10px' }}>
                  <input type="text" value={newRuleViolations} onChange={e => setNewRuleViolations(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #fcd34d', marginBottom: '10px', boxSizing: 'border-box' }} placeholder="Rule violation reasons" />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={async () => {
                      try {
                        const updatedTx = await api.patch(`/transactions/${transaction.id}/rule-violations`, { violations: [newRuleViolations] });
                        setEditingRuleViolations(false);
                        onUpdate(updatedTx);
                      } catch (err) {
                        alert('Failed to update rule violations');
                      }
                    }} style={{ background: '#d97706', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8em' }}>Save</button>
                    <button onClick={() => setEditingRuleViolations(false)} style={{ background: '#fef3c7', color: '#b45309', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8em' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <ul style={{ margin: '5px 0 10px', paddingLeft: '20px', fontSize: '0.9em', color: '#92400e' }}>
                  {transaction.metadata.rule_violations
                    .filter(v => v && v !== 'none' && v !== 'None')
                    .map((v, i) => (
                    <li key={i}>
                      {typeof v === 'object' ? (
                        <span><strong>Rule {v.rule_id}:</strong> {v.reason}</span>
                      ) : v}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85em', color: '#64748b', fontWeight: 'bold' }}>Any rule violations?</div>
              <button onClick={() => {
                setEditingRuleViolations(true);
                setNewRuleViolations('');
                onUpdate({
                  ...transaction,
                  metadata: {
                    ...transaction.metadata,
                    rule_violations: ['New violation']
                  }
                }, true);
              }} style={{ background: '#d97706', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <ShieldCheck size={14} /> Mark as Violation
              </button>
            </div>
          )}

          <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold' }}>Category</div>
              {!editingCategory && (
                <button onClick={() => { setEditingCategory(true); setNewCategoryValue(transaction.metadata?.ai_category || 'Uncategorized'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: '0.85em', fontWeight: 'bold' }}>Edit</button>
              )}
            </div>
            {editingCategory ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <select
                  value={newCategoryValue}
                  onChange={(e) => setNewCategoryValue(e.target.value)}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff' }}
                >
                  <option value="Uncategorized">Uncategorized</option>
                  {Object.keys(CATEGORY_MAP).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <button onClick={async () => {
                  try {
                    const updatedTx = await api.patch(`/transactions/${transaction.id}/category`, { category: newCategoryValue });
                    setEditingCategory(false);
                    onUpdate(updatedTx);
                  } catch (err) {
                    alert('Failed to update category');
                  }
                }} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                <button onClick={() => setEditingCategory(false)} style={{ background: '#e2e8f0', color: '#64748b', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <CategoryBadge category={transaction.metadata?.ai_category || 'Uncategorized'} />
              </div>
            )}
          </div>

          {transaction.metadata && Object.keys(transaction.metadata).length > 0 && (
            <div style={{ marginTop: '5px' }}>
              <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Info size={14} /> Additional Information
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(transaction.metadata).map(([key, value]) => {
                  if (!value || value === '' || key === 'rule_violations' || key === 'anomaly_reason' || key === 'is_anomalous' || key === 'id' || key === 'ai_category' || key === 'proposed_rules') return null;
                  return (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px', gap: '10px' }}>
                      <span style={{ color: '#64748b', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{key.replace(/_/g, ' ')}</span>
                      <span style={{ color: '#1e293b', fontWeight: '500', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {((transaction.metadata?.is_anomalous) || (transaction.metadata?.rule_violations?.filter(v => v && v !== 'none' && v !== 'None').length > 0)) && !editingAnomaly && !editingRuleViolations && (
          <div style={{ background: '#f1f5f9', padding: '15px', borderRadius: '16px', border: '1px solid #cbd5e1', marginTop: '10px' }}>
            <div style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#334155', marginBottom: '10px' }}>
              {transaction.metadata?.review_status ? `Deviation Resolved (${transaction.metadata.review_status}) - Update Status` : 'Resolve Deviation'}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={async () => {
                try {
                  const updatedTx = await api.patch(`/transactions/${transaction.id}/resolve`, { status: 'accepted' });
                  onClose();
                  onUpdate(updatedTx);
                } catch (err) {
                  alert('Failed to resolve deviation');
                }
              }} style={{ flex: 1, background: '#22c55e', color: '#fff', border: 'none', padding: '10px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Accept (Normal)</button>
              <button onClick={async () => {
                try {
                  const updatedTx = await api.patch(`/transactions/${transaction.id}/resolve`, { status: 'negated' });
                  onClose();
                  onUpdate(updatedTx);
                } catch (err) {
                  alert('Failed to resolve deviation');
                }
              }} style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', padding: '10px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Negate (Ignore)</button>
            </div>
            <div style={{ fontSize: '0.7em', color: '#64748b', marginTop: '8px', textAlign: 'center' }}>
              This will mark the deviation as resolved.
            </div>
          </div>
        )}
        
        <button
          onClick={handleClose}
          style={{
            background: '#3b82f6', color: '#fff', border: 'none', padding: '12px', borderRadius: '16px', 
            fontWeight: 'bold', cursor: 'pointer', marginTop: '10px', boxShadow: '0 4px 6px -1px rgba(59,130,246,0.3)'
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}