import React, { useState } from 'react';
import { MessageSquare, Send, Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function MealFeedbackChat({ planId, dayIndex, onPlanUpdated }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { changed, ai_response, before, after }

  const send = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      // PHASE 7: Log exact request being sent
      console.log('[MFC:7_REQUEST]', JSON.stringify({
        planId,
        dayIndex: dayIndex || 0,
        feedback_exact: text.trim(),
        feedback_len: text.trim().length,
      }));

      const res = await base44.functions.invoke('mealPlanFeedback', {
        plan_id:   planId,
        feedback:  text.trim(),
        day_index: dayIndex || 0,
      });

      // PHASE 7: Prove what base44.functions.invoke returned
      console.log('[MFC:7_RAW_RES]', JSON.stringify({
        res_type:     typeof res,
        res_keys:     res ? Object.keys(res) : null,
        res_ok:       res?.ok,
        has_data_key: res && 'data' in res,
        res_data_keys: res?.data ? Object.keys(res.data) : null,
        traceId:      res?.data?.traceId || res?.traceId || null,
      }));

      const data = res.data || res;

      console.log('[MFC:7_RESOLVED]', JSON.stringify({
        traceId:       data?.traceId,
        data_changed:  data?.changed,
        data_changed_bool: !!data?.changed,
        before_keys:   data?.before ? Object.keys(data.before) : null,
        before_calories: data?.before?.calories,
        before_total_cal: data?.before?.total_calories,
        after_keys:    data?.after ? Object.keys(data.after) : null,
        after_calories: data?.after?.calories,
        after_total_cal: data?.after?.total_calories,
        afterDbHash:   data?.after?.afterDbHash,
        ai_response:   data?.ai_response,
      }));

      setResult({
        changed:      !!data.changed,
        ai_response:  data.ai_response || (data.changed ? 'התפריט עודכן!' : 'לא בוצע שינוי.'),
        before:       data.before  || null,
        after:        data.after   || null,
      });

      if (data.changed) {
        setText('');
        // PHASE 8: Await the refresh and log its result
        if (onPlanUpdated) {
          console.log('[MFC:8_REFRESH_START]', JSON.stringify({ traceId: data?.traceId, planId }));
          await onPlanUpdated();
          console.log('[MFC:8_REFRESH_DONE]', JSON.stringify({ traceId: data?.traceId }));
        }
      }
    } catch (err) {
      console.error('[MFC:ERROR]', err.message);
      setResult({ changed: false, ai_response: 'שגיאה זמנית — נסה שוב.' });
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
  };

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
          {/* Result panel */}
          {result && (
            <div className={`rounded-xl p-3 border text-sm text-right leading-relaxed ${
              result.changed
                ? 'bg-green-50 border-green-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-start gap-2 mb-2">
                {result.changed
                  ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                  : <XCircle      className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                <p className={result.changed ? 'text-green-800' : 'text-amber-800'}>
                  {result.ai_response}
                </p>
              </div>

              {/* BEFORE / AFTER comparison — shown only when a real change occurred */}
              {result.changed && result.before && result.after && (
                <div className="mt-2 pt-2 border-t border-green-200">
                  <div className="grid grid-cols-3 gap-2 text-xs text-center">
                    <div className="bg-white rounded-lg px-2 py-1.5 border border-slate-200">
                      <p className="text-slate-400 mb-0.5">לפני</p>
                      <p className="font-bold text-slate-700">{result.before.calories} קק"ל</p>
                      <p className="text-slate-500">ח{result.before.protein}ג פ{result.before.carbs}ג ש{result.before.fat}ג</p>
                    </div>
                    <div className="flex items-center justify-center">
                      <ArrowRight className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="bg-green-100 rounded-lg px-2 py-1.5 border border-green-300">
                      <p className="text-green-600 mb-0.5">אחרי</p>
                      <p className="font-bold text-green-800">{result.after.calories} קק"ל</p>
                      <p className="text-green-700">ח{result.after.protein}ג פ{result.after.carbs}ג ש{result.after.fat}ג</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

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
          />

          <button
            onClick={send}
            disabled={loading || !text.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50"
            style={{ backgroundColor: loading ? '#a7f3f0' : '#79DBD6' }}
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
        </div>
      )}
    </div>
  );
}
