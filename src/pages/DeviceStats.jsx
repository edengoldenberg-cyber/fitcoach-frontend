import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Watch, Plus, TrendingUp } from "lucide-react";
import { format } from 'date-fns';

const DEVICE_SOURCES = [
  { value: 'apple_health', label: 'Apple Health' },
  { value: 'google_fit', label: 'Google Fit' },
  { value: 'garmin', label: 'Garmin' },
  { value: 'fitbit', label: 'Fitbit' },
  { value: 'other', label: 'אחר' }
];

export default function DeviceStatsPage() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    steps: '',
    distance_km: '',
    active_minutes: '',
    device_calories_burned: '',
    device_source: 'apple_health'
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

  const { data: stats = [] } = useQuery({
    queryKey: ['deviceStats', user?.email],
    queryFn: () => base44.entities.DeviceDailyStats.filter({ trainee_email: user?.email }, '-date'),
    enabled: !!user?.email,
  });

  const addStatMutation = useMutation({
    mutationFn: (data) => base44.entities.DeviceDailyStats.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviceStats'] });
      setShowForm(false);
      setFormData({ steps: '', distance_km: '', active_minutes: '', device_calories_burned: '', device_source: 'apple_health' });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    addStatMutation.mutate({
      trainee_email: user?.email,
      date: format(new Date(), 'yyyy-MM-dd'),
      steps: parseInt(formData.steps),
      distance_km: formData.distance_km ? parseFloat(formData.distance_km) : null,
      active_minutes: formData.active_minutes ? parseInt(formData.active_minutes) : null,
      device_calories_burned: formData.device_calories_burned ? parseInt(formData.device_calories_burned) : null,
      device_source: formData.device_source
    });
  };

  const todayStats = stats.find(s => s.date === format(new Date(), 'yyyy-MM-dd'));
  const stepsGoal = 10000;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Watch className="w-7 h-7" style={{ color: '#79DBD6' }} />
              שעון / צעדים
            </h1>
            <p className="text-slate-500">נתונים מהמכשיר החכם</p>
          </div>
          <Button onClick={() => setShowForm(!showForm)} style={{ backgroundColor: '#79DBD6' }}>
            <Plus className="w-4 h-4 ml-2" />
            הוסף
          </Button>
        </div>

        {/* Today Summary */}
        {todayStats ? (
          <Card className="p-6 mb-6" style={{ borderColor: '#79DBD6', borderWidth: 2 }}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-600">צעדים</p>
                <p className="text-3xl font-bold" style={{ color: '#79DBD6' }}>
                  {todayStats.steps?.toLocaleString()}
                </p>
                <p className="text-xs text-slate-400">מתוך {stepsGoal.toLocaleString()}</p>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                  <div 
                    className="h-2 rounded-full" 
                    style={{ 
                      width: `${Math.min((todayStats.steps / stepsGoal) * 100, 100)}%`,
                      backgroundColor: '#79DBD6'
                    }}
                  />
                </div>
              </div>
              
              {todayStats.device_calories_burned && (
                <div>
                  <p className="text-sm text-slate-600">קלוריות</p>
                  <p className="text-3xl font-bold text-orange-600">
                    {todayStats.device_calories_burned}
                  </p>
                  <p className="text-xs text-slate-400">מהשעון</p>
                </div>
              )}
            </div>

            {(todayStats.distance_km || todayStats.active_minutes) && (
              <div className="flex gap-4 mt-4 pt-4 border-t text-sm">
                {todayStats.distance_km && (
                  <div>
                    <span className="text-slate-500">מרחק: </span>
                    <span className="font-bold">{todayStats.distance_km} ק״מ</span>
                  </div>
                )}
                {todayStats.active_minutes && (
                  <div>
                    <span className="text-slate-500">דקות: </span>
                    <span className="font-bold">{todayStats.active_minutes}</span>
                  </div>
                )}
              </div>
            )}
          </Card>
        ) : (
          <Card className="p-8 mb-6 text-center bg-slate-50">
            <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">עדיין לא הוזנו נתונים להיום</p>
          </Card>
        )}

        {/* Form */}
        {showForm && (
          <Card className="p-6 mb-6 bg-white shadow-lg">
            <h3 className="font-bold text-slate-800 mb-4">הוסף נתוני שעון</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>צעדים (חובה)</Label>
                <Input
                  type="number"
                  value={formData.steps}
                  onChange={(e) => setFormData({...formData, steps: e.target.value})}
                  placeholder="10000"
                  required
                />
              </div>

              <div>
                <Label>מרחק בק״מ (אופציונלי)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.distance_km}
                  onChange={(e) => setFormData({...formData, distance_km: e.target.value})}
                  placeholder="7.5"
                />
              </div>

              <div>
                <Label>דקות פעילות (אופציונלי)</Label>
                <Input
                  type="number"
                  value={formData.active_minutes}
                  onChange={(e) => setFormData({...formData, active_minutes: e.target.value})}
                  placeholder="45"
                />
              </div>

              <div>
                <Label>קלוריות מהשעון (אופציונלי)</Label>
                <Input
                  type="number"
                  value={formData.device_calories_burned}
                  onChange={(e) => setFormData({...formData, device_calories_burned: e.target.value})}
                  placeholder="350"
                />
              </div>

              <div>
                <Label>מקור</Label>
                <Select value={formData.device_source} onValueChange={(v) => setFormData({...formData, device_source: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEVICE_SOURCES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

        {/* Stats List */}
        <div className="space-y-3">
          {stats.slice(0, 10).map(stat => (
            <Card key={stat.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-slate-800">{format(new Date(stat.date), 'dd/MM/yyyy')}</p>
                <p className="text-xs text-slate-500">{DEVICE_SOURCES.find(s => s.value === stat.device_source)?.label}</p>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div>
                  <p className="font-bold" style={{ color: '#79DBD6' }}>{stat.steps?.toLocaleString()}</p>
                  <p className="text-xs text-slate-500">צעדים</p>
                </div>
                {stat.distance_km && (
                  <div>
                    <p className="font-bold text-slate-700">{stat.distance_km}</p>
                    <p className="text-xs text-slate-500">ק״מ</p>
                  </div>
                )}
                {stat.active_minutes && (
                  <div>
                    <p className="font-bold text-slate-700">{stat.active_minutes}</p>
                    <p className="text-xs text-slate-500">דקות</p>
                  </div>
                )}
                {stat.device_calories_burned && (
                  <div>
                    <p className="font-bold text-orange-600">{stat.device_calories_burned}</p>
                    <p className="text-xs text-slate-500">קלוריות</p>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}