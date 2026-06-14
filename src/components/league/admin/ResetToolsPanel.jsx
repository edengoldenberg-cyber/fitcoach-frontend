import React from 'react';
import { Button } from '@/components/ui/button';

const ACTIONS = [
  ['reset_group_rankings', 'איפוס דירוג קבוצתי'],
  ['reset_personal_rankings', 'איפוס דירוג אישי'],
  ['reset_groups', 'איפוס קבוצות'],
  ['keep_groups_reset_points', 'השאר קבוצות ואפס נקודות'],
  ['archive_old_standings', 'ארכוב דירוגים ישנים']
];

export default function ResetToolsPanel({ onAction }) {
  return (
    <div className="bg-white border border-red-200 rounded-2xl p-4 space-y-3">
      <h3 className="font-bold text-red-800">כלי איפוס / חודש חדש</h3>
      <p className="text-sm text-slate-600">כל פעולה כאן דורשת אישור מפורש ונרשמת בלוג הפעולות.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {ACTIONS.map(([key, label]) => <Button key={key} variant="outline" className="border-red-200 text-red-700" onClick={() => onAction(key, label)}>{label}</Button>)}
      </div>
    </div>
  );
}