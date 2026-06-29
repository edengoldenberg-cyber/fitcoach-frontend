import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ChevronLeft, Trophy, Utensils, Dumbbell, BarChart3, Users, ClipboardList, Settings, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const traineeSteps = [
  {
    id: 'first_meal',
    title: 'הוסף ארוחה ראשונה 🍳',
    description: 'לחץ כדי לפתוח את יומן התזונה ולהוסיף את הארוחה הראשונה שלך.',
    cta: 'הסמנתי כבוצע ✓',
    navCta: 'פתח יומן תזונה',
    navPath: 'NutritionLog',
    icon: Utensils,
    win: 'קיבלת 20 נקודות!'
  },
  {
    id: 'first_workout',
    title: 'פתח את האימון היומי 💪',
    description: 'גש לאימון היומי שלך, קרא את התרגילים ועשה את הסט הראשון.',
    cta: 'הסמנתי כבוצע ✓',
    navCta: 'פתח אימון יומי',
    navPath: 'TraineeDailyWorkout',
    icon: Dumbbell,
    win: 'התחלת רצף ראשון!'
  },
  {
    id: 'league_points',
    title: 'כך צוברים נקודות 🏆',
    description: 'כל ארוחה שתרשום, כל אימון שתסמן — מזכה אותך בנקודות ומטפס אותך בדירוג.',
    cta: 'הבנתי, ממשיך',
    navCta: 'ראה את הליגה',
    navPath: 'ShapeLeagueHome',
    icon: Trophy,
    win: 'מעולה! הליגה מחכה לך'
  },
  {
    id: 'progress_reward',
    title: 'ראה את ההתקדמות שלך 📈',
    description: 'פתח את דף המדדים ובדוק כמה קדמת השבוע.',
    cta: 'הסמנתי כבוצע ✓',
    navCta: 'פתח מדדים',
    navPath: 'Metrics',
    icon: BarChart3,
    win: 'יש לך ניצחון ראשון!'
  }
];

const coachSteps = [
  {
    id: 'monitor_trainees',
    title: 'עקוב אחרי מתאמנים 👥',
    description: 'פתח את ניהול המתאמנים וראה מי פעיל ומי צריך עידוד.',
    cta: 'הסמנתי כבוצע ✓',
    navCta: 'פתח ניהול מתאמנים',
    navPath: 'ManageTrainees',
    icon: Users,
    win: 'עכשיו רואים מי צריך עזרה'
  },
  {
    id: 'assign_workout',
    title: 'שייך אימון יומי 💪',
    description: 'פתח את לוח האימונים וראה את האימונים שמוכנים למתאמנים.',
    cta: 'הסמנתי כבוצע ✓',
    navCta: 'פתח אימונים',
    navPath: 'CoachDailyWorkout',
    icon: ClipboardList,
    win: 'האימון מוכן למתאמנים'
  },
  {
    id: 'see_nutrition',
    title: 'בדוק תזונה במהירות 🍽️',
    description: 'גש לדוחות התזונה וזהה מתאמנים שצריכים התערבות.',
    cta: 'הסמנתי כבוצע ✓',
    navCta: 'פתח דוחות תזונה',
    navPath: 'CoachNutrition',
    icon: Utensils,
    win: 'זיהית איפה להתערב'
  },
  {
    id: 'league_controls',
    title: 'נהל את הליגה 🏆',
    description: 'פתח את לוח הבקרה של הליגה ובדוק את הדירוג הנוכחי.',
    cta: 'הסמנתי כבוצע ✓',
    navCta: 'פתח ניהול ליגה',
    navPath: 'CoachShapeLeagueDashboard',
    icon: Settings,
    win: 'שליטת המאמן מוכנה'
  }
];

function StepProgress({ steps, currentIndex }) {
  return (
    <div className="flex gap-2" aria-label="התקדמות הדרכה">
      {steps.map((step, index) => (
        <div key={step.id} className={`h-2 flex-1 rounded-full ${index <= currentIndex ? 'bg-teal-400' : 'bg-slate-200'}`} />
      ))}
    </div>
  );
}

function ActionCard({ step, completed, onComplete, onNavigate }) {
  const Icon = step.icon;
  return (
    <div className="rounded-3xl bg-white p-5 shadow-xl border border-slate-100 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-teal-50 flex items-center justify-center">
          <Icon className="h-6 w-6 text-teal-600" />
        </div>
        <h2 className="text-xl font-black text-slate-900">{step.title}</h2>
      </div>

      <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>

      {/* Primary action: navigate to the actual feature */}
      <Button
        onClick={onNavigate}
        className="w-full h-14 rounded-2xl text-base font-bold gap-2"
        style={{ backgroundColor: '#79DBD6', color: 'white' }}
      >
        {step.navCta}
        <ArrowLeft className="h-4 w-4" />
      </Button>

      {/* Secondary: self-confirm if user already completed the action */}
      <button
        onClick={onComplete}
        className="w-full py-2 text-sm text-slate-500 hover:text-teal-700 flex items-center justify-center gap-2 rounded-xl hover:bg-slate-50 transition-colors"
      >
        {completed && <CheckCircle2 className="h-4 w-4 text-teal-500" />}
        {step.cta}
      </button>
    </div>
  );
}

function SuccessBurst({ text, onNext, isLast }) {
  return (
    <div className="rounded-3xl bg-gradient-to-br from-amber-300 to-orange-400 p-6 text-center text-white shadow-xl animate-in zoom-in-95 duration-200">
      <div className="text-5xl mb-3">🎉</div>
      <p className="text-2xl font-black mb-4">{text}</p>
      <Button onClick={onNext} className="w-full h-12 rounded-2xl bg-white text-orange-600 hover:bg-orange-50 font-bold">
        {isLast ? 'סיים הדרכה' : 'המשך'}
        <ChevronLeft className="h-4 w-4 mr-2" />
      </Button>
    </div>
  );
}

export default function InteractiveOnboarding({ roleType = 'trainee', currentIndex, completedSteps, showSuccess, onActionComplete, onNext, onSkip }) {
  const navigate = useNavigate();
  const steps = roleType === 'coach' ? coachSteps : traineeSteps;
  const currentStep = steps[currentIndex] || steps[0];
  const completionPercent = Math.round(((currentIndex + (showSuccess ? 1 : 0)) / steps.length) * 100);

  const handleNavigate = (step) => {
    // Save current onboarding state to localStorage so it survives navigation
    localStorage.setItem('onboarding_state', JSON.stringify({
      roleType,
      stepIndex: currentIndex,
      completedSteps,
      returnStep: step.id,
    }));
    navigate(createPageUrl(step.navPath));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50 px-4 py-5 pb-10" dir="rtl">
      <div className="mx-auto max-w-md space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-teal-600">{completionPercent}% הושלם</p>
            <h1 className="text-xl font-black text-slate-900">אני מדריך אותך עכשיו</h1>
          </div>
          <button onClick={onSkip} className="rounded-full px-3 py-2 text-sm text-slate-500 hover:bg-white min-h-0 min-w-0">
            דלג
          </button>
        </div>

        <StepProgress steps={steps} currentIndex={currentIndex} />

        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-lg">
          <p className="text-sm font-semibold">{roleType === 'coach' ? 'נתחיל בניהול חכם.' : 'נשיג ניצחון ראשון מהר.'}</p>
        </div>

        {showSuccess ? (
          <SuccessBurst text={currentStep.win} onNext={onNext} isLast={currentIndex === steps.length - 1} />
        ) : (
          <ActionCard
            step={currentStep}
            completed={completedSteps.includes(currentStep.id)}
            onComplete={() => onActionComplete(currentStep)}
            onNavigate={() => handleNavigate(currentStep)}
          />
        )}

        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-sm font-semibold text-blue-800">💡 לחץ על הכפתור הירוק כדי לבצע את המשימה, ואז חזור לכאן.</p>
        </div>
      </div>
    </div>
  );
}

export { traineeSteps, coachSteps };
