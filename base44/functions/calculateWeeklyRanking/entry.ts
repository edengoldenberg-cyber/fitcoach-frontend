import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Israel timezone offset: UTC+3 (standard) / UTC+3 (IST)
    // Get current week Sunday→Saturday in Israel time
    const now = new Date();
    const israelOffset = 3 * 60; // minutes
    const localMs = now.getTime() + (israelOffset - now.getTimezoneOffset()) * 60000;
    const localNow = new Date(localMs);

    const dayOfWeek = localNow.getDay(); // 0=Sun
    const weekStart = new Date(localNow);
    weekStart.setDate(localNow.getDate() - dayOfWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const fmt = (d) => d.toISOString().split('T')[0];
    const weekStartStr = fmt(weekStart);
    const weekEndStr = fmt(weekEnd);

    // Fetch all UserPointsDaily records for this week (service role — read only)
    const allRecords = await base44.asServiceRole.entities.UserPointsDaily.list();
    const weekRecords = allRecords.filter(r => r.date >= weekStartStr && r.date <= weekEndStr);

    // Group by trainee_id + date first, so duplicate daily rows can't inflate points or active days
    const dailyByTraineeDate = {};
    for (const r of weekRecords) {
      if (!r.trainee_id || !r.date) continue;
      const key = `${r.trainee_id}|${r.date}`;
      const current = dailyByTraineeDate[key];
      if (!current || (r.total_points || 0) > (current.total_points || 0)) {
        dailyByTraineeDate[key] = r;
      }
    }

    const byTrainee = {};
    for (const r of Object.values(dailyByTraineeDate)) {
      if (!byTrainee[r.trainee_id]) {
        byTrainee[r.trainee_id] = {
          trainee_id: r.trainee_id,
          trainee_email: r.trainee_email || '',
          total_points: 0,
          active_dates: new Set(),
        };
      }
      byTrainee[r.trainee_id].total_points += (r.total_points || 0);
      if ((r.total_points || 0) > 0) {
        byTrainee[r.trainee_id].active_dates.add(r.date);
      }
    }

    // Fetch trainees to get names (limit 100)
    const trainees = await base44.asServiceRole.entities.Trainee.list();
    const traineeMap = {};
    for (const t of trainees) {
      traineeMap[t.id] = t.full_name || t.user_email || 'מתאמן';
    }

    // Build sorted ranking
    const ranking = Object.values(byTrainee)
      .sort((a, b) => b.total_points - a.total_points)
      .slice(0, 20)
      .map((entry, idx) => ({
        rank: idx + 1,
        trainee_id: entry.trainee_id,
        trainee_name: traineeMap[entry.trainee_id] || 'מתאמן',
        total_points: entry.total_points,
        days_active: entry.active_dates.size,
      }));

    return Response.json({
      success: true,
      week_start: weekStartStr,
      week_end: weekEndStr,
      ranking,
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});