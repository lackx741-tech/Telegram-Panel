import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { accountsApi, clearToken } from '../services/api';
import OverviewPanel from '../components/dashboard/OverviewPanel';
import AccountsPanel from '../components/dashboard/AccountsPanel';
import AutomationPanel from '../components/dashboard/AutomationPanel';
import AudiencePanel from '../components/dashboard/AudiencePanel';
import MessagingPanel from '../components/dashboard/MessagingPanel';
import ProxiesPanel from '../components/dashboard/ProxiesPanel';
import AnalyticsPanel from '../components/dashboard/AnalyticsPanel';
import SettingsPanel from '../components/dashboard/SettingsPanel';
import PlaceholderPanel from '../components/dashboard/PlaceholderPanel';

export type Account = {
  id: number;
  phone: string;
  username?: string;
  status: string;
  firstName?: string;
};

type NavItem = { key: string; label: string; icon: string; group?: string };

/**
 * Sidebar navigation. The functional items map to real panels; the remaining
 * items match the target sidebar reference and render an informative
 * placeholder until their backend exists.
 */
const NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: '▦' },
  { key: 'getting-started', label: 'Getting started', icon: '✦' },
  { key: 'accounts', label: 'Accounts', icon: '✓' },
  { key: 'proxies', label: 'Proxies', icon: '🛰' },
  { key: 'inbox', label: 'Inbox', icon: '✉' },
  { key: 'automation', label: 'Automation', icon: '⚡' },
  { key: 'bots', label: 'Bots', icon: '🤖' },
  { key: 'groups', label: 'Groups', icon: '👥' },
  { key: 'audience', label: 'Audience', icon: '🎯' },
  { key: 'messaging', label: 'Messaging', icon: '📣' },
  { key: 'analytics', label: 'Analytics', icon: '📊' },
  { key: 'privacy', label: 'Privacy controls', icon: '🛡' },
  { key: 'security', label: 'Security', icon: '🔒' },
  { key: 'marketplace', label: 'Marketplace', icon: '🛒' },
  { key: 'billing', label: 'Billing and wallet', icon: '💳' },
  { key: 'teams', label: 'Teams', icon: '🧩' },
  { key: 'limits', label: 'Limits and quotas', icon: '📈' },
  { key: 'policies', label: 'Policies and rights', icon: '📜' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
  { key: 'faq', label: 'FAQ', icon: '❓' },
  { key: 'support', label: 'Support', icon: '🆘' },
];

const IMPLEMENTED = new Set([
  'overview',
  'accounts',
  'proxies',
  'automation',
  'audience',
  'messaging',
  'analytics',
  'settings',
]);

export default function Dashboard() {
  const navigate = useNavigate();
  const [active, setActive] = useState('overview');
  const [accounts, setAccounts] = useState<Account[]>([]);

  async function refreshAccounts() {
    try {
      const { accounts } = await accountsApi.getAll();
      setAccounts(accounts);
    } catch (_) {
      /* ignore — panels surface their own errors */
    }
  }

  useEffect(() => {
    refreshAccounts();
  }, []);

  function logout() {
    clearToken();
    navigate('/login');
  }

  function renderPanel() {
    switch (active) {
      case 'overview':
        return <OverviewPanel />;
      case 'accounts':
        return <AccountsPanel accounts={accounts} onChange={refreshAccounts} />;
      case 'automation':
        return <AutomationPanel accounts={accounts} />;
      case 'audience':
        return <AudiencePanel accounts={accounts} />;
      case 'messaging':
        return <MessagingPanel accounts={accounts} />;
      case 'proxies':
        return <ProxiesPanel />;
      case 'analytics':
        return <AnalyticsPanel />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <PlaceholderPanel title={NAV.find((n) => n.key === active)?.label || 'Coming soon'} />;
    }
  }

  const activeLabel = NAV.find((n) => n.key === active)?.label;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-blue-600 text-sm font-bold text-white">
            ▤
          </span>
          <span className="text-sm font-semibold text-white">Telegram Panel</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {NAV.map((item) => {
            const isActive = active === item.key;
            const implemented = IMPLEMENTED.has(item.key);
            return (
              <button
                key={item.key}
                onClick={() => setActive(item.key)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600/20 font-medium text-blue-300 ring-1 ring-inset ring-blue-600/40'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span className="w-5 text-center text-base leading-none">{item.icon}</span>
                <span className="truncate">{item.label}</span>
                {!implemented && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-600">soon</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-slate-800 p-3">
          <button onClick={logout} className="btn-secondary w-full">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">{activeLabel}</h2>
          <span className="text-sm text-slate-400">{accounts.length} account(s)</span>
        </header>
        <div className="flex-1 overflow-y-auto p-6">{renderPanel()}</div>
      </main>
    </div>
  );
}
