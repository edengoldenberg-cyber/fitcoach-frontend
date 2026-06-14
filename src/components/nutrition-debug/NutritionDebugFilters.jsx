import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default function NutritionDebugFilters({ filters, setFilters, trainees = [] }) {
  const update = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-white rounded-xl p-4 shadow-sm">
      <Select value={filters.traineeId} onValueChange={(v) => update('traineeId', v)}>
        <SelectTrigger><SelectValue placeholder="מתאמן" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">כל המתאמנים</SelectItem>
          {trainees.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name || t.user_email}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input type="date" value={filters.fromDate} onChange={(e) => update('fromDate', e.target.value)} />
      <Input type="date" value={filters.toDate} onChange={(e) => update('toDate', e.target.value)} />
      <Select value={filters.sourceType} onValueChange={(v) => update('sourceType', v)}>
        <SelectTrigger><SelectValue placeholder="מקור" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">כל המקורות</SelectItem>
          <SelectItem value="TEXT">טקסט</SelectItem>
          <SelectItem value="IMAGE">תמונה</SelectItem>
          <SelectItem value="VOICE">קול</SelectItem>
          <SelectItem value="MANUAL">ידני</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.status} onValueChange={(v) => update('status', v)}>
        <SelectTrigger><SelectValue placeholder="סטטוס" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">כל הסטטוסים</SelectItem>
          {['STARTED','AI_REQUEST_SENT','AI_RESPONSE_RECEIVED','PARSE_SUCCESS','PARSE_FAILED','CLARIFICATION_REQUIRED','CLARIFICATION_ANSWERED','RECALC_SUCCESS','RECALC_FAILED','SAVED_TO_DIARY','SAVE_FAILED','LEARNING_SAVED','LEARNING_FAILED','ERROR'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Select value={filters.mealType} onValueChange={(v) => update('mealType', v)}>
          <SelectTrigger><SelectValue placeholder="ארוחה" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="breakfast">בוקר</SelectItem>
            <SelectItem value="lunch">צהריים</SelectItem>
            <SelectItem value="dinner">ערב</SelectItem>
            <SelectItem value="snack">חטיף</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={filters.errorsOnly ? 'destructive' : 'outline'} onClick={() => update('errorsOnly', !filters.errorsOnly)}>שגיאות</Button>
      </div>
    </div>
  );
}