import React, { useState } from 'react';
import { MessageSquare, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function MealFeedbackChat({ planId, dayIndex, onPlanUpdated }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);

  const send = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setLastResponse(null);
    try {
      const res = await base44.functions.invoke('mealPlanFeedback', {
        plan_id: planId,
        feedback: text,
        day_index: dayIndex || 0
      });
      setLastResponse(res.data?.ai_response || 'התפריט עודכן בהצלחה!');
      setText('');
      if (onPlanUpdated) onPlanUpdated();
    } catch (err) {
      console.error('mealPlanFeedback failed:', err.message);
      setLastResponse('שגיאה זמנית — נסה שוב.');
    } finally {
      setLoading(false);
    }
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
          <span className="font-semibold text-slate-800 text-sm">הערות לתפריט</span>
        </div>
        <span className="text-xs text-purple-500">בקש שינויים מה-AI</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-3">
          {lastResponse && (
            <div className="flex items-start gap-2 bg-green-50 rounded-xl p-3 border border-green-100">
              <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-800 text-right leading-relaxed">{lastResponse}</p>
            </div>
          )}

          <div className="text-xs text-slate-400 text-right mb-1">
            לדוגמה: "אני לא אוהב קוטג', תחליף משהו אחר" / "תוסיף לי פרי בבוקר" / "תפחית פחמימות בערב"
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="כתוב מה תרצה לשנות בתפריט..."
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
                מעדכן תפריט...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                שלח הערה
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}