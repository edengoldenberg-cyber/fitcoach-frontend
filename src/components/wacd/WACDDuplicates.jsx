import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';

function fmtTime(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ts; }
}

export default function WACDDuplicates({ data }) {
  const { todayPerformance, todayEventLogs, traineeMap } = data;

  // Detect duplicates: same trainee_id + trigger_type within today
  const dupGroups = useMemo(() => {
    const groups = {};
    todayPerformance.forEach(p => {
      const key = `${p.trainee_id}__${p.trigger_type}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });

    // Also check event logs for actual duplicate_blocked
    const dupeBlockedByTrainee = {};
    todayEventLogs.filter(e => e.blocked_reason === 'duplicate_blocked').forEach(e => {
      const key = `${e.trainee_id}__${e.trigger_type}`;
      if (!dupeBlockedByTrainee[key]) dupeBlockedByTrainee[key] = [];
      dupeBlockedByTrainee[key].push(e);
    });

    const result = [];

    // Performance duplicates
    Object.entries(groups).forEach(([key, entries]) => {
      if (entries.length > 1) {
        const [traineeId, triggerType] = key.split('__');
        const trainee = traineeMap[traineeId];
        // Were these actually sent (gate_passed)?
        const sentEntries = entries.filter(e => e.decision_log?.gate_passed);
        const blockedEntries = entries.filter(e => !e.decision_log?.gate_passed);
        const duplicateSent = sentEntries.length > 1;

        result.push({
          key,
          traineeId,
          triggerType,
          trainee,
          entries,
          sentEntries,
          blockedEntries,
          duplicateSent,
          times: entries.map(e => e.message_sent_at).sort(),
          blockedByDedup: (dupeBlockedByTrainee[key] || []).length,
        });
      }
    });

    // Add groups that only show up in event logs (blocked dupes)
    Object.entries(dupeBlockedByTrainee).forEach(([key, events]) => {
      if (!groups[key] || groups[key].length <= 1) {
        const [traineeId, triggerType] = key.split('__');
        const trainee = traineeMap[traineeId];
        result.push({
          key,
          traineeId,
          triggerType,
          trainee,
          entries: [],
          sentEntries: [],
          blockedEntries: events,
          duplicateSent: false,
          times: events.map(e => e.timestamp).sort(),
          blockedByDedup: events.length,
        });
      }
    });

    return result.sort((a, b) => (b.duplicateSent ? 1 : 0) - (a.duplicateSent ? 1 : 0));
  }, [todayPerformance, todayEventLogs, traineeMap]);

  if (dupGroups.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <div className="text-4xl mb-3">✅</div>
        <p className="font-semibold">לא נמצאו כפילויות היום</p>
        <p className="text-sm mt-1">כל ההודעות נשלחו פעם אחת בלבד</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{dupGroups.length} קבוצות עם כפילות פוטנציאלית</p>

      {dupGroups.map((group) => {
        const isRealProblem = group.duplicateSent;
        return (
          <div
            key={group.key}
            className={`rounded-xl border-2 p-4 ${isRealProblem ? 'border-red-400 bg-red-50' : 'border-orange-200 bg-orange-50'}`}
          >
            {/* Header */}
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isRealProblem ? 'text-red-600' : 'text-orange-500'}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800">
                    {group.trainee?.full_name || group.traineeId || '—'}
                  </span>
                  <span className="text-xs bg-white border rounded-full px-2 py-0.5 font-mono">
                    {group.triggerType}
                  </span>
                  {isRealProblem && (
                    <span className="text-xs bg-red-200 text-red-800 rounded-full px-2 py-0.5 font-bold">
                      ⚠️ כפילות נשלחה בפועל!
                    </span>
                  )}
                </div>
                {group.trainee?.user_email && (
                  <p className="text-xs text-slate-500 mt-0.5">{group.trainee.user_email}</p>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-white rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-slate-800">{group.entries.length}</div>
                <div className="text-xs text-slate-500">ניסיונות</div>
              </div>
              <div className="bg-white rounded-lg p-2 text-center">
                <div className={`text-lg font-bold ${group.sentEntries.length > 1 ? 'text-red-600' : 'text-slate-600'}`}>
                  {group.sentEntries.length}
                </div>
                <div className="text-xs text-slate-500">נשלחו</div>
              </div>
              <div className="bg-white rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-emerald-600">{group.blockedByDedup}</div>
                <div className="text-xs text-slate-500">נחסמו (dedup)</div>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1.5">ציר זמן:</p>
              <div className="space-y-1">
                {group.times.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${i === 0 ? 'bg-blue-500' : 'bg-red-500'}`} />
                    <span className="font-mono text-slate-600">{fmtTime(t)}</span>
                    <span className="text-slate-400">{i === 0 ? 'שליחה ראשונה' : `שליחה ${i + 1} (כפילות)`}</span>
                  </div>
                ))}
              </div>
            </div>

            {isRealProblem && (
              <div className="mt-3 bg-red-100 border border-red-300 rounded-lg p-2 text-xs text-red-800">
                <b>בעיה:</b> הודעה כפולה נשלחה בפועל. בדוק את ה-dedup key ב-Smart Gate.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}