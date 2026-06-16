import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { format, subDays } from 'date-fns';
import { he } from 'date-fns/locale/he';
import { CheckCircle2, Circle, Trophy, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SuccessJourney({ meals, water, workouts, trainee }) {
  const journeyData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dateStr = format(date, 'yyyy-MM-dd');
      
      const dayMeals = meals?.filter(m => m.date === dateStr) || [];
      const dayWater = water?.filter(w => w.date === dateStr) || [];
      const dayWorkouts = workouts?.filter(w => w.date === dateStr) || [];
      
      const totalCalories = dayMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
      const totalWater = dayWater.reduce((sum, w) => sum + (w.amount_ml || 0), 0);
      
      const caloriesGoal = totalCalories >= (trainee?.target_calories || 2000) * 0.9;
      const waterGoal = totalWater >= (trainee?.water_target_ml || 3000) * 0.9;
      const workoutGoal = dayWorkouts.length > 0;
      
      const perfectDay = caloriesGoal && waterGoal && workoutGoal;
      const goalsCompleted = [caloriesGoal, waterGoal, workoutGoal].filter(Boolean).length;
      
      return {
        date,
        dateStr,
        dayName: format(date, 'EEE', { locale: he }),
        perfectDay,
        goalsCompleted,
        caloriesGoal,
        waterGoal,
        workoutGoal
      };
    });
    
    return last7Days;
  }, [meals, water, workouts, trainee]);

  const perfectDaysCount = journeyData.filter(d => d.perfectDay).length;
  const currentStreak = useMemo(() => {
    let streak = 0;
    for (let i = journeyData.length - 1; i >= 0; i--) {
      if (journeyData[i].goalsCompleted >= 2) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }, [journeyData]);

  return (
    <Card className="p-5 bg-gradient-to-br from-purple-50 to-blue-50 border-0 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          מסע ההצלחה שלך
        </h3>
        <div className="text-right">
          <p className="text-2xl font-bold text-purple-600">{currentStreak}</p>
          <p className="text-xs text-slate-600">ימי סטריק</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        <div className="absolute top-6 right-6 left-6 h-1 bg-slate-200" />
        <div 
          className="absolute top-6 right-6 h-1 bg-gradient-to-l from-purple-500 to-blue-500 transition-all duration-500"
          style={{ width: `${(perfectDaysCount / 7) * 100}%` }}
        />
        
        <div className="grid grid-cols-7 gap-1 relative">
          {journeyData.map((day, i) => (
            <motion.div
              key={day.dateStr}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="flex flex-col items-center"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center relative z-10 ${
                day.perfectDay 
                  ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-lg' 
                  : day.goalsCompleted >= 2
                  ? 'bg-gradient-to-br from-blue-400 to-blue-600 shadow-md'
                  : day.goalsCompleted === 1
                  ? 'bg-slate-300'
                  : 'bg-slate-200'
              }`}>
                {day.perfectDay ? (
                  <Trophy className="w-6 h-6 text-white" />
                ) : day.goalsCompleted >= 2 ? (
                  <CheckCircle2 className="w-6 h-6 text-white" />
                ) : (
                  <span className="text-lg">{day.goalsCompleted}</span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1">{day.dayName}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mt-5">
        <div className="text-center p-2 bg-white/70 rounded-lg">
          <p className="text-xl font-bold text-yellow-600">{perfectDaysCount}</p>
          <p className="text-xs text-slate-600">ימים מושלמים</p>
        </div>
        <div className="text-center p-2 bg-white/70 rounded-lg">
          <p className="text-xl font-bold text-blue-600">
            {journeyData.filter(d => d.goalsCompleted >= 2).length}
          </p>
          <p className="text-xs text-slate-600">ימים טובים</p>
        </div>
        <div className="text-center p-2 bg-white/70 rounded-lg">
          <p className="text-xl font-bold text-purple-600">{currentStreak}</p>
          <p className="text-xs text-slate-600">סטריק נוכחי</p>
        </div>
      </div>
    </Card>
  );
}