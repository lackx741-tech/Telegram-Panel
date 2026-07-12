import React, { useEffect, useState } from 'react';
import { settingsApi } from '../../services/api';
import { Card, Banner } from '../ui/common';

export default function SettingsPanel() {
  const [settings, setSettings] = useState<any>(null);
  const [apiPool, setApiPool] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await settingsApi.get();
      setSettings(res.settings);
      setApiPool(res.apiPool);
    } catch (err: any) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function update(key: string, value: any) {
    setSettings((s: any) => ({ ...s, [key]: value }));
  }

  async function save() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await settingsApi.update(settings);
      setSettings(res.settings);
      setInfo('Settings saved.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <p className="text-sm text-slate-500">Loading settings…</p>;
  }

  const numberFields: { key: string; label: string }[] = [
    { key: 'rate_limit_per_minute', label: 'Rate limit (per minute)' },
    { key: 'min_delay_seconds', label: 'Min delay between ops (s)' },
    { key: 'max_delay_seconds', label: 'Max delay between ops (s)' },
    { key: 'max_concurrency', label: 'Max concurrency' },
  ];

  return (
    <div className="space-y-6">
      <Card title="Rate limits & delays" subtitle="Applied to bulk automation operations">
        {error && <div className="mb-3"><Banner kind="error">{error}</Banner></div>}
        {info && <div className="mb-3"><Banner kind="success">{info}</Banner></div>}
        <div className="grid gap-4 md:grid-cols-2">
          {numberFields.map((f) => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              <input
                type="number"
                className="input"
                value={settings[f.key] ?? ''}
                onChange={(e) => update(f.key, Number(e.target.value))}
              />
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="accent-blue-500"
              checked={!!settings.flood_wait_retry}
              onChange={(e) => update('flood_wait_retry', e.target.checked)}
            />
            Handle FloodWait gracefully
          </label>
        </div>
        <div className="mt-4">
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </Card>

      <Card title="API credential pool" subtitle="Round-robin Telegram API credentials">
        {!apiPool || apiPool.size === 0 ? (
          <Banner kind="info">
            No API credentials configured. Set <code>TELEGRAM_API_ID</code>/<code>TELEGRAM_API_HASH</code> or{' '}
            <code>TELEGRAM_API_POOL</code> on the backend.
          </Banner>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-400">
              {apiPool.size} credential(s) in pool · currently at index {apiPool.current}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-400">
                  <th className="pb-2">API ID</th>
                  <th className="pb-2">API hash</th>
                </tr>
              </thead>
              <tbody>
                {apiPool.credentials.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-slate-800/60">
                    <td className="py-1.5 font-mono text-slate-200">{c.apiId}</td>
                    <td className="py-1.5 font-mono text-slate-500">{c.apiHash}</td>
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
