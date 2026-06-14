import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settlementsApi, groupsApi, balancesApi } from '../lib/api';
import toast from 'react-hot-toast';
import { Plus, Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function SettlementsPage() {
  const { groupId } = useParams();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    fromUserId: '', toUserId: '', amount: '', currency: 'INR',
    settledAt: new Date().toISOString().split('T')[0], notes: '',
  });

  const { data: groupRes } = useQuery({ queryKey: ['group', groupId], queryFn: () => groupsApi.get(groupId) });
  const group = groupRes?.data?.data;
  const allMembers = group?.members || [];

  const { data: settlementsRes, isLoading } = useQuery({
    queryKey: ['settlements', groupId],
    queryFn: () => settlementsApi.list(groupId),
  });

  const { data: balancesRes } = useQuery({
    queryKey: ['balances', groupId],
    queryFn: () => balancesApi.group(groupId),
  });

  const settlements = settlementsRes?.data?.data || [];
  const simplifiedDebts = balancesRes?.data?.data?.simplifiedDebts || [];

  const createSettlement = useMutation({
    mutationFn: (data) => settlementsApi.create(groupId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements', groupId] });
      qc.invalidateQueries({ queryKey: ['balances', groupId] });
      setShowAdd(false);
      resetForm();
      toast.success('Settlement recorded!');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to record settlement'),
  });

  const deleteSettlement = useMutation({
    mutationFn: (id) => settlementsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements', groupId] });
      qc.invalidateQueries({ queryKey: ['balances', groupId] });
      toast.success('Settlement removed');
    },
    onError: () => toast.error('Failed to delete settlement'),
  });

  const resetForm = () => setForm({
    fromUserId: '', toUserId: '', amount: '', currency: 'INR',
    settledAt: new Date().toISOString().split('T')[0], notes: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createSettlement.mutate({
      ...form,
      amount: parseFloat(form.amount),
    });
  };

  const f = (field) => ({ value: form[field], onChange: (e) => setForm({ ...form, [field]: e.target.value }) });

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100">Settlements</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Record Settlement</button>
      </div>

      {/* Suggested settlements */}
      {simplifiedDebts.length > 0 && (
        <div className="card">
          <p className="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wider">Suggested Payments</p>
          <div className="space-y-2">
            {simplifiedDebts.map((d, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-red-300 font-medium">{d.fromDisplayName}</span>
                <ArrowRight size={12} className="text-gray-600" />
                <span className="text-emerald-300 font-medium">{d.toDisplayName}</span>
                <span className="ml-auto font-bold text-gray-200">₹{d.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <button className="btn-success text-xs py-1 px-2"
                  onClick={() => {
                    setForm({ fromUserId: d.fromUserId, toUserId: d.toUserId, amount: d.amount, currency: 'INR', settledAt: new Date().toISOString().split('T')[0], notes: '' });
                    setShowAdd(true);
                  }}>
                  Record
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500 justify-center py-10"><Loader2 size={16} className="animate-spin" /></div>
      ) : settlements.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">No settlements recorded yet.</div>
      ) : (
        <div className="space-y-2">
          {settlements.map((s) => (
            <div key={s.id} className="card flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-red-300">{s.fromUser.displayName}</span>
                  <ArrowRight size={12} className="text-gray-600" />
                  <span className="font-medium text-emerald-300">{s.toUser.displayName}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {format(new Date(s.settledAt), 'dd MMM yyyy')}
                  {s.notes && ` · ${s.notes}`}
                </p>
              </div>
              <p className="text-sm font-bold text-gray-100 shrink-0">
                {s.currency === 'USD' ? '$' : '₹'}{parseFloat(s.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
              <button onClick={() => deleteSettlement.mutate(s.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm">
            <h2 className="font-semibold text-gray-100 mb-4">Record Settlement</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">From (payer) *</label>
                <select className="input" required {...f('fromUserId')}>
                  <option value="">Select person</option>
                  {allMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>{m.user.displayName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">To (recipient) *</label>
                <select className="input" required {...f('toUserId')}>
                  <option value="">Select person</option>
                  {allMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>{m.user.displayName}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Amount *</label>
                  <input className="input" type="number" step="0.01" min="0.01" required {...f('amount')} />
                </div>
                <div>
                  <label className="label">Currency</label>
                  <select className="input" {...f('currency')}>
                    <option>INR</option>
                    <option>USD</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Date *</label>
                <input className="input" type="date" required {...f('settledAt')} />
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input" placeholder="Optional note" {...f('notes')} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-secondary flex-1 justify-center" onClick={() => { setShowAdd(false); resetForm(); }}>Cancel</button>
                <button type="submit" className="btn-primary flex-1 justify-center" disabled={createSettlement.isPending}>
                  {createSettlement.isPending ? 'Saving…' : 'Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
