import React from 'react';
import { Card } from '@/components/ui/card';

const STATUSES_FAILED = new Set(['PARSE_FAILED', 'RECALC_FAILED', 'SAVE_FAILED', 'LEARNING_FAILED', 'ERROR']);

export default function NutritionDebugSummaryCards({ logs = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter(log => String(log.createdAt || log.created_date || '').slice(0, 10) === today);
  const failed = todayLogs.filter(log => STATUSES_FAILED.has(log.status));
  const avgConfidence = todayLogs.length
    ? Math.round(todayLogs.reduce((sum, log) => sum + ({ high: 100, medium: 60, low: 25 }[log.confidenceScore] || 0), 0) / todayLogs.length)
    : 0;

  const cards = [
    ['סה״כ היום', todayLogs.length, 'text-slate-800'],
    ['הצלחות', todayLogs.filter(log => ['PARSE_SUCCESS', 'RECALC_SUCCESS', 'SAVED_TO_DIARY', 'LEARNING_SAVED'].includes(log.status)).length, 'text-green-700'],
    ['כשלונות', failed.length, 'text-red-700'],
    ['הבהרות', todayLogs.filter(log => log.status === 'CLARIFICATION_REQUIRED').length, 'text-amber-700'],
    ['כשל שמירה', todayLogs.filter(log => log.status === 'SAVE_FAILED').length, 'text-red-700'],
    ['כשל למידה', todayLogs.filter(log => log.status === 'LEARNING_FAILED').length, 'text-red-700'],
    ['ביטחון ממוצע', `${avgConfidence}%`, 'text-blue-700'],
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
      {cards.map(([label, value, color]) => (
        <Card key={label} className="p-4 bg-white border-0 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
        </Card>
      ))}
    </div>
  );
}