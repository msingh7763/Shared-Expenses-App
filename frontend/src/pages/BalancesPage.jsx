import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { balancesApi } from '../lib/api';
import { ArrowRight, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { format } from 'date-fns';

function BalanceBar({ value, maxAbs }) {
  const pct = maxAbs > 0 ? (Math.abs(value) / maxAbs) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', value >= 0 ? 'bg-emerald-500' : 'bg-red-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MemberBalance({ member, maxAbs }) {
  const [showTrace, setShowTrace] = useState(false);
  const bal = member.netBalance;

  return (
    <div className={clsx('border rounded-lg overflow-hidden', member.isActive ? 'border-gray-800' : 'border-gray-800/50 opacity-60')}>
      <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-800/40" onClick={() => setShowTrace((o) => !o)}>
        <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold',
          bal >= 0 ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300')}>
          {member.displayName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-200">
            {member.displayName}
            {!member.isActive && <span className="ml-2 text-xs text-gray-600">(left)</span>}
          </p>
          <BalanceBar value={bal} maxAbs={maxAbs} />
        </div>
        <div className="text-right shrink-0">
          <p className={clsx('text-sm font-bold', bal > 0 ? 'text-emerald-400' : bal < 0 ? 'text-red-400' : 'text-gray-500')}>
            {bal >= 0 ? '+' : ''}₹{Math.abs(bal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-600">{bal > 0 ? 'is owed' : bal < 0 ? 'owes' : 'settled'}</p>
        </div>
        {showTrace ? <ChevronUp size={14} className="text-gray-600" /> : <ChevronDown size={14} className="text-gray-600" />}
      </div>

      {showTrace && member.traces.length > 0 && (
        <div className="border-t border-gray-800 bg-gray-950/50 px-4 py-3 max-h-56 overflow-y-auto">
          <p className="text-xs font-medium text-gray-500 mb-2">Expense trace</p>
          <div className="space-y-1.5">
            {member.traces.map((t, i) => (
              <div key={i} className="flex justify-between items-start gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <span className={clsx('mr-1 px-1 py-0.5 rounded text-[10px] font-medium',
                    t.role === 'paid' ? 'bg-emerald-900/40 text-emerald-400' :
                    t.role === 'owes' ? 'bg-red-900/40 text-red-400' :
                    'bg-gray-800 text-gray-400')}>
                    {t.role}
                  </span>
                  <span className="text-gray-400 truncate">{t.description}</span>
                  <span className="text-gray-600 ml-1">{t.date ? format(new Date(t.date), 'MMM d') : ''}</span>
                </div>
                <span className={clsx('font-medium shrink-0', t.amount >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {t.amount >= 0 ? '+' : ''}₹{Math.abs(t.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BalancesPage() {
  const { groupId } = useParams();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['balances', groupId],
    queryFn: () => balancesApi.group(groupId),
  });

  const result = data?.data?.data;

  if (isLoading) return (
    <div className="flex items-center gap-2 text-gray-500 justify-center py-16"><Loader2 size={16} className="animate-spin" /> Computing balances…</div>
  );

  if (!result) return <p className="text-gray-500">No balance data.</p>;

  const maxAbs = Math.max(...result.memberBalances.map((b) => Math.abs(b.netBalance)), 1);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100">Balances</h1>
        <button className="btn-secondary text-xs" onClick={() => refetch()}>Refresh</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="card py-4">
          <p className="text-xl font-bold text-gray-100">{result.totalExpenses}</p>
          <p className="text-xs text-gray-500 mt-1">Expenses</p>
        </div>
        <div className="card py-4">
          <p className="text-xl font-bold text-gray-100">₹{result.totalExpenseAmountInr?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          <p className="text-xs text-gray-500 mt-1">Total Spent (INR)</p>
        </div>
        <div className="card py-4">
          <p className="text-xl font-bold text-gray-100">{result.totalSettlements}</p>
          <p className="text-xs text-gray-500 mt-1">Settlements</p>
        </div>
      </div>

      {/* Simplified debts */}
      {result.simplifiedDebts.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-200 mb-4">Who Owes Whom</h2>
          <div className="space-y-3">
            {result.simplifiedDebts.map((d, i) => (
              <div key={i} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-4 py-3">
                <span className="text-sm font-medium text-red-300">{d.fromDisplayName}</span>
                <ArrowRight size={14} className="text-gray-600 shrink-0" />
                <span className="text-sm font-medium text-emerald-300">{d.toDisplayName}</span>
                <span className="ml-auto text-sm font-bold text-gray-100">₹{d.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.simplifiedDebts.length === 0 && (
        <div className="card text-center py-8 text-emerald-400 font-medium">✓ All settled up!</div>
      )}

      {/* Per-member balances */}
      <div>
        <h2 className="font-semibold text-gray-200 mb-3">Member Balances</h2>
        <div className="space-y-2">
          {result.memberBalances
            .sort((a, b) => b.netBalance - a.netBalance)
            .map((m) => (
              <MemberBalance key={m.userId} member={m} maxAbs={maxAbs} />
            ))}
        </div>
      </div>

      <p className="text-xs text-gray-600 text-center">Computed at {format(new Date(result.computedAt), 'HH:mm:ss, dd MMM yyyy')}</p>
    </div>
  );
}
