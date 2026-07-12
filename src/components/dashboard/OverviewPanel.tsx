import React, { useEffect, useState } from 'react';
import { analyticsApi } from '../../services/api';
import { Card, StatusBadge } from '../ui/common';

type Overview = {
  accounts: number;
  activeAccounts: number;
  audience: number;
  campaigns: number;
  messagesSent: number;
};

type Activity = {
  id: number;
  operation: string;
  target: string;
  status: string;
  created_at: string;
  account_phone?: string;
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-white">{value.toLocaleString()}</p>
    </div>
  );
}

export default function OverviewPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [ov, act] = await Promise.all([analyticsApi.overview(), analyticsApi.activity(15)]);
        setOverview(ov);
        setActivity(act.activity);
      } catch (err: any) {
        setError(err.message);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      {error && <div className="text-sm text-red-400">{error}</div>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total accounts" value={overview?.accounts ?? 0} />
        <StatCard label="Active accounts" value={overview?.activeAccounts ?? 0} />
        <StatCard label="Messages sent" value={overview?.messagesSent ?? 0} />
        <StatCard label="Audience collected" value={overview?.audience ?? 0} />
        <StatCard label="Campaigns" value={overview?.campaigns ?? 0} />
      </div>

      <Card title="Recent activity" subtitle="Latest automation operations">
        {activity.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet.</p>
        ) : (
          <div className="space-y-1">
            {activity.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-200 capitalize">{a.operation}</span>
                  <span className="truncate text-slate-500">{a.target}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-600">{a.created_at}</span>
                  <StatusBadge status={a.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
