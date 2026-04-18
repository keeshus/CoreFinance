import React from 'react';
import { ArrowUpDown, FileText, Globe, ArrowDownCircle, ArrowUpCircle, AlertCircle, ShieldCheck } from 'lucide-react';
import CategoryBadge from './CategoryBadge';

export default function TransactionTable({ 
  transactions, 
  loading, 
  sortField, 
  sortOrder, 
  toggleSort, 
  setSelectedTransaction, 
  formatDate, 
  formatCurrency 
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '500px' }}>
        <thead>
          <tr style={{ background: '#f8fafc', fontSize: '0.75em', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>
            <th 
              onClick={() => toggleSort('date')}
              style={{ padding: '15px 20px', cursor: 'pointer', userSelect: 'none', width: '150px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                Date <ArrowUpDown size={12} opacity={sortField === 'date' ? 1 : 0.3} />
              </div>
            </th>
            <th className="hide-mobile" style={{ padding: '15px 20px', width: '140px' }}>
              Method
            </th>
            <th 
              onClick={() => toggleSort('name_description')}
              style={{ padding: '15px 20px', cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                Description <ArrowUpDown size={12} opacity={sortField === 'name_description' ? 1 : 0.3} />
              </div>
            </th>
            <th className="hide-mobile" style={{ padding: '15px 20px' }}>
              Counterparty
            </th>
            <th 
              onClick={() => toggleSort('amount')}
              style={{ padding: '15px 20px', textAlign: 'right', cursor: 'pointer', userSelect: 'none', width: '120px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end' }}>
                Amount <ArrowUpDown size={12} opacity={sortField === 'amount' ? 1 : 0.3} />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions && transactions.map((t, idx) => (
            <tr 
              key={idx} 
              onClick={() => setSelectedTransaction(t)}
              style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <td style={{ padding: '12px 20px', fontSize: '0.8em', color: '#64748b' }}>
                <div className="show-mobile-only">
                  {new Date(t.date).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' })}
                </div>
                <div className="hide-mobile">
                  {formatDate(t.date, t.time)}
                </div>
              </td>
              <td className="hide-mobile" style={{ padding: '12px 20px', fontSize: '0.75em', color: '#94a3b8' }}>
                {t.import_method === 'csv' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                    <FileText size={10} /> CSV
                  </span>
                )}
                {t.import_method === 'ponto' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#eff6ff', color: '#3b82f6', padding: '2px 6px', borderRadius: '4px' }}>
                    <Globe size={10} /> Ponto
                  </span>
                )}
              </td>
              <td style={{ padding: '12px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ 
                    padding: '6px', borderRadius: '8px', background: parseFloat(t.amount) < 0 ? '#fef2f2' : '#f0fdf4',
                    color: parseFloat(t.amount) < 0 ? '#ef4444' : '#22c55e',
                    flexShrink: 0
                  }}>
                    {parseFloat(t.amount) < 0 ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.85em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.name_description}
                      {t.metadata?.is_anomalous && <AlertCircle size={12} color="#ef4444" />}
                      {t.metadata?.rule_violations?.filter(v => v && v !== 'none' && v !== 'None').length > 0 && <ShieldCheck size={12} color="#f59e0b" />}
                    </div>
                    <div style={{ fontSize: '0.7em', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {t.account_display_name}
                      {t.metadata?.ai_category && (
                        <CategoryBadge category={t.metadata.ai_category} />
                      )}
                    </div>
                  </div>
                </div>
              </td>
              <td className="hide-mobile" style={{ padding: '12px 20px', fontSize: '0.8em', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.counterparty || '-'}
              </td>
              <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 'bold', fontSize: '0.85em', color: parseFloat(t.amount) < 0 ? '#ef4444' : '#22c55e' }}>
                {formatCurrency(t.amount)}
              </td>
            </tr>
          ))}
          {(!transactions || transactions.length === 0) && (
            <tr>
              <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9em' }}>
                {loading ? 'Loading...' : 'No transactions found.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}