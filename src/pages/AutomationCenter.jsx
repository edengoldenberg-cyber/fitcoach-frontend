import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import RuleBuilderModal from '@/components/automation/RuleBuilderModal';
import {
  Zap, Bell, AlertTriangle, CheckCircle2, XCircle, Clock, RotateCcw,
  Search, Plus, Edit, Copy, Archive, Trash2, Pause, Play, Eye,
  BarChart2, Settings, Activity, RefreshCw, ChevronDown, ChevronUp,
  Send, User, Shield,
} from 'lucide-react';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const PRIORITY_COLORS = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  normal:   'bg-blue-100 text-blue-700 border-blue-200',
  low:      'bg-slate-100 text-slate-600 border-slate-200',
};
const PRIORITY_LABELS = { critical: 'קריטי', high: 'גבוה', normal: 'רגיל', low: 'נמוך' };

const STATUS_COLORS = {
  sent:             'bg-green-100 text-green-700',
  blocked:          'bg-yellow-100 text-yellow-700',
  failed:           'bg-red-100 text-red-700',
  skipped:          'bg-slate-100 text-slate-500',
  priority_skipped: 'bg-purple-100 text-purple-600',
  rate_limited:     'bg-orange-100 text-orange-600',
  quiet_hours:      'bg-indigo-100 text-indigo-600',
  error:            'bg-red-200 text-red-800',
};

const RISK_COLORS = {
  low:      'bg-green-100 text-green-700',
  medium:   'bg-yellow-100 text-yellow-700',
  high:     'bg-orange-100 text-orange-600',
  critical: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>;
}
function PriorityBadge({ p }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[p] || PRIORITY_COLORS.normal}`}>{PRIORITY_LABELS[p] || p}</span>;
}

const api = (fn, body = {}) => base44.functions.invoke(fn, body);

// ─── TABS ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',  label: 'סקירה',       icon: <Activity size={15} /> },
  { id: 'rules',     label: 'חוקים',        icon: <Zap size={15} /> },
  { id: 'health',    label: 'ציוני בריאות', icon: <User size={15} /> },
  { id: 'alerts',    label: 'התראות',       icon: <Bell size={15} /> },
  { id: 'history',   label: 'היסטוריה',     icon: <Clock size={15} /> },
  { id: 'analytics', label: 'אנליטיקה',    icon: <BarChart2 size={15} /> },
  { id: 'settings',  label: 'הגדרות',      icon: <Settings size={15} /> },
];

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ rules, dash, timeline, qc }) {
  const today = dash?.today || {};
  const enabledRules = (rules || []).filter(r => r.enabled && !r.archived);

  const seedMut = useMutation({
    mutationFn: () => api('seedBehaviorAutomationRules'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['beh_rules'] }),
  });
  const runAllMut = useMutation({
    mutationFn: (w) => api('runBehaviorAutomationBatch', { window: w, dry_run: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['beh_execs'] }),
  });

  const tl = timeline || [];
  const maxBar = Math.max(...tl.map(d => d.sent + d.failed), 1);

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'חוקים פעילים', value: enabledRules.length, color: 'text-teal-600' },
          { label: 'נשלח היום',     value: today.sent    || 0, color: 'text-green-600' },
          { label: 'נכשל היום',     value: today.failed  || 0, color: 'text-red-500' },
          { label: 'פתוח (התראות)',  value: dash?.pending_alerts || 0, color: 'text-orange-500' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-100 rounded-2xl p-3 text-center shadow-sm">
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* 7-day trend */}
      {tl.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">7 ימים אחרונים</h3>
          <div className="flex items-end gap-1 h-20">
            {tl.map(d => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex flex-col justify-end h-16 gap-0.5">
                  <div style={{ height: `${(d.sent  / maxBar) * 60}px`, minHeight: d.sent  ? 4 : 0 }}
                    className="w-full bg-teal-400 rounded-sm" />
                  <div style={{ height: `${(d.failed / maxBar) * 60}px`, minHeight: d.failed ? 4 : 0 }}
                    className="w-full bg-red-300 rounded-sm" />
                </div>
                <span className="text-[9px] text-slate-400">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-1 justify-end">
            <span className="text-xs text-slate-500 flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-teal-400 inline-block"/>נשלח</span>
            <span className="text-xs text-slate-500 flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-300 inline-block"/>נכשל</span>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">פעולות מהירות</h3>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
            <RefreshCw size={11} className={seedMut.isPending ? 'animate-spin' : ''} /> טען חוקי ברירת מחדל
          </Button>
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => runAllMut.mutate('morning')} disabled={runAllMut.isPending}>
            <Play size={11} /> סימולציה בוקר
          </Button>
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => runAllMut.mutate('evening')} disabled={runAllMut.isPending}>
            <Play size={11} /> סימולציה ערב
          </Button>
        </div>
        {runAllMut.data && (
          <div className="text-xs text-teal-600 bg-teal-50 rounded-lg px-3 py-2">
            סימולציה: נשלח={runAllMut.data.data?.summary?.dry_run || 0} | דולג={runAllMut.data.data?.summary?.skipped || 0}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Rules Tab ────────────────────────────────────────────────────────────────

function RulesTab({ rules = [], qc }) {
  const [search, setSearch]           = useState('');
  const [filterPriority, setFP]       = useState('all');
  const [showArchived, setShowArch]   = useState(false);
  const [editRule, setEditRule]       = useState(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [simRule, setSimRule]         = useState(null);
  const [simTraineeId, setSimTId]     = useState('');
  const [simResult, setSimResult]     = useState(null);

  const { data: traineesData } = useQuery({
    queryKey: ['trainees_list'],
    queryFn: () => base44.entities.Trainee.list(),
    staleTime: 60000,
  });
  const trainees = traineesData || [];

  const toggleMut = useMutation({
    mutationFn: ({ code, enabled }) => api('updateBehaviorAutomationRule', { rule_code: code, enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['beh_rules'] }),
  });
  const pauseMut = useMutation({
    mutationFn: ({ code, paused }) => api('pauseBehaviorAutomationRule', { rule_code: code, paused }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['beh_rules'] }),
  });
  const dupMut = useMutation({
    mutationFn: (code) => api('duplicateBehaviorAutomationRule', { rule_code: code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['beh_rules'] }),
  });
  const archMut = useMutation({
    mutationFn: (code) => api('archiveBehaviorAutomationRule', { rule_code: code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['beh_rules'] }),
  });
  const delMut = useMutation({
    mutationFn: (code) => api('deleteBehaviorAutomationRule', { rule_code: code, force: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['beh_rules'] }),
  });
  const simMut = useMutation({
    mutationFn: (b) => api('simulateBehaviorAutomation', b),
    onSuccess: (d) => setSimResult(d?.data),
  });

  const filtered = (rules || []).filter(r => {
    if (!showArchived && r.archived) return false;
    if (filterPriority !== 'all' && r.priority !== filterPriority) return false;
    if (search && !r.name.includes(search) && !r.code.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="pr-9 h-9 text-sm" />
        </div>
        <select value={filterPriority} onChange={e => setFP(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 text-xs text-slate-600">
          <option value="all">כל העדיפויות</option>
          <option value="critical">קריטי</option>
          <option value="high">גבוה</option>
          <option value="normal">רגיל</option>
          <option value="low">נמוך</option>
        </select>
        <button onClick={() => setShowArch(v => !v)}
          className={`text-xs px-3 py-1 rounded-lg border transition-all ${showArchived ? 'bg-slate-800 text-white' : 'border-slate-200 text-slate-600'}`}>
          ארכיון
        </button>
        <Button size="sm" className="text-xs bg-teal-500 text-white gap-1 shrink-0" onClick={() => { setEditRule(null); setShowBuilder(true); }}>
          <Plus size={12} /> חדש
        </Button>
      </div>

      {/* Rules list */}
      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Zap size={32} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">אין חוקים</p>
        </div>
      )}

      {filtered.map(rule => (
        <RuleRow key={rule.id} rule={rule}
          onEdit={() => { setEditRule(rule); setShowBuilder(true); }}
          onToggle={() => toggleMut.mutate({ code: rule.code, enabled: !rule.enabled })}
          onPause={() => pauseMut.mutate({ code: rule.code, paused: !rule.paused })}
          onDuplicate={() => dupMut.mutate(rule.code)}
          onArchive={() => archMut.mutate(rule.code)}
          onDelete={() => { if (window.confirm('למחוק?')) delMut.mutate(rule.code); }}
          onSimulate={() => { setSimRule(rule); setSimResult(null); }}
        />
      ))}

      {/* Builder modal */}
      {showBuilder && (
        <RuleBuilderModal
          rule={editRule}
          onClose={() => setShowBuilder(false)}
          onSaved={() => { setShowBuilder(false); qc.invalidateQueries({ queryKey: ['beh_rules'] }); }}
        />
      )}

      {/* Simulation sheet */}
      {simRule && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end justify-center" dir="rtl">
          <div className="bg-white w-full max-w-lg rounded-t-2xl p-5 space-y-3 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800">סימולציה: {simRule.name}</h3>
              <button onClick={() => { setSimRule(null); setSimResult(null); }} className="p-1 text-slate-400"><XCircle size={18} /></button>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">בחר מתאמן</label>
              <select value={simTraineeId} onChange={e => setSimTId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">-- בחר --</option>
                {trainees.map(t => <option key={t.id} value={t.id}>{t.full_name || t.user_email}</option>)}
              </select>
            </div>
            <Button
              className="w-full bg-teal-500 text-white text-sm"
              disabled={!simTraineeId || simMut.isPending}
              onClick={() => simMut.mutate({ rule_code: simRule.code, trainee_id: simTraineeId })}
            >
              {simMut.isPending ? 'מריץ...' : 'הרץ סימולציה'}
            </Button>
            {simResult && (
              <div className={`rounded-xl p-3 text-sm ${simResult.triggered ? 'bg-green-50 border border-green-200' : 'bg-slate-50 border border-slate-200'}`}>
                <div className="font-bold mb-2">{simResult.triggered ? '✅ מופעל' : '⬜ לא מופעל'}</div>
                <div className="text-xs text-slate-600 space-y-1">
                  <div><b>סיבה:</b> {simResult.reason}</div>
                  {simResult.in_cooldown && <div className="text-orange-600">⏸ בקולדאון עד {new Date(simResult.cooldown_until).toLocaleString('he-IL')}</div>}
                  {simResult.conditions_matched?.length > 0 && (
                    <div><b>תנאים עמדו:</b> {simResult.conditions_matched.map(c => `${c.key}=${c.value}`).join(', ')}</div>
                  )}
                  {simResult.conditions_failed?.length > 0 && (
                    <div><b>תנאים נכשלו:</b> {simResult.conditions_failed.map(c => `${c.key}=${c.value}`).join(', ')}</div>
                  )}
                  {simResult.message_preview && (
                    <div className="bg-white rounded-lg p-2 mt-2 whitespace-pre-line border border-slate-200 text-slate-700">
                      <div className="text-xs text-slate-400 mb-1">תצוגת הודעה:</div>
                      {simResult.message_preview}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RuleRow({ rule, onEdit, onToggle, onPause, onDuplicate, onArchive, onDelete, onSimulate }) {
  const [expanded, setExpanded] = useState(false);
  const stats = rule.today_stats || {};
  const totalToday = Object.values(stats).reduce((s, v) => s + v, 0);

  return (
    <div className={`bg-white rounded-2xl border ${rule.enabled && !rule.paused ? 'border-slate-200' : 'border-slate-100 opacity-70'} p-3`}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <PriorityBadge p={rule.priority} />
            {rule.paused  && <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">מושהה</span>}
            {rule.archived && <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">ארכיון</span>}
          </div>
          <p className="font-semibold text-slate-800 text-sm mt-0.5 truncate">{rule.name}</p>
          {totalToday > 0 && (
            <div className="flex gap-2 mt-0.5 flex-wrap">
              {stats.sent    > 0 && <span className="text-xs text-green-600">✓{stats.sent}</span>}
              {stats.blocked > 0 && <span className="text-xs text-yellow-600">⊘{stats.blocked}</span>}
              {stats.failed  > 0 && <span className="text-xs text-red-600">✗{stats.failed}</span>}
            </div>
          )}
        </div>
        {/* Toggle */}
        <button onClick={onToggle} className={`w-11 h-6 rounded-full relative shrink-0 ${rule.enabled ? 'bg-teal-500' : 'bg-slate-300'}`}>
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${rule.enabled ? 'left-6' : 'left-1'}`} />
        </button>
        <button onClick={() => setExpanded(v => !v)} className="p-1 text-slate-400">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <div className="grid grid-cols-2 gap-1 text-xs text-slate-500 mb-2">
            <span>טריגר: {rule.trigger_type}</span>
            <span>קולדאון: {rule.cooldown_hours}ש'</span>
            {rule.schedule_window && <span>חלון: {rule.schedule_window}</span>}
            <span>גרסה: v{rule.version || 1}</span>
          </div>
          {rule.message_template && (
            <div className="bg-slate-50 rounded-lg p-2 text-xs text-slate-600 whitespace-pre-line mb-2 border border-slate-200">
              {rule.message_template.slice(0, 120)}{rule.message_template.length > 120 && '...'}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button onClick={onEdit}       className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 flex items-center gap-1"><Edit size={10}/> עריכה</button>
            <button onClick={onSimulate}   className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 flex items-center gap-1"><Play size={10}/> סימולציה</button>
            <button onClick={onDuplicate}  className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 flex items-center gap-1"><Copy size={10}/> שכפל</button>
            <button onClick={onPause}      className={`text-xs px-2 py-1 rounded-lg border flex items-center gap-1 ${rule.paused ? 'border-teal-200 text-teal-600' : 'border-slate-200 text-slate-600'}`}><Pause size={10}/> {rule.paused ? 'המשך' : 'השהה'}</button>
            {!rule.archived
              ? <button onClick={onArchive} className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 flex items-center gap-1"><Archive size={10}/> ארכיון</button>
              : <button onClick={onDelete}  className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-600 flex items-center gap-1"><Trash2 size={10}/> מחק</button>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Health Scores Tab ────────────────────────────────────────────────────────

function HealthTab({ qc }) {
  const [riskFilter, setRiskFilter] = useState('');

  const { data: scoresData, isLoading, refetch } = useQuery({
    queryKey: ['health_scores', riskFilter],
    queryFn: () => api('getTraineeHealthScores', { risk_level: riskFilter || undefined, limit: 100 }),
    staleTime: 60000,
  });

  const calcMut = useMutation({
    mutationFn: () => api('calculateAllHealthScores', {}),
    onSuccess: () => refetch(),
  });

  const scores = scoresData?.data?.scores || [];
  const dist   = scoresData?.data?.distribution || {};
  const avg    = scoresData?.data?.average || 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">ממוצע: <span className="text-teal-600 text-lg font-bold">{avg}</span>/100</div>
        <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => calcMut.mutate()} disabled={calcMut.isPending}>
          <RefreshCw size={11} className={calcMut.isPending ? 'animate-spin' : ''} /> חשב מחדש
        </Button>
      </div>

      {/* Distribution row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { key: 'low',      label: 'נמוך',     color: 'text-green-600' },
          { key: 'medium',   label: 'בינוני',   color: 'text-yellow-600' },
          { key: 'high',     label: 'גבוה',     color: 'text-orange-600' },
          { key: 'critical', label: 'קריטי',    color: 'text-red-600' },
        ].map(r => (
          <button key={r.key} onClick={() => setRiskFilter(riskFilter === r.key ? '' : r.key)}
            className={`rounded-xl p-2 text-center border transition-all ${riskFilter === r.key ? 'ring-2 ring-teal-400' : 'border-slate-100'} bg-white`}>
            <div className={`text-lg font-bold ${r.color}`}>{dist[r.key] || 0}</div>
            <div className="text-xs text-slate-500">{r.label}</div>
          </button>
        ))}
      </div>

      {isLoading && <div className="text-center py-8 text-slate-400 text-sm">טוען...</div>}
      {!isLoading && scores.length === 0 && (
        <div className="text-center py-12">
          <User size={32} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">אין ציוני בריאות</p>
          <Button size="sm" className="mt-3 bg-teal-500 text-white" onClick={() => calcMut.mutate()} disabled={calcMut.isPending}>
            חשב עכשיו
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {scores.map(s => {
          const trend = s.trend === 'up' ? '↑' : s.trend === 'down' ? '↓' : '→';
          const trendColor = s.trend === 'up' ? 'text-green-500' : s.trend === 'down' ? 'text-red-500' : 'text-slate-400';
          return (
            <div key={s.id} className="bg-white border border-slate-100 rounded-xl p-3 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full border-4 flex items-center justify-center shrink-0"
                style={{ borderColor: s.risk_level === 'low' ? '#22c55e' : s.risk_level === 'medium' ? '#eab308' : s.risk_level === 'high' ? '#f97316' : '#ef4444' }}>
                <span className="text-sm font-bold text-slate-700">{s.score}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{s.trainee_email}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_COLORS[s.risk_level] || ''}`}>{s.risk_level}</span>
                  <span className={`text-sm font-bold ${trendColor}`}>{trend}</span>
                  {s.previous_score !== null && <span className="text-xs text-slate-400">לפני: {s.previous_score}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Alerts Tab ───────────────────────────────────────────────────────────────

function AlertsTab({ qc }) {
  const { data: alertsData, isLoading, refetch } = useQuery({
    queryKey: ['coach_alerts_pending'],
    queryFn: () => api('getCoachAlerts', { status: 'pending', limit: 50 }),
    staleTime: 15000,
    refetchInterval: 60000,
  });

  const ackMut = useMutation({
    mutationFn: ({ id, action }) => api('acknowledgeCoachAlert', { alert_id: id, action }),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['beh_dash'] }); },
  });

  const alerts = alertsData?.data?.alerts || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">{alerts.length} התראות פתוחות</span>
        <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => refetch()}>
          <RefreshCw size={11} /> רענן
        </Button>
      </div>

      {isLoading && <div className="text-center py-8 text-slate-400 text-sm">טוען...</div>}
      {!isLoading && alerts.length === 0 && (
        <div className="text-center py-12">
          <CheckCircle2 size={32} className="text-green-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">אין התראות פתוחות</p>
        </div>
      )}

      {alerts.map(alert => {
        const isHigh = alert.priority === 'critical' || alert.priority === 'high';
        return (
          <div key={alert.id} className={`rounded-xl p-3 border ${isHigh ? 'border-red-200 bg-red-50' : 'border-orange-100 bg-orange-50'}`}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className={isHigh ? 'text-red-500 mt-0.5' : 'text-orange-400 mt-0.5'} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-slate-800">{alert.title}</p>
                <p className="text-xs text-slate-600 mt-0.5">{alert.body}</p>
                {alert.trainee_name && <p className="text-xs text-slate-500 mt-0.5">👤 {alert.trainee_name}</p>}
                <p className="text-xs text-slate-400 mt-1">{new Date(alert.created_at).toLocaleString('he-IL')}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => ackMut.mutate({ id: alert.id, action: 'acknowledged' })}>אישור</Button>
                <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => ackMut.mutate({ id: alert.id, action: 'resolved' })}>סגור</Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ qc }) {
  const [exFilter, setExFilter] = useState('all');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);

  const { data: exData, isLoading } = useQuery({
    queryKey: ['beh_execs', exFilter],
    queryFn: () => api('getBehaviorAutomationExecutions', { status: exFilter === 'all' ? undefined : exFilter, limit: 60 }),
    staleTime: 15000,
  });

  const retryMut = useMutation({
    mutationFn: (id) => api('retryBehaviorAutomationExecution', { execution_id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['beh_execs'] }),
  });

  const execs = (exData?.data?.executions || [])
    .filter(e => !search || e.rule_code?.toLowerCase().includes(search.toLowerCase()) || e.trainee_email?.includes(search));

  const STATUS_FILTERS = [
    { v: 'all',             l: 'הכל' },
    { v: 'sent',            l: 'נשלח' },
    { v: 'failed',          l: 'נכשל' },
    { v: 'blocked',         l: 'חסום' },
    { v: 'priority_skipped',l: 'עדיפות' },
    { v: 'rate_limited',    l: 'מוגבל' },
  ];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי כלל / מתאמן..." className="pr-9 h-9 text-sm" />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {STATUS_FILTERS.map(f => (
          <button key={f.v} onClick={() => setExFilter(f.v)}
            className={`shrink-0 text-xs px-3 py-1 rounded-full border ${exFilter === f.v ? 'bg-teal-500 text-white border-teal-500' : 'border-slate-200 text-slate-600'}`}>
            {f.l}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-center py-8 text-slate-400 text-sm">טוען...</div>}
      {!isLoading && execs.length === 0 && (
        <div className="text-center py-12">
          <Clock size={32} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">אין היסטוריה</p>
        </div>
      )}

      <div className="space-y-2">
        {execs.map(ex => (
          <div key={ex.id} className="bg-white rounded-xl border border-slate-100 p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <StatusBadge status={ex.status} />
                  <span className="text-xs font-mono text-slate-400">{ex.rule_code}</span>
                  {ex.channel === 'coach_alert' && <span className="text-xs text-orange-500">📢</span>}
                </div>
                <p className="text-sm text-slate-700 mt-0.5 truncate">{ex.trainee_name || ex.trainee_email || '—'}</p>
                {ex.error && <p className="text-xs text-red-500 mt-0.5 truncate">{ex.error}</p>}
                {ex.skipped_reason && <p className="text-xs text-slate-400 mt-0.5">{ex.skipped_reason}</p>}
                {ex.priority_reason && <p className="text-xs text-purple-500 mt-0.5">{ex.priority_reason}</p>}
                <p className="text-xs text-slate-400 mt-0.5">{new Date(ex.executed_at).toLocaleString('he-IL')}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => setExpanded(expanded === ex.id ? null : ex.id)} className="p-1 text-slate-400">
                  {expanded === ex.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {ex.status === 'failed' && (
                  <Button size="sm" variant="outline" className="text-xs h-7 px-2 gap-1" onClick={() => retryMut.mutate(ex.id)} disabled={retryMut.isPending}>
                    <RotateCcw size={10} />
                  </Button>
                )}
              </div>
            </div>
            {expanded === ex.id && (
              <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                {ex.message_rendered && <div className="bg-slate-50 rounded-lg p-2 text-slate-700 whitespace-pre-line">{ex.message_rendered}</div>}
                {ex.matched_conditions && <div><b>תנאים עמדו:</b> {ex.matched_conditions}</div>}
                {ex.failed_conditions  && <div><b>תנאים נכשלו:</b> {ex.failed_conditions}</div>}
                {ex.rate_limit_reason  && <div className="text-orange-600"><b>Rate limit:</b> {ex.rate_limit_reason}</div>}
                {ex.cooldown_reason    && <div className="text-blue-600"><b>קולדאון:</b> {ex.cooldown_reason}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [days, setDays] = useState(7);

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['beh_analytics', days],
    queryFn: () => api('getAutomationAnalytics', { days }),
    staleTime: 60000,
  });

  const analytics = analyticsData?.data?.analytics || [];

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <span className="text-sm text-slate-600">תקופה:</span>
        {[7, 14, 30].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`text-xs px-3 py-1 rounded-full border ${days === d ? 'bg-teal-500 text-white border-teal-500' : 'border-slate-200 text-slate-600'}`}>
            {d}י
          </button>
        ))}
      </div>

      {isLoading && <div className="text-center py-8 text-slate-400 text-sm">טוען...</div>}
      {!isLoading && analytics.length === 0 && (
        <div className="text-center py-12">
          <BarChart2 size={32} className="text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">אין נתוני אנליטיקה</p>
        </div>
      )}

      <div className="space-y-2">
        {analytics.map(a => {
          const s = a.stats;
          const sent = s.sent || 0, fail = s.failed || 0, skip = s.skipped || 0, total = s.total || 0;
          const sentPct = total > 0 ? Math.round((sent / total) * 100) : 0;
          return (
            <div key={a.code} className="bg-white border border-slate-100 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="font-medium text-sm text-slate-800">{a.name}</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <PriorityBadge p={a.priority} />
                    {a.paused   && <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">מושהה</span>}
                    {!a.enabled && <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">כבוי</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-teal-600">{sent}</div>
                  <div className="text-xs text-slate-400">נשלח</div>
                </div>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                <div className="bg-teal-400 h-1.5 rounded-full" style={{ width: `${sentPct}%` }} />
              </div>
              <div className="flex gap-3 text-xs text-slate-500">
                <span>סה"כ: {total}</span>
                <span className="text-green-600">✓ {sent}</span>
                <span className="text-red-500">✗ {fail}</span>
                <span>— {skip}</span>
                {s.whatsapp_sent > 0 && <span>📱 {s.whatsapp_sent}</span>}
                {s.coach_alerts  > 0 && <span>🔔 {s.coach_alerts}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const { data: cfgData, isLoading } = useQuery({
    queryKey: ['automation_config'],
    queryFn: () => api('getAutomationConfig', {}),
    staleTime: 30000,
  });

  const [cfg, setCfg] = useState(null);
  const [weights, setWeights] = useState(null);

  const saveMut = useMutation({
    mutationFn: (d) => api('updateAutomationConfig', d),
    onSuccess: (d) => d?.ok && window.location.reload(),
  });

  const cfgLoaded = cfgData?.data?.config;
  if (!cfg && cfgLoaded) {
    setCfg(cfgLoaded);
    try { setWeights(JSON.parse(cfgLoaded.health_score_weights || '{}')); } catch { setWeights({}); }
  }

  const DEFAULT_W = { app_login: 15, food_logging: 20, workout_completion: 20, protein: 15, calories: 10, water: 10, weight_checkin: 5, arbox_attendance: 5 };
  const W_LABELS  = { app_login: 'כניסה לאפליקציה', food_logging: 'תיעוד אכילה', workout_completion: 'אימון הושלם', protein: 'חלבון', calories: 'קלוריות', water: 'מים', weight_checkin: 'שקילה', arbox_attendance: 'נוכחות Arbox' };

  const totalW = Object.values(weights || {}).reduce((s, v) => s + (parseInt(v) || 0), 0);

  if (isLoading) return <div className="text-center py-8 text-slate-400 text-sm">טוען...</div>;

  return (
    <div className="space-y-4">
      {cfg && (
        <>
          {/* Quiet hours */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-3">
            <h3 className="font-semibold text-slate-700 text-sm">שעות שקטות</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">מתחיל</label>
                <Input type="time" value={cfg.quiet_hours_start} onChange={e => setCfg(c => ({ ...c, quiet_hours_start: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">מסתיים</label>
                <Input type="time" value={cfg.quiet_hours_end} onChange={e => setCfg(c => ({ ...c, quiet_hours_end: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Rate limits */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-3">
            <h3 className="font-semibold text-slate-700 text-sm">הגבלות קצב</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">WhatsApp מקסימום/יום</label>
                <Input type="number" min={1} max={10} value={cfg.max_whatsapp_per_day} onChange={e => setCfg(c => ({ ...c, max_whatsapp_per_day: parseInt(e.target.value) }))} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Push מקסימום/שעה</label>
                <Input type="number" min={1} max={5} value={cfg.max_push_per_hour} onChange={e => setCfg(c => ({ ...c, max_push_per_hour: parseInt(e.target.value) }))} />
              </div>
            </div>
          </div>

          {/* Health score weights */}
          {weights && (
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-700 text-sm">משקלי ציון בריאות</h3>
                <span className={`text-xs font-mono ${totalW === 100 ? 'text-green-600' : 'text-red-500'}`}>סה"כ: {totalW}/100</span>
              </div>
              {Object.entries(DEFAULT_W).map(([k, def]) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-36 shrink-0">{W_LABELS[k] || k}</span>
                  <input type="range" min={0} max={40} value={weights[k] ?? def}
                    onChange={e => setWeights(w => ({ ...w, [k]: parseInt(e.target.value) }))}
                    className="flex-1" />
                  <span className="text-xs font-mono text-slate-700 w-8 text-left">{weights[k] ?? def}</span>
                </div>
              ))}
            </div>
          )}

          {/* Pause all */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm text-slate-700">השהה את כל האוטומציות</p>
              <p className="text-xs text-slate-500 mt-0.5">רק חוקי קריטי ימשיכו לפעול</p>
            </div>
            <button onClick={() => setCfg(c => ({ ...c, paused_all: !c.paused_all }))}
              className={`w-12 h-6 rounded-full relative ${cfg.paused_all ? 'bg-amber-400' : 'bg-slate-300'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${cfg.paused_all ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          <Button
            className="w-full bg-teal-500 hover:bg-teal-600 text-white"
            disabled={saveMut.isPending || totalW !== 100}
            onClick={() => saveMut.mutate({ ...cfg, health_score_weights: weights })}
          >
            {saveMut.isPending ? 'שומר...' : totalW !== 100 ? `סה"כ משקלים חייב להיות 100 (כרגע ${totalW})` : 'שמור הגדרות'}
          </Button>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AutomationCenter() {
  const qc = useQueryClient();
  const [activeTab, setTab] = useState('overview');

  const { data: dashData } = useQuery({
    queryKey: ['beh_dash'],
    queryFn: () => api('getBehaviorAutomationDashboard', {}),
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ['beh_rules'],
    queryFn: () => api('getBehaviorAutomationRules', {}),
    staleTime: 30000,
  });

  const { data: timelineData } = useQuery({
    queryKey: ['beh_timeline'],
    queryFn: () => api('getAutomationTimeline', { days: 7 }),
    staleTime: 60000,
  });

  const dash     = dashData?.data || {};
  const rules    = rulesData?.data?.rules || [];
  const timeline = timelineData?.data?.timeline || [];

  const alertCount = dash.pending_alerts || 0;

  const TABS_WITH_BADGE = TABS.map(t => ({
    ...t,
    badge: t.id === 'alerts' && alertCount > 0 ? alertCount : null,
  }));

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Zap className="text-teal-500" size={22} />
            מרכז אוטומציות
          </h1>
          <div className="flex items-center gap-2">
            {dash.config?.paused_all && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium border border-amber-200">מושהה הכל</span>
            )}
            <Shield size={16} className="text-slate-400" />
          </div>
        </div>

        {/* Tab bar */}
        <div className="overflow-x-auto">
          <div className="flex gap-0.5 min-w-max bg-slate-100 rounded-xl p-1">
            {TABS_WITH_BADGE.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}>
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
                {t.badge && (
                  <span className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        {activeTab === 'overview'  && <OverviewTab rules={rules} dash={dash} timeline={timeline} qc={qc} />}
        {activeTab === 'rules'     && <RulesTab    rules={rules} qc={qc} />}
        {activeTab === 'health'    && <HealthTab   qc={qc} />}
        {activeTab === 'alerts'    && <AlertsTab   qc={qc} />}
        {activeTab === 'history'   && <HistoryTab  qc={qc} />}
        {activeTab === 'analytics' && <AnalyticsTab />}
        {activeTab === 'settings'  && <SettingsTab />}
      </div>
    </div>
  );
}
