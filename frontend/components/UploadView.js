import React from 'react';
import { ShieldCheck, FileText, History, CheckCircle, AlertCircle } from 'lucide-react';

export default function UploadView({ file, balFile, uploading, message, onFileChange, onBalFileChange, onUpload }) {
  const [verificationResult, setVerificationResult] = React.useState(null);
  const [step, setStep] = React.useState('select'); // 'select', 'verify', 'initial_balances'

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const handleVerify = async () => {
    if (!file || !balFile) return;
    
    const formData = new FormData();
    formData.append('transactionFile', file);
    formData.append('balanceFile', balFile);

    try {
      const res = await fetch('/api/upload/verify', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setVerificationResult(data);
      setStep('verify');
    } catch (err) {
      console.error(err);
    }
  };

  const handleFinalSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append('transactionFile', file);
    if (balFile) {
      formData.append('balanceFile', balFile);
    }

    try {
      await onUpload(formData);
      setStep('select');
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
            <div className="upload-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
               <div style={{ position: 'relative', border: '2px dashed #e2e8f0', borderRadius: '20px', padding: '30px', textAlign: 'center', background: '#f8fafc' }}>
                  <input type="file" onChange={onFileChange} style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }} />
                  <FileText size={32} color={file ? '#3b82f6' : '#94a3b8'} style={{ marginBottom: '10px' }} />
                  <div style={{ fontSize: '0.85em', fontWeight: 'bold', wordBreak: 'break-all' }}>{file ? file.name : 'Transaction CSV'}</div>
               </div>
               <div style={{ position: 'relative', border: '2px dashed #e2e8f0', borderRadius: '20px', padding: '30px', textAlign: 'center', background: '#f8fafc' }}>
                  <input type="file" onChange={onBalFileChange} style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }} />
                  <History size={32} color={balFile ? '#3b82f6' : '#94a3b8'} style={{ marginBottom: '10px' }} />
                  <div style={{ fontSize: '0.85em', fontWeight: 'bold', wordBreak: 'break-all' }}>{balFile ? balFile.name : 'Balance CSV'}</div>
               </div>
            </div>

            <button 
              onClick={handleVerify}
              disabled={!file || !balFile || uploading}
              style={{
                background: '#3b82f6', color: '#fff', border: 'none', padding: '16px', borderRadius: '16px',
                fontWeight: 'bold', cursor: 'pointer', opacity: (!file || !balFile || uploading) ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
              }}
            >
              <ShieldCheck size={18} />
              Analyze & Verify
            </button>
          </div>
        )}

        {step === 'verify' && verificationResult && (
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
