import React, { useState, useMemo, useEffect } from 'react';
import { CreditCard, TrendingUp, History, ArrowDownCircle, ArrowUpCircle, Calendar, Search, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X, Info, Sparkles, AlertCircle, ShieldCheck, FileText, Globe, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import { AreaChart, Area, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Cell, BarChart, Bar } from 'recharts';
import CategoryBadge, { CATEGORY_MAP } from './CategoryBadge';

export default function DashboardView({ summary, trend, transactions, fetchTransactions, loading }) {
  const [timespan, setTimespan] = useState('30d');
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [deviationsOnly, setDeviationsOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [deselectedCategories, setDeselectedCategories] = useState(['Uncategorized']);
  
  const TIMESPAN_OPTIONS = [
    { label: 'Last 7 Days', value: '7d' },
    { label: 'Last Month', value: '30d' },
    { label: 'Last 3 Months', value: '3m' },
    { label: 'Last Year', value: '1y' },
    { label: 'All Time', value: 'all' }
  ];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateStr, timeStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' });
    if (timeStr) {
      return `${date} ${timeStr.substring(0, 5)}`;
    }
    return date;
  };

  useEffect(() => {
    fetchTransactions({
      page: currentPage,
      pageSize,
      account: selectedAccount,
      category: categoryFilter.length > 0 ? categoryFilter : 'all',
      search: searchQuery,
      startDate: dateFilter.start,
      endDate: dateFilter.end,
      sortField,
      sortOrder,
      deviationsOnly
    });
  }, [currentPage, pageSize, selectedAccount, categoryFilter, searchQuery, dateFilter, sortField, sortOrder, deviationsOnly, fetchTransactions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedAccount, categoryFilter, searchQuery, dateFilter, sortField, sortOrder, pageSize, deviationsOnly]);

  const filteredTrend = useMemo(() => {
    if (!trend || !trend.length) return [];

    let activeTrend;
    if (selectedAccount !== 'all') {
      activeTrend = trend.filter(item => item.account === selectedAccount);
    } else {
      const lastBalances = {};
      const dailyTotals = {};
      
      trend.forEach(item => {
        const dateObj = new Date(item.date);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        lastBalances[item.account] = parseFloat(item.balance);
        dailyTotals[dateStr] = Object.values(lastBalances).reduce((sum, b) => sum + b, 0);
      });
      
      activeTrend = Object.entries(dailyTotals).map(([date, balance]) => ({ date, balance }));
    }

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    let cutoff = new Date(yesterday);

    if (timespan === 'all') {
      const sortedTrend = [...activeTrend].sort((a, b) => new Date(a.date) - new Date(b.date));
      cutoff = new Date(sortedTrend[0]?.date || yesterday);
    } else {
      switch (timespan) {
        case '7d': cutoff.setDate(yesterday.getDate() - 7); break;
        case '30d': cutoff.setDate(yesterday.getDate() - 30); break;
        case '3m': cutoff.setMonth(yesterday.getMonth() - 3); break;
        case '1y': cutoff.setFullYear(yesterday.getFullYear() - 1); break;
        default: cutoff.setDate(yesterday.getDate() - 30);
      }
    }

    const trendMap = activeTrend.reduce((acc, item) => {
      let d = item.date.substring(0, 10);
      acc[d] = parseFloat(item.balance);
      return acc;
    }, {});

    const result = [];
    let currentBalance = 0;

    const sortedBefore = [...activeTrend]
      .filter(item => new Date(item.date) < cutoff)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (sortedBefore.length > 0) {
      currentBalance = parseFloat(sortedBefore[0].balance);
    }

    const iter = new Date(cutoff);
    while (iter <= yesterday) {
      const year = iter.getFullYear();
      const month = String(iter.getMonth() + 1).padStart(2, '0');
      const day = String(iter.getDate()).padStart(2, '0');
      const dStr = `${year}-${month}-${day}`;
      if (trendMap[dStr] !== undefined) {
        currentBalance = trendMap[dStr];
      }
      result.push({
        date: dStr,
        amount: currentBalance
      });
      iter.setDate(iter.getDate() + 1);
    }

    return result;
  }, [trend, timespan, selectedAccount]);

  const categoryData = useMemo(() => {
    if (!trend || !trend.length) return [];

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    let cutoff = new Date(yesterday);
    switch (timespan) {
      case '7d': cutoff.setDate(yesterday.getDate() - 7); break;
      case '30d': cutoff.setDate(yesterday.getDate() - 30); break;
      case '3m': cutoff.setMonth(yesterday.getMonth() - 3); break;
      case '1y': cutoff.setFullYear(yesterday.getFullYear() - 1); break;
      case 'all': cutoff = new Date(0); break;
      default: cutoff.setDate(yesterday.getDate() - 30);
    }

    const categories = {};
    trend.forEach(item => {
      const itemDate = new Date(item.date);
      if (itemDate < cutoff || itemDate > yesterday) return;
      if (selectedAccount !== 'all' && item.account !== selectedAccount) return;

      const amount = parseFloat(item.amount);
      if (amount >= 0) return;

      const cat = item.category || 'Uncategorized';
      if (!categories[cat]) categories[cat] = 0;
      categories[cat] += Math.abs(amount);
    });

    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [trend, timespan, selectedAccount]);

  const filteredCategoryData = useMemo(() => {
    return categoryData.filter(cat => !deselectedCategories.includes(cat.name));
  }, [categoryData, deselectedCategories]);

  const totalCount = transactions && transactions.length > 0 ? parseInt(transactions[0].total_count) : 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const toggleCategory = (name) => {
    setDeselectedCategories(prev => 
      prev.includes(name) 
        ? prev.filter(c => c !== name) 
        : [...prev, name]
    );
  };

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const TransactionCard = ({ account, isSelected, onClick, index }) => {
    const isSavings = account.account_display_name?.toLowerCase().includes('savings');
    const colors = [
      { bg: '#eff6ff', text: '#3b82f6' },
      { bg: '#f0fdf4', text: '#22c55e' },
      { bg: '#faf5ff', text: '#a855f7' }
    ];
    const theme = colors[index % colors.length];

    return (
      <div 
        onClick={onClick}
        className="account-card"
        style={{ 
          background: isSelected ? '#3b82f6' : '#fff', 
          color: isSelected ? '#fff' : 'inherit',
          padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '10px',
          cursor: 'pointer', transition: 'all 0.2s',
          position: 'relative', overflow: 'hidden'
        }}
      >
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="card-icon" style={{ 
            background: isSelected ? 'rgba(255,255,255,0.2)' : theme.bg, 
            color: isSelected ? '#fff' : theme.text,
            padding: '10px', borderRadius: '12px'
          }}>
            <CreditCard size={20} />
          </div>
          <span className="card-badge" style={{ fontSize: '0.7em', fontWeight: 'bold', color: isSelected ? 'rgba(255,255,255,0.7)' : '#94a3b8', textTransform: 'uppercase' }}>
            {isSavings ? 'Savings' : 'Standard'}
          </span>
        </div>
        <div className="card-body" style={{ marginTop: '5px' }}>
          <div className="card-title" style={{ fontSize: '0.85em', fontWeight: 'bold', opacity: 0.9, marginBottom: '4px' }}>{account.account_display_name}</div>
          <div className="card-amount" style={{ fontSize: '1.5em', fontWeight: 800 }}>{formatCurrency(account.balance)}</div>
          <div className="card-subtitle" style={{ fontSize: '0.7em', opacity: 0.6, marginTop: '4px', fontFamily: 'monospace' }}>{account.account}</div>
        </div>
      </div>
    );
  };

  const DateFilter = ({ label, value, onChange }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '4px 12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: '0.75em', fontWeight: 'bold', color: '#64748b' }}>{label}</span>
      <input 
        type="date" 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: 'transparent', border: 'none', fontSize: '0.85em', outline: 'none', color: '#475569' }} 
      />
    </div>
  );

  return (
    <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', gap: '30px', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s', position: 'relative' }}>
      {selectedTransaction && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', 
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }} onClick={() => setSelectedTransaction(null)}>
          <div style={{
            background: '#fff', padding: '30px', borderRadius: '24px', maxWidth: '500px', width: '90%',
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            display: 'flex', flexDirection: 'column', gap: '20px'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25em', fontWeight: 'bold' }}>Transaction Details</h2>
                <div style={{ fontSize: '0.85em', color: '#64748b', marginTop: '4px' }}>{formatDate(selectedTransaction.date, selectedTransaction.time)}</div>
              </div>
              <button onClick={() => setSelectedTransaction(null)} style={{ background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '12px', cursor: 'pointer' }}>
                <X size={20} color="#64748b" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>Description</div>
                <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#1e293b', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{selectedTransaction.name_description}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>Amount</div>
                  <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: parseFloat(selectedTransaction.amount) < 0 ? '#ef4444' : '#22c55e' }}>
                    {formatCurrency(selectedTransaction.amount)}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>Account</div>
                  <div style={{ fontSize: '0.9em', fontWeight: 'bold', color: '#1e293b' }}>{selectedTransaction.account_display_name}</div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>Import Method</div>
                <div style={{ fontSize: '0.9em', fontWeight: 'bold', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {selectedTransaction.import_method === 'csv' && <><FileText size={16} color="#64748b" /> CSV Upload</>}
                  {selectedTransaction.import_method === 'ponto' && <><Globe size={16} color="#3b82f6" /> Ponto Synchronization</>}
                  {selectedTransaction.import_method === 'system' && <><Info size={16} color="#94a3b8" /> System Generated</>}
                  {!selectedTransaction.import_method && <><Info size={16} color="#94a3b8" /> Unknown</>}
                </div>
              </div>

              {selectedTransaction.counterparty && (
                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>Counterparty</div>
                  <div style={{ fontSize: '0.9em', color: '#1e293b', wordBreak: 'break-word' }}>{selectedTransaction.counterparty}</div>
                </div>
              )}

              {selectedTransaction.metadata?.is_anomalous && (
                <div style={{ background: '#fff1f2', padding: '15px', borderRadius: '16px', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#e11d48', fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <AlertCircle size={14} /> Anomaly Detected
                  </div>
                  <div style={{ fontSize: '0.9em', color: '#9f1239', fontWeight: '500' }}>{selectedTransaction.metadata.anomaly_reason}</div>
                </div>
              )}

              {selectedTransaction.metadata?.rule_violations?.filter(v => v && v !== 'none' && v !== 'None').length > 0 && (
                <div style={{ background: '#fffbeb', padding: '15px', borderRadius: '16px', border: '1px solid #fef3c7' }}>
                  <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#d97706', fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <ShieldCheck size={14} /> Rule Violations
                  </div>
                  <ul style={{ margin: '5px 0 0', paddingLeft: '20px', fontSize: '0.9em', color: '#92400e' }}>
                    {selectedTransaction.metadata.rule_violations
                      .filter(v => v && v !== 'none' && v !== 'None')
                      .map((v, i) => (
                      <li key={i}>
                        {typeof v === 'object' ? (
                          <span><strong>Rule {v.rule_id}:</strong> {v.reason}</span>
                        ) : v}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedTransaction.metadata && Object.keys(selectedTransaction.metadata).length > 0 && (
                <div style={{ marginTop: '5px' }}>
                  <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Info size={14} /> Additional Information
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(selectedTransaction.metadata).map(([key, value]) => {
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
            
            <button 
              onClick={() => setSelectedTransaction(null)}
              style={{ 
                background: '#3b82f6', color: '#fff', border: 'none', padding: '12px', borderRadius: '16px', 
                fontWeight: 'bold', cursor: 'pointer', marginTop: '10px', boxShadow: '0 4px 6px -1px rgba(59,130,246,0.3)'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="summary-grid">
        <div 
          onClick={() => setSelectedAccount('all')}
          className="account-card"
          style={{ 
            background: selectedAccount === 'all' ? '#3b82f6' : '#fff', 
            color: selectedAccount === 'all' ? '#fff' : 'inherit',
            padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '10px',
            cursor: 'pointer', transition: 'all 0.2s',
            position: 'relative', overflow: 'hidden'
          }}
        >
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="card-icon" style={{ 
              background: selectedAccount === 'all' ? 'rgba(255,255,255,0.2)' : '#eff6ff', 
              color: selectedAccount === 'all' ? '#fff' : '#3b82f6',
              padding: '10px', borderRadius: '12px'
            }}>
              <TrendingUp size={20} />
            </div>
            <span className="card-badge" style={{ fontSize: '0.7em', fontWeight: 'bold', color: selectedAccount === 'all' ? 'rgba(255,255,255,0.7)' : '#94a3b8', textTransform: 'uppercase' }}>
              Total Assets
            </span>
          </div>
          <div className="card-body">
            <div className="card-amount" style={{ fontSize: '1.5em', fontWeight: 800 }}>
              {formatCurrency(summary ? summary.reduce((sum, acc) => sum + parseFloat(acc.balance), 0) : 0)}
            </div>
            <div className="card-title" style={{ fontSize: '0.85em', opacity: 0.8 }}>All Accounts Combined</div>
          </div>
        </div>

        {summary && summary.map((acc, idx) => (
          <TransactionCard 
            key={idx} 
            index={idx}
            account={acc} 
            isSelected={selectedAccount === acc.account}
            onClick={() => setSelectedAccount(acc.account)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '4px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <Calendar size={14} color="#64748b" style={{ marginLeft: '8px' }} />
          <select 
            value={timespan} 
            onChange={(e) => setTimespan(e.target.value)}
            style={{ 
              background: 'transparent', border: 'none', fontSize: '0.85em', fontWeight: '600', color: '#475569', 
              padding: '6px 12px', outline: 'none', cursor: 'pointer' 
            }}
          >
            {TIMESPAN_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TrendingUp size={18} color="#3b82f6" /> Balance Over Time
          </h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(str) => {
                    const date = new Date(str);
                    return date.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
                  }}
                  minTickGap={30}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(val) => formatCurrency(val).replace(',00', '').replace('€\u00A0', '€')}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(val) => [formatCurrency(val), 'Balance']}
                  labelFormatter={(label) => new Date(label).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' })}
                />
                <Area 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorAmount)" 
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {categoryData.length > 0 && (
          <div style={{ background: '#fff', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sparkles size={18} color="#7c3aed" /> Spending by Category
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '15px' }}>
              {categoryData.slice(0, 10).map((cat, idx) => {
                const isDeselected = deselectedCategories.includes(cat.name);
                const info = CATEGORY_MAP[cat.name] || CATEGORY_MAP['Uncategorized'];
                return (
                  <button
                    key={cat.name}
                    onClick={() => toggleCategory(cat.name)}
                    style={{
                      padding: '4px 8px', borderRadius: '8px', fontSize: '0.7em', fontWeight: 'bold', cursor: 'pointer',
                      background: isDeselected ? '#f1f5f9' : info.bg,
                      color: isDeselected ? '#94a3b8' : info.color,
                      border: `1px solid ${isDeselected ? '#e2e8f0' : info.color + '33'}`, transition: 'all 0.2s',
                      textDecoration: isDeselected ? 'line-through' : 'none',
                      display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                  >
                    {!isDeselected && <info.icon size={10} />}
                    {cat.name}
                  </button>
                );
              })}
            </div>
            <div style={{ height: `300px`, overflowY: 'auto' }}>
              <ResponsiveContainer width="100%" height={Math.max(250, filteredCategoryData.length * 35)}>
                <BarChart
                  data={filteredCategoryData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={50}
                    tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(val) => [formatCurrency(val), 'Spending']}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                    {filteredCategoryData.map((entry, index) => {
                      const info = CATEGORY_MAP[entry.name] || CATEGORY_MAP['Uncategorized'];
                      return <Cell key={`cell-${index}`} fill={info.color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <History size={18} color="#3b82f6" /> Activity Overview
            </h3>
          </div>
          
          <div className="filters-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <div className="search-container" style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', paddingLeft: '12px', flex: '1 1 200px' }}>
              <Search size={16} color="#94a3b8" />
              <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1, padding: '10px', border: 'none',
                  fontSize: '0.85em', outline: 'none', color: '#1e293b', background: 'transparent'
                }}
              />
            </div>

            <button
              onClick={() => setDeviationsOnly(!deviationsOnly)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 14px', borderRadius: '12px',
                border: '1px solid',
                borderColor: deviationsOnly ? '#f59e0b' : '#e2e8f0',
                background: deviationsOnly ? '#fffbeb' : '#fff',
                color: deviationsOnly ? '#92400e' : '#64748b',
                fontSize: '0.8em', fontWeight: 'bold', cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <AlertCircle size={16} color={deviationsOnly ? '#f59e0b' : '#94a3b8'} />
              <span className="hide-mobile">Deviations</span>
            </button>

            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 14px', borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  background: categoryFilter.length > 0 ? '#f5f3ff' : '#fff',
                  color: categoryFilter.length > 0 ? '#7c3aed' : '#64748b',
                  fontSize: '0.8em', fontWeight: 'bold', cursor: 'pointer',
                  transition: 'all 0.2s', minWidth: '130px', justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} color={categoryFilter.length > 0 ? '#7c3aed' : '#94a3b8'} />
                  <span className="hide-mobile">{categoryFilter.length === 0 ? 'Categories' : `${categoryFilter.length}`}</span>
                  <span className="show-mobile-only">{categoryFilter.length > 0 ? categoryFilter.length : ''}</span>
                </div>
                {showCategoryDropdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showCategoryDropdown && (
                <>
                  <div 
                    style={{ position: 'fixed', inset: 0, zIndex: 998 }} 
                    onClick={() => setShowCategoryDropdown(false)} 
                  />
                    <div className="category-dropdown" style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 1001,
                    minWidth: '240px', maxHeight: '60vh', overflowY: 'auto', padding: '8px'
                  }}>

                    <div 
                      onClick={() => setCategoryFilter([])}
                      style={{
                        padding: '8px 12px', borderRadius: '8px', fontSize: '0.85em', cursor: 'pointer',
                        background: categoryFilter.length === 0 ? '#f8fafc' : 'transparent',
                        fontWeight: categoryFilter.length === 0 ? 'bold' : 'normal',
                        color: categoryFilter.length === 0 ? '#3b82f6' : '#64748b',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                      }}
                    >
                      All Categories
                      {categoryFilter.length === 0 && <CheckCircle size={14} />}
                    </div>
                    <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }} />
                    {Object.keys(CATEGORY_MAP).sort().map(cat => {
                      const isSelected = categoryFilter.includes(cat);
                      return (
                        <div 
                          key={cat}
                          onClick={() => {
                            setCategoryFilter(prev => 
                              isSelected ? prev.filter(c => c !== cat) : [...prev, cat]
                            );
                          }}
                          style={{
                            padding: '8px 12px', borderRadius: '8px', fontSize: '0.85em', cursor: 'pointer',
                            background: isSelected ? '#f5f3ff' : 'transparent',
                            color: isSelected ? '#7c3aed' : '#475569',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            transition: 'all 0.1s'
                          }}
                          onMouseEnter={e => !isSelected && (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => !isSelected && (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: CATEGORY_MAP[cat].color }} />
                            {cat}
                          </div>
                          {isSelected && <CheckCircle size={14} />}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            
            <div className="date-filters" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <DateFilter 
                label="From" 
                value={dateFilter.start} 
                onChange={(val) => setDateFilter({...dateFilter, start: val})} 
              />
              <DateFilter 
                label="To" 
                value={dateFilter.end} 
                onChange={(val) => setDateFilter({...dateFilter, end: val})} 
              />
            </div>
          </div>
        </div>

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
                  <td colSpan="3" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9em' }}>
                    {loading ? 'Loading...' : 'No transactions found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination-container" style={{ 
            padding: '15px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#f8fafc', flexWrap: 'wrap', gap: '10px'
          }}>
            <div style={{ fontSize: '0.75em', color: '#64748b' }}>
              <strong>{totalCount}</strong> items
            </div>
            
            <div className="pagination-controls" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                 <button 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
                  disabled={currentPage === 1}
                  style={{ padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: currentPage === 1 ? 'default' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}
                 >
                   <ChevronLeft size={14} color="#475569" />
                 </button>
                 <span style={{ fontSize: '0.8em', fontWeight: 'bold', padding: '0 5px' }}>{currentPage}/{totalPages}</span>
                 <button 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
                  disabled={currentPage === totalPages}
                  style={{ padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1 }}
                 >
                   <ChevronRight size={14} color="#475569" />
                 </button>
               </div>
               
               <select 
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.75em', outline: 'none' }}
               >
                 {[10, 25, 50, 100].map(size => (
                   <option key={size} value={size}>{size}</option>
                 ))}
               </select>
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 15px;
        }

        @media (max-width: 640px) {
          .summary-grid {
            display: flex !important;
            flex-direction: column !important;
            gap: 16px !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            overflow: visible !important;
          }

          .account-card {
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            flex: 1 1 auto !important;
            padding: 24px !important;
            border-radius: 28px !important;
            box-sizing: border-box !important;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
            margin: 0 !important;
          }

          .card-amount {
            font-size: 1.5em !important;
          }

          .card-title {
            font-size: 1em !important;
          }

          .card-amount {
            font-size: 1.25em !important;
          }

          .card-subtitle {
            display: none !important;
          }

          .card-badge {
            font-size: 0.6em !important;
          }

          .card-icon {
            padding: 8px !important;
          }
          
          .category-dropdown {
            right: auto !important;
            left: 0 !important;
            min-width: 200px !important;
          }

          .hide-mobile {
            display: none !important;
          }
          .show-mobile-only {
            display: inline !important;
          }
          .charts-grid {
            grid-template-columns: 1fr !important;
          }
        }
        
        @media (min-width: 641px) {
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
          }

          .account-card {
            padding: 20px !important;
            border-radius: 20px !important;
          }

          .card-amount {
            font-size: 1.5em !important;
          }

          .card-subtitle {
            display: block !important;
          }

          .show-mobile-only {
            display: none !important;
          }

          .charts-grid {
            grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)) !important;
            gap: 20px !important;
          }
        }
      `}</style>
    </div>
  );
}
