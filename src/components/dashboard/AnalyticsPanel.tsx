import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { analyticsApi } from '../../services/api';
import { Card, Banner } from '../ui/common';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4'];

export default function AnalyticsPanel() {
  const [overview, setOverview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setOverview(await analyticsApi.overview());
      } catch (err: any) {
        setError(err.message);
      }
    })();
  }, []);

  const opData =
    overview?.operations?.map((o: any) => ({
      operation: o.operation,
      success: o.success,
      failed: o.failed,
    })) || [];

  const totals = opData.reduce(
    (acc: { success: number; failed: number }, o: any) => ({
      success: acc.success + o.success,
      failed: acc.failed + o.failed,
    }),
    { success: 0, failed: 0 }
  );
  const pieData = [
    { name: 'Success', value: totals.success },
    { name: 'Failed', value: totals.failed },
  ];

  return (
    <div className="space-y-6">
      {error && <Banner kind="error">{error}</Banner>}

      <Card title="Operations by type" subtitle="Success vs failure per automation operation">
        {opData.length === 0 ? (
          <p className="text-sm text-slate-500">No operations recorded yet.</p>
        ) : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={opData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="operation" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend />
                <Bar dataKey="success" fill="#22c55e" name="Success" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" fill="#ef4444" name="Failed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Overall success rate">
          {totals.success + totals.failed === 0 ? (
            <p className="text-sm text-slate-500">No data yet.</p>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#22c55e' : '#ef4444'} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Fleet summary">
          <dl className="space-y-3 text-sm">
            {[
              ['Accounts', overview?.accounts],
              ['Active accounts', overview?.activeAccounts],
              ['Audience collected', overview?.audience],
              ['Messages sent', overview?.messagesSent],
              ['Campaigns', overview?.campaigns],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between border-b border-slate-800 pb-2">
                <dt className="text-slate-400">{label}</dt>
                <dd className="font-semibold text-white">{(value ?? 0).toLocaleString?.() ?? value ?? 0}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}
