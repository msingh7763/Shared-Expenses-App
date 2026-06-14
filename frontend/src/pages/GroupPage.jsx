import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { groupsApi } from '../lib/api';
import { Receipt, Scale, CreditCard, Upload, Users, Calendar, UserMinus } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';

export default function GroupPage() {
  const { groupId } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => groupsApi.get(groupId),
  });

  const group = data?.data?.data;

  if (isLoading) return <div className="flex items-center gap-2 text-gray-500 py-10 justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!group) return <p className="text-gray-500">Group not found.</p>;

  const activeMembers = group.members?.filter((m) => !m.leftAt) || [];
  const pastMembers = group.members?.filter((m) => m.leftAt) || [];

  const quickLinks = [
    { to: `/groups/${groupId}/expenses`, Icon: Receipt, label: 'Expenses', desc: `${group._count?.expenses || 0} total`, color: 'text-blue-400' },
    { to: `/groups/${groupId}/balances`, Icon: Scale, label: 'Balances', desc: 'Who owes whom', color: 'text-emerald-400' },
    { to: `/groups/${groupId}/settlements`, Icon: CreditCard, label: 'Settlements', desc: `${group._count?.settlements || 0} recorded`, color: 'text-purple-400' },
    { to: `/groups/${groupId}/import`, Icon: Upload, label: 'Import CSV', desc: 'Import expenses', color: 'text-orange-400' },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">{group.name}</h1>
        {group.description && <p className="text-sm text-gray-500 mt-1">{group.description}</p>}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickLinks.map(({ to, Icon, label, desc, color }) => (
          <Link key={to} to={to} className="card hover:border-gray-600 transition-colors text-center space-y-2 py-6">
            <Icon size={24} className={clsx('mx-auto', color)} />
            <p className="text-sm font-medium text-gray-200">{label}</p>
            <p className="text-xs text-gray-500">{desc}</p>
          </Link>
        ))}
      </div>

      {/* Active members */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-brand-400" />
          <h2 className="font-semibold text-gray-200">Active Members ({activeMembers.length})</h2>
        </div>
        <div className="space-y-2">
          {activeMembers.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-800 flex items-center justify-center text-xs font-bold text-brand-200">
                  {m.user.displayName[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-200">{m.user.displayName}</p>
                  <p className="text-xs text-gray-500">@{m.user.username}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={clsx('text-xs px-2 py-0.5 rounded-full', m.role === 'admin' ? 'bg-brand-900/50 text-brand-300' : 'bg-gray-800 text-gray-400')}>
                  {m.role}
                </span>
                <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
                  <Calendar size={10} />
                  Joined {format(new Date(m.joinedAt), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Past members */}
      {pastMembers.length > 0 && (
        <div className="card opacity-70">
          <div className="flex items-center gap-2 mb-4">
            <UserMinus size={16} className="text-gray-500" />
            <h2 className="font-semibold text-gray-400">Past Members ({pastMembers.length})</h2>
          </div>
          <div className="space-y-2">
            {pastMembers.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-500">
                    {m.user.displayName[0]}
                  </div>
                  <p className="text-sm text-gray-400">{m.user.displayName}</p>
                </div>
                <div className="text-right text-xs text-gray-600">
                  <p>Joined {format(new Date(m.joinedAt), 'MMM d')}</p>
                  <p>Left {format(new Date(m.leftAt), 'MMM d, yyyy')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
