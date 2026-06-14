import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { XCircle, Search } from 'lucide-react';

const REASON_LABELS = {
  daily_cap_reached: 'מכסה יומית הושגה',
  meal_daily_limit_reached: 'הגבלת תזכורת ארוחה יומית',
  water_daily_limit_reached: 'הגבלת תזכורת מים יומית',
  duplicate_blocked: 'כפילות — כבר נשלח היום',
  whatsapp_notifications_disabled: 'WhatsApp מכובה למשתמש',
  no_valid_phone: 'אין מספר טלפון תקין',
  outside_window: 'מחוץ לחלון שליחה',
  outside_time_window: 'מחוץ לחלון זמן',
  not_relevant_to_user_state: 'לא רלוונטי למצב המשתמש',
  user_silenced: 'משתמש בשקט (3 הודעות ללא תגובה)',
  inactive_recovery_mode: 'מצב התאוששות פעיל',
  meal_already_logged: 'ארוחה כבר נרשמה',
  water_progress_ok: 'צריכת מים תקינה',
  kill_switch_blocked: 'Kill Switch חוסם',
  could_not_load_user_state: 'שגיאה בטעינת מצב המשתמש',
  gate_error: 'שגיאת מערכת ב-Smart Gate',
};

function fmtTime(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ts; }
}

function ReasonBadge({ reason }) {
  const label = REASON_LABELS[reason] || reason;
  const isHard = ['kill_switch_blocked', 'no_valid_phone', 'whatsapp_notifications_disabled', 'gate_error'].includes(reason);
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${isHard ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
      {label}
    </span>
  );
}

export default function WACDBlocked({ data }) {
  const { todayEventLogs, traineeMap } = data;
  const [search, setSearch] = useState('');
  const [filterReason, setFilterReason] = useState('all');
  const [expanded, setExpanded] = useState({});

  const blocked = useMemo(() =>
    todayEventLogs
      .filter(e => e.event_type === 'reminder_skipped' || e.blocked_reason)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [todayEventLogs]
  );

  const reasons = useMemo(() => {
    const s = new Set(blocked.map(b => b.blocked_reason).filter(Boolean));
    return Array.from(s);
  }, [blocked]);

  const filtered = useMemo(() => {
    let r = blocked;
    if (filterReason !== 'all') r = r.filter(x => x.blocked_reason === filterReason);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(x =>
        x.trainee_email?.toLowerCase().includes(s) ||
        (traineeMap[x.trainee_id]?.full_name || '').toLowerCase().includes(s)
      );
    }
    return r;
  }, [blocked, filterReason, search, traineeMap]);

  // Summary by reason
  const bySeason = useMemo(() => {
    const m = {};
    blocked.forEach(b => {
      const r = b.blocked_reason || 'unknown';
      m[r] = (m[r] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [blocked]);

  return (
    <div className="space-y-4">
      {/* By reason summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {bySeason.map(([reason, count]) => (
          <button
            key={reason}
            onClick={() => setFilterReason(filterReason === reason ? 'all' : reason)}
            className={`text-right p-3 rounded-xl border transition-all ${filterReason === reason ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
          >
            <div className="text-xl font-bold text-orange-600">{count}</div>
            <div className="text-xs text-slate-600 mt-0.5">{REASON_LABELS[reason] || reason}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 h-9 text-sm" />
        </div>
        <Select value={filterReason} onValueChange={setFilterReason}>
          <SelectTrigger className="w-48 h-9 text-sm">
            <SelectValue placeholder="סיבת חסימה" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסיבות</SelectItem>
            {reasons.map(r => <SelectItem key={r} value={r}>{REASON_LABELS[r] || r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-slate-500">{filtered.length} הודעות נחסמו היום</p>

      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">אין חסימות היום</div>
        )}
        {filtered.map((e, i) => {
          const trainee = traineeMap[e.trainee_id] || traineeMap[e.trainee_email];
          const isExpanded = expanded[e.id || i];
          return (
            <div key={e.id || i} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-start gap-2 px-3 py-2.5 text-right"
                onClick={() => setExpanded(prev => ({ ...prev, [e.id || i]: !isExpanded }))}
              >
                <XCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">
                      {trainee?.full_name || e.trainee_email || '—'}
                    </span>
                    <span className="text-xs text-slate-400">{fmtTime(e.timestamp)}</span>
                    <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{e.trigger_type}</span>
                    <ReasonBadge reason={e.blocked_reason} />
                  </div>
                </div>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-slate-100 pt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-slate-400">אימייל: </span><span className="font-mono">{e.trainee_email}</span></div>
                    <div><span className="text-slate-400">trigger: </span><span className="font-mono">{e.trigger_type}</span></div>
                    <div><span className="text-slate-400">זמן: </span><span>{new Date(e.timestamp).toLocaleString('he-IL')}</span></div>
                    <div><span className="text-slate-400">סיבה: </span><span className="text-orange-600 font-medium">{e.blocked_reason || '—'}</span></div>
                  </div>
                  {e.user_state && (
                    <div className="bg-slate-50 rounded-lg p-2">
                      <p className="text-xs font-semibold text-slate-600 mb-1">מצב משתמש:</p>
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        <div>ארוחות: <b>{e.user_state.meals_logged_today ?? '?'}</b></div>
                        <div>מים: <b>{e.user_state.water_logged_today ?? '?'} ml</b></div>
                        <div>הודעות היום: <b>{e.user_state.messages_sent_today ?? '?'}</b></div>
                        <div>התאוששות: <b>{e.user_state.is_in_recovery_mode ? 'כן' : 'לא'}</b></div>
                        <div>התחברות לפני: <b>{e.user_state.last_login_hours_ago ?? '?'}h</b></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}