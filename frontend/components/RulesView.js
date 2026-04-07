import React, { useState } from 'react';
import { ShieldCheck, Plus, Check, X, Zap, Edit2, Save, AlertCircle, CheckCircle, Download, Upload } from 'lucide-react';

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

  const activeRules = rules.filter(r => !r.is_proposed);
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
      const response = await fetch('/api/rules/export');
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

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rules = JSON.parse(event.target.result);
        await onImportRules(rules);
        showNotification('Rules imported successfully');
        // Reset file input
        e.target.value = '';
      } catch (err) {
        showNotification('Failed to import rules: ' + err.message, 'error');
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
          <style jsx>{`
            @keyframes slideIn {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* Header with Export/Import */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '-20px' }}>
        <button
          onClick={handleExport}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
            fontSize: '0.9em', fontWeight: '600', cursor: 'pointer', color: '#64748b'
          }}
        >
          <Download size={18} /> Export Rules
        </button>
        <label style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
          fontSize: '0.9em', fontWeight: '600', cursor: 'pointer', color: '#64748b'
        }}>
          <Upload size={18} /> Import Rules
          <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        </label>
      </div>

      {/* Add New Rule */}
      <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
         <h3 style={{ margin: '0 0 25px', fontSize: '1.2em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
           <Plus size={20} color="#10b981" /> Create Natural Language Rule
         </h3>
         <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
               <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                 <input type="radio" checked={newRuleType === 'validation'} onChange={() => setNewRuleType('validation')} />
                 Validation Rule (Detect Anomalies)
               </label>
               <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                 <input type="radio" checked={newRuleType === 'categorization'} onChange={() => setNewRuleType('categorization')} />
                 Categorization Rule (Assign Category)
               </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                <input 
                  placeholder="Rule Name (e.g. Car Insurance)"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  style={{ flex: 1, minWidth: '200px', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
                />
                <input 
                  placeholder="Description/Pattern (e.g. All transactions to Company X)"
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                  style={{ flex: 2, minWidth: '300px', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
                />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center' }}>
                {newRuleType === 'validation' ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <span style={{ fontSize: '0.9em', color: '#64748b' }}>Expected:</span>
                        <input 
                          type="number"
                          placeholder="Amount"
                          value={newExpectedAmount}
                          onChange={(e) => setNewExpectedAmount(e.target.value)}
                          style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <span style={{ fontSize: '0.9em', color: '#64748b' }}>Margin:</span>
                        <input 
                          type="number"
                          placeholder="Margin"
                          value={newAmountMargin}
                          onChange={(e) => setNewAmountMargin(e.target.value)}
                          style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
                        />
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 2 }}>
                      <span style={{ fontSize: '0.9em', color: '#64748b' }}>Category:</span>
                      <select 
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#fff' }}
                      >
                        <option value="">Select a category...</option>
                        {categories?.map(c => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                  </div>
                )}
                <button 
                  onClick={handleAddRule}
                  disabled={newRuleType === 'categorization' && !newCategory}
                  style={{ 
                    padding: '12px 25px', background: '#10b981', color: '#fff', border: 'none', 
                    borderRadius: '12px', fontWeight: 'bold', cursor: (newRuleType === 'categorization' && !newCategory) ? 'not-allowed' : 'pointer',
                    opacity: (newRuleType === 'categorization' && !newCategory) ? 0.5 : 1
                  }}
                >
                  Add Rule
                </button>
            </div>
         </div>
      </div>

      {/* Active Rules List */}
      <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
         <h3 style={{ margin: '0 0 25px', fontSize: '1.2em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
           <ShieldCheck size={20} color="#3b82f6" /> Active Rules
         </h3>
         <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
           {activeRules.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.9em' }}>No active rules defined.</p>}
           {activeRules.map(rule => {
             const isEditing = editingRuleId === rule.id;
             return (
               <div key={rule.id} style={{ 
                 display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                 padding: '15px 20px', background: rule.is_active ? '#f8fafc' : '#f1f5f9', 
                 borderRadius: '16px', border: '1px solid #f1f5f9', opacity: rule.is_active ? 1 : 0.6
               }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {isEditing ? (
                      <>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '5px' }}>
                          <select 
                            value={editType}
                            onChange={e => setEditType(e.target.value)}
                            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                          >
                            <option value="validation">Validation</option>
                            <option value="categorization">Categorization</option>
                          </select>
                          <input 
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}
                          />
                        </div>
                        <input 
                          value={editPattern}
                          onChange={(e) => setEditPattern(e.target.value)}
                          style={{ padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9em' }}
                        />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {editType === 'validation' ? (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1 }}>
                                    <span style={{ fontSize: '0.8em', color: '#64748b' }}>Exp:</span>
                                    <input 
                                      type="number"
                                      value={editExpectedAmount}
                                      onChange={(e) => setEditExpectedAmount(e.target.value)}
                                      style={{ flex: 1, padding: '5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8em' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1 }}>
                                    <span style={{ fontSize: '0.8em', color: '#64748b' }}>Marg:</span>
                                    <input 
                                      type="number"
                                      value={editAmountMargin}
                                      onChange={(e) => setEditAmountMargin(e.target.value)}
                                      style={{ flex: 1, padding: '5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8em' }}
                                    />
                                </div>
                              </>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 1 }}>
                                    <span style={{ fontSize: '0.8em', color: '#64748b' }}>Cat:</span>
                                    <select 
                                      value={editCategory}
                                      onChange={(e) => setEditCategory(e.target.value)}
                                      style={{ flex: 1, padding: '5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8em', background: '#fff' }}
                                    >
                                      <option value="">Select a category...</option>
                                      {categories?.map(c => (
                                        <option key={c.name} value={c.name}>{c.name}</option>
                                      ))}
                                    </select>
                                </div>
                            )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.7em', padding: '2px 6px', borderRadius: '6px', background: rule.type === 'categorization' ? '#fce7f3' : '#e0e7ff', color: rule.type === 'categorization' ? '#be185d' : '#4338ca', fontWeight: 'bold', textTransform: 'uppercase' }}>
                            {rule.type || 'validation'}
                          </span>
                          <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{rule.name}</span>
                        </div>
                        <div style={{ fontSize: '0.9em', color: '#64748b' }}>{rule.pattern}</div>
                        {rule.type === 'validation' && rule.expected_amount !== null && (
                          <div style={{ fontSize: '0.8em', color: '#3b82f6', fontWeight: 'bold' }}>
                            Expected: {rule.expected_amount} (± {rule.amount_margin || 0})
                          </div>
                        )}
                        {rule.type === 'categorization' && rule.category && (
                          <div style={{ fontSize: '0.8em', color: '#10b981', fontWeight: 'bold' }}>
                            Assigns Category: {rule.category}
                          </div>
                        )}
                      </>
                    )}
                  </div>
<div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '15px' }}>
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
                           padding: '8px 16px', background: rule.is_active ? '#ef4444' : '#10b981', 
                           color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.8em', fontWeight: 'bold', cursor: 'pointer' 
                         }}
                       >
                         {rule.is_active ? 'Disable' : 'Enable'}
                       </button>
                       <button 
                         onClick={() => handleDeleteRule(rule.id)}
                         style={{ background: '#fee2e2', color: '#ef4444', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
    </div>
  );
}
