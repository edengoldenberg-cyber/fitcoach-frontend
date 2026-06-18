import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import MacroWheels from '@/components/mealplan/MacroWheels';
import { ChevronRight, ChevronLeft, Sparkles, Check, Plus, X, Flame, Clock, Target, Activity } from 'lucide-react';
import { calcNutritionTargets } from '@/utils/nutritionCalc';

const STEPS = [
  { id: 'personal', title: 'נתונים אישיים', icon: '👤' },
  { id: 'goal', title: 'המטרה שלי', icon: '🎯' },
  { id: 'lifestyle', title: 'אורח חיים', icon: '🏃' },
  { id: 'food', title: 'העדפות מזון', icon: '🥗' },
  { id: 'review', title: 'סיכום ויצירה', icon: '✨' },
];

const DIETARY_OPTIONS = [
  { value: 'protein_rich', label: 'עשירה בחלבון', emoji: '💪', desc: '40% חלבון' },
  { value: 'balanced', label: 'מאוזנת', emoji: '⚖️', desc: '30/40/30' },
  { value: 'low_carb', label: 'דלת פחמימות', emoji: '🥩', desc: '35% חלבון' },
  { value: 'vegetarian', label: 'צמחונית', emoji: '🥦', desc: '25% חלבון' },
  { value: 'vegan', label: 'טבעונית', emoji: '🌱', desc: '20% חלבון' },
];

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'יושבני', desc: 'עבודה במשרד, מעט תנועה', factor: 1.2 },
  { value: 'light', label: 'קל', desc: '1-2 אימונים בשבוע', factor: 1.375 },
  { value: 'moderate', label: 'בינוני', desc: '3-4 אימונים בשבוע', factor: 1.55 },
  { value: 'active', label: 'פעיל', desc: '5-6 אימונים בשבוע', factor: 1.725 },
  { value: 'very_active', label: 'אתלטי', desc: 'אימונים יומיים', factor: 1.9 },
];

const COMMON_FOODS = ['עוף', 'ביצים', 'טונה', 'גבינה', 'אורז', 'לחם', 'ירקות', 'פירות', 'גרנולה', 'יוגורט', 'שוקולד', 'פסטה'];
const COMMON_DISLIKED = ['כבד', 'דגים', 'סלמון', 'חצילים', 'פטריות', 'ברוקולי', 'כרוב', 'שעועית', 'גרגירי חומוס', 'טופו', 'קינואה', 'כוסמת'];
const COMMON_ALLERGIES = ['גלוטן', 'לקטוז', 'בוטנים', 'אגוזים', 'ביצים', 'דגים'];
const COMMON_CHEAT = ['פיצה', 'המבורגר', 'שוקולד', 'גלידה', 'סושי', 'שניצל', 'פלאפל', 'פסטה קרמית', 'עוגה', 'צ\'יפס'];
const COMMON_MANDATORY = ['ביצים', 'קוטג\'', 'גבינה 5%', 'עוף', 'אורז', 'שיבולת שועל', 'בננה', 'תפוח', 'לחם מחיטה מלאה', 'שקדים'];
const ALCOHOL_OPTIONS = [
  { value: 'never', label: '🚫 בכלל לא' },
  { value: 'rarely', label: '🫗 לעיתים נדירות' },
  { value: '1-2_week', label: '🍷 1-2 פעמים בשבוע' },
  { value: '3-4_week', label: '🍻 3-4 פעמים בשבוע' },
  { value: 'daily', label: '🍺 כמעט כל יום' },
];

function calculateMacros(prefs) {
  if (!prefs.weight_kg || !prefs.height_cm || !prefs.age || !prefs.gender) return null;

  // Auto-convert height from meters to cm if entered as meters (e.g. 1.73 → 173)
  const height_cm = parseFloat(prefs.height_cm) < 3
    ? parseFloat(prefs.height_cm) * 100
    : parseFloat(prefs.height_cm);

  // Canonical formula — identical to backend and EditPersonalInfo
  const result = calcNutritionTargets({
    weight_kg:      prefs.weight_kg,
    height_cm,
    age:            prefs.age,
    gender:         prefs.gender,
    activity_level: prefs.activity_level,
    goal:           prefs.goal || 'maintain',
  });

  return {
    tdee:          result.tdee,
    targetCalories:result.calories,
    targetProtein: result.protein,
    targetCarbs:   result.carbs,
    targetFat:     result.fat,
  };
}

export default function MealPlanWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [foodInput, setFoodInput] = useState('');
  const [dislikedInput, setDislikedInput] = useState('');

  const { data: user } = useQuery({ queryKey: ['user'], queryFn: () => base44.auth.me() });
  const { data: traineeList } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });
  const trainee = traineeList?.[0];

  const age = trainee?.birth_date
    ? Math.floor((new Date() - new Date(trainee.birth_date)) / (1000 * 60 * 60 * 24 * 365))
    : 30;

  const [prefs, setPrefs] = useState({
    weight_kg: '',
    height_cm: '',
    age: '',
    gender: '',
    activity_level: 'moderate',
    dietary_preference: 'balanced',
    meals_per_day: 4,
    cooking_time_preference: 'medium',
    weight_goal_kg: '',
    goal_timeline_weeks: '',
    activity_details: '',
    preferred_foods: [],
    disliked_foods: [],
    allergies: [],
    eating_out_times_per_week: 0,
    eating_out_day_preference: 'post_workout',
    alcohol_frequency: 'never',
    cheat_meals: [],
    mandatory_foods: [],
  });
  const [cheatInput, setCheatInput] = useState('');
  const [mandatoryInput, setMandatoryInput] = useState('');

  // Pre-fill from trainee
  useEffect(() => {
    if (trainee) {
      // Auto-fix height: if stored as meters (e.g. 1.73), convert to cm (173)
      const rawHeight = trainee.height_cm || '';
      const fixedHeight = rawHeight && parseFloat(rawHeight) < 3 ? Math.round(parseFloat(rawHeight) * 100) : rawHeight;
      setPrefs(p => ({
        ...p,
        weight_kg: trainee.weight_kg || '',
        height_cm: fixedHeight,
        age: age || '',
        gender: trainee.gender || '',
        activity_level: trainee.activity_level || 'moderate',
      }));
    }
  }, [trainee]);

  const macros = calculateMacros(prefs);

  const update = (key, val) => setPrefs(p => ({ ...p, [key]: val }));

  const toggleList = (key, val) => {
    setPrefs(p => ({
      ...p,
      [key]: p[key].includes(val) ? p[key].filter(x => x !== val) : [...p[key], val]
    }));
  };

  const addCustomFood = (key, input, setInput) => {
    const v = input.trim();
    if (v && !prefs[key].includes(v)) {
      update(key, [...prefs[key], v]);
    }
    setInput('');
  };

  const handleGenerate = async () => {
    if (!trainee) return;
    setGenerating(true);
    try {
      // Sync calculated macros to Trainee — ensures NutritionLog shows same targets
      if (macros && trainee?.id) {
        await base44.entities.Trainee.update(trainee.id, {
          target_calories: macros.targetCalories,
          target_protein:  macros.targetProtein,
          target_carbs:    macros.targetCarbs,
          target_fat:      macros.targetFat,
        });
      }

      // Generate plan (backend reads target_calories/protein from Trainee)
      const res = await base44.functions.invoke('generatePersonalMealPlan', {
        trainee_id: trainee.id,
      });

      const planId = res?.data?.plan?.id;
      if (!planId) throw new Error('Plan was not saved — missing id');
      navigate(`/MyMealPlan?plan_id=${planId}`);
    } catch (err) {
      console.error(err);
      alert('שגיאה ביצירת התפריט, אנא נסה שוב');
    } finally {
      setGenerating(false);
    }
  };

  const currentStep = STEPS[step];

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white pb-24" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => step > 0 ? setStep(s => s - 1) : navigate(-1)} className="p-2 rounded-full hover:bg-slate-100">
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-800">בניית תפריט אישי</h1>
            <p className="text-xs text-slate-500">{currentStep.emoji} {currentStep.title}</p>
          </div>
          <span className="text-sm text-slate-400">{step + 1}/{STEPS.length}</span>
        </div>
        {/* Progress bar */}
        <div className="max-w-lg mx-auto mt-3 flex gap-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className={`flex-1 h-1.5 rounded-full transition-all ${i <= step ? 'bg-teal-400' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* STEP 0: Personal */}
        {step === 0 && (
          <div className="space-y-5">
            <div className="text-center py-2">
              <div className="text-4xl mb-2">👤</div>
              <h2 className="text-xl font-bold text-slate-800">נתונים אישיים</h2>
              <p className="text-sm text-slate-500 mt-1">נמלא אוטומטית מהפרופיל שלך</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">משקל (ק"ג)</label>
                <Input type="number" value={prefs.weight_kg} onChange={e => update('weight_kg', e.target.value)} placeholder="70" className="text-center text-lg font-bold" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">גובה (ס"מ)</label>
                <Input type="number" value={prefs.height_cm} onChange={e => {
                  const val = parseFloat(e.target.value);
                  // Auto-convert meters to cm (e.g. 1.73 → 173)
                  update('height_cm', val > 0 && val < 3 ? Math.round(val * 100) : e.target.value);
                }} placeholder="170" className="text-center text-lg font-bold" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">גיל</label>
                <Input type="number" value={prefs.age} onChange={e => update('age', e.target.value)} placeholder="30" className="text-center text-lg font-bold" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">מין</label>
                <div className="flex gap-2">
                  {[{ v: 'male', l: '👨 זכר' }, { v: 'female', l: '👩 נקבה' }].map(g => (
                    <button key={g.v} onClick={() => update('gender', g.v)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${prefs.gender === g.v ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}>
                      {g.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 1: Goal */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="text-center py-2">
              <div className="text-4xl mb-2">🎯</div>
              <h2 className="text-xl font-bold text-slate-800">מה המטרה שלך?</h2>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">כמה ק"ג תרצה לרדת?</label>
              <div className="flex items-center gap-3">
                <Input type="number" min="0" step="0.5" value={prefs.weight_goal_kg} onChange={e => update('weight_goal_kg', e.target.value)}
                  placeholder="5" className="text-center text-2xl font-bold h-14" />
                <span className="text-slate-500 font-medium">ק"ג</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">תוך כמה שבועות?</label>
              <div className="grid grid-cols-4 gap-2">
                {[4, 8, 12, 16, 20, 24, 32, 52].map(w => (
                  <button key={w} onClick={() => update('goal_timeline_weeks', w)}
                    className={`py-3 rounded-xl text-sm font-bold border-2 transition-all ${prefs.goal_timeline_weeks === w ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}>
                    {w} שבועות
                  </button>
                ))}
              </div>
            </div>
            {prefs.weight_goal_kg && prefs.goal_timeline_weeks && (
              <div className="bg-teal-50 rounded-2xl p-4 text-center border border-teal-100">
                <p className="text-sm text-teal-700">
                  <strong>קצב ירידה מחושב:</strong>{' '}
                  {((prefs.weight_goal_kg / prefs.goal_timeline_weeks) * 10 / 10).toFixed(2)} ק"ג לשבוע
                </p>
                {(prefs.weight_goal_kg / prefs.goal_timeline_weeks) > 1 && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ קצב גבוה מהמומלץ, שקול מטרה ריאלית יותר</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Lifestyle */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="text-center py-2">
              <div className="text-4xl mb-2">🏃</div>
              <h2 className="text-xl font-bold text-slate-800">אורח חיים ופעילות</h2>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">רמת פעילות גופנית</label>
              <div className="space-y-2">
                {ACTIVITY_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => update('activity_level', opt.value)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-right transition-all ${prefs.activity_level === opt.value ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white'}`}>
                    {prefs.activity_level === opt.value && <Check className="w-5 h-5 text-teal-500 flex-shrink-0" />}
                    <div className="flex-1">
                      <div className="font-medium text-slate-800 text-sm">{opt.label}</div>
                      <div className="text-xs text-slate-500">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">תאר את עבודתך ואורח חייך (אופציונלי)</label>
              <textarea
                value={prefs.activity_details}
                onChange={e => update('activity_details', e.target.value)}
                placeholder='לדוגמה: עובד מול מחשב 8 שעות ביום, מתאמן 3 פעמים בשבוע...'
                className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm resize-none h-20 focus:border-teal-400 outline-none"
              />
            </div>
          </div>
        )}

        {/* STEP 3: Food preferences */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="text-center py-2">
              <div className="text-4xl mb-2">🥗</div>
              <h2 className="text-xl font-bold text-slate-800">העדפות תזונה ומזון</h2>
            </div>

            {/* Dietary style */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">סגנון תזונה</label>
              <div className="grid grid-cols-2 gap-2">
                {DIETARY_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => update('dietary_preference', opt.value)}
                    className={`p-3 rounded-xl border-2 text-right transition-all ${prefs.dietary_preference === opt.value ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white'}`}>
                    <div className="text-xl mb-0.5">{opt.emoji}</div>
                    <div className="font-medium text-sm text-slate-800">{opt.label}</div>
                    <div className="text-[11px] text-slate-500">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Meals per day */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">כמה ארוחות ביום?</label>
              <div className="flex gap-2 justify-center">
                {[3, 4, 5, 6].map(n => (
                  <button key={n} onClick={() => update('meals_per_day', n)}
                    className={`w-14 h-14 rounded-2xl text-xl font-bold border-2 transition-all ${prefs.meals_per_day === n ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Cooking time */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">זמן הכנת ארוחה</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: 'short', l: '⚡ מהיר', d: 'עד 10 דק' },
                  { v: 'medium', l: '🍳 בינוני', d: 'עד 30 דק' },
                  { v: 'long', l: '👨‍🍳 מורכב', d: 'עד שעה' },
                ].map(c => (
                  <button key={c.v} onClick={() => update('cooking_time_preference', c.v)}
                    className={`p-3 rounded-xl border-2 text-center transition-all ${prefs.cooking_time_preference === c.v ? 'border-teal-400 bg-teal-50' : 'border-slate-200'}`}>
                    <div className="text-sm font-medium text-slate-800">{c.l}</div>
                    <div className="text-[11px] text-slate-500">{c.d}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Preferred foods */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">מאכלים שאני אוהב</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {COMMON_FOODS.map(f => (
                  <button key={f} onClick={() => toggleList('preferred_foods', f)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${prefs.preferred_foods.includes(f) ? 'bg-teal-100 border-teal-400 text-teal-700 font-medium' : 'bg-white border-slate-200 text-slate-600'}`}>
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={foodInput} onChange={e => setFoodInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomFood('preferred_foods', foodInput, setFoodInput)}
                  placeholder="הוסף מאכל..." className="flex-1" />
                <Button size="sm" variant="outline" onClick={() => addCustomFood('preferred_foods', foodInput, setFoodInput)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {prefs.preferred_foods.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {prefs.preferred_foods.map(f => (
                    <Badge key={f} className="bg-teal-100 text-teal-700 border-0 gap-1">
                      {f}
                      <button onClick={() => toggleList('preferred_foods', f)}><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Disliked foods */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">🚫 מאכלים שאני לא רוצה בתפריט</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {COMMON_DISLIKED.map(f => (
                  <button key={f} onClick={() => toggleList('disliked_foods', f)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${prefs.disliked_foods.includes(f) ? 'bg-orange-100 border-orange-400 text-orange-700 font-medium' : 'bg-white border-slate-200 text-slate-600'}`}>
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={dislikedInput} onChange={e => setDislikedInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomFood('disliked_foods', dislikedInput, setDislikedInput)}
                  placeholder="הוסף מאכל שלא רוצה..." className="flex-1" />
                <Button size="sm" variant="outline" onClick={() => addCustomFood('disliked_foods', dislikedInput, setDislikedInput)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {prefs.disliked_foods.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {prefs.disliked_foods.map(f => (
                    <Badge key={f} className="bg-orange-100 text-orange-700 border-0 gap-1">
                      {f}
                      <button onClick={() => toggleList('disliked_foods', f)}><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Allergies */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">⚠️ אלרגיות / אי סבילות</label>
              <div className="flex flex-wrap gap-2">
                {COMMON_ALLERGIES.map(a => (
                  <button key={a} onClick={() => toggleList('allergies', a)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${prefs.allergies.includes(a) ? 'bg-red-100 border-red-400 text-red-700 font-medium' : 'bg-white border-slate-200 text-slate-600'}`}>
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Mandatory foods */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">✅ מאכלים שחובה לשלב בתפריט</label>
              <p className="text-xs text-slate-400 mb-2">מזונות שאתה חייב לאכול מדי יום</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {COMMON_MANDATORY.map(f => (
                  <button key={f} onClick={() => toggleList('mandatory_foods', f)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${prefs.mandatory_foods.includes(f) ? 'bg-green-100 border-green-400 text-green-700 font-medium' : 'bg-white border-slate-200 text-slate-600'}`}>
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={mandatoryInput} onChange={e => setMandatoryInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomFood('mandatory_foods', mandatoryInput, setMandatoryInput)}
                  placeholder="הוסף מאכל חובה..." className="flex-1" />
                <Button size="sm" variant="outline" onClick={() => addCustomFood('mandatory_foods', mandatoryInput, setMandatoryInput)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {prefs.mandatory_foods.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {prefs.mandatory_foods.map(f => (
                    <Badge key={f} className="bg-green-100 text-green-700 border-0 gap-1">
                      {f}
                      <button onClick={() => toggleList('mandatory_foods', f)}><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Cheat meals */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">🍕 מנת פינוק / ארוחת צ'יט</label>
              <p className="text-xs text-slate-400 mb-2">מה תרצה לאכול כפינוק שבועי? ה-AI ישלב בתפריט</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {COMMON_CHEAT.map(f => (
                  <button key={f} onClick={() => toggleList('cheat_meals', f)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${prefs.cheat_meals.includes(f) ? 'bg-purple-100 border-purple-400 text-purple-700 font-medium' : 'bg-white border-slate-200 text-slate-600'}`}>
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={cheatInput} onChange={e => setCheatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomFood('cheat_meals', cheatInput, setCheatInput)}
                  placeholder="הוסף פינוק..." className="flex-1" />
                <Button size="sm" variant="outline" onClick={() => addCustomFood('cheat_meals', cheatInput, setCheatInput)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {prefs.cheat_meals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {prefs.cheat_meals.map(f => (
                    <Badge key={f} className="bg-purple-100 text-purple-700 border-0 gap-1">
                      {f}
                      <button onClick={() => toggleList('cheat_meals', f)}><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Eating out */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">🍽️ אכילה מחוץ לבית</label>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-slate-600">כמה פעמים בשבוע?</span>
                <div className="flex gap-2">
                  {[0, 1, 2, 3].map(n => (
                    <button key={n} onClick={() => update('eating_out_times_per_week', n)}
                      className={`w-10 h-10 rounded-xl text-sm font-bold border-2 transition-all ${prefs.eating_out_times_per_week === n ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {prefs.eating_out_times_per_week > 0 && (
                <div className="flex gap-2">
                  {[
                    { v: 'post_workout', l: '💪 אחרי יום אימון', d: 'מומלץ' },
                    { v: 'any', l: '📅 כל יום שמתאים', d: '' },
                  ].map(opt => (
                    <button key={opt.v} onClick={() => update('eating_out_day_preference', opt.v)}
                      className={`flex-1 p-2.5 rounded-xl border-2 text-center text-sm transition-all ${prefs.eating_out_day_preference === opt.v ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}>
                      {opt.l}
                      {opt.d && <span className="block text-[10px] text-teal-500">{opt.d}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Alcohol */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">🍷 תדירות שתיית אלכוהול</label>
              <div className="space-y-1.5">
                {ALCOHOL_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => update('alcohol_frequency', opt.value)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-right text-sm transition-all ${prefs.alcohol_frequency === opt.value ? 'border-teal-400 bg-teal-50 text-teal-700 font-medium' : 'border-slate-200 text-slate-600'}`}>
                    {prefs.alcohol_frequency === opt.value && <Check className="w-4 h-4 text-teal-500 flex-shrink-0" />}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Review */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="text-center py-2">
              <div className="text-4xl mb-2">✨</div>
              <h2 className="text-xl font-bold text-slate-800">סיכום ויצירת תפריט</h2>
              <p className="text-sm text-slate-500">ה-AI יבנה לך תפריט אישי מושלם</p>
            </div>

            {macros && (
              <MacroWheels
                calories={macros.targetCalories}
                protein={macros.targetProtein}
                carbs={macros.targetCarbs}
                fat={macros.targetFat}
                targetCalories={macros.targetCalories}
                targetProtein={macros.targetProtein}
                targetCarbs={macros.targetCarbs}
                targetFat={macros.targetFat}
                title="יעדים תזונתיים מחושבים"
              />
            )}

            <div className="bg-white rounded-2xl p-4 border border-slate-100 space-y-3">
              {[
                { icon: '👤', label: 'פרופיל', val: `${prefs.weight_kg}ק"ג, ${prefs.height_cm}ס"מ, ${prefs.age} שנים` },
                { icon: '🎯', label: 'מטרה', val: prefs.weight_goal_kg ? `לרדת ${prefs.weight_goal_kg} ק"ג תוך ${prefs.goal_timeline_weeks} שבועות` : 'שמירה על משקל' },
                { icon: '🏃', label: 'פעילות', val: ACTIVITY_OPTIONS.find(a => a.value === prefs.activity_level)?.label },
                { icon: '🥗', label: 'סגנון', val: DIETARY_OPTIONS.find(d => d.value === prefs.dietary_preference)?.label },
                { icon: '🍽️', label: 'ארוחות', val: `${prefs.meals_per_day} ארוחות ביום` },
                ...(prefs.preferred_foods.length ? [{ icon: '❤️', label: 'אוהב', val: prefs.preferred_foods.slice(0, 5).join(', ') }] : []),
                ...(prefs.disliked_foods.length ? [{ icon: '🚫', label: 'לא רוצה', val: prefs.disliked_foods.join(', ') }] : []),
                ...(prefs.mandatory_foods.length ? [{ icon: '✅', label: 'חובה', val: prefs.mandatory_foods.join(', ') }] : []),
                ...(prefs.cheat_meals.length ? [{ icon: '🍕', label: "צ'יט", val: prefs.cheat_meals.join(', ') }] : []),
                ...(prefs.eating_out_times_per_week > 0 ? [{ icon: '🍽️', label: 'אכילה בחוץ', val: `${prefs.eating_out_times_per_week}x בשבוע${prefs.eating_out_day_preference === 'post_workout' ? ' (אחרי אימון)' : ''}` }] : []),
                ...(prefs.alcohol_frequency !== 'never' ? [{ icon: '🍷', label: 'אלכוהול', val: ALCOHOL_OPTIONS.find(a => a.value === prefs.alcohol_frequency)?.label }] : []),
                ...(prefs.allergies.length ? [{ icon: '⚠️', label: 'אלרגיות', val: prefs.allergies.join(', ') }] : []),
              ].map(item => (
                <div key={item.label} className="flex items-start gap-3 text-sm">
                  <span className="text-lg leading-none mt-0.5">{item.icon}</span>
                  <span className="text-slate-500 w-16 flex-shrink-0">{item.label}:</span>
                  <span className="text-slate-800 font-medium">{item.val}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full py-4 rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-3 transition-all disabled:opacity-60"
              style={{ background: generating ? '#94a3b8' : 'linear-gradient(135deg, #79DBD6, #3b82f6)' }}
            >
              {generating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  בונה תפריט אישי...
                </>
              ) : (
                <>
                  <Sparkles className="w-6 h-6" />
                  צור תפריט אישי עם AI
                </>
              )}
            </button>
            {generating && (
              <p className="text-center text-sm text-slate-500 animate-pulse">
                ה-AI מתאים לך תפריט מדויק... עד 30 שניות
              </p>
            )}
          </div>
        )}

        {/* Navigation */}
        {step < STEPS.length - 1 && (
          <Button
            className="w-full h-13 text-base font-bold"
            style={{ backgroundColor: '#79DBD6', color: 'white' }}
            onClick={() => setStep(s => s + 1)}
          >
            <span>המשך</span>
            <ChevronLeft className="w-5 h-5 mr-1" />
          </Button>
        )}
      </div>
    </div>
  );
}