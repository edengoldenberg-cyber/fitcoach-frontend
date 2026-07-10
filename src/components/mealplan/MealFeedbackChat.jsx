import React, { useState } from 'react';
import { MessageSquare, Send, Loader2, CheckCircle2, XCircle, ArrowRight, Plus, Minus } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// ── Change summary renderer ────────────────────────────────────────────────────

function ChangedMealRow({ meal }) {
  if (meal.type === 'added') {
    return (
      <div className="text-xs text-right space-y-0.5">
        <p className="text-green-700 font-medium">נוספה: {meal.after_name}</p>
        {meal.added_items?.length > 0 && (
          <p className="text-green-600">מרכיבים: {meal.added_items.join('، ')}</p>
        )}
      </div>
    );
  }
  if (meal.type === 'removed') {
    return (
      <div className="text-xs text-right space-y-0.5">
        <p className="text-red-600 font-medium line-through">{meal.before_name}</p>
      </div>
    );
  }
  // modified
  const nameChanged = meal.before_name !== meal.after_name;
  return (
    <div className="text-xs text-right space-y-1">
      {nameChanged ? (
        <div className="flex items-center gap-1 justify-end flex-wrap">
          <span className="text-slate-500 line-through">{meal.before_name}</span>
          <ArrowRight className="w-3 h-3 text-green-500 flex-shrink-0" />
          <span className="text-green-700 font-medium">{meal.after_name}</span>
        </div>
      ) : (
        <p className="text-slate-600 font-medium">{meal.after_name}</p>
      )}
      {meal.removed_items?.length > 0 && (
        <div className="flex items-start gap-1 justify-end">
          <span className="text-slate-500 line-through">{meal.removed_items.join('، ')}</span>
          <Minus className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
        </div>
      )}
      {meal.added_items?.length > 0 && (
        <div className="flex items-start gap-1 justify-end">
          <span className="text-green-600">{meal.added_items.join('، ')}</span>
          <Plus className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
        </div>
      )}
    </div>
  );
}

function DaySummaryRow({ day }) {
  const mealCountChanged = day.before.meal_count !== day.after.meal_count;
  const hasChangedMeals = day.changed_meals?.length > 0;

  return (
    <div className="space-y-1.5 border-t border-green-200 pt-2 first:border-0 first:pt-0">
      <p className="text-xs font-bold text-green-800 text-right">יום {day.day_name}</p>
      {mealCountChanged && (
        <p className="text-xs text-right text-green-700">
          {day.before.meal_count} ארוחות → {day.after.meal_count} ארוחות
        </p>
      )}
      {hasChangedMeals && day.changed_meals.map((meal, mi) => (
        <ChangedMealRow key={mi} meal={meal} />
      ))}
      {!mealCountChanged && !hasChangedMeals && (
        <p className="text-xs text-slate-500 text-right">הקלוריות/מאקרו עודכנו</p>
      )}
      {/* Secondary: show macro delta if calories actually changed */}
      {Math.abs((day.after.calories || 0) - (day.before.calories || 0)) > 10 && (
        <p className="text-xs text-slate-400 text-right">
          {day.before.calories} → {day.after.calories} קק"ל
        </p>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MealFeedbackChat({ planId, dayIndex, onPlanUpdated, onDayChanged }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const send = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke('mealPlanFeedback', {
        plan_id:   planId,
        feedback:  text.trim(),
        day_index: dayIndex || 0,
      });

      const data = res.data || res;
      const changed = !!data.changed;

      setResult({
        changed,
        ai_response:    data.ai_response || (changed ? 'התפריט עודכן!' : 'לא בוצע שינוי.'),
        change_summary: data.change_summary || null,
        changed_indexes: data.changed_indexes || [],
        // keep for fallback
        before: data.before || null,
        after:  data.after  || null,
      });

      if (changed) {
        setText('');
        let refreshOk = false;
        try {
          if (onPlanUpdated) await onPlanUpdated();
          refreshOk = true;
        } catch { /* handled below */ }

        if (!refreshOk) {
          setResult(prev => ({
            ...prev,
            ai_response: 'התפריט נשמר, אך המסך לא התרענן. אנא טעינה מחדש.',
          }));
          return;
        }

        // Move user to the first changed day
        const firstChangedIdx = data.changed_indexes?.[0];
        if (typeof firstChangedIdx === 'number' && onDayChanged) {
          onDayChanged(firstChangedIdx);
        }
      }
    } catch (err) {
      console.error('[MFC] mealPlanFeedback failed:', err.message);
      setResult({ changed: false, ai_response: 'שגיאה זמנית — נסה שוב.' });
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
  };

  const hasSummary = result?.changed && result?.change_summary?.length > 0;
  // Fallback: only show calorie widget if no structural change_summary exists
  const showCalWidget = result?.changed && !hasSummary && result?.before && result?.after &&
    Math.abs((result.before.calories || 0) - (result.after.calories || 0)) > 5;

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
                <p className={result.changed ? 'text-green-800 text-xs' : 'text-amber-800'}>
                  {result.ai_response}
                </p>
              </div>

              {/* Structural change summary — primary success evidence */}
              {hasSummary && (
                <div className="mt-2 pt-2 border-t border-green-200 space-y-2">
                  {result.change_summary.map((day, di) => (
                    <DaySummaryRow key={di} day={day} />
                  ))}
                </div>
              )}

              {/* Calorie fallback — only when calories actually changed and no structural summary */}
              {showCalWidget && (
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
