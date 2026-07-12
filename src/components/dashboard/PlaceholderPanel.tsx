import React from 'react';
import { Card } from '../ui/common';

/** Shown for sidebar items that are part of the target layout but not yet wired. */
export default function PlaceholderPanel({ title }: { title: string }) {
  return (
    <Card title={title} subtitle="This section is part of the roadmap and not yet available.">
      <p className="text-sm text-slate-400">
        The <span className="font-medium text-slate-200">{title}</span> module is planned. The core
        automation, accounts, proxies, analytics and settings areas are fully functional today.
      </p>
    </Card>
  );
}
