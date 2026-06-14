import React from 'react';

export default function AdminLogTable({ logs, traineesById, groupsById }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="p-3 text-right">זמן</th>
              <th className="p-3 text-right">פעולה</th>
              <th className="p-3 text-right">מתאמן</th>
              <th className="p-3 text-right">קבוצה</th>
              <th className="p-3 text-right">סיבה</th>
              <th className="p-3 text-right">מאמן</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t">
                <td className="p-3 whitespace-nowrap">{log.timestamp ? new Date(log.timestamp).toLocaleString('he-IL') : '-'}</td>
                <td className="p-3 font-medium">{log.action_type}</td>
                <td className="p-3">{traineesById[log.target_trainee_id]?.full_name || log.target_trainee_id || '-'}</td>
                <td className="p-3">{groupsById[log.target_group_id]?.display_name || groupsById[log.target_group_id]?.name || log.target_group_id || '-'}</td>
                <td className="p-3 max-w-xs truncate">{log.reason || '-'}</td>
                <td className="p-3">{log.coach_email || '-'}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-500">אין פעולות להצגה</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}