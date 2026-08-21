/**
 * CoachAttentionTab — "דורש טיפול" section in Reminder Center.
 * Shows attention items created by the follow-up engine when sequences exhaust
 * or escalate. Coach clicks "טופל" to dismiss.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle2, Clock, Zap, AlertTriangle, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const REASON_META = {
  follow_up_exhausted: { label: 'רצף מעקב מוצה',      icon: '🔁', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  escalated:           { label: 'הועלה לטיפול אוטומטי', icon: '⚠️', color: 'bg-red-50 text-red-800 border-red-200' },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function daysLabel(n) {
  if (n === 0) return 'היום';
  if (n === 1) return 'לפני יום';
  return `לפני ${n} ימים`;
}

// ── Single attention card ─────────────────────────────────────────────────────
function AttentionCard({ item, onHandle }) {
  const [handling, setHandling]       = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const reasonMeta = REASON_META[item.reason] || { label: item.reason, icon: '❓', color: 'bg-slate-50 text-slate-700 border-slate-200' };

  const handleClick = async () => {
    setHandling(true);
    try {
      await onHandle(item.id);
    } finally {
      setHandling(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 space-y-3">
        {/* Top row */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 bg-amber-50">
            {reasonMeta.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900 text-sm truncate">
                {item.member_name || `חבר #${item.arbox_user_id}`}
              </h3>
              <Badge className={`text-xs px-2 py-0 border ${reasonMeta.color}`}>
                {reasonMeta.label}
              </Badge>
            </div>
            {item.automation_name && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                אוטומציה: {item.automation_name}
              </p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 pt-2 border-t border-slate-100 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            <span>פתוח {daysLabel(item.days_open)}</span>
          </div>
          {item.last_contact_at && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Zap className="w-3.5 h-3.5" />
              <span>פנייה אחרונה: {fmtDate(item.last_contact_at)}</span>
            </div>
          )}
          {item.phone && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
              <span>{item.phone}</span>
            </div>
          )}
        </div>

        {/* Details toggle */}
        {item.details && (
          <button type="button" onClick={() => setShowDetails(v => !v)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showDetails ? 'הסתר פרטים' : 'הצג פרטים'}
          </button>
        )}
        {showDetails && item.details && (
          <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{item.details}</p>
        )}
      </div>

      {/* Action footer */}
      <div className="border-t border-slate-100 px-4 py-2.5">
        <Button size="sm" onClick={handleClick} disabled={handling}
          className="h-8 text-xs gap-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 shadow-none font-medium w-full">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {handling ? 'מעדכן...' : '✓ טופל'}
        </Button>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function CoachAttentionTab({ coachEmail }) {
  const qc                                = useQueryClient();
  const [showHandled, setShowHandled]     = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['coachAttention', coachEmail, showHandled],
    queryFn: () => base44.functions.invoke('getCoachAttentionItems', {
      coachEmail,
      includeHandled: showHandled,
    }),
    enabled:   !!coachEmail,
    staleTime: 30_000,
  });

  const items = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;

  const handleItem = async (itemId) => {
    try {
      await base44.functions.invoke('markAttentionItemHandled', { itemId, coachEmail });
      toast.success('פריט סומן כטופל ✅');
      qc.invalidateQueries({ queryKey: ['coachAttention'] });
      qc.invalidateQueries({ queryKey: ['automationDashboard'] });
    } catch {
      toast.error('שגיאה בסימון כטופל');
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            דורש טיפול
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            פריטים שנוצרו אוטומטית כאשר רצף מעקב מוצה או הועלה לטיפול
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-1.5 flex-shrink-0">
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          רענן
        </Button>
      </div>

      {/* Toggle handled */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setShowHandled(v => !v)}
          className={`text-xs px-3 py-1.5 rounded-xl border-2 font-medium transition-all ${showHandled ? 'border-slate-400 bg-slate-100 text-slate-700' : 'border-slate-200 text-slate-500'}`}>
          {showHandled ? '✓ מציג גם טופלו' : 'הצג טופלו'}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
          טוען...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border-2 border-dashed border-slate-200">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-slate-600 font-semibold">אין פריטים הדורשים טיפול</p>
          <p className="text-sm text-slate-400 mt-1">
            {showHandled ? 'לא נמצאו פריטים' : 'כל הפריטים טופלו או שאין רצפי מעקב פעילים'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {!showHandled && total > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-amber-800">{total} פריטים</span>
              <span className="text-xs text-amber-600">ממתינים לטיפול</span>
            </div>
          )}
          {items.map(item => (
            <AttentionCard key={item.id} item={item} onHandle={handleItem} />
          ))}
        </div>
      )}
    </div>
  );
}
