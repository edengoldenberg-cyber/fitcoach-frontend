import React from 'react';

export default function PointsBreakdownTable({ rows, traineesById }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="p-3 text-right">תאריך</th>
              <th className="p-3 text-right">מתאמן</th>
              <th className="p-3 text-right">אימונים</th>
              <th className="p-3 text-right">ארוחות</th>
              <th className="p-3 text-right">מים</th>
              <th className="p-3 text-right">בונוס</th>
              <th className="p-3 text-right">סה״כ</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 80).map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">{row.date}</td>
                <td className="p-3">{traineesById[row.trainee_id]?.full_name || row.trainee_email}</td>
                <td className="p-3">{row.workout_points || 0}</td>
                <td className="p-3">{row.meal_points || 0}</td>
                <td className="p-3">{row.water_points || 0}</td>
                <td className="p-3">{row.bonus_points || 0}</td>
                <td className="p-3 font-bold">{row.total_points || 0}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="7" className="p-8 text-center text-slate-500">אין ניקוד להצגה</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}