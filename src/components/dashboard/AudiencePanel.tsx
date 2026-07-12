import React, { useEffect, useState } from 'react';
import { audienceApi } from '../../services/api';
import { Card, Banner, AccountSelector } from '../ui/common';
import type { Account } from '../../pages/Dashboard';

export default function AudiencePanel({ accounts }: { accounts: Account[] }) {
  const [audience, setAudience] = useState<any[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function load() {
    try {
      const { audience } = await audienceApi.getAll();
      setAudience(audience);
    } catch (err: any) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function collect() {
    setError(null);
    setInfo(null);
    if (!selected.length || !source) {
      setError('Pick an account and a source channel.');
      return;
    }
    setBusy(true);
    try {
      const res = await audienceApi.collect({ accountId: selected[0], source });
      setInfo(`Collected ${res.collected} member(s).`);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card title="Collect audience" subtitle="Pull participants from a channel or group">
        {error && <div className="mb-3"><Banner kind="error">{error}</Banner></div>}
        {info && <div className="mb-3"><Banner kind="success">{info}</Banner></div>}
        <div className="space-y-3">
          <div>
            <label className="label">Account</label>
            <AccountSelector accounts={accounts} selected={selected} onChange={setSelected} multi={false} />
          </div>
          <div>
            <label className="label">Source channel / group</label>
            <input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="@channel" />
          </div>
          <button className="btn-primary" onClick={collect} disabled={busy}>
            {busy ? 'Collecting…' : 'Collect'}
          </button>
        </div>
      </Card>

      <Card
        title="Collected audience"
        subtitle={`${audience.length} member(s)`}
        actions={
          <button
            className="btn-secondary"
            onClick={async () => {
              await audienceApi.clear();
              load();
            }}
          >
            Clear
          </button>
        }
      >
        {audience.length === 0 ? (
          <p className="text-sm text-slate-500">No audience collected yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-400">
                  <th className="pb-2">Username</th>
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {audience.map((m) => (
                  <tr key={m.id} className="border-b border-slate-800/60">
                    <td className="py-1.5 text-slate-200">{m.username ? `@${m.username}` : '—'}</td>
                    <td className="py-1.5 text-slate-400">{m.first_name || '—'}</td>
                    <td className="py-1.5 text-slate-500">{m.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
