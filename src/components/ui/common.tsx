import React from 'react';

/** A labelled section card. */
export function Card({
  title,
  subtitle,
  children,
  actions,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="card">
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h3 className="text-base font-semibold text-white">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

/** Coloured status pill. */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: 'bg-emerald-900/60 text-emerald-300 border-emerald-800',
    active: 'bg-emerald-900/60 text-emerald-300 border-emerald-800',
    error: 'bg-red-900/60 text-red-300 border-red-800',
    revoked: 'bg-red-900/60 text-red-300 border-red-800',
    flood_wait: 'bg-amber-900/60 text-amber-300 border-amber-800',
  };
  const cls = map[status] || 'bg-slate-800 text-slate-300 border-slate-700';
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

/** Inline error/success banner. */
export function Banner({ kind, children }: { kind: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const map = {
    error: 'border-red-800 bg-red-950/60 text-red-300',
    success: 'border-emerald-800 bg-emerald-950/60 text-emerald-300',
    info: 'border-slate-700 bg-slate-800/60 text-slate-300',
  };
  return <div className={`rounded-md border px-3 py-2 text-sm ${map[kind]}`}>{children}</div>;
}

/** Multi-select list of accounts (checkboxes) for bulk operations. */
export function AccountSelector({
  accounts,
  selected,
  onChange,
  multi = true,
}: {
  accounts: Array<{ id: number; phone: string; status: string; username?: string }>;
  selected: number[];
  onChange: (ids: number[]) => void;
  multi?: boolean;
}) {
  function toggle(id: number) {
    if (!multi) return onChange([id]);
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  if (!accounts.length) {
    return <p className="text-sm text-slate-500">No accounts yet — add one in the Accounts panel.</p>;
  }

  return (
    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-800 bg-slate-950 p-2">
      {accounts.map((a) => (
        <label
          key={a.id}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-800"
        >
          <input
            type={multi ? 'checkbox' : 'radio'}
            checked={selected.includes(a.id)}
            onChange={() => toggle(a.id)}
            className="accent-blue-500"
          />
          <span className="text-slate-200">{a.username ? `@${a.username}` : a.phone}</span>
          <span className="ml-auto">
            <StatusBadge status={a.status} />
          </span>
        </label>
      ))}
    </div>
  );
}

/** Renders a list of per-account operation results. */
export function ResultsList({ results }: { results: Array<any> }) {
  if (!results?.length) return null;
  return (
    <div className="mt-3 space-y-1">
      {results.map((r, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm"
        >
          <span className="text-slate-300">Account #{r.accountId ?? '—'}</span>
          <div className="flex items-center gap-2">
            {r.error && <span className="text-xs text-slate-500">{r.error}</span>}
            <StatusBadge status={r.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
