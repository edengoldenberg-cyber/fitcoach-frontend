import React, { useState } from 'react';
import { parseCoachRating } from '@/utils/workoutUtils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dumbbell, Search, ChevronLeft, Calendar, TrendingUp } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

export default function CoachWorkouts() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTrainee, setSelectedTrainee] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: workouts = [] } = useQuery({
    queryKey: ['traineeWorkouts', selectedTrainee?.user_email],
    queryFn: () => base44.entities.WorkoutSession.filter({ 
      trainee_email: selectedTrainee?.user_email 
    }),
    enabled: !!selectedTrainee,
  });

  const { data: exerciseLines = [] } = useQuery({
    queryKey: ['exerciseLines', workouts.map(w => w.id)],
    queryFn: async () => {
      const allLines = await Promise.all(
        workouts.map(w => base44.entities.WorkoutExerciseLine.filter({ workout_session_id: w.id }))
      );
      return allLines.flat();
    },
    enabled: workouts.length > 0,
  });

  const filteredTrainees = trainees.filter(t =>
    t.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getWorkoutStats = (workoutId) => {
    const lines = exerciseLines.filter(l => l.workout_session_id === workoutId);
    return { exercises: lines.length };
  };

  if (selectedTrainee) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
        <div className="max-w-4xl mx-auto p-4">
          <Button
            variant="ghost"
            onClick={() => setSelectedTrainee(null)}
            className="mb-4"
          >
            <ChevronLeft className="w-4 h-4 ml-2" />
            חזור לרשימת מתאמנים
          </Button>

          <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
            <h2 className="text-xl font-bold text-slate-800">
              {selectedTrainee.full_name}
            </h2>
            <p className="text-sm text-slate-500">{selectedTrainee.user_email}</p>
          </div>

          <div className="grid gap-3">
            {workouts.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-slate-500">אין אימונים רשומים</p>
              </Card>
            ) : (
              workouts
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map((workout) => {
                  const stats = getWorkoutStats(workout.id);
                  return (
                    <Link
                      key={workout.id}
                      to={`${createPageUrl('WorkoutDetails')}?id=${workout.id}`}
                    >
                      <Card className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h3 className="font-bold text-slate-800">
                                {workout.title || 'אימון ללא שם'}
                              </h3>
                              <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                                <Calendar className="w-4 h-4" />
                                {new Date(workout.date).toLocaleDateString('he-IL')}
                              </div>
                            </div>
                            <div className="text-left">
                              <div className="text-2xl font-bold text-teal-600">
                                {stats.exercises}
                              </div>
                              <div className="text-xs text-slate-500">תרגילים</div>
                            </div>
                          </div>

                          {workout.rpe && (
                            <div className="flex items-center gap-2 text-sm text-slate-600 mt-2">
                              <TrendingUp className="w-4 h-4" />
                              <span>עוצמה: {workout.rpe}/10</span>
                            </div>
                          )}

                          {parseCoachRating(workout.notes).feedback && (
                            <div className="mt-2 p-2 bg-amber-50 rounded text-sm text-amber-800">
                              💬 {parseCoachRating(workout.notes).feedback}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">אימונים מתאמנים</h1>
          <p className="text-slate-600">צפייה מפורטת באימונים של כל מתאמן</p>
        </div>

        <div className="relative mb-4">
          <Search className="absolute right-3 top-3 w-5 h-5 text-slate-400" />
          <Input
            type="text"
            placeholder="חפש מתאמן..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>

        <div className="grid gap-3">
          {filteredTrainees.map((trainee) => (
            <Card
              key={trainee.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedTrainee(trainee)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#79DBD6' }}>
                    <Dumbbell className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800">{trainee.full_name}</h3>
                    <p className="text-sm text-slate-500">{trainee.user_email}</p>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-slate-400" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}