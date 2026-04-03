import React, { useState, useMemo, useEffect } from 'react';
import { CreditCard, TrendingUp, History, ArrowDownCircle, ArrowUpCircle, Calendar, Search, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X, Info, Sparkles, AlertCircle } from 'lucide-react';
import { AreaChart, Area, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6'];

export default function DashboardView({ summary, trend, transactions, fetchTransactions, loading }) {
  const [timespan, setTimespan] = useState('30d');
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [deselectedCategories, setDeselectedCategories] = useState(['Uncategorized']);
  const [timeIndex, setTimeIndex] = useState(null);

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
    const date = new Date(dateStr).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' });
    if (timeStr) {
      // timeStr is HH:mm:ss, we want HH:mm
      return `${date} ${timeStr.substring(0, 5)}`;
    }
    return date;
  };

  // Fetch data when filters/pagination change
  useEffect(() => {
    fetchTransactions({
      page: currentPage,
      pageSize,
      account: selectedAccount,
      search: searchQuery,
      startDate: dateFilter.start,
      endDate: dateFilter.end,
      sortField,
      sortOrder
    });
  }, [currentPage, pageSize, selectedAccount, searchQuery, dateFilter, sortField, sortOrder, fetchTransactions]);

  // Reset page when filters change (but not when page itself changes)
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedAccount, searchQuery, dateFilter, sortField, sortOrder, pageSize]);

  const filteredTrend = useMemo(() => {
    if (!trend.length) return [];

    let activeTrend;
    if (selectedAccount !== 'all') {
      activeTrend = trend.filter(item => item.account === selectedAccount);
    } else {
      // Aggregate by date for all accounts
      const aggregated = trend.reduce((acc, item) => {
        const date = item.date;
        if (!acc[date]) acc[date] = 0;
        acc[date] += parseFloat(item.balance);
        return acc;
      }, {});
      activeTrend = Object.entries(aggregated).map(([date, balance]) => ({ date, balance }));
    }

    const now = new Date();
    let cutoff = new Date();

    if (timespan === 'all') {
      const sortedTrend = [...activeTrend].sort((a, b) => new Date(a.date) - new Date(b.date));
      cutoff = new Date(sortedTrend[0]?.date || now);
    } else {
      switch (timespan) {
        case '7d': cutoff.setDate(now.getDate() - 7); break;
        case '30d': cutoff.setDate(now.getDate() - 30); break;
        case '3m': cutoff.setMonth(now.getMonth() - 3); break;
        case '1y': cutoff.setFullYear(now.getFullYear() - 1); break;
      }
    }

    const trendMap = activeTrend.reduce((acc, item) => {
      const d = new Date(item.date).toISOString().split('T')[0];
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
    while (iter <= now) {
      const dStr = iter.toISOString().split('T')[0];
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
    if (!trend.length) return [];

    const now = new Date();
    let cutoff = new Date();
    switch (timespan) {
      case '7d': cutoff.setDate(now.getDate() - 7); break;
      case '30d': cutoff.setDate(now.getDate() - 30); break;
      case '3m': cutoff.setMonth(now.getMonth() - 3); break;
      case '1y': cutoff.setFullYear(now.getFullYear() - 1); break;
      case 'all': cutoff = new Date(0); break;
    }

    const categories = {};
    trend.forEach(item => {
      const itemDate = new Date(item.date);
      if (itemDate < cutoff || itemDate > now) return;
      if (selectedAccount !== 'all' && item.account !== selectedAccount) return;

      const amount = parseFloat(item.amount);
      if (amount >= 0) return; // Only focus on spending

      const cats = item.categories || ['Uncategorized'];
      cats.forEach(cat => {
        if (!categories[cat]) categories[cat] = 0;
        categories[cat] += Math.abs(amount);
      });
    });

    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [trend, timespan, selectedAccount]);

  const filteredCategoryData = useMemo(() => {
    return categoryData.filter(cat => !deselectedCategories.includes(cat.name));
  }, [categoryData, deselectedCategories]);

  const categoryTrendData = useMemo(() => {
    if (!trend.length) return [];

    const now = new Date();
    let cutoff = new Date();
    switch (timespan) {
      case '7d': cutoff.setDate(now.getDate() - 7); break;
      case '30d': cutoff.setDate(now.getDate() - 30); break;
      case '3m': cutoff.setMonth(now.getMonth() - 3); break;
      case '1y': cutoff.setFullYear(now.getFullYear() - 1); break;
      case 'all': cutoff = new Date(0); break;
    }

    const dailyData = {};
    const topCategories = categoryData
      .filter(cat => !deselectedCategories.includes(cat.name))
      .slice(0, 5)
      .map(c => c.name);

    trend.forEach(item => {
      const itemDate = new Date(item.date);
      if (itemDate < cutoff || itemDate > now) return;
      if (selectedAccount !== 'all' && item.account !== selectedAccount) return;

      const amount = parseFloat(item.amount);
      if (amount >= 0) return;

      const dateStr = item.date.substring(0, 10);
      if (!dailyData[dateStr]) {
        dailyData[dateStr] = { date: dateStr };
        topCategories.forEach(cat => dailyData[dateStr][cat] = 0);
      }

      const cats = item.categories || ['Uncategorized'];
      cats.forEach(cat => {
        if (topCategories.includes(cat)) {
          dailyData[dateStr][cat] += Math.abs(amount);
        }
      });
    });

    return Object.values(dailyData).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [trend, categoryData, deselectedCategories, timespan, selectedAccount]);

  const totalCount = transactions.length > 0 ? parseInt(transactions[0].total_count) : 0;

  const toggleCategory = (name) => {
    setDeselectedCategories(prev => 
      prev.includes(name) 
        ? prev.filter(c => c !== name) 
        : [...prev, name]
    );
  };
  const totalPages = Math.ceil(totalCount / pageSize);

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
        style={{ 
          background: isSelected ? '#3b82f6' : '#fff', 
          color: isSelected ? '#fff' : 'inherit',
          padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '10px',
          cursor: 'pointer', transition: 'all 0.2s'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ 
            background: isSelected ? 'rgba(255,255,255,0.2)' : theme.bg, 
            color: isSelected ? '#fff' : theme.text,
            padding: '10px', borderRadius: '12px'
          }}>
            <CreditCard size={20} />
          </div>
          <span style={{ fontSize: '0.7em', fontWeight: 'bold', color: isSelected ? 'rgba(255,255,255,0.7)' : '#94a3b8', textTransform: 'uppercase' }}>
            {isSavings ? 'Savings' : 'Standard'}
          </span>
        </div>
        <div style={{ marginTop: '5px' }}>
          <div style={{ fontSize: '0.85em', fontWeight: 'bold', opacity: 0.9, marginBottom: '4px' }}>{account.account_display_name}</div>
          <div style={{ fontSize: '1.5em', fontWeight: 800 }}>{formatCurrency(account.balance)}</div>
          <div style={{ fontSize: '0.7em', opacity: 0.6, marginTop: '4px', fontFamily: 'monospace' }}>{account.account}</div>
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
                <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#1e293b' }}>{selectedTransaction.name_description}</div>
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

              {selectedTransaction.counterparty && (
                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px' }}>Counterparty</div>
                  <div style={{ fontSize: '0.9em', color: '#1e293b' }}>{selectedTransaction.counterparty}</div>
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

              {selectedTransaction.metadata?.rule_violations?.length > 0 && (
                <div style={{ background: '#fffbeb', padding: '15px', borderRadius: '16px', border: '1px solid #fef3c7' }}>
                  <div style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#d97706', fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <ShieldCheck size={14} /> Rule Violations
                  </div>
                  <ul style={{ margin: '5px 0 0', paddingLeft: '20px', fontSize: '0.9em', color: '#92400e' }}>
                    {selectedTransaction.metadata.rule_violations.map((v, i) => <li key={i}>{v}</li>)}
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
                      if (!value || value === '') return null;
                      return (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                          <span style={{ color: '#64748b', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                          <span style={{ color: '#1e293b', fontWeight: '500', textAlign: 'right', maxWidth: '250px' }}>{value}</span>
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

      <div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        <div 
          onClick={() => setSelectedAccount('all')}
          style={{ 
            background: selectedAccount === 'all' ? '#3b82f6' : '#fff', 
            color: selectedAccount === 'all' ? '#fff' : 'inherit',
            padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '10px',
            cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ 
              background: selectedAccount === 'all' ? 'rgba(255,255,255,0.2)' : '#eff6ff', 
              color: selectedAccount === 'all' ? '#fff' : '#3b82f6',
              padding: '10px', borderRadius: '12px'
            }}>
              <TrendingUp size={20} />
            </div>
            <span style={{ fontSize: '0.7em', fontWeight: 'bold', color: selectedAccount === 'all' ? 'rgba(255,255,255,0.7)' : '#94a3b8', textTransform: 'uppercase' }}>
              Total Assets
            </span>
          </div>
          <div>
            <div style={{ fontSize: '1.5em', fontWeight: 800 }}>
              {formatCurrency(summary.reduce((sum, acc) => sum + parseFloat(acc.balance), 0))}
            </div>
            <div style={{ fontSize: '0.85em', opacity: 0.8 }}>All Accounts Combined</div>
          </div>
        </div>

        {summary.map((acc, idx) => (
          <TransactionCard 
            key={idx} 
            index={idx}
            account={acc} 
            isSelected={selectedAccount === acc.account}
            onClick={() => setSelectedAccount(acc.account)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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

      {categoryData.length > 0 && (
        <div style={{ background: '#fff', padding: '25px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={18} color="#7c3aed" /> Spending by Category
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '15px' }}>
            {categoryData.map((cat, index) => (
              <button
                key={cat.name}
                onClick={() => toggleCategory(cat.name)}
                style={{
                  padding: '4px 10px', borderRadius: '8px', fontSize: '0.75em', fontWeight: 'bold', cursor: 'pointer',
                  background: deselectedCategories.includes(cat.name) ? '#f1f5f9' : COLORS[index % COLORS.length],
                  color: deselectedCategories.includes(cat.name) ? '#94a3b8' : '#fff',
                  border: 'none', transition: 'all 0.2s',
                  textDecoration: deselectedCategories.includes(cat.name) ? 'line-through' : 'none'
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <div style={{ height: '400px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={filteredCategoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {filteredCategoryData.map((entry, index) => {
                    const originalIndex = categoryData.findIndex(c => c.name === entry.name);
                    return <Cell key={`cell-${index}`} fill={COLORS[originalIndex % COLORS.length]} />;
                  })}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(val, name, props) => [formatCurrency(val), props.payload.name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <History size={18} color="#3b82f6" /> Activity Overview
            </h3>
          </div>
          
          <div className="filters-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="search-container" style={{ display: 'flex', alignItems: 'center', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', paddingLeft: '12px', width: '300px', maxWidth: '100%' }}>
              <Search size={16} color="#94a3b8" />
              <input 
                type="text" 
                placeholder="Search transactions..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ 
                  flex: 1, padding: '10px 10px 10px 12px', border: 'none',
                  fontSize: '0.85em', outline: 'none', color: '#1e293b', background: 'transparent'
                }}
              />
            </div>
            
            <div className="date-filters" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto', flexWrap: 'wrap' }}>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', fontSize: '0.75em', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>
                <th 
                  onClick={() => toggleSort('date')}
                  style={{ padding: '15px 20px', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    Date <ArrowUpDown size={12} opacity={sortField === 'date' ? 1 : 0.3} />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort('name_description')}
                  style={{ padding: '15px 20px', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    Description <ArrowUpDown size={12} opacity={sortField === 'name_description' ? 1 : 0.3} />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort('amount')}
                  style={{ padding: '15px 20px', textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end' }}>
                    Amount <ArrowUpDown size={12} opacity={sortField === 'amount' ? 1 : 0.3} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, idx) => (
                <tr 
                  key={idx} 
                  onClick={() => setSelectedTransaction(t)}
                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '15px 20px', fontSize: '0.85em', color: '#64748b' }}>{formatDate(t.date, t.time)}</td>
                  <td style={{ padding: '15px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ 
                        padding: '8px', borderRadius: '10px', background: parseFloat(t.amount) < 0 ? '#fef2f2' : '#f0fdf4',
                        color: parseFloat(t.amount) < 0 ? '#ef4444' : '#22c55e'
                      }}>
                        {parseFloat(t.amount) < 0 ? <ArrowDownCircle size={16} /> : <ArrowUpCircle size={16} />}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.9em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {t.name_description}
                          {t.metadata?.is_anomalous && <AlertCircle size={14} color="#ef4444" />}
                          {t.metadata?.rule_violations?.length > 0 && <ShieldCheck size={14} color="#f59e0b" />}
                        </div>
                        <div style={{ fontSize: '0.75em', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {t.account_display_name}
                          {t.metadata?.ai_categories && t.metadata.ai_categories.map((cat, i) => (
                            <span key={i} style={{ 
                              display: 'flex', alignItems: 'center', gap: '3px', 
                              padding: '1px 6px', background: '#f5f3ff', color: '#7c3aed', 
                              borderRadius: '8px', fontSize: '0.9em', fontWeight: 'bold' 
                            }}>
                              <Sparkles size={10} /> {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '15px 20px', textAlign: 'right', fontWeight: 'bold', color: parseFloat(t.amount) < 0 ? '#ef4444' : '#22c55e' }}>
                    {formatCurrency(t.amount)}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan="3" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9em' }}>
                    {loading ? 'Loading transactions...' : 'No transactions found matching your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination-container" style={{ 
            padding: '20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#f8fafc', flexWrap: 'wrap', gap: '15px'
          }}>
            <div className="pagination-info" style={{ fontSize: '0.8em', color: '#64748b' }}>
              Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(currentPage * pageSize, totalCount)}</strong> of <strong>{totalCount}</strong> transactions
            </div>
            
            <div className="pagination-controls" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                 <button 
                  onClick={() => setCurrentPage(1)} 
                  disabled={currentPage === 1}
                  style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: currentPage === 1 ? 'default' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}
                 >
                   <ChevronsLeft size={16} color="#475569" />
                 </button>
                 <button 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
                  disabled={currentPage === 1}
                  style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: currentPage === 1 ? 'default' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}
                 >
                   <ChevronLeft size={16} color="#475569" />
                 </button>
               </div>
               
               <div style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#1e293b' }}>
                 Page {currentPage} of {totalPages}
               </div>

               <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                 <button 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
                  disabled={currentPage === totalPages}
                  style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1 }}
                 >
                   <ChevronRight size={16} color="#475569" />
                 </button>
                 <button 
                  onClick={() => setCurrentPage(totalPages)} 
                  disabled={currentPage === totalPages}
                  style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1 }}
                 >
                   <ChevronsRight size={16} color="#475569" />
                 </button>
               </div>

               <select 
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.8em', outline: 'none', cursor: 'pointer' }}
               >
                 {[10, 25, 50, 100].map(size => (
                   <option key={size} value={size}>{size} per page</option>
                 ))}
               </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
