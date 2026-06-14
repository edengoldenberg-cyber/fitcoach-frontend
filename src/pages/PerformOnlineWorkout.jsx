import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, Video, CheckCircle2, Play, Plus, Minus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

export default function PerformOnlineWorkout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const assignmentId = searchParams.get('assignmentId');
  const dayIndex = parseInt(searchParams.get('day') || '1');
  
  const [workoutLogs, setWorkoutLogs] = useState({});

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: assignment } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => base44.entities.OnlineWorkoutAssignment.filter({ id: assignmentId }).then(r => r[0]),
    enabled: !!assignmentId,
  });

  const { data: template } = useQuery({
    queryKey: ['template', assignment?.template_id],
    queryFn: () => base44.entities.OnlineWorkoutTemplate.filter({ id: assignment?.template_id }).then(r => r[0]),
    enabled: !!assignment?.template_id,
  });

  const { data: workoutItems = [] } = useQuery({
    queryKey: ['workoutItems', assignment?.template_id, dayIndex],
    queryFn: () => base44.entities.OnlineWorkoutItem.filter({ 
      template_id: assignment?.template_id,
      day_index: dayIndex
    }),
    enabled: !!assignment?.template_id,
  });

  const sortedItems = [...workoutItems].sort((a, b) => a.order_index - b.order_index);

  const initializeWorkoutLogs = () => {
    const logs = {};
    sortedItems.forEach(item => {
      logs[item.id] = {
        sets: Array(item.target_sets || 3).fill(null).map((_, i) => ({
          set_number: i + 1,
          reps: 0,
          weight: item.target_weight || 0,
          completed: false
        })),
        notes: ''
      };
    });
    setWorkoutLogs(logs);
  };

  React.useEffect(() => {
    if (sortedItems.length > 0 && Object.keys(workoutLogs).length === 0) {
      initializeWorkoutLogs();
    }
  }, [sortedItems]);

  const updateSet = (itemId, setIndex, field, value) => {
    setWorkoutLogs(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        sets: prev[itemId].sets.map((set, i) => 
          i === setIndex ? { ...set, [field]: value } : set
        )
      }
    }));
  };

  const addSet = (itemId) => {
    const currentSets = workoutLogs[itemId]?.sets || [];
    setWorkoutLogs(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        sets: [...currentSets, { 
          set_number: currentSets.length + 1, 
          reps: 0, 
          weight: currentSets[currentSets.length - 1]?.weight || 0, 
          completed: false 
        }]
      }
    }));
  };

  const removeSet = (itemId) => {
    setWorkoutLogs(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        sets: prev[itemId].sets.slice(0, -1)
      }
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      
      for (const item of sortedItems) {
        const log = workoutLogs[item.id];
        if (!log || log.sets.length === 0) continue;

        await base44.entities.OnlineWorkoutLog.create({
          trainee_email: user.email,
          assignment_id: assignmentId,
          template_id: template.id,
          day_index: dayIndex,
          workout_date: today,
          exercise_id: item.exercise_id,
          exercise_name: item.exercise_name,
          item_id: item.id,
          sets: log.sets,
          notes: log.notes,
          completed_at: new Date().toISOString()
        });
      }

      // Update assignment progress
      const completedDays = assignment.completed_days || [];
      if (!completedDays.includes(dayIndex)) {
        await base44.entities.OnlineWorkoutAssignment.update(assignmentId, {
          completed_days: [...completedDays, dayIndex],
          current_day: dayIndex + 1,
          last_activity_date: today
        });
      }
    },
    onSuccess: () => {
      toast.success('האימון נשמר בהצלחה! 💪');
      queryClient.invalidateQueries({ queryKey: ['myOnlineAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['todayOnlineLogs'] });
      navigate(-1);
    },
    onError: (error) => {
      toast.error('שגיאה בשמירת האימון: ' + error.message);
    }
  });

  if (!template || sortedItems.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 pb-20 flex items-center justify-center" dir="rtl">
        <p className="text-slate-600">טוען...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 pb-20" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-purple-900">{template.title}</h1>
            <p className="text-sm text-slate-600">
              {template.type === 'daily_personal' ? 'אימון יומי אישי' : `יום ${dayIndex}`}
            </p>
          </div>
        </div>

        {template.notes && (
          <Card className="p-4 bg-blue-50 border-blue-200 mb-4">
            <p className="text-sm text-blue-900">{template.notes}</p>
          </Card>
        )}

        <div className="space-y-4 mb-6">
          {sortedItems.map((item, idx) => {
            const log = workoutLogs[item.id] || { sets: [], notes: '' };
            
            return (
              <Card key={item.id} className="p-4 bg-white">
                <div className="mb-3">
                  <h3 className="text-lg font-bold text-slate-800">{item.exercise_name}</h3>
                  <p className="text-sm text-slate-600">
                    {item.target_sets} סטים × {item.target_reps_min}-{item.target_reps_max} חזרות
                    {item.target_weight > 0 && ` @ ${item.target_weight}kg`}
                  </p>
                </div>

                {item.video_url && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mb-3 w-full"
                    onClick={() => window.open(item.video_url, '_blank')}
                  >
                    <Video className="w-4 h-4 ml-2" />
                    צפה בסרטון הדרכה
                  </Button>
                )}

                {item.instructions && (
                  <div className="mb-3 p-3 bg-amber-50 rounded-lg">
                    <p className="text-sm text-amber-900">{item.instructions}</p>
                  </div>
                )}

                <div className="space-y-2 mb-3">
                  {log.sets.map((set, setIdx) => (
                    <div key={setIdx} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500 w-12">סט {set.set_number}</span>
                      <Input 
                        type="number"
                        placeholder="משקל"
                        value={set.weight || ''}
                        onChange={(e) => updateSet(item.id, setIdx, 'weight', Number(e.target.value))}
                        className="w-20"
                      />
                      <span className="text-slate-400">×</span>
                      <Input 
                        type="number"
                        placeholder="חזרות"
                        value={set.reps || ''}
                        onChange={(e) => updateSet(item.id, setIdx, 'reps', Number(e.target.value))}
                        className="w-20"
                      />
                      <Button
                        variant={set.completed ? "default" : "outline"}
                        size="sm"
                        onClick={() => updateSet(item.id, setIdx, 'completed', !set.completed)}
                        className={set.completed ? "bg-green-600" : ""}
                      >
                        {set.completed ? <CheckCircle2 className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mb-3">
                  <Button variant="outline" size="sm" onClick={() => addSet(item.id)}>
                    <Plus className="w-3 h-3 ml-1" />
                    סט
                  </Button>
                  {log.sets.length > 1 && (
                    <Button variant="outline" size="sm" onClick={() => removeSet(item.id)}>
                      <Minus className="w-3 h-3 ml-1" />
                      סט
                    </Button>
                  )}
                </div>

                <Textarea 
                  placeholder="הערות על התרגיל..."
                  value={log.notes}
                  onChange={(e) => setWorkoutLogs(prev => ({
                    ...prev,
                    [item.id]: { ...prev[item.id], notes: e.target.value }
                  }))}
                  rows={2}
                  className="text-sm"
                />
              </Card>
            );
          })}
        </div>

        <Button 
          className="w-full bg-purple-600 hover:bg-purple-700 h-12 text-lg"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          <CheckCircle2 className="w-5 h-5 ml-2" />
          {saveMutation.isPending ? 'שומר...' : 'סיים והשלם אימון'}
        </Button>
      </div>
    </div>
  );
}