import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Trophy, Award, Lock } from 'lucide-react';
import AchievementsBadge from '../components/trainee/AchievementsBadge';
import SuccessJourney from '../components/trainee/SuccessJourney';
import { motion } from 'framer-motion';

const ALL_ACHIEVEMENTS = [
  { type: 'first_meal', title: 'הארוחה הראשונה', description: 'רשמת את הארוחה הראשונה', icon: '🍽️', tier: 'bronze' },
  { type: 'first_workout', title: 'האימון הראשון', description: 'השלמת את האימון הראשון', icon: '💪', tier: 'bronze' },
  { type: 'first_water', title: 'טיפה ראשונה', description: 'רשמת שתייה לראשונה', icon: '💧', tier: 'bronze' },
  { type: 'streak_3_days', title: 'סטריק 3 ימים', description: '3 ימי דיווח רצופים', icon: '🔥', tier: 'bronze' },
  { type: 'streak_7_days', title: 'שבוע מלא', description: 'שבוע שלם של דיווח', icon: '⭐', tier: 'silver' },
  { type: 'streak_14_days', title: 'שבועיים רצופים', description: 'שבועיים של התמדה', icon: '🌟', tier: 'silver' },
  { type: 'streak_30_days', title: 'חודש מושלם', description: 'חודש שלם ללא הפסקה', icon: '👑', tier: 'gold' },
  { type: 'perfect_day', title: 'יום מושלם', description: 'השלמת כל היעדים ביום', icon: '✨', tier: 'silver' },
  { type: 'perfect_week', title: 'שבוע מושלם', description: '7 ימים מושלמים רצופים', icon: '🏆', tier: 'gold' },
  { type: '10_workouts', title: '10 אימונים', description: 'השלמת 10 אימונים', icon: '🎯', tier: 'bronze' },
  { type: '25_workouts', title: '25 אימונים', description: 'השלמת 25 אימונים', icon: '🚀', tier: 'silver' },
  { type: '50_workouts', title: '50 אימונים', description: 'חצי מאה אימונים!', icon: '💫', tier: 'gold' },
  { type: '100_workouts', title: '100 אימונים', description: 'מאה אימונים - אגדה!', icon: '👑', tier: 'platinum' },
  { type: 'weight_loss_1kg', title: 'קילו ראשון', description: 'ירדת בקילו', icon: '📉', tier: 'bronze' },
  { type: 'weight_loss_5kg', title: '5 קילו', description: 'ירדת ב-5 קילו', icon: '🎊', tier: 'silver' },
  { type: 'weight_loss_10kg', title: '10 קילו', description: 'ירדת ב-10 קילו!', icon: '🏅', tier: 'gold' },
];

export default function AchievementsPage() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const result = await base44.entities.Trainee.filter({ user_email: user.email });
      return result?.[0] || null;
    },
    enabled: !!user?.email,
  });

  const { data: achievements = [] } = useQuery({
    queryKey: ['achievements', trainee?.user_email],
    queryFn: () => base44.entities.Achievement.filter({ trainee_email: trainee?.user_email }),
    enabled: !!trainee?.user_email,
  });

  const { data: meals = [] } = useQuery({
    queryKey: ['meals', trainee?.user_email],
    queryFn: () => base44.entities.MealEntry.filter({ trainee_email: trainee?.user_email }),
    enabled: !!trainee?.user_email,
  });

  const { data: water = [] } = useQuery({
    queryKey: ['water', trainee?.user_email],
    queryFn: () => base44.entities.WaterEntry.filter({ trainee_email: trainee?.user_email }),
    enabled: !!trainee?.user_email,
  });

  const { data: workouts = [] } = useQuery({
    queryKey: ['workouts', trainee?.user_email],
    queryFn: () => base44.entities.WorkoutSession.filter({ trainee_email: trainee?.user_email }),
    enabled: !!trainee?.user_email,
  });

  const earnedTypes = new Set((achievements || []).filter(Boolean).map(a => a.achievement_type));

  const stats = useMemo(() => {
    const byTier = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
    if (achievements && Array.isArray(achievements)) {
      achievements.forEach(a => {
        if (a?.tier) {
          byTier[a.tier] = (byTier[a.tier] || 0) + 1;
        }
      });
    }
    return {
      total: achievements?.length || 0,
      possible: ALL_ACHIEVEMENTS.length,
      byTier
    };
  }, [achievements]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-slate-50 pb-20" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3 mb-2">
            <Trophy className="w-8 h-8 text-yellow-500" />
            ההישגים שלי
          </h1>
          <p className="text-slate-600">
            {stats.total} מתוך {stats.possible} הישגים הושגו
          </p>
        </div>

        {/* Overall Stats */}
        <Card className="p-5 mb-6 bg-gradient-to-br from-yellow-100 to-yellow-200 border-0 shadow-lg">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-3xl mb-1">🥉</div>
              <p className="text-xl font-bold text-orange-900">{stats.byTier.bronze}</p>
              <p className="text-xs text-orange-700">ברונזה</p>
            </div>
            <div>
              <div className="text-3xl mb-1">🥈</div>
              <p className="text-xl font-bold text-slate-900">{stats.byTier.silver}</p>
              <p className="text-xs text-slate-700">כסף</p>
            </div>
            <div>
              <div className="text-3xl mb-1">🥇</div>
              <p className="text-xl font-bold text-yellow-900">{stats.byTier.gold}</p>
              <p className="text-xs text-yellow-700">זהב</p>
            </div>
            <div>
              <div className="text-3xl mb-1">💎</div>
              <p className="text-xl font-bold text-purple-900">{stats.byTier.platinum}</p>
              <p className="text-xs text-purple-700">פלטינום</p>
            </div>
          </div>
        </Card>

        {/* Success Journey */}
        <div className="mb-6">
          <SuccessJourney meals={meals} water={water} workouts={workouts} trainee={trainee} />
        </div>

        {/* Earned Achievements */}
        {achievements && achievements.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Award className="w-5 h-5 text-green-600" />
              הישגים שהשגת
            </h2>
            <div className="grid gap-3">
              {achievements
                .sort((a, b) => new Date(b.earned_at) - new Date(a.earned_at))
                .map(achievement => (
                  <motion.div
                    key={achievement.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <AchievementsBadge achievement={achievement} />
                  </motion.div>
                ))}
            </div>
          </div>
        )}

        {/* Locked Achievements */}
        <div>
          <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Lock className="w-5 h-5 text-slate-400" />
            הישגים נעולים
          </h2>
          <div className="grid gap-3">
            {ALL_ACHIEVEMENTS
              .filter(a => !earnedTypes.has(a.type))
              .map(achievement => (
                <Card key={achievement.type} className="p-4 bg-slate-100 border-slate-200 relative overflow-hidden">
                  <div className="absolute inset-0 bg-slate-200/50 backdrop-blur-sm flex items-center justify-center">
                    <Lock className="w-8 h-8 text-slate-400" />
                  </div>
                  <div className="relative opacity-50">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full bg-slate-300 flex items-center justify-center">
                        <span className="text-2xl grayscale">{achievement.icon}</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-700">{achievement.title}</h4>
                        <p className="text-xs text-slate-600 mt-1">{achievement.description}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}