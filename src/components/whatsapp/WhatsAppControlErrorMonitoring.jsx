import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle } from 'lucide-react';

const ERROR_CATEGORIES = {
  provider: ['GREENAPI_', 'SEND_FAILED', 'NETWORK_ERROR'],
  worker: ['MESSAGE_ERROR', 'QUEUE_', 'PROCESSING'],
  webhook: ['WEBHOOK_', 'INBOUND_', 'PARSE_'],
  thread: ['THREAD_', 'DATABASE_'],
};

export default function WhatsAppControlErrorMonitoring({ coachEmail, autoRefresh }) {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const { data: diagnostics } = useQuery({
    queryKey: ['diagnosticsLogs', coachEmail],
    queryFn: async () => {
      const items = await base44.entities.WhatsAppDiagnosticsLog.filter({ coach_email: coachEmail });
      return items.filter(d => d.event === 'SEND_FAIL' || d.event === 'SEND_ATTEMPT').sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 100);
    },
    refetchInterval: autoRefresh ? 10000 : false,
  });

  if (!diagnostics) return <div className="text-center py-8 text-slate-500">Loading error logs...</div>;

  const getCategoryForError = (error) => {
    const errorStr = String(error || '').toUpperCase();
    for (const [cat, keywords] of Object.entries(ERROR_CATEGORIES)) {
      if (keywords.some(kw => errorStr.includes(kw))) return cat;
    }
    return 'other';
  };

  const grouped = diagnostics.reduce((acc, log) => {
    const cat = getCategoryForError(log.payload?.reason || log.payload?.error);
    if (selectedCategory === 'all' || selectedCategory === cat) {
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(log);
    }
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {['all', 'provider', 'worker', 'webhook', 'thread', 'other'].map((cat) => {
          const count = grouped[cat === 'all' ? Object.keys(grouped)[0] : cat]?.length || 0;
          return (
            <Badge
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'outline'}
              className="cursor-pointer capitalize text-xs"
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}: {count}
            </Badge>
          );
        })}
      </div>

      <div className="space-y-3">
        {Object.entries(grouped).map(([category, logs]) => (
          <div key={category}>
            <h3 className="text-xs font-semibold text-slate-600 uppercase mb-2 px-2">{category} Errors</h3>
            {logs.slice(0, 20).map((log) => (
              <Card key={log.id} className="p-3 border-l-2 border-red-400">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{log.payload?.reason || log.payload?.error || 'Unknown'}</p>
                    <p className="text-xs text-slate-500 mt-1">Queue: {log.payload?.queueId || 'N/A'}</p>
                    {log.payload?.toPhone && (
                      <p className="text-xs text-slate-500">Phone: {log.payload.toPhone}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-slate-500">{formatDistanceToNow(new Date(log.created_date), { addSuffix: true })}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}