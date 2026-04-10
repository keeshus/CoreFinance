import React from 'react';
import { LayoutDashboard, Upload as UploadIcon, Settings as SettingsIcon, DollarSign, TrendingUp, Activity, ShieldCheck, LogOut } from 'lucide-react';

export default function AppLayout({ children, activeTab, setActiveTab, totalAssets, accountCount, onLogout}) {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const tabs = [
    { id: 'overview', icon: <LayoutDashboard size={16} />, label: 'Dashboard' },
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
          <div className="header-stats" style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
              <div style={{ 
                display: 'flex', gap: '15px', fontSize: '0.85em', background: '#f8fafc', 
                padding: '8px 15px', borderRadius: '20px', border: '1px solid #e2e8f0', color: '#64748b' 
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <TrendingUp size={14} /> <strong>Net Worth:</strong> {formatCurrency(totalAssets)}
                </span>
                <span className="desktop-stat" style={{ display: 'flex', alignItems: 'center', gap: '5px', borderLeft: '1px solid #e2e8f0', paddingLeft: '10px' }}>
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
