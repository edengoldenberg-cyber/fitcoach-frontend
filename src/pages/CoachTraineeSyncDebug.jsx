import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, RefreshCw, Search } from 'lucide-react';
import { getIsraelDateString, nutritionRecordMatchesTrainee, nutritionTotals, waterTotal, metricRecordMatchesTrainee, localDateInRange, logSyncEvent } from '@/utils/nutritionSync';

const today = getIsraelDateString();
const sevenDaysAgo = getIsraelDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));

function JsonBox({ title, data }) {
  return (
    <Card className="p-4 bg-white border-slate-200">
      <h3 className="font-bold text-slate-800 mb-3 text-sm">{title}</h3>
      <pre className="text-xs bg-slate-950 text-slate-100 rounded-xl p-3 overflow-auto max-h-80" dir="ltr">
        {JSON.stringify(data, null, 2)}
      </pre>
    </Card>
  );
}

function WarningList({ warnings }) {
  if (!warnings.length) {
    return <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm"><CheckCircle2 className="w-4 h-4" />לא נמצאו בעיות סנכרון בטווח הזה</div>;
  }
  return (
    <div className="space-y-2">
      {warnings.map((warning, index) => (
        <div key={index} className="flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{warning}</span>
        </div>
      ))}
    </div>
  );
}

export default function CoachTraineeSyncDebug() {
  const queryClient = useQueryClient();
  const [selectedTraineeId, setSelectedTraineeId] = useState('');
  const [startDate, setStartDate] = useState(sevenDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [repairResult, setRepairResult] = useState(null);
  const [repairing, setRepairing] = useState(false);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const { data: trainees = [] } = useQuery({
    queryKey: ['syncDebugTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const selectedTrainee = trainees.find(t => t.id === selectedTraineeId) || trainees[0] || null;

  const { data: meals = [] } = useQuery({
    queryKey: ['syncDebugMeals', selectedTrainee?.id, startDate, endDate],
    queryFn: async () => {
      const records = await base44.entities.MealEntry.list('-created_date', 1000);
      return records.filter(r => nutritionRecordMatchesTrainee(r, selectedTrainee) && localDateInRange(r.date, startDate, endDate));
    },
    enabled: !!selectedTrainee,
  });

  const { data: water = [] } = useQuery({
    queryKey: ['syncDebugWater', selectedTrainee?.id, startDate, endDate],
    queryFn: async () => {
      const records = await base44.entities.WaterEntry.list('-created_date', 1000);
      return records.filter(r => nutritionRecordMatchesTrainee(r, selectedTrainee) && localDateInRange(r.date, startDate, endDate));
    },
    enabled: !!selectedTrainee,
  });

  const { data: metrics = [] } = useQuery({
    queryKey: ['syncDebugMetrics', selectedTrainee?.id, startDate, endDate],
    queryFn: async () => {
      const records = await base44.entities.MetricsEntry.list('-date', 1000);
      return records.filter(r => metricRecordMatchesTrainee(r, selectedTrainee) && localDateInRange(r.date, startDate, endDate));
    },
    enabled: !!selectedTrainee,
  });

  const { data: allTrainees = [] } = useQuery({
    queryKey: ['syncDebugAllTrainees'],
    queryFn: () => base44.entities.Trainee.list('-updated_date', 1000),
  });

  const audit = useMemo(() => {
    if (!selectedTrainee) return null;
    const warnings = [];
    const duplicateTrainees = allTrainees.filter(t => t.user_email && selectedTrainee.user_email && t.user_email.toLowerCase() === selectedTrainee.user_email.toLowerCase());
    if (duplicateTrainees.length > 1) warnings.push(`כפילות פרופיל: נמצאו ${duplicateTrainees.length} מתאמנים עם אותו אימייל`);

    [...meals, ...water, ...metrics].forEach(record => {
      if (!record.trainee_id) warnings.push(`${record.food_name || 'מדידה/מים'} (${record.id}) חסר trainee_id`);
      if (record.trainee_id && record.trainee_id !== selectedTrainee.id) warnings.push(`${record.id} משויך ל-trainee_id אחר`);
      if (!record.user_id && selectedTrainee.user_id) warnings.push(`${record.id} חסר user_id`);
      if (!record.date) warnings.push(`${record.id} חסר תאריך`);
    });

    const duplicateMeals = meals.filter((meal, index, arr) => arr.findIndex(other => other.id !== meal.id && other.date === meal.date && other.meal_type === meal.meal_type && other.food_name === meal.food_name && other.calories === meal.calories) !== -1);
    if (duplicateMeals.length) warnings.push(`נמצאו ${duplicateMeals.length} רשומות ארוחה חשודות ככפולות`);

    const totals = {
      nutrition: nutritionTotals(meals),
      water_ml: waterTotal(water),
      metrics_count: metrics.length,
      latest_weight: [...metrics].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.weight_kg || null,
    };

    return {
      trainee: selectedTrainee,
      range: { startDate, endDate },
      totals,
      warnings,
      missingRecords: warnings.filter(w => w.includes('חסר')),
      staleRecords: [...meals, ...water, ...metrics].filter(r => r.updated_date && new Date(r.updated_date) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      duplicates: duplicateMeals,
      idMismatch: warnings.filter(w => w.includes('trainee_id אחר') || w.includes('כפילות')),
      cacheMismatch: 'רענון ידני בוצע מול המקור הקנוני: MealEntry, WaterEntry, MetricsEntry',
    };
  }, [selectedTrainee, allTrainees, meals, water, metrics, startDate, endDate]);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['syncDebugMeals'] });
    queryClient.invalidateQueries({ queryKey: ['syncDebugWater'] });
    queryClient.invalidateQueries({ queryKey: ['syncDebugMetrics'] });
    logSyncEvent({ entity: 'SYNC_DEBUG', trainee_id: selectedTrainee?.id, coach_id: user?.id, source: 'coach_debug', refresh_success: true });
  };

  const runRepair = async (dryRun = true) => {
    if (!selectedTrainee?.id) return;
    setRepairing(true);
    const response = await base44.functions.invoke('coachTraineeSyncRepair', {
      trainee_id: selectedTrainee.id,
      days_back: 5,
      dry_run: dryRun,
    });
    setRepairResult(response.data);
    refreshAll();
    setRepairing(false);
  };

  React.useEffect(() => {
    if (!selectedTrainee) return;
    const unsubMeal = base44.entities.MealEntry.subscribe(refreshAll);
    const unsubWater = base44.entities.WaterEntry.subscribe(refreshAll);
    const unsubMetrics = base44.entities.MetricsEntry.subscribe(refreshAll);
    const unsubTrainee = base44.entities.Trainee.subscribe(refreshAll);
    return () => { unsubMeal(); unsubWater(); unsubMetrics(); unsubTrainee(); };
  }, [selectedTrainee?.id]);

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Search className="w-6 h-6" />בדיקת סנכרון מאמן↔מתאמן</h1>
            <p className="text-sm text-slate-500">מקור אמת: MealEntry, WaterEntry, MetricsEntry</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={refreshAll} variant="outline" className="gap-2"><RefreshCw className="w-4 h-4" />רענון</Button>
            <Button onClick={() => runRepair(true)} disabled={!selectedTrainee || repairing} variant="outline" className="gap-2 text-amber-700">בדיקה יבשה</Button>
            <Button onClick={() => runRepair(false)} disabled={!selectedTrainee || repairing} className="gap-2 bg-emerald-600 hover:bg-emerald-700">תקן מזהים</Button>
          </div>
        </div>

        <Card className="p-4 bg-white grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">מתאמן</label>
            <Select value={selectedTrainee?.id || ''} onValueChange={setSelectedTraineeId}>
              <SelectTrigger><SelectValue placeholder="בחר מתאמן" /></SelectTrigger>
              <SelectContent>{trainees.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">מתאריך</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">עד תאריך</label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </Card>

        {audit && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4 bg-white"><p className="text-xs text-slate-500">ארוחות</p><p className="text-2xl font-bold text-emerald-600">{audit.totals.nutrition.count}</p></Card>
              <Card className="p-4 bg-white"><p className="text-xs text-slate-500">קלוריות</p><p className="text-2xl font-bold text-slate-800">{Math.round(audit.totals.nutrition.calories)}</p></Card>
              <Card className="p-4 bg-white"><p className="text-xs text-slate-500">מים</p><p className="text-2xl font-bold text-blue-600">{audit.totals.water_ml}ml</p></Card>
              <Card className="p-4 bg-white"><p className="text-xs text-slate-500">מדידות</p><p className="text-2xl font-bold text-purple-600">{audit.totals.metrics_count}</p></Card>
            </div>
            <WarningList warnings={audit.warnings} />
            {repairResult && <JsonBox title="תוצאת בדיקה/תיקון מזהים" data={repairResult} />}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <JsonBox title="1. נתוני מתאמן גולמיים" data={{ meals, water, metrics }} />
              <JsonBox title="2. נתוני מאמן מחושבים" data={audit.totals} />
              <JsonBox title="3. רשומות חסרות/יתומות" data={audit.missingRecords} />
              <JsonBox title="4. כפילויות / ID mismatch / cache" data={{ duplicates: audit.duplicates, idMismatch: audit.idMismatch, staleRecords: audit.staleRecords, cacheMismatch: audit.cacheMismatch }} />
            </div>
            <Badge className="bg-slate-900 text-white w-fit">SYNC_EVENT logs נכתבים ל-console בכל רענון</Badge>
          </>
        )}
      </div>
    </div>
  );
}