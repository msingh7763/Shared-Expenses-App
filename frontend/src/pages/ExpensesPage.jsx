import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesApi, groupsApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';

const SPLIT_TYPES = ['EQUAL', 'UNEQUAL', 'PERCENTAGE', 'SHARE'];
const CURRENCIES = ['INR', 'USD'];

function ExpenseRow({ expense, onDelete }) {
  const [open, setOpen] = useState(false);
  const total = parseFloat(expense.amountInr || expense.amount);

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-800/50" onClick={() => setOpen((o) => !o)}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-200 truncate">{expense.description}</p>
          <p className="text-xs text-gray-500">{format(new Date(expense.expenseDate), 'dd MMM yyyy')} · Paid by {expense.paidBy?.displayName || expense.paidByName}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-gray-100">
            {expense.currency === 'USD' ? '$' : '₹'}{parseFloat(expense.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            {expense.currency === 'USD' && <span className="text-xs text-gray-500 ml-1">(₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })})</span>}
          </p>
          <span className="text-xs text-gray-600">{expense.splitType}</span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onDelete(expense.id); }} className="text-gray-600 hover:text-red-400 p-1 transition-colors ml-1">
          <Trash2 size={14} />
        </button>
        {open ? <ChevronUp size={14} className="text-gray-600" /> : <ChevronDown size={14} className="text-gray-600" />}
      </div>

      {open && expense.splits && (
        <div className="border-t border-gray-800 bg-gray-950/50 px-4 py-3">
          <p className="text-xs text-gray-500 mb-2 font-medium">Split breakdown</p>
          <div className="space-y-1">
            {expense.splits.map((s) => (
              <div key={s.id} className="flex justify-between text-xs text-gray-400">
                <span>{s.user?.displayName || s.userName}</span>
                <span className="font-medium text-gray-300">
                  {expense.currency === 'USD' ? '$' : '₹'}{parseFloat(s.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
          {expense.notes && <p className="text-xs text-gray-600 mt-2 italic">Note: {expense.notes}</p>}
        </div>
      )}
    </div>
  );
}

export default function ExpensesPage() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(1);

  const [form, setForm] = useState({
    description: '', amount: '', currency: 'INR', splitType: 'EQUAL',
    expenseDate: new Date().toISOString().split('T')[0],
    splitWith: '', splitDetails: '', notes: '',
  });

  const { data: groupRes } = useQuery({ queryKey: ['group', groupId], queryFn: () => groupsApi.get(groupId) });
  const group = groupRes?.data?.data;
  const activeMembers = (group?.members || []).filter((m) => !m.leftAt).map((m) => m.user.displayName);

  const { data: expensesRes, isLoading } = useQuery({
    queryKey: ['expenses', groupId, page],
    queryFn: () => expensesApi.list(groupId, { page, limit: 20 }),
  });

  const expenses = expensesRes?.data?.data || [];
  const pagination = expensesRes?.data?.pagination;

  const createExpense = useMutation({
    mutationFn: (data) => expensesApi.create(groupId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', groupId] });
      qc.invalidateQueries({ queryKey: ['balances', groupId] });
      setShowAdd(false);
      resetForm();
      toast.success('Expense added!');
    },
    onError: (err) => {
      const msg = err.response?.data?.details?.map((d) => d.message).join(', ') || err.response?.data?.error || 'Failed to add expense';
      toast.error(msg);
    },
  });

  const deleteExpense = useMutation({
    mutationFn: (id) => expensesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', groupId] });
      qc.invalidateQueries({ queryKey: ['balances', groupId] });
      toast.success('Expense deleted');
    },
    onError: () => toast.error('Failed to delete expense'),
  });

  const resetForm = () => setForm({
    description: '', amount: '', currency: 'INR', splitType: 'EQUAL',
    expenseDate: new Date().toISOString().split('T')[0],
    splitWith: '', splitDetails: '', notes: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const splitWith = form.splitWith ? form.splitWith.split(',').map((s) => s.trim()).filter(Boolean) : activeMembers;
    createExpense.mutate({
      description: form.description,
      amount: parseFloat(form.amount),
      currency: form.currency,
      splitType: form.splitType,
      expenseDate: form.expenseDate,
      splitWith,
      splitDetails: form.splitDetails || undefined,
      notes: form.notes || undefined,
    });
  };

  const f = (field) => ({ value: form[field], onChange: (e) => setForm({ ...form, [field]: e.target.value }) });

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100">Expenses</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add Expense</button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500 justify-center py-10"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : expenses.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">No expenses yet.</div>
      ) : (
        <div className="space-y-2">
          {expenses.map((e) => (
            <ExpenseRow key={e.id} expense={e} onDelete={(id) => deleteExpense.mutate(id)} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button className="btn-secondary" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>Previous</button>
          <span className="text-gray-500">{page} / {pagination.totalPages}</span>
          <button className="btn-secondary" onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.totalPages}>Next</button>
        </div>
      )}

      {/* Add expense modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md my-4">
            <h2 className="font-semibold text-gray-100 mb-4">Add Expense</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Description *</label>
                <input className="input" required placeholder="Groceries" {...f('description')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Amount *</label>
                  <input className="input" type="number" step="0.01" min="0.01" required placeholder="1500" {...f('amount')} />
                </div>
                <div>
                  <label className="label">Currency</label>
                  <select className="input" {...f('currency')}>
                    {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date *</label>
                  <input className="input" type="date" required {...f('expenseDate')} />
                </div>
                <div>
                  <label className="label">Split Type</label>
                  <select className="input" {...f('splitType')}>
                    {SPLIT_TYPES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">
                  Split With (comma-separated names, blank = all active members)
                </label>
                <input className="input" placeholder={activeMembers.join(', ')} {...f('splitWith')} />
                <p className="text-xs text-gray-600 mt-1">Active: {activeMembers.join(', ')}</p>
              </div>
              {form.splitType !== 'EQUAL' && (
                <div>
                  <label className="label">
                    {form.splitType === 'PERCENTAGE' && 'Percentages (e.g. Aisha 30%; Rohan 30%; Priya 40%)'}
                    {form.splitType === 'UNEQUAL' && 'Amounts (e.g. Aisha 700; Rohan 400; Priya 400)'}
                    {form.splitType === 'SHARE' && 'Shares (e.g. Aisha 1; Rohan 2; Priya 1)'}
                  </label>
                  <input className="input" placeholder="Name value; Name value" {...f('splitDetails')} />
                </div>
              )}
              <div>
                <label className="label">Notes</label>
                <input className="input" placeholder="Optional note" {...f('notes')} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-secondary flex-1 justify-center" onClick={() => { setShowAdd(false); resetForm(); }}>Cancel</button>
                <button type="submit" className="btn-primary flex-1 justify-center" disabled={createExpense.isPending}>
                  {createExpense.isPending ? 'Adding…' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
