import React from 'react';
import { ShieldCheck, FileText, History, CheckCircle, AlertCircle } from 'lucide-react';

export default function UploadView({ file, balFile, uploading, message, onFileChange, onBalFileChange, onUpload, accounts }) {
  const [verificationResult, setVerificationResult] = React.useState(null);
  const [step, setStep] = React.useState('select'); // 'select', 'verify', 'processing'
  const [selectedAccount, setSelectedAccount] = React.useState('');
  const [currentJob, setCurrentJob] = React.useState(null);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const pollJobStatus = async (jobId) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json();
        setCurrentJob(data);

        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(interval);
          // Refresh summaries after job completion to update account balances
          if (onUpload) onUpload(null, true);
        }
      } catch (err) {
        console.error('Job polling error:', err);
        clearInterval(interval);
      }
    }, 2000);
  };

  const handleVerify = async () => {
    console.log('UploadView: Starting verification for account:', selectedAccount);
    console.log('UploadView: Available accounts prop:', accounts);
    if (!file || !balFile || !selectedAccount) return;
    
    const formData = new FormData();
    formData.append('transactionFile', file);
    formData.append('balanceFile', balFile);
    formData.append('accountId', selectedAccount);

    try {
      const res = await fetch('/api/upload/verify', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      setVerificationResult(data);
      setStep('verify');
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const handleFinalSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!file || !selectedAccount) return;

    const formData = new FormData();
    formData.append('transactionFile', file);
    formData.append('accountId', selectedAccount);
    if (balFile) {
      formData.append('balanceFile', balFile);
    }

    try {
      const result = await onUpload(formData);
      if (result && result.job_id) {
        setStep('processing');
        pollJobStatus(result.job_id);
      } else {
        setStep('select');
      }
    } catch (err) {
      console.error(err);
    }
  };
  return (
    <div style={{ maxWidth: '800px', margin: '40px auto' }}>
      <div style={{ background: '#fff', padding: '40px', borderRadius: '32px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px' }}>
          <div>
            <h2 style={{ fontSize: '1.5em', fontWeight: 800, margin: 0 }}>Verified Import</h2>
            <p style={{ color: '#64748b', fontSize: '0.9em', marginTop: '5px' }}>Cross-check your transactions with official balance overviews.</p>
          </div>
          <div style={{ background: '#eff6ff', color: '#3b82f6', padding: '15px', borderRadius: '20px' }}>
            <ShieldCheck size={30} />
          </div>
        </div>

        {step === 'select' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#64748b' }}>Select Target Account</label>
              <select 
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                style={{
                  padding: '12px 16px', borderRadius: '16px', border: '1px solid #e2e8f0',
                  background: '#f8fafc', fontSize: '0.9em', outline: 'none'
                }}
              >
                <option value="">-- Choose Account --</option>
                {accounts.map(acc => (
                  <option key={acc.account} value={acc.account}>
                    {acc.account_display_name} ({acc.account})
                  </option>
                ))}
              </select>
            </div>

            <div className="upload-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
               <div style={{ position: 'relative', border: '2px dashed #e2e8f0', borderRadius: '20px', padding: '30px', textAlign: 'center', background: '#f8fafc' }}>
                  <input type="file" onChange={onFileChange} style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }} />
                  <FileText size={32} color={file ? '#3b82f6' : '#94a3b8'} style={{ marginBottom: '10px' }} />
                  <div style={{ fontSize: '0.85em', fontWeight: 'bold', wordBreak: 'break-all' }}>{file ? file.name : 'Transaction CSV'}</div>
                  {!file && <div style={{ fontSize: '0.7em', color: '#64748b', marginTop: '5px' }}>Mandatory</div>}
               </div>
               <div style={{ position: 'relative', border: '2px dashed #e2e8f0', borderRadius: '20px', padding: '30px', textAlign: 'center', background: '#f8fafc' }}>
                  <input type="file" onChange={onBalFileChange} style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }} />
                  <History size={32} color={balFile ? '#3b82f6' : '#94a3b8'} style={{ marginBottom: '10px' }} />
                  <div style={{ fontSize: '0.85em', fontWeight: 'bold', wordBreak: 'break-all' }}>{balFile ? balFile.name : 'Balance CSV'}</div>
                  {!balFile && <div style={{ fontSize: '0.7em', color: '#64748b', marginTop: '5px' }}>Mandatory for Verification</div>}
               </div>
            </div>

            <button 
              onClick={handleVerify}
              disabled={!file || !balFile || !selectedAccount || uploading}
              style={{
                background: '#3b82f6', color: '#fff', border: 'none', padding: '16px', borderRadius: '16px',
                fontWeight: 'bold', cursor: 'pointer', opacity: (!file || !balFile || !selectedAccount || uploading) ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
              }}
            >
              <ShieldCheck size={18} />
              Analyze & Verify
            </button>
          </div>
        )}

        {step === 'processing' && currentJob && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                 <span style={{ fontWeight: 800, fontSize: '1.1em' }}>AI Categorization</span>
                 <span style={{ 
                   padding: '4px 12px', borderRadius: '12px', fontSize: '0.8em', fontWeight: 'bold',
                   background: currentJob.status === 'completed' ? '#dcfce7' : currentJob.status === 'failed' ? '#fee2e2' : '#fef9c3',
                   color: currentJob.status === 'completed' ? '#15803d' : currentJob.status === 'failed' ? '#b91c1c' : '#854d0e'
                 }}>
                   {currentJob.status.toUpperCase()}
                 </span>
               </div>

               <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden', marginBottom: '10px' }}>
                 <div style={{ 
                   height: '100%', background: '#8b5cf6', width: `${currentJob.progress}%`,
                   transition: 'width 0.5s ease-in-out'
                 }} />
               </div>
               <div style={{ fontSize: '0.85em', color: '#64748b', textAlign: 'right', fontWeight: 'bold' }}>{currentJob.progress}%</div>

               <div style={{ marginTop: '20px' }}>
                 <div style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#64748b', marginBottom: '10px' }}>Execution Logs</div>
                 <div style={{ 
                   background: '#1e293b', color: '#e2e8f0', padding: '15px', borderRadius: '12px', 
                   fontFamily: 'monospace', fontSize: '0.8em', maxHeight: '200px', overflowY: 'auto',
                   display: 'flex', flexDirection: 'column', gap: '5px'
                 }}>
                   {currentJob.logs && currentJob.logs.map((log, idx) => (
                     <div key={idx} style={{ display: 'flex', gap: '10px' }}>
                       <span style={{ color: '#94a3b8' }}>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                       <span>{log.message}</span>
                     </div>
                   ))}
                   {currentJob.error && (
                     <div style={{ color: '#f87171', fontWeight: 'bold', marginTop: '10px' }}>ERROR: {currentJob.error}</div>
                   )}
                 </div>
               </div>
            </div>

            {(currentJob.status === 'completed' || currentJob.status === 'failed') && (
              <button 
                onClick={() => setStep('select')}
                style={{
                  alignSelf: 'center', padding: '12px 30px', background: '#3b82f6', color: '#fff',
                  border: 'none', borderRadius: '16px', fontWeight: 'bold', cursor: 'pointer'
                }}
              >
                Close
              </button>
            )}
          </div>
        )}

        {step === 'verify' && verificationResult && verificationResult.discrepancies && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: '12px', padding: '20px', borderRadius: '20px', 
              background: verificationResult.discrepancies.length === 0 ? '#f0fdf4' : '#fef2f2',
              color: verificationResult.discrepancies.length === 0 ? '#166534' : '#991b1b',
              border: `1px solid ${verificationResult.discrepancies.length === 0 ? '#bcf0da' : '#fecaca'}`
            }}>
              {verificationResult.discrepancies.length === 0 ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
              <div>
                <div style={{ fontWeight: 'bold' }}>
                  {verificationResult.discrepancies.length === 0 ? 'Verification Successful' : 'Verification Found Discrepancies'}
                </div>
                <div style={{ fontSize: '0.85em', opacity: 0.9 }}>
                  {verificationResult.discrepancies.length === 0 
                    ? 'All transactions perfectly match your reported balances.' 
                    : `We found ${verificationResult.discrepancies.length} instances where balances don't align.`}
                </div>
              </div>
            </div>

            {verificationResult.discrepancies.length > 0 && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '20px', overflow: 'hidden' }}>
                <div style={{ padding: '15px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.85em', fontWeight: 'bold' }}>Discrepancy List</div>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8em' }}>
                    <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, borderBottom: '1px solid #e2e8f0' }}>
                      <tr>
                        <th style={{ padding: '12px 20px', textAlign: 'left' }}>Date</th>
                        <th style={{ padding: '12px 20px', textAlign: 'right' }}>Calculated</th>
                        <th style={{ padding: '12px 20px', textAlign: 'right' }}>Reported</th>
                        <th style={{ padding: '12px 20px', textAlign: 'right' }}>Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verificationResult.discrepancies.map((d, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 20px' }}>{d.date}</td>
                          <td style={{ padding: '12px 20px', textAlign: 'right' }}>{formatCurrency(d.calculated)}</td>
                          <td style={{ padding: '12px 20px', textAlign: 'right' }}>{formatCurrency(d.expected)}</td>
                          <td style={{ padding: '12px 20px', textAlign: 'right', color: '#ef4444', fontWeight: 'bold' }}>{formatCurrency(d.diff)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '15px' }}>
              <button 
                onClick={() => setStep('select')}
                style={{ flex: 1, padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={() => handleFinalSubmit()}
                disabled={uploading}
                style={{ flex: 2, padding: '15px', borderRadius: '16px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {uploading ? 'Synchronizing...' : 'Import Verified Data'}
              </button>
            </div>
          </div>
        )}


        {message && (
          <div style={{ 
            marginTop: '30px', padding: '15px', borderRadius: '16px', 
            background: message.includes('Error') ? '#fef2f2' : '#f0fdf4',
            color: message.includes('Error') ? '#991b1b' : '#166534',
            fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center'
          }}>
            {message.includes('Error') ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
