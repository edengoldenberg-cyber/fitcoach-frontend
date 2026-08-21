/**
 * ReminderCenterTab — coach-friendly automation management hub.
 *
 * Tabs:
 *   - אוטומציות — card list (active/inactive), create, edit, history, duplicate
 *   - דורש טיפול — coach attention items from follow-up escalations
 *
 * Dashboard header shows real today-scoped stats from getAutomationDashboardStats.
 */
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Plus, Edit2, Copy, Power, Clock, MessageSquare, History,
  Search, RefreshCw, Zap, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Loader2, AlertTriangle, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import AutomationEditorDrawer from './AutomationEditorDrawer';
import AutomationHistoryDrawer from './AutomationHistoryDrawer';
import CoachAttentionTab from './CoachAttentionTab';

// ─── Trigger display meta ──────────────────────────────────────────────────────
const TRIGGER_META = {
  no_attendance:        { label: 'לא ביקר במכון',    icon: '🏃', category: 'היעדרות' },
  consecutive_absences: { label: 'היעדרויות רצופות',  icon: '📉', category: 'היעדרות' },
  birthday:             { label: 'יום הולדת',         icon: '🎂', category: 'מועדים'  },
  package_expiry:       { label: 'מנוי עומד לפוג',    icon: '⏰', category: 'מנוי'    },
  remaining_sessions:   { label: 'מפגשים נותרו',      icon: '🎯', category: 'מנוי'    },
  class_reminder:       { label: 'תזכורת שיעור',      icon: '📅', category: 'תזמון'   },
  exact_date:           { label: 'תאריך ספציפי',      icon: '📌', category: 'תזמון'   },
  weekday_time:         { label: 'ימים ושעה קבועים',  icon: '📆', category: 'תזמון'   },
  manual_test:          { label: 'בדיקה ידנית',       icon: '🧪', category: 'בדיקות'  },
};

const DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function parseJson(s) { try { return s ? JSON.parse(s) : {}; } catch { return {}; } }

function getTriggerSummary(automation) {
  const tc = parseJson(automation.trigger_config);
  switch (automation.trigger_type) {
    case 'no_attendance':
      return `אחרי ${tc.threshold_days ?? 7} ימי היעדרות`;
    case 'consecutive_absences':
      return `אחרי ${tc.absence_count ?? 3} ביטולים רצופים`;
    case 'package_expiry':
      return `${tc.days_before_expiry ?? 7} ימים לפני פקיעה`;
    case 'remaining_sessions':
      return `${tc.remaining_sessions ?? 3} מפגשים נותרו`;
    case 'class_reminder':
      return `${tc.class_offset_minutes ?? 120} דקות לפני שיעור`;
    case 'weekday_time': {
      const days = (tc.weekdays || []).map(d => DAYS_SHORT[d]).join(' ');
      return `${days} בשעה ${tc.time ?? '08:00'}`;
    }
    case 'exact_date':
      return tc.exact_date ? `ב-${tc.exact_date}` : 'תאריך לא מוגדר';
    case 'birthday':
      return 'ביום ההולדת';
    case 'manual_test':
      return 'בדיקה ידנית בלבד';
    default:
      return '';
  }
}

function getVariantCount(automation) {
  if (!automation.message_variants) return 1;
  try {
    const v = JSON.parse(automation.message_variants);
    const enabled = Array.isArray(v) ? v.filter(x => x.enabled).length : 0;
    return enabled || 1;
  } catch { return 1; }
}

function getTargetingLabel(automation) {
  switch (automation.target_type) {
    case 'one':
      return 'טלפון ספציפי';
    case 'selected': {
      try {
        const ids = JSON.parse(automation.target_member_ids || '[]');
        return `${ids.length} חברים נבחרים`;
      } catch { return 'חברים נבחרים'; }
    }
    case 'excluded': {
      try {
        const ids = JSON.parse(automation.target_member_ids || '[]');
        return `כולם למעט ${ids.length}`;
      } catch { return 'מוחרגים'; }
    }
    default:
      return 'כל החברים הפעילים';
  }
}

function hasFollowUp(automation) {
  if (!automation.follow_up_config) return false;
  try {
    const cfg = JSON.parse(automation.follow_up_config);
    return cfg?.enabled && cfg?.steps?.length > 0;
  } catch { return false; }
}

// ─── Automation Card ───────────────────────────────────────────────────────────
function AutomationCard({ automation, queueStats, onEdit, onToggle, onDuplicate, onHistory }) {
  const meta           = TRIGGER_META[automation.trigger_type] || { label: automation.trigger_type, icon: '⚙️' };
  const triggerSummary = getTriggerSummary(automation);
  const variantCount   = getVariantCount(automation);
  const targetLabel    = getTargetingLabel(automation);
  const followUp       = hasFollowUp(automation);
  const stats          = queueStats?.[automation.id] || {};

  return (
    <div className={`bg-white rounded-2xl border-2 transition-all ${automation.enabled ? 'border-teal-200 shadow-sm' : 'border-slate-200 opacity-75'}`}>
      {/* Top */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${automation.enabled ? 'bg-teal-50' : 'bg-slate-100'}`}>
            {meta.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900 text-sm truncate">{automation.name}</h3>
              <Badge className={`text-xs px-2 py-0 border ${automation.enabled ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                {automation.enabled ? '✅ פעיל' : '⏸ כבוי'}
              </Badge>
              {followUp && (
                <Badge className="text-xs px-2 py-0 border bg-indigo-50 text-indigo-600 border-indigo-200">
                  + מעקב
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{meta.label}</p>
          </div>
          <Switch checked={automation.enabled} onCheckedChange={() => onToggle(automation)} className="flex-shrink-0" />
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 col-span-2">
            <Zap className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{triggerSummary || meta.label}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Users className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{targetLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{variantCount > 1 ? `${variantCount} וריאציות` : 'הודעה אחת'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span>המתנה: {automation.cooldown_hours}ש׳</span>
          </div>
        </div>

        {/* Queue stats */}
        {(stats.sent > 0 || stats.failed > 0) && (
          <div className="flex gap-3 mt-2 pt-2 border-t border-slate-100">
            {stats.sent > 0 && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {stats.sent} נשלחו
              </div>
            )}
            {stats.failed > 0 && (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <XCircle className="w-3.5 h-3.5" />
                {stats.failed} נכשלו
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-slate-100 px-4 py-2.5 flex gap-2">
        <Button size="sm" onClick={() => onEdit(automation)}
          className="flex-1 h-8 text-xs gap-1.5 bg-slate-50 hover:bg-teal-50 text-slate-700 hover:text-teal-700 border border-slate-200 hover:border-teal-200 font-medium shadow-none">
          <Edit2 className="w-3.5 h-3.5" />
          עריכה
        </Button>
        <Button size="sm" onClick={() => onHistory(automation)} title="היסטוריה"
          className="h-8 px-3 text-xs gap-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 shadow-none">
          <History className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" onClick={() => onDuplicate(automation)} title="שכפל"
          className="h-8 px-3 text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 shadow-none">
          <Copy className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// Static Tailwind class map — dynamic class interpolation is not supported by Tailwind JIT.
const STAT_TILE_CLASSES = {
  green: { wrap: 'bg-green-50 border-green-200', icon: 'text-green-500', val: 'text-green-800', lbl: 'text-green-600' },
  teal:  { wrap: 'bg-teal-50 border-teal-200',   icon: 'text-teal-500',  val: 'text-teal-800',  lbl: 'text-teal-600'  },
  red:   { wrap: 'bg-red-50 border-red-200',      icon: 'text-red-500',   val: 'text-red-800',   lbl: 'text-red-600'   },
  amber: { wrap: 'bg-amber-50 border-amber-200',  icon: 'text-amber-500', val: 'text-amber-800', lbl: 'text-amber-600' },
};

// ─── Dashboard header ──────────────────────────────────────────────────────────
function DashboardHeader({ coachEmail }) {
  const { data } = useQuery({
    queryKey:        ['automationDashboard', coachEmail],
    queryFn:         () => base44.functions.invoke('getAutomationDashboardStats', { coachEmail }),
    enabled:         !!coachEmail,
    staleTime:       60_000,
    refetchInterval: 120_000,
  });
  const stats = data?.data;
  if (!stats) return null;

  const tiles = [
    { label: 'פעילות',      value: stats.active,           color: 'green', icon: CheckCircle2  },
    { label: 'נשלחו היום',  value: stats.sent_today,       color: 'teal',  icon: MessageSquare },
    { label: 'נכשלו היום',  value: stats.failed_today,     color: 'red',   icon: XCircle       },
    { label: 'דורש טיפול',  value: stats.needs_attention,  color: 'amber', icon: AlertTriangle },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map(({ label, value, color, icon: Icon }) => {
        const cls = STAT_TILE_CLASSES[color];
        return (
          <div key={label} className={`flex items-center gap-2 ${cls.wrap} border rounded-xl px-3 py-2.5`}>
            <Icon className={`w-4 h-4 ${cls.icon} flex-shrink-0`} />
            <div>
              <p className={`text-lg font-bold ${cls.val} leading-none`}>{value ?? '—'}</p>
              <p className={`text-xs ${cls.lbl} mt-0.5`}>{label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main tab ──────────────────────────────────────────────────────────────────
export default function ReminderCenterTab({ coachEmail }) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab]       = useState('automations'); // 'automations' | 'attention'
  const [search, setSearch]             = useState('');
  const [editingAuto, setEditingAuto]   = useState(null); // automation | 'new'
  const [historyAuto, setHistoryAuto]   = useState(null); // automation for history drawer
  const [showInactive, setShowInactive] = useState(false);
  const [seeding, setSeeding]           = useState(false);

  const { data: automations = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['whatsAppAutomations', coachEmail],
    queryFn: () => base44.entities.WhatsAppAutomation.filter({ coach_email: coachEmail }),
    enabled: !!coachEmail,
    staleTime: 30_000,
  });

  // Queue stats for sent/failed counts on cards (not date-filtered — lifetime per automation)
  const { data: queueRaw = [] } = useQuery({
    queryKey: ['queueStatsForCenter', coachEmail],
    queryFn: () => base44.entities.WhatsAppMessageQueue.filter({ coach_email: coachEmail }),
    enabled: !!coachEmail,
    staleTime: 60_000,
    select: rows => {
      const map = {};
      rows.forEach(r => {
        if (!r.context_id) return;
        if (!map[r.context_id]) map[r.context_id] = { sent: 0, failed: 0 };
        if (r.status === 'sent')   map[r.context_id].sent++;
        if (r.status === 'failed') map[r.context_id].failed++;
      });
      return map;
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return automations.filter(a =>
      !q || a.name.toLowerCase().includes(q) ||
      (TRIGGER_META[a.trigger_type]?.label || '').includes(q)
    );
  }, [automations, search]);

  const activeAutomations   = filtered.filter(a => a.enabled);
  const inactiveAutomations = filtered.filter(a => !a.enabled);

  const handleToggle = async (automation) => {
    try {
      await base44.entities.WhatsAppAutomation.update(automation.id, { enabled: !automation.enabled });
      toast.success(automation.enabled ? '⏸ אוטומציה הושהתה' : '✅ אוטומציה הופעלה');
      qc.invalidateQueries({ queryKey: ['whatsAppAutomations'] });
      qc.invalidateQueries({ queryKey: ['automationDashboard'] });
    } catch {
      toast.error('שגיאה בעדכון מצב');
    }
  };

  const handleDuplicate = async (automation) => {
    try {
      const payload = {
        coach_email:       automation.coach_email,
        name:              `עותק — ${automation.name}`,
        trigger_type:      automation.trigger_type,
        message_template:  automation.message_template,
        message_variants:  automation.message_variants,
        target_type:       automation.target_type,
        target_phone:      automation.target_phone,
        target_member_ids: automation.target_member_ids,
        trigger_config:    automation.trigger_config,
        schedule_config:   automation.schedule_config,
        consent_category:  automation.consent_category,
        follow_up_config:  automation.follow_up_config,
        enabled:           false, // always start disabled
        cooldown_hours:    automation.cooldown_hours,
      };
      await base44.entities.WhatsAppAutomation.create(payload);
      toast.success('עותק נוצר — כבוי כברירת מחדל');
      qc.invalidateQueries({ queryKey: ['whatsAppAutomations'] });
    } catch {
      toast.error('שגיאה בשכפול');
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await base44.functions.invoke('seedArboxAutomations', { coachEmail });
      toast.success(res?.data?.created > 0 ? `נוצרו ${res.data.created} אוטומציות` : 'האוטומציות כבר קיימות');
      qc.invalidateQueries({ queryKey: ['whatsAppAutomations'] });
    } catch (err) {
      toast.error('שגיאה: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ['whatsAppAutomations'] });
    qc.invalidateQueries({ queryKey: ['automationDashboard'] });
  };

  // ── Attention count for tab badge ──
  const { data: attentionData } = useQuery({
    queryKey: ['coachAttentionCount', coachEmail],
    queryFn:  () => base44.functions.invoke('getCoachAttentionItems', { coachEmail }),
    enabled:  !!coachEmail,
    staleTime: 60_000,
  });
  const attentionCount = attentionData?.data?.total ?? 0;

  return (
    <div className="space-y-5" dir="rtl">
      {/* Dashboard header */}
      <DashboardHeader coachEmail={coachEmail} />

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'automations', label: 'אוטומציות' },
          { key: 'attention',   label: 'דורש טיפול', count: attentionCount },
        ].map(tab => (
          <button key={tab.key} type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
              activeTab === tab.key
                ? 'border-teal-500 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {tab.label}
            {tab.count > 0 && (
              <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {tab.count > 9 ? '9+' : tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Automations tab ── */}
      {activeTab === 'automations' && (
        <>
          {/* Header row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חפש אוטומציה..."
                className="pr-9 text-sm"
                dir="rtl"
              />
            </div>
            <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-1.5 flex-shrink-0">
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              רענן
            </Button>
            <Button onClick={() => setEditingAuto('new')} size="sm"
              className="gap-1.5 text-white flex-shrink-0" style={{ backgroundColor: '#79DBD6' }}>
              <Plus className="w-4 h-4" />
              חדשה
            </Button>
          </div>

          {/* Stats pills */}
          {!isLoading && (
            <div className="flex gap-3 flex-wrap">
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-800">{activeAutomations.length}</span>
                <span className="text-xs text-green-600">פעילות</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <Power className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-700">{inactiveAutomations.length}</span>
                <span className="text-xs text-slate-500">כבויות</span>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-12 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
              טוען אוטומציות...
            </div>
          ) : (
            <>
              {/* Active */}
              {activeAutomations.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    אוטומציות פעילות ({activeAutomations.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {activeAutomations.map(a => (
                      <AutomationCard key={a.id} automation={a} queueStats={queueRaw}
                        onEdit={auto => setEditingAuto(auto)}
                        onToggle={handleToggle}
                        onDuplicate={handleDuplicate}
                        onHistory={auto => setHistoryAuto(auto)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {automations.length === 0 && !search && (
                <div className="text-center py-10 bg-white rounded-2xl border-2 border-dashed border-slate-200 space-y-3">
                  <p className="text-slate-500 font-semibold">אין אוטומציות עדיין</p>
                  <p className="text-sm text-slate-400">צור את הראשונה ידנית, או טען את האוטומציות הסטנדרטיות</p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <Button onClick={() => setEditingAuto('new')} size="sm"
                      className="text-white gap-2" style={{ backgroundColor: '#79DBD6' }}>
                      <Plus className="w-4 h-4" />
                      צור אוטומציה
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding} className="gap-2">
                      {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      טען ברירות מחדל
                    </Button>
                  </div>
                </div>
              )}

              {/* Empty search */}
              {automations.length > 0 && filtered.length === 0 && search && (
                <div className="text-center py-8 text-slate-400 text-sm">
                  אין תוצאות לחיפוש &ldquo;{search}&rdquo;
                </div>
              )}

              {/* Inactive */}
              {inactiveAutomations.length > 0 && (
                <div className="space-y-3">
                  <button type="button" onClick={() => setShowInactive(v => !v)}
                    className="w-full flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors py-1">
                    <Power className="w-4 h-4" />
                    אוטומציות כבויות ({inactiveAutomations.length})
                    {showInactive ? <ChevronUp className="w-4 h-4 mr-auto" /> : <ChevronDown className="w-4 h-4 mr-auto" />}
                  </button>
                  {showInactive && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {inactiveAutomations.map(a => (
                        <AutomationCard key={a.id} automation={a} queueStats={queueRaw}
                          onEdit={auto => setEditingAuto(auto)}
                          onToggle={handleToggle}
                          onDuplicate={handleDuplicate}
                          onHistory={auto => setHistoryAuto(auto)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Attention tab ── */}
      {activeTab === 'attention' && <CoachAttentionTab coachEmail={coachEmail} />}

      {/* Drawers */}
      {editingAuto && (
        <AutomationEditorDrawer
          automation={editingAuto === 'new' ? null : editingAuto}
          coachEmail={coachEmail}
          isNew={editingAuto === 'new'}
          onClose={() => setEditingAuto(null)}
          onSaved={onSaved}
          onDeleted={onSaved}
        />
      )}
      {historyAuto && (
        <AutomationHistoryDrawer
          automation={historyAuto}
          coachEmail={coachEmail}
          onClose={() => setHistoryAuto(null)}
        />
      )}
    </div>
  );
}
