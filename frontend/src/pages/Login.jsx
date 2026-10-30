import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-theme-main px-4 relative">
      {/* Theme toggle in top right */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg text-theme-muted hover:text-theme-text bg-theme-card border border-theme-border shadow-sm transition-colors"
        title="Toggle dark/light mode"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4 text-emerald-400" /> : <Moon className="w-4 h-4 text-theme-primary" />}
      </button>

      <div className="card w-full max-w-sm border border-theme-border shadow-md p-6 bg-theme-card">
        <div className="w-12 h-12 rounded-xl bg-theme-primary text-white flex items-center justify-center font-bold text-lg mx-auto mb-3 shadow-sm">
          IM
        </div>
        <h1 className="text-xl font-bold text-center text-theme-text mb-1">Installment System</h1>
        <p className="text-sm text-theme-muted text-center mb-6">Sign in to your account</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email Address</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[11px] text-theme-muted mt-6 pt-4 border-t border-theme-border">
          Software Development by SHOUKAT | 03348004300
        </p>
      </div>
    </div>
  );
}
