import { useState, useCallback } from 'react';
import { api } from '../services/api';

export function useSettings() {
  const [settings, setSettings] = useState({ own_accounts: [], account_names: [], categories: [] });
  const [aiConfig, setAIConfig] = useState(null);
  const [pontoConfig, setPontoConfig] = useState(null);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.get('/settings');
      setSettings(data);
      
      const aiData = await api.get('/settings/ai_config').catch(() => null);
      if (aiData) setAIConfig(aiData);

      const pontoData = await api.get('/settings/ponto_config').catch(() => null);
      if (pontoData) setPontoConfig(pontoData);
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  }, []);

  const updateAccountName = async (account, name, ai_enabled = false) => {
    await api.post('/settings/account-name', { account, display_name: name, ai_enabled });
    fetchSettings();
  };

  const deleteAccount = async (account) => {
    if (!confirm(`Are you sure you want to delete account ${account}?`)) return;
    await api.delete(`/settings/account/${account}`);
    fetchSettings();
  };

  const saveCategories = async (categories) => {
    await api.post('/settings/categories', categories);
    fetchSettings();
  };

  const saveAIConfig = async (config) => {
    await api.post('/settings/ai_config', config);
    fetchSettings();
  };

  const savePontoConfig = async (config) => {
    await api.post('/settings/ponto_config', config);
    fetchSettings();
  };

  const syncPontoAccounts = async () => {
    await api.post('/settings/ponto_sync_accounts');
    fetchSettings();
  };

  const updatePontoAccountStatus = async (pontoId, isActive) => {
    await api.post('/settings/ponto_account_status', { pontoId, isActive });
    fetchSettings();
  };

  return {
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
  };
}
