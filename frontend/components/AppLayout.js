import React from 'react';
import { LayoutDashboard, Upload as UploadIcon, Settings as SettingsIcon, DollarSign, TrendingUp, Activity, ShieldCheck } from 'lucide-react';

export default function AppLayout({ children, activeTab, setActiveTab, totalAssets, accountCount}) {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
  };

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
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', borderLeft: '1px solid #e2e8f0', paddingLeft: '10px' }}>
                  <Activity size={14} /> <strong>Accounts:</strong> {accountCount}
                </span>
              </div>
          </div>
        </div>

        <div className="nav-tabs" style={{ display: 'flex', gap: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {[
            { id: 'overview', icon: <LayoutDashboard size={16} />, label: 'Dashboard' },
            { id: 'upload', icon: <UploadIcon size={16} />, label: 'Import Export' },
            { id: 'rules', icon: <ShieldCheck size={16} />, label: 'Smart Rules' },
            { id: 'jobs', icon: <Activity size={16} />, label: 'Background Jobs' },
            { id: 'settings', icon: <SettingsIcon size={16} />, label: 'Settings' }
          ].map(tab => (
            <button 
              key={tab.id}
              className={`nav-tab-${tab.id}`}
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

              .nav-tabs button {
                  white-space: nowrap;
                  flex-shrink: 0;
              }

          }
      `}</style>
    </div>
  );
}
