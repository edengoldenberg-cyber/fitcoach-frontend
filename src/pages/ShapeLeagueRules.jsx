import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Dumbbell, Utensils, Droplets, Flame, Trophy, Users, Star, Shield, RotateCcw, Gift } from 'lucide-react';

const RuleCard = ({ icon, title, children, accent = 'yellow' }) => {
  const accents = {
    yellow: 'border-yellow-500/40 bg-yellow-500/5',
    teal:   'border-teal-500/40 bg-teal-500/5',
    purple: 'border-purple-500/40 bg-purple-500/5',
    orange: 'border-orange-500/40 bg-orange-500/5',
    green:  'border-green-500/40 bg-green-500/5',
  };
  return (
    <div className={`rounded-2xl border p-5 ${accents[accent]}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="text-2xl">{icon}</div>
        <h2 className="text-white font-bold text-lg">{title}</h2>
      </div>
      {children}
    </div>
  );
};

const PointRow = ({ emoji, icon: IconComponent, label, points, color }) => (
  <div className="flex items-center justify-between px-4 py-3 bg-slate-800 rounded-xl">
    <div className="flex items-center gap-3">
      <span className="text-xl">{emoji}</span>
      <IconComponent className={`w-4 h-4 ${color}`} />
      <span className="text-white text-sm font-medium">{label}</span>
    </div>
    <div className={`font-bold text-lg ${color}`}>+{points}</div>
  </div>
);

export default function ShapeLeagueRules() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 pb-24" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur border-b border-slate-700 px-4 py-3 flex items-center gap-3">
        <Link to="/ShapeLeagueHome" className="text-slate-400 hover:text-white transition-colors min-h-0 min-w-0">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <h1 className="text-white font-bold text-lg">חוקי הליגה</h1>
        </div>
      </div>

      {/* Hero */}
      <div className="px-4 pt-8 pb-6 text-center">
        <div className="text-5xl mb-3">📜</div>
        <h2 className="text-3xl font-black text-white mb-1">Shape League</h2>
        <p className="text-slate-400 text-sm">הבן את הכללים — שלוט בליגה</p>
      </div>

      <div className="px-4 space-y-4 max-w-lg mx-auto">

        {/* Section 1 — Points */}
        <RuleCard icon="⚡" title="איך מרוויחים נקודות?" accent="yellow">
          <div className="space-y-2">
            <PointRow emoji="🏋️" icon={Dumbbell} label="אימון יומי" points={30} color="text-teal-400" />
            <PointRow emoji="🍽️" icon={Utensils} label="ארוחה מוזנת" points={10} color="text-green-400" />
            <PointRow emoji="💧" icon={Droplets} label="עמידה ביעד מים" points={15} color="text-blue-400" />
            <PointRow emoji="🔥" icon={Flame} label="יום מושלם (בונוס)" points={20} color="text-yellow-400" />
          </div>
          <div className="mt-4 bg-yellow-400/10 rounded-xl px-4 py-3 text-center">
            <p className="text-yellow-300 text-sm font-semibold">יום מושלם = אימון + 3 ארוחות + מים ✅</p>
            <p className="text-slate-400 text-xs mt-1">מקסימום 100 נקודות ביום</p>
          </div>
        </RuleCard>

        {/* Section 2 — Weekly Ranking */}
        <RuleCard icon="📊" title="דירוג שבועי" accent="purple">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <RotateCcw className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">איפוס שבועי</p>
                <p className="text-slate-400 text-xs">הדירוג מתאפס כל שבוע — כל שבוע הוא הזדמנות חדשה</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Star className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">צבירת נקודות</p>
                <p className="text-slate-400 text-xs">הנקודות מצטברות לאורך כל השבוע — כל פעילות נחשבת</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Trophy className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">עליה בדירוג</p>
                <p className="text-slate-400 text-xs">ככל שתעלה יותר נקודות, תעלה בדירוג הכללי</p>
              </div>
            </div>
          </div>
        </RuleCard>

        {/* Section 3 — Groups */}
        <RuleCard icon="👥" title="תחרות קבוצתית" accent="teal">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-teal-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">אתה שייך לקבוצה</p>
                <p className="text-slate-400 text-xs">כל מתאמן משויך לקבוצה של עד 5 אנשים</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Flame className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">הקבוצות מתחרות</p>
                <p className="text-slate-400 text-xs">הדירוג הקבוצתי נקבע לפי ממוצע הנקודות של כל הקבוצה</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Star className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">הפעילות שלך עוזרת לקבוצה</p>
                <p className="text-slate-400 text-xs">כל נקודה שלך מעלה את הממוצע הקבוצתי — אל תשכח את הצוות!</p>
              </div>
            </div>
          </div>
          <div className="mt-4 bg-teal-400/10 rounded-xl px-4 py-3 text-center">
            <p className="text-teal-300 text-sm font-semibold">💡 חבר לא פעיל = הקבוצה יורדת בדירוג</p>
          </div>
        </RuleCard>

        {/* Section 4 — Rewards */}
        <RuleCard icon="🎁" title="פרסים חודשיים" accent="orange">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Gift className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">פרסים למובילים</p>
                <p className="text-slate-400 text-xs">המתאמנים עם הדירוג הגבוה ביותר מקבלים פרסים בסוף כל חודש</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Trophy className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">פרס קבוצתי</p>
                <p className="text-slate-400 text-xs">הקבוצות המובילות גם יכולות לזכות בפרסים קבוצתיים</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Flame className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">עקביות = הצלחה</p>
                <p className="text-slate-400 text-xs">עקביות שבועית חשובה יותר מפרץ אחד — היה קבוע!</p>
              </div>
            </div>
          </div>
          <div className="mt-4 bg-orange-400/10 rounded-xl px-4 py-3 text-center">
            <p className="text-orange-300 text-sm font-semibold">🏆 פרסים ועדכונים — בקרוב!</p>
            <p className="text-slate-500 text-xs mt-1">הפרסים יוכרזו בקרוב על ידי המאמן</p>
          </div>
        </RuleCard>

        {/* Section 5 — Fair Play */}
        <RuleCard icon="⚖️" title="Fair Play — משחק הוגן" accent="green">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">נקודות רק מפעילות אמיתית</p>
                <p className="text-slate-400 text-xs">המערכת סופרת רק פעולות אמיתיות — אין קיצורי דרך</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">אין ספאם ואין פעולות מזויפות</p>
                <p className="text-slate-400 text-xs">ניסיון לרמות את המערכת עלול לגרום לביטול נקודות</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold">חסימת כפילויות</p>
                <p className="text-slate-400 text-xs">פעולות כפולות נחסמות אוטומטית — מקסימום פעם אחת ביום לכל קטגוריה</p>
              </div>
            </div>
          </div>
          <div className="mt-4 bg-green-400/10 rounded-xl px-4 py-3 text-center">
            <p className="text-green-300 text-sm font-semibold">✅ השחק הוגן — תנצח הוגן</p>
          </div>
        </RuleCard>

        {/* Back CTA */}
        <Link to="/ShapeLeagueHome" className="block">
          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/40 rounded-2xl p-5 text-center hover:from-yellow-500/30 hover:to-orange-500/30 transition-all">
            <p className="text-yellow-300 text-lg font-bold">🏆 בוא לנצח!</p>
            <p className="text-slate-400 text-sm mt-1">חזרה לדשבורד הליגה</p>
          </div>
        </Link>
      </div>
    </div>
  );
}