import React from 'react';
import { Activity, Clock, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronUp, RotateCcw, Trash2, Server } from 'lucide-react';

export default function JobsView({ jobs, workers = [], onRefresh }) {
  const [expandedJob, setExpandedJob] = React.useState(null);
  const [retryingId, setRetryingId] = React.useState(null);
  const [showCompleted, setShowCompleted] = React.useState(false);

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

  const JobItem = ({ job }) => (
    <div key={job.id} style={{ 
      background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden',
      transition: 'all 0.2s', marginBottom: '15px'
    }}>
      <div 
        onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
        style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
           {getStatusIcon(job.status)}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{job.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                 {job.payload?.disableAnomalyDetection && (
                   <span style={{ 
                     background: '#eff6ff', color: '#3b82f6', padding: '2px 8px', borderRadius: '8px', 
                     fontSize: '0.7em', fontWeight: '800', border: '1px solid #dbeafe'
                   }}>
                     BASELINE
                   </span>
                 )}
               </div>
               <span style={{ fontSize: '0.8em', color: '#94a3b8' }}>ID: #{job.id} • {new Date(job.created_at).toLocaleString()}</span>
              {job.worker_id && (
                <span style={{ fontSize: '0.7em', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <Server size={10} /> {job.worker_id}
                </span>
              )}
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
               <button 
                 onClick={(e) => handleRetry(e, job.id)}
                 disabled={retryingId === job.id}
                 title={job.status === 'processing' ? "Requeue/Force Retry (Use for stale jobs)" : "Retry/Requeue Job"}
                 style={{ background: '#f5f3ff', border: 'none', padding: '8px', borderRadius: '10px', color: '#7c3aed', cursor: retryingId === job.id ? 'wait' : 'pointer' }}
               >
                 {retryingId === job.id ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
               </button>
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
  );

  // Filter jobs based on toggle
  const filteredJobs = showCompleted ? jobs : jobs.filter(j => j.status !== 'completed');

  // Group jobs by worker
  const activeWorkerIds = workers.map(w => w.id);
  const unassignedJobs = filteredJobs.filter(j => !j.worker_id || !activeWorkerIds.includes(j.worker_id));
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.5em', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Activity size={24} color="#3b82f6" /> Multi-Worker Job Monitor
        </h2>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85em', fontWeight: 'bold', cursor: 'pointer', color: '#64748b' }}>
            <input 
              type="checkbox" 
              checked={showCompleted} 
              onChange={(e) => setShowCompleted(e.target.checked)} 
              style={{ width: '16px', height: '16px' }}
            />
            Show Completed Jobs
          </label>
          <button 
            onClick={onRefresh}
            style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85em' }}
          >
            Refresh All
          </button>
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: `repeat(${Math.max(1, workers.length + (unassignedJobs.length > 0 ? 1 : 0))}, minmax(350px, 1fr))`, 
        gap: '20px',
        alignItems: 'start',
        overflowX: 'auto',
        paddingBottom: '20px'
      }}>
        {/* Workers Lanes */}
        {workers.map(worker => (
          <div key={worker.id} style={{ display: 'flex', flexDirection: 'column', gap: '15px', background: '#f8fafc', padding: '15px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Server size={18} color="#6366f1" />
                <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{worker.id}</span>
              </div>
              <span style={{ fontSize: '0.7em', padding: '2px 8px', background: '#dcfce7', color: '#15803d', borderRadius: '10px', fontWeight: 'bold' }}>ONLINE</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100px' }}>
              {filteredJobs.filter(j => j.worker_id === worker.id).length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', background: '#fff', borderRadius: '16px', border: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: '0.85em' }}>
                  No active jobs on this worker
                </div>
              ) : (
                filteredJobs.filter(j => j.worker_id === worker.id).map(job => <JobItem key={job.id} job={job} />)
              )}
            </div>
          </div>
        ))}

        {/* Unassigned/History Lane (if any) */}
        {(unassignedJobs.length > 0 || workers.length === 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', background: '#f8fafc', padding: '15px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 5px' }}>
              <Clock size={18} color="#94a3b8" />
              <span style={{ fontWeight: 'bold', color: '#1e293b' }}>Queue / History</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100px' }}>
              {unassignedJobs.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', background: '#fff', borderRadius: '16px', border: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: '0.85em' }}>
                  No unassigned jobs
                </div>
              ) : (
                unassignedJobs.map(job => <JobItem key={job.id} job={job} />)
              )}
            </div>
          </div>
        )}
      </div>

      {filteredJobs.length === 0 && workers.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', color: '#64748b' }}>
          No background jobs or active workers found.
        </div>
      )}
    </div>
  );
}
