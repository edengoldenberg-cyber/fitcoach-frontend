/**
 * MissionControl.jsx — FitCoach Enterprise Mission Control
 *
 * Sections (left sidebar navigation):
 *   1. Dashboard        — key metrics snapshot
 *   2. Automations      — full automation management table
 *   3. Queue Center     — WhatsApp message queue
 *   4. Live Activity    — recent 24h message flow
 *   5. Arbox            — gym member sync & status
 *   6. Absence Center   — members by days absent + risk scoring
 *   7. Reports          — CSV/Excel exports
 *   8. Analytics        — charts
 *   9. Logs             — execution audit logs
 *  10. Failed Messages  — failed queue items
 *  11. Validation       — pre-enable automation checks
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  LayoutDashboard, Zap, MessageSquare, Activity, Database, AlertTriangle,
  BarChart3, FileText, ScrollText, XCircle, Shield, Users, Clock,
  RefreshCw, Download, Plus, Edit2, Trash2, Play, CheckCircle2,
  ChevronRight, ChevronDown, Search, Phone, Wifi, WifiOff, Eye,
  History, Info, Calendar, Filter, TrendingUp, AlertCircle,
  Check, X, Settings, Bell, ArrowUpRight, Layers, Menu,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_TYPES = [
  { value: 'manual_test',              label: 'בדיקה ידנית',                   category: 'test' },
  { value: 'new_trainee_created',      label: 'מתאמן חדש נוצר',                 category: 'onboarding' },
  { value: 'first_login',             label: 'כניסה ראשונה',                   category: 'onboarding' },
  { value: 'daily_workout_reminder',  label: 'תזכורת אימון יומית',              category: 'reminder' },
  { value: 'meal_log_reminder',       label: 'תזכורת רישום ארוחות',            category: 'reminder' },
  { value: 'water_reminder',          label: 'תזכורת מים',                     category: 'reminder' },
  { value: 'inactive_3days',          label: 'לא פעיל 3 ימים',                  category: 'absence' },
  { value: 'inactive_7days',          label: 'לא פעיל 7 ימים',                  category: 'absence' },
  { value: 'inactive_14days',         label: 'לא פעיל 14 ימים',                 category: 'absence' },
  { value: 'inactive_30days',         label: 'לא פעיל 30 ימים',                 category: 'absence' },
  { value: 'inactive_trainee',        label: 'מתאמן לא פעיל (כללי)',            category: 'absence' },
  { value: 'weekly_summary',          label: 'סיכום שבועי',                    category: 'engagement' },
  { value: 'monthly_summary',         label: 'סיכום חודשי',                    category: 'engagement' },
  { value: 'birthday',                label: 'יום הולדת',                      category: 'engagement' },
  { value: 'membership_expiration',   label: 'מנוי עומד לפוג',                  category: 'membership' },
  { value: 'membership_renewed',      label: 'מנוי חודש',                      category: 'membership' },
  { value: 'membership_frozen',       label: 'מנוי הוקפא',                     category: 'membership' },
  { value: 'returned_after_absence',  label: 'חזר אחרי היעדרות',               category: 'absence' },
  { value: 'attendance_below_avg',    label: 'נוכחות מתחת לממוצע',             category: 'absence' },
  { value: 'custom_scheduled',        label: 'שליחה מתוזמנת מותאמת',           category: 'custom' },
];

const TRIGGER_COLORS = {
  test:       'bg-slate-100 text-slate-600 border-slate-200',
  onboarding: 'bg-blue-50 text-blue-700 border-blue-200',
  reminder:   'bg-amber-50 text-amber-700 border-amber-200',
  absence:    'bg-red-50 text-red-700 border-red-200',
  engagement: 'bg-purple-50 text-purple-700 border-purple-200',
  membership: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  custom:     'bg-teal-50 text-teal-700 border-teal-200',
};

const CONSENT_CATEGORIES = [
  { value: 'whatsapp_reminder',   label: 'תזכורות WhatsApp' },
  { value: 'workout_reminder',    label: 'תזכורות אימון' },
  { value: 'nutrition_reminder',  label: 'תזכורות תזונה' },
  { value: 'water_reminder',      label: 'תזכורות מים' },
  { value: 'inactivity_reminder', label: 'תזכורות אי-פעילות' },
];

const DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

const VARIABLE_HINTS = [
  { var: '{{trainee_name}}', desc: 'שם המתאמן' },
  { var: '{{coach_name}}',   desc: 'שם המאמן' },
  { var: '{{app_link}}',     desc: 'קישור לאפליקציה' },
  { var: '{{date}}',         desc: 'תאריך היום' },
];

const EMPTY_FORM = {
  name: '', trigger_type: 'daily_workout_reminder',
  message_template: 'שלום {{trainee_name}},\n\nהודעה מ-FitCoach 💪',
  target_type: 'all', target_phone: '', schedule_config: '',
  consent_category: 'whatsapp_reminder', enabled: false, cooldown_hours: 24,
};

const RISK_COLORS = {
  green:  { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500'  },
  yellow: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-400'  },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  red:    { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-600'    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTriggerMeta = v => TRIGGER_TYPES.find(t => t.value === v) || { value: v, label: v, category: 'custom' };
const parseSchedule  = raw => { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } };
const renderPreview  = t => t
  .replace(/\{\{trainee_name\}\}/g, 'ישראל ישראלי')
  .replace(/\{\{coach_name\}\}/g,   'המאמן שלך')
  .replace(/\{\{app_link\}\}/g,     'https://fitcoach-frontend-omega.vercel.app')
  .replace(/\{\{date\}\}/g,         new Date().toLocaleDateString('he-IL'));

const fmtDate  = d => d ? new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtShort = d => d ? new Date(d).toLocaleDateString('he-IL') : '—';

function toCSV(rows) {
  return rows.map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
}
function downloadBlob(content, filename, mime = 'text/csv') {
  const blob = new Blob(['﻿' + content], { type: mime + ';charset=utf-8;' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

function calcRisk(daysSince) {
  if (daysSince >= 22) return { color: 'red',    label: 'סיכון גבוה' };
  if (daysSince >= 15) return { color: 'orange', label: 'בסיכון' };
  if (daysSince >= 8)  return { color: 'yellow', label: 'אזהרה' };
  return                      { color: 'green',  label: 'פעיל' };
}

// ─── Sidebar Nav ──────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: 'dashboard',    label: 'מרכז בקרה',       icon: LayoutDashboard },
  { key: 'automations',  label: 'אוטומציות',        icon: Zap },
  { key: 'queue',        label: 'תור הודעות',       icon: MessageSquare },
  { key: 'live',         label: 'פעילות חיה',       icon: Activity },
  { key: 'arbox',        label: 'Arbox',             icon: Database },
  { key: 'absence',      label: 'מרכז היעדרות',     icon: AlertTriangle },
  { key: 'reports',      label: 'דוחות',            icon: FileText },
  { key: 'analytics',    label: 'אנליטיקה',         icon: BarChart3 },
  { key: 'logs',         label: 'לוגים',            icon: ScrollText },
  { key: 'failed',       label: 'הודעות שנכשלו',    icon: XCircle },
  { key: 'validation',   label: 'מרכז ולידציה',     icon: Shield },
  { key: 'duplicates',   label: 'כפילויות מתאמנים', icon: Users },
  { key: 'reminders',    label: 'מרכז תזכורות',     icon: Bell },
];

// ─── AutomationFormDialog ─────────────────────────────────────────────────────

function AutomationFormDialog({ open, onClose, editing, coachEmail, onSaved }) {
  const [form, setForm] = useState(() => editing ? {
    name: editing.name, trigger_type: editing.trigger_type,
    message_template: editing.message_template,
    target_type: editing.target_type || 'all',
    target_phone: editing.target_phone || '',
    schedule_config: editing.schedule_config || '',
    consent_category: editing.consent_category || 'whatsapp_reminder',
    enabled: editing.enabled || false,
    cooldown_hours: editing.cooldown_hours ?? 24,
  } : { ...EMPTY_FORM });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: () => editing?.id
      ? base44.entities.WhatsAppAutomation.update(editing.id, { ...form, coach_email: coachEmail, cooldown_hours: Number(form.cooldown_hours) || 24 })
      : base44.entities.WhatsAppAutomation.create({ ...form, coach_email: coachEmail, cooldown_hours: Number(form.cooldown_hours) || 24 }),
    onSuccess: () => { toast.success(editing ? 'עודכן' : 'נוצר'); onSaved(); onClose(); },
    onError: e => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold">
            <Zap className="w-5 h-5 text-teal-500" />
            {editing ? 'עריכת אוטומציה' : 'אוטומציה חדשה'}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 mt-2">
          <div className="space-y-3">
            <Field label="שם *"><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="שם האוטומציה" /></Field>
            <Field label="טריגר">
              <Select value={form.trigger_type} onValueChange={v => set('trigger_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="יעד">
              <Select value={form.target_type} onValueChange={v => set('target_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל המתאמנים</SelectItem>
                  <SelectItem value="one">מתאמן ספציפי</SelectItem>
                </SelectContent>
              </Select>
              {form.target_type === 'one' && (
                <Input value={form.target_phone} onChange={e => set('target_phone', e.target.value)} placeholder="+972XXXXXXXXX" className="mt-1 font-mono" dir="ltr" />
              )}
            </Field>
            <Field label="הסכמה">
              <Select value={form.consent_category} onValueChange={v => set('consent_category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONSENT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Cooldown (שעות)">
              <Input type="number" min={0} value={form.cooldown_hours} onChange={e => set('cooldown_hours', e.target.value)} className="w-24" />
            </Field>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm font-medium">פעיל</span>
              <Switch checked={form.enabled} onCheckedChange={v => set('enabled', v)} />
            </div>
          </div>
          <div className="space-y-3">
            <Field label="תוכן הודעה *">
              <Textarea value={form.message_template} onChange={e => set('message_template', e.target.value)} rows={6} className="font-mono text-sm" />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {VARIABLE_HINTS.map(v => (
                  <button key={v.var} type="button" title={v.desc}
                    onClick={() => set('message_template', form.message_template + v.var)}
                    className="text-xs px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 font-mono">
                    {v.var}
                  </button>
                ))}
              </div>
            </Field>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-green-700 mb-1 flex items-center gap-1"><Eye className="w-3 h-3" /> תצוגה מקדימה</p>
              <pre className="text-xs text-green-800 whitespace-pre-wrap font-sans leading-relaxed">{renderPreview(form.message_template)}</pre>
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-3 border-t mt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">ביטול</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name.trim() || !form.message_template.trim()}
            className="flex-1 text-white bg-teal-500 hover:bg-teal-600">
            {saveMut.isPending ? 'שומר...' : editing ? 'שמור שינויים' : 'צור אוטומציה'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs font-semibold text-slate-600 mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

// ─── Section: Dashboard ───────────────────────────────────────────────────────

function DashboardSection({ automations, queueItems, arboxStatus, absenceData, coachEmail }) {
  const enabledAutomations = automations.filter(a => a.enabled).length;
  const queueSent    = queueItems.filter(q => q.status === 'sent').length;
  const queueFailed  = queueItems.filter(q => q.status === 'failed').length;
  const queuePending = queueItems.filter(q => q.status === 'queued' || q.status === 'sending').length;
  const highRisk = (absenceData?.tiers?.days30?.length ?? 0) + (absenceData?.tiers?.days45?.length ?? 0) + (absenceData?.tiers?.days60?.length ?? 0) + (absenceData?.tiers?.days90?.length ?? 0) + (absenceData?.tiers?.days90p?.length ?? 0);

  const KPI = ({ label, value, sub, color = 'slate', icon }) => (
    <div className={`bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
        color === 'green'  ? 'bg-green-50'  :
        color === 'red'    ? 'bg-red-50'    :
        color === 'amber'  ? 'bg-amber-50'  :
        color === 'teal'   ? 'bg-teal-50'   :
        color === 'blue'   ? 'bg-blue-50'   : 'bg-slate-50'
      }`}>{icon}</div>
      <div>
        <p className={`text-3xl font-bold ${
          color === 'green'  ? 'text-green-700'  :
          color === 'red'    ? 'text-red-700'    :
          color === 'amber'  ? 'text-amber-700'  :
          color === 'teal'   ? 'text-teal-700'   :
          color === 'blue'   ? 'text-blue-700'   : 'text-slate-800'
        }`}>{value}</p>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <SectionHeader title="מרכז בקרה" sub="סיכום מצב מערכת FitCoach Enterprise" />

      <div className="grid grid-cols-4 gap-4">
        <KPI label="אוטומציות פעילות" value={enabledAutomations} sub={`מתוך ${automations.length}`} color="teal" icon={<Zap className="w-6 h-6 text-teal-500" />} />
        <KPI label="הודעות נשלחו" value={queueSent} sub="סה״כ מהתחלה" color="green" icon={<CheckCircle2 className="w-6 h-6 text-green-500" />} />
        <KPI label="ממתינות לשליחה" value={queuePending} sub="בתור כעת" color="blue" icon={<Clock className="w-6 h-6 text-blue-500" />} />
        <KPI label="הודעות שנכשלו" value={queueFailed} sub="טעינות חוזרות" color="red" icon={<XCircle className="w-6 h-6 text-red-500" />} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KPI label="בסיכון גבוה (21+ ימים)" value={highRisk} sub="מחכים להתעוררות" color="amber" icon={<AlertTriangle className="w-6 h-6 text-amber-500" />} />
        <KPI label="לקוחות פעילים" value={absenceData?.total ?? '—'} sub="מציג לקוחות פעילים בלבד" color={arboxStatus?.connected ? 'green' : 'slate'} icon={<Database className="w-6 h-6 text-slate-400" />} />
        <div className={`border rounded-xl p-5 flex items-center gap-4 ${arboxStatus?.connected ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          {arboxStatus?.connected ? <Wifi className="w-7 h-7 text-green-600" /> : <WifiOff className="w-7 h-7 text-amber-500" />}
          <div>
            <p className={`text-sm font-bold ${arboxStatus?.connected ? 'text-green-700' : 'text-amber-700'}`}>
              Arbox {arboxStatus?.connected ? 'מחובר ✅' : 'לא מחובר ⚠️'}
            </p>
            <p className="text-xs text-slate-400">{
              !arboxStatus ? 'בודק חיבור...' :
              arboxStatus.connected ? (arboxStatus.gym_name || 'מחובר') :
              arboxStatus.status === 'NOT_CONFIGURED' ? 'מפתח API חסר' :
              arboxStatus.status === 'ERROR' ? 'שגיאת חיבור' : 'לא מחובר'
            }</p>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-bold text-slate-700 mb-3">פעולות מהירות</p>
        <div className="flex gap-3 flex-wrap">
          <QuickBtn icon={<RefreshCw className="w-4 h-4" />} label="הרץ Worker" onClick={async () => {
            const r = await base44.functions.invoke('whatsAppQueueWorker', {});
            toast.success(`Worker: processed=${r?.data?.processed}, failed=${r?.data?.failed}`);
          }} />
          <QuickBtn icon={<Database className="w-4 h-4" />} label="סנכרן Arbox" onClick={async () => {
            const r = await base44.functions.invoke('syncArboxMembers', { coachEmail });
            r?.ok ? toast.success(`סונכרנו ${(r.data?.inserted ?? 0) + (r.data?.updated ?? 0)} חברים`) : toast.error(r?.error);
          }} color="blue" />
        </div>
      </div>
    </div>
  );
}

function QuickBtn({ icon, label, onClick, color = 'slate' }) {
  const [loading, setLoading] = useState(false);
  const handle = async () => { setLoading(true); try { await onClick(); } finally { setLoading(false); } };
  return (
    <button onClick={handle} disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
        color === 'blue'  ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' :
        color === 'red'   ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' :
        'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
      }`}>
      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}

// ─── Section: Automations ─────────────────────────────────────────────────────

function AutomationsSection({ automations, queueStatsMap, coachEmail, onRefresh }) {
  const [search, setSearch]       = useState('');
  const [filterTrig, setFilterTrig] = useState('all');
  const [filterStat, setFilterStat] = useState('all');
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState(null);
  const [validating, setValidating] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [expanded, setExpanded]   = useState(new Set());
  const queryClient = useQueryClient();

  const filtered = useMemo(() => automations.filter(a => {
    if (filterTrig !== 'all' && a.trigger_type !== filterTrig) return false;
    if (filterStat === 'active' && !a.enabled) return false;
    if (filterStat === 'inactive' && a.enabled) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) &&
        !a.message_template.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [automations, filterTrig, filterStat, search]);

  const delMut = useMutation({
    mutationFn: id => base44.entities.WhatsAppAutomation.delete(id),
    onSuccess:  () => { queryClient.invalidateQueries(['whatsappAutomations']); toast.success('נמחק'); },
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.WhatsAppAutomation.update(id, { enabled: !enabled }),
    onSuccess:  () => queryClient.invalidateQueries(['whatsappAutomations']),
  });

  const toggleRow = id => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="אוטומציות WhatsApp" sub={`${automations.length} מוגדרות • ${automations.filter(a=>a.enabled).length} פעילות`} />
        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="text-white bg-teal-500 hover:bg-teal-600 gap-1.5">
          <Plus className="w-4 h-4" /> אוטומציה חדשה
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="pr-9 h-9 text-sm" />
        </div>
        <Select value={filterTrig} onValueChange={setFilterTrig}>
          <SelectTrigger className="w-48 h-9 text-sm"><SelectValue placeholder="כל הטריגרים" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל הטריגרים</SelectItem>
            {TRIGGER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStat} onValueChange={setFilterStat}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="active">פעיל</SelectItem>
            <SelectItem value="inactive">כבוי</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-400 mr-auto">{filtered.length} / {automations.length}</span>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '22px' }} />
            <col style={{ width: '170px' }} />
            <col style={{ width: '155px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '75px' }} />
            <col style={{ width: '200px' }} />
            <col style={{ width: '75px' }} />
            <col style={{ width: '55px' }} />
            <col style={{ width: '55px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '120px' }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-800 text-white">
              {['', 'שם האוטומציה', 'טריגר', 'זמן שליחה', 'ימים', 'הודעה', 'קישורים', 'נשלחו', 'נכשלו', 'ריצה אחרונה', 'סטטוס', 'פעולות'].map((h, i) => (
                <th key={i} className="text-right px-2 py-2.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={12} className="text-center py-12 text-slate-400">אין אוטומציות</td></tr>
            ) : filtered.map((a, idx) => {
              const meta  = getTriggerMeta(a.trigger_type);
              const sched = parseSchedule(a.schedule_config);
              const stats = queueStatsMap[a.id] || { sent: 0, failed: 0 };
              const links = (a.message_template.match(/https?:\/\/[^\s]+/g) || []).length;
              const isExp = expanded.has(a.id);
              const isEven = idx % 2 === 0;
              return (
                <React.Fragment key={a.id}>
                  <tr className={`border-b border-slate-100 hover:bg-teal-50/30 transition-colors cursor-pointer ${isEven ? 'bg-white' : 'bg-slate-50/40'}`}
                    onClick={() => toggleRow(a.id)}>
                    <td className="px-2 py-2 text-center">{isExp ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 mx-auto" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 mx-auto" />}</td>
                    <td className="px-2 py-2"><p className="font-semibold text-slate-800 truncate">{a.name}</p><p className="text-slate-400 truncate">{a.target_type === 'all' ? 'כולם' : a.target_phone}</p></td>
                    <td className="px-2 py-2"><span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${TRIGGER_COLORS[meta.category]}`}>{meta.label}</span></td>
                    <td className="px-2 py-2 font-mono text-slate-600">{sched.time || '—'}</td>
                    <td className="px-2 py-2">
                      {sched.days?.length ? (
                        <div className="flex flex-wrap gap-0.5">{sched.days.map(d => <span key={d} className="text-xs bg-slate-200 rounded px-1">{DAYS_SHORT[d]}</span>)}</div>
                      ) : <span className="text-slate-400">כל יום</span>}
                    </td>
                    <td className="px-2 py-2"><p className="truncate text-slate-600 font-mono">{a.message_template.slice(0, 50)}...</p><p className="text-slate-400">cooldown: {a.cooldown_hours}h</p></td>
                    <td className="px-2 py-2 text-center">{links > 0 ? <span className="text-blue-600">{links}</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2 text-center"><span className={`font-bold ${stats.sent > 0 ? 'text-green-700' : 'text-slate-400'}`}>{stats.sent}</span></td>
                    <td className="px-2 py-2 text-center"><span className={`font-bold ${stats.failed > 0 ? 'text-red-600' : 'text-slate-400'}`}>{stats.failed}</span></td>
                    <td className="px-2 py-2 text-slate-500">{fmtDate(a.last_run_at)}</td>
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      <Switch checked={!!a.enabled} onCheckedChange={() => toggleMut.mutate({ id: a.id, enabled: a.enabled })} />
                    </td>
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <IconBtn icon={<Shield className="w-3.5 h-3.5" />} title="ולידציה" onClick={() => setValidating(a)} color="blue" />
                        <IconBtn icon={<History className="w-3.5 h-3.5" />} title="היסטוריה" onClick={() => setHistoryFor(a)} />
                        <IconBtn icon={<Edit2 className="w-3.5 h-3.5" />} title="עריכה" onClick={() => { setEditing(a); setShowForm(true); }} color="teal" />
                        <IconBtn icon={<Trash2 className="w-3.5 h-3.5" />} title="מחיקה" onClick={() => { if(confirm('למחוק?')) delMut.mutate(a.id); }} color="red" />
                      </div>
                    </td>
                  </tr>
                  {isExp && (
                    <tr className={isEven ? 'bg-white' : 'bg-slate-50/40'}>
                      <td colSpan={12} className="px-6 py-4 border-b border-slate-100">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-bold text-slate-600 mb-1">תצוגה מקדימה מלאה</p>
                            <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans bg-green-50 border border-green-200 rounded-lg p-2.5 leading-relaxed">{renderPreview(a.message_template)}</pre>
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-xs font-bold text-slate-600">פרטי קונפיגורציה</p>
                            {[['ID', a.id.slice(-10)], ['הסכמה', a.consent_category], ['Cooldown', `${a.cooldown_hours}h`], ['יעד', a.target_type === 'all' ? 'כולם' : a.target_phone], ['Schedule', a.schedule_config || '—'], ['נוצר', fmtDate(a.created_at)]].map(([k,v]) => (
                              <div key={k} className="flex gap-2 text-xs"><span className="text-slate-400 w-20 shrink-0">{k}:</span><span className="font-mono text-slate-700 truncate">{v}</span></div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && <AutomationFormDialog open onClose={() => { setShowForm(false); setEditing(null); }} editing={editing} coachEmail={coachEmail} onSaved={() => queryClient.invalidateQueries(['whatsappAutomations'])} />}
      {validating && <ValidationDialog open onClose={() => setValidating(null)} automation={validating} coachEmail={coachEmail} onTestSend={onRefresh} />}
      {historyFor && <HistoryDialog open onClose={() => setHistoryFor(null)} automation={historyFor} />}
    </div>
  );
}

function IconBtn({ icon, title, onClick, color = 'slate' }) {
  return (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded transition-colors ${
        color === 'blue'  ? 'hover:bg-blue-100 text-blue-500' :
        color === 'teal'  ? 'hover:bg-teal-100 text-teal-600' :
        color === 'red'   ? 'hover:bg-red-100 text-red-500'   : 'hover:bg-slate-100 text-slate-500'
      }`}>
      {icon}
    </button>
  );
}

// ─── ValidationDialog ─────────────────────────────────────────────────────────

function ValidationDialog({ open, onClose, automation, coachEmail, onTestSend }) {
  const [testPhone, setTestPhone] = useState('0535716559');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult]   = useState(null);
  if (!automation) return null;

  const meta      = getTriggerMeta(automation.trigger_type);
  const preview   = renderPreview(automation.message_template);
  const links     = automation.message_template.match(/https?:\/\/[^\s]+/g) || [];
  const minute    = new Date().toISOString().slice(0, 16);
  const idempKey  = `automation:${automation.id}:test:${minute}`;
  const consentF  = automation.consent_category + '_enabled';

  const checks = [
    { label: 'שם האוטומציה',    ok: !!automation.name,             detail: automation.name },
    { label: 'טריגר מוגדר',     ok: !!automation.trigger_type,     detail: meta.label },
    { label: 'תוכן הודעה',      ok: !!automation.message_template, detail: `${automation.message_template.length} תווים` },
    { label: 'יעד שליחה',       ok: true,                          detail: automation.target_type === 'all' ? 'כל המתאמנים' : automation.target_phone },
    { label: 'קטגוריית הסכמה',  ok: !!automation.consent_category, detail: automation.consent_category },
    { label: 'Cooldown מוגדר',  ok: (automation.cooldown_hours||0) > 0, detail: `${automation.cooldown_hours}h` },
  ];
  const allOk = checks.every(c => c.ok);

  const handleTest = async () => {
    if (!testPhone) { toast.error('הכנס טלפון'); return; }
    setTestLoading(true); setTestResult(null);
    try {
      const res  = await base44.functions.invoke('testAutomationFromBuilder', { automation_id: automation.id, test_phone: testPhone });
      const data = res?.data || {};
      setTestResult(data);
      if (res?.ok && data.queue_id) { toast.success(`✅ Queue ID: ${data.queue_id.slice(-8)}`); onTestSend?.(); }
      else toast.error('❌ ' + (data.error || res?.error || 'שגיאה'));
    } catch (e) { toast.error(e.message); }
    finally { setTestLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold">
            <Shield className="w-5 h-5 text-blue-500" /> ולידציה — {automation.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          {/* Checklist */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 text-xs font-bold border-b">בדיקות מקדימות</div>
            {checks.map((c, i) => (
              <div key={i} className={`flex items-center justify-between px-3 py-2 text-xs border-b border-slate-100 last:border-0 ${!c.ok ? 'bg-red-50' : ''}`}>
                <div className="flex items-center gap-2">
                  {c.ok ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                  <span className={!c.ok ? 'text-red-700 font-semibold' : 'text-slate-700'}>{c.label}</span>
                </div>
                <span className="text-slate-400 font-mono">{c.detail}</span>
              </div>
            ))}
          </div>
          {/* Info grid */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              ['טריגר', meta.label],
              ['נתיב', 'Queue → Worker → Green API'],
              ['Idempotency', `...${idempKey.slice(-16)}`],
              ['הסכמה', `${consentF} = true`],
              ['Cooldown', `${automation.cooldown_hours}h`],
              ['נוכחות צפויה', automation.target_type === 'all' ? 'כל המתאמנים' : automation.target_phone],
            ].map(([k, v]) => (
              <div key={k} className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                <p className="text-slate-400">{k}</p>
                <p className="font-mono font-semibold text-slate-700 truncate">{v}</p>
              </div>
            ))}
          </div>
          {/* Preview */}
          <div className="border border-green-200 rounded-xl overflow-hidden">
            <div className="bg-green-50 px-3 py-2 text-xs font-bold text-green-700 border-b border-green-200 flex items-center gap-1"><Eye className="w-3 h-3" /> תצוגה מקדימה</div>
            <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed p-3">{preview}</pre>
          </div>
          {links.length > 0 && (
            <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>קישורים בהודעה: {links.join(' | ')}</span>
            </div>
          )}
          {/* Test send */}
          <div className="border border-slate-200 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold">שלח בדיקת WhatsApp</p>
            <div className="flex gap-2">
              <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} dir="ltr" className="font-mono text-sm flex-1 h-9" placeholder="0535716559" />
              <Button onClick={handleTest} disabled={testLoading} className="text-white bg-teal-500 hover:bg-teal-600 h-9">
                {testLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Play className="w-4 h-4 ml-1" />שלח</>}
              </Button>
            </div>
            {testResult && (
              <div className={`rounded-lg p-2.5 text-xs border ${testResult.queue_id ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {testResult.queue_id
                  ? <><div className="font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> הודעה נשלחה</div><div>Queue ID: <span className="font-mono">{testResult.queue_id.slice(-12)}</span></div><div>Worker: processed={testResult.worker?.processed}, failed={testResult.worker?.failed}</div>{testResult.duplicate && <div className="text-amber-600">⚠️ כפיל חסום (Idempotency)</div>}</>
                  : <div className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />{testResult.error || 'שגיאה'}</div>}
              </div>
            )}
          </div>
          {/* Verdict */}
          <div className={`rounded-xl p-3 flex items-center gap-3 border ${allOk ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            {allOk ? <><CheckCircle2 className="w-5 h-5 text-green-600" /><p className="text-sm font-semibold text-green-700">כל הבדיקות עברו — מוכן להפעלה</p></>
                   : <><XCircle     className="w-5 h-5 text-red-600"   /><p className="text-sm font-semibold text-red-700">תקן את הבעיות לפני הפעלה</p></>}
          </div>
          <Button variant="outline" onClick={onClose} className="w-full">סגור</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── HistoryDialog ────────────────────────────────────────────────────────────

function HistoryDialog({ open, onClose, automation }) {
  const { data: queue = [], isLoading } = useQuery({
    queryKey: ['automationHistory', automation?.id],
    queryFn:  () => base44.entities.WhatsAppMessageQueue.filter({ context_id: automation.id }),
    enabled:  open && !!automation?.id,
  });
  const sorted = [...queue].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold">
            <History className="w-5 h-5 text-slate-500" /> היסטוריה — {automation?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-3 mb-3 text-center">
          {[['נשלחו', queue.filter(q=>q.status==='sent').length, 'text-green-700', 'bg-green-50', 'border-green-200'],
            ['נכשלו', queue.filter(q=>q.status==='failed').length, 'text-red-700', 'bg-red-50', 'border-red-200'],
            ['סה״כ', sorted.length, 'text-slate-700', 'bg-slate-50', 'border-slate-200']].map(([l,v,c,bg,b]) => (
            <div key={l} className={`flex-1 ${bg} border ${b} rounded-lg p-2.5`}>
              <p className={`text-xl font-bold ${c}`}>{v}</p><p className="text-xs text-slate-500">{l}</p>
            </div>
          ))}
        </div>
        {isLoading ? <p className="text-center text-slate-400 py-8">טוען...</p> : sorted.length === 0 ? <p className="text-center text-slate-400 py-8">אין היסטוריה</p> : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 border-b"><th className="text-right px-3 py-2">טלפון</th><th className="text-right px-3 py-2">שם</th><th className="text-right px-3 py-2">סטטוס</th><th className="text-right px-3 py-2">הודעה</th><th className="text-right px-3 py-2">Queue ID</th><th className="text-right px-3 py-2">נשלח ב</th><th className="text-right px-3 py-2">שגיאה</th></tr></thead>
              <tbody>
                {sorted.map(q => (
                  <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono">{q.to_phone_e164}</td>
                    <td className="px-3 py-2">{q.to_name||'—'}</td>
                    <td className="px-3 py-2"><StatusBadge status={q.status} /></td>
                    <td className="px-3 py-2 text-slate-500 max-w-[160px] truncate">{q.rendered_text?.slice(0,50)}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{q.id.slice(-8)}</td>
                    <td className="px-3 py-2 text-slate-400">{fmtDate(q.sent_at||q.created_at)}</td>
                    <td className="px-3 py-2 text-red-500 max-w-[120px] truncate">{q.error||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }) {
  const map = { sent: 'bg-green-100 text-green-700', failed: 'bg-red-100 text-red-700', queued: 'bg-blue-100 text-blue-700', sending: 'bg-amber-100 text-amber-700' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status]||'bg-slate-100 text-slate-600'}`}>{status}</span>;
}

// ─── Section: Queue Center ────────────────────────────────────────────────────

function QueueSection({ queueItems, onRefresh }) {
  const pending  = queueItems.filter(q => q.status === 'queued');
  const sending  = queueItems.filter(q => q.status === 'sending');
  const sent     = queueItems.filter(q => q.status === 'sent');
  const failed   = queueItems.filter(q => q.status === 'failed');
  const [tab, setTab] = useState('queued');

  const display = tab === 'queued' ? pending : tab === 'sending' ? sending : tab === 'sent' ? sent.slice(0,50) : failed;

  return (
    <div className="space-y-4">
      <SectionHeader title="מרכז תור הודעות" sub="ניהול תור WhatsApp · Queue → Worker → Green API" />

      <div className="grid grid-cols-4 gap-3">
        {[['ממתינות',  pending.length,  'blue',  'queued'],
          ['שולחות',   sending.length,  'amber', 'sending'],
          ['נשלחו',    sent.length,     'green', 'sent'],
          ['נכשלו',    failed.length,   'red',   'failed']].map(([l,v,c,k]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`p-4 rounded-xl border text-right transition-all ${tab === k ? `ring-2 ring-offset-1` : ''} ${
              c==='blue'  ? 'bg-blue-50 border-blue-200'  :
              c==='amber' ? 'bg-amber-50 border-amber-200':
              c==='green' ? 'bg-green-50 border-green-200':
                            'bg-red-50 border-red-200'
            }`}>
            <p className={`text-2xl font-bold ${c==='blue'?'text-blue-700':c==='amber'?'text-amber-700':c==='green'?'text-green-700':'text-red-700'}`}>{v}</p>
            <p className="text-sm font-medium text-slate-600">{l}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-2">
        <QuickBtn icon={<RefreshCw className="w-4 h-4" />} label="הרץ Worker עכשיו" onClick={async () => {
          const r = await base44.functions.invoke('whatsAppQueueWorker', {});
          toast.success(`Worker הסתיים: processed=${r?.data?.processed}, failed=${r?.data?.failed}`);
          onRefresh();
        }} />
        <QuickBtn icon={<RefreshCw className="w-4 h-4" />} label="אפס כשלונות" onClick={async () => {
          const r = await base44.functions.invoke('resetWhatsAppQueue', {});
          toast.success(`אופסו ${r?.data?.reset} הודעות`);
          onRefresh();
        }} color="blue" />
      </div>

      <QueueTable items={display} showError={tab === 'failed'} />
    </div>
  );
}

function QueueTable({ items, showError }) {
  if (items.length === 0) return <EmptyState icon={<MessageSquare className="w-8 h-8" />} msg="אין פריטים בסטטוס זה" />;
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <table className="w-full text-xs">
        <thead><tr className="bg-slate-800 text-white">
          {['Queue ID', 'טלפון', 'שם', 'אוטומציה / סוג', 'הודעה', 'נוצר', 'נשלח', 'ניסיונות', 'סטטוס', showError && 'שגיאה'].filter(Boolean).map(h => (
            <th key={h} className="text-right px-3 py-2.5 font-semibold">{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {items.map((q, i) => (
            <tr key={q.id} className={`border-b border-slate-100 hover:bg-slate-50 ${i%2===0?'':'bg-slate-50/30'}`}>
              <td className="px-3 py-2 font-mono text-slate-400">{q.id.slice(-8)}</td>
              <td className="px-3 py-2 font-mono">{q.to_phone_e164}</td>
              <td className="px-3 py-2">{q.to_name||'—'}</td>
              <td className="px-3 py-2"><span className="text-slate-500">{q.context_type||'—'}</span></td>
              <td className="px-3 py-2 max-w-[150px] truncate text-slate-600">{q.rendered_text?.slice(0,55)}</td>
              <td className="px-3 py-2 text-slate-400">{fmtDate(q.created_at)}</td>
              <td className="px-3 py-2 text-slate-400">{fmtDate(q.sent_at)}</td>
              <td className="px-3 py-2 text-center">{q.attempts??0}</td>
              <td className="px-3 py-2"><StatusBadge status={q.status} /></td>
              {showError && <td className="px-3 py-2 text-red-500 max-w-[120px] truncate">{q.error||'—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section: Live Activity ───────────────────────────────────────────────────

function LiveSection({ queueItems }) {
  const last24h = useMemo(() => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return queueItems.filter(q => new Date(q.created_at) >= cutoff).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  }, [queueItems]);

  const byHour = useMemo(() => {
    const m = {};
    for (let h = 0; h < 24; h++) m[h] = { hour: `${h}:00`, sent: 0, failed: 0 };
    last24h.forEach(q => {
      const h = new Date(q.created_at).getHours();
      if (q.status === 'sent')   m[h].sent++;
      if (q.status === 'failed') m[h].failed++;
    });
    return Object.values(m);
  }, [last24h]);

  return (
    <div className="space-y-4">
      <SectionHeader title="פעילות חיה" sub={`${last24h.length} הודעות ב-24 השעות האחרונות`} />
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-700 mb-3">שליחות לפי שעה (24h)</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={byHour}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="sent"   fill="#22c55e" name="נשלחו" />
            <Bar dataKey="failed" fill="#ef4444" name="נכשלו" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <QueueTable items={last24h.slice(0, 40)} />
    </div>
  );
}

// ─── Section: Arbox ──────────────────────────────────────────────────────────

function ArboxSection({ coachEmail, arboxStatus, onRefresh }) {
  const queryClient = useQueryClient();
  const [syncLoading, setSyncLoading] = useState(false);

  const { data: syncHistory } = useQuery({
    queryKey: ['arboxSyncHistory', coachEmail],
    queryFn:  () => base44.functions.invoke('getArboxSyncHistory', { coachEmail }),
    enabled:  !!coachEmail,
    staleTime: 30000,
  });

  const { data: membersRes } = useQuery({
    queryKey: ['arboxMembers', coachEmail],
    queryFn:  () => base44.functions.invoke('getArboxMembers', { coachEmail }),
    enabled:  !!coachEmail,
    staleTime: 30000,
  });

  const { data: dbStatsRes } = useQuery({
    queryKey: ['arboxDbStats', coachEmail],
    queryFn:  () => base44.functions.invoke('getArboxDbStats', { coachEmail }),
    enabled:  !!coachEmail,
    staleTime: 60000,
  });
  const dbStats = dbStatsRes?.data;

  const { data: dataQualityRes } = useQuery({
    queryKey: ['arboxDataQuality', coachEmail],
    queryFn:  () => base44.functions.invoke('getArboxDataQuality', { coachEmail }),
    enabled:  !!coachEmail,
    staleTime: 60000,
  });
  const dataQuality = dataQualityRes?.data;

  const members = membersRes?.data?.members ?? [];
  const logs    = syncHistory?.data?.logs ?? [];

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      const r = await base44.functions.invoke('syncArboxMembers', { coachEmail });
      if (r?.ok) {
        toast.success(`✅ סונכרנו ${(r.data?.inserted ?? 0) + (r.data?.updated ?? 0)} חברים מ-Arbox (${r.data?.pulled ?? 0} נמשכו)`);
        queryClient.invalidateQueries(['arboxMembers']);
        queryClient.invalidateQueries(['arboxSyncHistory']);
        onRefresh?.();
      } else {
        toast.error('❌ ' + (r?.error || 'שגיאת סנכרון'));
      }
    } finally { setSyncLoading(false); }
  };

  const connected = arboxStatus?.connected;

  return (
    <div className="space-y-4">
      <SectionHeader title="Arbox — מערכת ניהול מכון" sub="סנכרון חברים, מנויים ונוכחות מ-Arbox" />
      <div className="flex items-center gap-2 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg w-fit">
        <Users className="w-3.5 h-3.5" /> מציג לקוחות פעילים בלבד (user_role=client AND active=true)
      </div>

      {/* Connection status */}
      <div className={`flex items-center gap-4 p-4 rounded-xl border ${connected ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        {connected ? <Wifi className="w-8 h-8 text-green-600" /> : <WifiOff className="w-8 h-8 text-amber-500" />}
        <div className="flex-1">
          <p className={`font-bold text-sm ${connected ? 'text-green-700' : 'text-amber-700'}`}>
            Arbox {connected ? '✅ מחובר' : '⚠️ לא מחובר'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{arboxStatus?.message || arboxStatus?.status}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSync} disabled={syncLoading || !connected} className="text-white bg-blue-500 hover:bg-blue-600 gap-1.5">
            {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            סנכרן עכשיו
          </Button>
          <Button onClick={async () => {
            setSyncLoading(true);
            try {
              const r = await base44.functions.invoke('syncArboxFull', { coachEmail, fullSync: true });
              r?.ok ? toast.success(`✅ סנכרון מלא: ${r.data?.steps?.bookings?.inserted ?? 0} הזמנות חדשות`) : toast.error('❌ ' + (r?.error || 'שגיאה'));
              queryClient.invalidateQueries(['arboxMembers']);
              queryClient.invalidateQueries(['arboxDataQuality']);
              queryClient.invalidateQueries(['arboxAbsence']);
            } finally { setSyncLoading(false); }
          }} disabled={syncLoading || !connected} variant="outline" className="gap-1.5 text-sm">
            {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            סנכרון מלא (90 יום)
          </Button>
        </div>
      </div>

      {!connected && arboxStatus !== undefined && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-sm font-bold flex items-center gap-2"><Settings className="w-4 h-4" /> הגדרת חיבור Arbox</div>
          <div className="divide-y divide-slate-100">
            {[
              { key: 'ARBOX_API_KEY', label: 'API Key', desc: 'מפתח API מלוח הניהול של Arbox', required: true },
              { key: 'ARBOX_BOX_ID',  label: 'Box ID',  desc: `מזהה המכון: 0fd5f05c-a5cd-530e-b88f-a7de1183`, required: false },
            ].map(c => (
              <div key={c.key} className="px-4 py-3 flex items-center gap-4">
                <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-mono w-44 shrink-0">{c.key}</code>
                <div className="flex-1"><p className="text-xs font-semibold text-slate-700">{c.label}</p><p className="text-xs text-slate-400">{c.desc}</p></div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.required ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-500'}`}>{c.required ? 'נדרש' : 'אופציונלי'}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-slate-50 border-t text-xs text-slate-500">
            הוסף את משתני הסביבה ב-Railway → Variables וחסה מחדש את השרת.
          </div>
        </div>
      )}

      {/* Member count and quick stats */}
      {members.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <MiniStat label="לקוחות פעילים" value={members.length} />
          <MiniStat label="פעילים" value={members.filter(m=>m.status==='active').length} color="text-green-700" />
          <MiniStat label="מנוי לא פעיל" value={members.filter(m=>m.status==='inactive').length} color="text-red-600" />
          <MiniStat label="מוקפא" value={members.filter(m=>m.status==='frozen').length} color="text-amber-600" />
        </div>
      )}

      {/* Members table */}
      {members.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <div className="bg-slate-50 px-4 py-2.5 border-b flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">לקוחות פעילים ({members.length})</p>
            <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => {
              const rows = [['שם פרטי','שם משפחה','אימייל','טלפון','סטטוס','סוג מנוי','מנוי עד','ביקור אחרון','ימי היעדרות'],
                ...members.map(m => [m.first_name,m.last_name,m.email,m.phone_e164||m.phone,m.status,m.membership_type,fmtShort(m.membership_end),fmtShort(m.last_check_in),m.days_since_visit??''])];
              downloadBlob(toCSV(rows), `arbox-members-${Date.now()}.csv`);
            }}>
              <Download className="w-3 h-3" /> CSV
            </Button>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-800 text-white">
              {['שם', 'טלפון', 'סוג מנוי', 'מנוי עד', 'ביקור אחרון', 'ימי היעדרות', 'סיכון', 'סטטוס'].map(h => (
                <th key={h} className="text-right px-3 py-2.5 font-semibold">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {members.slice(0, 100).map((m, i) => {
                const risk = calcRisk(m.days_since_visit ?? 0);
                const rc   = RISK_COLORS[risk.color];
                return (
                  <tr key={m.id} className={`border-b border-slate-100 hover:bg-slate-50 ${i%2===0?'':'bg-slate-50/30'}`}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{m.first_name} {m.last_name}</td>
                    <td className="px-3 py-2 font-mono">{m.phone_e164||m.phone||'—'}</td>
                    <td className="px-3 py-2 text-slate-600">{m.membership_type||'—'}</td>
                    <td className="px-3 py-2 text-slate-500">{fmtShort(m.membership_end)}</td>
                    <td className="px-3 py-2 text-slate-500">{fmtShort(m.last_check_in)}</td>
                    <td className="px-3 py-2 text-center font-bold">{m.days_since_visit == null ? '—' : m.days_since_visit}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${rc.bg} ${rc.text} ${rc.border}`}><span className={`w-1.5 h-1.5 rounded-full inline-block ml-1 ${rc.dot}`}></span>{risk.label}</span></td>
                    <td className="px-3 py-2"><StatusBadge status={m.status||'—'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sync history */}
      {logs.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <div className="bg-slate-50 px-4 py-2.5 border-b text-sm font-bold text-slate-700">היסטוריית סנכרון</div>
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-100 border-b">{['סוג','סטטוס','רשומות (קלט)','רשומות (פלט)','משך (ms)','התחיל','הסתיים','שגיאה'].map(h=><th key={h} className="text-right px-3 py-2">{h}</th>)}</tr></thead>
            <tbody>{logs.map(l => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="px-3 py-2">{l.sync_type}</td>
                <td className="px-3 py-2"><StatusBadge status={l.status} /></td>
                <td className="px-3 py-2 text-center">{l.records_in}</td>
                <td className="px-3 py-2 text-center">{l.records_out}</td>
                <td className="px-3 py-2 text-center">{l.duration_ms ?? '—'}</td>
                <td className="px-3 py-2 text-slate-400">{fmtDate(l.started_at)}</td>
                <td className="px-3 py-2 text-slate-400">{fmtDate(l.finished_at)}</td>
                <td className="px-3 py-2 text-red-500 max-w-[160px] truncate">{l.error||'—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Data Quality */}
      {dataQuality && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <div className="bg-slate-50 px-4 py-2.5 border-b flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">אימות איכות נתוני נוכחות</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${dataQuality.quality?.pass ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
              {dataQuality.quality?.pass ? 'PASS ✓' : 'FAIL ✗'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-0 divide-x divide-slate-100">
            {[
              ['הזמנות בסה״כ',   dataQuality.bookings?.total,       'text-slate-700'],
              ['נכחו בפועל',     dataQuality.bookings?.checked_in,  'text-green-700'],
              ['לא הגיעו',       dataQuality.bookings?.no_shows,    'text-amber-700'],
              ['כיסוי לקוחות',  `${dataQuality.members?.coverage_pct ?? 0}%`, dataQuality.members?.coverage_pct >= 80 ? 'text-green-700' : 'text-red-700'],
            ].map(([label, val, color]) => (
              <div key={label} className="p-3 text-center">
                <p className={`text-xl font-bold ${color}`}>{val ?? '—'}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
            <span>עדכון אחרון: {dataQuality.sync?.last_bookings_sync ? new Date(dataQuality.sync.last_bookings_sync).toLocaleString('he-IL') : '—'}</span>
            <span>לקוחות עם נתונים: {dataQuality.members?.with_attendance ?? 0} / {dataQuality.members?.business_clients ?? 0}</span>
          </div>
        </div>
      )}

      {/* Raw Arbox Data — ניפוי שגיאות בלבד, לא נתוני עסק */}
      {dbStats && (
        <details className="border border-slate-300 rounded-xl overflow-hidden">
          <summary className="bg-slate-800 text-white px-4 py-2.5 text-sm font-bold cursor-pointer select-none flex items-center gap-2">
            <Database className="w-4 h-4" /> Raw Arbox Data — נתוני API גולמיים (ניפוי שגיאות בלבד)
          </summary>
          <div className="p-4 space-y-3 bg-white">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ נתונים גולמיים מ-API של Arbox — כולל לידים, צוות, FreeFit ומשתמשים לא פעילים. <strong>לא נתוני עסק.</strong>
            </p>
            <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-right px-3 py-2 font-semibold">מדד</th>
                  <th className="text-center px-3 py-2 font-semibold">ספירה גולמית (כל Arbox)</th>
                  <th className="text-center px-3 py-2 font-semibold">לקוחות פעילים (עסקי)</th>
                  <th className="text-right px-3 py-2 font-semibold">פילטר</th>
                  <th className="text-center px-3 py-2 font-semibold">תוצאה</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    label:  'סה״כ משתמשים',
                    raw:    dbStats.members?.total,
                    biz:    dbStats.business_clients?.total,
                    filter: 'user_role=client AND active=true',
                    pass:   dbStats.business_clients?.total < dbStats.members?.total,
                  },
                  {
                    label:  'מנויים פעילים',
                    raw:    dbStats.members?.active,
                    biz:    dbStats.business_clients?.active_membership,
                    filter: 'user_role=client AND active=true AND membership_active=true AND membership_cancelled=false',
                    pass:   (dbStats.business_clients?.active_membership ?? 0) <= (dbStats.members?.active ?? 0),
                  },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-700">{row.label}</td>
                    <td className="px-3 py-2 text-center font-mono text-slate-400">{row.raw ?? '—'}</td>
                    <td className="px-3 py-2 text-center font-mono font-bold text-slate-800">{row.biz ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{row.filter}</td>
                    <td className="px-3 py-2 text-center">
                      {row.pass
                        ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold text-xs">PASS ✓</span>
                        : <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-bold text-xs">FAIL ✗</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                ['שורות DB (גולמי)', dbStats.db_rows?.arbox_members],
                ['נוכחות (גולמי)',   dbStats.db_rows?.arbox_attendance_cache],
                ['לוגי סנכרון',     dbStats.db_rows?.arbox_sync_logs],
              ].map(([label, val]) => (
                <div key={label} className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                  <p className="text-slate-400">{label}</p>
                  <p className="font-bold text-slate-700">{val ?? '—'}</p>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

function MiniStat({ label, value, color = 'text-slate-700' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

// ─── Section: Absence Center ──────────────────────────────────────────────────

function AbsenceSection({ coachEmail }) {
  const { data: res, isLoading } = useQuery({
    queryKey: ['arboxAbsence', coachEmail],
    queryFn:  () => base44.functions.invoke('getArboxAbsenceReport', { coachEmail }),
    enabled:  !!coachEmail,
    staleTime: 60000,
  });
  const tiers = res?.data?.tiers ?? {};
  const total = res?.data?.total ?? 0;

  const TIERS = [
    { key: 'today',   label: 'היום',       days: '0',    color: 'green',  risk: 'green'  },
    { key: 'days3',   label: '1-3 ימים',   days: '1-3',  color: 'green',  risk: 'green'  },
    { key: 'days5',   label: '4-5 ימים',   days: '4-5',  color: 'green',  risk: 'green'  },
    { key: 'days7',   label: '6-7 ימים',   days: '6-7',  color: 'yellow', risk: 'yellow' },
    { key: 'days14',  label: '8-14 ימים',  days: '8-14', color: 'yellow', risk: 'yellow' },
    { key: 'days21',  label: '15-21 ימים', days: '15-21',color: 'orange', risk: 'orange' },
    { key: 'days30',  label: '22-30 ימים', days: '22-30',color: 'red',    risk: 'red'    },
    { key: 'days45',  label: '31-45 ימים', days: '31-45',color: 'red',    risk: 'red'    },
    { key: 'days60',  label: '46-60 ימים', days: '46-60',color: 'red',    risk: 'red'    },
    { key: 'days90',  label: '61-90 ימים', days: '61-90',color: 'red',    risk: 'red'    },
    { key: 'days90p', label: '90+ ימים',   days: '90+',  color: 'red',    risk: 'red'    },
    { key: 'never',   label: 'אין נתונים', days: '—',    color: 'yellow', risk: 'yellow' },
  ];

  const [activeTier, setActiveTier] = useState(null);
  const members = activeTier ? (tiers[activeTier.key] ?? []) : [];

  if (isLoading) return <div className="text-center py-16 text-slate-400"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />טוען...</div>;

  if (!res?.ok && res?.error?.includes('ARBOX_NOT_CONFIGURED')) {
    return (
      <div className="space-y-4">
        <SectionHeader title="מרכז היעדרות" sub="ניתוח היעדרות לפי ימים + Risk Score" />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <WifiOff className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="font-bold text-amber-700">Arbox לא מחובר</p>
          <p className="text-sm text-amber-600 mt-1">יש להגדיר ARBOX_API_KEY בסביבת Railway ולבצע סנכרון ראשון.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="מרכז היעדרות" sub={`${total} לקוחות פעילים · מציג לקוחות פעילים בלבד`} />

      <div className="grid grid-cols-3 gap-3">
        {TIERS.map(t => {
          const cnt = (tiers[t.key]??[]).length;
          const rc  = RISK_COLORS[t.risk];
          return (
            <button key={t.key} onClick={() => setActiveTier(activeTier?.key === t.key ? null : t)}
              className={`p-4 rounded-xl border text-right transition-all hover:shadow-sm ${activeTier?.key === t.key ? 'ring-2 ring-teal-400 ring-offset-1' : ''} ${rc.bg} ${rc.border}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-2xl font-bold ${rc.text}`}>{cnt}</span>
                <span className={`w-2.5 h-2.5 rounded-full ${rc.dot}`}></span>
              </div>
              <p className={`text-sm font-semibold ${rc.text}`}>{t.label}</p>
              <p className="text-xs text-slate-400">{t.days} ימים ללא ביקור</p>
            </button>
          );
        })}
      </div>

      {activeTier && members.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <div className="bg-slate-50 px-4 py-2.5 border-b flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">{activeTier.label} — {members.length} חברים</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => {
                const rows = [['שם','טלפון','ביקור אחרון','ימי היעדרות','סוג מנוי','סטטוס'],
                  ...members.map(m=>[`${m.first_name||''} ${m.last_name||''}`.trim(),m.phone_e164||m.phone||'',fmtShort(m.last_check_in),m.days_since_visit,m.membership_type||'',m.status||''])];
                downloadBlob(toCSV(rows), `absent-${activeTier.key}-${Date.now()}.csv`);
              }}><Download className="w-3 h-3" />CSV</Button>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-800 text-white">{['שם','טלפון','ביקור אחרון','ימי היעדרות','מנוי','סטטוס','סיכון','פעולה'].map(h=><th key={h} className="text-right px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {members.map((m, i) => {
                const risk = calcRisk(m.days_since_visit ?? 999);
                const rc   = RISK_COLORS[risk.color];
                return (
                  <tr key={m.id} className={`border-b border-slate-100 hover:bg-slate-50 ${i%2===0?'':'bg-slate-50/30'}`}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{m.first_name} {m.last_name}</td>
                    <td className="px-3 py-2 font-mono">{m.phone_e164||m.phone||'—'}</td>
                    <td className="px-3 py-2 text-slate-500">{fmtShort(m.last_check_in)}</td>
                    <td className="px-3 py-2 text-center font-bold">{m.days_since_visit == null ? '∞' : m.days_since_visit}</td>
                    <td className="px-3 py-2 text-slate-500">{m.membership_type||'—'}</td>
                    <td className="px-3 py-2"><StatusBadge status={m.status||'—'} /></td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${rc.bg} ${rc.text} ${rc.border}`}>{risk.label}</span></td>
                    <td className="px-3 py-2">
                      {m.phone_e164 && (
                        <a href={`https://wa.me/${m.phone_e164.replace('+','')}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs hover:bg-green-200 transition-colors">
                          <MessageSquare className="w-3 h-3" /> WA
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {activeTier && members.length === 0 && (
        <EmptyState icon={<CheckCircle2 className="w-8 h-8 text-green-400" />} msg={`אין חברים בקטגוריה "${activeTier.label}"`} />
      )}
    </div>
  );
}

// ─── Section: Reports ─────────────────────────────────────────────────────────

function ReportsSection({ automations, queueItems, coachEmail }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const totalSent   = queueItems.filter(q=>q.status==='sent').length;
  const totalFailed = queueItems.filter(q=>q.status==='failed').length;

  const autoMap = useMemo(() => { const m={}; automations.forEach(a=>m[a.id]=a); return m; }, [automations]);

  const queueRows = items => [
    ['שם מתאמן','טלפון','שם אוטומציה','סוג טריגר','תוכן הודעה','Queue ID','Green idMessage','סטטוס','נשלח ב','סיבת כישלון','כפיל'],
    ...items.map(q => {
      const a = autoMap[q.context_id] || {};
      return [q.to_name||'', q.to_phone_e164, a.name||'', a.trigger_type||q.context_type||'', q.rendered_text||'', q.id, '', q.status, q.sent_at ? new Date(q.sent_at).toISOString() : '', q.error||'', ''];
    }),
  ];

  const ExBtn = ({ label, icon, color, onClick }) => (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
      color==='green' ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' :
      color==='red'   ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' :
      color==='teal'  ? 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100' :
      color==='blue'  ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' :
                        'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
    }`}>
      {icon} {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <SectionHeader title="מרכז דוחות" sub="ייצוא נתונים · CSV · Excel · לפי תאריכים" />
      <div className="grid grid-cols-3 gap-4">
        <BigKPI label="סה״כ בתור" value={queueItems.length} icon={<Database className="w-5 h-5 text-slate-400" />} />
        <BigKPI label="נשלחו" value={totalSent} icon={<CheckCircle2 className="w-5 h-5 text-green-500" />} color="text-green-700" />
        <BigKPI label="נכשלו" value={totalFailed} icon={<XCircle className="w-5 h-5 text-red-400" />} color="text-red-700" />
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <p className="text-sm font-bold text-slate-700">הורדות מהירות</p>
        <div className="flex flex-wrap gap-2">
          <ExBtn label="הורד CSV מלא" color="slate" icon={<Download className="w-4 h-4" />} onClick={() => { downloadBlob(toCSV(queueRows(queueItems)), `all-${Date.now()}.csv`); toast.success('הורד'); }} />
          <ExBtn label="דוח שליחות" color="green" icon={<CheckCircle2 className="w-4 h-4" />} onClick={() => { downloadBlob(toCSV(queueRows(queueItems.filter(q=>q.status==='sent'))), `sent-${Date.now()}.csv`); toast.success('הורד'); }} />
          <ExBtn label="דוח נכשלים" color="red" icon={<XCircle className="w-4 h-4" />} onClick={() => { downloadBlob(toCSV(queueRows(queueItems.filter(q=>q.status==='failed'))), `failed-${Date.now()}.csv`); toast.success('הורד'); }} />
          <ExBtn label="דוח אוטומציות" color="teal" icon={<Zap className="w-4 h-4" />} onClick={() => {
            const rows = [['שם','טריגר','יעד','הסכמה','Cooldown','פעיל','ריצה אחרונה','נוצר'],
              ...automations.map(a=>[a.name,getTriggerMeta(a.trigger_type).label,a.target_type==='all'?'כולם':a.target_phone||'',a.consent_category,a.cooldown_hours,a.enabled?'כן':'לא',fmtDate(a.last_run_at),fmtDate(a.created_at)])];
            downloadBlob(toCSV(rows), `automations-${Date.now()}.csv`); toast.success('הורד');
          }} />
          <ExBtn label="Excel" color="blue" icon={<FileText className="w-4 h-4" />} onClick={() => {
            downloadBlob(queueRows(queueItems).map(r=>r.join('\t')).join('\n'), `report-${Date.now()}.xls`, 'application/vnd.ms-excel'); toast.success('Excel הורד');
          }} />
        </div>
        <Separator />
        <p className="text-sm font-bold text-slate-700">דוח לפי תאריכים</p>
        <div className="flex items-center gap-3">
          <Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="w-40 h-9 text-sm" dir="ltr" />
          <span className="text-slate-400">עד</span>
          <Input type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   className="w-40 h-9 text-sm" dir="ltr" />
          <Button variant="outline" className="h-9 text-sm" onClick={() => {
            let f = queueItems;
            if (dateFrom) f = f.filter(q=>new Date(q.created_at)>=new Date(dateFrom));
            if (dateTo)   f = f.filter(q=>new Date(q.created_at)<=new Date(dateTo+'T23:59:59'));
            downloadBlob(toCSV(queueRows(f)), `date-report-${dateFrom}-${dateTo}.csv`);
            toast.success(`${f.length} רשומות הורדו`);
          }}>
            <Download className="w-4 h-4 ml-1" /> הורד
          </Button>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-xs font-bold text-slate-600 mb-2">עמודות בדוח</p>
          <div className="flex flex-wrap gap-1.5">
            {['שם מתאמן','טלפון','שם אוטומציה','סוג טריגר','תוכן הודעה','Queue ID','Green idMessage','סטטוס','נשלח ב','סיבת כישלון','כפיל'].map(c=>(
              <span key={c} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs text-slate-600">{c}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BigKPI({ label, value, icon, color = 'text-slate-700' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
      {icon}
      <div><p className={`text-2xl font-bold ${color}`}>{value}</p><p className="text-sm text-slate-500">{label}</p></div>
    </div>
  );
}

// ─── Section: Analytics ───────────────────────────────────────────────────────

function AnalyticsSection({ queueItems, automations }) {
  const byDay = useMemo(() => {
    const m = {};
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    });
    last7.forEach(d => m[d] = { date: d, sent: 0, failed: 0, queued: 0 });
    queueItems.forEach(q => {
      const d = new Date(q.created_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
      if (m[d]) {
        if (q.status==='sent')   m[d].sent++;
        if (q.status==='failed') m[d].failed++;
        if (q.status==='queued') m[d].queued++;
      }
    });
    return Object.values(m);
  }, [queueItems]);

  const triggerDist = useMemo(() => {
    const c = {};
    automations.forEach(a => { c[a.trigger_type] = (c[a.trigger_type]||0) + 1; });
    return Object.entries(c).map(([k, v]) => ({ name: getTriggerMeta(k).label.slice(0,12), count: v }));
  }, [automations]);

  return (
    <div className="space-y-6">
      <SectionHeader title="אנליטיקה" sub="מגמות שליחה · פילוח אוטומציות" />
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm font-bold text-slate-700 mb-3">שליחות לפי יום (7 ימים אחרונים)</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="sent"   stroke="#22c55e" strokeWidth={2} name="נשלחו"  dot={false} />
              <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} name="נכשלו"  dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm font-bold text-slate-700 mb-3">פילוח אוטומציות לפי טריגר</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={triggerDist} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
              <Tooltip />
              <Bar dataKey="count" fill="#14b8a6" name="כמות" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Logs ────────────────────────────────────────────────────────────

function LogsSection({ coachEmail }) {
  const { data: logsRes, isLoading } = useQuery({
    queryKey: ['automationLogs', coachEmail],
    queryFn:  () => base44.entities.AutomationAuditLog.filter({}),
    enabled:  !!coachEmail,
    staleTime: 30000,
  });
  const logs = (logsRes ?? []).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 200);

  return (
    <div className="space-y-4">
      <SectionHeader title="לוג ביצועים" sub="כל פעולות האוטומציה · הסכמה · חסימות · שליחות" />
      {isLoading ? <LoadingSpinner /> : logs.length === 0 ? (
        <EmptyState icon={<ScrollText className="w-8 h-8" />} msg="אין לוגים עדיין" />
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-800 text-white">{['זמן','מתאמן','סוג אוטומציה','פעולה','חסום ע״י','פרטים'].map(h=><th key={h} className="text-right px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={l.id} className={`border-b border-slate-100 hover:bg-slate-50 ${i%2===0?'':'bg-slate-50/30'}`}>
                  <td className="px-3 py-2 text-slate-400">{fmtDate(l.created_at)}</td>
                  <td className="px-3 py-2 text-slate-600">{l.trainee_email||l.trainee_id||'—'}</td>
                  <td className="px-3 py-2"><span className="font-mono bg-slate-100 px-1 rounded">{l.automation_type}</span></td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${l.action==='allowed'||l.action==='sent'?'bg-green-100 text-green-700':l.action==='blocked'?'bg-red-100 text-red-700':'bg-slate-100 text-slate-600'}`}>{l.action}</span></td>
                  <td className="px-3 py-2 text-slate-400 font-mono">{l.blocked_by_pref||'—'}</td>
                  <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate">{l.details||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Section: Failed Messages ─────────────────────────────────────────────────

function FailedSection({ queueItems, onRefresh }) {
  const failed = queueItems.filter(q => q.status === 'failed').sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

  const handleRetryAll = async () => {
    const r = await base44.functions.invoke('resetWhatsAppQueue', {});
    if (r?.ok) { toast.success(`אופסו ${r.data?.reset} הודעות`); onRefresh(); }
    else toast.error(r?.error);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="הודעות שנכשלו" sub={`${failed.length} הודעות ממתינות לטיפול`} />
        {failed.length > 0 && (
          <Button onClick={handleRetryAll} variant="outline" className="gap-1.5 text-sm">
            <RefreshCw className="w-4 h-4" /> שלח שוב את כולן
          </Button>
        )}
      </div>
      {failed.length === 0
        ? <EmptyState icon={<CheckCircle2 className="w-8 h-8 text-green-400" />} msg="אין הודעות שנכשלו 🎉" />
        : <QueueTable items={failed} showError />}
    </div>
  );
}

// ─── Section: Validation Center ───────────────────────────────────────────────

function ValidationSection({ automations, coachEmail, onRefresh }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className="space-y-4">
      <SectionHeader title="מרכז ולידציה" sub="בדוק כל אוטומציה לפני הפעלה" />
      <div className="grid grid-cols-2 gap-3">
        {automations.map(a => {
          const meta = getTriggerMeta(a.trigger_type);
          return (
            <button key={a.id} onClick={() => setSelected(a)}
              className={`text-right p-4 rounded-xl border transition-all hover:shadow-sm bg-white ${!a.enabled ? 'border-slate-200' : 'border-green-200 bg-green-50/30'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-800 text-sm">{a.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{a.enabled ? 'פעיל' : 'כבוי'}</span>
              </div>
              <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${TRIGGER_COLORS[meta.category]}`}>{meta.label}</span>
              <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><Shield className="w-3 h-3" /> לחץ לולידציה מלאה</p>
            </button>
          );
        })}
      </div>
      {selected && <ValidationDialog open onClose={() => setSelected(null)} automation={selected} coachEmail={coachEmail} onTestSend={onRefresh} />}
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function SectionHeader({ title, sub }) {
  return (
    <div className="mb-1">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {sub && <p className="text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

function EmptyState({ icon, msg }) {
  return (
    <div className="text-center py-14 border-2 border-dashed border-slate-200 rounded-xl bg-white">
      <div className="text-slate-300 mx-auto mb-3 flex justify-center">{icon}</div>
      <p className="text-slate-400 text-sm">{msg}</p>
    </div>
  );
}

function LoadingSpinner() {
  return <div className="text-center py-12"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-300" /></div>;
}

// ─── Section: Duplicate Trainee Risk Report ───────────────────────────────────

const REASON_LABELS = {
  same_name:          { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700',    icon: '⚠️', he: 'שם זהה' },
  email_prefix_match: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700',  icon: '📧', he: 'אימייל כמעט זהה' },
  same_phone:         { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700', icon: '📱', he: 'טלפון זהה' },
};

function DuplicatesSection({ coachEmail }) {
  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['duplicateTrainees', coachEmail],
    queryFn:  () => base44.functions.invoke('getDuplicateTraineeReport', { coachEmail }),
    enabled:  !!coachEmail,
    staleTime: 60000,
  });

  const report = res?.data;
  const groups = report?.duplicate_groups ?? [];
  const typos  = report?.typo_emails ?? [];
  const hasIssues = groups.length > 0 || typos.length > 0;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-start justify-between">
        <SectionHeader
          title="דוח כפילויות מתאמנים"
          sub="קריאה בלבד · אין מיזוג אוטומטי · כל שינוי מצריך אישור ידני"
        />
        <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">
          <RefreshCw className="w-3 h-3" /> רענן
        </button>
      </div>

      {/* Read-only warning */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-bold mb-0.5">דוח קריאה בלבד</p>
          <p className="text-xs leading-relaxed">זה דוח לזיהוי בלבד. לא ניתן למזג, למחוק או לשנות רשומות מכאן. כל שינוי ב-trainee_id מצריך אישור מפורש עם הדפסת מצב לפני ואחרי.</p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className={`text-2xl font-bold ${groups.length > 0 ? 'text-red-600' : 'text-green-600'}`}>{groups.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">קבוצות כפולות</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className={`text-2xl font-bold ${typos.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>{typos.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">אימיילים עם שגיאת הקלדה</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-slate-700">{report?.total_trainees ?? '—'}</p>
          <p className="text-xs text-slate-500 mt-0.5">סה״כ מתאמנים</p>
        </div>
      </div>

      {!hasIssues && (
        <div className="text-center py-14 border-2 border-dashed border-green-200 rounded-xl bg-green-50">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-green-700 font-semibold">לא נמצאו כפילויות</p>
          <p className="text-green-600 text-sm mt-1">כל רשומות המתאמנים נראות תקינות.</p>
        </div>
      )}

      {/* Typo email accounts */}
      {typos.length > 0 && (
        <div className="border border-red-200 rounded-xl overflow-hidden bg-white">
          <div className="bg-red-50 px-4 py-2.5 border-b border-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <p className="text-sm font-bold text-red-700">אימיילים עם שגיאת הקלדה ידועה ({typos.length})</p>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-right px-4 py-2.5 font-semibold text-slate-700">שם</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-700">אימייל (פגום)</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-700">שגיאה</th>
              <th className="text-right px-4 py-2.5 font-semibold text-slate-700">Trainee ID</th>
            </tr></thead>
            <tbody>
              {typos.map((t, i) => (
                <tr key={t.id} className={`border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{t.full_name}</td>
                  <td className="px-4 py-2.5 font-mono text-red-600">{t.email}</td>
                  <td className="px-4 py-2.5"><span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-mono">{t.typo}</span></td>
                  <td className="px-4 py-2.5 font-mono text-slate-400 text-xs">{t.id.slice(-12)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
            ⚠️ חשבונות אלה לא יוכלו לקבל מיילים. יש לתקן ידנית אחרי בדיקה עם המתאמן.
          </div>
        </div>
      )}

      {/* Duplicate groups */}
      {groups.map((group, gi) => {
        const style = REASON_LABELS[group.reason] || REASON_LABELS.same_name;
        return (
          <div key={gi} className={`border ${style.border} rounded-xl overflow-hidden bg-white`}>
            <div className={`${style.bg} px-4 py-2.5 border-b ${style.border} flex items-center gap-2`}>
              <span>{style.icon}</span>
              <p className={`text-sm font-bold ${style.text}`}>{group.label}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge} mr-auto`}>{style.he}</span>
            </div>
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-right px-4 py-2.5 font-semibold text-slate-700">שם</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-700">אימייל</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-700">טלפון</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-700">Trainee ID (סוף)</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-700">נוצר</th>
              </tr></thead>
              <tbody>
                {group.trainees.map((t, ti) => (
                  <tr key={t.id} className={`border-b border-slate-100 ${ti % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{t.full_name || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-600 text-xs">{t.user_email || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{t.phone_e164 || t.phone || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-400">...{t.id.slice(-12)}</td>
                    <td className="px-4 py-2.5 text-slate-400">{t.created_at ? new Date(t.created_at).toLocaleDateString('he-IL') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
              🔒 קריאה בלבד — לא ניתן לבצע שינויים מכאן
            </div>
          </div>
        );
      })}

      <div className="text-xs text-slate-400 text-center pt-2">
        בדיקה אחרונה: {report?.checked_at ? new Date(report.checked_at).toLocaleString('he-IL') : '—'}
      </div>
    </div>
  );
}

// ─── ReminderCenterSection ────────────────────────────────────────────────────

const REMINDER_TYPE_HE = {
  nutrition_breakfast:      'תזונה — ארוחת בוקר',
  nutrition_lunch:          'תזונה — צהריים',
  nutrition_dinner:         'תזונה — ערב',
  water_midday:             'מים — צהריים',
  water_afternoon:          'מים — אחה"צ',
  water_evening:            'מים — ערב',
  workout_motivation:       'אימון — מוטיבציה',
  weigh_in_reminder:        'שקילה',
  inactivity_nudge:         'אי-פעילות',
  encouragement_weekly:     'עידוד שבועי',
  feedback_request_30days:  'בקשת משוב',
  weekly_summary:           'סיכום שבועי',
};
const remType = k => REMINDER_TYPE_HE[k] || k || '—';

const QUEUE_STATUS_STYLE = {
  sent:    { bg: 'bg-green-100',  text: 'text-green-700',  label: 'נשלח'    },
  queued:  { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'בתור'    },
  sending: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'שולח'    },
  failed:  { bg: 'bg-red-100',    text: 'text-red-700',    label: 'נכשל'    },
};
const qStatus = s => QUEUE_STATUS_STYLE[s] || { bg: 'bg-slate-100', text: 'text-slate-600', label: s };

function ReminderCenterSection({ coachEmail }) {
  const [tab, setTab]       = useState('queue');
  const [search, setSearch] = useState('');
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0]);

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['reminderCenter', date],
    queryFn:  () => base44.functions.invoke('getReminderCenterData', { date, coachEmail }),
    staleTime: 30000,
  });

  const d = res?.data;
  const summary      = d?.summary      || {};
  const queue        = d?.queue        || [];
  const blockedLog   = d?.blocked_log  || [];
  const consent      = d?.consent      || [];
  const reports      = d?.reports      || {};

  const lc = s => (s || '').toLowerCase();
  const filteredQueue = queue.filter(q =>
    !search || lc(q.to_name).includes(lc(search)) || lc(q.template_key).includes(lc(search)) || lc(q.status).includes(lc(search)) || lc(q.id_message).includes(lc(search))
  );
  const filteredConsent = consent.filter(c =>
    !search || lc(c.trainee_name).includes(lc(search)) || lc(c.trainee_email).includes(lc(search))
  );
  const filteredBlocked = blockedLog.filter(b =>
    !search || lc(b.trainee_email).includes(lc(search)) || lc(b.automation_type).includes(lc(search)) || lc(b.reason).includes(lc(search))
  );

  const TABS = [
    { key: 'queue',   label: 'תור היום'      },
    { key: 'blocked', label: 'חסומים'        },
    { key: 'consent', label: 'הסכמות'        },
    { key: 'reports', label: 'דוחות'         },
  ];

  const SummaryCard = ({ label, value, color = 'slate', sub }) => (
    <div className={`rounded-xl p-4 border bg-${color}-50 border-${color}-200`}>
      <p className={`text-2xl font-bold text-${color}-700`}>{value ?? '—'}</p>
      <p className={`text-xs font-medium text-${color}-600 mt-0.5`}>{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );

  const bool = v => v === true ? <span className="text-green-600 font-bold">✓</span> : v === false ? <span className="text-red-500">✗</span> : <span className="text-slate-300">—</span>;

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="h-8 text-sm w-40"
          />
          <Input
            placeholder="חיפוש..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-sm w-52"
          />
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw className="w-3.5 h-3.5" /> רענן
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="נשלחו היום"      value={summary.sent_today}          color="green"  />
        <SummaryCard label="בתור"             value={summary.queued}              color="blue"   />
        <SummaryCard label="נכשלו"            value={summary.failed_today}        color="red"    />
        <SummaryCard label="חסומו היום"       value={summary.blocked_today}       color="amber"  />
        <SummaryCard label="תזכורות כבויות"  value={summary.disabled_count}      color="orange" sub="master=כבוי" />
        <SummaryCard label="מעולם לא הפעיל"  value={summary.never_enabled_count} color="slate"  />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key ? 'border-teal-500 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.key === 'blocked' && blockedLog.length > 0 && (
              <span className="mr-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{blockedLog.length}</span>
            )}
            {t.key === 'reports' && reports.repeated_failures?.length > 0 && (
              <span className="mr-1.5 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{reports.repeated_failures.length}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>טוען נתוני תזכורות...</span>
        </div>
      )}

      {!isLoading && tab === 'queue' && (
        <div className="rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-right">
                <th className="px-3 py-2.5 font-semibold text-slate-600">מתאמן</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">סוג תזכורת</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">מתוזמן</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">נשלח בפועל</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">סטטוס</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">סיבת כשל</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">idMessage (Green API)</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">Queue ID</th>
                <th className="px-3 py-2.5 font-semibold text-slate-600">מאמן</th>
              </tr>
            </thead>
            <tbody>
              {filteredQueue.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">אין הודעות בתאריך זה</td></tr>
              )}
              {filteredQueue.map((q, i) => {
                const st = qStatus(q.status);
                return (
                  <tr key={q.queue_id} className={`border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                    <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">{q.to_name || q.to_phone}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{remType(q.template_key)}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{q.scheduled_for ? fmtDate(q.scheduled_for) : '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{q.sent_at ? fmtDate(q.sent_at) : '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${st.bg} ${st.text}`}>{st.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-red-600 max-w-[160px] truncate" title={q.error || ''}>{q.error || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-500 text-[10px] whitespace-nowrap">{q.id_message || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-400 text-[10px] whitespace-nowrap">...{q.queue_id?.slice(-10)}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-[10px] whitespace-nowrap">{q.coach_email}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
            {filteredQueue.length} הודעות
          </div>
        </div>
      )}

      {!isLoading && tab === 'blocked' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">הודעות שנחסמו היום — כולל סיבה מפורטת</p>
          <div className="rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-right">
                  <th className="px-3 py-2.5 font-semibold text-slate-600">מתאמן</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">סוג אוטומציה</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">סיבה</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">שעה</th>
                </tr>
              </thead>
              <tbody>
                {filteredBlocked.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">אין חסימות היום</td></tr>
                )}
                {filteredBlocked.map((b, i) => (
                  <tr key={i} className={`border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{b.trainee_email}</td>
                    <td className="px-3 py-2.5 text-slate-600">{remType(b.automation_type)}</td>
                    <td className="px-3 py-2.5">
                      <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-medium">{b.reason}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">{b.ts ? fmtDate(b.ts) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">{filteredBlocked.length} חסימות</div>
          </div>
        </div>
      )}

      {!isLoading && tab === 'consent' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">מצב הסכמה לכל מתאמן — ✓ = מופעל, ✗ = כבוי, — = אף פעם לא הגדיר</p>
          <div className="rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-right">
                  <th className="px-3 py-2.5 font-semibold text-slate-600">מתאמן</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">טלפון</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600 text-center">Master</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600 text-center">תזונה</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600 text-center">מים</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600 text-center">אימון</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600 text-center">שקילה</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600 text-center">אי-פעילות</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">עדכון אחרון</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-600">מאמן</th>
                </tr>
              </thead>
              <tbody>
                {filteredConsent.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">אין מתאמנים</td></tr>
                )}
                {filteredConsent.map((c, i) => (
                  <tr key={c.trainee_id} className={`border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/40'} ${c.never_enabled ? 'bg-slate-50' : ''}`}>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-slate-800">{c.trainee_name || '—'}</span>
                      {c.never_enabled && <span className="mr-1.5 text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">מעולם לא הגדיר</span>}
                    </td>
                    <td className="px-3 py-2.5">{c.has_phone ? <span className="text-green-600">✓ יש</span> : <span className="text-red-500">✗ חסר</span>}</td>
                    <td className="px-3 py-2.5 text-center">{bool(c.master)}</td>
                    <td className="px-3 py-2.5 text-center">{bool(c.nutrition)}</td>
                    <td className="px-3 py-2.5 text-center">{bool(c.water)}</td>
                    <td className="px-3 py-2.5 text-center">{bool(c.workout)}</td>
                    <td className="px-3 py-2.5 text-center">{bool(c.weigh_in)}</td>
                    <td className="px-3 py-2.5 text-center">{bool(c.inactivity)}</td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{c.last_updated ? fmtShort(c.last_updated) : '—'}</td>
                    <td className="px-3 py-2.5 text-slate-400 text-[10px]">{c.coach_email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">{filteredConsent.length} מתאמנים</div>
          </div>
        </div>
      )}

      {!isLoading && tab === 'reports' && (
        <div className="space-y-4">
          {/* Disabled */}
          <div className="rounded-xl border border-orange-200 overflow-hidden">
            <div className="bg-orange-50 px-4 py-2.5 flex items-center gap-2">
              <Bell className="w-4 h-4 text-orange-500" />
              <span className="font-semibold text-orange-700 text-sm">תזכורות כבויות (master=כבוי) — {reports.disabled?.length ?? 0}</span>
            </div>
            {(reports.disabled || []).filter(r => !search || lc(r.name).includes(lc(search)) || lc(r.email).includes(lc(search))).length === 0
              ? <p className="px-4 py-4 text-xs text-slate-400">אין</p>
              : (reports.disabled || []).filter(r => !search || lc(r.name).includes(lc(search)) || lc(r.email).includes(lc(search))).map(r => (
                  <div key={r.id} className="px-4 py-2 border-t border-orange-100 flex items-center gap-3 text-xs">
                    <span className="font-medium text-slate-800">{r.name || '—'}</span>
                    <span className="text-slate-500">{r.email}</span>
                    <span className="text-slate-400 text-[10px]">{r.coach_email}</span>
                  </div>
                ))
            }
          </div>

          {/* Never enabled */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-slate-700 text-sm">מעולם לא הגדיר הסכמה — {reports.never_enabled?.length ?? 0}</span>
            </div>
            {(reports.never_enabled || []).filter(r => !search || lc(r.name).includes(lc(search)) || lc(r.email).includes(lc(search))).length === 0
              ? <p className="px-4 py-4 text-xs text-slate-400">אין</p>
              : (reports.never_enabled || []).filter(r => !search || lc(r.name).includes(lc(search)) || lc(r.email).includes(lc(search))).map(r => (
                  <div key={r.id} className="px-4 py-2 border-t border-slate-100 flex items-center gap-3 text-xs">
                    <span className="font-medium text-slate-800">{r.name || '—'}</span>
                    <span className="text-slate-500">{r.email}</span>
                  </div>
                ))
            }
          </div>

          {/* Missing phone */}
          <div className="rounded-xl border border-red-200 overflow-hidden">
            <div className="bg-red-50 px-4 py-2.5 flex items-center gap-2">
              <Phone className="w-4 h-4 text-red-500" />
              <span className="font-semibold text-red-700 text-sm">חסר מספר טלפון — {reports.missing_phone?.length ?? 0}</span>
            </div>
            {(reports.missing_phone || []).filter(r => !search || lc(r.name).includes(lc(search)) || lc(r.email).includes(lc(search))).length === 0
              ? <p className="px-4 py-4 text-xs text-slate-400">אין</p>
              : (reports.missing_phone || []).filter(r => !search || lc(r.name).includes(lc(search)) || lc(r.email).includes(lc(search))).map(r => (
                  <div key={r.id} className="px-4 py-2 border-t border-red-100 flex items-center gap-3 text-xs">
                    <span className="font-medium text-slate-800">{r.name || '—'}</span>
                    <span className="text-slate-500">{r.email}</span>
                  </div>
                ))
            }
          </div>

          {/* Repeated failures */}
          <div className="rounded-xl border border-red-300 overflow-hidden">
            <div className="bg-red-50 px-4 py-2.5 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="font-semibold text-red-700 text-sm">כשלים חוזרים (3+ ב-7 ימים) — {reports.repeated_failures?.length ?? 0}</span>
            </div>
            {(reports.repeated_failures || []).filter(r => !search || lc(r.name).includes(lc(search)) || lc(r.phone).includes(lc(search))).length === 0
              ? <p className="px-4 py-4 text-xs text-slate-400">אין</p>
              : (reports.repeated_failures || []).filter(r => !search || lc(r.name).includes(lc(search)) || lc(r.phone).includes(lc(search))).map(r => (
                  <div key={r.phone} className="px-4 py-2.5 border-t border-red-100 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-slate-800">{r.name || r.phone}</span>
                      <span className="text-red-600 font-bold">{r.count} כשלים</span>
                      <span className="text-slate-400">{r.types}</span>
                    </div>
                    {r.last_error && <p className="text-slate-500 mt-0.5 truncate">{r.last_error}</p>}
                  </div>
                ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MissionControl() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const coachEmail = user?.email;

  const { data: automations = [], isLoading: autoLoading } = useQuery({
    queryKey: ['whatsappAutomations', coachEmail],
    queryFn:  () => base44.entities.WhatsAppAutomation.filter({ coach_email: coachEmail }),
    enabled:  !!coachEmail,
  });

  const { data: queueItems = [] } = useQuery({
    queryKey: ['whatsappQueue', coachEmail],
    queryFn:  () => base44.entities.WhatsAppMessageQueue.filter({ coach_email: coachEmail }),
    enabled:  !!coachEmail,
    staleTime: 20000,
  });

  const { data: waStatusRes } = useQuery({
    queryKey: ['waStatus'],
    queryFn:  () => base44.functions.invoke('testWhatsAppConnection', {}),
    staleTime: 60000,
  });

  const { data: arboxStatusRes } = useQuery({
    queryKey: ['arboxStatus'],
    queryFn:  () => base44.functions.invoke('getArboxStatus', {}),
    staleTime: 60000,
  });

  const { data: absenceRes } = useQuery({
    queryKey: ['arboxAbsence', coachEmail],
    queryFn:  () => base44.functions.invoke('getArboxAbsenceReport', { coachEmail }),
    enabled:  !!coachEmail,
    staleTime: 120000,
  });

  const waConnected     = waStatusRes?.data?.connected;
  const arboxStatus     = arboxStatusRes?.data;
  const absenceData     = absenceRes?.data;

  const queueStatsMap = useMemo(() => {
    const m = {};
    queueItems.forEach(q => {
      if (!q.context_id) return;
      if (!m[q.context_id]) m[q.context_id] = { sent: 0, failed: 0, queued: 0 };
      if (q.status==='sent')   m[q.context_id].sent++;
      if (q.status==='failed') m[q.context_id].failed++;
      if (q.status==='queued'||q.status==='sending') m[q.context_id].queued++;
    });
    return m;
  }, [queueItems]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries(['whatsappAutomations']);
    queryClient.invalidateQueries(['whatsappQueue']);
    queryClient.invalidateQueries(['arboxAbsence']);
    queryClient.invalidateQueries(['arboxMembers']);
  }, [queryClient]);

  if (user && user.role !== 'admin' && user.role !== 'coach') {
    return <div className="min-h-screen flex items-center justify-center" dir="rtl"><p className="text-slate-500">אין הרשאה.</p></div>;
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':   return <DashboardSection automations={automations} queueItems={queueItems} arboxStatus={arboxStatus} absenceData={absenceData} coachEmail={coachEmail} />;
      case 'automations': return <AutomationsSection automations={automations} queueStatsMap={queueStatsMap} coachEmail={coachEmail} onRefresh={refresh} />;
      case 'queue':       return <QueueSection queueItems={queueItems} onRefresh={refresh} />;
      case 'live':        return <LiveSection queueItems={queueItems} />;
      case 'arbox':       return <ArboxSection coachEmail={coachEmail} arboxStatus={arboxStatus} onRefresh={refresh} />;
      case 'absence':     return <AbsenceSection coachEmail={coachEmail} />;
      case 'reports':     return <ReportsSection automations={automations} queueItems={queueItems} coachEmail={coachEmail} />;
      case 'analytics':   return <AnalyticsSection queueItems={queueItems} automations={automations} />;
      case 'logs':        return <LogsSection coachEmail={coachEmail} />;
      case 'failed':      return <FailedSection queueItems={queueItems} onRefresh={refresh} />;
      case 'validation':  return <ValidationSection automations={automations} coachEmail={coachEmail} onRefresh={refresh} />;
      case 'duplicates':  return <DuplicatesSection coachEmail={coachEmail} />;
      case 'reminders':   return <ReminderCenterSection coachEmail={coachEmail} />;
      default:            return null;
    }
  };

  const enabledCount  = automations.filter(a=>a.enabled).length;
  const failedCount   = queueItems.filter(q=>q.status==='failed').length;

  const { data: dupRes } = useQuery({
    queryKey: ['duplicateCount', coachEmail],
    queryFn:  () => base44.functions.invoke('getDuplicateTraineeReport', { coachEmail }),
    enabled:  !!coachEmail,
    staleTime: 300000,
  });
  const duplicateCount = (dupRes?.data?.duplicate_groups?.length ?? 0) + (dupRes?.data?.typo_emails?.length ?? 0);

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden" dir="rtl">

      {/* ── Mobile backdrop — closes drawer when tapped ── */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──
          Desktop (md+): static, always visible.
          Mobile: fixed drawer that slides in from the right (RTL).
          translate-x-full hides it; translate-x-0 shows it.
          md:translate-x-0 overrides both so desktop is always visible. */}
      <div className={`
        fixed md:static inset-y-0 right-0 z-50
        w-64 md:w-56 bg-slate-900 flex flex-col shrink-0 overflow-y-auto
        transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
        md:translate-x-0
      `}>
        {/* Close button — mobile only */}
        <div className="md:hidden flex justify-start px-3 pt-3 pb-1">
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="סגור תפריט"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Logo */}
        <div className="px-4 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">FitCoach</p>
              <p className="text-slate-400 text-xs leading-tight">Mission Control</p>
            </div>
          </div>
        </div>

        {/* Status pills */}
        <div className="px-3 py-2 border-b border-slate-700 space-y-1">
          <div className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs ${waConnected ? 'text-green-400' : 'text-amber-400'}`}>
            {waConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>WA {waConnected ? 'מחובר' : 'לא מחובר'}</span>
          </div>
          <div className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs ${arboxStatus?.connected ? 'text-green-400' : 'text-slate-400'}`}>
            <Database className="w-3 h-3" />
            <span>Arbox {arboxStatus?.connected ? 'מחובר' : 'לא מחובר'}</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = activeSection === item.key;
            const badge = item.key === 'failed' && failedCount > 0 ? failedCount : item.key === 'automations' ? enabledCount : item.key === 'duplicates' && duplicateCount > 0 ? duplicateCount : null;
            return (
              <button
                key={item.key}
                onClick={() => { setActiveSection(item.key); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-teal-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-right">{item.label}</span>
                {badge !== null && badge > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                    item.key === 'failed' ? 'bg-red-500 text-white' :
                    item.key === 'duplicates' ? 'bg-amber-400 text-white' :
                    'bg-teal-400 text-white'
                  }`}>{badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-slate-700">
          <p className="text-xs text-slate-500 text-center">FitCoach Enterprise v2.0</p>
        </div>
      </div>

      {/* Main content — takes full width on mobile (sidebar is out-of-flow when fixed) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
            onClick={() => setSidebarOpen(true)}
            aria-label="פתח תפריט"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900 truncate">{NAV_ITEMS.find(n=>n.key===activeSection)?.label}</h1>
            <p className="text-xs text-slate-400 truncate">{new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="mr-auto flex items-center gap-2 shrink-0">
            <button onClick={refresh} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">רענן</span>
            </button>
            <div className="hidden sm:block text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              {coachEmail}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
