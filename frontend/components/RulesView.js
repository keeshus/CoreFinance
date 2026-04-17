import React, { useState } from 'react';
import { ShieldCheck, Plus, Check, X, Zap, Edit2, Save, AlertCircle, CheckCircle, Download, Upload, Search } from 'lucide-react';

export default function RulesView({ rules, categories, onAddRule, onUpdateRuleStatus, onDeleteRule, onImportRules }) {
  const [newRuleType, setNewRuleType] = useState('validation');
  const [newRuleName, setNewRuleName] = useState('');
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newExpectedAmount, setNewExpectedAmount] = useState('');
  const [newAmountMargin, setNewAmountMargin] = useState('');
  const [newCategory, setNewCategory] = useState('');
  
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editType, setEditType] = useState('');
  const [editName, setEditName] = useState('');
  const [editPattern, setEditPattern] = useState('');
  const [editExpectedAmount, setEditExpectedAmount] = useState('');
  const [editAmountMargin, setEditAmountMargin] = useState('');
  const [editCategory, setEditCategory] = useState('');

  const [notification, setNotification] = useState(null);

  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleTypeFilter, setRuleTypeFilter] = useState('all');
  const [ruleCategoryFilter, setRuleCategoryFilter] = useState('all');

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAddRule = async () => {
    try {
      const exp = newExpectedAmount === '' ? null : parseFloat(newExpectedAmount);
      const marg = newAmountMargin === '' ? null : parseFloat(newAmountMargin);
      await onAddRule(newRuleName, newRulePattern, exp, marg, newRuleType, newCategory || null);
      setNewRuleName('');
      setNewRulePattern('');
      setNewExpectedAmount('');
      setNewAmountMargin('');
      setNewCategory('');
      showNotification('Rule added successfully');
    } catch (err) {
      showNotification('Failed to add rule', 'error');
    }
  };

  const handleUpdateStatus = async (id, isActive, isProposed, name, pattern, exp, marg, type, cat) => {
    try {
      await onUpdateRuleStatus(id, isActive, isProposed, name, pattern, exp, marg, type, cat);
      showNotification('Rule updated successfully');
    } catch (err) {
      showNotification('Failed to update rule', 'error');
    }
  };

  const handleDeleteRule = async (id) => {
    try {
      await onDeleteRule(id);
      showNotification('Rule deleted successfully');
    } catch (err) {
      showNotification('Failed to delete rule', 'error');
    }
  };

  const activeRules = rules.filter(r => {
    if (r.is_proposed) return false;
    if (ruleTypeFilter !== 'all' && r.type !== ruleTypeFilter) return false;
    if (ruleCategoryFilter !== 'all' && (r.category || 'all') !== ruleCategoryFilter) return false;
    return !(ruleSearch && !r.name.toLowerCase().includes(ruleSearch.toLowerCase()) && !r.pattern.toLowerCase().includes(ruleSearch.toLowerCase()));

  });

  const proposedRules = rules.filter(r => r.is_proposed);

  const startEditing = (rule) => {
    setEditingRuleId(rule.id);
    setEditType(rule.type || 'validation');
    setEditName(rule.name);
    setEditPattern(rule.pattern);
    setEditExpectedAmount(rule.expected_amount === null ? '' : rule.expected_amount);
    setEditAmountMargin(rule.amount_margin === null ? '' : rule.amount_margin);
    setEditCategory(rule.category || '');
  };

  const cancelEditing = () => {
    setEditingRuleId(null);
  };

  const saveEdit = async (id, isActive) => {
    try {
      const exp = editExpectedAmount === '' ? null : parseFloat(editExpectedAmount);
      const marg = editAmountMargin === '' ? null : parseFloat(editAmountMargin);
      await onUpdateRuleStatus(id, isActive, false, editName, editPattern, exp, marg, editType, editCategory);
      setEditingRuleId(null);
      showNotification('Rule saved successfully');
    } catch (err) {
      showNotification('Failed to save rule', 'error');
    }
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/rules/export', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'smart_rules.json';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      showNotification('Rules exported successfully');
    } catch (err) {
      showNotification('Failed to export rules', 'error');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Reset the input value immediately so the same file can be selected again if it fails
    const input = e.target;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rules = JSON.parse(event.target.result);
        await onImportRules(rules);
        showNotification('Rules imported successfully');
      } catch (err) {
        showNotification('Failed to import rules: ' + err.message, 'error');
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', position: 'relative' }}>
      {/* Toast Notification */}
      {notification && (
        <div style={{ 
          position: 'fixed', top: '20px', right: '20px', zIndex: 1000,
          padding: '12px 24px', borderRadius: '12px', background: notification.type === 'error' ? '#fee2e2' : '#f0fdf4',
          border: `1px solid ${notification.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
          color: notification.type === 'error' ? '#991b1b' : '#166534',
          fontWeight: '600', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          display: 'flex', alignItems: 'center', gap: '10px',
          animation: 'slideIn 0.3s ease-out'
        }}>
          {notification.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
          {notification.message}
        </div>
      )}

      {/* Header with Export/Import */}
      <div className="rules-header" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '-10px' }}>
        <button
          onClick={handleExport}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
            fontSize: '0.9em', fontWeight: '600', cursor: 'pointer', color: '#64748b'
          }}
        >
          <Download size={18} /> <span className="hide-mobile">Export Rules</span>
        </button>
        <label style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
          fontSize: '0.9em', fontWeight: '600', cursor: 'pointer', color: '#64748b'
        }}>
          <Upload size={18} /> <span className="hide-mobile">Import Rules</span>
          <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        </label>
      </div>

      {/* Add New Rule */}
      <div style={{ background: '#fff', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
         <h3 style={{ margin: '0 0 20px', fontSize: '1.1em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
           <Plus size={20} color="#10b981" /> <span className="hide-mobile">Create Natural Language Rule</span>
           <span className="show-mobile-only">New Smart Rule</span>
         </h3>
         <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
               <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85em' }}>
                 <input type="radio" checked={newRuleType === 'validation'} onChange={() => setNewRuleType('validation')} />
                 Validation
               </label>
               <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85em' }}>
                 <input type="radio" checked={newRuleType === 'categorization'} onChange={() => setNewRuleType('categorization')} />
                 Categorization
               </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <input 
                  placeholder="Rule Name (e.g. Rent)"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  style={{ flex: '1 1 200px', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.9em' }}
                />
                <input 
                  placeholder="Pattern (e.g. contains 'Apartment')"
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                  style={{ flex: '1 1 200px', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.9em' }}
                />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                {newRuleType === 'validation' ? (
                  <>
                    <input 
                      type="number"
                      placeholder="Amount"
                      value={newExpectedAmount}
                      onChange={(e) => setNewExpectedAmount(e.target.value)}
                      style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.9em' }}
                    />
                    <input 
                      type="number"
                      placeholder="Margin"
                      value={newAmountMargin}
                      onChange={(e) => setNewAmountMargin(e.target.value)}
                      style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.9em' }}
                    />
                  </>
                ) : (
                    <select 
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#fff', fontSize: '0.9em' }}
                    >
                      <option value="">Select Category...</option>
                      {categories?.map(c => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                )}
                <button 
                  onClick={handleAddRule}
                  disabled={newRuleType === 'categorization' && !newCategory}
                  style={{ 
                    padding: '12px 20px', background: '#10b981', color: '#fff', border: 'none', 
                    borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer',
                    opacity: (newRuleType === 'categorization' && !newCategory) ? 0.5 : 1,
                    flexShrink: 0
                  }}
                >
                  Add
                </button>
            </div>
         </div>
      </div>

      {/* Active Rules List */}
      <div style={{ background: '#fff', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
           <h3 style={{ margin: 0, fontSize: '1.1em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
             <ShieldCheck size={20} color="#3b82f6" /> Active Rules
           </h3>
           
           {/* Filters */}
           <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
             <div style={{ position: 'relative' }}>
               <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
               <input
                 type="text"
                 placeholder="Search rules..."
                 value={ruleSearch}
                 onChange={(e) => setRuleSearch(e.target.value)}
                 style={{ padding: '8px 12px 8px 35px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.85em', width: '200px' }}
               />
             </div>
             <select
               value={ruleTypeFilter}
               onChange={(e) => setRuleTypeFilter(e.target.value)}
               style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.85em', background: '#fff' }}
             >
               <option value="all">All Types</option>
               <option value="validation">Validation</option>
               <option value="categorization">Categorization</option>
             </select>
             <select
               value={ruleCategoryFilter}
               onChange={(e) => setRuleCategoryFilter(e.target.value)}
               style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.85em', background: '#fff' }}
             >
               <option value="all">All Categories</option>
               {categories && categories.map(c => (
                 <option key={c.name} value={c.name}>{c.name}</option>
               ))}
             </select>
           </div>
         </div>

         <div className="rules-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
           {activeRules.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.9em' }}>No active rules defined.</p>}
           {activeRules.map(rule => {
             const isEditing = editingRuleId === rule.id;
             return (
               <div key={rule.id} style={{ 
                 display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                 padding: '15px', background: rule.is_active ? '#f8fafc' : '#f1f5f9', 
                 borderRadius: '16px', border: '1px solid #f1f5f9', opacity: rule.is_active ? 1 : 0.6,
                 flexWrap: 'wrap', gap: '10px'
               }}>
                  <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {isEditing ? (
                      <>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '5px', flexWrap: 'wrap' }}>
                          <select 
                            value={editType}
                            onChange={e => setEditType(e.target.value)}
                            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85em' }}
                          >
                            <option value="validation">Validation</option>
                            <option value="categorization">Categorization</option>
                          </select>
                          <input 
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold', fontSize: '0.85em' }}
                          />
                        </div>
                        <input 
                          value={editPattern}
                          onChange={(e) => setEditPattern(e.target.value)}
                          style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85em' }}
                        />
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {editType === 'validation' ? (
                              <>
                                <input 
                                  type="number"
                                  placeholder="Amount"
                                  value={editExpectedAmount}
                                  onChange={(e) => setEditExpectedAmount(e.target.value)}
                                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8em' }}
                                />
                                <input 
                                  type="number"
                                  placeholder="Margin"
                                  value={editAmountMargin}
                                  onChange={(e) => setEditAmountMargin(e.target.value)}
                                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8em' }}
                                />
                              </>
                            ) : (
                                <select 
                                  value={editCategory}
                                  onChange={(e) => setEditCategory(e.target.value)}
                                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8em', background: '#fff' }}
                                >
                                  <option value="">Select Category...</option>
                                  {categories?.map(c => (
                                    <option key={c.name} value={c.name}>{c.name}</option>
                                  ))}
                                </select>
                            )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.6em', padding: '2px 6px', borderRadius: '6px', background: rule.type === 'categorization' ? '#fce7f3' : '#e0e7ff', color: rule.type === 'categorization' ? '#be185d' : '#4338ca', fontWeight: 'bold', textTransform: 'uppercase' }}>
                            {rule.type || 'val'}
                          </span>
                          <span style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '0.9em' }}>{rule.name}</span>
                        </div>
                        <div style={{ fontSize: '0.8em', color: '#64748b', wordBreak: 'break-word' }}>{rule.pattern}</div>
                        {rule.type === 'validation' && rule.expected_amount !== null && (
                          <div style={{ fontSize: '0.75em', color: '#3b82f6', fontWeight: 'bold' }}>
                            Exp: {rule.expected_amount} (± {rule.amount_margin || 0})
                          </div>
                        )}
                        {rule.type === 'categorization' && rule.category && (
                          <div style={{ fontSize: '0.75em', color: '#10b981', fontWeight: 'bold' }}>
                            Cat: {rule.category}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                   {isEditing ? (
                     <>
                       <button 
                         onClick={() => saveEdit(rule.id, rule.is_active)}
                         style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}
                       >
                         <Save size={16} />
                       </button>
                       <button 
                         onClick={cancelEditing}
                         style={{ background: '#94a3b8', color: '#fff', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}
                       >
                         <X size={16} />
                       </button>
                     </>
                   ) : (
                     <>
                       <button 
                         onClick={() => startEditing(rule) }
                         style={{ background: '#e2e8f0', color: '#475569', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}
                       >
                         <Edit2 size={16} />
                       </button>
                       <button 
                         onClick={() => handleUpdateStatus(rule.id, !rule.is_active, false, rule.name, rule.pattern, rule.expected_amount, rule.amount_margin, rule.type, rule.category)}
                         style={{ 
                           padding: '6px 10px', background: rule.is_active ? '#ef4444' : '#10b981', 
                           color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.75em', fontWeight: 'bold', cursor: 'pointer' 
                         }}
                       >
                         {rule.is_active ? 'Off' : 'On'}
                       </button>
                       <button 
                         onClick={() => handleDeleteRule(rule.id)}
                         style={{ background: '#fee2e2', color: '#ef4444', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}
                       >
                         <X size={16} />
                       </button>
                     </>
                   )}
                  </div>
               </div>
             );
           })}
         </div>
      </div>

      {/* AI Proposals */}
      <div style={{ background: '#fefce8', padding: '30px', borderRadius: '24px', border: '1px solid #fef08a' }}>
         <h3 style={{ margin: '0 0 25px', fontSize: '1.2em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
           <Zap size={20} color="#eab308" /> AI Proposed Smart Rules
         </h3>
         <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
           {proposedRules.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.9em' }}>No new proposals at this time.</p>}
           {proposedRules.map(rule => (
             <div key={rule.id} style={{ 
               display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
               padding: '15px 20px', background: '#fff', borderRadius: '16px', border: '1px solid #fef08a'
             }}>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.7em', padding: '2px 6px', borderRadius: '6px', background: rule.type === 'categorization' ? '#fce7f3' : '#e0e7ff', color: rule.type === 'categorization' ? '#be185d' : '#4338ca', fontWeight: 'bold', textTransform: 'uppercase' }}>
                      {rule.type || 'validation'}
                    </span>
                    {rule.name} <span style={{ fontSize: '0.7em', padding: '2px 8px', background: '#fef9c3', color: '#854d0e', borderRadius: '10px' }}>NEW</span>
                  </div>
                  <div style={{ fontSize: '0.9em', color: '#64748b' }}>{rule.pattern}</div>
                  {rule.type === 'validation' && rule.expected_amount !== null && (
                    <div style={{ fontSize: '0.8em', color: '#eab308', fontWeight: 'bold' }}>
                      Proposed Expected: {rule.expected_amount} (± {rule.amount_margin || 0})
                    </div>
                  )}
                  {rule.type === 'categorization' && rule.category && (
                    <div style={{ fontSize: '0.8em', color: '#10b981', fontWeight: 'bold' }}>
                      Proposed Category: {rule.category}
                    </div>
                  )}
                </div>
<div style={{ display: 'flex', gap: '10px' }}>
                 <button 
                   onClick={() => handleUpdateStatus(rule.id, true, false, rule.name, rule.pattern, rule.expected_amount, rule.amount_margin, rule.type, rule.category)}
                   style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}
                 >
                   <Check size={18} />
                 </button>
                 <button 
                   onClick={() => handleDeleteRule(rule.id)}
                   style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}
                 >
                   <X size={18} />
                 </button>
               </div>
             </div>
           ))}
         </div>
      </div>
      <style jsx>{`
          @keyframes slideIn {
              from {
                  transform: translateX(100%);
                  opacity: 0;
              }
              to {
                  transform: translateX(0);
                  opacity: 1;
              }
          }
      `}</style>
    </div>
  );
}
