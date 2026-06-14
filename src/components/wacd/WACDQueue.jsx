import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Trash2, AlertTriangle, Check } from 'lucide-react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const STATUS_COLOR = {
  sent: 'bg-emerald-100 text-emerald-700',
  provider_unconfirmed: 'bg-yellow-100 text-yellow-700',
  queued: 'bg-blue-100 text-blue-700',
  sending: 'bg-blue-200 text-blue-800',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
};

function maskPhone(phone) {
  if (!phone) return '—';
  const s = String(phone);
  if (s.length < 6) return s;
  return s.slice(0, 4) + '****' + s.slice(-3);
}

function fmtTime(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return ts; }
}

function truncate(s, n = 60) {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export default function WACDQueue({ data }) {
  const { queue, todayQueue, traineeMap } = data;
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [expanded, setExpanded] = useState({});

  const displayQueue = showAll ? queue : todayQueue;

  const stats = useMemo(() => ({
    queued: displayQueue.filter(q => q.status === 'queued').length,
    sending: displayQueue.filter(q => q.status === 'sending').length,
    sent: displayQueue.filter(q => q.status === 'sent' || q.status === 'provider_unconfirmed').length,
    failed: displayQueue.filter(q => q.status === 'failed').length,
    cancelled: displayQueue.filter(q => q.status === 'cancelled').length,
  }), [displayQueue]);

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return displayQueue;
    return displayQueue.filter(q => q.status === filterStatus);
  }, [displayQueue, filterStatus]);

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('cleanWhatsAppQueue', { action: 'clean_unsent' });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wacd_queue'] });
      setConfirmClear(false);
      toast.success('תור נוקה');
    },
    onError: () => toast.error('שגיאה בניקוי תור'),
  });

  const refreshQueue = () => {
    queryClient.invalidateQueries({ queryKey: ['wacd_queue'] });
    toast.success('תור רועננ');
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-2 text-center">
        {[
          { label: 'בתור', value: stats.queued, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'שולח', value: stats.sending, color: 'text-blue-800', bg: 'bg-blue-100' },
          { label: 'נשלח', value: stats.sent, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'נכשל', value: stats.failed, color: stats.failed > 0 ? 'text-red-600' : 'text-slate-400', bg: stats.failed > 0 ? 'bg-red-50' : 'bg-slate-50' },
          { label: 'בוטל', value: stats.cancelled, color: 'text-slate-500', bg: 'bg-slate-50' },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => setFilterStatus(filterStatus === s.label.toLowerCase() ? 'all' : s.label)}
            className={`${s.bg} rounded-xl p-2 border border-transparent hover:border-slate-300 transition-all`}
          >
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={refreshQueue} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          רענן תור
        </Button>

        <Button
          variant="outline" size="sm"
          className="gap-1.5 border-slate-300"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'הצג רק היום' : 'הצג הכל'}
        </Button>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue placeholder="סטטוס" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="queued">בתור</SelectItem>
            <SelectItem value="sending">שולח</SelectItem>
            <SelectItem value="sent">נשלח</SelectItem>
            <SelectItem value="failed">נכשל</SelectItem>
            <SelectItem value="cancelled">בוטל</SelectItem>
          </SelectContent>
        </Select>

        {!confirmClear ? (
          <Button
            variant="outline" size="sm"
            className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 mr-auto"
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            נקה הודעות שלא נשלחו
          </Button>
        ) : (
          <div className="flex gap-2 items-center mr-auto">
            <span className="text-sm text-red-700 font-medium">בטוח?</span>
            <Button size="sm" variant="destructive" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending}>
              {clearMutation.isPending ? '...' : 'כן, נקה'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmClear(false)}>ביטול</Button>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        {filtered.length} רשומות {showAll ? '(כל הזמנים)' : '(היום)'}
      </p>

      {/* Queue records */}
      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">אין רשומות</div>
        )}
        {filtered.map((q, i) => {
          const trainee = traineeMap[q.context_id];
          const isExpanded = expanded[q.id || i];
          return (
            <div key={q.id || i} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-start gap-2 px-3 py-2.5 text-right"
                onClick={() => setExpanded(prev => ({ ...prev, [q.id || i]: !isExpanded }))}
              >
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">
                      {trainee?.full_name || q.to_name || q.context_id || '—'}
                    </span>
                    <span className="text-xs font-mono text-slate-400">{maskPhone(q.to_phone_e164)}</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLOR[q.status] || 'bg-slate-100 text-slate-600'}`}>
                      {q.status}
                    </span>
                    <span className="text-xs text-slate-400 mr-auto">{fmtTime(q.created_date)}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate text-right">{truncate(q.rendered_text, 70)}</p>
                  {q.error_message && (
                    <p className="text-xs text-red-600">שגיאה: {q.error_message}</p>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 border-t border-slate-100 pt-2 text-xs space-y-1.5">
                  <div className="grid grid-cols-2 gap-1">
                    <div><span className="text-slate-400">template_key: </span><span className="font-mono">{q.template_key || '—'}</span></div>
                    <div><span className="text-slate-400">provider: </span><span className="font-mono">{q.provider_type || '—'}</span></div>
                    <div><span className="text-slate-400">attempts: </span><span>{q.attempts ?? 0}</span></div>
                    <div><span className="text-slate-400">session_id: </span><span className="font-mono break-all">{q.session_id || '—'}</span></div>
                    {q.scheduled_for && <div><span className="text-slate-400">scheduled: </span><span>{fmtTime(q.scheduled_for)}</span></div>}
                    {q.last_attempt_at && <div><span className="text-slate-400">last attempt: </span><span>{fmtTime(q.last_attempt_at)}</span></div>}
                  </div>
                  {q.provider_response && (
                    <div className="bg-slate-50 rounded-lg p-2 font-mono text-[11px] break-all">
                      {q.provider_response}
                    </div>
                  )}
                  <div className="bg-slate-50 rounded-lg p-2 text-slate-600">
                    <b>הודעה מלאה:</b> {q.rendered_text || '—'}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}