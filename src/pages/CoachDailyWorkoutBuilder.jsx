import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Copy, Eye } from 'lucide-react';
import { format } from 'date-fns';
import he from 'date-fns/locale/he';

export default function CoachDailyWorkoutBuilder() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [workouts, setWorkouts] = useState([]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: existingGroup, isLoading } = useQuery({
    queryKey: ['dailyWorkoutGroup', selectedDate],
    queryFn: async () => {
      const groups = await base44.entities.DailyWorkoutGroup.filter({
        date: selectedDate,
        coach_email: user?.email
      });
      return groups[0] || null;
    },
    enabled: !!user?.email
  });

  // Load existing group
  React.useEffect(() => {
    if (existingGroup) {
      setGroupTitle(existingGroup.title);
      setGroupDescription(existingGroup.description || '');
      setWorkouts(existingGroup.workouts || []);
    } else {
      setGroupTitle('');
      setGroupDescription('');
      setWorkouts([]);
    }
  }, [existingGroup]);

  // Add new workout option
  const addWorkout = () => {
    const newWorkout = {
      id: `w_${Date.now()}`,
      title: `אימון ${workouts.length + 1}`,
      type: 'mixed',
      level: 'intermediate',
      duration_minutes: 30,
      equipment: [],
      exercises: [],
      notes: '',
      effort_score: 5,
      effort_label: 'בינוני'
    };
    setWorkouts([...workouts, newWorkout]);
  };

  // Remove workout
  const removeWorkout = (index) => {
    setWorkouts(workouts.filter((_, i) => i !== index));
  };

  // Update workout field
  const updateWorkout = (index, field, value) => {
    const updated = [...workouts];
    updated[index][field] = value;
    setWorkouts(updated);
  };

  // Duplicate workout
  const duplicateWorkout = (index) => {
    const original = workouts[index];
    const copy = {
      ...original,
      id: `w_${Date.now()}`,
      title: original.title + ' (עותק)'
    };
    setWorkouts([...workouts, copy]);
  };

  // Calculate effort
  const calculateEffort = async (index) => {
    try {
      const response = await base44.functions.invoke('calculateWorkoutEffortScore', {
        workout: workouts[index]
      });

      if (response.ok) {
        const updated = [...workouts];
        updated[index].effort_score = response.effort_score;
        updated[index].effort_label = response.effort_label;
        setWorkouts(updated);
        toast.success('עומס חושב אוטומטית');
      }
    } catch (err) {
      toast.error('שגיאה בחישוב עומס');
    }
  };

  const saveGroupMutation = useMutation({
    mutationFn: async () => {
      if (!groupTitle) throw new Error('נדרוש כותרת לקבוצה');
      if (workouts.length === 0) throw new Error('נדרוש לפחות אימון אחד');

      if (existingGroup) {
        // Update
        await base44.entities.DailyWorkoutGroup.update(existingGroup.id, {
          title: groupTitle,
          description: groupDescription,
          workouts: workouts
        });
      } else {
        // Create
        await base44.entities.DailyWorkoutGroup.create({
          date: selectedDate,
          coach_email: user.email,
          title: groupTitle,
          description: groupDescription,
          workouts: workouts,
          published: false
        });
      }
    },
    onSuccess: () => {
      toast.success('קבוצת אימון נשמרה');
      queryClient.invalidateQueries({ queryKey: ['dailyWorkoutGroup', selectedDate] });
    },
    onError: (err) => {
      toast.error(err.message || 'שגיאה בשמירה');
    }
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!existingGroup) throw new Error('שמור תחילה');

      await base44.entities.DailyWorkoutGroup.update(existingGroup.id, {
        published: true,
        published_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      toast.success('פורסם למתאמנים!');
      queryClient.invalidateQueries({ queryKey: ['dailyWorkoutGroup', selectedDate] });
    },
    onError: (err) => {
      toast.error(err.message);
    }
  });

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">בניית אימון יומי</h1>

        {/* Date Selection */}
        <Card className="card-premium mb-6">
          <CardHeader>
            <CardTitle>בחר תאריך</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input-premium max-w-xs"
            />
          </CardContent>
        </Card>

        {/* Group Settings */}
        <Card className="card-premium mb-6">
          <CardHeader>
            <CardTitle>הגדרות קבוצה</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="font-semibold mb-2 block">כותרת</Label>
              <Input
                placeholder="תיאור האימון של היום"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                className="input-premium"
              />
            </div>

            <div>
              <Label className="font-semibold mb-2 block">תיאור (אופציונלי)</Label>
              <Textarea
                placeholder="מטרות האימון, טיפים..."
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                className="input-premium h-20"
              />
            </div>
          </CardContent>
        </Card>

        {/* Workout Options */}
        <div className="space-y-4 mb-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">אפשרויות אימון</h2>
            <Button
              className="btn-primary"
              onClick={addWorkout}
              disabled={workouts.length >= 3}
            >
              <Plus className="w-4 h-4 ml-2" />
              הוסף אימון
            </Button>
          </div>

          {workouts.map((workout, idx) => (
            <Card key={workout.id} className="card-premium">
              <CardHeader>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <CardTitle>אימון {idx + 1}</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => duplicateWorkout(idx)}
                      title="שכפל"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeWorkout(idx)}
                      className="text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm mb-1 block">שם</Label>
                    <Input
                      value={workout.title}
                      onChange={(e) => updateWorkout(idx, 'title', e.target.value)}
                      className="input-premium"
                    />
                  </div>

                  <div>
                    <Label className="text-sm mb-1 block">דקות</Label>
                    <Input
                      type="number"
                      value={workout.duration_minutes}
                      onChange={(e) => updateWorkout(idx, 'duration_minutes', parseInt(e.target.value))}
                      className="input-premium"
                    />
                  </div>

                  <div>
                    <Label className="text-sm mb-1 block">סוג</Label>
                    <Select value={workout.type} onValueChange={(v) => updateWorkout(idx, 'type', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="strength">כוח</SelectItem>
                        <SelectItem value="functional">פונקציונלי</SelectItem>
                        <SelectItem value="pilates">פילאטיס</SelectItem>
                        <SelectItem value="cardio">קרדיו</SelectItem>
                        <SelectItem value="mobility">גמישות</SelectItem>
                        <SelectItem value="mixed">משולב</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm mb-1 block">רמה</Label>
                    <Select value={workout.level} onValueChange={(v) => updateWorkout(idx, 'level', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">מתחיל</SelectItem>
                        <SelectItem value="intermediate">בינוני</SelectItem>
                        <SelectItem value="advanced">מתקדם</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-sm mb-1 block">הערות</Label>
                  <Textarea
                    value={workout.notes}
                    onChange={(e) => updateWorkout(idx, 'notes', e.target.value)}
                    placeholder="טיפים, אזהרות, וריאציות..."
                    className="input-premium h-16"
                  />
                </div>

                <div>
                  <Label className="text-sm mb-2 block">עומס משוער: {workout.effort_score}/10</Label>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => calculateEffort(idx)}
                  >
                    חשב עומס אוטומטית
                  </Button>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={workout.effort_score}
                    onChange={(e) => updateWorkout(idx, 'effort_score', parseInt(e.target.value))}
                    className="input-premium mt-2"
                    placeholder="או ערוך ידנית"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button
            className="btn-primary"
            onClick={() => saveGroupMutation.mutate()}
            disabled={saveGroupMutation.isPending}
          >
            <Save className="w-4 h-4 ml-2" />
            שמור
          </Button>

          {existingGroup && !existingGroup.published && (
            <Button
              variant="outline"
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending}
            >
              <Eye className="w-4 h-4 ml-2" />
              פרסם למתאמנים
            </Button>
          )}
        </div>

        {existingGroup?.published && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-center text-sm text-green-700">
            ✅ פורסם למתאמנים
          </div>
        )}
      </div>
    </div>
  );
}