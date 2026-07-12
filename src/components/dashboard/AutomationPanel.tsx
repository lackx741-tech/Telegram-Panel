import React, { useEffect, useState } from 'react';
import { automationApi } from '../../services/api';
import { Card, Banner, AccountSelector, ResultsList, StatusBadge } from '../ui/common';
import type { Account } from '../../pages/Dashboard';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

type SubTab =
  | 'reaction'
  | 'vote'
  | 'join'
  | 'leave'
  | 'block'
  | 'send-pv'
  | 'comment'
  | 'history';

const SUBTABS: { key: SubTab; label: string }[] = [
  { key: 'reaction', label: 'Reactions' },
  { key: 'vote', label: 'Poll Voting' },
  { key: 'join', label: 'Join' },
  { key: 'leave', label: 'Leave' },
  { key: 'block', label: 'Block Users' },
  { key: 'send-pv', label: 'Private Messages' },
  { key: 'comment', label: 'Comments' },
  { key: 'history', label: 'History' },
];

/** Shared account-selection + execute wrapper used by every operation form. */
function OperationForm({
  accounts,
  buildPayload,
  submit,
  children,
  canSubmit,
}: {
  accounts: Account[];
  buildPayload: (accountIds: number[]) => any;
  submit: (payload: any) => Promise<any>;
  children: React.ReactNode;
  canSubmit: boolean;
}) {
  const [bulk, setBulk] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  async function run() {
    setError(null);
    setResults([]);
    setSummary(null);
    if (!selected.length) {
      setError('Select at least one account.');
      return;
    }
    setBusy(true);
    try {
      const base = buildPayload(selected);
      const payload = bulk ? { ...base, accountIds: selected } : { ...base, accountId: selected[0] };
      const res = await submit(payload);
      setResults(res.results || []);
      if (typeof res.successCount === 'number') {
        setSummary(`${res.successCount} succeeded, ${res.errorCount} failed`);
      } else {
        setSummary(res.success ? 'Operation succeeded' : 'Operation failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            className="accent-blue-500"
            checked={bulk}
            onChange={(e) => {
              setBulk(e.target.checked);
              setSelected([]);
            }}
          />
          Bulk mode (multiple accounts)
        </label>
      </div>

      <div>
        <label className="label">{bulk ? 'Accounts' : 'Account'}</label>
        <AccountSelector accounts={accounts} selected={selected} onChange={setSelected} multi={bulk} />
      </div>

      {children}

      {error && <Banner kind="error">{error}</Banner>}
      {summary && <Banner kind={results.some((r) => r.status !== 'success') ? 'info' : 'success'}>{summary}</Banner>}

      <button className="btn-primary" onClick={run} disabled={busy || !canSubmit}>
        {busy ? 'Executing…' : 'Execute'}
      </button>

      <ResultsList results={results} />
    </div>
  );
}

function LinkInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="label">Target link</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function ReactionForm({ accounts }: { accounts: Account[] }) {
  const [link, setLink] = useState('');
  const [reaction, setReaction] = useState('👍');
  return (
    <OperationForm
      accounts={accounts}
      canSubmit={!!link}
      buildPayload={() => ({ link, reaction })}
      submit={automationApi.reaction}
    >
      <LinkInput value={link} onChange={setLink} placeholder="https://t.me/channel/123" />
      <div>
        <label className="label">Reaction</label>
        <div className="flex gap-2">
          {REACTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReaction(r)}
              className={`rounded-md border px-3 py-2 text-lg ${
                reaction === r ? 'border-blue-500 bg-blue-600/20' : 'border-slate-700 bg-slate-800'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    </OperationForm>
  );
}

function VoteForm({ accounts }: { accounts: Account[] }) {
  const [link, setLink] = useState('');
  const [option, setOption] = useState('1');
  return (
    <OperationForm
      accounts={accounts}
      canSubmit={!!link && !!option}
      buildPayload={() => ({ link, option: Number(option) })}
      submit={automationApi.vote}
    >
      <LinkInput value={link} onChange={setLink} placeholder="https://t.me/channel/123" />
      <div>
        <label className="label">Poll option number (1-10)</label>
        <input
          type="number"
          min={1}
          max={10}
          className="input w-32"
          value={option}
          onChange={(e) => setOption(e.target.value)}
        />
      </div>
    </OperationForm>
  );
}

function JoinLeaveForm({ accounts, action }: { accounts: Account[]; action: 'join' | 'leave' }) {
  const [link, setLink] = useState('');
  return (
    <OperationForm
      accounts={accounts}
      canSubmit={!!link}
      buildPayload={() => ({ link })}
      submit={action === 'join' ? automationApi.join : automationApi.leave}
    >
      <LinkInput value={link} onChange={setLink} placeholder="https://t.me/channel" />
    </OperationForm>
  );
}

function BlockForm({ accounts }: { accounts: Account[] }) {
  const [user, setUser] = useState('');
  return (
    <OperationForm
      accounts={accounts}
      canSubmit={!!user}
      buildPayload={() => ({ user })}
      submit={automationApi.block}
    >
      <div>
        <label className="label">User (@username or id)</label>
        <input className="input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="@spammer" />
      </div>
    </OperationForm>
  );
}

function SendPvForm({ accounts }: { accounts: Account[] }) {
  const [user, setUser] = useState('');
  const [message, setMessage] = useState('');
  return (
    <OperationForm
      accounts={accounts}
      canSubmit={!!user && !!message}
      buildPayload={() => ({ user, message })}
      submit={automationApi.sendPv}
    >
      <div>
        <label className="label">Recipient (@username or id)</label>
        <input className="input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="@user" />
      </div>
      <div>
        <label className="label">Message</label>
        <textarea className="input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
    </OperationForm>
  );
}

function CommentForm({ accounts }: { accounts: Account[] }) {
  const [link, setLink] = useState('');
  const [comment, setComment] = useState('');
  return (
    <OperationForm
      accounts={accounts}
      canSubmit={!!link && !!comment}
      buildPayload={() => ({ link, comment })}
      submit={automationApi.comment}
    >
      <LinkInput value={link} onChange={setLink} placeholder="https://t.me/channel/123" />
      <div>
        <label className="label">Comment</label>
        <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
    </OperationForm>
  );
}

function HistoryTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { logs } = await automationApi.logs(200);
      setLogs(logs);
    } catch (err: any) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button className="btn-secondary" onClick={load}>
          Refresh
        </button>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {logs.length === 0 ? (
        <p className="text-sm text-slate-500">No operations logged yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-slate-400">
              <th className="pb-2">When</th>
              <th className="pb-2">Operation</th>
              <th className="pb-2">Target</th>
              <th className="pb-2">Account</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-slate-800/60">
                <td className="py-2 text-slate-500">{l.created_at}</td>
                <td className="py-2 capitalize text-slate-200">{l.operation}</td>
                <td className="py-2 max-w-[220px] truncate text-slate-400">{l.target}</td>
                <td className="py-2 text-slate-400">{l.account_phone || '—'}</td>
                <td className="py-2"><StatusBadge status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AutomationPanel({ accounts }: { accounts: Account[] }) {
  const [tab, setTab] = useState<SubTab>('reaction');

  function renderTab() {
    switch (tab) {
      case 'reaction':
        return <ReactionForm accounts={accounts} />;
      case 'vote':
        return <VoteForm accounts={accounts} />;
      case 'join':
        return <JoinLeaveForm accounts={accounts} action="join" />;
      case 'leave':
        return <JoinLeaveForm accounts={accounts} action="leave" />;
      case 'block':
        return <BlockForm accounts={accounts} />;
      case 'send-pv':
        return <SendPvForm accounts={accounts} />;
      case 'comment':
        return <CommentForm accounts={accounts} />;
      case 'history':
        return <HistoryTab />;
    }
  }

  return (
    <Card title="Automation" subtitle="Run MODULE579 operations across one or many accounts">
      <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === t.key
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {renderTab()}
    </Card>
  );
}
