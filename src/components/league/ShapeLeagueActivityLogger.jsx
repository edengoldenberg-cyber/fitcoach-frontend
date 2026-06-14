import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, X } from 'lucide-react';

const ACTIVITIES = [
  // Studio / app workouts
  { emoji: '🏋️', name_he: 'כוח', base_points: 30, type: 'studio', requires_duration: true },
  
  // External activities with duration/distance rules
  { emoji: '🧘', name_he: 'פילאטיס', base_points: 25, type: 'external', requires_duration: true },
  { emoji: '🏃', name_he: 'ריצה', base_points: 25, type: 'external', requires_duration: true, variant_rules: { 'running': true } },
  { emoji: '🚶', name_he: 'הליכה', base_points: 15, type: 'external', requires_duration: true, variant_rules: { 'walking': true } },
  { emoji: '🎾', name_he: 'טניס', base_points: 20, type: 'external', requires_duration: true },
  { emoji: '🚴', name_he: 'אופניים', base_points: 25, type: 'external', requires_duration: true },
  { emoji: '🏊', name_he: 'שחייה', base_points: 25, type: 'external', requires_duration: true },
  { emoji: '🥊', name_he: 'פונקציונלי', base_points: 30, type: 'external', requires_duration: true },
  { emoji: '🕺', name_he: 'ריקוד', base_points: 20, type: 'external', requires_duration: true },
  { emoji: '⚽', name_he: 'ספורט קבוצתי', base_points: 20, type: 'external', requires_duration: true },
  { emoji: '🥾', name_he: 'טיול', base_points: 20, type: 'external', requires_duration: true },
  { emoji: '🧎', name_he: 'מתיחות/mobility', base_points: 10, type: 'external', requires_duration: true },
];

export default function ShapeLeagueActivityLogger({ trainee, onActivityLogged }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [duration, setDuration] = useState(30);
  const [distance, setDistance] = useState(null);
  const [intensity, setIntensity] = useState('medium');
  const [error, setError] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const logActivityMutation = useMutation({
    mutationFn: async (data) => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
      const activity = ACTIVITIES.find(a => a.name_he === data.activity);
      
      // ANTI-ABUSE: Validate duration/distance
      if (activity.requires_duration && (!duration || duration < 5)) {
        throw new Error('משך הפעילות חייב להיות לפחות 5 דקות');
      }
      if (activity.variant_rules?.running && !duration && !distance) {
        throw new Error('ריצה דורשת משך או מרחק');
      }
      if (activity.variant_rules?.walking && !duration) {
        throw new Error('הליכה דורשת משך בדקות');
      }

      // Calculate points based on rules
      let points = 0;
      
      if (activity.name_he === 'ריצה') {
        if (distance && distance >= 5) {
          points = 30;
        } else if (duration >= 25) {
          points = 30;
        } else if (duration >= 15) {
          points = 20;
        }
      } else if (activity.name_he === 'הליכה') {
        if (duration >= 40) {
          points = 20;
        } else if (duration >= 20) {
          points = 10;
        }
      } else {
        // Default: use base_points
        points = activity.base_points;
      }

      // אימון/פעילות נספרים יחד עד 30 נקודות ביום
      const todayLogs = await base44.entities.ShapeLeagueActivityLog.filter({
        trainee_id: trainee?.id,
        activity_date: today
      });
      const [todayWorkoutSessions, todayTraineeWorkouts, todayPointRecords] = await Promise.all([
        base44.entities.WorkoutSession.filter({
          trainee_email: trainee?.user_email || user?.email,
          date: today
        }).catch(() => []),
        base44.entities.TraineeWorkout.filter({
          trainee_email: trainee?.user_email || user?.email,
          date: today
        }).catch(() => []),
        base44.entities.UserPointsDaily.filter({
          trainee_id: trainee?.id,
          date: today
        }).catch(() => []),
      ]);
      const hasWorkoutAlready = todayWorkoutSessions.some(workout => workout.status !== 'draft') ||
        todayTraineeWorkouts.some(workout => workout.status !== 'draft');
      const currentDailyWorkoutPoints = Math.max(...todayPointRecords.map(record => record.workout_points || 0), 0);
      const todayActivityTotal = todayLogs.reduce((sum, log) => sum + (log.points_awarded || 0), 0);
      const alreadyCounted = Math.max(hasWorkoutAlready ? 30 : 0, currentDailyWorkoutPoints, todayActivityTotal);
      const availableWorkoutPoints = Math.max(0, 30 - alreadyCounted);
      points = Math.min(points, availableWorkoutPoints);
      if (points <= 0) {
        throw new Error('כבר הגעת למקסימום 30 נקודות אימון/פעילות להיום');
      }

      // ANTI-ABUSE: Check duplicate within 2 hours
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const recentSame = todayLogs.filter(
        log => log.activity_type === data.activity && 
               (log.logged_at || '') >= twoHoursAgo.toISOString()
      );
      if (recentSame.length > 0) {
        throw new Error('אתה כבר רשמת פעילות זו ב-2 השעות האחרונות');
      }

      // Create activity log
      await base44.entities.ShapeLeagueActivityLog.create({
        trainee_id: trainee?.id,
        trainee_email: trainee?.user_email || user?.email,
        activity_type: data.activity,
        duration_minutes: duration,
        distance_km: distance,
        intensity,
        points_awarded: Math.round(points),
        activity_date: today,
        logged_at: new Date().toISOString(),
      });

      await base44.functions.invoke('pointsEngine', {
        action: 'sync_daily',
        trainee_id: trainee?.id,
        trainee_email: trainee?.user_email || user?.email,
        date: today,
      }).catch(() => null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userActivities', trainee?.id] });
      queryClient.invalidateQueries({ queryKey: ['pointsToday'] });
      queryClient.invalidateQueries({ queryKey: ['pointsWeek'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyRanking'] });
      setShowForm(false);
      setSelectedActivity(null);
      setDuration(30);
      setDistance(null);
      setError(null);
      if (onActivityLogged) onActivityLogged();
    },
    onError: (err) => {
      setError(err.message);
    }
  });

  const handleSubmit = () => {
    if (selectedActivity) {
      logActivityMutation.mutate({ activity: selectedActivity });
    }
  };

  return (
    <div className="mb-4">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white rounded-2xl p-4 flex items-center justify-center gap-2 font-semibold transition-all"
        >
          <Plus className="w-5 h-5" />
          הוסף פעילות
        </button>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">בחר פעילות</h3>
            <button
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Activity Grid */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {ACTIVITIES.map(act => (
              <button
                key={act.name_he}
                onClick={() => setSelectedActivity(act.name_he)}
                className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all ${
                  selectedActivity === act.name_he
                    ? 'bg-teal-500/30 border-2 border-teal-400'
                    : 'bg-slate-700/50 border border-slate-600 hover:bg-slate-700'
                }`}
              >
                <span className="text-2xl mb-1">{act.emoji}</span>
                <span className="text-xs text-slate-300 text-center">{act.name_he}</span>
              </button>
            ))}
          </div>

          {selectedActivity && (
            <>
              {/* Duration */}
              <div className="mb-4">
                <label className="text-slate-300 text-sm mb-2 block">משך: {duration} דקות</label>
                <input
                  type="range"
                  min="5"
                  max="180"
                  step="5"
                  value={duration}
                  onChange={(e) => { setDuration(Number(e.target.value)); setError(null); }}
                  className="w-full"
                />
              </div>

              {/* Distance (for running/cycling) */}
              {['ריצה', 'אופניים'].includes(selectedActivity) && (
                <div className="mb-4">
                  <label className="text-slate-300 text-sm mb-2 block">מרחק (קמ) - אופציונלי</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="לדוגמה: 5 קמ"
                    value={distance || ''}
                    onChange={(e) => { setDistance(e.target.value ? Number(e.target.value) : null); setError(null); }}
                    className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                  />
                </div>
              )}

              {/* Intensity */}
              <div className="mb-4">
                <label className="text-slate-300 text-sm mb-2 block">עוצמה</label>
                <div className="flex gap-2">
                  {['low', 'medium', 'high'].map(level => (
                    <button
                      key={level}
                      onClick={() => setIntensity(level)}
                      className={`flex-1 py-2 rounded-lg text-sm transition-all ${
                        intensity === level
                          ? 'bg-teal-500 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {level === 'low' && 'קל'}
                      {level === 'medium' && 'בינוני'}
                      {level === 'high' && 'קשה'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 bg-red-500/20 border border-red-500/40 rounded-lg p-3">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={logActivityMutation.isPending}
                className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-all"
              >
                {logActivityMutation.isPending ? 'שמירה...' : 'שמור פעילות'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}