import React from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, Eye, Send } from 'lucide-react';

export default function NotificationAuditStats({ logs }) {
  const total = logs.length;
  const sent = logs.filter((log) => ['sent', 'delivered', 'opened'].includes(log.status)).length;
  const opened = logs.filter((log) => log.status === 'opened' || log.opened_at).length;
  const failed = logs.filter((log) => log.status === 'failed').length;

  const stats = [
    { label: 'סה״כ', value: total, icon: Send, color: 'text-slate-700', bg: 'bg-slate-50' },
    { label: 'נשלחו', value: sent, icon: CheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-50' },
    { label: 'נפתחו', value: opened, icon: Eye, color: 'text-blue-700', bg: 'bg-blue-50' },
    { label: 'נכשלו', value: failed, icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-50' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map(({ label, value, icon: Icon, color, bg }) => (
        <Card key={label} className={`p-4 border-0 shadow-sm ${bg}`}>
          <Icon className={`w-5 h-5 mb-2 ${color}`} />
          <div className={`text-2xl font-bold ${color}`}>{value}</div>
          <div className="text-xs text-slate-500">{label}</div>
        </Card>
      ))}
    </div>
  );
}