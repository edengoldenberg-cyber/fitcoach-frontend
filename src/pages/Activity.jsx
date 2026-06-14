import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Plus, Flame } from "lucide-react";
import { format } from 'date-fns';

const ACTIVITY_TYPES = {
  walking: { label: 'הליכה', met: 3.5 },
  running: { label: 'ריצה', met: 8 },
  cycling: { label: 'אופניים', met: 6 },
  strength: { label: 'כוח', met: 5 },
  functional: { label: 'פונקציונלי', met: 6 },
  other: { label: 'אחר', met: 4 }
};

const INTENSITY_MULTIPLIER = {
  low: 0.8,
  medium: 1,
  high: 1.3
};

export default function ActivityPage() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    activity_type: 'walking',
    duration_minutes: '',
    intensity: 'medium',
    notes: ''
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0];
    },
    enabled: !!user?.email,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', user?.email],
    queryFn: () => base44.entities.ActivityLog.filter({ trainee_email: user?.email }, '-date'),
    enabled: !!user?.email,
  });

  const { data: measurements = [] } = useQuery({
    queryKey: ['measurements', user?.email],
    queryFn: () => base44.entities.BodyMeasurement.filter({ trainee_email: user?.email }, '-date', 1),
    enabled: !!user?.email,
  });

  const addActivityMutation = useMutation({
    mutationFn: (data) => base44.entities.ActivityLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      setShowForm(false);
      setFormData({ activity_type: 'walking', duration_minutes: '', intensity: 'medium', notes: '' });
    },
  });

  const calculateCalories = () => {
    const weight = measurements[0]?.weight_kg || 70;
    const met = ACTIVITY_TYPES[formData.activity_type].met;
    const intensity = INTENSITY_MULTIPLIER[formData.intensity];
    const duration = parseFloat(formData.duration_minutes) || 0;
    
    return Math.round(met * weight * (duration / 60) * intensity);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const calories = calculateCalories();
    addActivityMutation.mutate({
      trainee_email: user?.email,
      date: format(new Date(), 'yyyy-MM-dd'),
      ...formData,
      duration_minutes: parseFloat(formData.duration_minutes),
      calories_burned: calories
    });
  };

  const todayActivities = activities.filter(a => a.date === format(new Date(), 'yyyy-MM-dd'));
  const todayCalories = todayActivities.reduce((sum, a) => sum + (a.calories_burned || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-7 h-7" style={{ color: '#79DBD6' }} />
              פעילות גופנית
            </h1>
            <p className="text-slate-500">תיעוד פעילות יומית</p>
          </div>
          <Button onClick={() => setShowForm(!showForm)} style={{ backgroundColor: '#79DBD6' }}>
            <Plus className="w-4 h-4 ml-2" />
            הוסף
          </Button>
        </div>

        {/* Today Summary */}
        <Card className="p-4 mb-6" style={{ borderColor: '#79DBD6', borderWidth: 2 }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">קלוריות שרופות היום</p>
              <p className="text-3xl font-bold" style={{ color: '#79DBD6' }}>
                {todayCalories}
              </p>
            </div>
            <Flame className="w-12 h-12 text-orange-400" />
          </div>
          {todayActivities.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-slate-500">{todayActivities.length} פעילויות היום</p>
            </div>
          )}
        </Card>

        {/* Form */}
        {showForm && (
          <Card className="p-6 mb-6 bg-white shadow-lg">
            <h3 className="font-bold text-slate-800 mb-4">הוסף פעילות</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>סוג פעילות</Label>
                <Select value={formData.activity_type} onValueChange={(v) => setFormData({...formData, activity_type: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTIVITY_TYPES).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>משך זמן (דקות)</Label>
                <Input
                  type="number"
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData({...formData, duration_minutes: e.target.value})}
                  placeholder="30"
                  required
                />
              </div>

              <div>
                <Label>עצימות</Label>
                <Select value={formData.intensity} onValueChange={(v) => setFormData({...formData, intensity: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">נמוכה</SelectItem>
                    <SelectItem value="medium">בינונית</SelectItem>
                    <SelectItem value="high">גבוהה</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="p-3 bg-orange-50 rounded-lg">
                <p className="text-sm text-slate-700">
                  קלוריות משוערות: <span className="font-bold text-orange-600">{calculateCalories()}</span>
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">
                  ביטול
                </Button>
                <Button type="submit" className="flex-1" style={{ backgroundColor: '#79DBD6' }}>
                  שמור
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Activities List */}
        <div className="space-y-3">
          {activities.map(activity => (
            <Card key={activity.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-slate-800">{ACTIVITY_TYPES[activity.activity_type]?.label}</p>
                  <p className="text-sm text-slate-600">{activity.duration_minutes} דקות</p>
                  <p className="text-xs text-slate-400">{format(new Date(activity.date), 'dd/MM/yyyy')}</p>
                </div>
                <div className="text-left">
                  <p className="text-xl font-bold text-orange-600">{activity.calories_burned}</p>
                  <p className="text-xs text-slate-500">קלוריות</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}