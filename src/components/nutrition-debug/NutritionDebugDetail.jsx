import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

const JsonBlock = ({ value }) => (
  <pre className="bg-slate-950 text-slate-100 rounded-lg p-3 text-xs overflow-auto max-h-72 whitespace-pre-wrap" dir="ltr">
    {typeof value === 'string' ? value : JSON.stringify(value || null, null, 2)}
  </pre>
);

const Section = ({ title, children }) => (
  <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
    <h3 className="font-bold text-slate-800">{title}</h3>
    {children}
  </section>
);

export default function NutritionDebugDetail({ log, open, onOpenChange, traineeName }) {
  if (!log) return null;
  const failed = ['PARSE_FAILED', 'RECALC_FAILED', 'SAVE_FAILED', 'LEARNING_FAILED', 'ERROR'].includes(log.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            דוח ניתוח תזונה AI
            <Badge variant={failed ? 'destructive' : 'secondary'}>{log.status}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Section title="1. קלט">
            <p><b>מתאמן:</b> {traineeName || log.traineeId || 'לא ידוע'}</p>
            <p><b>סוג:</b> {log.sourceType} | <b>ארוחה:</b> {log.mealType}</p>
            <p className="text-sm bg-slate-50 rounded-lg p-2">{log.originalInputText || 'אין טקסט'}</p>
            {log.imageUrl && <img src={log.imageUrl} className="max-h-48 rounded-lg border" alt="meal" />}
          </Section>

          <Section title="2. עיבוד מקדים">
            <JsonBlock value={log.debugNotes?.preprocessing} />
          </Section>

          <Section title="3. התאמות זיכרון">
            <JsonBlock value={log.usedMemoryMatches} />
          </Section>

          <Section title="4. בקשת AI">
            <p className="text-sm text-slate-600">מודל/פונקציה: analyzeMealAI / Core.InvokeLLM</p>
            <JsonBlock value={log.aiPromptSent || 'לא נשלח Prompt — ייתכן שהופעל חישוב דטרמיניסטי'} />
          </Section>

          <Section title="5. תגובת AI">
            <JsonBlock value={log.aiRawResponse || log.aiParsedJson} />
          </Section>

          <Section title="6. מרכיבים שזוהו">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="bg-slate-50 text-slate-600">{['מקור','שם','כמות','גרם','קל׳','חלבון','פחמימות','שומן','ביטחון','הבהרה'].map(h => <th key={h} className="p-2 text-right border">{h}</th>)}</tr></thead>
                <tbody>{(log.parsedIngredients || log.finalIngredients || []).map((ing, i) => <tr key={i}><td className="p-2 border">{ing.source_text_segment}</td><td className="p-2 border">{ing.name || ing.food_name}</td><td className="p-2 border">{ing.quantity_display || ing.quantity_text}</td><td className="p-2 border">{ing.quantity_grams}</td><td className="p-2 border">{ing.calories}</td><td className="p-2 border">{ing.protein}</td><td className="p-2 border">{ing.carbs}</td><td className="p-2 border">{ing.fat}</td><td className="p-2 border">{ing.confidence}</td><td className="p-2 border">{ing.needs_clarification ? 'כן' : 'לא'}</td></tr>)}</tbody>
              </table>
            </div>
          </Section>

          <Section title="7. זרימת הבהרה">
            <JsonBlock value={{ questions: log.clarificationQuestions, answers: log.clarificationAnswers, reason: log.debugNotes?.clarificationReason, mergedContext: log.debugNotes?.mergedContext }} />
          </Section>

          <Section title="8. תוצאה סופית">
            <JsonBlock value={{ ingredients: log.finalIngredients, calories: log.finalCalories, protein: log.finalProtein, carbs: log.finalCarbs, fat: log.finalFat, confidence: log.confidenceScore }} />
          </Section>

          <Section title="9. תוצאת שמירה ליומן">
            <JsonBlock value={log.debugNotes?.diarySave || 'עדיין לא נשמר ליומן'} />
          </Section>

          <Section title="10. תוצאת למידה">
            <JsonBlock value={log.learningUpdates || 'אין עדכון למידה'} />
          </Section>

          {failed && <Section title="11. סיבת כשל"><p className="text-red-700 font-medium">{log.errorMessage || 'unknown error'}</p><JsonBlock value={log.errorStack} /></Section>}
        </div>
      </DialogContent>
    </Dialog>
  );
}