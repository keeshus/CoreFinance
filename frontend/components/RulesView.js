import React, { useState } from 'react';
import { ShieldCheck, Plus, Check, X, AlertTriangle, Zap } from 'lucide-react';

export default function RulesView({ rules, onAddRule, onUpdateRuleStatus }) {
  const [newRuleName, setNewRuleName] = useState('');
  const [newRulePattern, setNewRulePattern] = useState('');

  const activeRules = rules.filter(r => !r.is_proposed);
  const proposedRules = rules.filter(r => r.is_proposed);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      {/* Add New Rule */}
      <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
         <h3 style={{ margin: '0 0 25px', fontSize: '1.2em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
           <Plus size={20} color="#10b981" /> Create Natural Language Rule
         </h3>
         <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
            <input 
              placeholder="Rule Name (e.g. Car Insurance)"
              value={newRuleName}
              onChange={(e) => setNewRuleName(e.target.value)}
              style={{ flex: 1, minWidth: '200px', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
            />
            <input 
              placeholder="Description (e.g. Must be paid to Company X)"
              value={newRulePattern}
              onChange={(e) => setNewRulePattern(e.target.value)}
              style={{ flex: 2, minWidth: '300px', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
            />
            <button 
              onClick={() => {
                onAddRule(newRuleName, newRulePattern);
                setNewRuleName('');
                setNewRulePattern('');
              }}
              style={{ 
                padding: '12px 25px', background: '#10b981', color: '#fff', border: 'none', 
                borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' 
              }}
            >
              Add Rule
            </button>
         </div>
      </div>

      {/* Active Rules List */}
      <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
         <h3 style={{ margin: '0 0 25px', fontSize: '1.2em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
           <ShieldCheck size={20} color="#3b82f6" /> Active Rules
         </h3>
         <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
           {activeRules.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.9em' }}>No active rules defined.</p>}
           {activeRules.map(rule => (
             <div key={rule.id} style={{ 
               display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
               padding: '15px 20px', background: rule.is_active ? '#f8fafc' : '#f1f5f9', 
               borderRadius: '16px', border: '1px solid #f1f5f9', opacity: rule.is_active ? 1 : 0.6
             }}>
               <div>
                 <div style={{ fontWeight: 'bold', color: '#1e293b' }}>{rule.name}</div>
                 <div style={{ fontSize: '0.9em', color: '#64748b' }}>{rule.pattern}</div>
               </div>
               <button 
                 onClick={() => onUpdateRuleStatus(rule.id, !rule.is_active, false)}
                 style={{ 
                   padding: '8px 16px', background: rule.is_active ? '#ef4444' : '#10b981', 
                   color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.8em', fontWeight: 'bold', cursor: 'pointer' 
                 }}
               >
                 {rule.is_active ? 'Disable' : 'Enable'}
               </button>
             </div>
           ))}
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
                   {rule.name} <span style={{ fontSize: '0.7em', padding: '2px 8px', background: '#fef9c3', color: '#854d0e', borderRadius: '10px' }}>NEW</span>
                 </div>
                 <div style={{ fontSize: '0.9em', color: '#64748b' }}>{rule.pattern}</div>
               </div>
               <div style={{ display: 'flex', gap: '10px' }}>
                 <button 
                   onClick={() => onUpdateRuleStatus(rule.id, true, false)}
                   style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}
                 >
                   <Check size={18} />
                 </button>
                 <button 
                   onClick={() => onUpdateRuleStatus(rule.id, false, false)}
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
