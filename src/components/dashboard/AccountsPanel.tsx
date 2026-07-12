import React, { useState } from 'react';
import { accountsApi } from '../../services/api';
import { Card, StatusBadge, Banner } from '../ui/common';
import type { Account } from '../../pages/Dashboard';

export default function AccountsPanel({
  accounts,
  onChange,
}: {
  accounts: Account[];
  onChange: () => void;
}) {
  const [form, setForm] = useState({ phone: '', sessionString: '', firstName: '', username: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await accountsApi.create(form);
      setForm({ phone: '', sessionString: '', firstName: '', username: '' });
      onChange();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await accountsApi.delete(id);
    onChange();
  }

  return (
    <div className="space-y-6">
      <Card title="Add account" subtitle="Register an account from its GramJS session string">
        {error && <div className="mb-3"><Banner kind="error">{error}</Banner></div>}
        <form onSubmit={add} className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+15551234567"
              required
            />
          </div>
          <div>
            <label className="label">Username (optional)</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="handle"
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Session string</label>
            <textarea
              className="input font-mono text-xs"
              rows={3}
              value={form.sessionString}
              onChange={(e) => setForm({ ...form, sessionString: e.target.value })}
              placeholder="1BQANOTEuMTA5LjE..."
              required
            />
          </div>
          <div>
            <button className="btn-primary" disabled={busy}>
              {busy ? 'Adding…' : 'Add account'}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Accounts" subtitle={`${accounts.length} registered`}>
        {accounts.length === 0 ? (
          <p className="text-sm text-slate-500">No accounts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-400">
                <th className="pb-2">Phone</th>
                <th className="pb-2">Username</th>
                <th className="pb-2">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-slate-800/60">
                  <td className="py-2 text-slate-200">{a.phone}</td>
                  <td className="py-2 text-slate-400">{a.username ? `@${a.username}` : '—'}</td>
                  <td className="py-2"><StatusBadge status={a.status} /></td>
                  <td className="py-2 text-right">
                    <button onClick={() => remove(a.id)} className="text-xs text-red-400 hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
