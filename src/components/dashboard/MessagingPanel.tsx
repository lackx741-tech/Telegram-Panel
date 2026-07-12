import React, { useEffect, useState } from 'react';
import { messagesApi } from '../../services/api';
import { Card, Banner, AccountSelector } from '../ui/common';
import type { Account } from '../../pages/Dashboard';

export default function MessagingPanel({ accounts }: { accounts: Account[] }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [recipients, setRecipients] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  async function loadCampaigns() {
    try {
      const { campaigns } = await messagesApi.campaigns();
      setCampaigns(campaigns);
    } catch (_) {
      /* ignore */
    }
  }
  useEffect(() => {
    loadCampaigns();
  }, []);

  async function send() {
    setError(null);
    setInfo(null);
    const list = recipients
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!selected.length || !list.length || !message) {
      setError('Select accounts, recipients and a message.');
      return;
    }
    setBusy(true);
    try {
      const res = await messagesApi.send({ accountIds: selected, recipients: list, message, name });
      setInfo(`Sent to ${res.success}/${res.total}, ${res.error} failed.`);
      loadCampaigns();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card title="Bulk messaging" subtitle="Send a message from selected accounts to a recipient list">
        {error && <div className="mb-3"><Banner kind="error">{error}</Banner></div>}
        {info && <div className="mb-3"><Banner kind="success">{info}</Banner></div>}
        <div className="space-y-3">
          <div>
            <label className="label">Accounts</label>
            <AccountSelector accounts={accounts} selected={selected} onChange={setSelected} multi />
          </div>
          <div>
            <label className="label">Campaign name (optional)</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Recipients (comma or newline separated)</label>
            <textarea
              className="input"
              rows={3}
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="@user1, @user2"
            />
          </div>
          <div>
            <label className="label">Message</label>
            <textarea className="input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={send} disabled={busy}>
            {busy ? 'Sending…' : 'Send campaign'}
          </button>
        </div>
      </Card>

      <Card title="Campaigns" subtitle={`${campaigns.length} run`}>
        {campaigns.length === 0 ? (
          <p className="text-sm text-slate-500">No campaigns yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-400">
                <th className="pb-2">Name</th>
                <th className="pb-2">Total</th>
                <th className="pb-2">Success</th>
                <th className="pb-2">Errors</th>
                <th className="pb-2">When</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-slate-800/60">
                  <td className="py-2 text-slate-200">{c.name}</td>
                  <td className="py-2 text-slate-400">{c.total}</td>
                  <td className="py-2 text-emerald-400">{c.success_count}</td>
                  <td className="py-2 text-red-400">{c.error_count}</td>
                  <td className="py-2 text-slate-500">{c.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
