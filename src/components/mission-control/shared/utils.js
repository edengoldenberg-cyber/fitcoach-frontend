import { TRIGGER_TYPES, RISK_COLORS } from './constants.js';

export const getTriggerMeta = v =>
  TRIGGER_TYPES.find(t => t.value === v) || { value: v, label: v, category: 'custom' };

export const parseSchedule = raw => {
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
};

export const renderPreview = t =>
  t.replace(/\{\{trainee_name\}\}/g, 'ישראל ישראלי')
   .replace(/\{\{coach_name\}\}/g,   'המאמן שלך')
   .replace(/\{\{app_link\}\}/g,     'https://fitcoach-frontend-omega.vercel.app')
   .replace(/\{\{date\}\}/g,         new Date().toLocaleDateString('he-IL'));

export const fmtDate = d =>
  d ? new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtShort = d =>
  d ? new Date(d).toLocaleDateString('he-IL') : '—';

export function toCSV(rows) {
  return rows.map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
}

export function downloadBlob(content, filename, mime = 'text/csv') {
  const blob = new Blob(['﻿' + content], { type: mime + ';charset=utf-8;' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

export function calcRisk(daysSince) {
  if (daysSince >= 22) return { color: 'red',    label: 'סיכון גבוה' };
  if (daysSince >= 15) return { color: 'orange', label: 'בסיכון' };
  if (daysSince >= 8)  return { color: 'yellow', label: 'אזהרה' };
  return                      { color: 'green',  label: 'פעיל' };
}
