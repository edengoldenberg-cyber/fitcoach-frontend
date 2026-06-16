import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Droplets, Plus, ChevronRight, ChevronLeft, Trash2, Pencil } from "lucide-react";
import AddWaterDialog from '../components/trainee/AddWaterDialog';
import ProgressRing from '../components/shared/ProgressRing';
import { format, subDays, addDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { he } from 'date-fns/locale/he';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

const CONTAINER_LABELS = {
  disposable_cup: '🥤 כוס חד פעמית',
  small_bottle: '🫙 בקבוק קטן',
  large_bottle: '🍶 בקבוק גדול',
  custom: '💧 כמות מותאמת',
};

export default function WaterLog() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showWaterDialog, setShowWaterDialog] = useState(false);
  const [editingWater, setEditingWater] = useState(null);
  
  const queryClient = useQueryClient();
  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ user_email: user?.email }),
    enabled: !!user?.email,
    select: (data) => data[0],
  });

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 0 });

  const { data: waterEntries = [] } = useQuery({
    queryKey: ['water', user?.email, `${format(weekStart, 'yyyy-MM-dd')}-${format(weekEnd, 'yyyy-MM-dd')}`],
    queryFn: async () => {
      const allWater = await base44.entities.WaterEntry.filter({ trainee_email: user?.email });
      return allWater.filter(w => {
        const d = new Date(w.date);
        return d >= weekStart && d <= weekEnd;
      });
    },
    enabled: !!user?.email,
  });

  const addWaterMutation = useMutation({
    mutationFn: async ({ data, id }) => {
      if (id) {
        return base44.entities.WaterEntry.update(id, data);
      }
      const entryData = {
        ...data,
        trainee_id: trainee?.id,
        date: data.date || dateStr,
      };
      return base44.entities.WaterEntry.create(entryData);
    },
    onSuccess: () => {
      console.log('[WaterLog] Water entry saved successfully');
      queryClient.invalidateQueries({ queryKey: ['water'] });
      setShowWaterDialog(false);
      setEditingWater(null);
    },
    onError: (error) => {
      console.error('[WaterLog] Error saving water entry:', error);
      alert(`שגיאה בשמירת נתונים: ${error.message || 'שגיאה לא ידועה'}`);
    },
  });

  const deleteWaterMutation = useMutation({
    mutationFn: (id) => base44.entities.WaterEntry.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['water'] }),
  });

  const target = trainee?.target_water_ml || 3000;

  const todayEntries = useMemo(() => {
    return waterEntries.filter(w => w.date === dateStr).sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  }, [waterEntries, dateStr]);

  const todayTotal = useMemo(() => {
    return todayEntries.reduce((sum, w) => sum + (w.amount_ml || 0), 0);
  }, [todayEntries]);

  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const chartData = useMemo(() => {
    return weekDays.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayEntries = waterEntries.filter(w => w.date === dayStr);
      const total = dayEntries.reduce((sum, w) => sum + (w.amount_ml || 0), 0);
      return {
        day: format(day, 'EEE', { locale: he }),
        amount: total,
        isToday: dayStr === format(new Date(), 'yyyy-MM-dd'),
        isSelected: dayStr === dateStr,
      };
    });
  }, [waterEntries, weekDays, dateStr]);

  const progress = Math.min((todayTotal / target) * 100, 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Droplets className="w-7 h-7 text-blue-500" />
            שתיית מים
          </h1>
          <Button onClick={() => setShowWaterDialog(true)} className="bg-blue-500 hover:bg-blue-600">
            <Plus className="w-4 h-4 ml-1" />
            הוסף
          </Button>
        </div>

        {/* Main Progress */}
        <Card className="p-6 mb-6 bg-white border-0 shadow-sm text-center">
          <ProgressRing
            progress={progress}
            size={140}
            strokeWidth={14}
            color={progress >= 100 ? "#10B981" : "#3B82F6"}
            value={`${(todayTotal / 1000).toFixed(1)}L`}
            subLabel={`מתוך ${target / 1000}L`}
          />
          <p className="mt-4 text-slate-600">
            {progress >= 100 ? '🎉 כל הכבוד! הגעת ליעד!' : `נשאר ${((target - todayTotal) / 1000).toFixed(1)} ליטר`}
          </p>
        </Card>

        {/* Week Chart */}
        <Card className="p-4 mb-6 bg-white border-0 shadow-sm">
          <h3 className="font-medium text-slate-700 mb-3">סיכום שבועי</h3>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={12} />
                <YAxis hide />
                <ReferenceLine y={target} stroke="#94A3B8" strokeDasharray="3 3" />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell 
                      key={i} 
                      fill={entry.isSelected ? '#3B82F6' : entry.amount >= target ? '#10B981' : '#CBD5E1'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Date Navigation */}
        <Card className="p-3 mb-4 bg-white border-0 shadow-sm">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(subDays(selectedDate, 1))}>
              <ChevronRight className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <p className="font-bold text-slate-800">
                {format(selectedDate, 'EEEE, d בMMMM', { locale: he })}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </div>
        </Card>

        {/* Today's Entries */}
        <Card className="p-4 bg-white border-0 shadow-sm">
          <h3 className="font-medium text-slate-700 mb-3">היום ({todayEntries.length} רישומים)</h3>
          
          {todayEntries.length === 0 ? (
            <p className="text-center py-6 text-slate-400">לא נרשמה שתייה להיום</p>
          ) : (
            <div className="space-y-2">
              {todayEntries.map(entry => (
                <div key={entry.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {entry.container_type === 'disposable_cup' ? '🥤' : 
                       entry.container_type === 'small_bottle' ? '🫙' :
                       entry.container_type === 'large_bottle' ? '🍶' : '💧'}
                    </span>
                    <div>
                      <p className="font-medium text-slate-700">{entry.amount_ml} מ״ל</p>
                      {entry.time && <p className="text-xs text-slate-400">{entry.time}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="text-slate-400 hover:text-blue-500"
                      onClick={() => {
                        setEditingWater(entry);
                        setShowWaterDialog(true);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="text-slate-400 hover:text-red-500"
                      onClick={() => deleteWaterMutation.mutate(entry.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <AddWaterDialog
        open={showWaterDialog}
        onClose={() => {
          setShowWaterDialog(false);
          setEditingWater(null);
        }}
        onSave={(data, id) => addWaterMutation.mutate({ data, id })}
        traineeEmail={user?.email}
        editingWater={editingWater}
      />
    </div>
  );
}