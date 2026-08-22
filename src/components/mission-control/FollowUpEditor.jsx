/**
 * FollowUpEditor — editor for a follow-up sequence inside AutomationEditorDrawer.
 *
 * Lets the coach configure 1–4 follow-up steps, each with:
 *   - Delay (days since previous step)
 *   - Message template (or "escalate to coach")
 *   - Message variants (optional)
 *
 * The component is intentionally focused on simple linear sequences.
 * It does NOT expose JSON or cron syntax.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

const MAX_STEPS = 4;

function generateStepId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function defaultStep(stepNum) {
  return {
    _id:              generateStepId(),
    step:             stepNum,
    delay_days:       3,
    message_template: '',
    message_variants: null,
    action:           'send', // 'send' | 'escalate'
  };
}

// ── Single step card ──────────────────────────────────────────────────────────
function StepCard({ stepData, index, total, onChange, onDelete }) {
  const [open, setOpen] = useState(true);
  const stepNum = index + 2; // Steps start at 2 (step 1 = initial send)

  const update = (key, val) => onChange({ ...stepData, [key]: val });

  return (
    <div className="border-2 border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-200">
        <span className="w-6 h-6 rounded-full bg-teal-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
          {stepNum}
        </span>
        <span className="font-semibold text-sm text-slate-700 flex-1">שלב {stepNum}</span>
        <button type="button" onClick={() => setOpen(v => !v)}
          className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {total > 1 && (
          <button type="button" onClick={onDelete}
            className="p-1 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="px-4 py-3 space-y-3">
          {/* Delay */}
          <div className="space-y-1">
            <Label className="text-xs text-slate-600">שלח לאחר:</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={90} value={stepData.delay_days}
                onChange={e => update('delay_days', Number(e.target.value))}
                className="w-20 text-center text-sm" />
              <span className="text-sm text-slate-600">ימים מהשלב הקודם</span>
            </div>
          </div>

          {/* Action type */}
          <div className="space-y-1">
            <Label className="text-xs text-slate-600">פעולה:</Label>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => update('action', 'send')}
                className={`flex-1 py-2 px-3 rounded-xl border-2 text-xs font-medium transition-all text-right ${stepData.action === 'send' ? 'border-teal-400 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}>
                <div className="font-semibold">שלח הודעה</div>
              </button>
              <button type="button"
                onClick={() => update('action', 'escalate')}
                className={`flex-1 py-2 px-3 rounded-xl border-2 text-xs font-medium transition-all text-right ${stepData.action === 'escalate' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600'}`}>
                <div className="font-semibold">העלה לטיפול מאמן</div>
              </button>
            </div>
          </div>

          {/* Message template (only for send action) */}
          {stepData.action === 'send' && (
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">הודעה:</Label>
              <Textarea
                value={stepData.message_template}
                onChange={e => update('message_template', e.target.value)}
                placeholder={`תוכן הודעת שלב ${stepNum}...`}
                className="text-sm min-h-[80px] resize-none text-right"
                dir="rtl"
              />
              <p className="text-xs text-slate-400">משתנים נתמכים: {'{{trainee_name}}'}, {'{{absence_count}}'}, וכו׳</p>
            </div>
          )}

          {/* Escalate info */}
          {stepData.action === 'escalate' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                מתאמן זה יופיע בתצוגת &ldquo;דורש טיפול&rdquo; עבורך לטיפול אישי.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FollowUpEditor({ config, onChange }) {
  // config = { enabled: bool, steps: [...] } | null
  const enabled = config?.enabled ?? false;
  const steps   = config?.steps ?? [];

  const handleEnable = (val) => {
    if (val && steps.length === 0) {
      onChange({ enabled: true, steps: [defaultStep(2)] });
    } else {
      onChange({ ...config, enabled: val, steps });
    }
  };

  const updateStep = (idx, updated) => {
    const next = steps.map((s, i) => i === idx ? updated : s);
    onChange({ enabled, steps: next });
  };

  const addStep = () => {
    if (steps.length >= MAX_STEPS - 1) return; // max steps is 4 (step1 + 3 follow-ups)
    const nextStepNum = steps.length > 0 ? Math.max(...steps.map(s => s.step)) + 1 : 2;
    onChange({ enabled, steps: [...steps, defaultStep(nextStepNum)] });
  };

  const deleteStep = (idx) => {
    const next = steps.filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, step: i + 2 })); // renumber
    if (next.length === 0) {
      onChange({ enabled: false, steps: [] });
    } else {
      onChange({ enabled, steps: next });
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
        <div>
          <p className="text-sm font-semibold text-slate-800">רצף מעקב</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {enabled
              ? `${steps.length} שלב${steps.length !== 1 ? 'י' : ''} מעקב מוגדר${steps.length !== 1 ? 'ים' : ''}`
              : 'שלח הודעות מעקב אוטומטיות לאחר שליחת ההודעה הראשונה'}
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={handleEnable} />
      </div>

      {!enabled && (
        <p className="text-xs text-slate-400 text-center py-1">
          הפעל כדי להגדיר הודעות מעקב אוטומטיות
        </p>
      )}

      {enabled && (
        <>
          {/* Step 1 — read-only summary */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="w-6 h-6 rounded-full bg-slate-400 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                1
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-700">שלב 1 — שליחה ראשונה</p>
                <p className="text-xs text-slate-400">מוגדר בסעיף ההודעה למעלה</p>
              </div>
            </div>
          </div>

          {/* Follow-up steps */}
          {steps.map((step, idx) => (
            <StepCard
              key={step._id || idx}
              stepData={step}
              index={idx}
              total={steps.length}
              onChange={updated => updateStep(idx, updated)}
              onDelete={() => deleteStep(idx)}
            />
          ))}

          {/* Add step */}
          {steps.length < MAX_STEPS - 1 && (
            <Button type="button" variant="outline" onClick={addStep}
              className="w-full border-dashed border-teal-300 text-teal-700 hover:bg-teal-50 gap-2 text-sm">
              <Plus className="w-4 h-4" />
              הוסף שלב מעקב
            </Button>
          )}

          {steps.length >= MAX_STEPS - 1 && (
            <p className="text-xs text-slate-400 text-center">
              מקסימום {MAX_STEPS - 1} שלבי מעקב
            </p>
          )}
        </>
      )}
    </div>
  );
}
