import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { importApi } from '../lib/api';
import { CheckCircle, XCircle, AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';

export default function ImportReportPage() {
  const { jobId } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['import-report', jobId],
    queryFn: () => importApi.report(jobId),
  });

  const job = data?.data?.data;

  if (isLoading) return (
    <div className="flex items-center gap-2 text-gray-500 justify-center py-16"><Loader2 size={16} className="animate-spin" /></div>
  );
  if (!job) return <p className="text-gray-500">Report not found.</p>;

  const report = job.report || {};
  const log = report.importLog || [];

  const imported = log.filter((l) => l.status === 'IMPORTED');
  const skipped = log.filter((l) => l.status === 'SKIPPED');
  const errors = log.filter((l) => l.status === 'ERROR');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="text-gray-500 hover:text-gray-300">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-100">Import Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">{job.filename}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center py-5">
          <CheckCircle size={24} className="mx-auto mb-2 text-emerald-400" />
          <p className="text-2xl font-bold text-emerald-400">{job.importedRows}</p>
          <p className="text-xs text-gray-500 mt-1">Imported</p>
        </div>
        <div className="card text-center py-5">
          <AlertTriangle size={24} className="mx-auto mb-2 text-yellow-400" />
          <p className="text-2xl font-bold text-yellow-400">{job.skippedRows}</p>
          <p className="text-xs text-gray-500 mt-1">Skipped</p>
        </div>
        <div className="card text-center py-5">
          <AlertTriangle size={24} className="mx-auto mb-2 text-blue-400" />
          <p className="text-2xl font-bold text-blue-400">{job.totalRows}</p>
          <p className="text-xs text-gray-500 mt-1">Total Rows</p>
        </div>
      </div>

      {/* Anomaly summary */}
      <div className="card">
        <p className="text-sm font-medium text-gray-300 mb-3">Anomaly Summary</p>
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div><p className="text-red-400 font-bold">{report.errors || 0}</p><p className="text-xs text-gray-500">Errors</p></div>
          <div><p className="text-yellow-400 font-bold">{report.warnings || 0}</p><p className="text-xs text-gray-500">Warnings</p></div>
          <div><p className="text-blue-400 font-bold">{report.info || 0}</p><p className="text-xs text-gray-500">Info</p></div>
        </div>
      </div>

      {/* Imported expenses */}
      {job.expenses?.length > 0 && (
        <div className="card">
          <p className="text-sm font-medium text-gray-300 mb-3">Imported Expenses ({job.expenses.length})</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {job.expenses.map((e) => (
              <div key={e.id} className="flex justify-between text-xs text-gray-400 py-1 border-b border-gray-800 last:border-0">
                <span className="truncate flex-1">{e.description}</span>
                <span className="text-gray-600 shrink-0 ml-2">{format(new Date(e.expenseDate), 'dd MMM')}</span>
                <span className="shrink-0 ml-3 font-medium text-gray-300">
                  {e.currency === 'USD' ? '$' : '₹'}{parseFloat(e.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row log */}
      <div className="card">
        <p className="text-sm font-medium text-gray-300 mb-3">Row-by-Row Log</p>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {log.map((entry, i) => (
            <div key={i} className={clsx('flex items-center gap-2 text-xs py-1')}>
              {entry.status === 'IMPORTED'
                ? <CheckCircle size={12} className="text-emerald-400 shrink-0" />
                : entry.status === 'ERROR'
                ? <XCircle size={12} className="text-red-400 shrink-0" />
                : <AlertTriangle size={12} className="text-yellow-400 shrink-0" />}
              <span className="text-gray-600 w-12 shrink-0">Row {entry.rowNumber}</span>
              <span className={clsx('shrink-0 font-medium', entry.status === 'IMPORTED' ? 'text-emerald-400' : entry.status === 'ERROR' ? 'text-red-400' : 'text-yellow-400')}>
                {entry.status}
              </span>
              <span className="text-gray-500 truncate">{entry.description || entry.reason}</span>
            </div>
          ))}
        </div>
      </div>

      {report.completedAt && (
        <p className="text-xs text-gray-600 text-center">Completed at {format(new Date(report.completedAt), 'HH:mm:ss, dd MMM yyyy')}</p>
      )}
    </div>
  );
}
