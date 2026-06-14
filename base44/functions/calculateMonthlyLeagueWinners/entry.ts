import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Israel timezone offset: UTC+3 (summer) / UTC+2 (winter)
  // Use a simple approach: get current date in Israel time
  const now = new Date();
  const israelOffset = 3; // approximation for summer; DST handled by string comparison
  const israelNow = new Date(now.getTime() + israelOffset * 60 * 60 * 1000);
  const year = israelNow.getUTCFullYear();
  const month = israelNow.getUTCMonth(); // 0-indexed

  // Month start/end strings
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const nextMonth = month === 11 ? `${year + 1}-01-01` : `${year}-${String(month + 2).padStart(2, '0')}-01`;

  // Fetch all daily points for this month
  const allPoints = await base44.asServiceRole.entities.UserPointsDaily.list();
  const monthPoints = allPoints.filter(r => r.date >= monthStart && r.date < nextMonth);

  // Aggregate per trainee
  const byTrainee = {};
  for (const r of monthPoints) {
    if (!byTrainee[r.trainee_id]) {
      byTrainee[r.trainee_id] = {
        trainee_id: r.trainee_id,
        trainee_email: r.trainee_email,
        total_points: 0,
        days_active: 0,
      };
    }
    byTrainee[r.trainee_id].total_points += (r.total_points || 0);
    byTrainee[r.trainee_id].days_active += 1;
  }

  // Top 3 individuals
  const individualRanking = Object.values(byTrainee)
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, 3)
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

  // Enrich with trainee names
  const traineeIds = individualRanking.map(e => e.trainee_id);
  let trainees = [];
  if (traineeIds.length > 0) {
    const all = await base44.asServiceRole.entities.Trainee.list();
    trainees = all.filter(t => traineeIds.includes(t.id));
  }
  const enriched = individualRanking.map(entry => {
    const t = trainees.find(t => t.id === entry.trainee_id);
    return { ...entry, full_name: t?.full_name || t?.user_email || 'מתאמן' };
  });

  // Group calculation
  const allGroups = await base44.asServiceRole.entities.ShapeLeagueGroup.list();
  const groupScores = allGroups.map(group => {
    const members = group.members || [];
    const memberPoints = members.map(tid => byTrainee[tid]?.total_points || 0);
    const total = memberPoints.reduce((s, p) => s + p, 0);
    const avg = members.length > 0 ? Math.round(total / members.length) : 0;
    return {
      group_id: group.id,
      group_name: group.name,
      member_count: members.length,
      total_points: total,
      average_points: avg,
    };
  }).sort((a, b) => b.average_points - a.average_points);

  const winningGroup = groupScores[0] || null;

  return Response.json({
    success: true,
    month: monthStart.slice(0, 7),
    top3_individuals: enriched,
    winning_group: winningGroup,
    all_group_scores: groupScores.slice(0, 5),
  });
});