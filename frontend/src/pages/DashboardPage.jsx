import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { groupsApi, balancesApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Users, ArrowUpRight, ArrowDownLeft, Loader2 } from 'lucide-react';
import clsx from 'clsx';

export default function DashboardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });

  const { data: groupsRes, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });

  const { data: balancesRes } = useQuery({
    queryKey: ['my-balances'],
    queryFn: () => balancesApi.me(),
    enabled: !!user,
  });

  const createGroup = useMutation({
    mutationFn: (data) => groupsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      setShowCreate(false);
      setNewGroup({ name: '', description: '' });
      toast.success('Group created!');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create group'),
  });

  const groups = groupsRes?.data?.data || [];
  const myBalances = balancesRes?.data?.data;

  const totalOwed = myBalances?.totalOwed || 0;
  const totalOwing = myBalances?.totalOwing || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Welcome back, {user?.displayName}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> New Group
        </button>
      </div>

      {/* Balance summary */}
      {myBalances && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-900/50 flex items-center justify-center">
              <ArrowUpRight size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">You are owed</p>
              <p className="text-xl font-bold text-emerald-400">₹{totalOwed.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
            </div>
          </div>
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center">
              <ArrowDownLeft size={20} className="text-red-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">You owe</p>
              <p className="text-xl font-bold text-red-400">₹{totalOwing.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      )}

      {/* Groups list */}
      <div>
        <h2 className="text-base font-semibold text-gray-300 mb-3">Your Groups</h2>
        {isLoading ? (
          <div className="flex items-center gap-2 text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</div>
        ) : groups.length === 0 ? (
          <div className="card text-center py-12 text-gray-500">
            <Users size={32} className="mx-auto mb-3 opacity-40" />
            <p>No groups yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((group) => {
              const groupBalance = myBalances?.groups?.find((b) => b.groupId === group.id);
              const bal = groupBalance?.netBalance || 0;
              return (
                <Link key={group.id} to={`/groups/${group.id}`} className="card hover:border-gray-600 transition-colors block">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-100">{group.name}</h3>
                      {group.description && <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>}
                    </div>
                    <span className={clsx('text-sm font-semibold', bal > 0 ? 'text-emerald-400' : bal < 0 ? 'text-red-400' : 'text-gray-500')}>
                      {bal > 0 ? '+' : ''}₹{Math.abs(bal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {group.members?.filter((m) => !m.leftAt).length || 0} members
                    </span>
                    <span>{group._count?.expenses || 0} expenses</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Create group modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm">
            <h2 className="font-semibold text-gray-100 mb-4">New Group</h2>
            <form onSubmit={(e) => { e.preventDefault(); createGroup.mutate(newGroup); }} className="space-y-4">
              <div>
                <label className="label">Group Name *</label>
                <input className="input" placeholder="Flat Expenses 2026" required
                  value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input" placeholder="Optional description"
                  value={newGroup.description} onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-secondary flex-1 justify-center" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn-primary flex-1 justify-center" disabled={createGroup.isPending}>
                  {createGroup.isPending ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
