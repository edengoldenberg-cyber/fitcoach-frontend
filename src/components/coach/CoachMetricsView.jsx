import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrendingDown, TrendingUp, Plus, Edit2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { format } from 'date-fns';
import AIMetricsInsight from '../metrics/AIMetricsInsight';
import { buildCanonicalTraineeFields, getIsraelDateString, invalidateCoachTraineeSyncQueries, logSyncEvent, metricRecordMatchesTrainee } from '@/utils/nutritionSync';

export default function CoachMetricsView({ traineeEmail, trainee }) {
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

  const { data: entries = [] } = useQuery({
    queryKey: ['metricsEntries', traineeEmail],
    queryFn: async () => {
      const records = await base44.entities.MetricsEntry.list('-date', 1000);
      return records.filter(record => metricRecordMatchesTrainee(record, trainee || { user_email: traineeEmail }));
    },
    enabled: !!traineeEmail,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const existing = entries.find(e => e.date === data.date);
      if (existing) {
        return await base44.entities.MetricsEntry.update(existing.id, { ...data, ...buildCanonicalTraineeFields(trainee || { user_email: traineeEmail }) });
      } else {
        return await base44.entities.MetricsEntry.create({
          ...data,
          ...buildCanonicalTraineeFields(trainee || { user_email: traineeEmail }),
          source: 'coach'
        });
      }
    },
    onSuccess: () => {
      invalidateCoachTraineeSyncQueries(queryClient);
      logSyncEvent({ entity: 'MetricsEntry', trainee_id: trainee?.id, coach_id: trainee?.coach_email, source: 'coach_metrics_view', write_success: true, refresh_success: true, visible_to_coach: true, visible_to_trainee: true });
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

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [entries]);

  const getTrend = (metric) => {
    const recentEntries = sortedEntries.filter(e => e[metric]).slice(0, 14);
    if (recentEntries.length < 2) return null;
    
    const newest = recentEntries[0][metric];
    const oldest = recentEntries[recentEntries.length - 1][metric];
    const change = newest - oldest;
    
    return {
      value: change,
      isPositive: change < 0,
    };
  };

  const getChartData = (metric) => {
    return sortedEntries
      .filter(e => e[metric])
      .slice(0, 30)
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium text-slate-700">מדדי גוף</h3>
        <Button
          onClick={() => {
            resetForm();
            setEditingEntry(null);
            setShowAddDialog(true);
          }}
          size="sm"
          style={{ backgroundColor: '#79DBD6', color: 'white' }}
        >
          <Plus className="w-4 h-4 ml-1" />
          הוסף מדידה
        </Button>
      </div>

      {/* AI Insights for Coach */}
      {entries.length > 0 && (
        <AIMetricsInsight 
          traineeEmail={traineeEmail} 
          entries={entries}
          isCoach={true}
        />
      )}

      {(weightTrend || fatTrend) && (
        <Card className="p-4">
          <h4 className="text-sm font-medium text-slate-600 mb-3">מגמות (14 ימים)</h4>
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
      <div className="space-y-4">
        {weightData.length >= 2 && (
          <Card className="p-4">
            <h4 className="text-sm font-medium text-slate-600 mb-3">משקל</h4>
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
            <h4 className="text-sm font-medium text-slate-600 mb-3">אחוז שומן</h4>
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
            <h4 className="text-sm font-medium text-slate-600 mb-3">אחוז מים</h4>
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
            <h4 className="text-sm font-medium text-slate-600 mb-3">מסת שריר</h4>
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
            <h4 className="text-sm font-medium text-slate-600 mb-3">גיל גוף</h4>
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

      {/* History Table */}
      <Card className="p-4">
        <h4 className="text-sm font-medium text-slate-600 mb-3">היסטוריה</h4>
        {sortedEntries.length === 0 ? (
          <p className="text-center py-6 text-slate-400 text-sm">אין מדידות</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {sortedEntries.map(entry => (
              <div key={entry.id} className="p-3 bg-slate-50 rounded-lg text-sm">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium text-slate-700">
                    {format(new Date(entry.date), 'd/M/yyyy')}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(entry)}
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                  {entry.weight_kg && <span>משקל: {entry.weight_kg}ק"ג</span>}
                  {entry.body_fat_percent && <span>שומן: {entry.body_fat_percent}%</span>}
                  {entry.water_percent && <span>מים: {entry.water_percent}%</span>}
                  {entry.muscle_mass_kg && <span>שריר: {entry.muscle_mass_kg}ק"ג</span>}
                  {entry.body_age_years && <span>גיל גוף: {entry.body_age_years}</span>}
                </div>
                {entry.notes && (
                  <p className="text-xs text-slate-500 mt-2 italic">{entry.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'עריכת מדידה' : 'הוספת מדידה'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <Label>תאריך</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
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
                />
              </div>
              <div>
                <Label>אחוז שומן (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.body_fat_percent}
                  onChange={(e) => setFormData({...formData, body_fat_percent: e.target.value})}
                />
              </div>
              <div>
                <Label>אחוז מים (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.water_percent}
                  onChange={(e) => setFormData({...formData, water_percent: e.target.value})}
                />
              </div>
              <div>
                <Label>מסת שריר (ק"ג)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.muscle_mass_kg}
                  onChange={(e) => setFormData({...formData, muscle_mass_kg: e.target.value})}
                />
              </div>
              <div>
                <Label>גיל גוף (שנים)</Label>
                <Input
                  type="number"
                  value={formData.body_age_years}
                  onChange={(e) => setFormData({...formData, body_age_years: e.target.value})}
                />
              </div>
            </div>
            <div>
              <Label>הערות</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={2}
              />
            </div>
            <Button
              onClick={() => {
                const cleanData = Object.fromEntries(
                  Object.entries(formData).filter(([_, v]) => v !== '')
                );
                ['weight_kg', 'body_fat_percent', 'water_percent', 'muscle_mass_kg', 'body_age_years'].forEach(key => {
                  if (cleanData[key]) cleanData[key] = parseFloat(cleanData[key]);
                });
                saveMutation.mutate(cleanData);
              }}
              className="w-full"
              style={{ backgroundColor: '#79DBD6', color: 'white' }}
            >
              שמור
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}