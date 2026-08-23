/**
 * FollowUpEditor — visual follow-up sequence builder.
 *
 * Shows a timeline: initial send → delay → step 2 → delay → step 3 → ... → coach attention.
 * Coaches see days and messages, never JSON or state-machine terminology.
 */
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, MessageSquare, AlertTriangle } from 'lucide-react';

const MAX_FOLLOWUP_STEPS = 3;

function generateStepId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function defaultStep() {
  return {
    _id:              generateStepId(),
    delay_days:       3,
    message_template: '',
    action:           'send',
  };
}

// ── Connector between steps (shows the delay) ─────────────────────────────────
function StepConnector({ delayDays, onDelayChange }) {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-px h-3 bg-slate-300" />
      <div className="flex items-center gap-1.5 my-1 bg-white border border-slate-200 rounded-full px-3 py-1 shadow-sm">
        <span className="text-xs text-slate-500">אחרי</span>
        <Input
          type="number"
          min={1}
          max={90}
          value={delayDays}
          onChange={e => onDelayChange(Number(e.target.value))}
          className="w-12 h-6 text-xs text-center px-1 py-0 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
          onClick={e => e.stopPropagation()}
        />
        <span className="text-xs text-slate-500">ימים</span>
      </div>
      <div className="w-px h-3 bg-slate-300" />
      <div className="text-slate-300 text-xs leading-none">▼</div>
    </div>
  );
}

// ── Step card ──────────────────────────────────────────────────────────────────
function FollowUpStepCard({ step, index, total, onChange, onDelete }) {
  const update = (key, val) => onChange({ ...step, [key]: val });
  const stepNum = index + 2; // step 1 is the initial send

  return (
    <div className={`rounded-xl border-2 overflow-hidden ${step.action === 'escalate' ? 'border-amber-200 bg-amber-50' : 'border-teal-200 bg-white'}`}>
      {/* Card header */}
      <div className={`flex items-center gap-2.5 px-4 py-2.5 border-b ${step.action === 'escalate' ? 'bg-amber-100 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
        <span className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ${step.action === 'escalate' ? 'bg-amber-500' : 'bg-teal-500'}`}>
          {stepNum}
        </span>
        <span className="font-semibold text-sm text-slate-700 flex-1">
          {step.action === 'escalate' ? '🔔 העלאה לטיפול מאמן' : `הודעת מעקב ${index + 1}`}
        </span>
        {total > 1 && (
          <button type="button" onClick={onDelete}
            className="p-1 rounded-lg hover:bg-red-100 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Action type selector */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex gap-2">
          <button type="button" onClick={() => update('action', 'send')}
            className={`flex-1 py-2 px-3 rounded-xl border-2 text-xs font-semibold transition-all ${step.action === 'send' ? 'border-teal-400 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 bg-white hover:border-teal-200'}`}>
            💬 שלח הודעה
          </button>
          <button type="button" onClick={() => update('action', 'escalate')}
            className={`flex-1 py-2 px-3 rounded-xl border-2 text-xs font-semibold transition-all ${step.action === 'escalate' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600 bg-white hover:border-amber-200'}`}>
            🔔 דורש טיפול
          </button>
        </div>
      </div>

      {/* Message template */}
      {step.action === 'send' && (
        <div className="px-4 pb-4 pt-3 space-y-2">
          <Textarea
            value={step.message_template}
            onChange={e => update('message_template', e.target.value)}
            placeholder={`תוכן הודעת מעקב ${index + 1}...`}
            className="text-sm min-h-[90px] resize-none text-right"
            dir="rtl"
          />
          <p className="text-xs text-slate-400">
            ניתן להשתמש ב-{'{{trainee_name}}'}, {'{{absence_count}}'}, {'{{coach_name}}'} וכד׳
          </p>
        </div>
      )}

      {/* Escalate info */}
      {step.action === 'escalate' && (
        <div className="px-4 pb-4 pt-3">
          <div className="bg-amber-100 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              המתאמן יופיע ב<strong>דורש טיפול</strong> לטיפול אישי שלך. לא תישלח הודעה אוטומטית נוספת.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Terminal step: coach attention (always shown when follow-up enabled) ───────
function EscalateTerminal() {
  return (
    <div className="rounded-xl border-2 border-dashed border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
      <span className="w-7 h-7 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center text-amber-600 text-sm flex-shrink-0">
        🔔
      </span>
      <div>
        <p className="text-sm font-semibold text-amber-800">דורש טיפול מאמן</p>
        <p className="text-xs text-amber-600">אם המתאמן לא הגיב לכל שלבי המעקב — יופיע בתצוגת &ldquo;דורש טיפול&rdquo;</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FollowUpEditor({ config, onChange }) {
  const enabled = config?.enabled ?? false;
  const steps   = config?.steps   ?? [];

  const handleEnable = val => {
    if (val && steps.length === 0) {
      onChange({ enabled: true, steps: [defaultStep()] });
    } else {
      onChange({ ...(config || {}), enabled: val, steps });
    }
  };

  const updateStep = (idx, updated) =>
    onChange({ enabled, steps: steps.map((s, i) => i === idx ? updated : s) });

  const addStep = () => {
    if (steps.length >= MAX_FOLLOWUP_STEPS) return;
    onChange({ enabled, steps: [...steps, defaultStep()] });
  };

  const deleteStep = (idx) => {
    const next = steps.filter((_, i) => i !== idx);
    if (next.length === 0) {
      onChange({ enabled: false, steps: [] });
    } else {
      onChange({ enabled, steps: next });
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3.5 bg-slate-50">
        <div>
          <p className="text-sm font-bold text-slate-800">הפעל רצף מעקב</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {enabled
              ? `${steps.length} שלב${steps.length !== 1 ? 'י' : ''} מעקב — שולח הודעות ממוקדות אם המתאמן לא חוזר`
              : 'שלח הודעות מעקב אוטומטיות לאחר שליחת ההודעה הראשונה'}
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={handleEnable} />
      </div>

      {!enabled && (
        <div className="text-center py-4 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
          הפעל כדי להגדיר רצף הודעות מעקב אוטומטי
        </div>
      )}

      {enabled && (
        <div>
          {/* Timeline */}
          <div className="relative">

            {/* Step 1 — Initial send (read-only reference) */}
            <div className="rounded-xl border-2 border-teal-300 bg-teal-50 px-4 py-3 flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-teal-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                1
              </span>
              <div>
                <p className="text-sm font-semibold text-teal-800">שליחה ראשונה</p>
                <p className="text-xs text-teal-600">ההודעה הראשונה שהוגדרה בסעיף ③</p>
              </div>
            </div>

            {/* Follow-up steps with connectors */}
            {steps.map((step, idx) => (
              <React.Fragment key={step._id || idx}>
                <StepConnector
                  delayDays={step.delay_days}
                  onDelayChange={days => updateStep(idx, { ...step, delay_days: days })}
                />
                <FollowUpStepCard
                  step={step}
                  index={idx}
                  total={steps.length}
                  onChange={updated => updateStep(idx, updated)}
                  onDelete={() => deleteStep(idx)}
                />
              </React.Fragment>
            ))}

            {/* Terminal: coach attention */}
            {steps.length > 0 && !steps[steps.length - 1]?.action === 'escalate' && (
              <>
                <div className="flex flex-col items-center py-1">
                  <div className="w-px h-3 bg-slate-300" />
                  <div className="text-slate-300 text-xs">▼</div>
                </div>
                <EscalateTerminal />
              </>
            )}

            {steps.length === 0 && <EscalateTerminal />}
          </div>

          {/* Add step */}
          {steps.length < MAX_FOLLOWUP_STEPS && (
            <Button type="button" variant="outline" onClick={addStep}
              className="w-full mt-3 border-dashed border-teal-300 text-teal-700 hover:bg-teal-50 gap-2">
              <Plus className="w-4 h-4" />
              הוסף שלב מעקב
            </Button>
          )}

          {steps.length >= MAX_FOLLOWUP_STEPS && (
            <p className="text-xs text-slate-400 text-center mt-3">
              מקסימום {MAX_FOLLOWUP_STEPS} שלבי מעקב
            </p>
          )}
        </div>
      )}
    </div>
  );
}
