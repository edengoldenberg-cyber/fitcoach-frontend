import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from '@/api/base44Client';
import { Loader2, Sparkles, ChefHat, CheckCircle, ArrowRight } from "lucide-react";
import { toast } from 'sonner';
import { format } from 'date-fns';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'ארוחת בוקר', icon: '🌅' },
  { value: 'lunch', label: 'ארוחת צהריים', icon: '☀️' },
  { value: 'dinner', label: 'ארוחת ערב', icon: '🌙' },
  { value: 'snack', label: 'חטיף', icon: '🍎' },
];

const QUESTIONS = [
  {
    id: 'mealType',
    question: 'איזו ארוחה זו?',
    options: [
      { value: 'בוקר', label: 'ארוחת בוקר', icon: '🌅' },
      { value: 'צהריים', label: 'ארוחת צהריים', icon: '☀️' },
      { value: 'ערב', label: 'ארוחת ערב', icon: '🌙' },
      { value: 'חטיף', label: 'חטיף', icon: '🍎' },
    ],
  },
  {
    id: 'goal',
    question: 'מה המטרה העיקרית?',
    options: [
      { value: 'עשירה בחלבון', label: 'עשירה בחלבון', icon: '💪' },
      { value: 'קלה ומרעננת', label: 'קלה ומרעננת', icon: '🥗' },
      { value: 'ממלאת ומשביעה', label: 'ממלאת ומשביעה', icon: '🍽️' },
      { value: 'מהירה להכנה', label: 'מהירה להכנה', icon: '⚡' },
    ],
  },
  {
    id: 'preference',
    question: 'יש העדפה מיוחדת?',
    options: [
      { value: 'ללא העדפה', label: 'בלי מגבלות', icon: '✅' },
      { value: 'צמחוני', label: 'צמחוני', icon: '🌿' },
      { value: 'ללא גלוטן', label: 'ללא גלוטן', icon: '🌾' },
      { value: 'דל פחמימות', label: 'דל פחמימות', icon: '📉' },
    ],
  },
];

export default function AIMealSuggestionDialog({ open, onClose, onSave, traineeEmail, selectedDate }) {
  const [step, setStep] = useState('questions'); // questions | loading | result | selectMeal
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [suggestion, setSuggestion] = useState(null);

  const handleAnswer = (questionId, value) => {
    const newAnswers = { ...answers, [questionId]: value };
    setAnswers(newAnswers);
    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      // All questions answered — call AI
      handleSuggest(newAnswers);
    }
  };

  const handleSuggest = async (finalAnswers) => {
    setStep('loading');
    const promptParts = [
      finalAnswers.mealType && `סוג ארוחה: ${finalAnswers.mealType}`,
      finalAnswers.goal && `מטרה: ${finalAnswers.goal}`,
      finalAnswers.preference && finalAnswers.preference !== 'ללא העדפה' && `העדפה: ${finalAnswers.preference}`,
    ].filter(Boolean);
    const prompt = promptParts.join(', ');
    try {
      const res = await base44.functions.invoke('suggestMealAI', { prompt });
      // Normalize: server may return flat object or { suggestions: [...] }
      const data = res.data?.meal_name
        ? res.data
        : (res.data?.suggestions?.[0]
          ? { ...res.data.suggestions[0], meal_name: res.data.suggestions[0].meal_name || res.data.suggestions[0].name }
          : res.data);
      if (!data?.meal_name && !data?.name) {
        toast.error('לא הצלחנו לקבל הצעה, נסה שוב');
        setStep('questions');
        return;
      }
      setSuggestion({ ...data, meal_name: data.meal_name || data.name });
      setStep('result');
    } catch (err) {
      toast.error('שגיאה בקבלת הצעה מה-AI');
      setStep('questions');
    }
  };

  const handleAddToJournal = (mealType) => {
    if (!suggestion) return;
    const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
    onSave({
      trainee_email: traineeEmail,
      date: dateStr,
      meal_type: mealType,
      food_name: suggestion.meal_name,
      quantity: 1,
      unit: 'unit',
      calories: suggestion.calories,
      protein: suggestion.protein,
      carbs: suggestion.carbs,
      fat: suggestion.fat,
    });
    toast.success(`"${suggestion.meal_name}" נוסף ליומן!`);
    handleClose();
  };

  const handleClose = () => {
    setStep('questions');
    setCurrentQ(0);
    setAnswers({});
    setSuggestion(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-6 h-6 text-amber-500" />
            הצע לי מה לאכול — AI
          </DialogTitle>
        </DialogHeader>

        {/* STEP: QUESTIONS */}
        {step === 'questions' && (
          <div className="space-y-5">
            {/* Progress dots */}
            <div className="flex justify-center gap-2">
              {QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all ${i <= currentQ ? 'w-6 bg-amber-500' : 'w-2 bg-slate-200'}`}
                />
              ))}
            </div>

            <div className="text-center">
              <p className="text-lg font-semibold text-slate-800">{QUESTIONS[currentQ].question}</p>
              <p className="text-xs text-slate-400 mt-1">שאלה {currentQ + 1} מתוך {QUESTIONS.length}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {QUESTIONS[currentQ].options.map((opt) => (
                <button
                  key={opt.value}
                  data-testid="suggest-option"
                  onClick={() => handleAnswer(QUESTIONS[currentQ].id, opt.value)}
                  className="p-4 rounded-xl border-2 border-slate-200 hover:border-amber-400 hover:bg-amber-50 transition-all text-center active:scale-95"
                >
                  <div className="text-3xl mb-1">{opt.icon}</div>
                  <div className="font-medium text-slate-700 text-sm">{opt.label}</div>
                </button>
              ))}
            </div>

            {currentQ > 0 && (
              <button
                onClick={() => setCurrentQ(currentQ - 1)}
                className="text-sm text-slate-400 hover:text-slate-600 w-full text-center"
              >
                ← חזור
              </button>
            )}
          </div>
        )}

        {/* STEP: LOADING */}
        {step === 'loading' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-amber-500 mx-auto" />
            <p className="text-slate-700 font-medium">מכין הצעה מותאמת אישית...</p>
            <div className="text-xs text-slate-400 space-y-1">
              <p>🧠 Claude Sonnet מנתח את הבקשה שלך</p>
              <p>📊 מחשב ערכים תזונתיים לפי USDA</p>
              <p>🥗 מרכיב ארוחה ריאלית ומאוזנת</p>
            </div>
          </div>
        )}

        {/* STEP: RESULT */}
        {step === 'result' && suggestion && (
          <div className="space-y-4">
            {/* Meal Card */}
            <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <ChefHat className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-lg text-slate-800">{suggestion.meal_name}</h3>
              </div>
              <p className="text-sm text-slate-600 mb-3">{suggestion.description}</p>

              {/* Nutrition Summary */}
              <div className="grid grid-cols-4 gap-2 text-center mb-3">
                <div className="bg-white rounded-lg p-2 shadow-sm">
                  <p className="text-xl font-bold text-emerald-600">{suggestion.calories}</p>
                  <p className="text-xs text-slate-500">קלוריות</p>
                </div>
                <div className="bg-white rounded-lg p-2 shadow-sm">
                  <p className="text-lg font-bold text-blue-600">{suggestion.protein}ג׳</p>
                  <p className="text-xs text-slate-500">חלבון</p>
                </div>
                <div className="bg-white rounded-lg p-2 shadow-sm">
                  <p className="text-lg font-bold text-orange-600">{suggestion.carbs}ג׳</p>
                  <p className="text-xs text-slate-500">פחמימות</p>
                </div>
                <div className="bg-white rounded-lg p-2 shadow-sm">
                  <p className="text-lg font-bold text-purple-600">{suggestion.fat}ג׳</p>
                  <p className="text-xs text-slate-500">שומן</p>
                </div>
              </div>

              {/* Ingredients */}
              {(suggestion.ingredients || []).length > 0 && (
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">🛒 מצרכים:</h4>
                <ul className="space-y-1">
                  {(suggestion.ingredients || []).map((ing, i) => (
                    <li key={i} className="flex justify-between text-sm">
                      <span className="text-slate-700">{ing.item || ing.name}</span>
                      <span className="text-slate-500 font-medium">{ing.quantity || ing.amount}</span>
                    </li>
                  ))}
                </ul>
              </div>
              )}

              {/* Preparation */}
              {(suggestion.preparation_instructions?.length > 0 || suggestion.preparation) && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">👨‍🍳 הכנה:</h4>
                  {Array.isArray(suggestion.preparation_instructions) ? (
                    <ol className="space-y-1">
                      {suggestion.preparation_instructions.map((step, i) => (
                        <li key={i} className="text-sm text-slate-600 flex gap-2">
                          <span className="font-bold text-amber-600 flex-shrink-0">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-slate-600">{suggestion.preparation}</p>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setStep('questions'); setCurrentQ(0); setAnswers({}); }} className="flex-1">
                ← הצע שוב
              </Button>
              <Button
                onClick={() => setStep('selectMeal')}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                <CheckCircle className="w-4 h-4 ml-1" />
                הוסף ליומן
              </Button>
            </div>
          </div>
        )}

        {/* STEP: SELECT MEAL TYPE */}
        {step === 'selectMeal' && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="font-semibold text-slate-800 mb-1">באיזה ארוחה להוסיף?</p>
              <p className="text-sm text-slate-500">"{suggestion?.meal_name}"</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {MEAL_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => handleAddToJournal(type.value)}
                  className="p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all text-center"
                >
                  <div className="text-3xl mb-1">{type.icon}</div>
                  <div className="font-medium text-slate-700 text-sm">{type.label}</div>
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => setStep('result')} className="w-full">
              <ArrowRight className="w-4 h-4 ml-1" />
              חזור להצעה
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}