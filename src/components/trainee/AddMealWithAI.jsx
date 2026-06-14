import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Sparkles, CheckCircle, AlertTriangle, Brain, Zap, HelpCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import RecentFoodHistory from './RecentFoodHistory';
import { applyCanonicalLock, saveAIFoodCorrection } from './nutritionLearning';
import { toast } from 'sonner';
import { getIsraelDateString } from '@/utils/nutritionSync';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'ארוחת בוקר' },
  { value: 'lunch', label: 'ארוחת צהריים' },
  { value: 'dinner', label: 'ארוחת ערב' },
  { value: 'snack', label: 'חטיף' },
];



export default function AddMealWithAI({ open, onClose, onSave, onSaveAsync, traineeEmail }) {
  const [step, setStep] = useState('input'); // 'input' | 'analyzing' | 'review'
  const [freeText, setFreeText] = useState('');
  const [mealType, setMealType] = useState('breakfast');
  const [analyzedItems, setAnalyzedItems] = useState([]);
  const [originalAiItems, setOriginalAiItems] = useState([]);
  const [mealName, setMealName] = useState('');
  const [error, setError] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [analysisNotes, setAnalysisNotes] = useState('');
  const [clarifyingQuestions, setClarifyingQuestions] = useState([]);
  const [clarificationAnswers, setClarificationAnswers] = useState({});
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [reanalyzingItemIndex, setReanalyzingItemIndex] = useState(null);
  const [uncertaintyScore, setUncertaintyScore] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const { data: verifiedMeals = [] } = useQuery({
    queryKey: ['verifiedMeals'],
    queryFn: () => base44.entities.VerifiedMeal.filter({ is_active: true }),
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    enabled: open,
  });

  const { data: trainee } = useQuery({
    queryKey: ['traineeForAIRecentFoods', traineeEmail],
    queryFn: async () => {
      if (!traineeEmail) return null;
      const trainees = await base44.entities.Trainee.filter({ user_email: traineeEmail });
      return trainees[0] || null;
    },
    enabled: !!traineeEmail && open,
  });

  const { data: personalFoods = [] } = useQuery({
    queryKey: ['aiCorrectionPersonalFoods', trainee?.id],
    queryFn: () => base44.entities.UserFoodItem.filter({ trainee_id: trainee?.id, visibility: 'personal', active: true }),
    enabled: !!trainee?.id && open,
  });

  const normalizeText = (text) => {
    return text.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\u0590-\u05FFa-z0-9\s]/g, '');
  };

  const checkForVerifiedMeal = (text) => {
    const normalizedInput = normalizeText(text);
    if (normalizedInput.split(/\s+/).length <= 3) return null;
    for (const meal of verifiedMeals) {
      if (meal.original_text_normalized === normalizedInput) return meal;
    }
    const words = normalizedInput.split(/\s+/);
    let bestMatch = null, bestScore = 0;
    for (const meal of verifiedMeals) {
      const keywords = meal.keywords || [];
      if (!keywords.length) continue;
      let score = 0, matched = 0;
      for (const kw of keywords) {
        const k = kw.toLowerCase();
        if (words.includes(k)) { score += 10; matched++; }
        else if (normalizedInput.includes(k)) { score += 3; matched++; }
      }
      if (matched >= 2 && score > bestScore) { bestScore = score; bestMatch = meal; }
    }
    return bestScore >= 20 ? bestMatch : null;
  };

  const handleRecentFoodSelect = (food) => {
    const foodText = food.food_name || '';
    setFreeText((prev) => prev.trim() ? `${prev.trim()}, ${foodText}` : foodText);
  };

  const handleAnalyze = async () => {
    if (!freeText.trim()) return;
    if (!traineeEmail) { setError('אין מידע על המשתמש. נסה להתחבר מחדש.'); return; }

    // Check verified meals first (fast path)
    const verified = checkForVerifiedMeal(freeText);
    if (verified) {
      try {
        // Anchor the verified meal to 100g so per100 = total macros.
        // Without this, MealGroupList would derive per100 from quantity=1 → 100× explosion.
        const vCalories = Math.round(verified.total_calories);
        const vProtein  = Math.round(verified.total_protein * 10) / 10;
        const vCarbs    = Math.round(verified.total_carbs   * 10) / 10;
        const vFat      = Math.round(verified.total_fat     * 10) / 10;
        await (onSaveAsync || onSave)({
          trainee_id: trainee?.id,
          user_id: user?.id,
          trainee_email: trainee?.user_email || traineeEmail,
          date: getIsraelDateString(),
          meal_type: mealType,
          food_name: verified.title,
          quantity: 1, unit: 'unit',
          grams_equivalent: 100,
          grams_final:      100,
          calories:  vCalories,
          protein:   vProtein,
          carbs:     vCarbs,
          fat:       vFat,
          per100_kcal:    vCalories,
          per100_protein: vProtein,
          per100_carbs:   vCarbs,
          per100_fat:     vFat,
        });
        resetForm(); onClose(); return;
      } catch (err) { console.error('[VerifiedMeal] Error:', err); }
    }

    setStep('analyzing');
    setError(null);

    try {
      const response = await base44.functions.invoke('analyzeAndEnrichMealPhoto', { meal_text: freeText });
      const result = response.data;

      if (!result.items || result.items.length === 0) {
        setError('לא זוהו מספיק רכיבים — אפשר לערוך את התיאור או לנסות שוב.');
        setStep('input');
        return;
      }

      const learnedItems = applyCanonicalLock(result.items || [], personalFoods);
      setMealName(result.meal_name || freeText);
      setConfidence(result.confidence || 'medium');
      setUncertaintyScore(result.uncertainty_score ?? null);
      setAnalysisNotes(result.notes || 'ניתוח ראשוני — חלק מהכמויות הוערכו');
      setClarifyingQuestions((result.clarifying_questions || []).slice(0, 3));
      setOriginalAiItems(result.items.map(item => ({ ...item, grams: item.grams || 100 })));
      setAnalyzedItems(learnedItems.map(item => ({ ...item, grams: item.grams || 100 })));
      setStep('review');
    } catch (err) {
      console.error('[AddMealWithAI] Error:', err);
      setError(`אירעה תקלה טכנית בניתוח. נסה שוב בעוד רגע.`);
      setStep('input');
    }
  };

  const handleUpdateItem = (index, field, value) => {
    const updated = [...analyzedItems];
    updated[index] = { ...updated[index], [field]: value, _corrected: true };
    // Recalculate calories when grams changes — also works when AI did not return per100 values
    if (field === 'grams') {
      const item = analyzedItems[index];
      const previousGrams = parseFloat(item.grams) || 100;
      const g = parseFloat(value) || 0;
      const per100Kcal = item.per100_kcal ?? ((Number(item.calories) || 0) / previousGrams) * 100;
      const per100Protein = item.per100_protein ?? ((Number(item.protein) || 0) / previousGrams) * 100;
      const per100Carbs = item.per100_carbs ?? ((Number(item.carbs) || 0) / previousGrams) * 100;
      const per100Fat = item.per100_fat ?? ((Number(item.fat) || 0) / previousGrams) * 100;
      updated[index].per100_kcal = per100Kcal;
      updated[index].per100_protein = per100Protein;
      updated[index].per100_carbs = per100Carbs;
      updated[index].per100_fat = per100Fat;
      updated[index].calories = Math.round((per100Kcal / 100) * g);
      updated[index].protein = Math.round(((per100Protein / 100) * g) * 10) / 10;
      updated[index].carbs = Math.round(((per100Carbs / 100) * g) * 10) / 10;
      updated[index].fat = Math.round(((per100Fat / 100) * g) * 10) / 10;
    } else if (field === 'calories' || field === 'protein' || field === 'carbs' || field === 'fat') {
      const currentGrams = parseFloat(updated[index].grams) || 100;
      const numValue = Number(value) || 0;
      if (field === 'calories') updated[index].per100_kcal = (numValue / currentGrams) * 100;
      if (field === 'protein') updated[index].per100_protein = (numValue / currentGrams) * 100;
      if (field === 'carbs') updated[index].per100_carbs = (numValue / currentGrams) * 100;
      if (field === 'fat') updated[index].per100_fat = (numValue / currentGrams) * 100;
    }
    setAnalyzedItems(updated);
  };

  const handleAnalyzeSingleItem = async (index) => {
    const item = analyzedItems[index];
    if (!item?.name) return;
    const grams = Number(item.grams) || 100;
    setReanalyzingItemIndex(index);
    setError(null);
    try {
      const response = await base44.functions.invoke('analyzeAndEnrichMealPhoto', {
        meal_text: `${item.name} ${grams} גרם`
      });
      const result = response.data;
      const firstItem = result?.items?.[0];
      if (!firstItem) {
        setError(result?.reason || 'לא הצלחתי לנתח את המוצר הזה');
        return;
      }

      // Build the AI-returned item then apply canonical lock before touching state.
      // This prevents single-item re-analysis from overwriting an existing canonical value.
      const aiResultItem = {
        name:         firstItem.name_he || firstItem.name || item.name,
        food_name:    firstItem.name_he || firstItem.name || item.name,
        grams,
        per100_kcal:    Number(firstItem.per100_kcal)    || 0,
        per100_protein: Number(firstItem.per100_protein) || 0,
        per100_carbs:   Number(firstItem.per100_carbs)   || 0,
        per100_fat:     Number(firstItem.per100_fat)     || 0,
      };
      const [lockedItem] = applyCanonicalLock([aiResultItem], personalFoods);

      setAnalyzedItems(prev => prev.map((current, currentIndex) => currentIndex === index ? {
        ...current,
        name:           lockedItem.name,
        grams,
        per100_kcal:    lockedItem.per100_kcal,
        per100_protein: lockedItem.per100_protein,
        per100_carbs:   lockedItem.per100_carbs,
        per100_fat:     lockedItem.per100_fat,
        calories: Math.round((lockedItem.per100_kcal    / 100) * grams),
        protein:  Math.round(((lockedItem.per100_protein / 100) * grams) * 10) / 10,
        carbs:    Math.round(((lockedItem.per100_carbs   / 100) * grams) * 10) / 10,
        fat:      Math.round(((lockedItem.per100_fat     / 100) * grams) * 10) / 10,
        nutrition_source: lockedItem.nutrition_source || 'single_item_ai',
        _corrected: true,
      } : current));
      toast.success('המוצר נותח מחדש');
    } catch (err) {
      setError('לא הצלחתי לנתח את המוצר כרגע — נסה שוב בעוד רגע.');
    } finally {
      setReanalyzingItemIndex(null);
    }
  };

  const handleRemoveItem = (index) => {
    setAnalyzedItems(analyzedItems.filter((_, i) => i !== index));
  };

  const handleClarificationAnswer = async (question, option) => {
    const nextAnswers = {
      ...clarificationAnswers,
      [question.id]: {
        question: question.question,
        food_key: question.food_key,
        answer: option.value || option.label,
        grams: option.grams || null
      }
    };

    setClarificationAnswers(nextAnswers);
    setIsRecalculating(true);
    try {
      const response = await base44.functions.invoke('analyzeAndEnrichMealPhoto', {
        meal_text: freeText,
        user_answers: nextAnswers
      });
      const result = response.data;
      const learnedItems = applyCanonicalLock(result.items || [], personalFoods);
      setMealName(result.meal_name || mealName);
      setConfidence(result.confidence || 'medium');
      setUncertaintyScore(result.uncertainty_score ?? null);
      setAnalysisNotes(result.notes || 'הארוחה חושבה מחדש לפי התשובות שלך');
      setClarifyingQuestions((result.clarifying_questions || []).filter(q => !nextAnswers[q.id]).slice(0, 3));
      setOriginalAiItems((result.items || []).map(item => ({ ...item, grams: item.grams || 100 })));
      setAnalyzedItems(learnedItems.map(item => ({ ...item, grams: item.grams || 100 })));
    } catch (err) {
      setError('לא הצלחתי לחשב מחדש כרגע — אפשר עדיין לערוך ידנית ולשמור.');
    }
    setIsRecalculating(false);
  };

  const confidenceLabel = {
    high: 'ביטחון גבוה',
    medium: 'ביטחון בינוני',
    low: 'ביטחון נמוך'
  };

  const confidenceClass = {
    high: 'bg-green-50 text-green-700 border-green-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-orange-50 text-orange-700 border-orange-200'
  };

  const getConfidenceTone = () => confidenceClass[confidence] || confidenceClass.medium;

  const calculateTotals = () => {
    return analyzedItems.reduce((acc, item) => ({
      calories: acc.calories + (item.calories || 0),
      protein: acc.protein + (item.protein || 0),
      carbs: acc.carbs + (item.carbs || 0),
      fat: acc.fat + (item.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  };

  const handleSave = async () => {
    if (!traineeEmail) { setError('אין מידע על המשתמש.'); return; }
    if (isSaving) return;
    const totals = calculateTotals();
    if (!totals.calories) { setError('לא ניתן לשמור ארוחה עם 0 קלוריות.'); return; }
    setIsSaving(true);
    try {
      const today = getIsraelDateString();
      // Save EACH ingredient as a separate MealEntry — preserves full breakdown
      let learnedCorrection = false;
      for (let index = 0; index < analyzedItems.length; index++) {
        const item = analyzedItems[index];
        if (!item.name) continue;
        const originalItem = originalAiItems[index] || {};
        const mealData = {
          trainee_id: trainee?.id,
          user_id: user?.id,
          trainee_email: trainee?.user_email || traineeEmail,
          date: today,
          meal_type: mealType,
          food_name: item.name,
          user_food_item_id: item.user_food_item_id,
          food_database_scope: item.nutrition_source === 'personal_ai_correction' ? 'personal' : 'ai',
          learning_event_type: item._corrected || item.nutrition_source === 'personal_ai_correction' ? 'correction' : 'ai',
          ai_original_food_name: originalItem.name || originalItem.name_he || item.name,
          quantity: item.grams || 100,
          unit: 'gram',
          grams_equivalent: item.grams || 100,
          grams_final: item.grams || 100,
          calories: Math.round(item.calories),
          protein: Math.round(item.protein * 10) / 10,
          carbs: Math.round(item.carbs * 10) / 10,
          fat: Math.round(item.fat * 10) / 10,
          per100_kcal:    item.per100_kcal    || 0,
          per100_protein: item.per100_protein || 0,
          per100_carbs:   item.per100_carbs   || 0,
          per100_fat:     item.per100_fat     || 0,
        };
        if (item._corrected && trainee) {
          const savedFood = await saveAIFoodCorrection({ user, trainee, originalItem, correctedMeal: mealData, notes: freeText });
          mealData.user_food_item_id = savedFood?.id || mealData.user_food_item_id;
          mealData.food_database_scope = 'personal';
          learnedCorrection = true;
        }
        await (onSaveAsync || onSave)(mealData);
      }
      if (learnedCorrection) toast.success('נשמר — אלמד להשתמש בזה בפעם הבאה ✅');
      resetForm(); onClose();
    } catch (err) {
      setError('שגיאה בשמירה. נסה שוב.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setStep('input');
    setFreeText('');
    setAnalyzedItems([]);
    setOriginalAiItems([]);
    setMealName('');
    setError(null);
    setConfidence(null);
    setUncertaintyScore(null);
    setAnalysisNotes('');
    setClarifyingQuestions([]);
    setClarificationAnswers({});
    setIsRecalculating(false);
    setReanalyzingItemIndex(null);
    setIsSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !isSaving) { resetForm(); onClose(); } }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-6 h-6 text-purple-500" />
            הוסף ארוחה עם AI
          </DialogTitle>
        </DialogHeader>

        {/* STEP: INPUT */}
        {step === 'input' && (
          <div className="space-y-4">
            <div>
              <Label>סוג ארוחה</Label>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>מה אכלת?</Label>
              <Textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder='לדוגמה: "באגט עם 2 שניצל מטוגן כף חומוס וכרוב"'
                rows={3}
                className="text-base"
              />
              <p className="text-xs text-slate-500 mt-1">תאר בעברית בפירוט: כמות, גודל, אפוי/מטוגן</p>
            </div>

            <RecentFoodHistory traineeId={trainee?.id} onSelect={handleRecentFoodSelect} title="אחרונים לניתוח מהיר" />

            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg flex items-start gap-2">
              <Brain className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-purple-700">
                <strong>GPT-4o + Claude Sonnet</strong> — ניתוח מדויק לפי USDA והתאמה למאגר המקומי
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <Button onClick={handleAnalyze} disabled={!freeText.trim()} className="w-full bg-purple-500 hover:bg-purple-600">
              <Zap className="w-4 h-4 ml-2" />
              נתח עם AI מתקדם
            </Button>
          </div>
        )}

        {/* STEP: ANALYZING */}
        {step === 'analyzing' && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="w-10 h-10 animate-spin text-purple-500 mx-auto" />
            <p className="text-slate-700 font-medium">מנתח ארוחה...</p>
            <div className="text-xs text-slate-400 space-y-1">
              <p>🔍 GPT-4o מזהה רכיבים וכמויות</p>
              <p>🧪 Claude Sonnet מחשב ערכים תזונתיים לפי USDA</p>
              <p>📦 מתאים למאגר מזון מקומי</p>
            </div>
          </div>
        )}

        {/* STEP: REVIEW */}
        {step === 'review' && analyzedItems.length > 0 && (
          <div className="space-y-4">
            <div>
              <Label>סוג ארוחה</Label>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-purple-800">✨ {mealName}</p>
                {confidence && (
                  <Badge variant="outline" className={getConfidenceTone()}>
                    {confidenceLabel[confidence] || 'ביטחון בינוני'}
                  </Badge>
                )}
              </div>
              {analysisNotes && <p className="text-xs text-slate-600">{analysisNotes}</p>}
              {uncertaintyScore !== null && (
                <div className="h-1.5 bg-white rounded-full overflow-hidden border border-purple-100">
                  <div
                    className="h-full bg-purple-400 transition-all"
                    style={{ width: `${Math.max(10, 100 - uncertaintyScore)}%` }}
                  />
                </div>
              )}
              {isRecalculating && (
                <div className="flex items-center gap-2 text-xs text-purple-700">
                  <Loader2 className="w-3 h-3 animate-spin" /> מחשב מחדש לפי התשובה שלך...
                </div>
              )}
            </div>

            {clarifyingQuestions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-amber-600" /> שאלות קצרות לשיפור הדיוק
                </h4>
                {clarifyingQuestions.map((question) => (
                  <div key={question.id} className="p-3 border border-amber-200 bg-amber-50 rounded-xl">
                    <p className="text-sm font-medium text-amber-900 mb-2">{question.question}</p>
                    <div className="flex flex-wrap gap-2">
                      {(question.options || []).map((option, idx) => (
                        <Button
                          key={`${question.id}-${idx}`}
                          size="sm"
                          variant="outline"
                          onClick={() => handleClarificationAnswer(question, option)}
                          disabled={isRecalculating}
                          className="h-8 bg-white border-amber-300 text-amber-800 hover:bg-amber-100"
                        >
                          {option.label || option.value}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 max-h-64 overflow-y-auto">
              <h4 className="text-sm font-medium text-slate-700">ניתוח ראשוני — ניתן לערוך גרמים:</h4>
              {analyzedItems.map((item, index) => (
                <div key={index} className="p-3 border rounded-lg bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm text-slate-800">{item.name}</span>
                    <div className="flex items-center gap-1">
                      {item.nutrition_source === 'local_database' && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📦 מאגר</span>
                      )}
                      {item.confidence === 'low' && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">הערכה</span>
                      )}
                      {item.ai_confidence_note && (
                        <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{item.ai_confidence_note}</span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAnalyzeSingleItem(index)}
                        disabled={reanalyzingItemIndex === index}
                        className="h-7 px-2 text-xs text-purple-700 border-purple-200 hover:bg-purple-50"
                      >
                        {reanalyzingItemIndex === index ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <RefreshCw className="w-3 h-3 ml-1" />}
                        AI מוצר
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(index)} className="text-red-500 h-6 w-6 p-0">✕</Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={item.grams}
                      onChange={(e) => handleUpdateItem(index, 'grams', parseFloat(e.target.value) || 0)}
                      className="h-7 w-20 text-sm"
                    />
                    <span className="text-xs text-slate-500">גרם</span>
                    <span className="text-xs text-slate-600 mr-auto">
                      {item.calories} קל׳ | ח:{item.protein} פ:{item.carbs} ש:{item.fat}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            {(() => {
              const totals = calculateTotals();
              return (
                <div className="p-4 bg-slate-800 text-white rounded-xl">
                  <p className="text-sm font-medium mb-2">סה״כ:</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div><p className="text-2xl font-bold">{Math.round(totals.calories)}</p><p className="text-xs opacity-80">קלוריות</p></div>
                    <div><p className="text-xl font-bold">{Math.round(totals.protein * 10) / 10}</p><p className="text-xs opacity-80">חלבון</p></div>
                    <div><p className="text-xl font-bold">{Math.round(totals.carbs * 10) / 10}</p><p className="text-xs opacity-80">פחמימות</p></div>
                    <div><p className="text-xl font-bold">{Math.round(totals.fat * 10) / 10}</p><p className="text-xs opacity-80">שומן</p></div>
                  </div>
                </div>
              );
            })()}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('input')} disabled={isSaving} className="flex-1">← ערוך</Button>
              <Button onClick={handleSave} disabled={isSaving} className="flex-1 bg-emerald-500 hover:bg-emerald-600">
                {isSaving ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <CheckCircle className="w-4 h-4 ml-1" />}
                {isSaving ? 'שמור ארוחה' : 'שומר...'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}