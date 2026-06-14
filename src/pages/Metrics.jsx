import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Scale, TrendingDown, TrendingUp, Calendar, Edit2, Plus } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { format, subDays } from 'date-fns';
import AIMetricsInsight from '../components/metrics/AIMetricsInsight';
import RouteGuard from '../components/shared/RouteGuard';
import { buildCanonicalTraineeFields, getIsraelDateString, invalidateCoachTraineeSyncQueries, logSyncEvent, metricRecordMatchesTrainee } from '@/utils/nutritionSync';

export default function Metrics() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formData, setFormData] = useState({
    date: getIsraelDateString(),
    weight_kg: '',
    body_fat_percent: '',
    water_percent: '',
    muscle_mass_kg: '',
    body_age_years: '',
    notes: '',
  });

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      if (user?.id) {
        const byId = await base44.entities.Trainee.filter({ user_id: user.id });
        if (byId[0]) return [byId[0]];
      }
      return base44.entities.Trainee.filter({ user_email: user?.email });
    },
    enabled: !!user?.email,
    select: (data) => data[0],
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['metricsEntries', user?.email, trainee?.id],
    queryFn: async () => {
      const records = await base44.entities.MetricsEntry.list('-date', 1000);
      return records.filter(record => metricRecordMatchesTrainee(record, trainee || { user_email: user?.email, user_id: user?.id }));
    },
    enabled: !!user?.email,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      // Check if entry exists for this date
      const existing = entries.find(e => e.date === data.date);
      if (existing) {
        return await base44.entities.MetricsEntry.update(existing.id, { ...data, ...buildCanonicalTraineeFields(trainee, user) });
      } else {
        return await base44.entities.MetricsEntry.create({
          ...data,
          ...buildCanonicalTraineeFields(trainee, user),
          source: 'manual'
        });
      }
    },
    onSuccess: () => {
      invalidateCoachTraineeSyncQueries(queryClient);
      logSyncEvent({ entity: 'MetricsEntry', trainee_id: trainee?.id, coach_id: trainee?.coach_email, source: 'trainee_metrics', write_success: true, refresh_success: true, visible_to_coach: true, visible_to_trainee: true });
      setShowAddDialog(false);
      setEditingEntry(null);
      resetForm();
    },
  });

  const resetForm = () => {
    setFormData({
      date: getIsraelDateString(),
      weight_kg: '',
      body_fat_percent: '',
      water_percent: '',
      muscle_mass_kg: '',
      body_age_years: '',
      notes: '',
    });
  };

  const handleEdit = (entry) => {
    setEditingEntry(entry);
    setFormData({
      date: entry.date,
      weight_kg: entry.weight_kg || '',
      body_fat_percent: entry.body_fat_percent || '',
      water_percent: entry.water_percent || '',
      muscle_mass_kg: entry.muscle_mass_kg || '',
      body_age_years: entry.body_age_years || '',
      notes: entry.notes || '',
    });
    setShowAddDialog(true);
  };

  // Sort entries by date
  React.useEffect(() => {
    const refresh = () => invalidateCoachTraineeSyncQueries(queryClient);
    const unsubMetrics = base44.entities.MetricsEntry.subscribe(refresh);
    const unsubTrainee = base44.entities.Trainee.subscribe(refresh);
    return () => { unsubMetrics(); unsubTrainee(); };
  }, [queryClient]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [entries]);

  // Calculate trends
  const getTrend = (metric) => {
    const recentEntries = sortedEntries
      .filter(e => e[metric])
      .slice(0, 14);
    
    if (recentEntries.length < 2) return null;
    
    const newest = recentEntries[0][metric];
    const oldest = recentEntries[recentEntries.length - 1][metric];
    const change = newest - oldest;
    
    return {
      value: change,
      percentage: ((change / oldest) * 100).toFixed(1),
      isPositive: change < 0, // For weight/fat, negative is good
    };
  };

  // Prepare chart data
  const getChartData = (metric, days = 30) => {
    return sortedEntries
      .filter(e => e[metric])
      .slice(0, days)
      .reverse()
      .map(e => ({
        date: format(new Date(e.date), 'd/M'),
        value: e[metric],
      }));
  };

  const weightData = getChartData('weight_kg');
  const fatData = getChartData('body_fat_percent');
  const waterData = getChartData('water_percent');
  const muscleData = getChartData('muscle_mass_kg');
  const ageData = getChartData('body_age_years');

  const weightTrend = getTrend('weight_kg');
  const fatTrend = getTrend('body_fat_percent');

  const todayEntry = entries.find(e => e.date === getIsraelDateString());

  return (
    <RouteGuard moduleName="metrics" trainee={trainee}>
      <div className="min-h-screen bg-white pb-24" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">מדדי גוף</h1>
          <Button
            onClick={() => {
              resetForm();
              setEditingEntry(null);
              setShowAddDialog(true);
            }}
            style={{ backgroundColor: '#79DBD6', color: 'white' }}
          >
            <Plus className="w-4 h-4 ml-2" />
            הוסף מדידה
          </Button>
        </div>

        {todayEntry && (
          <Card className="p-4 mb-4 bg-emerald-50 border-emerald-200">
            <p className="text-sm font-medium text-emerald-800 mb-2">✓ עדכנת היום</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {todayEntry.weight_kg && (
                <div>
                  <p className="text-lg font-bold text-emerald-700">{todayEntry.weight_kg}</p>
                  <p className="text-xs text-emerald-600">משקל (ק"ג)</p>
                </div>
              )}
              {todayEntry.body_fat_percent && (
                <div>
                  <p className="text-lg font-bold text-emerald-700">{todayEntry.body_fat_percent}%</p>
                  <p className="text-xs text-emerald-600">שומן</p>
                </div>
              )}
              {todayEntry.muscle_mass_kg && (
                <div>
                  <p className="text-lg font-bold text-emerald-700">{todayEntry.muscle_mass_kg}</p>
                  <p className="text-xs text-emerald-600">שריר (ק"ג)</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* AI Insights */}
        {entries.length > 0 && (
          <div className="mb-6">
            <AIMetricsInsight 
              traineeEmail={user?.email} 
              entries={entries}
              isCoach={false}
            />
          </div>
        )}

        {/* Trends */}
        {(weightTrend || fatTrend) && (
          <Card className="p-4 mb-6">
            <h3 className="font-medium text-slate-700 mb-3">מגמות (14 ימים)</h3>
            <div className="grid grid-cols-2 gap-4">
              {weightTrend && (
                <div className="flex items-center gap-2">
                  {weightTrend.isPositive ? (
                    <TrendingDown className="w-5 h-5 text-green-500" />
                  ) : (
                    <TrendingUp className="w-5 h-5 text-red-500" />
                  )}
                  <div>
                    <p className="text-sm text-slate-600">משקל</p>
                    <p className={`font-bold ${weightTrend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {weightTrend.value > 0 ? '+' : ''}{weightTrend.value.toFixed(1)}ק"ג
                    </p>
                  </div>
                </div>
              )}
              {fatTrend && (
                <div className="flex items-center gap-2">
                  {fatTrend.isPositive ? (
                    <TrendingDown className="w-5 h-5 text-green-500" />
                  ) : (
                    <TrendingUp className="w-5 h-5 text-red-500" />
                  )}
                  <div>
                    <p className="text-sm text-slate-600">אחוז שומן</p>
                    <p className={`font-bold ${fatTrend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {fatTrend.value > 0 ? '+' : ''}{fatTrend.value.toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Charts */}
        <div className="space-y-4 mb-6">
          {weightData.length >= 2 && (
            <Card className="p-4">
              <h3 className="font-medium text-slate-700 mb-3">משקל לאורך זמן</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weightData}>
                    <XAxis dataKey="date" fontSize={10} />
                    <YAxis fontSize={10} domain={['auto', 'auto']} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {fatData.length >= 2 && (
            <Card className="p-4">
              <h3 className="font-medium text-slate-700 mb-3">אחוז שומן לאורך זמן</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fatData}>
                    <XAxis dataKey="date" fontSize={10} />
                    <YAxis fontSize={10} domain={['auto', 'auto']} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {waterData.length >= 2 && (
            <Card className="p-4">
              <h3 className="font-medium text-slate-700 mb-3">אחוז מים לאורך זמן</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={waterData}>
                    <XAxis dataKey="date" fontSize={10} />
                    <YAxis fontSize={10} domain={['auto', 'auto']} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {muscleData.length >= 2 && (
            <Card className="p-4">
              <h3 className="font-medium text-slate-700 mb-3">מסת שריר לאורך זמן</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={muscleData}>
                    <XAxis dataKey="date" fontSize={10} />
                    <YAxis fontSize={10} domain={['auto', 'auto']} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {ageData.length >= 2 && (
            <Card className="p-4">
              <h3 className="font-medium text-slate-700 mb-3">גיל גוף לאורך זמן</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ageData}>
                    <XAxis dataKey="date" fontSize={10} />
                    <YAxis fontSize={10} domain={['auto', 'auto']} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>

        {/* History */}
        <Card className="p-4">
          <h3 className="font-medium text-slate-700 mb-3">היסטוריית מדידות</h3>
          {sortedEntries.length === 0 ? (
            <p className="text-center py-8 text-slate-400">אין מדידות עדיין</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {sortedEntries.map(entry => (
                <div key={entry.id} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="font-medium text-slate-700">
                        {format(new Date(entry.date), 'd/M/yyyy')}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(entry)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {entry.weight_kg && (
                      <span className="text-slate-600">משקל: {entry.weight_kg} ק"ג</span>
                    )}
                    {entry.body_fat_percent && (
                      <span className="text-slate-600">שומן: {entry.body_fat_percent}%</span>
                    )}
                    {entry.water_percent && (
                      <span className="text-slate-600">מים: {entry.water_percent}%</span>
                    )}
                    {entry.muscle_mass_kg && (
                      <span className="text-slate-600">שריר: {entry.muscle_mass_kg} ק"ג</span>
                    )}
                    {entry.body_age_years && (
                      <span className="text-slate-600">גיל גוף: {entry.body_age_years}</span>
                    )}
                  </div>
                  {entry.notes && (
                    <p className="text-xs text-slate-500 mt-2 italic">{entry.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'עריכת מדידה' : 'הוספת מדידה'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>תאריך</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>משקל (ק"ג)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.weight_kg}
                  onChange={(e) => setFormData({...formData, weight_kg: e.target.value})}
                  placeholder="70.5"
                />
              </div>
              <div>
                <Label>אחוז שומן (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.body_fat_percent}
                  onChange={(e) => setFormData({...formData, body_fat_percent: e.target.value})}
                  placeholder="20.0"
                />
              </div>
              <div>
                <Label>אחוז מים (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.water_percent}
                  onChange={(e) => setFormData({...formData, water_percent: e.target.value})}
                  placeholder="60.0"
                />
              </div>
              <div>
                <Label>מסת שריר (ק"ג)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.muscle_mass_kg}
                  onChange={(e) => setFormData({...formData, muscle_mass_kg: e.target.value})}
                  placeholder="30.0"
                />
              </div>
              <div>
                <Label>גיל גוף (שנים)</Label>
                <Input
                  type="number"
                  value={formData.body_age_years}
                  onChange={(e) => setFormData({...formData, body_age_years: e.target.value})}
                  placeholder="25"
                />
              </div>
            </div>
            <div>
              <Label>הערות (אופציונלי)</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="הוסף הערה..."
                rows={2}
              />
            </div>
            <Button
              onClick={() => {
                const cleanData = Object.fromEntries(
                  Object.entries(formData).filter(([_, v]) => v !== '')
                );
                // Convert string numbers to actual numbers
                ['weight_kg', 'body_fat_percent', 'water_percent', 'muscle_mass_kg', 'body_age_years'].forEach(key => {
                  if (cleanData[key]) cleanData[key] = parseFloat(cleanData[key]);
                });
                saveMutation.mutate(cleanData);
              }}
              className="w-full"
              style={{ backgroundColor: '#79DBD6', color: 'white' }}
              disabled={!formData.date || (!formData.weight_kg && !formData.body_fat_percent && !formData.water_percent && !formData.muscle_mass_kg && !formData.body_age_years)}
            >
              שמור מדידה
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </RouteGuard>
  );
}