import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Upload as UploadIcon, Settings as SettingsIcon, DollarSign, TrendingUp, Activity, ShieldCheck, LogOut, Bell, CheckCircle, AlertCircle, Repeat } from 'lucide-react';
import { api } from '../services/api';

export default function AppLayout({ children, activeTab, setActiveTab, totalAssets, accountCount, onLogout}) {
  const [pushStatus, setPushStatus] = useState('Checking...');
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/sw.js').then(registration => {
        return registration.pushManager.getSubscription();
      }).then(subscription => {
        if (subscription) {
          setPushStatus('Subscribed');
        } else {
          setPushStatus('Not subscribed');
        }
      }).catch(err => {
        console.error('Service Worker or Push Manager error:', err);
        setPushStatus('Error');
      });
    } else {
      setPushStatus('Not Supported');
    }
  }, []);

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

  const subscribeToPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported in this browser.');
      return;
    }

    setIsSubscribing(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const response = await api.get('/notifications/vapid-public-key');
      const vapidPublicKey = response.publicKey;
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      await api.post('/notifications/subscribe', subscription);
      setPushStatus('Subscribed');
    } catch (err) {
      console.error('Error subscribing to push:', err);
      if (Notification.permission === 'denied') {
        alert('You have blocked notifications for this site. Please enable them in your browser settings.');
      } else {
        alert('Failed to subscribe: ' + err.message);
      }
    } finally {
      setIsSubscribing(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const tabs = [
    { id: 'overview', icon: <LayoutDashboard size={16} />, label: 'Dashboard' },
    { id: 'subscriptions', icon: <Repeat size={16} />, label: 'Subscriptions' },
    { id: 'upload', icon: <UploadIcon size={16} />, label: 'CSV Import', desktopOnly: true },
    { id: 'rules', icon: <ShieldCheck size={16} />, label: 'Smart Rules' },
    { id: 'jobs', icon: <Activity size={16} />, label: 'Background Jobs', desktopOnly: true },
    { id: 'settings', icon: <SettingsIcon size={16} />, label: 'Settings', desktopOnly: true }
  ];

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1400px', margin: '0 auto', color: '#1e293b' }}>
      <header className="header" style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '30px' }}>
        <div className="header-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#3b82f6', color: '#fff', padding: '8px', borderRadius: '12px', display: 'flex' }}>
              <DollarSign size={24} />
            </div>
            <h1 style={{ margin: 0, fontSize: '1.5em', fontWeight: 800, letterSpacing: '-0.02em' }}>Core Finance</h1>
          </div>
          <div className="header-stats" style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'nowrap' }}>
              <div className="subscribe-mobile" style={{ display: 'none', flexShrink: 0 }}>
                {pushStatus !== 'Subscribed' && pushStatus !== 'Not Supported' && (
                  <button 
                    onClick={subscribeToPush}
                    disabled={isSubscribing}
                    style={{ 
                      background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', 
                      padding: '6px 10px', borderRadius: '12px', cursor: 'pointer', 
                      display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75em', fontWeight: 'bold'
                    }}
                  >
                    <Bell size={14} /> {isSubscribing ? '...' : 'Subscribe'}
                  </button>
                )}
                {pushStatus === 'Subscribed' && (
                  <div style={{ 
                    background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                    padding: '6px 10px', borderRadius: '12px',
                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75em', fontWeight: 'bold' 
                  }}>
                    <CheckCircle size={14} /> Subscribed
                  </div>
                )}
              </div>
              <div style={{ 
                display: 'flex', gap: '10px', fontSize: '0.8em', background: '#f8fafc', 
                padding: '6px 12px', borderRadius: '20px', border: '1px solid #e2e8f0', color: '#64748b',
                whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0, overflow: 'hidden'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                  <TrendingUp size={14} /> <strong>Net Worth:</strong> {formatCurrency(totalAssets)}
                </span>
                <span className="desktop-stat" style={{ display: 'flex', alignItems: 'center', gap: '5px', borderLeft: '1px solid #e2e8f0', paddingLeft: '10px', flexShrink: 0 }}>
                  <Activity size={14} /> <strong>Accounts:</strong> {accountCount}
                </span>
              </div>
              <button 
                onClick={onLogout}
                title="Sign Out"
                style={{ background: '#fee2e2', color: '#ef4444', border: 'none', padding: '8px', borderRadius: '12px', cursor: 'pointer', display: 'flex' }}
              >
                <LogOut size={20} />
              </button>

          </div>
        </div>

        <div className="nav-tabs" style={{ display: 'flex', gap: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {tabs.map(tab => (
            <button 
              key={tab.id}
              className={`nav-tab-${tab.id} ${tab.desktopOnly ? 'desktop-only' : ''}`}
              onClick={() => setActiveTab(tab.id)} 
              style={{ 
                background: activeTab === tab.id ? '#3b82f6' : '#f1f5f9', 
                color: activeTab === tab.id ? '#fff' : '#475569', 
                border: 'none', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold',
                display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </header>
      <main>
        {children}
      </main>
      <style jsx global>{`
          @keyframes spin {
              from {
                  transform: rotate(0deg);
              }
              to {
                  transform: rotate(360deg);
              }
          }

          @media (max-width: 640px) {
              .subscribe-mobile {
                  display: flex !important;
              }

              .nav-tabs button.desktop-only {
                  display: none !important;
              }
              
              .desktop-stat {
                  display: none !important;
              }

              .nav-tabs button {
                  white-space: nowrap;
                  flex-shrink: 0;
              }

          }
      `}</style>
    </div>
  );
}
