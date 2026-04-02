import React from 'react';
import { Activity, Clock, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronUp, RotateCcw, Trash2 } from 'lucide-react';

export default function JobsView({ jobs, onRefresh }) {
  const [expandedJob, setExpandedJob] = React.useState(null);
  const [retryingId, setRetryingId] = React.useState(null);

  const handleRetry = async (e, id) => {
    e.stopPropagation();
    setRetryingId(id);
    try {
      const res = await fetch(`/api/jobs/${id}/retry`, { method: 'POST' });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setRetryingId(null);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to remove this job record?')) return;
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      if (res.ok) onRefresh();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle size={18} color="#22c55e" />;
      case 'failed': return <AlertCircle size={18} color="#ef4444" />;
      case 'processing': return <Loader2 size={18} color="#8b5cf6" className="animate-spin" />;
      default: return <Clock size={18} color="#94a3b8" />;
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'completed': return { background: '#dcfce7', color: '#15803d' };
      case 'failed': return { background: '#fee2e2', color: '#b91c1c' };
      case 'processing': return { background: '#f5f3ff', color: '#7c3aed' };
      default: return { background: '#f1f5f9', color: '#475569' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.5em', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Activity size={24} color="#3b82f6" /> Background Job History
        </h2>
        <button 
          onClick={onRefresh}
          style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85em' }}
        >
          Refresh List
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {jobs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', color: '#64748b' }}>
            No background jobs found.
          </div>
        ) : (
          jobs.map((job) => (
            <div key={job.id} style={{ 
              background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden',
              transition: 'all 0.2s'
            }}>
              <div 
                onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                   {getStatusIcon(job.status)}
                   <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{job.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                      <span style={{ fontSize: '0.8em', color: '#94a3b8' }}>ID: #{job.id} • {new Date(job.created_at).toLocaleString()}</span>
                   </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                      <span style={{ 
                        padding: '4px 10px', borderRadius: '10px', fontSize: '0.75em', fontWeight: 'bold',
                        ...getStatusStyle(job.status)
                      }}>
                        {job.status.toUpperCase()}
                      </span>
                      <div style={{ width: '100px', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                         <div style={{ height: '100%', background: '#8b5cf6', width: `${job.progress}%` }} />
                      </div>
                   </div>
                   <div style={{ display: 'flex', gap: '5px' }}>
                      {job.status === 'failed' && (
                        <button 
                          onClick={(e) => handleRetry(e, job.id)}
                          disabled={retryingId === job.id}
                          title="Retry Job"
                          style={{ background: '#f5f3ff', border: 'none', padding: '8px', borderRadius: '10px', color: '#7c3aed', cursor: retryingId === job.id ? 'wait' : 'pointer' }}
                        >
                          {retryingId === job.id ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                        </button>
                      )}
                      <button 
                        onClick={(e) => handleDelete(e, job.id)}
                        title="Delete Job"
                        style={{ background: '#fef2f2', border: 'none', padding: '8px', borderRadius: '10px', color: '#ef4444', cursor: 'pointer' }}
                      >
                        <Trash2 size={16} />
                      </button>
                   </div>
                   {expandedJob === job.id ? <ChevronUp size={20} color="#94a3b8" /> : <ChevronDown size={20} color="#94a3b8" />}
                </div>
              </div>

              {expandedJob === job.id && (
                <div style={{ padding: '0 20px 20px', borderTop: '1px solid #f1f5f9' }}>
                   <div style={{ marginTop: '20px' }}>
                     <div style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#64748b', marginBottom: '10px' }}>Execution Logs</div>
                     <div style={{ 
                       background: '#1e293b', color: '#e2e8f0', padding: '15px', borderRadius: '12px', 
                       fontFamily: 'monospace', fontSize: '0.8em', maxHeight: '300px', overflowY: 'auto',
                       display: 'flex', flexDirection: 'column', gap: '5px'
                     }}>
                       {job.logs && job.logs.map((log, idx) => (
                         <div key={idx} style={{ display: 'flex', gap: '10px' }}>
                           <span style={{ color: '#94a3b8' }}>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                           <span>{log.message}</span>
                         </div>
                       ))}
                       {job.error && (
                         <div style={{ color: '#f87171', fontWeight: 'bold', marginTop: '10px' }}>ERROR: {job.error}</div>
                       )}
                     </div>
                   </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
