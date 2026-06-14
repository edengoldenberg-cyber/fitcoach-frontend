import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dumbbell, Calendar, Play, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function TraineeOnlineWorkouts() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0] || null;
    },
    enabled: !!user?.email,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['myOnlineAssignments', trainee?.user_email],
    queryFn: () => base44.entities.OnlineWorkoutAssignment.filter({ 
      trainee_email: trainee?.user_email,
      status: 'active'
    }),
    enabled: !!trainee?.user_email,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['myOnlineTemplates', assignments],
    queryFn: async () => {
      const templateIds = assignments.map(a => a.template_id);
      if (templateIds.length === 0) return [];
      const allTemplates = await base44.entities.OnlineWorkoutTemplate.list();
      return allTemplates.filter(t => templateIds.includes(t.id));
    },
    enabled: assignments.length > 0,
  });

  const { data: todayLogs = [] } = useQuery({
    queryKey: ['todayOnlineLogs', trainee?.user_email],
    queryFn: () => base44.entities.OnlineWorkoutLog.filter({ 
      trainee_email: trainee?.user_email,
      workout_date: new Date().toISOString().split('T')[0]
    }),
    enabled: !!trainee?.user_email,
  });

  const todayWorkouts = assignments.filter(a => {
    const template = templates.find(t => t.id === a.template_id);
    return template?.type === 'daily_personal' || 
           (template?.type === 'program' && a.current_day <= (template.duration_weeks * template.days_per_week));
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 pb-20" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-purple-900 flex items-center gap-2">
            <Dumbbell className="w-7 h-7 text-purple-600" />
            אימונים אונליין
          </h1>
          <p className="text-slate-600 text-sm mt-1">התכניות האישיות שלך</p>
        </div>

        {/* Today's Workouts */}
        {todayWorkouts.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-800 mb-3">אימון היום</h2>
            {todayWorkouts.map(assignment => {
              const template = templates.find(t => t.id === assignment.template_id);
              if (!template) return null;

              const isCompleted = todayLogs.some(log => log.template_id === template.id);

              return (
                <Link 
                  key={assignment.id}
                  to={createPageUrl(`PerformOnlineWorkout?assignmentId=${assignment.id}&day=${assignment.current_day}`)}
                >
                  <Card className="p-4 bg-white border-2 border-purple-300 hover:border-purple-400 transition-colors mb-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-800">{template.title}</h3>
                        <p className="text-sm text-slate-600">
                          {template.type === 'daily_personal' ? 'אימון יומי אישי' : `יום ${assignment.current_day} מתוך ${template.duration_weeks * template.days_per_week}`}
                        </p>
                        {template.notes && (
                          <p className="text-xs text-slate-500 mt-1">{template.notes}</p>
                        )}
                      </div>
                      {isCompleted ? (
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                      ) : (
                        <Play className="w-6 h-6 text-purple-600" />
                      )}
                    </div>
                    <Button className="w-full mt-3 bg-purple-600 hover:bg-purple-700">
                      {isCompleted ? 'צפה באימון' : 'התחל אימון'}
                    </Button>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {/* Active Programs */}
        {templates.filter(t => t.type === 'program').length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-800 mb-3">התכניות שלי</h2>
            <div className="space-y-3">
              {templates.filter(t => t.type === 'program').map(template => {
                const assignment = assignments.find(a => a.template_id === template.id);
                const progress = assignment ? 
                  Math.round((assignment.completed_days?.length || 0) / (template.duration_weeks * template.days_per_week) * 100) : 0;

                return (
                  <Card key={template.id} className="p-4 bg-white">
                    <h3 className="font-bold text-slate-800 mb-1">{template.title}</h3>
                    <p className="text-sm text-slate-600 mb-3">
                      {template.duration_weeks} שבועות • {template.days_per_week} ימי אימון בשבוע
                    </p>
                    <div className="w-full bg-slate-200 rounded-full h-2 mb-2">
                      <div 
                        className="bg-purple-600 h-2 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">{progress}% הושלמו</p>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {assignments.length === 0 && (
          <Card className="p-8 text-center bg-white">
            <Dumbbell className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="font-bold text-slate-800 mb-2">עדיין אין אימונים אונליין</h3>
            <p className="text-sm text-slate-600">המאמן שלך טרם שלח לך תכניות אימון אישיות</p>
          </Card>
        )}
      </div>
    </div>
  );
}