import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Star, MessageSquare, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { parseCoachRating, encodeCoachRating } from '@/utils/workoutUtils';

export default function WorkoutDetails() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const workoutId = params.get('id');

  const [coachFeedback, setCoachFeedback] = useState('');
  const [coachRating, setCoachRating] = useState(0);

  const { data: workout } = useQuery({
    queryKey: ['workout', workoutId],
    queryFn: async () => {
      const workouts = await base44.entities.WorkoutSession.filter({ id: workoutId });
      const w = workouts[0];
      const { rating, feedback } = parseCoachRating(w?.notes);
      setCoachFeedback(feedback);
      setCoachRating(rating);
      return w;
    },
    enabled: !!workoutId,
  });

  const { data: exerciseLines = [] } = useQuery({
    queryKey: ['exerciseLines', workoutId],
    queryFn: () => base44.entities.WorkoutExerciseLine.filter({ workout_session_id: workoutId }),
    enabled: !!workoutId,
  });

  const { data: allSets = [] } = useQuery({
    queryKey: ['workoutSets', exerciseLines.map(l => l.id)],
    queryFn: async () => {
      const setsPromises = exerciseLines.map(line =>
        base44.entities.WorkoutSet.filter({ exercise_line_id: line.id })
      );
      const results = await Promise.all(setsPromises);
      return results.flat();
    },
    enabled: exerciseLines.length > 0,
  });

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => base44.entities.Exercise.list(),
  });

  const updateWorkout = useMutation({
    mutationFn: async (data) => {
      await base44.entities.WorkoutSession.update(workoutId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout', workoutId] });
      alert('✅ משוב נשמר בהצלחה');
    },
  });

  const handleSaveFeedback = () => {
    updateWorkout.mutate({
      notes: encodeCoachRating(coachRating, coachFeedback),
    });
  };

  const getExerciseName = (line) => {
    if (line.custom_name) return line.custom_name;
    const exercise = exercises.find(e => e.id === line.exercise_id);
    return exercise?.name_he || 'תרגיל לא מזוהה';
  };

  const getSetsForLine = (lineId) => {
    return allSets.filter(s => s.exercise_line_id === lineId).sort((a, b) => a.set_index - b.set_index);
  };

  if (!workout) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">טוען...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-4">
        <Button
          variant="ghost"
          onClick={() => navigate(createPageUrl('CoachWorkouts'))}
          className="mb-4"
        >
          <ChevronLeft className="w-4 h-4 ml-2" />
          חזור
        </Button>

        <Card className="mb-4">
          <CardContent className="p-4">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">
              {workout.title || 'אימון ללא שם'}
            </h1>
            <p className="text-sm text-slate-500">
              {new Date(workout.date).toLocaleDateString('he-IL')}
            </p>
            {workout.duration_minutes && (
              <p className="text-sm text-slate-600 mt-1">משך: {workout.duration_minutes} דקות</p>
            )}
            {workout.rpe && (
              <p className="text-sm text-slate-600">עוצמה: {workout.rpe}/10</p>
            )}
            {workout.notes && (
              <div className="mt-3 p-3 bg-slate-50 rounded">
                <p className="text-sm text-slate-700">{workout.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Exercise Lines */}
        <div className="space-y-3 mb-4">
          {exerciseLines
            .sort((a, b) => a.order_index - b.order_index)
            .map((line, idx) => {
              const sets = getSetsForLine(line.id);
              return (
                <Card key={line.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-800">
                          {idx + 1}. {getExerciseName(line)}
                        </h3>
                        {line.equipment_type && (
                          <p className="text-xs text-slate-500 mt-1">ציוד: {line.equipment_type}</p>
                        )}
                        {line.angle_type && (
                          <p className="text-xs text-slate-500">שיפוע: {line.angle_type}</p>
                        )}
                      </div>
                    </div>

                    {sets.length > 0 ? (
                      <div className="mt-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-right pb-2">סט</th>
                              <th className="text-center pb-2">משקל (ק"ג)</th>
                              <th className="text-center pb-2">חזרות</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sets.map((set) => (
                              <tr key={set.id} className="border-b last:border-0">
                                <td className="py-2">{set.set_index}</td>
                                <td className="text-center">{set.weight}</td>
                                <td className="text-center">{set.reps}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 mt-2">אין סטים רשומים</p>
                    )}

                    {line.notes && (
                      <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-800">
                        💭 {line.notes}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </div>

        {/* Coach Feedback */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              משוב מאמן
            </h3>

            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                דירוג איכות ביצוע
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setCoachRating(star)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-8 h-8 ${star <= coachRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                הערות והמלצות
              </label>
              <Textarea
                value={coachFeedback}
                onChange={(e) => setCoachFeedback(e.target.value)}
                placeholder="כתוב משוב למתאמן..."
                rows={4}
              />
            </div>

            <Button
              onClick={handleSaveFeedback}
              disabled={updateWorkout.isPending}
              className="w-full"
              style={{ backgroundColor: '#79DBD6' }}
            >
              <Save className="w-4 h-4 ml-2" />
              {updateWorkout.isPending ? 'שומר...' : 'שמור משוב'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}