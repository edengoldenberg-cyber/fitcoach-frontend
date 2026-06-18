import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Scale, Plus, TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import { format, subDays } from 'date-fns';
import { he } from 'date-fns/locale/he';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';

const MEASUREMENT_TYPES = [
  { key: 'weight_kg', label: 'משקל', unit: 'ק״ג', color: '#3B82F6', icon: Scale },
  { key: 'body_fat_percent', label: 'אחוז שומן', unit: '%', color: '#EF4444', icon: Activity },
  { key: 'muscle_mass_kg', label: 'מסת שריר', unit: 'ק״ג', color: '#10B981', icon: TrendingUp },
  { key: 'water_percent', label: 'אחוז מים', unit: '%', color: '#06B6D4', icon: Activity },
  { key: 'body_age_years', label: 'גיל גוף', unit: 'שנים', color: '#8B5CF6', icon: Activity },
];

export default function BodyMeasurements() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('weight_kg');
  const [newMeasurement, setNewMeasurement] = useState({
    weight_kg: '',
    body_fat_percent: '',
    muscle_mass_kg: '',
    water_percent: '',
    body_age_years: '',
  });
  
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: measurements = [] } = useQuery({
    queryKey: ['measurements', user?.email],
    queryFn: () => base44.entities.BodyMeasurement.filter({ trainee_email: user?.email }),
    enabled: !!user?.email,
  });

  const addMeasurementMutation = useMutation({
    mutationFn: (data) => base44.entities.BodyMeasurement.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurements'] });
      setShowAddDialog(false);
      setNewMeasurement({
        weight_kg: '',
        body_fat_percent: '',
        muscle_mass_kg: '',
        water_percent: '',
        body_age_years: '',
      });
    },
  });

  const sortedMeasurements = useMemo(() => {
    return [...measurements].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [measurements]);

  const chartData = useMemo(() => {
    return [...measurements]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-30)
      .map(m => ({
        date: format(new Date(m.date), 'd/M'),
        ...m,
      }));
  }, [measurements]);

  const latestMeasurement = sortedMeasurements[0];
  const previousMeasurement = sortedMeasurements[1];

  const getTrend = (key) => {
    if (!latestMeasurement || !previousMeasurement) return null;
    const diff = (latestMeasurement[key] || 0) - (previousMeasurement[key] || 0);
    if (diff === 0) return null;
    return diff > 0 ? 'up' : 'down';
  };

  const handleSave = () => {
    const data = {
      trainee_email: user?.email,
      date: today,
    };
    
    Object.entries(newMeasurement).forEach(([key, value]) => {
      if (value !== '') {
        data[key] = parseFloat(value);
      }
    });
    
    addMeasurementMutation.mutate(data);
  };

  const selectedMetricInfo = MEASUREMENT_TYPES.find(m => m.key === selectedMetric);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Scale className="w-7 h-7 text-purple-500" />
            מדדים גופניים
          </h1>
          <Button onClick={() => setShowAddDialog(true)} className="bg-purple-500 hover:bg-purple-600">
            <Plus className="w-4 h-4 ml-1" />
            מדידה חדשה
          </Button>
        </div>

        {/* Current Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {MEASUREMENT_TYPES.slice(0, 4).map(({ key, label, unit, color, icon: Icon }) => {
            const value = latestMeasurement?.[key];
            const trend = getTrend(key);
            return (
              <Card 
                key={key} 
                className={`p-4 cursor-pointer transition-all hover:shadow-md ${selectedMetric === key ? 'ring-2 ring-purple-400' : ''}`}
                style={{ backgroundColor: `${color}10`, borderColor: `${color}30` }}
                onClick={() => setSelectedMetric(key)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium opacity-70">{label}</p>
                    <p className="text-2xl font-bold" style={{ color }}>
                      {value ?? '—'}
                      <span className="text-sm mr-1">{unit}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-500" />}
                    {trend === 'down' && <TrendingDown className="w-4 h-4 text-red-500" />}
                    {!trend && <Minus className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Chart */}
        <Card className="p-4 mb-6 bg-white border-0 shadow-sm">
          <h3 className="font-medium text-slate-700 mb-1">{selectedMetricInfo?.label}</h3>
          <p className="text-xs text-slate-400 mb-4">30 הימים האחרונים</p>
          
          {chartData.length < 2 ? (
            <div className="h-40 flex items-center justify-center text-slate-400">
              צריך לפחות 2 מדידות להצגת גרף
            </div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="date" fontSize={10} tickLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                  <Tooltip 
                    contentStyle={{ 
                      background: 'white', 
                      border: 'none', 
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      borderRadius: '8px',
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey={selectedMetric} 
                    stroke={selectedMetricInfo?.color} 
                    strokeWidth={2.5}
                    dot={{ fill: selectedMetricInfo?.color, strokeWidth: 0, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* History */}
        <Card className="p-4 bg-white border-0 shadow-sm">
          <h3 className="font-medium text-slate-700 mb-3">היסטוריית מדידות</h3>
          
          {sortedMeasurements.length === 0 ? (
            <p className="text-center py-6 text-slate-400">אין מדידות עדיין</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {sortedMeasurements.slice(0, 20).map(measurement => (
                <div key={measurement.id} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-slate-700">
                      {format(new Date(measurement.date), 'd בMMMM yyyy', { locale: he })}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {measurement.weight_kg && (
                      <span className="text-blue-600">משקל: {measurement.weight_kg}ק״ג</span>
                    )}
                    {measurement.body_fat_percent && (
                      <span className="text-red-600">שומן: {measurement.body_fat_percent}%</span>
                    )}
                    {measurement.muscle_mass_kg && (
                      <span className="text-emerald-600">שריר: {measurement.muscle_mass_kg}ק״ג</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Add Measurement Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>מדידה חדשה</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-slate-500">הזן את המדדים שיש לך (לא חובה למלא הכל)</p>
            
            {MEASUREMENT_TYPES.map(({ key, label, unit }) => (
              <div key={key}>
                <Label>{label} ({unit})</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newMeasurement[key]}
                  onChange={(e) => setNewMeasurement({...newMeasurement, [key]: e.target.value})}
                  placeholder={`הזן ${label}`}
                />
              </div>
            ))}

            <Button 
              onClick={handleSave}
              disabled={Object.values(newMeasurement).every(v => v === '')}
              className="w-full bg-purple-500 hover:bg-purple-600"
            >
              שמור מדידה
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}