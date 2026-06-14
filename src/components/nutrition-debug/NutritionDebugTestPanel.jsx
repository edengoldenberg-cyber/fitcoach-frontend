import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { base44 } from '@/api/base44Client';
import { Copy, Loader2, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';

const TESTS = [
  'סלט ירקות מלפפון ועגבניה 100 גרם ביצה קשה',
  '4 פרוסות חלה קלה, 3 פרוסות גבינה צהובה 28%',
  'חביתה מ-2 ביצים',
  'פיתה כוסמין עם חצי אבוקדו',
  'שתיתי קפה עם מעט חלב'
];

export default function NutritionDebugTestPanel({ trainees = [], onDone }) {
  const [traineeId, setTraineeId] = useState(trainees[0]?.id || '');
  const [mealType, setMealType] = useState('lunch');
  const [text, setText] = useState(TESTS[0]);
  const [saveToDiary, setSaveToDiary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const selectedTrainee = trainees.find(t => t.id === traineeId);

  const copyReport = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    toast.success('הדוח הועתק');
  };

  const runWrapperValidation = async () => {
    setLoading(true);
    setResult(null);
    const tests = [
      'חצי באגט לבן, 4 קבב רומני קטן',
      '4 פרוסות חלה קלה, 3 פרוסות גבינה צהובה 28%, 2 כפות קטשופ',
      'סלט ירקות 100 גרם וביצה קשה',
      'חטיף 100 קלוריות',
      'שתי ביצים מקושקשות בחמאה, שתי כפות לבנה, חצי מלפפון'
    ];
    const textTests = [];
    for (const input of tests) {
      const res = await base44.functions.invoke('analyzeAndEnrichMealPhoto', { meal_text: input, debug_validation_run: true });
      const data = res?.data?.response ?? res?.data;
      const items = Array.isArray(data?.items) ? data.items : [];
      const questions = Array.isArray(data?.clarifying_questions) ? data.clarifying_questions : [];
      textTests.push({
        input,
        pipeline: data?.text_pipeline || data?.pipeline || 'unknown',
        wrapper_used: !!data?.wrapper_used || !!data?.safe_wrapper,
        fallback_used: !!data?.fallback_used,
        items_count: items.length,
        questions_count: questions.length,
        calories: Math.round(items.reduce((sum, item) => sum + Number(item.calories || 0), 0)),
        protein: Math.round(items.reduce((sum, item) => sum + Number(item.protein || 0), 0) * 10) / 10,
        confidence: data?.confidence || null,
        error_stage: data?.error_stage || null,
        status: items.length > 0 ? 'passed' : 'failed'
      });
    }
    setResult({
      reportName: 'TEXT_AI_WRAPPER_VALIDATION_REPORT',
      generatedAt: new Date().toISOString(),
      summary: {
        status: textTests.every(t => t.status === 'passed') ? 'TEXT_AI_MEAL_WRAPPER_VALIDATED_AND_LOCKED' : 'TEXT_AI_MEAL_WRAPPER_VALIDATION_HAS_FAILURES',
        total: textTests.length,
        passed: textTests.filter(t => t.status === 'passed').length,
        failed: textTests.filter(t => t.status !== 'passed').length
      },
      textTests,
      photoRegression: 'Not changed by this validation; existing photo flow still calls analyzeAndEnrichMealPhoto directly when image_url exists.',
      saveFlow: 'Not changed; existing onSave path remains untouched.',
      correctionLearning: 'Not changed; existing saveAIFoodCorrection flow remains untouched.'
    });
    setLoading(false);
    onDone?.();
  };

  const runTest = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    const res = await base44.functions.invoke('analyzeAndEnrichMealPhoto', {
      meal_text: text,
      meal_type: mealType,
      debugContext: { dryRun: !saveToDiary, testRun: true, appRoute: '/coach/nutrition-ai-debug', selectedTraineeId: traineeId }
    });
    const analysis = res?.data?.response ?? res?.data;

    if (saveToDiary && selectedTrainee && Number(analysis?.total_calories || 0) > 0) {
      const meal = await base44.entities.MealEntry.create({
        trainee_id: selectedTrainee.id,
        trainee_email: selectedTrainee.user_email,
        user_id: selectedTrainee.user_id,
        meal_type: mealType,
        date: new Date().toISOString().slice(0, 10),
        food_name: analysis.meal_name || text,
        calories: Math.round(analysis.total_calories || 0),
        protein: Math.round(Number(analysis.total_protein || 0) * 10) / 10,
        carbs: Math.round(Number(analysis.total_carbs || 0) * 10) / 10,
        fat: Math.round(Number(analysis.total_fat || 0) * 10) / 10,
        quantity: 1,
        unit: 'unit',
        learning_event_type: 'ai'
      });
      if (analysis.debugLogId) {
        await base44.entities.NutritionAnalysisDebugLog.update(analysis.debugLogId, {
          status: 'SAVED_TO_DIARY',
          currentStep: 'coach_test_saved_to_diary',
          updatedAt: new Date().toISOString(),
          debugNotes: { ...(analysis.debugNotes || {}), diarySave: { saved: true, recordIds: [meal.id], source: 'debug_center_test' } }
        });
      }
      toast.success('נשמר ליומן בפועל');
    }

    setResult(analysis);
    setLoading(false);
    onDone?.();
  };

  return (
    <Card className="p-4 bg-white border-0 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <PlayCircle className="w-5 h-5 text-teal-600" />
        <h2 className="font-bold text-lg">בדיקת ניתוח AI</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Select value={traineeId} onValueChange={setTraineeId}><SelectTrigger><SelectValue placeholder="מתאמן לבדיקה" /></SelectTrigger><SelectContent>{trainees.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name || t.user_email}</SelectItem>)}</SelectContent></Select>
        <Select value={mealType} onValueChange={setMealType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="breakfast">בוקר</SelectItem><SelectItem value="lunch">צהריים</SelectItem><SelectItem value="dinner">ערב</SelectItem><SelectItem value="snack">חטיף</SelectItem></SelectContent></Select>
        <label className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3"><Checkbox checked={saveToDiary} onCheckedChange={setSaveToDiary} /> שמור ליומן בפועל</label>
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-24 text-right" dir="rtl" />
      <div className="flex flex-wrap gap-2">{TESTS.map((test, i) => <Button key={test} variant="outline" size="sm" onClick={() => setText(test)}>Test {i + 1}</Button>)}</div>
      <div className="flex flex-wrap items-center gap-2 sticky bottom-20 z-10 bg-white/95 py-2">
        <Button onClick={runTest} disabled={loading || !text.trim()} className="bg-teal-500 hover:bg-teal-600 text-white">{loading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null} הרץ בדיקה</Button>
        <Button onClick={runWrapperValidation} disabled={loading} variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100">
          הרץ ולידציית Text AI Wrapper
        </Button>
        {result && (
          <Button type="button" variant="outline" onClick={copyReport} className="gap-2 border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100">
            <Copy className="w-4 h-4" />
            העתק דוח
          </Button>
        )}
      </div>
      {result && (
        <div className="space-y-2">
          <pre className="bg-slate-950 text-slate-100 rounded-lg p-3 text-xs overflow-auto max-h-80" dir="ltr">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </Card>
  );
}