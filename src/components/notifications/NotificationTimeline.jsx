import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, CheckCircle, Clock, Eye, XCircle } from 'lucide-react';

const statusConfig = {
  queued: { label: 'בתור', icon: Clock, className: 'bg-slate-100 text-slate-700' },
  sending: { label: 'נשלח', icon: Clock, className: 'bg-blue-100 text-blue-700' },
  sent: { label: 'נשלח', icon: CheckCircle, className: 'bg-emerald-100 text-emerald-700' },
  delivered: { label: 'נמסר', icon: CheckCircle, className: 'bg-green-100 text-green-700' },
  opened: { label: 'נפתח', icon: Eye, className: 'bg-indigo-100 text-indigo-700' },
  failed: { label: 'נכשל', icon: XCircle, className: 'bg-red-100 text-red-700' },
  cancelled: { label: 'בוטל', icon: XCircle, className: 'bg-amber-100 text-amber-700' },
  duplicate_blocked: { label: 'נחסם כפול', icon: XCircle, className: 'bg-orange-100 text-orange-700' },
};

export default function NotificationTimeline({ logs = [], debug = false }) {
  if (!logs.length) {
    return (
      <Card className="p-8 text-center bg-white border-0 shadow-sm">
        <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">אין עדיין התראות מתועדות</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const config = statusConfig[log.status] || statusConfig.queued;
        const Icon = config.icon;
        return (
          <Card key={log.id} className="p-4 bg-white border-0 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge className={config.className}>
                    <Icon className="w-3 h-3 ml-1" />
                    {config.label}
                  </Badge>
                  <Badge variant="outline">{log.channel || 'in_app'}</Badge>
                  <Badge variant="outline">{log.source_system}</Badge>
                </div>
                <h3 className="font-bold text-slate-800">{log.title}</h3>
                <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{log.body}</p>
                <p className="text-xs text-slate-400 mt-2">סיבה: {log.trigger_reason}</p>
              </div>
              <div className="text-xs text-slate-400 whitespace-nowrap">
                {new Date(log.created_at || log.created_date).toLocaleString('he-IL')}
              </div>
            </div>

            {debug && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 space-y-1">
                <div>Dedup: {log.deduplication_key}</div>
                <div>Pipeline: {log.send_pipeline || '—'}</div>
                <div>Sent: {log.sent_at || '—'} | Delivered: {log.delivered_at || '—'} | Opened: {log.opened_at || '—'}</div>
                {log.provider_response && <div>Provider: {log.provider_response}</div>}
                {log.error_message && <div className="text-red-600">Error: {log.error_message}</div>}
                {log.blocked_reason && <div className="text-orange-600">Blocked: {log.blocked_reason}</div>}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}