import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Israel timezone week: Sunday → Saturday
function getIsraelWeekRange() {
  const now = new Date();
  const israelOffset = 3 * 60; // UTC+3 (IST)
  const localOffset = now.getTimezoneOffset();
  const israelNow = new Date(now.getTime() + (israelOffset + localOffset) * 60000);

  const day = israelNow.getDay(); // 0=Sunday
  const sunday = new Date(israelNow);
  sunday.setDate(israelNow.getDate() - day);
  sunday.setHours(0, 0, 0, 0);

  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);

  const fmt = (d) => d.toISOString().slice(0, 10);
  return { weekStart: fmt(sunday), weekEnd: fmt(saturday) };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { weekStart, weekEnd } = getIsraelWeekRange();

    // Fetch all groups and all weekly points in parallel
    const [allGroups, allPoints] = await Promise.all([
      base44.asServiceRole.entities.ShapeLeagueGroup.list(),
      base44.asServiceRole.entities.UserPointsDaily.list(),
    ]);

    // Filter points to current week
    const weekPoints = allPoints.filter(r => r.date >= weekStart && r.date <= weekEnd);

    // Sum one canonical row per trainee per date, so duplicate daily rows can't inflate group totals
    const dailyByTraineeDate = {};
    for (const r of weekPoints) {
      if (!r.trainee_id || !r.date) continue;
      const key = `${r.trainee_id}|${r.date}`;
      const current = dailyByTraineeDate[key];
      if (!current || (r.total_points || 0) > (current.total_points || 0)) {
        dailyByTraineeDate[key] = r;
      }
    }

    const pointsByTrainee = {};
    for (const r of Object.values(dailyByTraineeDate)) {
      pointsByTrainee[r.trainee_id] = (pointsByTrainee[r.trainee_id] || 0) + (r.total_points || 0);
    }

    // Calculate stats per group
    const groupStats = allGroups.map(group => {
      const members = Array.isArray(group.members) ? group.members : [];
      const memberPoints = members.map(tid => pointsByTrainee[tid] || 0);
      const group_total_points = memberPoints.reduce((s, p) => s + p, 0);
      const active_members = memberPoints.filter(p => p > 0).length;
      const group_average_points = members.length > 0
        ? Math.round(group_total_points / members.length)
        : 0;

      return {
        group_id: group.id,
        group_name: group.name,
        member_count: members.length,
        active_members,
        group_total_points,
        group_average_points,
        member_points: members.map(tid => ({ trainee_id: tid, points: pointsByTrainee[tid] || 0 })),
      };
    });

    // Sort by average DESC
    groupStats.sort((a, b) => b.group_average_points - a.group_average_points);

    // Add rank
    groupStats.forEach((g, i) => { g.rank = i + 1; });

    return Response.json({
      success: true,
      week_start: weekStart,
      week_end: weekEnd,
      ranking: groupStats,
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});