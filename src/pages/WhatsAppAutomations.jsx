import React, { useState, useMemo } from 'react';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Plus, Edit2, Trash2, Play, CheckCircle2, XCircle, Clock, Zap,
  Users, History, AlertCircle, RefreshCw, Download, FileText,
  Search, ChevronDown, ChevronRight, Shield, Eye, Phone,
  Wifi, WifiOff, BarChart3, AlertTriangle, Info, Check,
  MessageSquare, Calendar, Link, Database, Settings,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_TYPES = [
  { value: 'manual_test',            label: 'בדיקה ידנית',              category: 'test' },
  { value: 'new_trainee_created',    label: 'מתאמן חדש נוצר',            category: 'onboarding' },
  { value: 'first_login',            label: 'כניסה ראשונה',              category: 'onboarding' },
  { value: 'daily_workout_reminder', label: 'תזכורת אימון יומית',         category: 'reminder' },
  { value: 'meal_log_reminder',      label: 'תזכורת רישום ארוחות',       category: 'reminder' },
  { value: 'water_reminder',         label: 'תזכורת מים',                category: 'reminder' },
  { value: 'inactive_trainee',       label: 'מתאמן לא פעיל',             category: 'engagement' },
  { value: 'weekly_summary',         label: 'סיכום שבועי',               category: 'engagement' },
  { value: 'custom_scheduled',       label: 'שליחה מתוזמנת מותאמת',      category: 'custom' },
];

const TRIGGER_BADGE_CLASSES = {
  test:       'bg-slate-100 text-slate-600 border-slate-200',
  onboarding: 'bg-blue-50 text-blue-700 border-blue-200',
  reminder:   'bg-amber-50 text-amber-700 border-amber-200',
  engagement: 'bg-purple-50 text-purple-700 border-purple-200',
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
const DAYS_FULL  = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const VARIABLE_HINTS = [
  { var: '{{trainee_name}}', desc: 'שם המתאמן' },
  { var: '{{coach_name}}',   desc: 'שם המאמן' },
  { var: '{{app_link}}',     desc: 'קישור לאפליקציה' },
  { var: '{{date}}',         desc: 'תאריך היום' },
];

const EMPTY_FORM = {
  name:             '',
  trigger_type:     'daily_workout_reminder',
  message_template: 'שלום {{trainee_name}},\n\nהודעה מ-FitCoach 💪',
  target_type:      'all',
  target_phone:     '',
  schedule_config:  '',
  consent_category: 'whatsapp_reminder',
  enabled:          false,
  cooldown_hours:   24,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTriggerMeta(value) {
  return TRIGGER_TYPES.find(t => t.value === value) || { value, label: value, category: 'custom' };
}

function parseSchedule(raw) {
  if (!raw) return {};
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
}

function renderPreview(template) {
  return template
    .replace(/\{\{trainee_name\}\}/g, 'ישראל ישראלי')
    .replace(/\{\{coach_name\}\}/g,   'המאמן שלך')
    .replace(/\{\{app_link\}\}/g,     'https://fitcoach-frontend-omega.vercel.app')
    .replace(/\{\{date\}\}/g,         new Date().toLocaleDateString('he-IL'));
}

function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).trim().replace(/[\s\-()]/g, '');
  if (/^0\d{9}$/.test(p)) p = '+972' + p.slice(1);
  if (/^972\d{9}$/.test(p)) p = '+' + p;
  return p;
}

function extractLinks(text) {
  return (text.match(/https?:\/\/[^\s]+/g) || []);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob(['﻿' + content], { type: mime + ';charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

function toCSV(rows) {
  return rows.map(r =>
    r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')
  ).join('\n');
}

// ─── AutomationFormDialog ─────────────────────────────────────────────────────

function AutomationFormDialog({ open, onClose, editing, coachEmail, onSaved }) {
  const [form, setForm] = useState(() =>
    editing ? {
      name:             editing.name,
      trigger_type:     editing.trigger_type,
      message_template: editing.message_template,
      target_type:      editing.target_type      || 'all',
      target_phone:     editing.target_phone      || '',
      schedule_config:  editing.schedule_config   || '',
      consent_category: editing.consent_category  || 'whatsapp_reminder',
      enabled:          editing.enabled            || false,
      cooldown_hours:   editing.cooldown_hours     ?? 24,
    } : { ...EMPTY_FORM }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        ...form,
        coach_email:    coachEmail,
        cooldown_hours: Number(form.cooldown_hours) || 24,
        target_phone:   form.target_type === 'one' ? form.target_phone : null,
      };
      return editing?.id
        ? base44.entities.WhatsAppAutomation.update(editing.id, data)
        : base44.entities.WhatsAppAutomation.create(data);
    },
    onSuccess: () => { toast.success(editing ? 'אוטומציה עודכנה' : 'אוטומציה נוצרה'); onSaved(); onClose(); },
    onError:   (e) => toast.error('שגיאה: ' + e.message),
  });

  const previewText = renderPreview(form.message_template);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Zap className="w-5 h-5 text-teal-500" />
            {editing ? 'עריכת אוטומציה' : 'אוטומציה חדשה'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mt-2">
          {/* Left column */}
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold text-slate-600">שם האוטומציה *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="תזכורת אימון יומית" className="mt-1" />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600">סוג טריגר</Label>
              <Select value={form.trigger_type} onValueChange={v => set('trigger_type', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600">יעד שליחה</Label>
              <Select value={form.target_type} onValueChange={v => set('target_type', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל המתאמנים</SelectItem>
                  <SelectItem value="one">מתאמן ספציפי (לפי טלפון)</SelectItem>
                </SelectContent>
              </Select>
              {form.target_type === 'one' && (
                <Input value={form.target_phone} onChange={e => set('target_phone', e.target.value)}
                  placeholder="+972XXXXXXXXX" className="mt-2 font-mono" dir="ltr" />
              )}
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600">קטגוריית הסכמה</Label>
              <Select value={form.consent_category} onValueChange={v => set('consent_category', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONSENT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600">Cooldown בין שליחות (שעות)</Label>
              <Input type="number" min={0} value={form.cooldown_hours} onChange={e => set('cooldown_hours', e.target.value)} className="mt-1 w-28" />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <p className="text-sm font-semibold text-slate-700">פעיל</p>
                <p className="text-xs text-slate-400">הפעל את האוטומציה</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={v => set('enabled', v)} />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold text-slate-600">תוכן ההודעה *</Label>
              <Textarea value={form.message_template} onChange={e => set('message_template', e.target.value)}
                placeholder="הזן טקסט ההודעה..." rows={6} className="mt-1 font-mono text-sm" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs text-slate-400">הוסף משתנה:</span>
                {VARIABLE_HINTS.map(v => (
                  <button key={v.var} type="button" title={v.desc}
                    onClick={() => set('message_template', form.message_template + v.var)}
                    className="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 font-mono">
                    {v.var}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-green-700 mb-1 flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" /> תצוגה מקדימה (מתאמן לדוגמה)
              </p>
              <pre className="text-xs text-green-800 whitespace-pre-wrap font-sans leading-relaxed">{previewText}</pre>
            </div>

            {form.trigger_type === 'custom_scheduled' && (
              <div>
                <Label className="text-xs font-semibold text-slate-600">תצורת לוח זמנים (JSON)</Label>
                <Textarea value={form.schedule_config} onChange={e => set('schedule_config', e.target.value)}
                  placeholder='{"time":"20:00","days":[0,1,2,3,4]}' rows={2}
                  className="mt-1 font-mono text-xs" dir="ltr" />
                <p className="text-xs text-slate-400 mt-1">ימים: 0=ראשון, 1=שני... 6=שבת</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-3 border-t border-slate-100 mt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">ביטול</Button>
          <Button onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.name.trim() || !form.message_template.trim()}
            className="flex-1 text-white" style={{ backgroundColor: '#14b8a6' }}>
            {saveMutation.isPending ? 'שומר...' : editing ? 'שמור שינויים' : 'צור אוטומציה'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── ValidationPanel ──────────────────────────────────────────────────────────

function ValidationPanel({ open, onClose, automation, onTestSend }) {
  const [testPhone, setTestPhone] = useState('0535716559');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult]   = useState(null);
  const [checkDone, setCheckDone]     = useState(false);

  if (!automation) return null;

  const meta      = getTriggerMeta(automation.trigger_type);
  const schedule  = parseSchedule(automation.schedule_config);
  const preview   = renderPreview(automation.message_template);
  const links     = extractLinks(automation.message_template);
  const normPhone = automation.target_type === 'one'
    ? normalizePhone(automation.target_phone)
    : normPhone;

  const minute         = new Date().toISOString().slice(0, 16);
  const idempKey       = `automation:${automation.id}:test:${minute}`;
  const consentField   = automation.consent_category + '_enabled';
  const hasScheduleTime = schedule.time;

  const checks = [
    { label: 'שם האוטומציה',        ok: !!automation.name,              detail: automation.name },
    { label: 'טריגר מוגדר',         ok: !!automation.trigger_type,      detail: meta.label },
    { label: 'תוכן הודעה קיים',     ok: !!automation.message_template,  detail: `${automation.message_template.length} תווים` },
    { label: 'יעד שליחה',           ok: true,                           detail: automation.target_type === 'all' ? 'כל המתאמנים' : (automation.target_phone || 'לא הוגדר') },
    { label: 'קטגוריית הסכמה',      ok: !!automation.consent_category,  detail: automation.consent_category },
    { label: 'Cooldown מוגדר',       ok: (automation.cooldown_hours || 0) > 0, detail: `${automation.cooldown_hours} שעות בין שליחות` },
    { label: 'הסכמת מתאמן נדרשת',   ok: true,                           detail: `שדה: ${consentField} = true` },
  ];

  const allChecksPassed = checks.every(c => c.ok);

  const handleTestSend = async () => {
    if (!testPhone.trim()) { toast.error('הכנס מספר טלפון'); return; }
    setTestLoading(true);
    setTestResult(null);
    try {
      const res  = await base44.functions.invoke('testAutomationFromBuilder', {
        automation_id: automation.id,
        test_phone:    testPhone.trim(),
      });
      const data = res?.data || {};
      setTestResult(data);
      setCheckDone(true);
      if (res?.ok && data.queue_id) {
        toast.success(`✅ הודעה נשלחה — Queue ID: ${data.queue_id.slice(-8)}`);
        onTestSend?.();
      } else {
        toast.error('❌ ' + (res?.error || data.error || 'שגיאה'));
      }
    } catch (e) {
      toast.error('שגיאה: ' + e.message);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Shield className="w-5 h-5 text-blue-500" />
            ולידציה — {automation.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Checklist */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 border-b border-slate-200">
              בדיקות מקדימות
            </div>
            {checks.map((c, i) => (
              <div key={i} className={`flex items-center justify-between px-3 py-2 text-xs border-b border-slate-100 last:border-0 ${c.ok ? '' : 'bg-red-50'}`}>
                <div className="flex items-center gap-2">
                  {c.ok
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <XCircle     className="w-4 h-4 text-red-500 flex-shrink-0" />}
                  <span className={c.ok ? 'text-slate-700' : 'text-red-700 font-semibold'}>{c.label}</span>
                </div>
                <span className="text-slate-400 font-mono">{c.detail}</span>
              </div>
            ))}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            <InfoBox icon={<Zap className="w-3.5 h-3.5" />} label="תנאי טריגר" value={meta.label} />
            <InfoBox icon={<Clock className="w-3.5 h-3.5" />} label="זמן שליחה צפוי"
              value={hasScheduleTime ? schedule.time : (automation.trigger_type === 'manual_test' ? 'ידני בלבד' : 'מבוסס אירוע')} />
            <InfoBox icon={<Shield className="w-3.5 h-3.5" />} label="חלון Idempotency"
              value={`${automation.cooldown_hours}h — מפתח: ...${idempKey.slice(-18)}`} />
            <InfoBox icon={<Phone className="w-3.5 h-3.5" />} label="נרמול טלפון"
              value={automation.target_type === 'all' ? 'E.164 אוטומטי לכל מתאמן' : (normPhone || 'לא הוגדר')} />
            <InfoBox icon={<Database className="w-3.5 h-3.5" />} label="נתיב Queue"
              value="WhatsAppQueue → Worker → Green API" />
            <InfoBox icon={<Users className="w-3.5 h-3.5" />} label="הסכמה"
              value={`נדרש: ${consentField} = true`} />
          </div>

          {/* Message preview */}
          <div className="border border-green-200 rounded-xl overflow-hidden">
            <div className="bg-green-50 px-3 py-2 text-xs font-bold text-green-700 border-b border-green-200 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> תצוגה מקדימה מדויקת (מתאמן לדוגמה: ישראל ישראלי)
            </div>
            <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed p-3 bg-white">{preview}</pre>
            {links.length > 0 && (
              <div className="px-3 py-2 bg-blue-50 border-t border-blue-100 text-xs text-blue-700 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>קישורים בהודעה: {links.map((l, i) => <span key={i} className="font-mono bg-blue-100 px-1 rounded ml-1">{l.slice(0, 40)}{l.length > 40 ? '...' : ''}</span>)}</span>
              </div>
            )}
          </div>

          {/* Test send */}
          <div className="border border-slate-200 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-slate-700">שלח בדיקת WhatsApp</p>
            <div className="flex gap-2">
              <Input value={testPhone} onChange={e => setTestPhone(e.target.value)}
                placeholder="0535716559" dir="ltr" className="font-mono text-sm flex-1" />
              <Button onClick={handleTestSend} disabled={testLoading}
                className="text-white shrink-0" style={{ backgroundColor: '#14b8a6' }}>
                {testLoading ? '⏳ שולח...' : <><Play className="w-4 h-4 ml-1" />שלח טסט</>}
              </Button>
            </div>
            {testResult && (
              <div className={`rounded-lg p-3 text-xs border ${testResult.queue_id ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {testResult.queue_id ? (
                  <>
                    <div className="font-bold mb-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> הודעה נכנסה לתור ונשלחה</div>
                    <div>Queue ID: <span className="font-mono">{testResult.queue_id.slice(-12)}</span></div>
                    <div>Worker: processed={testResult.worker?.processed}, failed={testResult.worker?.failed}</div>
                    {testResult.duplicate && <div className="text-amber-600 mt-1">⚠️ כפיל — כבר נשלח בדקה זו (Idempotency חסם)</div>}
                  </>
                ) : (
                  <div className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {testResult.error || 'שגיאה בשליחה'}</div>
                )}
              </div>
            )}
          </div>

          {/* Result verdict */}
          <div className={`rounded-xl p-3 flex items-center gap-3 border ${allChecksPassed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            {allChecksPassed
              ? <><CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" /><p className="text-sm font-semibold text-green-700">כל הבדיקות עברו — האוטומציה מוכנה להפעלה</p></>
              : <><XCircle     className="w-5 h-5 text-red-600 flex-shrink-0"   /><p className="text-sm font-semibold text-red-700">יש בעיות שצריך לתקן לפני הפעלה</p></>
            }
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">סגור</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoBox({ icon, label, value }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-0.5">
        {icon}<span>{label}</span>
      </div>
      <p className="text-xs font-semibold text-slate-800 font-mono truncate">{value}</p>
    </div>
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
  const sentCount   = sorted.filter(q => q.status === 'sent').length;
  const failedCount = sorted.filter(q => q.status === 'failed').length;

  const handleExport = () => {
    const rows = [
      ['שם', 'טלפון', 'סטטוס', 'הודעה', 'Queue ID', 'נשלח ב', 'שגיאה'],
      ...sorted.map(q => [
        q.to_name || '', q.to_phone_e164, q.status,
        q.rendered_text?.slice(0, 80) || '', q.id,
        q.sent_at ? fmtDate(q.sent_at) : '', q.error || '',
      ]),
    ];
    downloadBlob(toCSV(rows), `history-${automation?.name}-${Date.now()}.csv`, 'text/csv');
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <History className="w-5 h-5 text-slate-500" />
            היסטוריית שליחות — {automation?.name}
          </DialogTitle>
        </DialogHeader>

        {/* Stats bar */}
        <div className="flex gap-4 text-center mt-1">
          <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-2">
            <p className="text-lg font-bold text-green-700">{sentCount}</p>
            <p className="text-xs text-green-600">נשלחו</p>
          </div>
          <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-2">
            <p className="text-lg font-bold text-red-700">{failedCount}</p>
            <p className="text-xs text-red-600">נכשלו</p>
          </div>
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2">
            <p className="text-lg font-bold text-slate-700">{sorted.length}</p>
            <p className="text-xs text-slate-500">סה"כ</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} className="self-center gap-1 text-xs">
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        </div>

        {isLoading ? (
          <p className="text-center text-slate-400 py-8">טוען...</p>
        ) : sorted.length === 0 ? (
          <p className="text-center text-slate-400 py-8">אין שליחות עדיין</p>
        ) : (
          <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">טלפון</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">שם</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">סטטוס</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">הודעה (תצוגה)</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">Queue ID</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">נשלח ב</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">שגיאה</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(q => (
                  <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono">{q.to_phone_e164}</td>
                    <td className="px-3 py-2">{q.to_name || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        q.status === 'sent'    ? 'bg-green-100 text-green-700' :
                        q.status === 'failed'  ? 'bg-red-100 text-red-700'    :
                        q.status === 'sending' ? 'bg-blue-100 text-blue-700'  : 'bg-slate-100 text-slate-600'
                      }`}>{q.status}</span>
                    </td>
                    <td className="px-3 py-2 max-w-[180px] truncate text-slate-500">{q.rendered_text?.slice(0, 55)}...</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{q.id.slice(-8)}</td>
                    <td className="px-3 py-2 text-slate-400">{fmtDate(q.sent_at || q.created_at)}</td>
                    <td className="px-3 py-2 text-red-500 max-w-[120px] truncate">{q.error || '—'}</td>
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

// ─── AutomationsTable ─────────────────────────────────────────────────────────

function StatusChip({ enabled }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
      enabled ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-green-500' : 'bg-slate-400'}`} />
      {enabled ? 'פעיל' : 'כבוי'}
    </span>
  );
}

function AutomationsTable({
  automations, queueStatsMap, onEdit, onDelete, onToggle,
  onValidate, onHistory, coachEmail,
}) {
  const [expandedRows, setExpandedRows] = useState(new Set());
  const toggleRow = (id) => setExpandedRows(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  if (automations.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl bg-white">
        <Zap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium text-sm">אין אוטומציות התואמות לחיפוש</p>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '28px' }} />
          <col style={{ width: '180px' }} />
          <col style={{ width: '160px' }} />
          <col style={{ width: '100px' }} />
          <col style={{ width: '80px' }} />
          <col style={{ width: '220px' }} />
          <col style={{ width: '80px' }} />
          <col style={{ width: '60px' }} />
          <col style={{ width: '60px' }} />
          <col style={{ width: '130px' }} />
          <col style={{ width: '80px' }} />
          <col style={{ width: '150px' }} />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-800 text-white text-xs">
            <th className="px-2 py-2.5"></th>
            <th className="text-right px-3 py-2.5 font-semibold">שם האוטומציה</th>
            <th className="text-right px-3 py-2.5 font-semibold">סוג טריגר</th>
            <th className="text-right px-3 py-2.5 font-semibold">זמן שליחה</th>
            <th className="text-right px-3 py-2.5 font-semibold">ימים</th>
            <th className="text-right px-3 py-2.5 font-semibold">הודעה / תבנית</th>
            <th className="text-right px-3 py-2.5 font-semibold">קישורים</th>
            <th className="text-right px-3 py-2.5 font-semibold">נשלחו</th>
            <th className="text-right px-3 py-2.5 font-semibold">נכשלו</th>
            <th className="text-right px-3 py-2.5 font-semibold">ריצה אחרונה</th>
            <th className="text-right px-3 py-2.5 font-semibold">סטטוס</th>
            <th className="text-right px-3 py-2.5 font-semibold">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {automations.map((a, idx) => {
            const meta     = getTriggerMeta(a.trigger_type);
            const schedule = parseSchedule(a.schedule_config);
            const stats    = queueStatsMap[a.id] || { sent: 0, failed: 0, queued: 0 };
            const links    = extractLinks(a.message_template);
            const expanded = expandedRows.has(a.id);
            const isEven   = idx % 2 === 0;

            return (
              <React.Fragment key={a.id}>
                <tr
                  className={`border-b border-slate-100 hover:bg-teal-50/40 transition-colors cursor-pointer ${isEven ? 'bg-white' : 'bg-slate-50/50'}`}
                  onClick={() => toggleRow(a.id)}
                >
                  {/* Expand */}
                  <td className="px-2 py-2.5 text-center">
                    {expanded
                      ? <ChevronDown className="w-4 h-4 text-slate-400 mx-auto" />
                      : <ChevronRight className="w-4 h-4 text-slate-400 mx-auto" />}
                  </td>

                  {/* Name */}
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-slate-800 truncate">{a.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {a.target_type === 'all' ? 'כל המתאמנים' : (a.target_phone || 'ספציפי')}
                    </p>
                  </td>

                  {/* Trigger */}
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${TRIGGER_BADGE_CLASSES[meta.category]}`}>
                      {meta.label}
                    </span>
                  </td>

                  {/* Time */}
                  <td className="px-3 py-2.5 text-xs text-slate-600 font-mono">
                    {schedule.time || '—'}
                  </td>

                  {/* Days */}
                  <td className="px-3 py-2.5">
                    {(schedule.days?.length > 0) ? (
                      <div className="flex flex-wrap gap-0.5">
                        {schedule.days.map(d => (
                          <span key={d} className="text-xs bg-slate-200 text-slate-600 rounded px-1">{DAYS_SHORT[d]}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">כל יום</span>
                    )}
                  </td>

                  {/* Message preview */}
                  <td className="px-3 py-2.5">
                    <p className="text-xs text-slate-600 truncate font-mono leading-relaxed">
                      {a.message_template.slice(0, 55)}{a.message_template.length > 55 ? '...' : ''}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Cooldown: {a.cooldown_hours}h</p>
                  </td>

                  {/* Links */}
                  <td className="px-3 py-2.5 text-center">
                    {links.length > 0
                      ? <span className="inline-flex items-center gap-1 text-xs text-blue-600"><FileText className="w-3 h-3" />{links.length}</span>
                      : <span className="text-xs text-slate-300">—</span>}
                  </td>

                  {/* Sent */}
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-sm font-bold ${stats.sent > 0 ? 'text-green-700' : 'text-slate-400'}`}>{stats.sent}</span>
                  </td>

                  {/* Failed */}
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-sm font-bold ${stats.failed > 0 ? 'text-red-600' : 'text-slate-400'}`}>{stats.failed}</span>
                  </td>

                  {/* Last run */}
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-slate-500">{fmtDate(a.last_run_at)}</span>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <Switch checked={!!a.enabled} onCheckedChange={() => onToggle(a)} />
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 flex-wrap">
                      <button onClick={() => onValidate(a)} title="ולידציה"
                        className="p-1.5 rounded hover:bg-blue-100 text-blue-500 transition-colors">
                        <Shield className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onHistory(a)} title="היסטוריה"
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors">
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onEdit(a)} title="עריכה"
                        className="p-1.5 rounded hover:bg-teal-100 text-teal-600 transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onDelete(a.id)} title="מחיקה"
                        className="p-1.5 rounded hover:bg-red-100 text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Expanded row */}
                {expanded && (
                  <tr className={isEven ? 'bg-white' : 'bg-slate-50/50'}>
                    <td colSpan={12} className="px-6 py-4 border-b border-slate-100">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs font-bold text-slate-600 mb-1">תצוגה מקדימה מלאה</p>
                          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans bg-green-50 border border-green-200 rounded-lg p-2.5 leading-relaxed">
                            {renderPreview(a.message_template)}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-600 mb-1">פרטי קונפיגורציה</p>
                          <div className="space-y-1.5">
                            <ConfigLine label="ID" value={a.id.slice(-12)} />
                            <ConfigLine label="הסכמה" value={a.consent_category} />
                            <ConfigLine label="Cooldown" value={`${a.cooldown_hours} שעות`} />
                            <ConfigLine label="יעד" value={a.target_type === 'all' ? 'כל המתאמנים' : a.target_phone} />
                            {a.schedule_config && <ConfigLine label="Schedule JSON" value={a.schedule_config} />}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-600 mb-1">סטטיסטיקות מהתור</p>
                          <div className="grid grid-cols-3 gap-2">
                            <StatCell label="נשלחו" value={stats.sent} color="text-green-700" bg="bg-green-50" />
                            <StatCell label="נכשלו" value={stats.failed} color="text-red-600" bg="bg-red-50" />
                            <StatCell label="בתור" value={stats.queued} color="text-blue-600" bg="bg-blue-50" />
                          </div>
                          <div className="mt-2 space-y-1">
                            <ConfigLine label="נוצר" value={fmtDate(a.created_at)} />
                            <ConfigLine label="עודכן" value={fmtDate(a.updated_at)} />
                          </div>
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
  );
}

function ConfigLine({ label, value }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-slate-400 shrink-0 w-20">{label}:</span>
      <span className="text-slate-700 font-mono break-all">{value || '—'}</span>
    </div>
  );
}

function StatCell({ label, value, color, bg }) {
  return (
    <div className={`${bg} rounded-lg p-2 text-center`}>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

// ─── ReportsTab ───────────────────────────────────────────────────────────────

function ReportsTab({ automations, queueItems, coachEmail }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const totalSent   = queueItems.filter(q => q.status === 'sent').length;
  const totalFailed = queueItems.filter(q => q.status === 'failed').length;
  const totalQueued = queueItems.filter(q => q.status === 'queued').length;

  const automationMap = useMemo(() => {
    const m = {};
    automations.forEach(a => { m[a.id] = a; });
    return m;
  }, [automations]);

  const buildQueueRows = (items) => [
    ['שם מתאמן', 'טלפון', 'שם אוטומציה', 'סוג טריגר', 'טקסט הודעה', 'Queue ID', 'Green idMessage', 'סטטוס', 'נשלח ב', 'סיבת כישלון', 'כפיל'],
    ...items.map(q => {
      const auto = automationMap[q.context_id] || {};
      return [
        q.to_name || '', q.to_phone_e164,
        auto.name || '', auto.trigger_type || q.context_type || '',
        q.rendered_text || '',
        q.id, q.provider_message_id || '',
        q.status,
        q.sent_at ? new Date(q.sent_at).toISOString() : '',
        q.error || '',
        '',
      ];
    }),
  ];

  const buildAutomationsRows = () => [
    ['שם', 'טריגר', 'יעד', 'הסכמה', 'Cooldown (שעות)', 'פעיל', 'ריצה אחרונה', 'נוצר'],
    ...automations.map(a => [
      a.name, getTriggerMeta(a.trigger_type).label,
      a.target_type === 'all' ? 'כל המתאמנים' : (a.target_phone || 'ספציפי'),
      a.consent_category, a.cooldown_hours, a.enabled ? 'כן' : 'לא',
      a.last_run_at ? new Date(a.last_run_at).toISOString() : '',
      new Date(a.created_at).toISOString(),
    ]),
  ];

  const downloadSent = () => {
    const rows = buildQueueRows(queueItems.filter(q => q.status === 'sent'));
    downloadBlob(toCSV(rows), `sent-report-${Date.now()}.csv`, 'text/csv');
    toast.success('דוח שליחות הורד');
  };

  const downloadFailed = () => {
    const rows = buildQueueRows(queueItems.filter(q => q.status === 'failed'));
    downloadBlob(toCSV(rows), `failed-report-${Date.now()}.csv`, 'text/csv');
    toast.success('דוח נכשלים הורד');
  };

  const downloadAll = () => {
    const rows = buildQueueRows(queueItems);
    downloadBlob(toCSV(rows), `all-queue-report-${Date.now()}.csv`, 'text/csv');
    toast.success('דוח מלא הורד');
  };

  const downloadAutomationsReport = () => {
    const rows = buildAutomationsRows();
    downloadBlob(toCSV(rows), `automations-config-${Date.now()}.csv`, 'text/csv');
    toast.success('דוח אוטומציות הורד');
  };

  const downloadByDate = () => {
    let filtered = queueItems;
    if (dateFrom) filtered = filtered.filter(q => new Date(q.created_at) >= new Date(dateFrom));
    if (dateTo)   filtered = filtered.filter(q => new Date(q.created_at) <= new Date(dateTo + 'T23:59:59'));
    const rows = buildQueueRows(filtered);
    downloadBlob(toCSV(rows), `date-report-${dateFrom}-${dateTo}.csv`, 'text/csv');
    toast.success(`${filtered.length} רשומות הורדו`);
  };

  const downloadExcel = () => {
    const rows = buildQueueRows(queueItems);
    const tsv  = rows.map(r => r.join('\t')).join('\n');
    downloadBlob(tsv, `whatsapp-report-${Date.now()}.xls`, 'application/vnd.ms-excel');
    toast.success('קובץ Excel הורד (פתח עם Excel)');
  };

  return (
    <div className="space-y-6 py-2">
      {/* Stats overview */}
      <div className="grid grid-cols-4 gap-4">
        <BigStatCard label="סה״כ בתור" value={queueItems.length} color="text-slate-700" bg="bg-slate-50" border="border-slate-200" icon={<Database className="w-5 h-5 text-slate-400" />} />
        <BigStatCard label="נשלחו בהצלחה" value={totalSent} color="text-green-700" bg="bg-green-50" border="border-green-200" icon={<CheckCircle2 className="w-5 h-5 text-green-500" />} />
        <BigStatCard label="נכשלו" value={totalFailed} color="text-red-700" bg="bg-red-50" border="border-red-200" icon={<XCircle className="w-5 h-5 text-red-400" />} />
        <BigStatCard label="ממתינות לשליחה" value={totalQueued} color="text-blue-700" bg="bg-blue-50" border="border-blue-200" icon={<Clock className="w-5 h-5 text-blue-400" />} />
      </div>

      {/* Export buttons grid */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Download className="w-4 h-4" /> הורדות דוחות
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <ExportCard
            icon={<FileText className="w-5 h-5 text-slate-600" />}
            title="הורד CSV מלא"
            desc={`כל ${queueItems.length} הרשומות מהתור`}
            onClick={downloadAll}
            btnLabel="הורד CSV"
          />
          <ExportCard
            icon={<BarChart3 className="w-5 h-5 text-green-600" />}
            title="דוח שליחות"
            desc={`${totalSent} הודעות שנשלחו בהצלחה`}
            onClick={downloadSent}
            btnLabel="הורד דוח שליחות"
            color="green"
          />
          <ExportCard
            icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
            title="דוח נכשלים"
            desc={`${totalFailed} הודעות שנכשלו`}
            onClick={downloadFailed}
            btnLabel="הורד דוח נכשלים"
            color="red"
          />
          <ExportCard
            icon={<Zap className="w-5 h-5 text-teal-600" />}
            title="דוח אוטומציות"
            desc={`${automations.length} אוטומציות מוגדרות`}
            onClick={downloadAutomationsReport}
            btnLabel="הורד דוח אוטומציות"
            color="teal"
          />
          <ExportCard
            icon={<FileText className="w-5 h-5 text-blue-500" />}
            title="הורד Excel"
            desc="פורמט XLS לפתיחה ב-Excel"
            onClick={downloadExcel}
            btnLabel="הורד Excel"
            color="blue"
          />
          {/* Date range card */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-sm font-semibold text-slate-800">דוח לפי תאריכים</p>
                <p className="text-xs text-slate-400">בחר טווח תאריכים</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-xs h-8" dir="ltr" />
              <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="text-xs h-8" dir="ltr" />
            </div>
            <Button size="sm" onClick={downloadByDate} disabled={!dateFrom && !dateTo}
              className="w-full text-xs" variant="outline">
              <Download className="w-3.5 h-3.5 ml-1" /> הורד לפי תאריכים
            </Button>
          </div>
        </div>
      </div>

      {/* Column spec */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
          <Info className="w-3.5 h-3.5" /> עמודות בדוח הורדה
        </p>
        <div className="flex flex-wrap gap-1.5">
          {['שם מתאמן', 'טלפון', 'שם אוטומציה', 'סוג טריגר', 'טקסט הודעה', 'Queue ID', 'Green idMessage', 'סטטוס', 'נשלח ב', 'סיבת כישלון', 'כפיל'].map(col => (
            <span key={col} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs text-slate-600">{col}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function BigStatCard({ label, value, color, bg, border, icon }) {
  return (
    <div className={`${bg} border ${border} rounded-xl p-4 flex items-center gap-3`}>
      {icon}
      <div>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function ExportCard({ icon, title, desc, onClick, btnLabel, color = 'slate' }) {
  const colorMap = {
    green: 'hover:bg-green-600 bg-green-500',
    red:   'hover:bg-red-600 bg-red-500',
    teal:  'hover:bg-teal-600 bg-teal-500',
    blue:  'hover:bg-blue-600 bg-blue-500',
    slate: 'hover:bg-slate-700 bg-slate-600',
  };
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col gap-3">
      <div className="flex items-start gap-2">
        {icon}
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-xs text-slate-400">{desc}</p>
        </div>
      </div>
      <button onClick={onClick}
        className={`mt-auto text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 justify-center ${colorMap[color]}`}>
        <Download className="w-3.5 h-3.5" /> {btnLabel}
      </button>
    </div>
  );
}

// ─── AirboxTab ────────────────────────────────────────────────────────────────

function AirboxTab() {
  return (
    <div className="space-y-5 py-2">
      {/* Status */}
      <div className="flex items-center gap-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <WifiOff className="w-8 h-8 text-amber-500 flex-shrink-0" />
        <div>
          <p className="font-bold text-amber-800 text-sm">Airbox — לא מחובר</p>
          <p className="text-xs text-amber-700 mt-0.5">
            לא הוגדרו פרטי API לחיבור למערכת Airbox. ראה דרישות להלן.
          </p>
        </div>
        <div className="mr-auto">
          <span className="px-3 py-1 bg-amber-100 border border-amber-300 text-amber-700 text-xs font-semibold rounded-full">
            NOT CONFIGURED
          </span>
        </div>
      </div>

      {/* Required credentials */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-800 text-white px-4 py-2.5 text-sm font-bold flex items-center gap-2">
          <Settings className="w-4 h-4" /> פרטי API נדרשים לחיבור Airbox
        </div>
        <div className="divide-y divide-slate-100">
          {[
            { key: 'AIRBOX_API_URL',    label: 'כתובת API',      example: 'https://api.airboxapp.com/v1', desc: 'כתובת הבסיס של Airbox API' },
            { key: 'AIRBOX_API_KEY',    label: 'מפתח API',       example: 'ab_live_xxxxxxxxxxxx',         desc: 'מפתח API מחשבון Airbox שלך' },
            { key: 'AIRBOX_GYM_ID',     label: 'מזהה מכון',      example: '12345',                        desc: 'מזהה המכון/עסק ב-Airbox' },
            { key: 'AIRBOX_WEBHOOK_SECRET', label: 'Webhook Secret', example: 'whsec_xxxxxxxxxxxx',        desc: 'לאימות Webhook מ-Airbox (אופציונלי)' },
          ].map(cred => (
            <div key={cred.key} className="px-4 py-3 flex items-start gap-4">
              <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-mono shrink-0 w-52">{cred.key}</code>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-700">{cred.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{cred.desc}</p>
                <p className="text-xs text-slate-300 font-mono mt-0.5">דוגמה: {cred.example}</p>
              </div>
              <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded font-medium shrink-0">חסר</span>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
          הוסף את הפרטים הנ״ל לקובץ <code className="bg-slate-200 px-1 rounded">.env</code> בשרת ו-deploy מחדש כדי להפעיל את חיבור Airbox.
        </div>
      </div>

      {/* Placeholder action buttons */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3">פעולות Airbox (יופעלו לאחר חיבור)</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'ייבא דוחות מ-Airbox',  icon: <Download className="w-4 h-4" />,  desc: 'ייבוא נתוני מתאמנים ודוחות מ-Airbox' },
            { label: 'הורד דוח',              icon: <FileText className="w-4 h-4" />,  desc: 'הורדת דוח עדכני מ-Airbox' },
            { label: 'סנכרן עכשיו',           icon: <RefreshCw className="w-4 h-4" />, desc: 'סנכרון מיידי של נתונים מ-Airbox' },
            { label: 'הגדרות Airbox',         icon: <Settings className="w-4 h-4" />,  desc: 'ניהול הגדרות חיבור Airbox' },
          ].map(action => (
            <div key={action.label} className="border border-slate-200 rounded-xl p-4 bg-white opacity-60">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                  {action.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{action.label}</p>
                  <p className="text-xs text-slate-400">{action.desc}</p>
                </div>
              </div>
              <button disabled
                className="w-full text-xs font-medium px-3 py-2 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200 flex items-center justify-center gap-1.5">
                {action.icon}
                {action.label}
                <span className="mr-auto text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded">מחובר בקרוב</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Last sync placeholder */}
      <div className="border border-slate-200 rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">סנכרון אחרון</p>
            <p className="text-xs text-slate-400 mt-0.5">לא בוצע סנכרון — Airbox לא מחובר</p>
          </div>
          <span className="text-xs text-slate-300">—</span>
        </div>
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-700 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            לאחר חיבור Airbox, ניתן לייבא רשימות מתאמנים, דוחות נוכחות, וסטטיסטיקות ישירות לפאנל האוטומציות.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WhatsAppAutomations() {
  const queryClient = useQueryClient();

  // Dialog state
  const [showForm,       setShowForm]       = useState(false);
  const [editing,        setEditing]        = useState(null);
  const [validating,     setValidating]     = useState(null);
  const [historyAuto,    setHistoryAuto]    = useState(null);

  // Toolbar state
  const [search,         setSearch]         = useState('');
  const [filterTrigger,  setFilterTrigger]  = useState('all');
  const [filterStatus,   setFilterStatus]   = useState('all');

  // Queries
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn:  () => base44.auth.me(),
  });

  const { data: automations = [], isLoading, refetch } = useQuery({
    queryKey: ['whatsappAutomations', user?.email],
    queryFn:  () => base44.entities.WhatsAppAutomation.filter({ coach_email: user?.email }),
    enabled:  !!user?.email,
  });

  const { data: queueItems = [] } = useQuery({
    queryKey: ['whatsappQueue', user?.email],
    queryFn:  () => base44.entities.WhatsAppMessageQueue.filter({ coach_email: user?.email }),
    enabled:  !!user?.email,
    staleTime: 30000,
  });

  const { data: waStatus } = useQuery({
    queryKey: ['waStatus'],
    queryFn:  () => base44.functions.invoke('testWhatsAppConnection', {}),
    staleTime: 60000,
  });
  const waConnected = waStatus?.data?.connected;

  // Aggregated queue stats per automation
  const queueStatsMap = useMemo(() => {
    const map = {};
    queueItems.forEach(q => {
      if (!q.context_id) return;
      if (!map[q.context_id]) map[q.context_id] = { sent: 0, failed: 0, queued: 0 };
      if (q.status === 'sent')   map[q.context_id].sent++;
      if (q.status === 'failed') map[q.context_id].failed++;
      if (q.status === 'queued' || q.status === 'sending') map[q.context_id].queued++;
    });
    return map;
  }, [queueItems]);

  // Filtered automations
  const filtered = useMemo(() => {
    return automations.filter(a => {
      if (filterTrigger !== 'all' && a.trigger_type !== filterTrigger) return false;
      if (filterStatus  === 'active'   && !a.enabled)  return false;
      if (filterStatus  === 'inactive' && a.enabled)   return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase()) &&
          !a.message_template.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [automations, filterTrigger, filterStatus, search]);

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.WhatsAppAutomation.delete(id),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ['whatsappAutomations'] }); toast.success('אוטומציה נמחקה'); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.WhatsAppAutomation.update(id, { enabled: !enabled }),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['whatsappAutomations'] }),
  });

  // Guard
  if (user && user.role !== 'admin' && user.role !== 'coach') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <p className="text-slate-500">אין הרשאה לצפייה בדף זה.</p>
      </div>
    );
  }

  const enabledCount  = automations.filter(a => a.enabled).length;
  const totalSent     = queueItems.filter(q => q.status === 'sent').length;

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-teal-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">לוח אוטומציות WhatsApp</h1>
              <p className="text-xs text-slate-500">
                {automations.length} אוטומציות מוגדרות &bull; {enabledCount} פעילות &bull; {totalSent} הודעות נשלחו
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* WA Status pill */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
              waConnected ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              {waConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {waConnected ? 'Green API מחובר' : 'WhatsApp לא מחובר'}
              <button onClick={() => refetch()} className="hover:opacity-70">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            <Button onClick={() => { setEditing(null); setShowForm(true); }}
              className="gap-1.5 text-white text-sm" style={{ backgroundColor: '#14b8a6' }}>
              <Plus className="w-4 h-4" /> אוטומציה חדשה
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-screen-2xl mx-auto px-6 py-5">
        <Tabs defaultValue="automations">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-white border border-slate-200 shadow-sm">
              <TabsTrigger value="automations" className="gap-1.5 text-sm">
                <Zap className="w-4 h-4" /> אוטומציות
                {automations.length > 0 && (
                  <span className="mr-1 px-1.5 py-0.5 bg-teal-100 text-teal-700 text-xs rounded-full font-bold">{automations.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="reports" className="gap-1.5 text-sm">
                <BarChart3 className="w-4 h-4" /> דוחות
              </TabsTrigger>
              <TabsTrigger value="airbox" className="gap-1.5 text-sm">
                <Database className="w-4 h-4" /> Airbox
                <span className="mr-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-bold">!</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── Automations Tab ───────────────────────────── */}
          <TabsContent value="automations">
            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="חיפוש לפי שם / הודעה..."
                  className="pr-9 text-sm h-9"
                />
              </div>

              <Select value={filterTrigger} onValueChange={setFilterTrigger}>
                <SelectTrigger className="w-48 h-9 text-sm">
                  <SelectValue placeholder="כל הטריגרים" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הטריגרים</SelectItem>
                  {TRIGGER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הסטטוסים</SelectItem>
                  <SelectItem value="active">פעיל בלבד</SelectItem>
                  <SelectItem value="inactive">כבוי בלבד</SelectItem>
                </SelectContent>
              </Select>

              {(search || filterTrigger !== 'all' || filterStatus !== 'all') && (
                <Button variant="ghost" size="sm" className="text-slate-400 text-xs"
                  onClick={() => { setSearch(''); setFilterTrigger('all'); setFilterStatus('all'); }}>
                  <XCircle className="w-3.5 h-3.5 ml-1" /> נקה
                </Button>
              )}

              <div className="mr-auto flex items-center gap-2 text-xs text-slate-400">
                <span>{filtered.length} מתוך {automations.length}</span>
              </div>
            </div>

            {/* Queue info bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 mb-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>
                כל שליחה עוברת: <strong>Queue</strong> → <strong>Worker</strong> → <strong>Green API</strong>.
                כפיל נחסם ע״י Idempotency key. הסכמת מתאמן נבדקת לפני כל שליחה.
              </span>
            </div>

            {isLoading ? (
              <div className="text-center py-16 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                טוען אוטומציות...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <AutomationsTable
                  automations={filtered}
                  queueStatsMap={queueStatsMap}
                  coachEmail={user?.email}
                  onEdit={(a)    => { setEditing(a);    setShowForm(true);   }}
                  onDelete={(id) => { if (confirm('למחוק את האוטומציה?')) deleteMutation.mutate(id); }}
                  onToggle={(a)  => toggleMutation.mutate({ id: a.id, enabled: a.enabled })}
                  onValidate={(a) => setValidating(a)}
                  onHistory={(a)  => setHistoryAuto(a)}
                />
              </div>
            )}
          </TabsContent>

          {/* ── Reports Tab ───────────────────────────────── */}
          <TabsContent value="reports">
            <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-sm">
              <ReportsTab
                automations={automations}
                queueItems={queueItems}
                coachEmail={user?.email}
              />
            </div>
          </TabsContent>

          {/* ── Airbox Tab ────────────────────────────────── */}
          <TabsContent value="airbox">
            <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-sm">
              <AirboxTab />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      {showForm && (
        <AutomationFormDialog
          open={showForm}
          onClose={() => { setShowForm(false); setEditing(null); }}
          editing={editing}
          coachEmail={user?.email}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['whatsappAutomations'] })}
        />
      )}

      {validating && (
        <ValidationPanel
          open={!!validating}
          onClose={() => setValidating(null)}
          automation={validating}
          coachEmail={user?.email}
          onTestSend={() => queryClient.invalidateQueries({ queryKey: ['whatsappQueue'] })}
        />
      )}

      {historyAuto && (
        <HistoryDialog
          open={!!historyAuto}
          onClose={() => setHistoryAuto(null)}
          automation={historyAuto}
        />
      )}
    </div>
  );
}
