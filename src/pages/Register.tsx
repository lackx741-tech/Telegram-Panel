import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi, setToken } from '../services/api';

export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await authApi.register({ username, password });
      setToken(token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white">Create account</h1>
          <p className="mt-1 text-sm text-slate-400">Set up your Telegram Panel login</p>
        </div>
        {error && (
          <div className="rounded-md border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        <div>
          <label className="label">Username</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
        <p className="text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-400 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
