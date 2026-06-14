import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, RefreshCw } from 'lucide-react';
import NutritionDebugSummaryCards from '@/components/nutrition-debug/NutritionDebugSummaryCards';
import NutritionDebugFilters from '@/components/nutrition-debug/NutritionDebugFilters';
import NutritionDebugDetail from '@/components/nutrition-debug/NutritionDebugDetail';
import NutritionDebugTestPanel from '@/components/nutrition-debug/NutritionDebugTestPanel';

const FAILED = new Set(['PARSE_FAILED', 'RECALC_FAILED', 'SAVE_FAILED', 'LEARNING_FAILED', 'ERROR']);
const today = () => new Date().toISOString().slice(0, 10);

export default function NutritionAIDebugCenter() {
  const [selectedLog, setSelectedLog] = useState(null);
  const [filters, setFilters] = useState({ traineeId: 'all', fromDate: today(), toDate: today(), sourceType: 'all', status: 'all', mealType: 'all', errorsOnly: false });

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const { data: trainees = [] } = useQuery({
    queryKey: ['debugCenterTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user.email }),
    enabled: !!user?.email
  });
  const isCoach = user?.role === 'admin' || trainees.length > 0;

  const { data: logs = [], refetch, isLoading } = useQuery({
    queryKey: ['nutritionAnalysisDebugLogs'],
    queryFn: () => base44.entities.NutritionAnalysisDebugLog.list('-created_date', 300),
    enabled: isCoach
  });

  const traineeMap = useMemo(() => Object.fromEntries(trainees.map(t => [t.id, t])), [trainees]);
  const filteredLogs = useMemo(() => logs.filter(log => {
    const date = String(log.createdAt || log.created_date || '').slice(0, 10);
    if (filters.fromDate && date < filters.fromDate) return false;
    if (filters.toDate && date > filters.toDate) return false;
    if (filters.traineeId !== 'all' && log.traineeId !== filters.traineeId) return false;
    if (filters.sourceType !== 'all' && log.sourceType !== filters.sourceType) return false;
    if (filters.status !== 'all' && log.status !== filters.status) return false;
    if (filters.mealType !== 'all' && log.mealType !== filters.mealType) return false;
    if (filters.errorsOnly && !FAILED.has(log.status)) return false;
    return true;
  }), [logs, filters]);

  if (!isCoach) {
    return <div className="min-h-screen p-6 bg-slate-50" dir="rtl"><Card className="p-6 text-center">אין הרשאה למסך זה.</Card></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Nutrition AI Debug Center</h1>
            <p className="text-sm text-slate-500">דוחות מלאים לניתוחי טקסט, תמונה, הבהרות, שמירה ולמידה</p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading}><RefreshCw className="w-4 h-4 ml-2" /> רענן</Button>
        </div>

        <NutritionDebugSummaryCards logs={logs} />
        <NutritionDebugTestPanel trainees={trainees} onDone={refetch} />
        <NutritionDebugFilters filters={filters} setFilters={setFilters} trainees={trainees} />

        <Card className="bg-white border-0 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-100 text-slate-600">{['זמן','מתאמן','מקור','קלט','שלב','סטטוס','ביטחון',''].map(h => <th key={h} className="p-3 text-right whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {filteredLogs.map(log => {
                  const trainee = traineeMap[log.traineeId];
                  const failed = FAILED.has(log.status);
                  return (
                    <tr key={log.id} className="border-t hover:bg-slate-50">
                      <td className="p-3 whitespace-nowrap">{new Date(log.createdAt || log.created_date).toLocaleString('he-IL')}</td>
                      <td className="p-3 whitespace-nowrap">{trainee?.full_name || trainee?.user_email || log.traineeId || 'לא ידוע'}</td>
                      <td className="p-3"><Badge variant="secondary">{log.sourceType}</Badge></td>
                      <td className="p-3 max-w-xs truncate">{log.originalInputText || log.imageUrl || ''}</td>
                      <td className="p-3 max-w-xs truncate">{log.currentStep}</td>
                      <td className="p-3"><Badge variant={failed ? 'destructive' : 'outline'}>{log.status}</Badge></td>
                      <td className="p-3">{log.confidenceScore || '-'}</td>
                      <td className="p-3"><Button size="sm" variant="outline" onClick={() => setSelectedLog(log)}><Eye className="w-4 h-4 ml-1" />פתח דוח</Button></td>
                    </tr>
                  );
                })}
                {!filteredLogs.length && <tr><td colSpan="8" className="p-8 text-center text-slate-500">אין דוחות להצגה</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <NutritionDebugDetail
        log={selectedLog}
        open={!!selectedLog}
        onOpenChange={(open) => !open && setSelectedLog(null)}
        traineeName={selectedLog ? (traineeMap[selectedLog.traineeId]?.full_name || traineeMap[selectedLog.traineeId]?.user_email) : ''}
      />
    </div>
  );
}