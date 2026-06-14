import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, MessageSquareOff } from "lucide-react";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, startOfDay } from 'date-fns';
import { calculateWeeklyCompliance } from '../components/shared/ComplianceCalculator';

export default function CoachDailyAlert() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['trainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: allMeals = [] } = useQuery({
    queryKey: ['allMeals'],
    queryFn: () => base44.entities.MealEntry.list('-date', 500),
  });

  const { data: allWater = [] } = useQuery({
    queryKey: ['allWater'],
    queryFn: () => base44.entities.WaterEntry.list('-date', 500),
  });

  const { data: allWorkouts = [] } = useQuery({
    queryKey: ['allWorkouts'],
    queryFn: () => base44.entities.WorkoutSession.list('-date', 500),
  });

  const { data: allMeasurements = [] } = useQuery({
    queryKey: ['allMeasurements'],
    queryFn: () => base44.entities.BodyMeasurement.list('-date', 500),
  });

  const alertTrainees = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const alerts = [];

    trainees.forEach(trainee => {
      const reasons = [];
      
      // Check today's data
      const todayMeals = allMeals.filter(m => m.trainee_email === trainee.user_email && m.date === today);
      const todayWater = allWater.filter(w => w.trainee_email === trainee.user_email && w.date === today);
      
      if (todayMeals.length === 0 && todayWater.length === 0) {
        reasons.push({ type: 'no_data_today', label: 'לא הזין נתונים היום', severity: 'high' });
      }

      // Weekly compliance
      const traineeMeals = allMeals.filter(m => m.trainee_email === trainee.user_email);
      const traineeWater = allWater.filter(w => w.trainee_email === trainee.user_email);
      const traineeWorkouts = allWorkouts.filter(w => w.trainee_email === trainee.user_email);
      const traineeMeasurements = allMeasurements.filter(m => m.trainee_email === trainee.user_email);
      
      const compliance = calculateWeeklyCompliance(
        traineeMeals,
        traineeWater,
        traineeWorkouts,
        traineeMeasurements,
        trainee
      );

      if (compliance.totalScore < 50) {
        reasons.push({ type: 'low_compliance', label: `התמדה נמוכה: ${compliance.totalScore}%`, severity: 'high' });
      }

      // Check for unusual patterns (example: very low calories 2-3 days)
      const last3Days = [0, 1, 2].map(i => format(new Date(Date.now() - i * 86400000), 'yyyy-MM-dd'));
      let lowCalorieDays = 0;
      last3Days.forEach(day => {
        const dayMeals = traineeMeals.filter(m => m.date === day);
        const totalCal = dayMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
        if (totalCal > 0 && totalCal < (trainee.target_calories || 2000) * 0.5) {
          lowCalorieDays++;
        }
      });

      if (lowCalorieDays >= 2) {
        reasons.push({ type: 'low_calories', label: `קלוריות נמוכות מדי ${lowCalorieDays} ימים`, severity: 'medium' });
      }

      // Check workout stagnation
      const recentWorkouts = traineeWorkouts.slice(0, 4);
      if (recentWorkouts.length >= 4) {
        const exerciseMap = {};
        recentWorkouts.forEach(w => {
          w.exercises?.forEach(ex => {
            if (!exerciseMap[ex.exercise_name]) exerciseMap[ex.exercise_name] = [];
            const maxWeight = Math.max(...(ex.sets?.map(s => s.weight) || [0]));
            exerciseMap[ex.exercise_name].push(maxWeight);
          });
        });
        
        let hasStagnation = false;
        Object.values(exerciseMap).forEach(weights => {
          if (weights.length >= 4 && weights.every(w => w === weights[0] && w > 0)) {
            hasStagnation = true;
          }
        });

        if (hasStagnation) {
          reasons.push({ type: 'workout_stagnation', label: 'תקיעות באימונים', severity: 'low' });
        }
      }

      if (reasons.length > 0) {
        alerts.push({ trainee, reasons });
      }
    });

    return alerts.sort((a, b) => {
      const aMax = Math.max(...a.reasons.map(r => r.severity === 'high' ? 3 : r.severity === 'medium' ? 2 : 1));
      const bMax = Math.max(...b.reasons.map(r => r.severity === 'high' ? 3 : r.severity === 'medium' ? 2 : 1));
      return bMax - aMax;
    });
  }, [trainees, allMeals, allWater, allWorkouts, allMeasurements]);

  const severityConfig = {
    high: { color: 'bg-red-100 text-red-700 border-red-300', icon: AlertTriangle },
    medium: { color: 'bg-amber-100 text-amber-700 border-amber-300', icon: TrendingDown },
    low: { color: 'bg-blue-100 text-blue-700 border-blue-300', icon: MessageSquareOff }
  };

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-7 h-7 text-orange-500" />
            מי דורש טיפול היום
          </h1>
          <p className="text-slate-500 mt-1">מתאמנים שצריכים תשומת לב</p>
        </div>

        {alertTrainees.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="text-6xl mb-4">✅</div>
            <p className="text-lg font-medium text-slate-700">הכל נראה טוב!</p>
            <p className="text-sm text-slate-500 mt-2">כל המתאמנים במצב סביר</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {alertTrainees.map(({ trainee, reasons }) => {
              const maxSeverity = reasons.reduce((max, r) => {
                const level = r.severity === 'high' ? 3 : r.severity === 'medium' ? 2 : 1;
                return level > max ? r.severity : max;
              }, 'low');
              const config = severityConfig[maxSeverity];
              const Icon = config.icon;

              return (
                <Link 
                  key={trainee.id}
                  to={createPageUrl('TraineeProfile') + `?email=${trainee.user_email}`}
                >
                  <Card className={`p-4 hover:shadow-lg transition-shadow border-2 ${config.color}`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${config.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-slate-800 mb-2">{trainee.full_name}</p>
                        <div className="space-y-1">
                          {reasons.map((reason, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <Badge className={severityConfig[reason.severity].color}>
                                {reason.label}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-slate-400">לחץ לפרופיל</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}