/**
 * AutomationEditorDrawer — professional automation builder for FitCoach.
 *
 * Width: ~820px on desktop, full-width on mobile.
 * Four clear sections with sticky section-nav:
 *   1. מתי שולחים? — name, trigger, schedule, cooldown
 *   2. למי שולחים? — audience / member picker
 *   3. מה שולחים?  — message editor with live preview
 *   4. מה קורה אחר כך? — follow-up sequence
 */
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  X, Save, Trash2, Copy, Users, Search, AlertTriangle,
} from 'lucide-react';
import MessageVariationEditor from './MessageVariationEditor';
import FollowUpEditor from './FollowUpEditor';

// ── Trigger meta ───────────────────────────────────────────────────────────────
const TRIGGER_META = {
  no_attendance:        { label: 'לא ביקר במכון',     icon: '🏃', desc: 'חבר לא ביקר במכון N ימים' },
  consecutive_absences: { label: 'היעדרויות רצופות',   icon: '📉', desc: 'N ביטולים/no-show רצופים' },
  birthday:             { label: 'יום הולדת',          icon: '🎂', desc: 'ביום הולדת החבר' },
  package_expiry:       { label: 'מנוי עומד לפוג',      icon: '⏰', desc: 'N ימים לפני פקיעת המנוי' },
  remaining_sessions:   { label: 'מפגשים נותרו',       icon: '🎯', desc: 'כשנשארו N מפגשים' },
  class_reminder:       { label: 'תזכורת שיעור',       icon: '📅', desc: 'N דקות לפני תחילת שיעור' },
  exact_date:           { label: 'תאריך ספציפי',       icon: '📌', desc: 'שולח בתאריך מסוים' },
  weekday_time:         { label: 'ימים ושעה קבועים',   icon: '📆', desc: 'שולח בימים ובשעה מסוימים' },
  manual_test:          { label: 'בדיקה ידנית',        icon: '🧪', desc: '' },
};

const DAYS_HE    = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function parseTriggerConfig(raw) {
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ number, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className="w-8 h-8 rounded-full bg-teal-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 shadow-sm">
        {number}
      </span>
      <div>
        <h3 className="font-bold text-slate-900 text-base leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Trigger config editor ──────────────────────────────────────────────────────
function TriggerConfigEditor({ triggerType, config, onChange }) {
  const update = (key, val) => onChange({ ...config, [key]: val });

  if (triggerType === 'no_attendance') return (
    <div className="flex items-center gap-2 mt-3">
      <span className="text-sm text-slate-600">שלח כאשר חבר לא ביקר במשך</span>
      <Input type="number" min={1} max={365} value={config.threshold_days ?? 7}
        onChange={e => update('threshold_days', Number(e.target.value))} className="w-20 text-center" />
      <span className="text-sm text-slate-600">ימים</span>
    </div>
  );

  if (triggerType === 'consecutive_absences') return (
    <div className="flex items-center gap-2 mt-3">
      <span className="text-sm text-slate-600">שלח לאחר</span>
      <Input type="number" min={1} max={20} value={config.absence_count ?? 3}
        onChange={e => update('absence_count', Number(e.target.value))} className="w-20 text-center" />
      <span className="text-sm text-slate-600">היעדרויות רצופות</span>
    </div>
  );

  if (triggerType === 'package_expiry') return (
    <div className="flex items-center gap-2 mt-3">
      <span className="text-sm text-slate-600">שלח כאשר המנוי יפוג בעוד</span>
      <Input type="number" min={1} max={60} value={config.days_before_expiry ?? 7}
        onChange={e => update('days_before_expiry', Number(e.target.value))} className="w-20 text-center" />
      <span className="text-sm text-slate-600">ימים</span>
    </div>
  );

  if (triggerType === 'remaining_sessions') return (
    <div className="flex items-center gap-2 mt-3">
      <span className="text-sm text-slate-600">שלח כאשר נשארו</span>
      <Input type="number" min={1} max={20} value={config.remaining_sessions ?? 3}
        onChange={e => update('remaining_sessions', Number(e.target.value))} className="w-20 text-center" />
      <span className="text-sm text-slate-600">מפגשים או פחות</span>
    </div>
  );

  if (triggerType === 'class_reminder') return (
    <div className="space-y-3 mt-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">שלח</span>
        <Input type="number" min={5} max={1440} step={5} value={config.class_offset_minutes ?? 120}
          onChange={e => update('class_offset_minutes', Number(e.target.value))} className="w-20 text-center" />
        <span className="text-sm text-slate-600">דקות לפני תחילת השיעור</span>
      </div>
      <div>
        <Label className="text-xs text-slate-500 mb-1 block">סנן לפי מדריך (אופציונלי)</Label>
        <Input value={config.instructor_name ?? ''} onChange={e => update('instructor_name', e.target.value)}
          placeholder="שם מדריך..." className="text-sm max-w-xs" dir="rtl" />
      </div>
    </div>
  );

  if (triggerType === 'exact_date') return (
    <div className="mt-3">
      <Label className="text-xs text-slate-500 mb-1.5 block">תאריך שליחה</Label>
      <Input type="date" value={config.exact_date ?? ''} onChange={e => update('exact_date', e.target.value)} className="w-48" />
    </div>
  );

  if (triggerType === 'weekday_time') {
    const weekdays = config.weekdays ?? [];
    const toggleDay = d => update('weekdays', weekdays.includes(d) ? weekdays.filter(x => x !== d) : [...weekdays, d].sort());
    return (
      <div className="space-y-3 mt-3">
        <div>
          <Label className="text-xs text-slate-500 mb-2 block">ימים</Label>
          <div className="flex gap-1.5">
            {DAYS_SHORT.map((d, i) => (
              <button key={i} type="button" onClick={() => toggleDay(i)}
                className={`w-10 h-10 rounded-full text-xs font-bold border-2 transition-all ${weekdays.includes(i) ? 'border-teal-500 bg-teal-500 text-white' : 'border-slate-200 text-slate-600 hover:border-teal-300'}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs text-slate-500 mb-1.5 block">שעת שליחה</Label>
          <Input type="time" value={config.time ?? '08:00'} onChange={e => update('time', e.target.value)} className="w-32" dir="ltr" />
        </div>
      </div>
    );
  }

  if (triggerType === 'birthday') return (
    <p className="text-sm text-slate-500 mt-3">ביום ההולדת של כל חבר. אין הגדרות נוספות.</p>
  );

  return null;
}

// ── Member picker ──────────────────────────────────────────────────────────────
function MemberPicker({ coachEmail, selectedIds, onChange, mode }) {
  const [search, setSearch] = useState('');

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['arboxMembersForEditor', coachEmail],
    queryFn: async () => {
      const res = await base44.functions.invoke('getArboxMembers', { coachEmail, perPage: 500 });
      return res?.data?.members ?? [];
    },
    enabled: !!coachEmail,
    staleTime: 120_000,
  });

  const selectedSet = new Set(selectedIds || []);
  const visible = members.filter(m => {
    if (!search) return true;
    const full = `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase();
    return full.includes(search.toLowerCase()) || (m.phone || '').includes(search);
  });

  const toggleOne = id => {
    const next = selectedSet.has(id) ? [...selectedSet].filter(x => x !== id) : [...selectedSet, id];
    onChange(next.length ? next : null);
  };
  const selectAll = () => onChange(members.map(m => m.arbox_user_id));
  const clearAll  = () => onChange(null);

  const modeLabel = mode === 'selected' ? 'בחר חברים לשליחה' : 'בחר חברים להחרגה';
  const countLabel = mode === 'selected' ? 'נבחרו' : 'מוחרגים';

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Picker header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <p className="text-xs font-semibold text-slate-700">{modeLabel}</p>
        {selectedSet.size > 0 && (
          <span className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2.5 py-0.5">
            {selectedSet.size} {countLabel}
          </span>
        )}
      </div>

      {/* Search + controls */}
      <div className="px-3 pt-3 pb-2 space-y-2">
        <div className="relative">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="חפש לפי שם או טלפון..." className="pr-8 text-sm h-8" dir="rtl" />
        </div>
        <div className="flex gap-3 text-xs">
          <button type="button" onClick={selectAll} className="text-teal-600 hover:text-teal-800 font-medium">
            בחר הכל
          </button>
          <span className="text-slate-300">|</span>
          <button type="button" onClick={clearAll} className="text-slate-500 hover:text-slate-700">
            נקה בחירה
          </button>
        </div>
      </div>

      {/* Member list */}
      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border-t border-slate-100">
        {isLoading ? (
          <p className="text-xs text-slate-400 text-center py-6">טוען רשימת חברים...</p>
        ) : members.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">לא נמצאו חברים פעילים ב-Arbox</p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">אין תוצאות לחיפוש</p>
        ) : visible.map(m => {
          const checked = selectedSet.has(m.arbox_user_id);
          return (
            <label key={m.arbox_user_id}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${checked ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
              <input type="checkbox" checked={checked} onChange={() => toggleOne(m.arbox_user_id)}
                className="w-4 h-4 accent-teal-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{m.first_name} {m.last_name}</p>
                {m.phone && <p className="text-xs text-slate-400 font-mono">{m.phone}</p>}
              </div>
              {m.membership_type && (
                <span className="text-xs text-slate-400 flex-shrink-0">{m.membership_type}</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Main drawer ────────────────────────────────────────────────────────────────
export default function AutomationEditorDrawer({
  automation,
  coachEmail,
  onClose,
  onSaved,
  onDeleted,
  isNew = false,
}) {
  const effectiveCoachEmail = automation?.coach_email || coachEmail || '';

  const initialFormRef = useRef(null);
  const [form, setForm] = useState(() => {
    const f = (isNew || !automation) ? {
      name: '',
      trigger_type: 'weekday_time',
      message_template: 'שלום {{trainee_name}},\n\nהודעה מ-FitCoach 💪',
      message_variants: null,
      follow_up_config: null,
      target_type: 'all',
      target_phone: '',
      target_member_ids: null,
      trigger_config: { weekdays: [0], time: '08:00' },
      consent_category: 'whatsapp_reminder',
      enabled: false,
      cooldown_hours: 24,
    } : {
      ...automation,
      trigger_config:    parseTriggerConfig(automation.trigger_config),
      message_variants:  automation.message_variants  ? JSON.parse(automation.message_variants)  : null,
      target_member_ids: automation.target_member_ids ? JSON.parse(automation.target_member_ids) : null,
      follow_up_config:  automation.follow_up_config  ? JSON.parse(automation.follow_up_config)  : null,
    };
    initialFormRef.current = f;
    return f;
  });

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

  // Section refs for nav scroll
  const whenRef = useRef(null);
  const whoRef  = useRef(null);
  const whatRef = useRef(null);
  const thenRef = useRef(null);

  const scrollTo = ref => {
    if (ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [saving, setSaving]               = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const triggerMeta = TRIGGER_META[form.trigger_type] || { label: form.trigger_type, icon: '⚙️', desc: '' };

  const buildPayload = () => ({
    ...form,
    coach_email:       effectiveCoachEmail,
    trigger_config:    JSON.stringify(form.trigger_config || {}),
    message_variants:  form.message_variants ? JSON.stringify(form.message_variants) : null,
    target_member_ids: Array.isArray(form.target_member_ids) && form.target_member_ids.length
      ? JSON.stringify(form.target_member_ids) : null,
    follow_up_config:  (form.follow_up_config?.enabled && form.follow_up_config?.steps?.length)
      ? JSON.stringify(form.follow_up_config) : null,
  });

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('נא להזין שם לאוטומציה'); return; }
    const enabledVariants = (form.message_variants || []).filter(v => v.enabled && v.text?.trim());
    if (!form.message_template.trim() && !enabledVariants.length) {
      toast.error('נא להזין תוכן הודעה'); return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      delete payload.id; delete payload.created_at; delete payload.updated_at; delete payload.last_run_at;
      if (isNew) {
        await base44.entities.WhatsAppAutomation.create(payload);
        toast.success('אוטומציה נוצרה ✅');
      } else {
        await base44.entities.WhatsAppAutomation.update(automation.id, payload);
        toast.success('שינויים נשמרו ✅');
      }
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error('שגיאה בשמירה: ' + (e.message || 'נסה שוב'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!automation?.id) return;
    setDeleting(true);
    try {
      await base44.entities.WhatsAppAutomation.delete(automation.id);
      toast.success('אוטומציה נמחקה');
      onDeleted?.();
      onClose();
    } catch {
      toast.error('שגיאה במחיקה');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleDuplicate = async () => {
    setSaving(true);
    try {
      const payload = buildPayload();
      payload.name    = `עותק — ${form.name}`;
      payload.enabled = false;
      delete payload.id; delete payload.created_at; delete payload.updated_at; delete payload.last_run_at;
      await base44.entities.WhatsAppAutomation.create(payload);
      toast.success('עותק נוצר — כבוי כברירת מחדל');
      onSaved?.();
      onClose();
    } catch {
      toast.error('שגיאה בשכפול');
    } finally {
      setSaving(false);
    }
  };

  const NAV = [
    { ref: whenRef, label: 'מתי שולחים?' },
    { ref: whoRef,  label: 'למי שולחים?' },
    { ref: whatRef, label: 'מה שולחים?' },
    { ref: thenRef, label: 'מה קורה אחר כך?' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-[820px] bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${form.enabled ? 'bg-green-500' : 'bg-slate-300'}`} />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 truncate leading-tight">
                {isNew ? 'אוטומציה חדשה' : (form.name || 'עריכת אוטומציה')}
              </h2>
              <p className="text-xs text-slate-500">{form.enabled ? '✅ פעילה' : '⏸ מושהית'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isNew && (
              <button onClick={handleDuplicate} disabled={saving}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="שכפל">
                <Copy className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Section nav ─────────────────────────────────────── */}
        <div className="flex items-center gap-1 px-5 py-2 bg-slate-50 border-b border-slate-200 flex-shrink-0 overflow-x-auto">
          {NAV.map((s, i) => (
            <button key={i} type="button" onClick={() => scrollTo(s.ref)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-slate-600 hover:bg-white hover:text-teal-700 hover:shadow-sm border border-transparent hover:border-slate-200 transition-all whitespace-nowrap flex-shrink-0">
              <span className="w-4 h-4 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Scrollable content ───────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-10">

          {/* ════ Section 1: When ════════════════════════════════ */}
          <section ref={whenRef}>
            <SectionHeader number={1} title="מתי שולחים?" subtitle="שם האוטומציה, סוג טריגר ולוח הזמנים" />
            <div className="space-y-4">

              {/* Name */}
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1.5 block">שם האוטומציה</Label>
                <Input value={form.name} onChange={e => update('name', e.target.value)}
                  placeholder="לדוגמה: תזכורת חזרה אחרי 7 ימים" className="text-sm" dir="rtl" />
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 bg-slate-50">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {form.enabled ? '✅ האוטומציה פעילה' : '⏸ האוטומציה מושהית'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {form.enabled
                      ? 'הודעות יישלחו אוטומטית לפי הגדרות הטריגר'
                      : 'הודעות לא יישלחו עד להפעלה'}
                  </p>
                </div>
                <Switch checked={form.enabled} onCheckedChange={v => update('enabled', v)} />
              </div>

              {/* Trigger card */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    מה מפעיל את ההודעה?
                  </p>
                </div>
                <div className="px-4 py-4 space-y-3">
                  <Select value={form.trigger_type}
                    onValueChange={v => { update('trigger_type', v); update('trigger_config', {}); }}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {Object.entries(TRIGGER_META).map(([val, meta]) => (
                        <SelectItem key={val} value={val}>
                          <span className="flex items-center gap-2">{meta.icon} {meta.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {triggerMeta.desc && (
                    <p className="text-sm text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      ℹ️ {triggerMeta.desc}
                    </p>
                  )}

                  {form.trigger_type === 'manual_test' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                      <p className="text-sm font-semibold text-amber-700">⚠️ בדיקה ידנית — ההודעה לא תישלח אוטומטית</p>
                      <p className="text-xs text-amber-600 mt-1">השתמש בטריגר זה לבדיקות בלבד.</p>
                    </div>
                  )}

                  <TriggerConfigEditor
                    triggerType={form.trigger_type}
                    config={form.trigger_config || {}}
                    onChange={cfg => update('trigger_config', cfg)}
                  />
                </div>
              </div>

              {/* Cooldown */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-600">מרווח מינימלי בין שליחות</p>
                </div>
                <div className="px-4 py-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-slate-600">לא לשלוח לאותו חבר תוך פחות מ-</span>
                    <Input type="number" min={1} max={720} value={form.cooldown_hours}
                      onChange={e => update('cooldown_hours', Number(e.target.value))} className="w-20 text-center" />
                    <span className="text-sm text-slate-600">שעות</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ════ Section 2: Who ══════════════════════════════════ */}
          <section ref={whoRef}>
            <SectionHeader number={2} title="למי שולחים?" subtitle="הגדר את קהל היעד" />
            <div className="space-y-4">

              {/* Audience grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { val: 'all',      icon: '👥', label: 'כל החברים הפעילים',   sub: 'כל לקוחות Arbox הפעילים' },
                  { val: 'one',      icon: '📱', label: 'מספר טלפון ספציפי',    sub: 'לבדיקות — נשלח לטלפון אחד' },
                  { val: 'selected', icon: '✅', label: 'חברים נבחרים',          sub: 'שלח רק לרשימה שתגדיר' },
                  { val: 'excluded', icon: '🚫', label: 'כולם מלבד נבחרים',      sub: 'כל הפעילים פחות חריגים' },
                ].map(opt => (
                  <button key={opt.val} type="button"
                    onClick={() => {
                      update('target_type', opt.val);
                      if (opt.val !== 'selected' && opt.val !== 'excluded') update('target_member_ids', null);
                    }}
                    className={`py-3 px-4 rounded-xl border-2 text-right transition-all ${
                      form.target_type === opt.val
                        ? 'border-teal-400 bg-teal-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}>
                    <div className="flex items-start gap-2.5">
                      <span className="text-lg mt-0.5 flex-shrink-0">{opt.icon}</span>
                      <div>
                        <div className="font-semibold text-sm text-slate-800">{opt.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{opt.sub}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {form.target_type === 'all' && (
                <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-sm text-teal-700">
                  ✅ ההודעה תישלח לכל המתאמנים הפעילים ב-Arbox שעומדים בתנאי הטריגר
                </div>
              )}

              {form.target_type === 'one' && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-slate-600">מספר טלפון (E.164)</Label>
                  <Input value={form.target_phone || ''} onChange={e => update('target_phone', e.target.value)}
                    placeholder="+972541234567" dir="ltr" className="text-sm font-mono max-w-xs" />
                  <p className="text-xs text-slate-400">פורמט: +972XXXXXXXXX</p>
                </div>
              )}

              {form.target_type === 'excluded' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700">
                  ההודעה תישלח לכל המתאמנים הפעילים, <strong>מלבד</strong> מי שתבחר למטה
                </div>
              )}

              {(form.target_type === 'selected' || form.target_type === 'excluded') && (
                <MemberPicker
                  coachEmail={effectiveCoachEmail}
                  selectedIds={form.target_member_ids}
                  onChange={ids => update('target_member_ids', ids)}
                  mode={form.target_type}
                />
              )}
            </div>
          </section>

          {/* ════ Section 3: What ════════════════════════════════ */}
          <section ref={whatRef}>
            <SectionHeader number={3} title="מה שולחים?" subtitle="הודעה קבועה או רוטציה בין נוסחאות" />
            <MessageVariationEditor
              variants={form.message_variants}
              onChange={v => update('message_variants', v)}
              baseTemplate={form.message_template}
              onBaseTemplateChange={v => update('message_template', v)}
              wideLayout
            />
          </section>

          {/* ════ Section 4: Follow-up ═══════════════════════════ */}
          <section ref={thenRef}>
            <SectionHeader
              number={4}
              title="מה קורה אחר כך?"
              subtitle="אם המתאמן עדיין לא חזר — רצף מעקב אוטומטי"
            />
            <FollowUpEditor
              config={form.follow_up_config}
              onChange={cfg => update('follow_up_config', cfg)}
            />
          </section>

          {/* Delete zone */}
          {!isNew && (
            <div className="pt-6 border-t border-red-100">
              <p className="text-xs font-semibold text-red-400 mb-3 flex items-center gap-1.5 uppercase tracking-wide">
                <AlertTriangle className="w-3 h-3" /> אזור מחיקה
              </p>
              {confirmDelete ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-red-700">⚠️ פעולה זו אינה הפיכה. האוטומציה תמחק לצמיתות.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setConfirmDelete(false)} className="flex-1">ביטול</Button>
                    <Button onClick={handleDelete} disabled={deleting}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white">
                      {deleting ? 'מוחק...' : 'מחק לצמיתות'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" onClick={() => setConfirmDelete(true)}
                  className="border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 gap-2">
                  <Trash2 className="w-4 h-4" />
                  מחק אוטומציה
                </Button>
              )}
            </div>
          )}

          <div className="h-4" />
        </div>

        {/* ── Sticky footer ────────────────────────────────────── */}
        <div className="border-t border-slate-200 px-5 py-3.5 flex items-center gap-4 flex-shrink-0 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
          {isDirty ? (
            <span className="text-xs text-amber-600 flex items-center gap-1.5 flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
              יש שינויים שלא נשמרו
            </span>
          ) : (
            !isNew && <span className="text-xs text-slate-400 flex-shrink-0">אין שינויים</span>
          )}
          <div className="flex gap-3 mr-auto">
            <Button variant="outline" onClick={onClose} className="min-w-[80px]">ביטול</Button>
            <Button
              onClick={handleSave}
              disabled={saving || (!isNew && !isDirty)}
              className="min-w-[150px] text-white gap-2"
              style={{ backgroundColor: (saving || (!isNew && !isDirty)) ? '#cbd5e1' : '#79DBD6' }}>
              <Save className="w-4 h-4" />
              {saving ? 'שומר...' : isNew ? 'צור אוטומציה' : 'שמור שינויים'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
