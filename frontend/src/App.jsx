import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import GroupPage from './pages/GroupPage';
import ExpensesPage from './pages/ExpensesPage';
import BalancesPage from './pages/BalancesPage';
import SettlementsPage from './pages/SettlementsPage';
import ImportPage from './pages/ImportPage';
import AnomalyReviewPage from './pages/AnomalyReviewPage';
import ImportReportPage from './pages/ImportReportPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="groups/:groupId" element={<GroupPage />} />
          <Route path="groups/:groupId/expenses" element={<ExpensesPage />} />
          <Route path="groups/:groupId/balances" element={<BalancesPage />} />
          <Route path="groups/:groupId/settlements" element={<SettlementsPage />} />
          <Route path="groups/:groupId/import" element={<ImportPage />} />
          <Route path="import/:jobId/review" element={<AnomalyReviewPage />} />
          <Route path="import/:jobId/report" element={<ImportReportPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
