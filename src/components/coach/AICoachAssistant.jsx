import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2 } from "lucide-react";
import { format, subDays, subMonths } from 'date-fns';
import { calculateWeeklyCompliance } from '../shared/ComplianceCalculator';

export default function AICoachAssistant({ open, onClose, trainee, meals, water, workouts, measurements }) {
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const buildContext = () => {
    const last7Days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'));
    const last30Days = Array.from({ length: 30 }, (_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'));
    const last90Days = Array.from({ length: 90 }, (_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'));
    
    const recentMeals = meals?.filter(m => last7Days.includes(m.date)) || [];
    const recentWater = water?.filter(m => last7Days.includes(m.date)) || [];
    const recentWorkouts = workouts?.filter(m => last7Days.includes(m.date)) || [];
    const recentMeasurements = measurements?.slice(0, 3) || [];

    const monthMeals = meals?.filter(m => last30Days.includes(m.date)) || [];
    const monthWater = water?.filter(m => last30Days.includes(m.date)) || [];
    const monthWorkouts = workouts?.filter(m => last30Days.includes(m.date)) || [];

    const quarterMeals = meals?.filter(m => last90Days.includes(m.date)) || [];
    const quarterWorkouts = workouts?.filter(m => last90Days.includes(m.date)) || [];

    // Weekly compliance
    const weeklyCompliance = calculateWeeklyCompliance(meals, water, workouts, measurements, trainee);

    // Calculate averages
    const avgCalories = recentMeals.length > 0 
      ? Math.round(recentMeals.reduce((sum, m) => sum + (m.calories || 0), 0) / 7)
      : 0;
    const avgProtein = recentMeals.length > 0 
      ? Math.round(recentMeals.reduce((sum, m) => sum + (m.protein || 0), 0) / 7)
      : 0;
    const avgWater = recentWater.length > 0
      ? Math.round(recentWater.reduce((sum, w) => sum + (w.amount_ml || 0), 0) / 7)
      : 0;

    // Long-term trends - weight
    const measurementsSorted = [...measurements].sort((a, b) => new Date(a.date) - new Date(b.date));
    const weightTrend = measurementsSorted.length >= 2 
      ? `${measurementsSorted[0].weight_kg}ק״ג → ${measurementsSorted[measurementsSorted.length - 1].weight_kg}ק״ג (${((measurementsSorted[measurementsSorted.length - 1].weight_kg - measurementsSorted[0].weight_kg)).toFixed(1)}ק״ג)`
      : 'אין מספיק נתונים';

    // Long-term trends - workout performance
    const workoutFrequencyMonth = Math.round(monthWorkouts.length / 4.3);
    const workoutFrequencyQuarter = Math.round(quarterWorkouts.length / 13);

    // Compliance trends
    const reportingDaysMonth = new Set(monthMeals.map(m => m.date)).size;
    const reportingRate = Math.round((reportingDaysMonth / 30) * 100);

    return `
מתאמן: ${trainee?.full_name}
יעדים: ${trainee?.target_calories || 2000} קלוריות, ${trainee?.target_protein || 150}ג׳ חלבון, ${trainee?.target_water_ml || 3000} מ״ל מים

=== ציון התמדה שבועי ===
ציון כולל: ${weeklyCompliance?.totalScore || 0}%
תזונה: ${weeklyCompliance?.breakdown.nutrition || 0}%
מים: ${weeklyCompliance?.breakdown.water || 0}%
אימונים: ${weeklyCompliance?.breakdown.workout || 0}%
הסבר: ${weeklyCompliance?.explanation || 'אין נתונים'}

=== נתוני שבוע אחרון ===
- ממוצע קלוריות: ${avgCalories} ביום
- ממוצע חלבון: ${avgProtein}ג׳ ביום
- ממוצע מים: ${avgWater} מ״ל ביום
- אימונים: ${recentWorkouts.length} ב-7 ימים
- מדידות אחרונות: ${recentMeasurements.map(m => `${m.weight_kg}ק״ג (${format(new Date(m.date), 'dd/MM')})`).join(', ')}

=== מגמות ארוכות טווח (חודש/רבעון) ===
משקל: ${weightTrend}
תדירות אימונים: ${workoutFrequencyMonth} פעמים בשבוע (ממוצע חודשי), ${workoutFrequencyQuarter} (ממוצע רבעוני)
קצב דיווח: ${reportingRate}% מהימים בחודש האחרון
אימונים ב-30 ימים: ${monthWorkouts.length}
אימונים ב-90 ימים: ${quarterWorkouts.length}

=== היסטוריה מפורטת ===
סה״כ ארוחות מדווחות אי פעם: ${meals?.length || 0}
סה״כ אימונים אי פעם: ${workouts?.length || 0}
סה״כ מדידות: ${measurements?.length || 0}
ימי דיווח בחודש: ${reportingDaysMonth}/30
`;
  };

  const handleQuickQuestion = async (q) => {
    setQuestion(q);
    await handleAsk(q);
  };

  const handleAsk = async (q = question) => {
    if (!q.trim()) return;
    
    setLoading(true);
    setResponse('');

    try {
      const context = buildContext();
      const prompt = `אתה עוזר AI מתקדם למאמן כושר. תפקידך לנתח נתונים מעמיקים ולתת תובנות מבוססות.
אל תיתן ייעוץ רפואי, רק ניתוח נתונים והצעות כלליות.

יכולותיך:
1. ניתוח Compliance Score - זהה חוזקות וחולשות בהתמדה
2. זיהוי מגמות ארוכות טווח - חודש/רבעון במשקל, ביצועים, התמדה
3. מענה לשאלות מורכבות על היסטוריה (למשל: "מה גרם לירידה בהתמדה בחודש שעבר?")
4. סיכום גורמי הצלחה וכישלון בהתבסס על כל הנתונים

${context}

שאלת המאמן: ${q}

תן תשובה מנומקת ומבוססת נתונים (עד 250 מילים) בעברית. השתמש בנתונים הקונקרטיים שניתנו.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
      });

      setResponse(result);
    } catch (err) {
      setResponse('שגיאה בקבלת תשובה. נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  const quickQuestions = [
    'נתח את ציון ההתמדה - חוזקות וחולשות',
    'מה המגמות ארוכות הטווח?',
    'מה גרם לשינויים בחודש האחרון?',
    'סכם את גורמי ההצלחה והכישלון',
  ];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-6 h-6" style={{ color: '#79DBD6' }} />
            עוזר AI למאמן
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick Questions */}
          <div>
            <p className="text-sm text-slate-600 mb-2">שאלות מהירות:</p>
            <div className="flex flex-wrap gap-2">
              {quickQuestions.map(q => (
                <Button
                  key={q}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickQuestion(q)}
                  disabled={loading}
                  className="text-sm"
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Question */}
          <div>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="שאל שאלה מורכבת... (למשל: 'מה הסיבות לירידה בהתמדה?', 'איך השתנו הביצועים בחודש האחרון?')"
              rows={3}
              className="mb-2"
            />
            <Button 
              onClick={() => handleAsk()}
              disabled={loading || !question.trim()}
              style={{ backgroundColor: '#79DBD6' }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  מנתח...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 ml-2" />
                  שאל
                </>
              )}
            </Button>
          </div>

          {/* Response */}
          {response && (
            <div className="p-4 bg-slate-50 rounded-lg border">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{response}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}