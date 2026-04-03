import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../components/AppLayout';
import DashboardView from '../components/DashboardView';
import UploadView from '../components/UploadView';
import SettingsView from '../components/SettingsView';
import RulesView from '../components/RulesView';
import JobsView from '../components/JobsView';

export default function Home() {
  const [activeTab, setActiveTab] = useState('overview');
  const [file, setFile] = useState(null);
  const [balFile, setBalFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState([]);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [aiConfig, setAIConfig] = useState(null);
  const [, setSettings] = useState({ own_accounts: [], account_names: [] });

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/transactions/summary');
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  };

  const fetchTransactions = useCallback(async (filters = {}) => {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value);
      });
      const res = await fetch(`/api/transactions?${queryParams.toString()}`);
      const data = await res.json();
      setTransactions(data);
    } catch (err) {
      console.error('Error fetching transactions:', err);
    }
  }, []);

  const fetchTrend = async () => {
    try {
      const res = await fetch('/api/transactions/trend');
      const data = await res.json();
      setTrend(data.map(item => ({
        ...item,
        balance: parseFloat(item.balance)
      })));
    } catch (err) {
      console.error('Error fetching trend:', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
      
      const aiRes = await fetch('/api/settings/ai_config');
      if (aiRes.ok) {
        setAIConfig(await aiRes.json());
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/rules');
      const data = await res.json();
      setRules(data);
    } catch (err) {
      console.error('Error fetching rules:', err);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      setJobs(data);
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  };

  const fetchWorkers = async () => {
    try {
      const res = await fetch('/api/workers');
      const data = await res.json();
      setWorkers(data);
    } catch (err) {
      console.error('Error fetching workers:', err);
    }
  };

  const refreshData = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await Promise.all([
        fetchSummary(), 
        fetchTransactions(), 
        fetchTrend(), 
        fetchSettings(), 
        fetchRules(), 
        fetchJobs(), 
        fetchWorkers()
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

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
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        setFile(null);
        setBalFile(null);
        refreshData();
        return data; // Return data so UploadView can handle background jobs
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setMessage('Error uploading file');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveAccountName = async (account, name, ai_enabled = false) => {
    try {
      const res = await fetch('/api/settings/account-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, display_name: name, ai_enabled }),
      });
      if (res.ok) {
        refreshData();
      }
    } catch (err) {
      console.error('Error updating account name:', err);
    }
  };

  const handleDeleteAccount = async (account) => {
    if (!confirm(`Are you sure you want to delete account ${account}?`)) return;
    try {
      const res = await fetch(`/api/settings/account/${account}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        refreshData();
      }
    } catch (err) {
      console.error('Error deleting account:', err);
    }
  };

  const totalAssets = summary.reduce((acc, curr) => acc + parseFloat(curr.balance), 0);

  return (
    <AppLayout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      totalAssets={totalAssets}
      accountCount={summary.length}
      loading={loading}
      onRefresh={refreshData}
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
          onUpload={handleUpload} 
          accounts={summary}
        />
      )}

      {activeTab === 'rules' && (
        <RulesView 
          rules={rules}
          onAddRule={async (name, pattern) => {
            await fetch('/api/rules', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, pattern })
            });
            fetchRules();
          }}
          onUpdateRuleStatus={async (id, is_active, is_proposed) => {
            await fetch(`/api/rules/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ is_active, is_proposed })
            });
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
          onSaveAccountName={handleSaveAccountName}
          aiConfig={aiConfig}
          onSaveAIConfig={async (config) => {
            await fetch('/api/settings/ai_config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(config)
            });
            fetchSettings();
          }}
          onDeleteAccount={handleDeleteAccount}
        />
      )}
    </AppLayout>
  );
}
