import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Bug, Copy, RefreshCw, Wrench } from 'lucide-react';
import { getIsraelDateString } from '@/utils/nutritionSync';
import { toast } from 'sonner';

const dayMs = 24 * 60 * 60 * 1000;
const defaultStart = getIsraelDateString(new Date(Date.now() - 13 * dayMs));
const defaultEnd = getIsraelDateString();

export default function NutritionSyncDebug() {
  const [selectedTraineeId, setSelectedTraineeId] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [debugData, setDebugData] = useState(null);
  const [loading, setLoading] = useState(false);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const { data: trainees = [] } = useQuery({
    queryKey: ['nutritionDebugTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email
  });

  const selectedTrainee = useMemo(() => trainees.find(t => t.id === selectedTraineeId), [trainees, selectedTraineeId]);

  const runAudit = async (backfill = false) => {
    if (!selectedTraineeId) return;
    setLoading(true);
    const response = await base44.functions.invoke('nutritionSyncAudit', {
      trainee_id: selectedTraineeId,
      start_date: startDate,
      end_date: endDate,
      backfill
    });
    setDebugData(response.data);
    setLoading(false);
    if (backfill) toast.success('Backfill completed safely');
  };

  const copyDebugJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
    toast.success('Debug JSON copied');
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Bug className="w-7 h-7 text-teal-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Nutrition Sync Debug</h1>
            <p className="text-sm text-slate-500">בדיקת סנכרון תזונה בין המתאמן לתצוגת המאמן</p>
          </div>
        </div>

        <Card className="p-4 bg-white border-0 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">מתאמן</label>
              <Select value={selectedTraineeId} onValueChange={setSelectedTraineeId}>
                <SelectTrigger><SelectValue placeholder="בחר מתאמן" /></SelectTrigger>
                <SelectContent>
                  {trainees.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name} · {t.user_email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">מתאריך</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">עד תאריך</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={() => runAudit(false)} disabled={!selectedTraineeId || loading} className="flex-1 bg-teal-600 hover:bg-teal-700">
                <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> בדוק
              </Button>
              <Button onClick={() => runAudit(true)} disabled={!selectedTraineeId || loading} variant="outline" className="text-amber-700 border-amber-300">
                <Wrench className="w-4 h-4 ml-1" /> תקן
              </Button>
            </div>
          </div>
        </Card>

        {selectedTrainee && (
          <Card className="p-4 bg-white border-0 shadow-sm">
            <h2 className="font-bold text-slate-800 mb-2">פרטי מתאמן נבחר</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
              <div><span className="text-slate-500">trainee_id:</span> {selectedTrainee.id}</div>
              <div><span className="text-slate-500">user_id:</span> {selectedTrainee.user_id || '—'}</div>
              <div><span className="text-slate-500">email:</span> {selectedTrainee.user_email || '—'}</div>
              <div><span className="text-slate-500">phone:</span> {selectedTrainee.phone || '—'}</div>
            </div>
          </Card>
        )}

        {debugData && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card className="p-4 text-center bg-white border-0 shadow-sm"><p className="text-xs text-slate-500">רשומות אוכל</p><p className="text-2xl font-bold text-emerald-600">{debugData.records.MealEntry.length}</p></Card>
              <Card className="p-4 text-center bg-white border-0 shadow-sm"><p className="text-xs text-slate-500">קלוריות</p><p className="text-2xl font-bold text-slate-800">{Math.round(debugData.totals.nutrition.calories)}</p></Card>
              <Card className="p-4 text-center bg-white border-0 shadow-sm"><p className="text-xs text-slate-500">חלבון</p><p className="text-2xl font-bold text-blue-600">{Math.round(debugData.totals.nutrition.protein)}g</p></Card>
              <Card className="p-4 text-center bg-white border-0 shadow-sm"><p className="text-xs text-slate-500">מים</p><p className="text-2xl font-bold text-cyan-600">{debugData.totals.water_ml}ml</p></Card>
              <Card className="p-4 text-center bg-white border-0 shadow-sm"><p className="text-xs text-slate-500">תיקונים ממתינים</p><p className="text-2xl font-bold text-amber-600">{debugData.backfill.pending_meal_records + debugData.backfill.pending_water_records}</p></Card>
            </div>

            {debugData.mismatches.length > 0 && (
              <Card className="p-4 bg-amber-50 border-amber-200">
                <h2 className="font-bold text-amber-900 flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5" /> אזהרות</h2>
                <ul className="text-sm text-amber-800 space-y-1 list-disc pr-5">
                  {debugData.mismatches.map((warning, idx) => <li key={idx}>{warning}</li>)}
                </ul>
              </Card>
            )}

            <Card className="p-4 bg-white border-0 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-slate-800">Raw Records</h2>
                <Button onClick={copyDebugJson} variant="outline" size="sm"><Copy className="w-4 h-4 ml-1" /> Copy Debug JSON</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600">
                      <th className="p-2 text-right">entity</th><th className="p-2 text-right">date</th><th className="p-2 text-right">meal</th><th className="p-2 text-right">food</th><th className="p-2 text-right">cal</th><th className="p-2 text-right">P/C/F</th><th className="p-2 text-right">trainee_id</th><th className="p-2 text-right">user_id</th><th className="p-2 text-right">source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...debugData.records.MealEntry, ...debugData.records.WaterEntry].map(record => (
                      <tr key={`${record.entity}-${record.id}`} className="border-b">
                        <td className="p-2">{record.entity}</td><td className="p-2">{record.date}</td><td className="p-2">{record.meal_type || '—'}</td><td className="p-2">{record.food_name || `${record.amount_ml}ml`}</td><td className="p-2">{record.calories || 0}</td><td className="p-2">{record.protein || 0}/{record.carbs || 0}/{record.fat || 0}</td><td className="p-2 max-w-[140px] truncate">{record.trainee_id || '—'}</td><td className="p-2 max-w-[140px] truncate">{record.user_id || '—'}</td><td className="p-2">{record.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-4 bg-slate-900 text-slate-100 overflow-auto">
              <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(debugData, null, 2)}</pre>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}