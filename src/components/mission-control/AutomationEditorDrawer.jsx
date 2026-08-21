/**
 * AutomationEditorDrawer — coach-friendly editor for WhatsApp Automations.
 *
 * Opens as a side drawer. Shows human-readable Hebrew labels for all fields.
 * Supports:
 *   - Name, active/inactive, trigger, cooldown
 *   - Trigger configuration (threshold days, schedule weekdays+time, etc.)
 *   - Message template + message variants (rotation)
 *   - WhatsApp preview
 *   - Targeting: all | one phone | selected members | excluded members
 *   - Save, duplicate, delete
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  X, Save, Trash2, Copy, Clock, Users, MessageSquare,
  Settings2, ChevronDown, ChevronUp, Zap, Search,
} from 'lucide-react';
import MessageVariationEditor from './MessageVariationEditor';
import FollowUpEditor from './FollowUpEditor';

// ── Human-readable trigger labels ─────────────────────────────────────────────
const TRIGGER_META = {
  no_attendance:        { label: 'לא ביקר במכון',      icon: '🏃', desc: 'חבר לא ביקר במכון N ימים' },
  consecutive_absences: { label: 'היעדרויות רצופות',    icon: '📉', desc: 'N ביטולים/no-show רצופים' },
  birthday:             { label: 'יום הולדת',           icon: '🎂', desc: 'ביום הולדת החבר' },
  package_expiry:       { label: 'מנוי עומד לפוג',       icon: '⏰', desc: 'N ימים לפני פקיעת המנוי' },
  remaining_sessions:   { label: 'מפגשים נותרו',        icon: '🎯', desc: 'כשנשארו N מפגשים' },
  class_reminder:       { label: 'תזכורת שיעור',        icon: '📅', desc: 'N דקות לפני תחילת שיעור' },
  exact_date:           { label: 'תאריך ספציפי',        icon: '📌', desc: 'שולח בתאריך מסוים' },
  weekday_time:         { label: 'ימים ושעה קבועים',    icon: '📆', desc: 'שולח בימים ובשעה מסוימים' },
  manual_test:          { label: 'בדיקה ידנית',         icon: '🧪', desc: 'רק לבדיקות — לא שולח אוטומטית' },
};

const DAYS_HE    = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function parseTriggerConfig(raw) {
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => collapsible && setOpen(v => !v)}
        className={`w-full flex items-center gap-2 px-4 py-3 bg-slate-50 text-right ${collapsible ? 'cursor-pointer hover:bg-slate-100' : 'cursor-default'}`}
      >
        {Icon && <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />}
        <span className="font-semibold text-sm text-slate-800 flex-1">{title}</span>
        {collapsible && (open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />)}
      </button>
      {(!collapsible || open) && (
        <div className="px-4 pb-4 pt-3 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Trigger configuration editor ──────────────────────────────────────────────
function TriggerConfigEditor({ triggerType, config, onChange }) {
  const update = (key, val) => onChange({ ...config, [key]: val });

  if (triggerType === 'no_attendance') {
    return (
      <div className="space-y-2">
        <Label className="text-xs text-slate-600">שלח כאשר חבר לא ביקר במשך:</Label>
        <div className="flex items-center gap-2">
          <Input type="number" min={1} max={365} value={config.threshold_days ?? 7}
            onChange={e => update('threshold_days', Number(e.target.value))}
            className="w-24 text-center" />
          <span className="text-sm text-slate-600">ימים</span>
        </div>
      </div>
    );
  }

  if (triggerType === 'consecutive_absences') {
    return (
      <div className="space-y-2">
        <Label className="text-xs text-slate-600">שלח לאחר:</Label>
        <div className="flex items-center gap-2">
          <Input type="number" min={1} max={20} value={config.absence_count ?? 3}
            onChange={e => update('absence_count', Number(e.target.value))}
            className="w-24 text-center" />
          <span className="text-sm text-slate-600">היעדרויות רצופות</span>
        </div>
      </div>
    );
  }

  if (triggerType === 'package_expiry') {
    return (
      <div className="space-y-2">
        <Label className="text-xs text-slate-600">שלח כאשר המנוי יפוג בעוד:</Label>
        <div className="flex items-center gap-2">
          <Input type="number" min={1} max={60} value={config.days_before_expiry ?? 7}
            onChange={e => update('days_before_expiry', Number(e.target.value))}
            className="w-24 text-center" />
          <span className="text-sm text-slate-600">ימים</span>
        </div>
      </div>
    );
  }

  if (triggerType === 'remaining_sessions') {
    return (
      <div className="space-y-2">
        <Label className="text-xs text-slate-600">שלח כאשר נשארו:</Label>
        <div className="flex items-center gap-2">
          <Input type="number" min={1} max={20} value={config.remaining_sessions ?? 3}
            onChange={e => update('remaining_sessions', Number(e.target.value))}
            className="w-24 text-center" />
          <span className="text-sm text-slate-600">מפגשים או פחות</span>
        </div>
      </div>
    );
  }

  if (triggerType === 'class_reminder') {
    return (
      <div className="space-y-2">
        <Label className="text-xs text-slate-600">שלח:</Label>
        <div className="flex items-center gap-2">
          <Input type="number" min={5} max={1440} step={5} value={config.class_offset_minutes ?? 120}
            onChange={e => update('class_offset_minutes', Number(e.target.value))}
            className="w-24 text-center" />
          <span className="text-sm text-slate-600">דקות לפני תחילת השיעור</span>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-600">סנן לפי מדריך (אופציונלי):</Label>
          <Input value={config.instructor_name ?? ''} onChange={e => update('instructor_name', e.target.value)}
            placeholder="שם מדריך..." className="text-sm" dir="rtl" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-600">סנן לפי סוג שיעור (אופציונלי):</Label>
          <Input value={config.class_type ?? ''} onChange={e => update('class_type', e.target.value)}
            placeholder="סוג שיעור..." className="text-sm" dir="rtl" />
        </div>
      </div>
    );
  }

  if (triggerType === 'exact_date') {
    return (
      <div className="space-y-2">
        <Label className="text-xs text-slate-600">תאריך שליחה:</Label>
        <Input type="date" value={config.exact_date ?? ''} onChange={e => update('exact_date', e.target.value)}
          className="w-48" />
      </div>
    );
  }

  if (triggerType === 'weekday_time') {
    const weekdays = config.weekdays ?? [];
    const toggleDay = (d) => {
      const next = weekdays.includes(d) ? weekdays.filter(x => x !== d) : [...weekdays, d].sort();
      update('weekdays', next);
    };
    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs text-slate-600">ימים:</Label>
          <div className="flex gap-1.5 flex-wrap">
            {DAYS_HE.map((day, i) => (
              <button key={i} type="button" onClick={() => toggleDay(i)}
                className={`w-10 h-10 rounded-full text-xs font-medium border-2 transition-all ${weekdays.includes(i) ? 'border-teal-400 bg-teal-500 text-white' : 'border-slate-200 text-slate-600 hover:border-teal-200'}`}>
                {DAYS_SHORT[i]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-600">שעת שליחה:</Label>
          <Input type="time" value={config.time ?? '08:00'} onChange={e => update('time', e.target.value)}
            className="w-32" dir="ltr" />
        </div>
      </div>
    );
  }

  if (triggerType === 'birthday') {
    return <p className="text-xs text-slate-500">שולח ביום ההולדת של החבר. אין הגדרות נוספות.</p>;
  }

  if (triggerType === 'manual_test') {
    return <p className="text-xs text-amber-600">⚠️ טריגר בדיקה — לא ישולח אוטומטית. לשימוש בבדיקות בלבד.</p>;
  }

  return null;
}

// ── Member picker for selected/excluded targeting ──────────────────────────────
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
    return full.includes(search.toLowerCase());
  });

  const toggleOne = (id) => {
    const next = selectedSet.has(id)
      ? [...selectedSet].filter(x => x !== id)
      : [...selectedSet, id];
    onChange(next.length ? next : null);
  };

  const selectAll = () => onChange(members.map(m => m.arbox_user_id));
  const clearAll  = () => onChange(null);

  const label = mode === 'selected' ? 'בחר חברים לשליחה:' : 'בחר חברים להחרגה:';

  return (
    <div className="space-y-2">
      <Label className="text-xs text-slate-600">{label}</Label>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <Input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="חפש לפי שם..." className="pr-8 text-sm h-8" dir="rtl" />
      </div>

      {/* Select all / Clear */}
      <div className="flex gap-2 text-xs">
        <button type="button" onClick={selectAll}
          className="text-teal-600 hover:text-teal-800 underline-offset-2 hover:underline">
          בחר הכל
        </button>
        <span className="text-slate-300">|</span>
        <button type="button" onClick={clearAll}
          className="text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline">
          נקה בחירה
        </button>
        {selectedSet.size > 0 && (
          <span className="text-teal-700 font-semibold mr-auto">
            {selectedSet.size} {mode === 'selected' ? 'נבחרו' : 'מוחרגים'}
          </span>
        )}
      </div>

      {/* List */}
      <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
        {isLoading ? (
          <p className="text-xs text-slate-400 text-center py-4">טוען רשימת חברים...</p>
        ) : members.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">לא נמצאו חברים פעילים ב-Arbox</p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">אין תוצאות לחיפוש</p>
        ) : (
          visible.map(m => {
            const checked = selectedSet.has(m.arbox_user_id);
            return (
              <label key={m.arbox_user_id}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={checked}
                  onChange={() => toggleOne(m.arbox_user_id)}
                  className="w-4 h-4 accent-teal-500 flex-shrink-0" />
                <span className="text-sm text-slate-800 flex-1 truncate">
                  {m.first_name} {m.last_name}
                </span>
                {m.phone && (
                  <span className="text-xs text-slate-400 font-mono flex-shrink-0">{m.phone}</span>
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Main drawer ────────────────────────────────────────────────────────────────
export default function AutomationEditorDrawer({
  automation,
  coachEmail,        // required — always pass from parent
  onClose,
  onSaved,
  onDeleted,
  isNew = false,
}) {
  // The effective coach email: existing automation has it; new ones use the prop.
  const effectiveCoachEmail = automation?.coach_email || coachEmail || '';

  const [form, setForm] = useState(() => {
    if (isNew || !automation) {
      return {
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
      };
    }
    return {
      ...automation,
      trigger_config: parseTriggerConfig(automation.trigger_config),
      message_variants: automation.message_variants
        ? JSON.parse(automation.message_variants)
        : null,
      target_member_ids: automation.target_member_ids
        ? JSON.parse(automation.target_member_ids)
        : null,
      follow_up_config: automation.follow_up_config
        ? JSON.parse(automation.follow_up_config)
        : null,
    };
  });

  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const triggerMeta = TRIGGER_META[form.trigger_type] || {
    label: form.trigger_type, icon: '⚙️', desc: '',
  };

  const buildPayload = () => ({
    ...form,
    coach_email:       effectiveCoachEmail,
    trigger_config:    JSON.stringify(form.trigger_config || {}),
    message_variants:  form.message_variants ? JSON.stringify(form.message_variants) : null,
    target_member_ids: Array.isArray(form.target_member_ids) && form.target_member_ids.length
      ? JSON.stringify(form.target_member_ids)
      : null,
    follow_up_config:  (form.follow_up_config?.enabled && form.follow_up_config?.steps?.length)
      ? JSON.stringify(form.follow_up_config)
      : null,
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
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.last_run_at;

      if (isNew) {
        await base44.entities.WhatsAppAutomation.create(payload);
        toast.success('אוטומציה נוצרה בהצלחה ✅');
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
      payload.enabled = false; // never start enabled
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.last_run_at;
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

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer panel */}
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isNew ? 'אוטומציה חדשה' : 'עריכת אוטומציה'}
            </h2>
            {!isNew && automation?.name && (
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[250px]">{automation.name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isNew && (
              <button type="button" onClick={handleDuplicate} disabled={saving}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                title="שכפל אוטומציה">
                <Copy className="w-4 h-4" />
              </button>
            )}
            <button type="button" onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* 1. Name + Status */}
          <Section title="פרטים כלליים" icon={Settings2}>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">שם האוטומציה</Label>
              <Input value={form.name} onChange={e => update('name', e.target.value)}
                placeholder="לדוגמה: תזכורת חזרה אחרי היעדרות" className="text-sm" dir="rtl" />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-800">{form.enabled ? '✅ פעיל' : '⏸ מושהה'}</p>
                <p className="text-xs text-slate-500">
                  {form.enabled
                    ? 'האוטומציה תשלח הודעות לפי הגדרות הטריגר'
                    : 'ההודעות לא יישלחו עד להפעלה'}
                </p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={v => update('enabled', v)} />
            </div>
          </Section>

          {/* 2. Trigger */}
          <Section title="טריגר — מתי לשלוח?" icon={Zap}>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">סוג טריגר</Label>
              <Select value={form.trigger_type} onValueChange={v => update('trigger_type', v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {Object.entries(TRIGGER_META).map(([val, meta]) => (
                    <SelectItem key={val} value={val}>
                      <span>{meta.icon} {meta.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {triggerMeta.desc && (
                <p className="text-xs text-slate-500 mt-1">{triggerMeta.desc}</p>
              )}
            </div>
            <TriggerConfigEditor
              triggerType={form.trigger_type}
              config={form.trigger_config || {}}
              onChange={cfg => update('trigger_config', cfg)}
            />
          </Section>

          {/* 3. Cooldown */}
          <Section title="תזמון" icon={Clock} collapsible defaultOpen>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">מרווח מינימלי בין הודעות לאותו חבר</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} max={720} value={form.cooldown_hours}
                  onChange={e => update('cooldown_hours', Number(e.target.value))}
                  className="w-24 text-center" />
                <span className="text-sm text-slate-600">שעות</span>
              </div>
              <p className="text-xs text-slate-500">
                הודעה לא תישלח שוב לאותו חבר לפני שיחלפו {form.cooldown_hours} שעות
              </p>
            </div>
          </Section>

          {/* 4. Audience */}
          <Section title="קהל יעד" icon={Users} collapsible defaultOpen>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: 'all',      label: 'כל החברים',     sub: 'כל לקוחות Arbox הפעילים' },
                { val: 'one',      label: 'מספר ספציפי',   sub: 'בדיקות — טלפון אחד' },
                { val: 'selected', label: 'חברים נבחרים',  sub: 'שלח רק לרשימה שתבחר' },
                { val: 'excluded', label: 'מרבית החברים',  sub: 'כולם פחות חריגים' },
              ].map(opt => (
                <button key={opt.val} type="button"
                  onClick={() => {
                    update('target_type', opt.val);
                    if (opt.val !== 'selected' && opt.val !== 'excluded') {
                      update('target_member_ids', null);
                    }
                  }}
                  className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all text-right ${
                    form.target_type === opt.val
                      ? 'border-teal-400 bg-teal-50 text-teal-800'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-xs font-normal opacity-70 mt-0.5">{opt.sub}</div>
                </button>
              ))}
            </div>

            {form.target_type === 'one' && (
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">מספר טלפון (E.164)</Label>
                <Input value={form.target_phone || ''} onChange={e => update('target_phone', e.target.value)}
                  placeholder="+972541234567" dir="ltr" className="text-sm font-mono" />
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
          </Section>

          {/* 5. Message */}
          <Section title="הודעה" icon={MessageSquare}>
            <MessageVariationEditor
              variants={form.message_variants}
              onChange={v => update('message_variants', v)}
              baseTemplate={form.message_template}
              onBaseTemplateChange={v => update('message_template', v)}
            />
          </Section>

          {/* 6. Follow-up sequence */}
          <Section title="רצף מעקב" icon={Zap} collapsible defaultOpen={!!(form.follow_up_config?.enabled)}>
            <FollowUpEditor
              config={form.follow_up_config}
              onChange={cfg => update('follow_up_config', cfg)}
            />
          </Section>

          {/* Delete zone — existing automations only */}
          {!isNew && (
            <Section title="מחיקה" icon={Trash2} collapsible defaultOpen={false}>
              {confirmDelete ? (
                <div className="space-y-3">
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                    ⚠️ פעולה זו אינה הפיכה. האוטומציה תמחק לצמיתות.
                  </div>
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
                  className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 gap-2">
                  <Trash2 className="w-4 h-4" />
                  מחק אוטומציה
                </Button>
              )}
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-5 py-4 flex gap-3 flex-shrink-0 bg-white">
          <Button variant="outline" onClick={onClose} className="flex-1">ביטול</Button>
          <Button onClick={handleSave} disabled={saving}
            className="flex-1 text-white gap-2"
            style={{ backgroundColor: saving ? '#cbd5e1' : '#79DBD6' }}>
            <Save className="w-4 h-4" />
            {saving ? 'שומר...' : isNew ? 'צור אוטומציה' : 'שמור שינויים'}
          </Button>
        </div>
      </div>
    </div>
  );
}
