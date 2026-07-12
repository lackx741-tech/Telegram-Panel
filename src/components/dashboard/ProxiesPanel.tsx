import React, { useEffect, useState } from 'react';
import { proxiesApi } from '../../services/api';
import { Card, Banner, StatusBadge } from '../ui/common';

type Proxy = {
  id: number;
  protocol: string;
  host: string;
  port: number;
  username?: string;
  status: string;
};

const EMPTY = { protocol: 'socks5', host: '', port: '', username: '', password: '' };

export default function ProxiesPanel() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [form, setForm] = useState<any>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<number, string>>({});

  async function load() {
    try {
      const { proxies } = await proxiesApi.getAll();
      setProxies(proxies);
    } catch (err: any) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await proxiesApi.create({ ...form, port: Number(form.port) });
      setForm(EMPTY);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function test(id: number) {
    setTestResult((r) => ({ ...r, [id]: 'testing…' }));
    try {
      const res = await proxiesApi.test(id);
      setTestResult((r) => ({ ...r, [id]: res.ok ? `ok (${res.latencyMs}ms)` : `fail: ${res.error}` }));
      load();
    } catch (err: any) {
      setTestResult((r) => ({ ...r, [id]: `fail: ${err.message}` }));
    }
  }

  async function remove(id: number) {
    await proxiesApi.delete(id);
    load();
  }

  return (
    <div className="space-y-6">
      <Card title="Add proxy">
        {error && <div className="mb-3"><Banner kind="error">{error}</Banner></div>}
        <form onSubmit={add} className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="label">Protocol</label>
            <select
              className="input"
              value={form.protocol}
              onChange={(e) => setForm({ ...form, protocol: e.target.value })}
            >
              <option value="socks5">socks5</option>
              <option value="socks4">socks4</option>
              <option value="http">http</option>
              <option value="https">https</option>
            </select>
          </div>
          <div>
            <label className="label">Host</label>
            <input className="input" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required />
          </div>
          <div>
            <label className="label">Port</label>
            <input
              type="number"
              className="input"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Username (optional)</label>
            <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <label className="label">Password (optional)</label>
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full">Add proxy</button>
          </div>
        </form>
      </Card>

      <Card title="Proxies" subtitle={`${proxies.length} configured`}>
        {proxies.length === 0 ? (
          <p className="text-sm text-slate-500">No proxies yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-400">
                <th className="pb-2">Endpoint</th>
                <th className="pb-2">Protocol</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Test</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {proxies.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/60">
                  <td className="py-2 font-mono text-slate-200">
                    {p.host}:{p.port}
                  </td>
                  <td className="py-2 text-slate-400">{p.protocol}</td>
                  <td className="py-2"><StatusBadge status={p.status} /></td>
                  <td className="py-2">
                    <button className="text-xs text-blue-400 hover:underline" onClick={() => test(p.id)}>
                      Test
                    </button>
                    {testResult[p.id] && <span className="ml-2 text-xs text-slate-500">{testResult[p.id]}</span>}
                  </td>
                  <td className="py-2 text-right">
                    <button className="text-xs text-red-400 hover:underline" onClick={() => remove(p.id)}>
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
