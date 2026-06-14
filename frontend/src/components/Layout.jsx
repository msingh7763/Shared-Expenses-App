import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { groupsApi } from '../lib/api';
import {
  LayoutDashboard, Users, Receipt, Scale, CreditCard, Upload, LogOut, ChevronRight, Menu, X
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: groupsRes } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });
  const groups = groupsRes?.data?.data || [];

  const handleLogout = () => { logout(); navigate('/login'); };

  const navItem = (to, Icon, label, exact = false) => (
    <NavLink
      to={to}
      end={exact}
      onClick={() => setSidebarOpen(false)}
      className={({ isActive }) =>
        clsx('flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
          isActive ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800')
      }
    >
      <Icon size={16} />
      {label}
    </NavLink>
  );

  const sidebar = (
    <aside className="flex flex-col h-full w-64 bg-gray-900 border-r border-gray-800 p-4 gap-6">
      {/* Logo */}
      <div className="flex items-center gap-2 px-1 pt-1">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center font-bold text-white text-sm">S</div>
        <span className="font-semibold text-gray-100">Spreetail</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 space-y-1">
        {navItem('/dashboard', LayoutDashboard, 'Dashboard', true)}

        {/* Groups */}
        {groups.length > 0 && (
          <div className="pt-3">
            <p className="text-xs text-gray-600 uppercase tracking-wider px-3 mb-2">Groups</p>
            {groups.map((g) => (
              <div key={g.id} className="space-y-0.5">
                <NavLink
                  to={`/groups/${g.id}`}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    clsx('flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors',
                      isActive ? 'bg-gray-800 text-gray-100' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800')
                  }
                >
                  <span className="truncate">{g.name}</span>
                  <ChevronRight size={12} />
                </NavLink>
                <div className="pl-4 space-y-0.5">
                  {navItem(`/groups/${g.id}/expenses`, Receipt, 'Expenses')}
                  {navItem(`/groups/${g.id}/balances`, Scale, 'Balances')}
                  {navItem(`/groups/${g.id}/settlements`, CreditCard, 'Settlements')}
                  {navItem(`/groups/${g.id}/import`, Upload, 'Import CSV')}
                </div>
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-gray-800 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {user?.displayName?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{user?.displayName}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="text-gray-500 hover:text-red-400 transition-colors p-1" title="Logout">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — desktop always visible, mobile drawer */}
      <div className={clsx(
        'fixed inset-y-0 left-0 z-30 lg:relative lg:z-auto transition-transform duration-200',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {sidebar}
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-gray-100">
            <Menu size={20} />
          </button>
          <span className="font-semibold text-gray-100">Spreetail</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
