import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, XCircle, Zap, Clock, Shield } from 'lucide-react';

function StatCard({ label, value, color = 'text-slate-800', bg = 'bg-white', icon, warning }) {
  return (
    <div className={`${bg} rounded-xl p-3 border ${warning ? 'border-red-300' : 'border-slate-200'} flex flex-col gap-1`}>
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

export default function WACDSummaryBar({ data }) {
  const { todayEventLogs, todayPerformance, todayQueue, killSwitchOn, greenApiOk, sysConfigs } = data;

  const sent = todayEventLogs.filter(e => e.event_type === 'message_sent').length;
  const blocked = todayEventLogs.filter(e => e.event_type === 'reminder_skipped').length;
  const failed = todayQueue.filter(q => q.status === 'failed').length;
  const queued = todayQueue.filter(q => q.status === 'queued').length;

  // Duplicate detection
  const seen = {};
  let dupCount = 0;
  todayPerformance.forEach(p => {
    const key = `${p.trainee_id}__${p.trigger_type}`;
    if (seen[key]) dupCount++;
    else seen[key] = true;
  });

  // Critical issues
  const criticalIssues = [];
  if (!killSwitchOn) criticalIssues.push('Kill Switch פעיל — הודעות לא ייצאו');
  if (!greenApiOk) criticalIssues.push('GreenAPI לא מחובר / לא מופעל');
  if (dupCount > 0) criticalIssues.push(`${dupCount} כפילויות היום`);
  if (failed > 0) criticalIssues.push(`${failed} הודעות נכשלו`);

  return (
    <div className="space-y-3">
      {/* Critical issues banner */}
      {criticalIssues.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2 text-red-700 font-bold text-sm">
            <AlertTriangle className="w-4 h-4" />
            בעיות קריטיות היום ({criticalIssues.length})
          </div>
          <ul className="space-y-1">
            {criticalIssues.map((issue, i) => (
              <li key={i} className="text-sm text-red-700 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <StatCard label="נשלחו" value={sent} color="text-emerald-600" icon={<CheckCircle2 className="w-3 h-3 text-emerald-500" />} />
        <StatCard label="נחסמו" value={blocked} color="text-orange-600" icon={<XCircle className="w-3 h-3 text-orange-500" />} />
        <StatCard label="נכשלו" value={failed} color={failed > 0 ? 'text-red-600' : 'text-slate-400'} warning={failed > 0} icon={<AlertTriangle className="w-3 h-3" />} />
        <StatCard label="כפילויות" value={dupCount} color={dupCount > 0 ? 'text-red-600' : 'text-slate-400'} warning={dupCount > 0} icon={<AlertTriangle className="w-3 h-3" />} />
        <StatCard label="בתור" value={queued} color="text-blue-600" icon={<Clock className="w-3 h-3 text-blue-400" />} />
        <div className={`rounded-xl p-3 border flex flex-col gap-1 ${killSwitchOn && greenApiOk ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Shield className="w-3 h-3" />
            מערכת
          </div>
          <div className={`text-xs font-bold ${killSwitchOn && greenApiOk ? 'text-emerald-700' : 'text-red-700'}`}>
            {!killSwitchOn ? '🔴 KS' : !greenApiOk ? '🟡 API' : '🟢 OK'}
          </div>
          <div className="text-[10px] text-slate-500">
            Kill: {killSwitchOn ? 'ON' : 'OFF'} · API: {greenApiOk ? 'OK' : 'ERR'}
          </div>
        </div>
      </div>
    </div>
  );
}