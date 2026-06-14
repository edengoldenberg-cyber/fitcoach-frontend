import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Play, Send, Trash2, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_COLORS = {
  queued: 'bg-yellow-100 text-yellow-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  provider_unconfirmed: 'bg-orange-100 text-orange-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const EVENT_ICONS = {
  SEND_SUCCESS: '✅',
  SEND_FAIL: '❌',
  QUEUE_ADD: '📥',
  WORKER_START: '⚙️',
  SEND_ATTEMPT: '🚀',
  RULE_TRIGGERED: '🎯',
  UI_ACTION: '👆',
};

export default function WhatsAppDiagnosticsTab({ coachEmail, coachPhone, initialTemplateFilter, onClearTemplateFilter }) {
  const queryClient = useQueryClient();
  const [queueFilter, setQueueFilter] = useState('all');
  const [templateFilter, setTemplateFilter] = useState(initialTemplateFilter || '');
  const [testPhone, setTestPhone] = useState(coachPhone || '');
  const [runningWorker, setRunningWorker] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  // Sync if parent pushes a new filter
  React.useEffect(() => {
    if (initialTemplateFilter) setTemplateFilter(initialTemplateFilter);
  }, [initialTemplateFilter]);

  const { data: queue = [], isLoading: loadingQueue, refetch: refetchQueue } = useQuery({
    queryKey: ['whatsappQueue', coachEmail, queueFilter, templateFilter],
    queryFn: async () => {
      const all = await base44.entities.WhatsAppMessageQueue.filter({ coach_email: coachEmail });
      let filtered = all;
      if (queueFilter !== 'all') filtered = filtered.filter(m => m.status === queueFilter);
      if (templateFilter) filtered = filtered.filter(m => m.template_key === templateFilter);
      return filtered.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 50);
    },
    enabled: !!coachEmail,
    refetchInterval: 10000,
  });

  const { data: logs = [], isLoading: loadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['whatsappLogs', coachEmail],
    queryFn: async () => {
      const all = await base44.entities.WhatsAppDiagnosticsLog.filter({ coach_email: coachEmail });
      return all.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 100);
    },
    enabled: !!coachEmail,
    refetchInterval: 10000,
  });

  const stats = {
    queued: queue.filter(m => m.status === 'queued').length,
    sent: queue.filter(m => m.status === 'sent').length,
    unconfirmed: queue.filter(m => m.status === 'provider_unconfirmed').length,
    failed: queue.filter(m => m.status === 'failed').length,
  };

  const runWorker = async () => {
    setRunningWorker(true);
    try {
      const res = await base44.functions.invoke('whatsAppQueueWorker', {});
      const d = res.data;
      toast.success(`Worker הסתיים: ${d.sent || 0} נשלחו, ${d.failed || 0} נכשלו`);
      refetchQueue();
      refetchLogs();
    } catch (e) {
      toast.error('Worker נכשל: ' + e.message);
    } finally {
      setRunningWorker(false);
    }
  };

  const sendTestMessage = async () => {
    if (!testPhone) { toast.error('הזן מספר טלפון'); return; }
    setSendingTest(true);
    try {
      const enqueue = await base44.functions.invoke('enqueueWhatsAppMessage', {
        coachEmail,
        toPhoneE164: testPhone,
        toName: 'בדיקה',
        contextType: 'system',
        renderedText: `הודעת בדיקה מ-FitCoach Pro ✅ (${new Date().toLocaleTimeString('he-IL')})`,
        scheduledFor: new Date().toISOString(),
      });
      if (enqueue.data?.ok) {
        toast.success('הודעה נוספה לתור! לחץ "הרץ Worker" כדי לשלוח.');
        refetchQueue();
      } else {
        toast.error('שגיאה: ' + (enqueue.data?.error || 'לא ידוע'));
      }
    } catch (e) {
      toast.error('שגיאה: ' + e.message);
    } finally {
      setSendingTest(false);
    }
  };

  const clearFailed = async () => {
    const failed = queue.filter(m => m.status === 'failed');
    if (failed.length === 0) { toast.info('אין הודעות כושלות'); return; }
    for (const m of failed) {
      await base44.entities.WhatsAppMessageQueue.update(m.id, { status: 'cancelled' });
    }
    toast.success(`${failed.length} הודעות כושלות בוטלו`);
    refetchQueue();
  };

  return (
    <div className="p-4 space-y-5" dir="rtl">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-yellow-600">{stats.queued}</p>
          <p className="text-xs text-yellow-700">ממתינים</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.sent}</p>
          <p className="text-xs text-green-700">נשלחו</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-orange-600">{stats.unconfirmed}</p>
          <p className="text-xs text-orange-700">לא אושרו</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
          <p className="text-xs text-red-700">נכשלו</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-40">
          <p className="text-xs text-slate-500 mb-1">שלח הודעת בדיקה לטלפון:</p>
          <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="+9725XXXXXXXX" dir="ltr" className="text-sm h-9" />
        </div>
        <Button size="sm" onClick={sendTestMessage} disabled={sendingTest}>
          {sendingTest ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Send className="w-4 h-4 ml-1" />}
          שלח בדיקה
        </Button>
        <Button size="sm" variant="outline" onClick={runWorker} disabled={runningWorker}>
          {runningWorker ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Play className="w-4 h-4 ml-1" />}
          הרץ Worker
        </Button>
        <Button size="sm" variant="outline" className="text-red-600" onClick={clearFailed}>
          <Trash2 className="w-4 h-4 ml-1" /> נקה כישלונות
        </Button>
        <Button size="icon" variant="ghost" onClick={() => { refetchQueue(); refetchLogs(); }}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Queue */}
      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h4 className="font-semibold text-slate-700 text-sm">תור הודעות</h4>
          <div className="flex items-center gap-2 flex-wrap">
            {templateFilter && (
              <div className="flex items-center gap-1 bg-teal-100 text-teal-700 text-xs px-2 py-1 rounded-full">
                <span>תבנית: {templateFilter}</span>
                <button onClick={() => { setTemplateFilter(''); onClearTemplateFilter?.(); }} className="hover:text-teal-900">✕</button>
              </div>
            )}
            <Input
              value={templateFilter}
              onChange={e => setTemplateFilter(e.target.value)}
              placeholder="סנן לפי key תבנית"
              className="h-8 text-xs w-36"
              dir="ltr"
            />
            <Select value={queueFilter} onValueChange={setQueueFilter}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="queued">ממתין</SelectItem>
                <SelectItem value="sent">נשלח</SelectItem>
                <SelectItem value="provider_unconfirmed">לא אושר</SelectItem>
                <SelectItem value="failed">נכשל</SelectItem>
                <SelectItem value="cancelled">בוטל</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {loadingQueue ? (
          <p className="text-slate-400 text-sm text-center py-4">טוען...</p>
        ) : queue.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">אין הודעות</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {queue.map(m => (
              <div key={m.id} className="flex items-start gap-2 text-xs border rounded-lg p-2 bg-white">
                <Badge className={`flex-shrink-0 text-xs px-2 py-0.5 ${STATUS_COLORS[m.status] || 'bg-slate-100'}`}>
                  {m.status}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                    <p className="font-medium">{m.to_name || m.to_phone_e164}</p>
                    {m.to_phone_e164 && m.to_name && <span className="text-slate-400">({m.to_phone_e164})</span>}
                    {m.template_key && <span className="bg-blue-100 text-blue-600 px-1 rounded">{m.template_key}</span>}
                    {(() => {
                      try {
                        const resp = JSON.parse(m.provider_response || '{}');
                        if (resp.providerMessageId) {
                          return <span className="bg-green-50 text-green-700 px-1 rounded text-[10px]" title="Provider Message ID">✓ {resp.providerMessageId.slice(0, 12)}</span>;
                        }
                      } catch {}
                      return null;
                    })()}
                  </div>
                  <p className="text-slate-500 truncate mt-0.5">{m.rendered_text}</p>
                  {m.error_message && <p className="text-red-500 truncate">{m.error_message}</p>}
                  {m.status === 'provider_unconfirmed' && <p className="text-orange-600 text-[10px] mt-0.5">⚠️ ספק לא אישר שליחה</p>}
                </div>
                <p className="flex-shrink-0 text-slate-400">{new Date(m.created_date).toLocaleTimeString('he-IL')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Diagnostics Logs */}
      <div>
        <h4 className="font-semibold text-slate-700 text-sm mb-2">לוג דיאגנוסטיקה</h4>
        {loadingLogs ? (
          <p className="text-slate-400 text-sm text-center py-4">טוען...</p>
        ) : logs.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">אין לוגים</p>
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {logs.map(l => (
              <div key={l.id} className="flex items-start gap-2 text-xs border rounded p-2 bg-slate-50">
                <span className="flex-shrink-0">{EVENT_ICONS[l.event] || '📋'}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-slate-700">{l.event}</span>
                  {l.payload && <span className="text-slate-500 mr-1">— {typeof l.payload === 'object' ? JSON.stringify(l.payload).slice(0, 80) : String(l.payload).slice(0, 80)}</span>}
                </div>
                <p className="flex-shrink-0 text-slate-400">{new Date(l.created_date).toLocaleTimeString('he-IL')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}