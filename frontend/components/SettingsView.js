import React, { useState, useEffect } from 'react';
import { 
  CreditCard, Edit2, Check, X, Sparkles, Save, Trash2, Plus, RefreshCw,
  CheckCircle, AlertCircle
} from 'lucide-react';
import CategoryBadge from './CategoryBadge';
import { api } from '../services/api';
import CategoryManagementSettings from './CategoryManagementSettings';

export default function SettingsView({
  summary, accountNames = [], categories = [],
  onSaveAccountName, onSaveCategories,
  aiConfig, onSaveAIConfig,
  onDeleteAccount,
  pontoConfig, onSavePontoConfig, onSyncPontoAccounts, onUpdatePontoAccountStatus
}) {
  const [editingAccount, setEditingAccount] = useState(null);
  const [newAccountName, setNewAccountName] = useState('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [addAccountData, setAddAccountData] = useState({ id: '', name: '', ai: false });

  const [pushStatus, setPushStatus] = useState('Checking...');

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/sw.js').then(registration => {
        return registration.pushManager.getSubscription();
      }).then(subscription => {
        if (subscription) {
          setPushStatus('Subscribed');
        } else {
          setPushStatus('Not Subscribed');
        }
      }).catch(err => {
        console.error('Service Worker or Push Manager error:', err);
        setPushStatus('Error: ' + err.message);
      });
    } else {
      setPushStatus('Not Supported');
    }
  }, []);

  const subscribeToPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported in this browser.');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      
      console.log('Fetching VAPID public key...');
      const response = await api.get('/notifications/vapid-public-key');
      console.log('Got VAPID response:', response);
      const vapidPublicKey = response.publicKey;
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      await api.post('/notifications/subscribe', subscription);
      setPushStatus('Subscribed');
      alert('Successfully subscribed to push notifications!');
    } catch (err) {
      console.error('Error subscribing to push:', err);
      if (Notification.permission === 'denied') {
        alert('You have blocked notifications for this site. Please enable them in your browser settings.');
      } else {
        alert('Failed to subscribe: ' + err.message);
      }
    }
  };

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const [localAIConfig, setLocalAIConfig] = useState({
    enabled: false,
    apiKey: '',
    model: 'gemini-2.0-flash',
    grounding: false,
    unenrichedCount: 0
  });

  const [availableModels, setAvailableModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentResult, setEnrichmentResult] = useState(null);
  const [notification, setNotification] = useState(null);

  const [localPontoConfig, setLocalPontoConfig] = useState({
    clientId: '',
    clientSecret: '',
    maxTransactions: 500,
    isConnected: false,
    accounts: []
  });

  const [isSyncingAccounts, setIsSyncingAccounts] = useState(false);
  const [isSyncingTransactions, setIsSyncingTransactions] = useState(false);

  useEffect(() => {
    if (aiConfig) {
      const { availableModels: cachedModels, ...config } = aiConfig;
      setLocalAIConfig(prev => ({ ...prev, ...config }));
      if (cachedModels) {
        setAvailableModels(cachedModels);
      }
    }
  }, [aiConfig]);

  useEffect(() => {
    if (pontoConfig) {
      setLocalPontoConfig(pontoConfig);
    }
  }, [pontoConfig]);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const fetchModels = async () => {
    if (!localAIConfig.apiKey) return;
    setLoadingModels(true);
    try {
      const models = await api.post('/settings/ai_models', { apiKey: localAIConfig.apiKey });
      setAvailableModels(models);
      showNotification(`Successfully fetched ${models.length} models`);
    } catch (err) {
      console.error('Failed to fetch models:', err);
      showNotification(err.message || 'Failed to fetch models', 'error');
    } finally {
      setLoadingModels(false);
    }
  };

  const triggerEnrichment = async () => {
    setIsEnriching(true);
    setEnrichmentResult(null);
    try {
      const data = await api.post('/settings/trigger-ai-enrichment', {});
      setEnrichmentResult(data);
      showNotification(data.message || 'AI enrichment job started');
    } catch (err) {
      console.error('Failed to trigger AI enrichment:', err);
      setEnrichmentResult({ error: 'Failed to trigger AI enrichment' });
      showNotification(err.message || 'Failed to trigger AI enrichment', 'error');
    } finally {
      setIsEnriching(false);
    }
  };

  const triggerManualSync = async () => {
    setIsSyncingTransactions(true);
    try {
      const data = await api.post('/integrations/ponto/sync', {});
      showNotification(`Manual sync started! (Job ID: ${data.jobId})`);
    } catch (err) {
      showNotification(err.message || 'Failed to start sync', 'error');
    } finally {
      setIsSyncingTransactions(false);
    }
  };

  const handleSaveAIConfig = async () => {
    try {
      await onSaveAIConfig(localAIConfig);
      showNotification('AI Configuration saved successfully');
    } catch (err) {
      showNotification('Failed to save AI Configuration', 'error');
    }
  };

  const handleSaveAccount = async (id, name, ai) => {
    try {
      await onSaveAccountName(id, name, ai);
      showNotification(`Account ${name} updated successfully`);
    } catch (err) {
      showNotification('Failed to update account', 'error');
    }
  };

  const handleDeleteAccountConfirm = async (account) => {
    try {
      await onDeleteAccount(account);
      showNotification('Account deleted successfully');
    } catch (err) {
      // onDeleteAccount might have its own confirm and return early, 
      // but if it actually deletes and fails, we show this.
    }
  };

  const handleSavePontoConfig = async () => {
    try {
      await onSavePontoConfig({
        clientId: localPontoConfig.clientId,
        clientSecret: localPontoConfig.clientSecret,
        maxTransactions: localPontoConfig.maxTransactions
      });
      showNotification('Ponto Configuration saved and authenticated!');
    } catch (err) {
      showNotification(err.message || 'Failed to save Ponto Configuration', 'error');
    }
  };

  const handleSyncPontoAccounts = async () => {
    setIsSyncingAccounts(true);
    try {
      await onSyncPontoAccounts();
      showNotification('Ponto accounts synchronized successfully');
    } catch (err) {
      showNotification(err.message || 'Failed to sync Ponto accounts', 'error');
    } finally {
      setIsSyncingAccounts(false);
    }
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

      {/* Ponto Integration Section */}
      <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
         <h3 style={{ margin: '0 0 25px', fontSize: '1.2em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
           <CreditCard size={20} color="#0284c7" /> Ponto API Integration
         </h3>
         
         <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <p style={{ color: '#64748b', fontSize: '0.9em', margin: 0 }}>
              Configure your Ponto credentials to automate bank synchronization. Get your credentials from the <a href="https://developer.myponto.com" target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', textDecoration: 'underline' }}>Ponto Developer Portal</a>.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#64748b' }}>Client ID</label>
                <input
                  type="text"
                  value={localPontoConfig.clientId}
                  onChange={(e) => setLocalPontoConfig({ ...localPontoConfig, clientId: e.target.value })}
                  placeholder="Enter Ponto Client ID"
                  style={{ padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#64748b' }}>Client Secret</label>
                <input
                  type="password"
                  value={localPontoConfig.clientSecret}
                  onChange={(e) => setLocalPontoConfig({ ...localPontoConfig, clientSecret: e.target.value })}
                  placeholder="Enter Ponto Client Secret"
                  style={{ padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#64748b' }}>Max transactions per Sync</label>
                <input
                  type="number"
                  value={localPontoConfig.maxTransactions}
                  onChange={(e) => setLocalPontoConfig({ ...localPontoConfig, maxTransactions: parseInt(e.target.value) || 0 })}
                  placeholder="e.g. 500"
                  style={{ padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleSavePontoConfig}
                style={{
                  padding: '10px 20px', background: '#0284c7', color: '#fff',
                  border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                <Save size={18} /> Save Credentials
              </button>

            </div>

            {localPontoConfig.isConnected && (
              <div style={{ marginTop: '10px', padding: '20px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h4 style={{ margin: 0, fontSize: '1em', fontWeight: 'bold' }}>Connected Accounts</h4>
                  <button
                    onClick={handleSyncPontoAccounts}
                    disabled={isSyncingAccounts}
                    style={{
                      padding: '6px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px',
                      fontSize: '0.85em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                    }}
                  >
                    <RefreshCw size={14} className={isSyncingAccounts ? 'animate-spin' : ''} />
                    Sync Accounts
                  </button>
                </div>

                {localPontoConfig.accounts && localPontoConfig.accounts.length > 0 && (
                  <div style={{ marginBottom: '20px', padding: '15px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9em' }}>Manual Transaction Sync</div>
                        <div style={{ fontSize: '0.75em', color: '#64748b' }}>Trigger an immediate synchronization of all active accounts.</div>
                      </div>
                      <button
                        onClick={triggerManualSync}
                        disabled={isSyncingTransactions}
                        style={{
                          padding: '8px 16px', background: isSyncingTransactions ? '#cbd5e1' : '#3b82f6', color: '#fff',
                          border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: isSyncingTransactions ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85em'
                        }}
                      >
                        <RefreshCw size={14} className={isSyncingTransactions ? 'animate-spin' : ''} />
                        {isSyncingTransactions ? 'Syncing...' : 'Sync Now'}
                      </button>
                    </div>
                  </div>
                )}

                {localPontoConfig.accounts && localPontoConfig.accounts.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {localPontoConfig.accounts.map(acc => (
                      <div key={acc.ponto_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: '10px', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '0.9em' }}>{acc.name}</div>
                          <div style={{ fontSize: '0.75em', color: '#64748b' }}>{acc.account_id} ({acc.institution_name})</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                           <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                             <input
                               type="checkbox"
                               checked={acc.is_active}
                               onChange={(e) => onUpdatePontoAccountStatus(acc.ponto_id, e.target.checked)}
                             />
                             <span style={{ fontSize: '0.75em', padding: '2px 8px', borderRadius: '10px', background: acc.is_active ? '#dcfce7' : '#fee2e2', color: acc.is_active ? '#166534' : '#991b1b' }}>
                               {acc.is_active ? 'Sync Enabled' : 'Sync Disabled'}
                             </span>
                           </label>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.85em', color: '#64748b', textAlign: 'center' }}>No accounts connected yet. Try Reconnecting.</p>
                )}
              </div>
            )}
         </div>
      </div>

      {/* AI Config Section */}
      <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
         <h3 style={{ margin: '0 0 25px', fontSize: '1.2em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
           <Sparkles size={20} color="#8b5cf6" /> Google AI Studio Configuration
         </h3>
         
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="checkbox" 
                  id="ai-enabled"
                  checked={localAIConfig.enabled}
                  onChange={(e) => setLocalAIConfig({ ...localAIConfig, enabled: e.target.checked })}
                />
                <label htmlFor="ai-enabled" style={{ fontWeight: 'bold', color: '#1e293b' }}>Enable AI Processing (Global Toggle)</label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="checkbox" 
                  id="ai-grounding"
                  checked={localAIConfig.grounding}
                  onChange={(e) => setLocalAIConfig({ ...localAIConfig, grounding: e.target.checked })}
                />
                <label htmlFor="ai-grounding" style={{ fontWeight: 'bold', color: '#1e293b' }}>Google Search Grounding</label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#64748b' }}>AI Studio API Key</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input 
                    type="password"
                    value={localAIConfig.apiKey}
                    onChange={(e) => setLocalAIConfig({ ...localAIConfig, apiKey: e.target.value })}
                    placeholder="Enter your Gemini API Key"
                    style={{ flex: 1, padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none' }}
                  />
                  <button 
                    onClick={fetchModels}
                    disabled={!localAIConfig.apiKey || loadingModels}
                    style={{ 
                      padding: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '12px', 
                      cursor: localAIConfig.apiKey ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '5px'
                    }}
                  >
                    <RefreshCw size={16} className={loadingModels ? 'animate-spin' : ''} />
                    {loadingModels ? '...' : 'Fetch Models'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#64748b' }}>Model</label>
                <select 
                  value={localAIConfig.model}
                  onChange={(e) => setLocalAIConfig({ ...localAIConfig, model: e.target.value })}
                  style={{ padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', background: '#fff' }}
                >
                  {availableModels.length > 0 ? (
                    availableModels.map(m => (
                      <option key={m.name} value={m.name}>{m.displayName || m.name}</option>
                    ))
                  ) : (
                    <option value={localAIConfig.model}>{localAIConfig.model}</option>
                  )}
                </select>
              </div>
            </div>

            <button 
              onClick={handleSaveAIConfig}
              style={{ 
                alignSelf: 'flex-start', padding: '10px 20px', background: '#8b5cf6', color: '#fff', 
                border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', 
                display: 'flex', alignItems: 'center', gap: '8px' 
              }}
            >
              <Save size={18} /> Save AI Configuration
            </button>
         </div>
      </div>

      {/* Manual AI Enrichment Section */}
      <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
         <h3 style={{ margin: '0 0 25px', fontSize: '1.2em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
           <Sparkles size={20} color="#8b5cf6" /> Batch AI Enrichment
         </h3>
         <p style={{ color: '#64748b', fontSize: '0.9em', marginBottom: '20px' }}>
           Manually trigger AI enrichment for all transactions that have not been processed yet. 
           This will only process transactions from accounts where AI is enabled.
         </p>

         {localAIConfig.unenrichedCount > 0 && (
           <div style={{ marginBottom: '20px', padding: '12px 20px', background: '#f5f3ff', borderRadius: '12px', border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', gap: '10px' }}>
             <Sparkles size={18} color="#7c3aed" />
             <span style={{ fontSize: '0.95em', color: '#5b21b6', fontWeight: '600' }}>
               There are {localAIConfig.unenrichedCount} transactions waiting to be enriched.
             </span>
           </div>
         )}
         
         <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <button 
              onClick={triggerEnrichment}
              disabled={isEnriching || !localAIConfig.enabled}
              style={{ 
                alignSelf: 'flex-start', padding: '10px 20px', background: isEnriching ? '#cbd5e1' : '#8b5cf6', color: '#fff', 
                border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: isEnriching || !localAIConfig.enabled ? 'not-allowed' : 'pointer', 
                display: 'flex', alignItems: 'center', gap: '8px' 
              }}
            >
              <RefreshCw size={18} className={isEnriching ? 'animate-spin' : ''} />
              {isEnriching ? 'Triggering Job...' : 'Enrich Unprocessed Transactions'}
            </button>

            {enrichmentResult && (
              <div style={{ 
                padding: '15px', 
                borderRadius: '12px', 
                background: enrichmentResult.error ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${enrichmentResult.error ? '#fecaca' : '#bbf7d0'}`,
                color: enrichmentResult.error ? '#b91c1c' : '#15803d',
                fontSize: '0.9em'
              }}>
                {enrichmentResult.error ? enrichmentResult.error : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Check size={18} /> Success! {enrichmentResult.message}
                    </div>
                    {enrichmentResult.count !== undefined && (
                      <p style={{ margin: 0, opacity: 0.9 }}>
                        Found <strong>{enrichmentResult.count}</strong> transactions to process.
                      </p>
                    )}
                    {enrichmentResult.categories && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '5px' }}>
                        {Object.entries(enrichmentResult.categories).map(([cat, count]) => (
                          <CategoryBadge key={cat} category={cat} count={count} />
                        ))}
                      </div>
                    )}
                    {enrichmentResult.jobId && (
                      <p style={{ margin: '5px 0 0', fontSize: '0.8em', opacity: 0.7 }}>
                        Job ID: {enrichmentResult.jobId}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
         </div>
      </div>

      {/* Category Management Section */}
      <CategoryManagementSettings
        categories={categories}
        onSaveCategories={onSaveCategories}
        showNotification={showNotification}
      />

      {/* Push Notifications Section */}
      <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
              Push Notifications
            </h3>
         </div>
         <p style={{ color: '#64748b', marginBottom: '20px' }}>
           Get notified on your phone or desktop when deviations are found in the daily Ponto sync.
         </p>
         <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button
              onClick={subscribeToPush}
              disabled={pushStatus === 'Subscribed' || pushStatus === 'Not Supported'}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                fontWeight: 'bold',
                border: 'none',
                cursor: pushStatus === 'Subscribed' || pushStatus === 'Not Supported' ? 'not-allowed' : 'pointer',
                background: pushStatus === 'Subscribed' ? '#22c55e' : pushStatus === 'Not Supported' ? '#94a3b8' : '#3b82f6',
                color: '#fff'
              }}
            >
              {pushStatus === 'Subscribed' ? 'Subscribed' : 'Enable Notifications'}
            </button>
            <span style={{ fontSize: '0.9em', color: '#64748b', fontWeight: 'bold' }}>
              Status: {pushStatus}
            </span>
         </div>
      </div>

      {/* Account Management Section */}
      <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CreditCard size={20} color="#3b82f6" /> My Accounts & AI Toggles
            </h3>
            <button 
              onClick={() => setIsAddingAccount(true)}
              style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Plus size={16} /> Add Custom Account
            </button>
         </div>

         {isAddingAccount && (
           <div style={{ marginBottom: '20px', padding: '20px', background: '#eff6ff', borderRadius: '16px', border: '1px solid #bfdbfe' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '0.75em', fontWeight: 'bold', color: '#3b82f6' }}>Account ID (as per CSV)</label>
                  <input 
                    placeholder="e.g. NL00BANK..."
                    value={addAccountData.id}
                    onChange={e => setAddAccountData({...addAccountData, id: e.target.value})}
                    style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #bfdbfe' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '0.75em', fontWeight: 'bold', color: '#3b82f6' }}>Display Name</label>
                  <input 
                    placeholder="e.g. Main Checking"
                    value={addAccountData.name}
                    onChange={e => setAddAccountData({...addAccountData, name: e.target.value})}
                    style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #bfdbfe' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '40px' }}>
                  <input 
                    type="checkbox" 
                    id="new-ai"
                    checked={addAccountData.ai}
                    onChange={e => setAddAccountData({...addAccountData, ai: e.target.checked})}
                  />
                  <label htmlFor="new-ai" style={{ fontSize: '0.85em', fontWeight: 'bold' }}>Enable AI</label>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => {
                      handleSaveAccount(addAccountData.id, addAccountData.name, addAccountData.ai);
                      setIsAddingAccount(false);
                      setAddAccountData({ id: '', name: '', ai: false });
                    }}
                    style={{ padding: '10px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Create
                  </button>
                  <button 
                    onClick={() => setIsAddingAccount(false)}
                    style={{ padding: '10px 20px', background: '#64748b', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
           </div>
         )}

         <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {/* List of accounts from accountNames (the sole source) */}
            {accountNames.map((acc, idx) => {
              const summaryAcc = summary.find(s => s.account === acc.account);
              const displayBalance = summaryAcc ? summaryAcc.balance : 0;
              return (
                <div key={idx} style={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                  padding: '15px 20px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.75em', fontWeight: 'bold', color: '#94a3b8', fontFamily: 'monospace' }}>{acc.account}</span>
                        {acc.ai_enabled && <span style={{ fontSize: '0.65em', background: '#f5f3ff', color: '#7c3aed', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>AI POWERED</span>}
                        <span style={{ fontSize: '0.65em', background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                           {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(displayBalance)}
                        </span>
                     </div>
                    {editingAccount === acc.account ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                        <input 
                          autoFocus
                          value={newAccountName}
                          onChange={(e) => setNewAccountName(e.target.value)}
                          style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #3b82f6', outline: 'none' }}
                        />
                        <button onClick={() => {
                           handleSaveAccount(acc.account, newAccountName, acc.ai_enabled);
                           setEditingAccount(null);
                        }} style={{ color: '#22c55e', background: 'none', border: 'none', cursor: 'pointer' }}><Check size={18} /></button>
                        <button onClick={() => setEditingAccount(null)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#1e293b' }}>{acc.display_name}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                   <button 
                     onClick={() => {
                       handleSaveAccount(acc.account, acc.display_name, !acc.ai_enabled);
                     }}
                     style={{ 
                       padding: '8px 16px', borderRadius: '12px', border: '1px solid #e2e8f0',
                       background: acc.ai_enabled ? '#8b5cf6' : '#fff', color: acc.ai_enabled ? '#fff' : '#64748b',
                       fontSize: '0.75em', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s',
                       minWidth: '100px'
                     }}
                   >
                     {acc.ai_enabled ? 'Disable AI' : 'Enable AI'}
                   </button>
                   <button 
                       onClick={() => {
                         setEditingAccount(acc.account);
                         setNewAccountName(acc.display_name);
                       }}
                       style={{ background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '10px', color: '#64748b', cursor: 'pointer' }}
                     >
                       <Edit2 size={14} />
                     </button>
                     <button 
                       onClick={() => handleDeleteAccountConfirm(acc.account)}
                       style={{ background: '#fef2f2', border: 'none', padding: '8px', borderRadius: '10px', color: '#ef4444', cursor: 'pointer' }}
                     >
                       <Trash2 size={14} />
                     </button>
                  </div>
                </div>
              );
            })}
         </div>
      </div>
      {/* Data Maintenance Section */}
      <div style={{ background: '#fff', padding: '30px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
         <h3 style={{ margin: '0 0 10px', fontSize: '1.2em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px' }}>
           <RefreshCw size={20} color="#3b82f6" /> Data Maintenance
         </h3>
         <p style={{ color: '#64748b', fontSize: '0.9em', marginBottom: '20px' }}>
           Re-categorize all transactions and re-detect subscriptions across your entire history using the latest rules and AI models. This process runs in the background and may take several minutes.
         </p>
         <button
            onClick={async () => {
              if (!confirm('This will re-process your entire transaction history. Are you sure?')) return;
              try {
                await api.post('/jobs/audit', {});
                showNotification('System re-analysis job started. Check Background Jobs page.', 'success');
              } catch (e) {
                showNotification('Failed to start analysis: ' + e.message, 'error');
              }
            }}
            style={{ padding: '12px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={18} /> Run Full System Re-Analysis
          </button>
      </div>
    </div>
  );
}
