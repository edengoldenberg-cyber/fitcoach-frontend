/**
 * AutomationHistoryDrawer — shows per-automation execution history.
 * Uses getAutomationHistory backend function (AutomationAuditLog + ArboxMember join).
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, RefreshCw, ChevronDown, ChevronUp, History } from 'lucide-react';

// ── Hebrew status labels ──────────────────────────────────────────────────────
const ACTION_META = {
  QUEUED:                        { label: 'נשלח',            color: 'bg-green-100 text-green-800 border-green-200',   dot: 'bg-green-500' },
  FOLLOWUP_STEP_2_QUEUED:        { label: 'מעקב שלב 2',      color: 'bg-teal-100 text-teal-800 border-teal-200',      dot: 'bg-teal-500' },
  FOLLOWUP_STEP_3_QUEUED:        { label: 'מעקב שלב 3',      color: 'bg-teal-100 text-teal-800 border-teal-200',      dot: 'bg-teal-500' },
  FOLLOWUP_DRY_RUN:              { label: 'מעקב – סימולציה', color: 'bg-slate-100 text-slate-600 border-slate-200',   dot: 'bg-slate-400' },
  FOLLOWUP_ESCALATED:            { label: 'הועלה לטיפול',    color: 'bg-amber-100 text-amber-800 border-amber-200',   dot: 'bg-amber-500' },
  FOLLOWUP_RESOLVED:             { label: 'תנאי נפתר',       color: 'bg-blue-100 text-blue-700 border-blue-200',      dot: 'bg-blue-400' },
  FOLLOWUP_FAILED:               { label: 'מעקב נכשל',       color: 'bg-red-100 text-red-800 border-red-200',         dot: 'bg-red-500' },
  FOLLOWUP_SKIPPED_NO_PHONE:     { label: 'דולג – אין טלפון',color: 'bg-slate-100 text-slate-600 border-slate-200',   dot: 'bg-slate-300' },
  FOLLOWUP_SKIPPED_DUPLICATE:    { label: 'דולג – כפול',     color: 'bg-slate-100 text-slate-600 border-slate-200',   dot: 'bg-slate-300' },
  FOLLOWUP_SKIPPED_BAD_TEMPLATE: { label: 'דולג – תבנית',    color: 'bg-orange-100 text-orange-700 border-orange-200',dot: 'bg-orange-400' },
  FAILED:                        { label: 'נכשל',             color: 'bg-red-100 text-red-800 border-red-200',         dot: 'bg-red-500' },
  DRY_RUN:                       { label: 'סימולציה',         color: 'bg-slate-100 text-slate-600 border-slate-200',   dot: 'bg-slate-400' },
  STALE_DATA:                    { label: 'דולג – נתונים ישנים', color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
  SKIPPED_COOLDOWN:              { label: 'דולג – המתנה',     color: 'bg-slate-100 text-slate-500 border-slate-200',   dot: 'bg-slate-300' },
  SKIPPED_NOT_DUE:               { label: 'דולג – לא מתוזמן', color: 'bg-slate-100 text-slate-500 border-slate-200',  dot: 'bg-slate-300' },
  SKIPPED_DUPLICATE:             { label: 'דולג – כפול',      color: 'bg-slate-100 text-slate-500 border-slate-200',  dot: 'bg-slate-300' },
  SKIPPED_NO_PHONE:              { label: 'דולג – אין טלפון', color: 'bg-slate-100 text-slate-500 border-slate-200',  dot: 'bg-slate-300' },
  SKIPPED_BAD_TEMPLATE:          { label: 'דולג – תבנית שגויה', color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-400' },
  SKIPPED_NO_RECIPIENTS:         { label: 'דולג – אין נמענים', color: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-300' },
  SKIPPED_REVALIDATION:          { label: 'דולג – אימות',     color: 'bg-slate-100 text-slate-500 border-slate-200',  dot: 'bg-slate-300' },
  REVALIDATION_ERROR:            { label: 'שגיאת אימות',       color: 'bg-red-100 text-red-700 border-red-200',        dot: 'bg-red-400' },
};

function getActionMeta(action) {
  if (ACTION_META[action]) return ACTION_META[action];
  // Fallback for unknown follow-up step patterns
  if (action?.startsWith('FOLLOWUP_STEP_')) return { label: `מעקב ${action}`, color: 'bg-teal-100 text-teal-800 border-teal-200', dot: 'bg-teal-500' };
  return { label: action, color: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' };
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── Single entry row ──────────────────────────────────────────────────────────
function HistoryEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getActionMeta(entry.action);

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Status dot */}
        <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`text-xs px-2 py-0 border font-medium ${meta.color}`}>
              {meta.label}
            </Badge>
            {entry.member_name && (
              <span className="text-sm font-semibold text-slate-800 truncate">{entry.member_name}</span>
            )}
            {entry.phone && !entry.member_name && (
              <span className="text-xs text-slate-500 font-mono">{entry.phone}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-slate-400">{fmtDateTime(entry.date)}</span>
            {entry.phone && entry.member_name && (
              <span className="text-xs text-slate-400 font-mono">{entry.phone}</span>
            )}
            {entry.variant_id && (
              <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 rounded px-1.5 py-0.5 font-mono">
                וריאנט: {entry.variant_id}
              </span>
            )}
          </div>
          {entry.preview && (
            <p className="text-xs text-slate-600 mt-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5 italic line-clamp-2">
              &ldquo;{entry.preview}&rdquo;
            </p>
          )}
        </div>

        {/* Expand toggle for raw details */}
        {entry.raw_details && (
          <button type="button" onClick={() => setExpanded(v => !v)}
            className="flex-shrink-0 text-slate-300 hover:text-slate-500 transition-colors p-1">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Expandable technical details */}
      {expanded && entry.raw_details && (
        <div className="px-4 pb-3">
          <pre className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">
            {entry.raw_details}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Main drawer ────────────────────────────────────────────────────────────────
export default function AutomationHistoryDrawer({ automation, coachEmail, onClose }) {
  const [page, setPage] = useState(1);
  const perPage = 25;

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['automationHistory', automation.id, page],
    queryFn: () => base44.functions.invoke('getAutomationHistory', {
      automationId: automation.id,
      coachEmail,
      page,
      perPage,
    }),
    enabled: !!automation.id && !!coachEmail,
    staleTime: 30_000,
  });

  const entries    = data?.data?.entries ?? [];
  const total      = data?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <div className="flex-1 bg-black/40" onClick={onClose} />

      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              <h2 className="text-lg font-bold text-slate-900">היסטוריה</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[280px]">{automation.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setPage(1); refetch(); }}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Total count */}
        {!isLoading && (
          <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {total > 0 ? `${total} רשומות סה"כ` : 'אין היסטוריה עדיין'}
            </span>
            {total > 0 && (
              <span className="text-xs text-slate-400">עמוד {page} מתוך {totalPages}</span>
            )}
          </div>
        )}

        {/* Entries list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
              טוען היסטוריה...
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm px-6">
              <History className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>אין נתוני ביצוע עבור אוטומציה זו עדיין.</p>
              <p className="text-xs mt-1 text-slate-300">ביצועים יופיעו כאן לאחר שהמנוע יריץ את האוטומציה.</p>
            </div>
          ) : (
            <div>
              {entries.map(e => <HistoryEntry key={e.id} entry={e} />)}
            </div>
          )}
        </div>

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="border-t border-slate-200 px-5 py-3 flex gap-3 flex-shrink-0 bg-white">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching} className="flex-1">
              הקודם
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isFetching} className="flex-1">
              הבא
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
