import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { importApi } from '../lib/api';
import toast from 'react-hot-toast';
import { Check, X, AlertTriangle, Info, AlertCircle, ChevronDown, ChevronUp, Loader2, Play } from 'lucide-react';
import clsx from 'clsx';

const SEVERITY_CONFIG = {
  ERROR:   { icon: AlertCircle,   cls: 'badge-error',   rowCls: 'border-red-900/40',   bg: 'bg-red-950/20' },
  WARNING: { icon: AlertTriangle, cls: 'badge-warning',  rowCls: 'border-yellow-900/40', bg: 'bg-yellow-950/20' },
  INFO:    { icon: Info,          cls: 'badge-info',     rowCls: 'border-blue-900/40',   bg: 'bg-blue-950/20' },
};

const STATUS_CLS = {
  PENDING:       'bg-gray-800 text-gray-400',
  APPROVED:      'bg-emerald-900/40 text-emerald-300',
  REJECTED:      'bg-red-900/40 text-red-300',
  AUTO_RESOLVED: 'bg-blue-900/40 text-blue-300',
};

function AnomalyCard({ anomaly, onResolve, resolving }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[anomaly.severity] || SEVERITY_CONFIG.INFO;
  const Icon = cfg.icon;
  const isPending = anomaly.status === 'PENDING';

  return (
    <div className={clsx('border rounded-lg overflow-hidden', cfg.rowCls)}>
      <div className={clsx('p-4', cfg.bg)}>
        <div className="flex items-start gap-3">
          <Icon size={16} className={clsx('mt-0.5 shrink-0', anomaly.severity === 'ERROR' ? 'text-red-400' : anomaly.severity === 'WARNING' ? 'text-yellow-400' : 'text-blue-400')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={clsx('badge', cfg.cls)}>{anomaly.severity}</span>
              <span className="text-xs text-gray-500 font-mono">{anomaly.anomalyType}</span>
              <span className="text-xs text-gray-600">Row {anomaly.rowNumber}</span>
              <span className={clsx('badge', STATUS_CLS[anomaly.status])}>{anomaly.status}</span>
            </div>
            <p className="text-sm text-gray-200">{anomaly.description}</p>
            <p className="text-xs text-gray-500 mt-1">💡 {anomaly.suggestion}</p>
          </div>

          {isPending && (
            <div className="flex gap-2 shrink-0">
              <button
                className="btn-success text-xs py-1 px-2 gap-1"
                disabled={resolving}
                onClick={() => onResolve(anomaly.id, 'APPROVED')}
                title="Approve — import this row despite the anomaly"
              >
                <Check size={12} /> Approve
              </button>
              <button
                className="btn-danger text-xs py-1 px-2 gap-1"
                disabled={resolving}
                onClick={() => onResolve(anomaly.id, 'REJECTED')}
                title="Reject — skip this row"
              >
                <X size={12} /> Reject
              </button>
            </div>
          )}
        </div>

        {/* Raw row data toggle */}
        <button
          className="mt-2 flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400"
          onClick={() => setExpanded((o) => !o)}
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          View raw row data
        </button>
        {expanded && (
          <div className="mt-2 bg-gray-950/60 rounded p-2 text-xs font-mono text-gray-400 overflow-x-auto">
            {Object.entries(anomaly.rowData || {}).map(([k, v]) => (
              <div key={k}><span className="text-gray-600">{k}:</span> {String(v || '')}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnomalyReviewPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('ALL');
  const [applyLoading, setApplyLoading] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['import-job', jobId],
    queryFn: () => importApi.getJob(jobId),
    refetchInterval: 5000,
  });

  const resolve = useMutation({
    mutationFn: ({ anomalyId, status }) => importApi.resolveAnomaly(jobId, anomalyId, { status }),
    onSuccess: () => refetch(),
    onError: () => toast.error('Failed to resolve anomaly'),
  });

  const bulkResolve = useMutation({
    mutationFn: (data) => importApi.bulkResolve(jobId, data),
    onSuccess: (_, vars) => {
      toast.success(`Bulk ${vars.status.toLowerCase()} applied`);
      refetch();
    },
    onError: () => toast.error('Bulk resolve failed'),
  });

  const handleApply = async () => {
    setApplyLoading(true);
    try {
      const res = await importApi.apply(jobId);
      toast.success(`Import complete: ${res.data.data.importedRows} rows imported`);
      navigate(`/import/${jobId}/report`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Apply failed');
    } finally {
      setApplyLoading(false);
    }
  };

  const job = data?.data?.data;
  const anomalies = job?.anomalies || [];

  const pendingErrors = anomalies.filter((a) => a.severity === 'ERROR' && a.status === 'PENDING').length;
  const pendingTotal = anomalies.filter((a) => a.status === 'PENDING').length;

  const filtered = filter === 'ALL' ? anomalies : anomalies.filter((a) =>
    filter === 'PENDING' ? a.status === 'PENDING' : a.severity === filter
  );

  const counts = {
    ALL: anomalies.length,
    ERROR: anomalies.filter((a) => a.severity === 'ERROR').length,
    WARNING: anomalies.filter((a) => a.severity === 'WARNING').length,
    INFO: anomalies.filter((a) => a.severity === 'INFO').length,
    PENDING: pendingTotal,
  };

  if (isLoading) return (
    <div className="flex items-center gap-2 text-gray-500 justify-center py-16"><Loader2 size={16} className="animate-spin" /> Loading import job…</div>
  );

  if (!job) return <p className="text-gray-500">Import job not found.</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Anomaly Review</h1>
          <p className="text-sm text-gray-500 mt-0.5">{job.filename} · {job.totalRows} rows · {anomalies.length} anomalies</p>
        </div>
        <button
          className={clsx('btn-primary', pendingErrors > 0 && 'opacity-50 cursor-not-allowed')}
          disabled={pendingErrors > 0 || applyLoading}
          onClick={handleApply}
          title={pendingErrors > 0 ? `Resolve ${pendingErrors} error(s) first` : 'Apply import'}
        >
          {applyLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          Apply Import
        </button>
      </div>

      {pendingErrors > 0 && (
        <div className="bg-red-950/30 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
          ⚠ {pendingErrors} unresolved ERROR anomaly(ies) must be approved or rejected before you can apply the import.
        </div>
      )}

      {/* Bulk actions */}
      <div className="card flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Bulk:</span>
        {['ERROR', 'WARNING', 'INFO'].map((sev) => (
          <button key={sev} className="btn-secondary text-xs py-1"
            onClick={() => bulkResolve.mutate({ severity: sev, status: 'APPROVED' })}>
            Approve all {sev}
          </button>
        ))}
        <button className="btn-danger text-xs py-1"
          onClick={() => bulkResolve.mutate({ severity: 'ERROR', status: 'REJECTED' })}>
          Reject all ERRORs
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(counts).map(([key, count]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={clsx('px-3 py-1 rounded-full text-xs font-medium transition-colors',
              filter === key ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
            {key} ({count})
          </button>
        ))}
      </div>

      {/* Anomaly list */}
      {filtered.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">No anomalies in this filter.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((anomaly) => (
            <AnomalyCard
              key={anomaly.id}
              anomaly={anomaly}
              onResolve={(anomalyId, status) => resolve.mutate({ anomalyId, status })}
              resolving={resolve.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
