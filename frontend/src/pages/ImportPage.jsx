import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { importApi } from '../lib/api';
import toast from 'react-hot-toast';
import { Upload, FileText, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';

export default function ImportPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.name.endsWith('.csv')) setFile(dropped);
    else toast.error('Only CSV files are accepted');
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const res = await importApi.upload(groupId, file);
      const { jobId, totalRows, anomalies, errors, warnings } = res.data.data;
      toast.success(`Parsed ${totalRows} rows — ${anomalies} anomalies found`);
      navigate(`/import/${jobId}/review`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-100">Import CSV</h1>
        <p className="text-sm text-gray-500 mt-1">Upload your expenses CSV. Every row is analyzed for anomalies before import.</p>
      </div>

      {/* How it works */}
      <div className="card space-y-3">
        <h2 className="font-medium text-gray-200 text-sm">Import wizard</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { icon: Upload, label: '1. Upload CSV', desc: 'Drop your file here', active: true },
            { icon: AlertTriangle, label: '2. Review Anomalies', desc: 'Approve or reject each issue' },
            { icon: CheckCircle, label: '3. Apply Import', desc: 'Approved rows are saved' },
          ].map(({ icon: Icon, label, desc, active }) => (
            <div key={label} className={clsx('rounded-lg p-3 border', active ? 'border-brand-600 bg-brand-900/20' : 'border-gray-800 bg-gray-800/30')}>
              <Icon size={20} className={clsx('mx-auto mb-2', active ? 'text-brand-400' : 'text-gray-600')} />
              <p className="text-xs font-medium text-gray-300">{label}</p>
              <p className="text-xs text-gray-600 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={clsx(
          'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
          dragging ? 'border-brand-500 bg-brand-900/10' : 'border-gray-700 hover:border-gray-500',
          file ? 'border-emerald-600 bg-emerald-900/10' : ''
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current.click()}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => setFile(e.target.files[0])} />
        {file ? (
          <>
            <FileText size={32} className="mx-auto mb-3 text-emerald-400" />
            <p className="font-medium text-emerald-300">{file.name}</p>
            <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
          </>
        ) : (
          <>
            <Upload size={32} className="mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400 font-medium">Drop CSV file here or click to browse</p>
            <p className="text-xs text-gray-600 mt-1">Max 5MB · CSV format only</p>
          </>
        )}
      </div>

      {/* Anomaly types info */}
      <div className="card">
        <p className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">Anomalies we detect</p>
        <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-500">
          {[
            'Duplicate expenses', 'Near-duplicate expenses', 'Negative amounts', 'Zero amounts',
            'Missing payer', 'Missing currency', 'Invalid currency', 'Settlement logged as expense',
            'Unknown/invalid members', 'Split % mismatch', 'Invalid date format', 'Ambiguous dates',
            'Membership conflicts', 'Future dates', 'Comma-formatted amounts', 'Split type mismatch',
            'Name variants/typos',
          ].map((a) => (
            <div key={a} className="flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-gray-600 shrink-0" />
              {a}
            </div>
          ))}
        </div>
      </div>

      <button
        className="btn-primary w-full justify-center py-3 text-base"
        disabled={!file || loading}
        onClick={handleUpload}
      >
        {loading ? (
          <><Loader2 size={18} className="animate-spin" /> Analyzing CSV…</>
        ) : (
          <><Upload size={18} /> Upload &amp; Analyze</>
        )}
      </button>
    </div>
  );
}
