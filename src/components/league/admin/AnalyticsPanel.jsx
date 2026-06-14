import React from 'react';
import LeagueStatCard from './LeagueStatCard';

export default function AnalyticsPanel({ stats, topTrainees, topGroups, inactivePlayers, blockedPlayers }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <LeagueStatCard title="משתמשי ליגה פעילים" value={stats.activeUsers} />
        <LeagueStatCard title="פעילים היום" value={stats.activeToday} />
        <LeagueStatCard title="פעילים השבוע" value={stats.activeWeek} />
        <LeagueStatCard title="קבוצות" value={stats.totalGroups} />
        <LeagueStatCard title="ממוצע נקודות" value={stats.averagePoints} />
        <LeagueStatCard title="חסומים" value={blockedPlayers.length} />
        <LeagueStatCard title="הקבוצה הפעילה ביותר" value={stats.mostActiveGroup || '-'} />
        <LeagueStatCard title="המשתפר ביותר" value={stats.mostImproved || '-'} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ListBox title="טופ מתאמנים" items={topTrainees.map((x) => `${x.name} — ${x.points} נק׳`)} />
        <ListBox title="טופ קבוצות" items={topGroups.map((x) => `${x.name} — ${x.points} נק׳`)} />
        <ListBox title="לא פעילים" items={inactivePlayers.map((x) => x.full_name)} />
      </div>
    </div>
  );
}

function ListBox({ title, items }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <h3 className="font-bold text-slate-900 mb-3">{title}</h3>
      <div className="space-y-2 text-sm text-slate-700">
        {items.slice(0, 10).map((item, index) => <div key={index} className="rounded-xl bg-slate-50 p-2">{item}</div>)}
        {items.length === 0 && <p className="text-slate-500">אין נתונים</p>}
      </div>
    </div>
  );
}