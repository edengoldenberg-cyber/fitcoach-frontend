import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ChevronLeft, Trophy, Utensils, Dumbbell, BarChart3, Users, ClipboardList, Settings } from 'lucide-react';
import MiniLoopDemo from './MiniLoopDemo';

const traineeSteps = [
  { id: 'first_meal', title: 'הוסף ארוחה ראשונה 🍳', cta: 'הוספתי ארוחה', icon: Utensils, demo: 'meal', win: 'קיבלת 20 נקודות!' },
  { id: 'first_workout', title: 'פתח את האימון היומי 💪', cta: 'פתחתי אימון', icon: Dumbbell, demo: 'workout', win: 'התחלת רצף ראשון!' },
  { id: 'league_points', title: 'כך צוברים נקודות 🏆', cta: 'הבנתי נקודות', icon: Trophy, demo: 'scan', win: 'מעולה! הליגה מחכה לך' },
  { id: 'progress_reward', title: 'ראה את ההתקדמות שלך 📈', cta: 'ראיתי התקדמות', icon: BarChart3, demo: 'meal', win: 'יש לך ניצחון ראשון!' }
];

const coachSteps = [
  { id: 'monitor_trainees', title: 'עקוב אחרי מתאמנים 👥', cta: 'פתחתי מעקב', icon: Users, demo: 'scan', win: 'עכשיו רואים מי צריך עזרה' },
  { id: 'assign_workout', title: 'שייך אימון יומי 💪', cta: 'ראיתי אימונים', icon: ClipboardList, demo: 'workout', win: 'האימון מוכן למתאמנים' },
  { id: 'see_nutrition', title: 'בדוק תזונה במהירות 🍽️', cta: 'ראיתי תזונה', icon: Utensils, demo: 'meal', win: 'זיהית איפה להתערב' },
  { id: 'league_controls', title: 'נהל את הליגה 🏆', cta: 'ראיתי ליגה', icon: Settings, demo: 'scan', win: 'שליטת המאמן מוכנה' }
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

function ActionCard({ step, completed, onComplete }) {
  const Icon = step.icon;
  return (
    <div className="relative rounded-3xl bg-white p-5 shadow-xl border border-slate-100">
      <div className="absolute -top-3 right-6 rounded-full bg-teal-500 px-3 py-1 text-xs font-bold text-white shadow-lg">
        לחץ כאן 👇
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-12 w-12 rounded-2xl bg-teal-50 flex items-center justify-center">
          <Icon className="h-6 w-6 text-teal-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">{step.title}</h2>
      </div>
      <MiniLoopDemo type={step.demo} />
      <Button onClick={onComplete} className="mt-4 w-full h-14 rounded-2xl text-base font-bold bg-teal-500 hover:bg-teal-600 text-white">
        {completed ? <CheckCircle2 className="h-5 w-5 ml-2" /> : null}
        {step.cta}
      </Button>
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
  const steps = roleType === 'coach' ? coachSteps : traineeSteps;
  const currentStep = steps[currentIndex] || steps[0];
  const completionPercent = Math.round(((currentIndex + (showSuccess ? 1 : 0)) / steps.length) * 100);

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
          <ActionCard step={currentStep} completed={completedSteps.includes(currentStep.id)} onComplete={() => onActionComplete(currentStep)} />
        )}

        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-sm font-semibold text-blue-800">💡 טיפ קצר יופיע רק כשצריך.</p>
        </div>
      </div>
    </div>
  );
}

export { traineeSteps, coachSteps };