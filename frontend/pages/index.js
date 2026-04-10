import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../components/AppLayout';
import DashboardView from '../components/DashboardView';
import UploadView from '../components/UploadView';
import SettingsView from '../components/SettingsView';
import RulesView from '../components/RulesView';
import JobsView from '../components/JobsView';
import { useFinanceData } from '../hooks/useFinanceData';
import { useSettings } from '../hooks/useSettings';
import { api } from '../services/api';

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  const [activeTab, setActiveTab] = useState('overview');
  const [file, setFile] = useState(null);
  const [balFile, setBalFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [rules, setRules] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [workers, setWorkers] = useState([]);

  useEffect(() => {
    checkSetup();
    const token = localStorage.getItem('auth_token');
    if (token) {
      setIsLoggedIn(true);
    }
  }, []);

  const checkSetup = async () => {
    try {
      const res = await fetch('/api/auth/setup-status');
      const data = await res.json();
      setNeedsSetup(data.needsSetup);
    } catch (err) {
      console.error('Failed to check setup status:', err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const endpoint = needsSetup ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      
      if (res.ok) {
        if (needsSetup) {
          // If we just registered the first user, log them in automatically
          const loginRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          });
          const loginDataRes = await loginRes.json();
          if (loginRes.ok) {
            localStorage.setItem('auth_token', loginDataRes.token);
            setIsLoggedIn(true);
            setNeedsSetup(false);
            refreshData();
          }
        } else {
          localStorage.setItem('auth_token', data.token);
          setIsLoggedIn(true);
          refreshData();
        }
      } else {
        setLoginError(data.error || 'Operation failed');
      }
    } catch (err) {
      setLoginError('Could not connect to authentication server');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setIsLoggedIn(false);
  };

  const {
    summary,
    transactions,
    trend,
    loading,
    fetchSummary,
    fetchTransactions,
    fetchTrend,
    refreshAll,
    totalAssets
  } = useFinanceData();

  const {
    settings,
    aiConfig,
    pontoConfig,
    fetchSettings,
    updateAccountName,
    deleteAccount,
    saveCategories,
    saveAIConfig,
    savePontoConfig,
    syncPontoAccounts,
    updatePontoAccountStatus
  } = useSettings();

  const fetchRules = async () => {
    try {
      const data = await api.get('/rules');
      setRules(data);
    } catch (err) {
      console.error('Error fetching rules:', err);
    }
  };

  const fetchJobs = async () => {
    try {
      const data = await api.get('/jobs');
      setJobs(data);
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  };

  const fetchWorkers = async () => {
    try {
      const data = await api.get('/workers');
      setWorkers(data);
    } catch (err) {
      console.error('Error fetching workers:', err);
    }
  };

  const refreshData = async () => {
    if (loading) return;
    try {
      await Promise.all([
        refreshAll(),
        fetchSettings(),
        fetchRules(),
        fetchJobs(),
        fetchWorkers()
      ]);
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    switch (activeTab) {
      case 'overview':
        fetchSummary();
        fetchTransactions();
        fetchTrend();
        break;
      case 'rules':
        fetchRules();
        break;
      case 'jobs':
        fetchJobs();
        fetchWorkers();
        break;
      case 'settings':
        fetchSettings();
        break;
    }
  }, [activeTab]);

  useEffect(() => {
    let interval;
    if (activeTab === 'jobs') {
      interval = setInterval(() => {
        fetchJobs();
        fetchWorkers();
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [activeTab]);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleBalFileChange = (e) => {
    setBalFile(e.target.files[0]);
  };

  const handleUpload = async (formData) => {
    setUploading(true);
    setMessage('');

    try {
      const data = await api.upload('/upload', formData);
      setMessage(data.message || 'Upload successful');
      setFile(null);
      setBalFile(null);
      refreshData();
      return data;
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAccount = async (accountName) => {
    if (confirm(`Are you sure you want to delete all transactions for ${accountName}?`)) {
      await deleteAccount(accountName);
      refreshData();
    }
  };

  const handleSaveAccountName = async (oldName, newName) => {
    await updateAccountName(oldName, newName);
    refreshData();
  };

  if (!isLoggedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8fafc' }}>
        <form onSubmit={handleLogin} style={{ background: '#fff', padding: '40px', borderRadius: '24px', border: '1px solid #e2e8f0', width: '100%', maxWidth: '400px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
          <h2 style={{ margin: '0 0 10px', textAlign: 'center' }}>{needsSetup ? 'Set Password' : 'Core Finance'}</h2>
          {needsSetup && <p style={{ color: '#64748b', fontSize: '0.9em', textAlign: 'center', marginBottom: '20px' }}>Create a password to secure your finance data.</p>}
          {loginError && <p style={{ color: '#ef4444', marginBottom: '20px', fontSize: '0.9em', textAlign: 'center' }}>{loginError}</p>}
          <div style={{ marginBottom: '25px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em', fontWeight: '600' }}>Password</label>
            <input 
              type="password" 
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}
            />
          </div>
          <button type="submit" style={{ width: '100%', padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            {needsSetup ? 'Enable Security' : 'Unlock'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <AppLayout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      totalAssets={totalAssets}
      accountCount={summary.length}
      loading={loading}
      onRefresh={refreshData}
      onLogout={handleLogout}
    >
      {activeTab === 'overview' && (
        <DashboardView 
          summary={summary} 
          trend={trend} 
          transactions={transactions} 
          fetchTransactions={fetchTransactions}
          loading={loading}
        />
      )}
      
      {activeTab === 'upload' && (
        <UploadView
          file={file}
          balFile={balFile}
          uploading={uploading}
          message={message}
          onFileChange={handleFileChange}
          onBalFileChange={handleBalFileChange}
          onUpload={async (formData, refreshOnly) => {
            if (refreshOnly) {
               refreshData();
               return;
            }
            return handleUpload(formData);
          }}
          accounts={settings.account_names || []}
        />
      )}

      {activeTab === 'rules' && (
        <RulesView 
          rules={rules}
          categories={settings.categories || []}
          onAddRule={async (name, pattern, expected_amount, amount_margin, type, category) => {
            await api.post('/rules', { name, pattern, expected_amount, amount_margin, type, category });
            fetchRules();
          }}
          onUpdateRuleStatus={async (id, is_active, is_proposed, name, pattern, expected_amount, amount_margin, type, category) => {
            await api.put(`/rules/${id}`, { is_active, is_proposed, name, pattern, expected_amount, amount_margin, type, category });
            fetchRules();
          }}
          onDeleteRule={async (id) => {
            await api.delete(`/rules/${id}`);
            fetchRules();
          }}
          onImportRules={async (rules) => {
            await api.post('/rules/import', rules);
            fetchRules();
          }}
        />
      )}

      {activeTab === 'jobs' && (
        <JobsView jobs={jobs} workers={workers} onRefresh={() => { fetchJobs(); fetchWorkers(); }} />
      )}

      {activeTab === 'settings' && (
        <SettingsView 
          summary={summary} 
          accountNames={settings.account_names}
          categories={settings.categories || []}
          onSaveAccountName={handleSaveAccountName} 
          onSaveCategories={async (categories) => {
            await api.post('/settings/categories', categories);
            fetchSettings();
          }}
          aiConfig={aiConfig}
          onSaveAIConfig={async (config) => {
            await api.post('/settings/ai_config', config);
            fetchSettings();
          }}
          onDeleteAccount={handleDeleteAccount}
          pontoConfig={pontoConfig}
          onSavePontoConfig={async (config) => {
            await api.post('/settings/ponto_config', config);
            fetchSettings();
          }}
          onSyncPontoAccounts={async () => {
            await api.post('/settings/ponto_sync_accounts', {});
            fetchSettings();
          }}
          onUpdatePontoAccountStatus={async (pontoId, isActive) => {
            await api.post('/settings/ponto_account_status', { pontoId, isActive });
            fetchSettings();
          }}
        />
      )}
    </AppLayout>
  );
}
