import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Trash2, Eye, Send, ChevronDown, ChevronUp, Info } from 'lucide-react';

// ─── Catalogs ─────────────────────────────────────────────────────────────────

const TRIGGER_TYPES = [
  { value: 'app_login',           label: 'App Login — כניסה לאפליקציה' },
  { value: 'food_logging',        label: 'Food Logging — תיעוד אכילה' },
  { value: 'calories',            label: 'Calories — קלוריות' },
  { value: 'protein',             label: 'Protein — חלבון' },
  { value: 'water',               label: 'Water — שתיית מים' },
  { value: 'workout_completed',   label: 'Workout Completed — אימון הושלם' },
  { value: 'workout_missed',      label: 'Workout Missed — אימון פוספס' },
  { value: 'weight_checkin',      label: 'Weight Check-In — שקילה' },
  { value: 'goal_progress',       label: 'Goal Progress — התקדמות מטרה' },
  { value: 'app_inactivity',      label: 'App Inactivity — חוסר פעילות' },
  { value: 'arbox_booking',       label: 'Arbox Booking — הזמנת אימון' },
  { value: 'arbox_cancellation',  label: 'Arbox Cancellation — ביטול הזמנה' },
  { value: 'arbox_no_show',       label: 'Arbox No Show — לא הגיע' },
  { value: 'membership_expiring', label: 'Membership Expiring — מנוי פג' },
  { value: 'interval',            label: 'Interval — מחזורי' },
  { value: 'scheduled',           label: 'Scheduled — מתוזמן' },
  { value: 'event',               label: 'Event — אירוע' },
  { value: 'custom',              label: 'Custom — מותאם אישית' },
];

const CONDITION_FIELDS = [
  { value: 'days_since_login',                label: 'ימים ללא כניסה' },
  { value: 'meals_today',                     label: 'ארוחות היום' },
  { value: 'calories_today',                  label: 'קלוריות היום' },
  { value: 'protein_today_g',                 label: 'חלבון היום (ג)' },
  { value: 'water_today_ml',                  label: 'מים היום (מ"ל)' },
  { value: 'workouts_this_week',              label: 'אימונים השבוע' },
  { value: 'days_since_weigh_in',             label: 'ימים ללא שקילה' },
  { value: 'day_of_week',                     label: 'יום בשבוע' },
  { value: 'hour_of_day',                     label: 'שעה ביום' },
  { value: 'consecutive_low_protein_days',    label: 'ימים ברצף חלבון נמוך' },
  { value: 'consecutive_high_calorie_days',   label: 'ימים ברצף קלוריות גבוהות' },
  { value: 'arbox_bookings_this_week',        label: 'הזמנות Arbox השבוע' },
  { value: 'days_since_arbox_visit',          label: 'ימים מאז ביקור Arbox' },
  { value: 'health_score',                    label: 'ציון בריאות' },
  { value: 'protein_pct_of_target',           label: '% חלבון מהיעד' },
  { value: 'calorie_pct_of_target',           label: '% קלוריות מהיעד' },
];

const CONDITION_OPS = [
  { value: 'gt',  label: 'גדול מ' },
  { value: 'gte', label: 'גדול/שווה ל' },
  { value: 'lt',  label: 'קטן מ' },
  { value: 'lte', label: 'קטן/שווה ל' },
  { value: 'eq',  label: 'שווה ל' },
  { value: 'ne',  label: 'שונה מ' },
  { value: 'between', label: 'בין' },
];

const ACTION_TYPES = [
  { value: 'whatsapp',          label: 'WhatsApp' },
  { value: 'push',              label: 'Push Notification' },
  { value: 'coach_alert',       label: 'Coach Alert' },
  { value: 'internal',          label: 'Internal Notification' },
  { value: 'webhook',           label: 'Webhook' },
  { value: 'tag_trainee',       label: 'Tag Trainee' },
  { value: 'assign_task',       label: 'Assign Coach Task' },
];

const TEMPLATE_VARS = [
  '{{first_name}}', '{{full_name}}', '{{coach_name}}',
  '{{calories}}', '{{protein}}', '{{booking_link}}', '{{date}}',
];

const SCHEDULE_WINDOWS = [
  { value: 'morning',   label: 'בוקר (08:00)' },
  { value: 'afternoon', label: 'צהריים (14:00)' },
  { value: 'evening',   label: 'ערב (20:00)' },
];

const DAYS_OF_WEEK = [
  { value: 'sunday',    label: 'ראשון' },
  { value: 'monday',    label: 'שני' },
  { value: 'tuesday',   label: 'שלישי' },
  { value: 'wednesday', label: 'רביעי' },
  { value: 'thursday',  label: 'חמישי' },
  { value: 'friday',    label: 'שישי' },
  { value: 'saturday',  label: 'שבת' },
];

const PRIORITIES = [
  { value: 'critical', label: '🔴 קריטי', color: 'text-red-600' },
  { value: 'high',     label: '🟠 גבוה',  color: 'text-orange-600' },
  { value: 'normal',   label: '🔵 רגיל',  color: 'text-blue-600' },
  { value: 'low',      label: '⚪ נמוך',   color: 'text-slate-500' },
];

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-sm font-semibold text-slate-700">
        {title}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function RuleBuilderModal({ rule, onClose, onSaved }) {
  const isNew = !rule?.id;

  const [form, setForm] = useState({
    code:             rule?.code        || '',
    name:             rule?.name        || '',
    description:      rule?.description || '',
    priority:         rule?.priority    || 'normal',
    trigger_type:     rule?.trigger_type || 'interval',
    schedule_window:  rule?.schedule_window || 'morning',
    schedule_time:    rule?.schedule_time   || '08:00',
    schedule_days:    rule?.schedule_days   ? JSON.parse(rule.schedule_days) : [],
    cooldown_hours:   rule?.cooldown_hours  ?? 24,
    message_template: rule?.message_template || '',
    enabled:          rule?.enabled ?? true,
    conditions_v2:    rule?.conditions_v2 ? JSON.parse(rule.conditions_v2) : { operator: 'AND', rules: [] },
    actions_v2:       rule?.actions_v2   ? JSON.parse(rule.actions_v2)   : [{ channel: 'whatsapp' }],
  });

  const [preview, setPreview] = useState('');
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    setCharCount(form.message_template.length);
    // Simple preview with placeholder values
    setPreview(
      form.message_template
        .replace(/\{\{first_name\}\}/g, 'דנה')
        .replace(/\{\{full_name\}\}/g, 'דנה כהן')
        .replace(/\{\{coach_name\}\}/g, 'עדן')
        .replace(/\{\{calories\}\}/g, '1400')
        .replace(/\{\{protein\}\}/g, '120')
        .replace(/\{\{booking_link\}\}/g, 'https://app.arboxapp.com')
        .replace(/\{\{date\}\}/g, new Date().toLocaleDateString('he-IL'))
        .replace(/\{\{days\}\}/g, '3')
    );
  }, [form.message_template]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Conditions management
  const addCondition = () => set('conditions_v2', {
    ...form.conditions_v2,
    rules: [...form.conditions_v2.rules, { field: 'days_since_login', op: 'gt', val: 24 }],
  });
  const removeCondition = (i) => set('conditions_v2', {
    ...form.conditions_v2,
    rules: form.conditions_v2.rules.filter((_, idx) => idx !== i),
  });
  const updateCondition = (i, k, v) => set('conditions_v2', {
    ...form.conditions_v2,
    rules: form.conditions_v2.rules.map((r, idx) => idx === i ? { ...r, [k]: v } : r),
  });

  // Actions management
  const addAction = () => set('actions_v2', [...form.actions_v2, { channel: 'whatsapp' }]);
  const removeAction = (i) => set('actions_v2', form.actions_v2.filter((_, idx) => idx !== i));
  const updateAction = (i, k, v) => set('actions_v2', form.actions_v2.map((a, idx) => idx === i ? { ...a, [k]: v } : a));

  const saveMut = useMutation({
    mutationFn: async (data) => {
      if (isNew) return base44.functions.invoke('createBehaviorAutomationRule', data);
      return base44.functions.invoke('updateBehaviorAutomationRule', { rule_code: rule.code, ...data });
    },
    onSuccess: (d) => {
      if (d?.ok) { onSaved?.(); onClose(); }
    },
  });

  const handleSave = () => {
    const payload = {
      ...form,
      schedule_days:  JSON.stringify(form.schedule_days),
      conditions_v2:  JSON.stringify(form.conditions_v2),
      actions_v2:     JSON.stringify(form.actions_v2),
      cooldown_hours: parseInt(form.cooldown_hours),
    };
    saveMut.mutate(payload);
  };

  const insertVar = (v) => set('message_template', form.message_template + v);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-bold text-lg text-slate-800">
            {isNew ? 'אוטומציה חדשה' : `עריכה: ${rule.name}`}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">

          {/* Basic Info */}
          <Section title="מידע בסיסי">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-slate-500 mb-1 block">שם האוטומציה *</label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="למשל: לא הגעת לאימון" />
              </div>
              {isNew && (
                <div className="col-span-2">
                  <label className="text-xs text-slate-500 mb-1 block">קוד ייחודי *</label>
                  <Input value={form.code} onChange={e => set('code', e.target.value.toUpperCase().replace(/\s/g, '_'))} placeholder="MY_AUTOMATION_CODE" className="font-mono" />
                </div>
              )}
              <div>
                <label className="text-xs text-slate-500 mb-1 block">עדיפות</label>
                <select value={form.priority} onChange={e => set('priority', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <label className="text-xs text-slate-500">מופעל</label>
                <button onClick={() => set('enabled', !form.enabled)}
                  className={`w-12 h-6 rounded-full transition-all relative ${form.enabled ? 'bg-teal-500' : 'bg-slate-300'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.enabled ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-500 mb-1 block">תיאור</label>
                <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="תאר מתי הכלל מופעל..." />
              </div>
            </div>
          </Section>

          {/* Trigger & Schedule */}
          <Section title="טריגר ולוח זמנים">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-slate-500 mb-1 block">סוג טריגר</label>
                <select value={form.trigger_type} onChange={e => set('trigger_type', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">חלון זמן</label>
                <select value={form.schedule_window} onChange={e => set('schedule_window', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">ללא</option>
                  {SCHEDULE_WINDOWS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">שעה (IL)</label>
                <Input type="time" value={form.schedule_time} onChange={e => set('schedule_time', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-500 mb-1 block">ימים בשבוע</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map(d => (
                    <button key={d.value}
                      onClick={() => set('schedule_days', form.schedule_days.includes(d.value)
                        ? form.schedule_days.filter(x => x !== d.value)
                        : [...form.schedule_days, d.value])}
                      className={`px-3 py-1 rounded-full text-xs border transition-all ${
                        form.schedule_days.includes(d.value)
                          ? 'bg-teal-500 text-white border-teal-500'
                          : 'border-slate-200 text-slate-600'
                      }`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">קולדאון (שעות)</label>
                <Input type="number" min={1} value={form.cooldown_hours} onChange={e => set('cooldown_hours', e.target.value)} />
              </div>
            </div>
          </Section>

          {/* Conditions */}
          <Section title={`תנאים (${form.conditions_v2.rules.length})`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-500">לוגיקה:</span>
              {['AND', 'OR'].map(op => (
                <button key={op} onClick={() => set('conditions_v2', { ...form.conditions_v2, operator: op })}
                  className={`text-xs px-2 py-0.5 rounded border ${form.conditions_v2.operator === op ? 'bg-slate-800 text-white' : 'border-slate-200'}`}>
                  {op}
                </button>
              ))}
            </div>
            {form.conditions_v2.rules.map((cond, i) => (
              <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                <select value={cond.field} onChange={e => updateCondition(i, 'field', e.target.value)}
                  className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs">
                  {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <select value={cond.op} onChange={e => updateCondition(i, 'op', e.target.value)}
                  className="w-24 border border-slate-200 rounded px-2 py-1 text-xs">
                  {CONDITION_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <Input value={cond.val} onChange={e => updateCondition(i, 'val', e.target.value)}
                  className="w-20 h-7 text-xs" placeholder="ערך" />
                {cond.op === 'between' && (
                  <Input value={cond.val2 || ''} onChange={e => updateCondition(i, 'val2', e.target.value)}
                    className="w-20 h-7 text-xs" placeholder="עד" />
                )}
                <button onClick={() => removeCondition(i)} className="p-1 text-red-400 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addCondition} className="text-xs gap-1 w-full">
              <Plus size={12} /> הוסף תנאי
            </Button>
          </Section>

          {/* Actions */}
          <Section title={`פעולות (${form.actions_v2.length})`}>
            {form.actions_v2.map((action, i) => (
              <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                <select value={action.channel || 'whatsapp'} onChange={e => updateAction(i, 'channel', e.target.value)}
                  className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs">
                  {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                {(action.channel === 'coach_alert' || action.channel === 'internal') && (
                  <Input value={action.title || ''} onChange={e => updateAction(i, 'title', e.target.value)}
                    placeholder="כותרת" className="flex-1 h-7 text-xs" />
                )}
                {action.channel === 'webhook' && (
                  <Input value={action.url || ''} onChange={e => updateAction(i, 'url', e.target.value)}
                    placeholder="URL" className="flex-1 h-7 text-xs" />
                )}
                <button onClick={() => removeAction(i)} className="p-1 text-red-400 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addAction} className="text-xs gap-1 w-full">
              <Plus size={12} /> הוסף פעולה
            </Button>
          </Section>

          {/* Message Template */}
          <Section title="תבנית הודעה">
            <div>
              <div className="flex flex-wrap gap-1 mb-2">
                {TEMPLATE_VARS.map(v => (
                  <button key={v} onClick={() => insertVar(v)}
                    className="text-xs px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 font-mono">
                    {v}
                  </button>
                ))}
              </div>
              <textarea
                value={form.message_template}
                onChange={e => set('message_template', e.target.value)}
                rows={5}
                placeholder="כתוב כאן את תוכן ההודעה..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-300"
              />
              <div className="flex items-center justify-between mt-1">
                <span className={`text-xs ${charCount > 900 ? 'text-red-500' : 'text-slate-400'}`}>
                  {charCount} תווים {charCount > 900 ? '(ארוך מדי!)' : ''}
                </span>
              </div>
            </div>
            {preview && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                <div className="text-xs text-green-600 font-medium mb-1 flex items-center gap-1"><Eye size={11} /> תצוגה מקדימה</div>
                {preview}
              </div>
            )}
          </Section>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={onClose} className="text-sm">ביטול</Button>
          <Button
            onClick={handleSave}
            disabled={saveMut.isPending || !form.name || (!isNew ? false : !form.code)}
            className="text-sm bg-teal-500 hover:bg-teal-600 text-white px-6"
          >
            {saveMut.isPending ? 'שומר...' : isNew ? 'צור אוטומציה' : 'שמור שינויים'}
          </Button>
        </div>
      </div>
    </div>
  );
}
