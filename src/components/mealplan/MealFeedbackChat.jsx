import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function MealFeedbackChat({ planId, dayIndex, onPlanUpdated, onDayChanged, onEditSuccess }) {
  const [open, setOpen]       = useState(false);
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState(null); // { type: 'success'|'error', message }
  const suppressTimer = useRef(null);

  // Suppress PWA/notification overlays while loading and for 5 s after.
  useEffect(() => {
    clearTimeout(suppressTimer.current);
    if (loading) {
      window.dispatchEvent(new CustomEvent('fitcoach:meal-editing', { detail: { active: true } }));
    } else {
      // Keep suppressed briefly so the result banner is visible before overlays return.
      suppressTimer.current = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('fitcoach:meal-editing', { detail: { active: false } }));
      }, 5000);
    }
    return () => clearTimeout(suppressTimer.current);
  }, [loading]);

  const send = async () => {
    if (!text.trim() || loading) return;
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
        // Notify parent to show the full success banner
        if (onEditSuccess) onEditSuccess(data);

        let refreshOk = false;
        try {
          if (onPlanUpdated) await onPlanUpdated();
          refreshOk = true;
        } catch { /* handled below */ }

        if (!refreshOk) {
          setStatus({ type: 'error', message: 'התפריט נשמר, אך המסך לא התרענן. אנא טעינה מחדש.' });
          return;
        }

        setStatus({ type: 'success', message: 'השינוי בוצע — ראה סיכום למעלה' });

        const firstChangedIdx = data.changed_indexes?.[0];
        if (typeof firstChangedIdx === 'number' && onDayChanged) {
          onDayChanged(firstChangedIdx);
        }
      } else {
        setStatus({ type: 'error', message: data.ai_response || 'לא בוצע שינוי — נסה לנסח אחרת.' });
      }
    } catch (err) {
      console.error('[MFC] mealPlanFeedback failed:', err.message);
      setStatus({ type: 'error', message: 'שגיאה זמנית — נסה שוב.' });
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
          {/* Minimal status indicator */}
          {status && (
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
