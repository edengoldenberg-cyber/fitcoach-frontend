import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Loader2, CheckCircle2, XCircle, Plus, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { CALORIE_TARGET_CHOICE_UI } from '@/config/featureFlags';
import { detectCalorieTargetIntent } from './calorieIntentDetector';

// uiState values (only used when CALORIE_TARGET_CHOICE_UI is true):
//   'idle'          — normal text input
//   'choice'        — A/B/Cancel panel shown, no API call made
//   'confirmCreate' — second confirmation before Option B
//   'adaptLoading'  — Option A: calling mealPlanFeedback
//   'createLoading' — Option B: polling startMealGenerationJob
//   'adaptSuccess'  — Option A succeeded
//   'adaptFailed'   — Option A failed (may offer "Create instead" button)
//   'createSuccess' — Option B succeeded
//   'createFailed'  — Option B failed

// ── Stage mapping for the create-new progress panel ──────────────────────────
const MFC_STAGE_LABELS = {
  REQUEST_ACCEPTED:       'בקשה התקבלה',
  INPUTS_LOADED:          'נתונים נטענו',
  AI_GENERATION_STARTED:  'ה-AI מייצר תפריט',
  AI_RESPONSE_RECEIVED:   'תגובת AI התקבלה',
  WEEKLY_DAYS_PARSED:     'מעבד 7 ימים',
  NORMALIZATION_COMPLETED:'נרמול ערכים',
  REPAIR_STARTED:         'בודק דיוק תזונתי',
  REPAIR_COMPLETED:       'תיקון הושלם',
  VALIDATION_COMPLETED:   'ולידציה עברה',
  TRANSACTION_STARTED:    'שומר תפריט',
  PLAN_SAVED:             'תפריט נשמר',
  ACTIVE_PLAN_CONFIRMED:  'הושלם!',
  FAILED:                 'נכשל',
};
const MFC_STAGE_STEPS = {
  REQUEST_ACCEPTED: 1, INPUTS_LOADED: 2, AI_GENERATION_STARTED: 3,
  AI_RESPONSE_RECEIVED: 4, WEEKLY_DAYS_PARSED: 5, NORMALIZATION_COMPLETED: 6,
  REPAIR_STARTED: 7, REPAIR_COMPLETED: 8, VALIDATION_COMPLETED: 9,
  TRANSACTION_STARTED: 9, PLAN_SAVED: 10, ACTIVE_PLAN_CONFIRMED: 10,
};
const MFC_STAGE_TOTAL = 10;
const getMFCStageLabel = (stage) => MFC_STAGE_LABELS[stage] || stage || 'מעבד...';

export default function MealFeedbackChat({ planId, dayIndex, onPlanUpdated, onDayChanged, onEditSuccess }) {
  const [open,            setOpen]            = useState(false);
  const [text,            setText]            = useState('');
  const [loading,         setLoading]         = useState(false);
  const [status,          setStatus]          = useState(null);
  const [uiState,         setUiState]         = useState('idle');
  const [detectedIntent,  setDetectedIntent]  = useState(null);

  // ── Create-new progress state ──────────────────────────────────────────────
  const [createJobId,        setCreateJobId]        = useState(null);
  const [createJobProgress,  setCreateJobProgress]  = useState(0);
  const [createJobStage,     setCreateJobStage]     = useState('');
  const [createJobStep,      setCreateJobStep]      = useState(null);
  const [createJobStartTime, setCreateJobStartTime] = useState(null);

  const suppressTimer  = useRef(null);
  const submitting     = useRef(false);
  const createPollRef  = useRef(null);

  // localStorage key for job resume — tied to the source plan
  const JOB_LS_KEY = planId ? `mfcCreateJob_${planId}` : null;

  const stopCreatePoll = () => {
    if (createPollRef.current) { clearInterval(createPollRef.current); createPollRef.current = null; }
  };

  // Cleanup on unmount
  useEffect(() => () => { stopCreatePoll(); clearTimeout(suppressTimer.current); }, []);

  // Meal-editing event broadcast (unchanged)
  useEffect(() => {
    clearTimeout(suppressTimer.current);
    if (loading) {
      window.dispatchEvent(new CustomEvent('fitcoach:meal-editing', { detail: { active: true } }));
    } else {
      suppressTimer.current = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('fitcoach:meal-editing', { detail: { active: false } }));
      }, 5000);
    }
    return () => clearTimeout(suppressTimer.current);
  }, [loading]);

  // ── Resume in-progress create job on mount ────────────────────────────────
  useEffect(() => {
    if (!JOB_LS_KEY) return;
    const savedId = localStorage.getItem(JOB_LS_KEY);
    if (!savedId) return;
    base44.functions.invoke('getMealJobStatus', { job_id: savedId })
      .then(res => {
        const job = res?.data;
        if (!job) { localStorage.removeItem(JOB_LS_KEY); return; }
        if (job.status === 'queued' || job.status === 'running') {
          setCreateJobId(savedId);
          setLoading(true);
          setUiState('createLoading');
          setOpen(true);
          setCreateJobProgress(job.progress || 5);
          setCreateJobStage(getMFCStageLabel(job.stage));
          setCreateJobStep(MFC_STAGE_STEPS[job.stage] || null);
          setCreateJobStartTime(Date.now() - 60000);
          if (job.requested_calories) {
            setDetectedIntent({ target_calories: job.requested_calories, intent: 'calorie_target_change' });
          }
          submitting.current = true;
        } else {
          localStorage.removeItem(JOB_LS_KEY);
        }
      })
      .catch(() => localStorage.removeItem(JOB_LS_KEY));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JOB_LS_KEY]);

  // ── Polling interval — fires every 5s while create job is active ──────────
  useEffect(() => {
    if (!createJobId || uiState !== 'createLoading') return;
    stopCreatePoll();

    createPollRef.current = setInterval(async () => {
      try {
        const res = await base44.functions.invoke('getMealJobStatus', { job_id: createJobId });
        const job = res?.data;
        if (!job) return;

        if (job.progress != null && job.stage !== 'ACTIVE_PLAN_CONFIRMED') {
          setCreateJobProgress(Math.min(job.progress, 99));
        }
        setCreateJobStage(getMFCStageLabel(job.stage));
        setCreateJobStep(MFC_STAGE_STEPS[job.stage] || null);

        if (job.status === 'completed' && job.active_plan_id) {
          stopCreatePoll();
          setCreateJobProgress(100);
          setCreateJobStage('הושלם!');
          if (JOB_LS_KEY) localStorage.removeItem(JOB_LS_KEY);

          let refreshOk = false;
          try { if (onPlanUpdated) await onPlanUpdated(); refreshOk = true; } catch {}

          setUiState('createSuccess');
          setStatus({ type: 'success', message: `תפריט חדש נוצר ל-${detectedIntent?.target_calories || ''} קלוריות.` });
          if (refreshOk && onEditSuccess) onEditSuccess({});
          setLoading(false);
          setCreateJobId(null);
          submitting.current = false;
          setTimeout(() => { setCreateJobProgress(0); setCreateJobStage(''); setCreateJobStep(null); }, 1500);

        } else if (job.status === 'failed') {
          stopCreatePoll();
          if (JOB_LS_KEY) localStorage.removeItem(JOB_LS_KEY);
          setUiState('createFailed');
          setStatus({ type: 'error', message: 'לא הצלחתי ליצור תפריט חדש. התפריט הנוכחי נשמר.' });
          setLoading(false);
          setCreateJobId(null);
          setCreateJobProgress(0);
          setCreateJobStage('');
          setCreateJobStep(null);
          submitting.current = false;
        }
      } catch (err) {
        console.warn('[MFC] poll error:', err.message);
      }
    }, 5000);

    return stopCreatePoll;
  }, [createJobId, uiState]);

  const resetToIdle = () => {
    setUiState('idle');
    setDetectedIntent(null);
    setStatus(null);
  };

  // ── Option A: adapt existing plan ─────────────────────────────────────────
  const doAdapt = async (feedbackText) => {
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setStatus(null);
    setUiState('adaptLoading');
    try {
      const res = await base44.functions.invoke('mealPlanFeedback', {
        plan_id:   planId,
        feedback:  feedbackText,
        day_index: dayIndex || 0,
      });

      const data    = res.data || res;
      const changed = !!data.changed;

      if (changed) {
        setText('');
        if (onEditSuccess) onEditSuccess(data);

        let refreshOk = false;
        try {
          if (onPlanUpdated) await onPlanUpdated();
          refreshOk = true;
        } catch {}

        if (!refreshOk) {
          setStatus({ type: 'error', message: 'התפריט נשמר, אך המסך לא התרענן. אנא טעינה מחדש.' });
          setUiState('adaptFailed');
          return;
        }

        setUiState('adaptSuccess');
        setStatus({ type: 'success', message: 'השינוי בוצע — ראה סיכום למעלה' });

        const firstChangedIdx = data.changed_indexes?.[0];
        if (typeof firstChangedIdx === 'number' && onDayChanged) onDayChanged(firstChangedIdx);
      } else {
        setUiState('adaptFailed');
        const targetCal = detectedIntent?.target_calories;
        const msg = targetCal
          ? `לא הצלחתי להתאים את התפריט הקיים ל-${targetCal} קלוריות בצורה מדויקת. התפריט הקודם נשמר ללא שינוי.`
          : (data.ai_response || 'לא בוצע שינוי — נסה לנסח אחרת.');
        setStatus({ type: 'error', message: msg });
      }
    } catch (err) {
      console.error('[MFC] mealPlanFeedback failed:', err.message);
      setUiState('adaptFailed');
      setStatus({ type: 'error', message: 'שגיאה זמנית — נסה שוב.' });
    } finally {
      setLoading(false);
      submitting.current = false;
    }
  };

  // ── Option B: create new plan via async job ───────────────────────────────
  const doCreateNew = async () => {
    if (!detectedIntent || submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setUiState('createLoading');
    setCreateJobProgress(5);
    setCreateJobStage('מתחיל יצירה');
    setCreateJobStep(1);
    setCreateJobStartTime(Date.now());

    try {
      const startRes = await base44.functions.invoke('startMealGenerationJob', {
        plan_id:         planId,
        mode:            'calorie_target',
        target_calories: detectedIntent.target_calories,
      });

      const jobId = startRes?.data?.job_id;
      if (!jobId) throw new Error('Failed to start generation job');

      if (JOB_LS_KEY) localStorage.setItem(JOB_LS_KEY, jobId);
      setCreateJobId(jobId);
      setCreateJobProgress(startRes?.data?.existing ? 20 : 5);
      // Polling useEffect takes over from here

    } catch (err) {
      console.error('[MFC] doCreateNew failed:', err.message);
      setUiState('createFailed');
      setStatus({ type: 'error', message: 'שגיאה זמנית — התפריט הנוכחי נשמר.' });
      setLoading(false);
      setCreateJobProgress(0);
      setCreateJobStage('');
      setCreateJobStep(null);
      submitting.current = false;
    }
  };

  // ── Main send — existing path when flag is off ────────────────────────────
  const send = async () => {
    if (!text.trim() || loading) return;

    if (CALORIE_TARGET_CHOICE_UI) {
      const intent = detectCalorieTargetIntent(text.trim());
      if (intent) {
        setDetectedIntent(intent);
        setUiState('choice');
        return;
      }
    }

    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setStatus(null);
    try {
      const res = await base44.functions.invoke('mealPlanFeedback', {
        plan_id:   planId,
        feedback:  text.trim(),
        day_index: dayIndex || 0,
      });

      const data    = res.data || res;
      const changed = !!data.changed;

      if (changed) {
        setText('');
        if (onEditSuccess) onEditSuccess(data);

        let refreshOk = false;
        try {
          if (onPlanUpdated) await onPlanUpdated();
          refreshOk = true;
        } catch {}

        if (!refreshOk) {
          setStatus({ type: 'error', message: 'התפריט נשמר, אך המסך לא התרענן. אנא טעינה מחדש.' });
          return;
        }

        setStatus({ type: 'success', message: 'השינוי בוצע — ראה סיכום למעלה' });

        const firstChangedIdx = data.changed_indexes?.[0];
        if (typeof firstChangedIdx === 'number' && onDayChanged) onDayChanged(firstChangedIdx);
      } else {
        setStatus({ type: 'error', message: data.ai_response || 'לא בוצע שינוי — נסה לנסח אחרת.' });
      }
    } catch (err) {
      console.error('[MFC] mealPlanFeedback failed:', err.message);
      setStatus({ type: 'error', message: 'שגיאה זמנית — נסה שוב.' });
    } finally {
      setLoading(false);
      submitting.current = false;
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
  };

  const isLoading = loading;
  const choiceActive = CALORIE_TARGET_CHOICE_UI &&
    ['choice', 'confirmCreate', 'adaptLoading', 'createLoading'].includes(uiState);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-purple-500" />
          </div>
          <span className="font-semibold text-slate-800 text-sm">שינויים בתפריט</span>
        </div>
        <span className="text-xs text-purple-500">בקש שינוי מה-AI</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-3">

          {/* Status banner */}
          {status && uiState !== 'createLoading' && (
            <div className={`rounded-xl p-3 border text-sm text-right flex items-center gap-2 ${
              status.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              {status.type === 'success'
                ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                : <XCircle      className="w-4 h-4 text-amber-600 shrink-0" />}
              <p className="text-xs">{status.message}</p>
            </div>
          )}

          {/* "Create instead" button — shown after failed adapt */}
          {CALORIE_TARGET_CHOICE_UI && uiState === 'adaptFailed' && detectedIntent && (
            <button
              onClick={() => setUiState('confirmCreate')}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-teal-300 text-teal-700 text-sm font-medium hover:bg-teal-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              צור במקום זאת תפריט חדש ל-{detectedIntent.target_calories} קלוריות
            </button>
          )}

          {/* ── CHOICE PANEL ── */}
          {CALORIE_TARGET_CHOICE_UI && uiState === 'choice' && detectedIntent && (
            <div className="space-y-3" dir="rtl">
              <p className="text-sm font-semibold text-slate-800 text-right">
                כיצד תרצה לעדכן את התפריט ל-{detectedIntent.target_calories} קלוריות?
              </p>

              <button
                onClick={() => doAdapt(text.trim())}
                disabled={isLoading}
                className="w-full text-right p-3 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 transition-colors"
              >
                <p className="font-semibold text-teal-800 text-sm">התאם את התפריט הקיים</p>
                <p className="text-xs text-teal-600 mt-0.5">
                  נשמור ככל האפשר על המאכלים והמבנה הקיימים, ונשנה בעיקר כמויות. התהליך עשוי לקחת יותר זמן.
                </p>
              </button>

              <button
                onClick={() => setUiState('confirmCreate')}
                disabled={isLoading}
                className="w-full text-right p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <p className="font-semibold text-slate-800 text-sm">צור תפריט חדש</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  נבנה תפריט חדש לפי ההעדפות שלך וביעד של {detectedIntent.target_calories} קלוריות.
                </p>
              </button>

              <button
                onClick={resetToIdle}
                disabled={isLoading}
                className="w-full py-2 rounded-xl text-slate-400 text-sm hover:text-slate-600 transition-colors"
              >
                ביטול
              </button>
            </div>
          )}

          {/* ── CONFIRM CREATE PANEL ── */}
          {CALORIE_TARGET_CHOICE_UI && uiState === 'confirmCreate' && detectedIntent && (
            <div className="space-y-3" dir="rtl">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-800 text-right">
                  יצירת תפריט חדש עשויה לשנות את המאכלים והמבנה הקיימים.
                  התפריט הנוכחי לא יוחלף עד שהתפריט החדש ייווצר ויעבור בדיקות איכות.
                </p>
              </div>

              <button
                onClick={doCreateNew}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white bg-teal-500 hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                צור תפריט חדש
              </button>

              <button
                onClick={() => setUiState('choice')}
                disabled={isLoading}
                className="w-full py-2 rounded-xl text-slate-400 text-sm hover:text-slate-600 transition-colors"
              >
                חזור
              </button>
            </div>
          )}

          {/* ── ADAPT LOADING — simple spinner ── */}
          {CALORIE_TARGET_CHOICE_UI && uiState === 'adaptLoading' && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
              מתאים את התפריט הקיים...
            </div>
          )}

          {/* ── CREATE LOADING — real backend progress panel ── */}
          {CALORIE_TARGET_CHOICE_UI && uiState === 'createLoading' && (() => {
            const elapsedMs   = createJobStartTime ? Date.now() - createJobStartTime : 0;
            const rateMs      = createJobProgress > 5 ? elapsedMs / createJobProgress : null;
            const remainingMs = rateMs ? Math.max(0, rateMs * (100 - createJobProgress)) : null;
            const remainingMin = remainingMs != null ? Math.ceil(remainingMs / 60000) : null;
            const estLabel = remainingMin == null
              ? null
              : remainingMin <= 1
                ? 'פחות מדקה (הערכה)'
                : `~${remainingMin} דקות (הערכה)`;
            return (
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-teal-800">{createJobStage || 'מתחיל...'}</span>
                  <div className="flex items-center gap-2">
                    {createJobStep != null && (
                      <span className="text-teal-600">שלב {createJobStep} מתוך {MFC_STAGE_TOTAL}</span>
                    )}
                    <span className="text-teal-700 font-mono font-bold">{createJobProgress}%</span>
                  </div>
                </div>
                <div className="w-full bg-teal-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(createJobProgress, 4)}%`,
                      background: 'linear-gradient(90deg, #79DBD6, #3b82f6)',
                    }}
                  />
                </div>
                {estLabel && createJobProgress > 5 && createJobProgress < 99 && (
                  <p className="text-xs text-teal-600 text-center">{estLabel}</p>
                )}
                {createJobProgress <= 5 && (
                  <p className="text-xs text-teal-600 text-center">ה-AI בונה תפריט חדש — 3–5 דקות</p>
                )}
                {createJobStartTime && (Date.now() - createJobStartTime) > 180000 && createJobProgress < 90 && (
                  <p className="text-xs text-amber-600 text-center">ממשיך לעבוד ברקע — אפשר לסגור ולחזור</p>
                )}
              </div>
            );
          })()}

          {/* ── NORMAL INPUT — shown when choice UI is not active ── */}
          {!choiceActive && (
            <>
              <div className="text-xs text-slate-400 text-right">
                דוגמאות: "שנה ל-1800 קלוריות" / "הגדל חלבון" / "החלף ארוחת בוקר" / "תפריט צמחוני"
              </div>

              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKey}
                placeholder="מה תרצה לשנות בתפריט?"
                className="w-full border border-slate-200 rounded-xl p-3 text-sm text-right resize-none focus:outline-none focus:border-teal-400"
                rows={3}
                dir="rtl"
                disabled={isLoading}
              />

              <button
                onClick={send}
                disabled={isLoading || !text.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50"
                style={{ backgroundColor: isLoading ? '#a7f3f0' : '#79DBD6' }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    מחשב שינוי...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    בצע שינוי
                  </>
                )}
              </button>
              <p className="text-xs text-slate-400 text-center">Ctrl+Enter לשליחה מהירה</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
