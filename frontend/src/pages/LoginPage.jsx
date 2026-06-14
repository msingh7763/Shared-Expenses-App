import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center font-bold text-white text-xl mx-auto mb-3">S</div>
          <h1 className="text-2xl font-bold text-gray-100">Welcome back</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to Spreetail</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" autoComplete="email" placeholder="you@example.com"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" autoComplete="current-password" placeholder="••••••••"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          No account?{' '}
          <Link to="/register" className="text-brand-400 hover:text-brand-300 font-medium">Register</Link>
        </p>

        {/* Demo hint */}
        <div className="mt-4 card text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-400">Demo accounts (password: password123)</p>
          <p>aisha@example.com / rohan@example.com</p>
          <p>priya@example.com / meera@example.com</p>
          <p>sam@example.com / dev@example.com</p>
        </div>
      </div>
    </div>
  );
}
