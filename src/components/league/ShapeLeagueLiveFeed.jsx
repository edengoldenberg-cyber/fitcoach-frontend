import React from 'react';
import { format } from 'date-fns';

/**
 * Builds a global activity feed from real UserPointsDaily records + achievements + streaks.
 * Shows names from trainee lookup map.
 */
function buildFeed(allPoints, allTrainees, allAchievements, weekStart, weekEnd) {
  const feed = [];
  const traineeMap = {};
  for (const t of (allTrainees || [])) traineeMap[t.id] = t.full_name?.split(' ')[0] || 'מתאמן';

  const weekRecords = (allPoints || []).filter(r => r.date >= weekStart && r.date <= weekEnd);

  for (const r of weekRecords) {
    const name = traineeMap[r.trainee_id] || 'מתאמן';
    if ((r.bonus_points || 0) >= 20) {
      feed.push({ key: `bonus-${r.id}`, emoji: '🔥', text: `${name} השלים יום מושלם!`, date: r.date, ts: r.date + '5' });
    }
    if ((r.workout_points || 0) > 0) {
      feed.push({ key: `w-${r.id}`, emoji: '💪', text: `${name} השלים אימון`, date: r.date, ts: r.date + '4' });
    }
    if ((r.water_points || 0) > 0) {
      feed.push({ key: `wt-${r.id}`, emoji: '💧', text: `${name} הגיע ליעד המים`, date: r.date, ts: r.date + '3' });
    }
    if ((r.meal_points || 0) >= 30) {
      feed.push({ key: `m-${r.id}`, emoji: '🍽️', text: `${name} רשם 3 ארוחות`, date: r.date, ts: r.date + '2' });
    }
  }

  for (const a of (allAchievements || [])) {
    const name = traineeMap[a.trainee_id] || 'מתאמן';
    const dateStr = a.unlocked_at ? a.unlocked_at.slice(0, 10) : null;
    if (dateStr && dateStr >= weekStart) {
      feed.push({ key: `ach-${a.id}`, emoji: '🏅', text: `${name} פתח הישג: ${a.title}`, date: dateStr, ts: a.unlocked_at || dateStr });
    }
  }

  return feed.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 12);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
  if (dateStr === today) return 'היום';
  if (dateStr === yesterday) return 'אתמול';
  return dateStr.slice(5).replace('-', '/');
}

export default function ShapeLeagueLiveFeed({ allPoints, allTrainees, allAchievements, weekStart, weekEnd, loading }) {
  const feed = buildFeed(allPoints, allTrainees, allAchievements, weekStart, weekEnd);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-orange-400 text-lg">⚡</span>
        <h2 className="text-white font-semibold text-lg">פעילות חיה</h2>
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-auto" />
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : feed.length === 0 ? (
        <div className="text-center py-6 space-y-2">
          <div className="text-3xl">🚀</div>
          <p className="text-slate-400 text-sm">הליגה מתחממת…</p>
          <p className="text-slate-500 text-xs">מחכים לפעילות הראשונה השבוע</p>
        </div>
      ) : (
        <div className="space-y-2">
          {feed.map(item => (
            <div key={item.key} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-700/40 hover:bg-slate-700/60 transition-colors">
              <span className="text-xl flex-shrink-0">{item.emoji}</span>
              <span className="text-white text-sm flex-1 leading-snug">{item.text}</span>
              <span className="text-slate-500 text-xs flex-shrink-0">{formatDate(item.date)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}