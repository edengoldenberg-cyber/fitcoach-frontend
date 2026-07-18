import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  X, Plus, Trash2, Eye, Send, RotateCcw, Shuffle, Zap,
  ChevronDown, ChevronUp, Info, Copy,
} from 'lucide-react';

// ─── Metadata ─────────────────────────────────────────────────────────────────

const SEGMENTS = [
  { value: '',             label: 'כולם (ברירת מחדל)',   color: 'bg-slate-100 text-slate-600' },
  { value: 'all',          label: 'כולם',                 color: 'bg-slate-100 text-slate-600' },
  { value: 'new_trainee',  label: 'מתאמן חדש (7 ימים)',  color: 'bg-teal-100 text-teal-700' },
  { value: 'active',       label: 'פעיל',                 color: 'bg-green-100 text-green-700' },
  { value: 'high_risk',    label: 'סיכון גבוה',           color: 'bg-red-100 text-red-700' },
  { value: 'returning',    label: 'חוזר לפעילות',        color: 'bg-blue-100 text-blue-700' },
];

const TONES = [
  { value: '',             label: 'כללי',    emoji: '💬' },
  { value: 'friendly',     label: 'ידידותי', emoji: '😊' },
  { value: 'motivational', label: 'מוטיב',   emoji: '💪' },
  { value: 'professional', label: 'מקצועי',  emoji: '📋' },
  { value: 'personal',     label: 'אישי',    emoji: '🤝' },
  { value: 'funny',        label: 'מצחיק',   emoji: '😄' },
];

const VARS = [
  '{{first_name}}', '{{full_name}}', '{{coach_name}}',
  '{{days}}', '{{booking_link}}', '{{health_score}}',
  '{{calories}}', '{{protein}}', '{{date}}',
];

const api = (fn, body = {}) => base44.functions.invoke(fn, body);

// ─── Single template card ─────────────────────────────────────────────────────

function TemplateCard({ t, trainees, onEdit, onDelete }) {
  const [previewing, setPreview] = useState(false);
  const [previewTrainee, setPTId] = useState('');
  const [previewResult, setPreviewRes] = useState(null);
  const [testResult, setTestRes] = useState('');

  const previewMut = useMutation({
    mutationFn: (tid) => api('previewMessageTemplate', { template_id: t.id, trainee_id: tid || undefined }),
    onSuccess: (d) => setPreviewRes(d?.data),
  });
  const testMut = useMutation({
    mutationFn: () => api('testSendMessageTemplate', { template_id: t.id, trainee_id: previewTrainee || undefined }),
    onSuccess: (d) => setTestRes(d?.data?.blocked ? '⊘ חסום' : d?.ok ? '✓ נשלח!' : '✗ נכשל'),
  });

  const seg  = SEGMENTS.find(s => s.value === (t.segment || '')) || SEGMENTS[0];
  const tone = TONES.find(to => to.value === (t.tone || ''))     || TONES[0];

  return (
    <div className={`bg-white border rounded-xl transition-all ${t.enabled ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
      {/* Header row */}
      <div className="flex items-center gap-2 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${seg.color}`}>{seg.label}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600">{tone.emoji} {tone.label}</span>
            {t.rotation_mode === 'sequential' && <span className="text-xs text-indigo-600">#{t.sequence_order || 0}</span>}
            {t.ai_generated  && <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">AI</span>}
          </div>
          <p className="text-sm font-medium text-slate-800 mt-0.5 truncate">{t.name}</p>
          {t.stats && (
            <div className="flex gap-2 mt-0.5 text-xs text-slate-500">
              <span>📤 {t.stats.sent}</span>
              {t.stats.conversion_rate !== null && (
                <span className={`font-medium ${t.stats.conversion_rate >= 30 ? 'text-green-600' : t.stats.conversion_rate >= 15 ? 'text-yellow-600' : 'text-slate-400'}`}>
                  🎯 {t.stats.conversion_rate}%
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => { setPreview(v => !v); setPreviewRes(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <Eye size={14} />
          </button>
          <button onClick={() => onEdit(t)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">✏️</button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 size={13} /></button>
        </div>
      </div>

      {/* Content preview */}
      <div className="px-3 pb-2">
        <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 whitespace-pre-line border border-slate-100 leading-relaxed">
          {t.content.slice(0, 140)}{t.content.length > 140 ? '...' : ''}
        </p>
      </div>

      {/* Preview panel */}
      {previewing && (
        <div className="px-3 pb-3 border-t border-slate-100 pt-2 space-y-2">
          <div className="flex gap-2">
            <select value={previewTrainee} onChange={e => { setPTId(e.target.value); setPreviewRes(null); setTestRes(''); }}
              className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5">
              <option value="">-- ערך לדוגמה --</option>
              {(trainees || []).map(tr => (
                <option key={tr.id} value={tr.id}>{tr.full_name || tr.user_email}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" className="text-xs h-8 px-2 gap-1"
              onClick={() => previewMut.mutate(previewTrainee)} disabled={previewMut.isPending}>
              <Eye size={11} /> תצוגה
            </Button>
            <Button size="sm" className="text-xs h-8 px-2 bg-teal-500 text-white gap-1"
              onClick={() => testMut.mutate()} disabled={testMut.isPending || !previewTrainee}>
              <Send size={11} /> שלח
            </Button>
          </div>
          {previewResult && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              <div className="text-xs text-green-600 font-medium mb-1">
                תצוגה מקדימה — סגמנט: {previewResult.segment}
              </div>
              {previewResult.rendered}
            </div>
          )}
          {testResult && <p className="text-xs font-medium text-center">{testResult}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Edit/Create modal ────────────────────────────────────────────────────────

function TemplateFormModal({ ruleCode, ruleId, template, onClose, onSaved }) {
  const isNew = !template?.id;
  const [form, setForm] = useState({
    name:           template?.name          || '',
    content:        template?.content       || '',
    segment:        template?.segment       || '',
    tone:           template?.tone          || '',
    rotation_mode:  template?.rotation_mode || 'random',
    sequence_order: template?.sequence_order ?? '',
    enabled:        template?.enabled       ?? true,
  });

  const [charCount, setCharCount] = useState(form.content.length);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const insertVar = (v) => set('content', form.content + v);

  const saveMut = useMutation({
    mutationFn: () => isNew
      ? api('createMessageTemplate', { rule_code: ruleCode, rule_id: ruleId, ...form, sequence_order: form.sequence_order || null })
      : api('updateMessageTemplate', { template_id: template.id, ...form, sequence_order: form.sequence_order || null }),
    onSuccess: (d) => { if (d?.ok) { onSaved(); onClose(); } },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-bold text-base text-slate-800">{isNew ? 'תבנית חדשה' : 'עריכת תבנית'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={16} className="text-slate-500" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">שם התבנית *</label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="תן שם לתבנית הזו..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">סגמנט</label>
              <select value={form.segment} onChange={e => set('segment', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {SEGMENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">טון</label>
              <select value={form.tone} onChange={e => set('tone', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {TONES.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">סדר שינוי</label>
              <div className="flex gap-2">
                <button onClick={() => set('rotation_mode', 'random')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${form.rotation_mode === 'random' ? 'bg-teal-500 text-white border-teal-500' : 'border-slate-200 text-slate-600'}`}>
                  <Shuffle size={11} /> אקראי
                </button>
                <button onClick={() => set('rotation_mode', 'sequential')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${form.rotation_mode === 'sequential' ? 'bg-teal-500 text-white border-teal-500' : 'border-slate-200 text-slate-600'}`}>
                  <RotateCcw size={11} /> רצפי
                </button>
              </div>
            </div>
            {form.rotation_mode === 'sequential' && (
              <div>
                <label className="text-xs text-slate-500 mb-1 block">מיקום בסדרה</label>
                <Input type="number" min={0} value={form.sequence_order} onChange={e => set('sequence_order', e.target.value)} placeholder="0, 1, 2..." />
              </div>
            )}
          </div>

          {/* Content */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">תוכן ההודעה *</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {VARS.map(v => (
                <button key={v} onClick={() => insertVar(v)}
                  className="text-xs px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 font-mono">
                  {v}
                </button>
              ))}
            </div>
            <textarea
              value={form.content}
              onChange={e => { set('content', e.target.value); setCharCount(e.target.value.length); }}
              rows={6}
              placeholder="כתוב כאן את תוכן ההודעה..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
            <div className={`text-right text-xs mt-0.5 ${charCount > 900 ? 'text-red-500' : 'text-slate-400'}`}>
              {charCount} תווים
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => set('enabled', !form.enabled)}
              className={`w-11 h-6 rounded-full relative ${form.enabled ? 'bg-teal-500' : 'bg-slate-300'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.enabled ? 'left-6' : 'left-1'}`} />
            </button>
            <span className="text-sm text-slate-600">תבנית מופעלת</span>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 text-sm">ביטול</Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !form.name || !form.content}
            className="flex-1 text-sm bg-teal-500 hover:bg-teal-600 text-white"
          >
            {saveMut.isPending ? 'שומר...' : isNew ? 'צור תבנית' : 'שמור'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────

export default function MessageTemplateEditor({ ruleCode, ruleName, ruleId, onClose }) {
  const qc = useQueryClient();
  const [editTemplate, setEdit] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { data: tplData, isLoading } = useQuery({
    queryKey:  ['message_templates', ruleCode],
    queryFn:   () => base44.functions.invoke('getMessageTemplates', { rule_code: ruleCode }),
    staleTime: 15000,
  });

  const { data: traineesData } = useQuery({
    queryKey: ['trainees_list'],
    queryFn:  () => base44.entities.Trainee.list(),
    staleTime: 60000,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.functions.invoke('deleteMessageTemplate', { template_id: id }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['message_templates', ruleCode] }),
  });

  const templates = tplData?.data?.templates || [];
  const trainees  = traineesData || [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['message_templates', ruleCode] });

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
      <div className="bg-white w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="font-bold text-base text-slate-800 flex items-center gap-2">
              <Zap size={16} className="text-teal-500" /> תבניות הודעה
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{ruleName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Info banner */}
        <div className="px-4 pt-3 flex items-start gap-2 bg-teal-50 mx-4 mt-3 rounded-xl p-3 border border-teal-100">
          <Info size={13} className="text-teal-500 mt-0.5 shrink-0" />
          <p className="text-xs text-teal-700 leading-relaxed">
            הוסף מספר תבניות לאוטומציה זו. המערכת תבחר אוטומטית לפי סגמנט המתאמן ולעולם לא תשלח את אותה תבנית פעמיים ברצף.
          </p>
        </div>

        {/* Template list */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          {isLoading && <div className="text-center py-8 text-slate-400 text-sm">טוען...</div>}

          {!isLoading && templates.length === 0 && (
            <div className="text-center py-10">
              <div className="text-4xl mb-2">💬</div>
              <p className="text-slate-500 text-sm">אין תבניות עדיין</p>
              <p className="text-xs text-slate-400 mt-1">הוסף תבנית ראשונה — המערכת תשתמש בה במקום ההודעה הסטנדרטית</p>
            </div>
          )}

          {templates.map(t => (
            <TemplateCard
              key={t.id}
              t={t}
              trainees={trainees}
              onEdit={(tmpl) => { setEdit(tmpl); setShowForm(true); }}
              onDelete={() => { if (window.confirm('למחוק תבנית זו?')) deleteMut.mutate(t.id); }}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-2 border-t border-slate-200 shrink-0">
          <Button
            className="w-full bg-teal-500 hover:bg-teal-600 text-white gap-2"
            onClick={() => { setEdit(null); setShowForm(true); }}
          >
            <Plus size={14} /> הוסף תבנית חדשה
          </Button>
        </div>
      </div>

      {showForm && (
        <TemplateFormModal
          ruleCode={ruleCode}
          ruleId={ruleId}
          template={editTemplate}
          onClose={() => setShowForm(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
