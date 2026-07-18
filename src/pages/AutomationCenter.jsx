import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Zap, Bell, AlertTriangle, CheckCircle2, XCircle, Clock,
  RotateCcw, Search, ChevronDown, ChevronUp, Play, Pause,
  RefreshCw, Eye, Activity
} from 'lucide-react';

const PRIORITY_COLORS = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  normal:   'bg-blue-100 text-blue-700 border-blue-200',
  low:      'bg-slate-100 text-slate-600 border-slate-200',
};
const PRIORITY_LABELS = { critical: 'קריטי', high: 'גבוה', normal: 'רגיל', low: 'נמוך' };

const STATUS_COLORS = {
  sent:      'bg-green-100 text-green-700',
  blocked:   'bg-yellow-100 text-yellow-700',
  failed:    'bg-red-100 text-red-700',
  skipped:   'bg-slate-100 text-slate-500',
  dry_run:   'bg-purple-100 text-purple-700',
  error:     'bg-red-200 text-red-800',
  pending:   'bg-blue-100 text-blue-700',
  coach_alert: 'bg-orange-100 text-orange-700',
};

function StatusBadge({ status }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function RuleCard({ rule, onToggle, onRunNow }) {
  const [expanded, setExpanded] = useState(false);
  const stats = rule.today_stats || {};
  const totalToday = Object.values(stats).reduce((s, v) => s + v, 0);

  return (
    <div className={`bg-white rounded-2xl border ${rule.enabled ? 'border-slate-200' : 'border-slate-100 opacity-60'} p-4 transition-all`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[rule.priority] || PRIORITY_COLORS.normal}`}>
              {PRIORITY_LABELS[rule.priority] || rule.priority}
            </span>
            <span className="text-xs text-slate-400 font-mono">{rule.code}</span>
          </div>
          <h3 className="font-semibold text-slate-800 mt-1">{rule.name}</h3>
          {rule.description && (
            <p className="text-xs text-slate-500 mt-0.5">{rule.description}</p>
          )}
          {totalToday > 0 && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {stats.sent    > 0 && <span className="text-xs text-green-600">✓ {stats.sent} נשלח</span>}
              {stats.blocked > 0 && <span className="text-xs text-yellow-600">⊘ {stats.blocked} חסום</span>}
              {stats.failed  > 0 && <span className="text-xs text-red-600">✗ {stats.failed} נכשל</span>}
              {stats.skipped > 0 && <span className="text-xs text-slate-400">— {stats.skipped} דולג</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onToggle(rule.code, !rule.enabled)}
            className={`w-12 h-6 rounded-full transition-all relative ${rule.enabled ? 'bg-teal-500' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${rule.enabled ? 'left-7' : 'left-1'}`} />
          </button>
          <button onClick={() => setExpanded(v => !v)} className="p-1 text-slate-400 hover:text-slate-600">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
            <div><span className="font-medium">טריגר:</span> {rule.trigger_type}</div>
            <div><span className="font-medium">קולדאון:</span> {rule.cooldown_hours}ש'</div>
            {rule.schedule_time && <div><span className="font-medium">שעה:</span> {rule.schedule_time}</div>}
            {rule.schedule_window && <div><span className="font-medium">חלון:</span> {rule.schedule_window}</div>}
          </div>
          {rule.message_template && (
            <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-700 whitespace-pre-line leading-relaxed border border-slate-200">
              {rule.message_template}
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => onRunNow(rule.code)} className="text-xs gap-1">
              <Play size={12} /> הרץ עכשיו
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert, onAcknowledge, onResolve }) {
  const isHigh = alert.priority === 'critical' || alert.priority === 'high';
  return (
    <div className={`rounded-xl p-3 border ${isHigh ? 'border-red-200 bg-red-50' : 'border-orange-100 bg-orange-50'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className={isHigh ? 'text-red-500' : 'text-orange-400'} />
            <span className="font-medium text-sm text-slate-800">{alert.title}</span>
          </div>
          <p className="text-xs text-slate-600 mt-1">{alert.body}</p>
          {alert.trainee_name && (
            <span className="text-xs text-slate-500 mt-1 block">👤 {alert.trainee_name}</span>
          )}
          <span className="text-xs text-slate-400 block mt-1">
            {new Date(alert.created_at).toLocaleString('he-IL')}
          </span>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => onAcknowledge(alert.id)}>
            אישור
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => onResolve(alert.id)}>
            סגור
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AutomationCenter() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeTab, setTab] = useState('rules');
  const [exFilter, setExFilter] = useState('all');
  const [runResult, setRunResult] = useState(null);

  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ['behavior_dashboard'],
    queryFn:  () => base44.functions.invoke('getBehaviorAutomationDashboard', {}),
    staleTime: 30000,
  });

  const { data: rulesData, isLoading: rulesLoading, refetch: refetchRules } = useQuery({
    queryKey: ['behavior_rules'],
    queryFn:  () => base44.functions.invoke('getBehaviorAutomationRules', {}),
    staleTime: 30000,
  });

  const { data: exData, isLoading: exLoading } = useQuery({
    queryKey: ['behavior_executions', exFilter],
    queryFn:  () => base44.functions.invoke('getBehaviorAutomationExecutions', {
      status: exFilter === 'all' ? undefined : exFilter,
      limit: 50,
    }),
    staleTime: 15000,
  });

  const { data: alertsData, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery({
    queryKey: ['coach_alerts_pending'],
    queryFn:  () => base44.functions.invoke('getCoachAlerts', { status: 'pending', limit: 30 }),
    staleTime: 15000,
    refetchInterval: 60000,
  });

  const seedMut = useMutation({
    mutationFn: () => base44.functions.invoke('seedBehaviorAutomationRules', {}),
    onSuccess:  () => refetchRules(),
  });

  const toggleMut = useMutation({
    mutationFn: ({ code, enabled }) => base44.functions.invoke('updateBehaviorAutomationRule', { rule_code: code, enabled }),
    onSuccess:  () => refetchRules(),
  });

  const runNowMut = useMutation({
    mutationFn: (code) => base44.functions.invoke('runBehaviorAutomationBatch', { rule_codes: [code], dry_run: false }),
    onSuccess:  (d) => { setRunResult(d?.data); qc.invalidateQueries({ queryKey: ['behavior_executions'] }); },
  });

  const ackMut = useMutation({
    mutationFn: ({ id, action }) => base44.functions.invoke('acknowledgeCoachAlert', { alert_id: id, action }),
    onSuccess:  () => { refetchAlerts(); qc.invalidateQueries({ queryKey: ['behavior_dashboard'] }); },
  });

  const retryMut = useMutation({
    mutationFn: (id) => base44.functions.invoke('retryBehaviorAutomationExecution', { execution_id: id }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['behavior_executions'] }),
  });

  const dash    = dashData?.data || {};
  const rules   = rulesData?.data?.rules || [];
  const execs   = exData?.data?.executions || [];
  const alerts  = alertsData?.data?.alerts || [];

  const filteredRules = rules.filter(r =>
    !search || r.name.includes(search) || r.code.toLowerCase().includes(search.toLowerCase())
  );

  const today = dash.today || {};
  const totalToday = (today.sent || 0) + (today.failed || 0) + (today.blocked || 0);

  const TABS = [
    { id: 'rules',   label: 'אוטומציות',   icon: <Zap size={15} /> },
    { id: 'alerts',  label: `התראות (${dash.pending_alerts || 0})`, icon: <Bell size={15} /> },
    { id: 'history', label: 'היסטוריה',    icon: <Activity size={15} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Zap className="text-teal-500" size={22} />
              מרכז אוטומציות
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">מנוע אוטומציה התנהגותי v1</p>
          </div>
          <Button
            size="sm" variant="outline"
            onClick={() => seedMut.mutate()}
            disabled={seedMut.isPending}
            className="text-xs gap-1"
          >
            <RefreshCw size={12} className={seedMut.isPending ? 'animate-spin' : ''} />
            {rules.length === 0 ? 'טען חוקים' : 'עדכן'}
          </Button>
        </div>

        {/* KPI bar */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { label: 'פעיל היום', value: totalToday, color: 'text-teal-600' },
            { label: 'נשלח',     value: today.sent || 0,   color: 'text-green-600' },
            { label: 'נכשל',     value: today.failed || 0, color: 'text-red-500' },
            { label: 'התראות',   value: dash.pending_alerts || 0, color: 'text-orange-500' },
          ].map(k => (
            <div key={k.label} className="bg-slate-50 rounded-xl p-2 text-center">
              <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs text-slate-500">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 bg-slate-100 rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {/* Run result toast */}
        {runResult && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-teal-700">תוצאת הרצה</span>
              <button onClick={() => setRunResult(null)} className="text-teal-400 text-xs">✕</button>
            </div>
            <div className="flex gap-3 mt-1 text-xs text-teal-600 flex-wrap">
              <span>נשלח: {runResult.summary?.sent || 0}</span>
              <span>דולג: {runResult.summary?.skipped || 0}</span>
              <span>נכשל: {runResult.summary?.failed || 0}</span>
            </div>
          </div>
        )}

        {/* ─── RULES TAB ─────────────────────────────────────────── */}
        {activeTab === 'rules' && (
          <>
            <div className="relative">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש אוטומציה..."
                className="pr-9 text-sm h-9"
              />
            </div>

            {rulesLoading && <div className="text-center py-8 text-slate-400 text-sm">טוען...</div>}

            {!rulesLoading && filteredRules.length === 0 && (
              <div className="text-center py-12">
                <Zap size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">אין חוקי אוטומציה</p>
                <Button size="sm" className="mt-3" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
                  טען 12 חוקים ברירת מחדל
                </Button>
              </div>
            )}

            {filteredRules.map(rule => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onToggle={(code, enabled) => toggleMut.mutate({ code, enabled })}
                onRunNow={(code) => runNowMut.mutate(code)}
              />
            ))}
          </>
        )}

        {/* ─── ALERTS TAB ────────────────────────────────────────── */}
        {activeTab === 'alerts' && (
          <>
            {alertsLoading && <div className="text-center py-8 text-slate-400 text-sm">טוען...</div>}
            {!alertsLoading && alerts.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle2 size={32} className="text-green-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">אין התראות פתוחות</p>
              </div>
            )}
            {alerts.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={(id) => ackMut.mutate({ id, action: 'acknowledged' })}
                onResolve={(id) => ackMut.mutate({ id, action: 'resolved' })}
              />
            ))}
          </>
        )}

        {/* ─── HISTORY TAB ───────────────────────────────────────── */}
        {activeTab === 'history' && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {['all', 'sent', 'failed', 'blocked', 'coach_alert'].map(f => (
                <button
                  key={f}
                  onClick={() => setExFilter(f)}
                  className={`shrink-0 text-xs px-3 py-1 rounded-full border transition-all ${
                    exFilter === f ? 'bg-teal-500 text-white border-teal-500' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {f === 'all' ? 'הכל' : f === 'sent' ? 'נשלח' : f === 'failed' ? 'נכשל' : f === 'blocked' ? 'חסום' : 'התראות'}
                </button>
              ))}
            </div>

            {exLoading && <div className="text-center py-8 text-slate-400 text-sm">טוען...</div>}

            {!exLoading && execs.length === 0 && (
              <div className="text-center py-12">
                <Clock size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">אין היסטוריית הרצות</p>
              </div>
            )}

            <div className="space-y-2">
              {execs.map(ex => (
                <div key={ex.id} className="bg-white rounded-xl border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={ex.status} />
                        <span className="text-xs font-mono text-slate-400">{ex.rule_code}</span>
                        {ex.channel === 'coach_alert' && <span className="text-xs text-orange-500">📢 התראה</span>}
                      </div>
                      <p className="text-sm text-slate-700 mt-1 truncate">{ex.trainee_name || ex.trainee_email || '—'}</p>
                      {ex.error && <p className="text-xs text-red-500 mt-0.5 truncate">{ex.error}</p>}
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(ex.executed_at).toLocaleString('he-IL')}
                      </p>
                    </div>
                    {ex.status === 'failed' && (
                      <Button
                        size="sm" variant="outline"
                        className="text-xs h-7 px-2 shrink-0 gap-1"
                        onClick={() => retryMut.mutate(ex.id)}
                        disabled={retryMut.isPending}
                      >
                        <RotateCcw size={11} />
                        נסה שוב
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
