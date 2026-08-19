/**
 * AutomationControlCenter.jsx
 *
 * Unified Automation Control Center for Mission Control.
 * Renders all 3 automation systems in one operational table with detail drawer.
 *
 * System A — Trainee Reminders (read-only, hard-coded)
 * System B — Behavior Automation Rules (DB-configurable: enabled/paused/cooldown/schedule)
 * System C — Arbox WhatsApp Builder (fully CRUD)
 *
 * No WhatsApp sends originate from this component.
 * Dry-run calls are safe (dry_run=true, no queue jobs created).
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Search, Zap, Bell, Settings, Activity, Clock, CheckCircle2, XCircle,
  AlertTriangle, Shield, Play, Pause, Edit2, Eye, RefreshCw,
  ChevronRight, ChevronDown, Info, MessageSquare, Loader2, BarChart3,
  Lock, Unlock, Filter, Database, Users,
} from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────────

const api = (fn, body = {}) => base44.functions.invoke(fn, body);

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; }
}

function systemLabel(sys) {
  if (sys === 'A') return 'תזכורות';
  if (sys === 'B') return 'התנהגות';
  if (sys === 'C') return 'Arbox';
  return sys;
}

function systemColor(sys) {
  if (sys === 'A') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (sys === 'B') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (sys === 'C') return 'bg-purple-50 text-purple-700 border-purple-200';
  return 'bg-slate-100 text-slate-600';
}

function statusDot(automation) {
  if (automation.archived) return { dot: 'bg-slate-300', label: 'ארכיון' };
  if (automation.paused)   return { dot: 'bg-amber-400',  label: 'מושהה' };
  if (!automation.enabled) return { dot: 'bg-slate-400',  label: 'כבוי' };
  return { dot: 'bg-green-500', label: 'פעיל' };
}

function StatusPill({ automation }) {
  const { dot, label } = statusDot(automation);
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className="text-xs font-medium">{label}</span>
    </span>
  );
}

// ── KPI cards ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = 'slate' }) {
  const colors = {
    teal:   'bg-teal-50 text-teal-700',
    green:  'bg-green-50 text-green-700',
    red:    'bg-red-50 text-red-700',
    amber:  'bg-amber-50 text-amber-700',
    slate:  'bg-slate-50 text-slate-700',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
      <span className="text-xs text-slate-500 mb-1">{label}</span>
      <span className={`text-2xl font-bold ${colors[color] || 'text-slate-700'}`}>{value ?? '—'}</span>
      {sub && <span className="text-xs text-slate-400 mt-0.5">{sub}</span>}
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ automation, coachEmail, onClose, onSaved }) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('info');
  const [dryRunResult, setDryRunResult] = useState(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [editForm, setEditForm] = useState(null); // System B inline edit

  // Load detail
  const { data: detailRes, isLoading: detailLoading } = useQuery({
    queryKey: ['autoDetail', automation.id, automation.system],
    queryFn: () => api('getAutomationDetail', { automation_id: automation.id, system: automation.system }),
    enabled: !!automation,
    staleTime: 30000,
  });
  const detail = detailRes?.data;

  // Load recent executions
  const { data: histRes } = useQuery({
    queryKey: ['autoHistory', automation.id, automation.system],
    queryFn: () => api('getUnifiedExecutionHistory', {
      automation_id: automation.system === 'B' ? automation.id : automation.code,
      system: automation.system,
      limit: 30,
    }),
    enabled: activeTab === 'history',
    staleTime: 60000,
  });
  const executions = histRes?.data?.executions || [];

  // System B editing
  const updateBMut = useMutation({
    mutationFn: (data) => api('updateBehaviorAutomationRule', { rule_code: automation.code, ...data }),
    onSuccess: () => {
      toast.success('עודכן בהצלחה');
      qc.invalidateQueries(['automationInventory']);
      qc.invalidateQueries(['autoDetail', automation.id]);
      setEditForm(null);
      onSaved?.();
    },
    onError: (e) => toast.error(e.message || 'שגיאה בשמירה'),
  });

  // System C toggle
  const toggleCMut = useMutation({
    mutationFn: (enabled) => base44.entities.WhatsAppAutomation.update(automation.id, { enabled }),
    onSuccess: () => {
      toast.success(automation.enabled ? 'כובה' : 'הופעל');
      qc.invalidateQueries(['automationInventory']);
      onSaved?.();
    },
    onError: (e) => toast.error(e.message || 'שגיאה'),
  });

  const handleDryRun = async () => {
    setDryRunLoading(true);
    setDryRunResult(null);
    try {
      const res = await api('dryRunAutomationCheck', {
        automation_id: automation.system === 'B' ? automation.id : automation.code,
        rule_code: automation.code,
        system: automation.system,
      });
      setDryRunResult(res?.data || {});
    } catch (e) {
      toast.error('שגיאה בבדיקה: ' + e.message);
    } finally {
      setDryRunLoading(false);
    }
  };

  const initBEdit = () => {
    setEditForm({
      enabled:         automation.raw?.enabled ?? automation.enabled,
      paused:          automation.raw?.paused  ?? automation.paused,
      cooldown_hours:  automation.raw?.cooldown_hours ?? 24,
      schedule_window: automation.raw?.schedule_window ?? 'all',
      priority:        automation.raw?.priority ?? 'normal',
    });
    setActiveTab('edit');
  };

  const saveB = () => {
    if (!editForm) return;
    updateBMut.mutate(editForm);
  };

  const TABS = [
    { id: 'info',    label: 'מידע', icon: <Info size={13} /> },
    { id: 'protect', label: 'הגנות', icon: <Shield size={13} /> },
    { id: 'stats',   label: 'סטטיסטיקות', icon: <BarChart3 size={13} /> },
    { id: 'history', label: 'היסטוריה', icon: <Clock size={13} /> },
    ...(automation.capabilities?.can_edit && automation.system === 'B' ? [{ id: 'edit', label: 'עריכה', icon: <Edit2 size={13} /> }] : []),
  ];

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Zap className="w-4 h-4 text-teal-500 shrink-0" />
            <span className="truncate">{automation.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium mr-auto shrink-0 ${systemColor(automation.system)}`}>
              {systemLabel(automation.system)}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Status bar */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
          <StatusPill automation={automation} />
          <span className="text-xs text-slate-500">|</span>
          <span className="text-xs text-slate-600">{automation.channel === 'whatsapp' ? 'WhatsApp' : automation.channel}</span>
          <span className="text-xs text-slate-500">|</span>
          <span className="text-xs text-slate-600">{automation.trigger?.label || '—'}</span>
          {automation.capabilities?.can_test && (
            <button
              onClick={handleDryRun}
              disabled={dryRunLoading}
              className="mr-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              {dryRunLoading ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
              בדיקה (Dry Run)
            </button>
          )}
          {automation.system === 'C' && automation.capabilities?.can_activate && (
            <button
              onClick={() => toggleCMut.mutate(!automation.enabled)}
              disabled={toggleCMut.isPending}
              className={`mr-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${automation.enabled ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'}`}
            >
              {automation.enabled ? <><Pause size={12} /> השהה</> : <><Play size={12} /> הפעל</>}
            </button>
          )}
        </div>

        {/* Dry run result */}
        {dryRunResult && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
            <p className="font-bold text-blue-800 mb-2 flex items-center gap-1.5"><Eye size={14} /> תוצאות בדיקה (Dry Run)</p>
            {dryRunResult.note && <p className="text-xs text-blue-700 mb-2">{dryRunResult.note}</p>}
            {dryRunResult.system === 'B' && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['מתאימים', dryRunResult.eligible_count, 'text-blue-700'],
                  ['היו נשלחים', dryRunResult.would_send, 'text-green-700'],
                  ['חסומים', dryRunResult.blocked_count, 'text-amber-700'],
                  ['Cooldown', dryRunResult.blocked_by_cooldown, 'text-slate-600'],
                  ['העדפות', dryRunResult.blocked_by_preferences, 'text-slate-600'],
                  ['שעות שקטות', dryRunResult.blocked_by_quiet_hours, 'text-slate-600'],
                ].map(([l, v, c]) => (
                  <div key={l} className="text-center">
                    <div className={`text-lg font-bold ${c}`}>{v ?? 0}</div>
                    <div className="text-xs text-slate-500">{l}</div>
                  </div>
                ))}
              </div>
            )}
            {dryRunResult.system === 'A' && (
              <div className="grid grid-cols-3 gap-2">
                {[['תור/נשלחו', dryRunResult.today_sent || dryRunResult.today_queued, 'text-green-700'],
                  ['חסומים', dryRunResult.today_blocked, 'text-amber-700'],
                  ['נכשלו', dryRunResult.today_failed, 'text-red-700']].map(([l, v, c]) => (
                  <div key={l} className="text-center">
                    <div className={`text-lg font-bold ${c}`}>{v ?? 0}</div>
                    <div className="text-xs text-slate-500">{l}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0.5 border-b border-slate-200 -mx-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-teal-500 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'info' && (
          <div className="space-y-3 text-sm">
            {automation.description && (
              <p className="text-slate-600 bg-slate-50 rounded-lg p-3 text-sm">{automation.description}</p>
            )}
            <InfoRow label="טריגר" value={
              <div>
                <div className="font-medium text-slate-800">{automation.trigger?.label}</div>
                {automation.trigger?.details && <div className="text-xs text-slate-500 mt-0.5">{automation.trigger.details}</div>}
              </div>
            } />
            <InfoRow label="תנאים" value={
              <div>
                <div className="text-slate-800">{automation.conditions?.label || '—'}</div>
              </div>
            } />
            <InfoRow label="קהל יעד" value={<span className="text-slate-800">{automation.audience?.label || '—'}</span>} />
            <InfoRow label="תזמון" value={<span className="font-mono text-slate-700">{automation.schedule?.label || '—'}</span>} />
            <InfoRow label="זמן המתנה" value={<span className="text-slate-800">{automation.cooldown?.label || '—'}</span>} />
            <InfoRow label="ערוץ" value={<span className="text-slate-800">{automation.channel === 'whatsapp' ? '📱 WhatsApp' : automation.channel}</span>} />

            {/* Template preview */}
            {automation.template && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">תצוגה מקדימה של הודעה</p>
                {automation.template.editable === false ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs text-amber-700 mb-1.5 flex items-center gap-1"><Lock size={10} /> נדרש שינוי קוד לעריכה</p>
                    <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans">{automation.template.preview}</pre>
                  </div>
                ) : (
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans bg-green-50 border border-green-200 rounded-lg p-3 leading-relaxed">{automation.template.preview || '—'}</pre>
                )}
              </div>
            )}

            {/* Hard-coded note for System A */}
            {automation.hard_coded_note && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1.5"><Lock size={10} className="text-slate-400" />{automation.hard_coded_note}</p>
              </div>
            )}

            {/* Technical section */}
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-600 select-none">מידע טכני</summary>
              <div className="mt-2 space-y-1 font-mono text-slate-500 bg-slate-50 rounded p-2">
                <div>id: {automation.id}</div>
                <div>code: {automation.code}</div>
                <div>system: {automation.system}</div>
                {automation.raw && Object.entries(automation.raw).map(([k,v]) => (
                  <div key={k}>{k}: {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</div>
                ))}
              </div>
            </details>
          </div>
        )}

        {activeTab === 'protect' && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5"><Shield size={14} className="text-teal-500" /> שרשרת ההגנות</p>
            {(automation.protections || []).map((p, i) => (
              <div key={i} className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                <span className="text-sm text-slate-700">{p}</span>
              </div>
            ))}
            {(!automation.protections || automation.protections.length === 0) && (
              <p className="text-sm text-slate-400 text-center py-4">אין מידע על הגנות</p>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'נשלחו היום', value: automation.stats?.sent_today ?? 0, color: 'text-green-700', bg: 'bg-green-50' },
                { label: 'חסומים היום', value: automation.stats?.blocked_today ?? 0, color: 'text-amber-700', bg: 'bg-amber-50' },
                { label: 'נכשלו היום', value: automation.stats?.failed_today ?? 0, color: 'text-red-700', bg: 'bg-red-50' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center border border-white`}>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            <InfoRow label="הרצה אחרונה" value={fmtDate(automation.stats?.last_run_at)} />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {executions.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">אין ביצועים להצגה</p>
            ) : executions.map(e => (
              <div key={e.id} className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                <span className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${e.status === 'sent' || e.status === 'SENT' ? 'bg-green-500' : e.status === 'failed' || e.status === 'FAILED' ? 'bg-red-500' : 'bg-amber-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 flex-wrap">
                    <span className="font-medium text-slate-700">{e.trainee_name || e.trainee_email || '—'}</span>
                    <span className="text-slate-400">{fmtDate(e.executed_at)}</span>
                  </div>
                  {e.block_reason && <div className="text-amber-700 mt-0.5 truncate">{e.block_reason}</div>}
                  {e.message_preview && <div className="text-slate-500 mt-0.5 truncate font-mono">{e.message_preview}</div>}
                </div>
                <span className="shrink-0 font-medium text-xs px-1.5 py-0.5 rounded bg-white border border-slate-200">
                  {e.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'edit' && automation.system === 'B' && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>שינויים יחולו מהריצה הבאה של מנוע האוטומציה. הלוגיקה הבסיסית (תנאים, טריגר) מוגדרת בקוד ולא ניתנת לשינוי מכאן.</span>
            </div>

            {editForm ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <Label className="text-sm font-medium">פעיל</Label>
                  <Switch checked={editForm.enabled} onCheckedChange={v => setEditForm(f => ({ ...f, enabled: v }))} />
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <Label className="text-sm font-medium">מושהה</Label>
                  <Switch checked={editForm.paused} onCheckedChange={v => setEditForm(f => ({ ...f, paused: v }))} />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-600 mb-1 block">זמן המתנה (שעות)</Label>
                  <Input type="number" min={1} max={720} value={editForm.cooldown_hours}
                    onChange={e => setEditForm(f => ({ ...f, cooldown_hours: parseInt(e.target.value) || 24 }))}
                    className="w-24" />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-600 mb-1 block">חלון הרצה</Label>
                  <Select value={editForm.schedule_window || 'all'} onValueChange={v => setEditForm(f => ({ ...f, schedule_window: v }))}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">בוקר (08:00 ישראל)</SelectItem>
                      <SelectItem value="afternoon">אחר הצהריים (14:00 ישראל)</SelectItem>
                      <SelectItem value="evening">ערב (20:00 ישראל)</SelectItem>
                      <SelectItem value="all">כל החלונות</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-600 mb-1 block">עדיפות</Label>
                  <Select value={editForm.priority || 'normal'} onValueChange={v => setEditForm(f => ({ ...f, priority: v }))}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">קריטי</SelectItem>
                      <SelectItem value="high">גבוה</SelectItem>
                      <SelectItem value="normal">רגיל</SelectItem>
                      <SelectItem value="low">נמוך</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditForm(null)} className="flex-1">ביטול</Button>
                  <Button size="sm" onClick={saveB} disabled={updateBMut.isPending}
                    className="flex-1 bg-teal-500 hover:bg-teal-600 text-white">
                    {updateBMut.isPending ? 'שומר...' : 'שמור שינויים'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={initBEdit} variant="outline" className="w-full gap-2">
                <Edit2 size={14} /> ערוך הגדרות
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="text-xs text-slate-400 w-24 shrink-0 pt-0.5 font-medium">{label}:</span>
      <div className="flex-1 min-w-0 text-sm">{value}</div>
    </div>
  );
}

// ── Dry Run Summary for blocked view ──────────────────────────────────────────

function BlockedSummaryCard({ coachEmail }) {
  const { data: res, isLoading } = useQuery({
    queryKey: ['blockedSummary', coachEmail],
    queryFn: () => api('getBlockedAutomationsSummary', { coach_email: coachEmail, days: 7 }),
    staleTime: 60000,
  });
  const summary = res?.data?.summary || [];

  if (isLoading) return <div className="text-sm text-slate-400 animate-pulse p-4">טוען חסימות...</div>;
  if (!summary.length) return <div className="text-sm text-slate-400 text-center p-6">לא נמצאו חסימות בשבוע האחרון</div>;

  return (
    <div className="space-y-2">
      {summary.map(g => (
        <div key={g.key} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-sm">
          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
          <span className="flex-1 text-slate-700">{g.reason}</span>
          <span className="text-xs text-slate-400">{g.automation_count} אוטומציות</span>
          <span className="text-sm font-bold text-amber-700">{g.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main unified section ──────────────────────────────────────────────────────

export default function AutomationControlCenter({ coachEmail, onEditSystemC }) {
  const qc = useQueryClient();
  const [search, setSearch]       = useState('');
  const [filterSystem, setFilterSystem] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedAuto, setSelectedAuto] = useState(null);
  const [showBlocked, setShowBlocked] = useState(false);

  const { data: res, isLoading, isError, refetch } = useQuery({
    queryKey: ['automationInventory', coachEmail],
    queryFn: () => api('getAutomationInventory', { coach_email: coachEmail }),
    staleTime: 60000,
    enabled: !!coachEmail,
  });

  const summary = res?.data?.summary || {};
  const allAutos = res?.data?.automations || [];

  const filtered = useMemo(() => allAutos.filter(a => {
    if (filterSystem !== 'all' && a.system !== filterSystem) return false;
    if (filterStatus === 'active'   && (a.paused || !a.enabled || a.archived)) return false;
    if (filterStatus === 'paused'   && !a.paused) return false;
    if (filterStatus === 'disabled' && (a.enabled || a.archived)) return false;
    if (filterStatus === 'archived' && !a.archived) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.name.toLowerCase().includes(q) && !a.code.toLowerCase().includes(q) && !(a.description||'').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [allAutos, filterSystem, filterStatus, search]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">טוען נתוני אוטומציות...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-slate-600">לא ניתן לטעון את נתוני האוטומציות.</p>
        <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw size={14} /> נסה שוב
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-teal-500" />
            מרכז בקרת אוטומציות
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">כל מערכות האוטומציה — תזכורות, התנהגות, Arbox</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBlocked(v => !v)}
            className={`gap-1.5 text-xs ${showBlocked ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}`}>
            <AlertTriangle size={13} /> חסימות (7 ימים)
          </Button>
          {onEditSystemC && (
            <Button size="sm" onClick={onEditSystemC}
              className="gap-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs">
              + אוטומציה חדשה (Arbox)
            </Button>
          )}
          <button onClick={() => qc.invalidateQueries(['automationInventory'])}
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-3">
        <KpiCard label="סה״כ אוטומציות"     value={summary.total}         color="slate" />
        <KpiCard label="פעילות"             value={summary.enabled}       color="teal"  />
        <KpiCard label="מושהות"             value={summary.paused}        color="amber" />
        <KpiCard label="נשלחו היום"         value={summary.sent_today}    color="green" />
        <KpiCard label="נכשלו/חסומים היום" value={(summary.failed_today||0)+(summary.blocked_today||0)} color="red" />
      </div>

      {/* Blocked summary panel */}
      {showBlocked && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-amber-500" /> חסימות לפי סיבה (7 ימים אחרונים)
          </h3>
          <BlockedSummaryCard coachEmail={coachEmail} />
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם..." className="pr-9 h-9 text-sm" />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { value: 'all', label: 'הכל' },
            { value: 'A', label: 'תזכורות' },
            { value: 'B', label: 'התנהגות' },
            { value: 'C', label: 'Arbox' },
          ].map(f => (
            <button key={f.value} onClick={() => setFilterSystem(f.value)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${filterSystem === f.value ? 'bg-teal-500 text-white border-teal-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {f.label}
            </button>
          ))}
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="active">פעיל</SelectItem>
            <SelectItem value="paused">מושהה</SelectItem>
            <SelectItem value="disabled">כבוי</SelectItem>
            <SelectItem value="archived">ארכיון</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-xs text-slate-400 mr-auto shrink-0">{filtered.length} / {allAutos.length}</span>
      </div>

      {/* Main table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '180px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '70px' }} />
            <col style={{ width: '160px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '50px' }} />
            <col style={{ width: '50px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '80px' }} />
          </colgroup>
          <thead>
            <tr className="bg-slate-800 text-white">
              {['שם', 'מערכת', 'סטטוס', 'ערוץ', 'טריגר', 'תזמון', 'נשלחו', 'נכשלו', 'ריצה אחרונה', 'פעולות'].map((h, i) => (
                <th key={i} className="text-right px-3 py-2.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-14 text-slate-400">
                  {search || filterSystem !== 'all' || filterStatus !== 'all'
                    ? 'לא נמצאו אוטומציות התואמות לסינון.'
                    : 'לא נמצאו אוטומציות.'}
                </td>
              </tr>
            ) : filtered.map((auto, idx) => (
              <tr key={auto.id} onClick={() => setSelectedAuto(auto)}
                className={`border-b border-slate-100 cursor-pointer hover:bg-teal-50/30 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-slate-800 truncate">{auto.name}</p>
                  <p className="text-slate-400 truncate text-xs">{auto.code}</p>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${systemColor(auto.system)}`}>
                    {systemLabel(auto.system)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill automation={auto} />
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {auto.channel === 'whatsapp' ? '📱 WA' : auto.channel}
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-slate-700 truncate block">{auto.trigger?.label || '—'}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-slate-500 truncate block">{auto.schedule?.label || '—'}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`font-bold ${(auto.stats?.sent_today||0) > 0 ? 'text-green-700' : 'text-slate-300'}`}>
                    {auto.stats?.sent_today ?? 0}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`font-bold ${(auto.stats?.failed_today||0) > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                    {auto.stats?.failed_today ?? 0}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-500">{fmtDate(auto.stats?.last_run_at)}</td>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <button onClick={() => setSelectedAuto(auto)} title="פרטים"
                      className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-teal-600 transition-colors">
                      <Eye size={13} />
                    </button>
                    {auto.capabilities?.can_edit && auto.system === 'B' && (
                      <button onClick={() => { setSelectedAuto(auto); }} title="עריכה"
                        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors">
                        <Edit2 size={13} />
                      </button>
                    )}
                    {auto.capabilities?.can_edit && auto.system === 'C' && onEditSystemC && (
                      <button onClick={() => onEditSystemC(auto.raw)} title="עריכה"
                        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors">
                        <Edit2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* System legend */}
      <div className="flex gap-4 text-xs text-slate-500 flex-wrap">
        <span className="flex items-center gap-1.5"><span className={`px-2 py-0.5 rounded-full border ${systemColor('A')}`}>A</span> תזכורות — {summary.system_a_count} סוגים, מוגדרים בקוד, לא ניתנים לעריכה</span>
        <span className="flex items-center gap-1.5"><span className={`px-2 py-0.5 rounded-full border ${systemColor('B')}`}>B</span> התנהגות — {summary.system_b_count} חוקים, ניתנים לעריכה חלקית</span>
        <span className="flex items-center gap-1.5"><span className={`px-2 py-0.5 rounded-full border ${systemColor('C')}`}>C</span> Arbox — {summary.system_c_count} אוטומציות, ניתנות לעריכה מלאה</span>
      </div>

      {/* Detail drawer */}
      {selectedAuto && (
        <DetailDrawer
          automation={selectedAuto}
          coachEmail={coachEmail}
          onClose={() => setSelectedAuto(null)}
          onSaved={() => {
            qc.invalidateQueries(['automationInventory']);
            setSelectedAuto(null);
          }}
        />
      )}
    </div>
  );
}
