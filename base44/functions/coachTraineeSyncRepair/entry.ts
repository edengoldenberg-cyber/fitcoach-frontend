import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const normalizeEmail = (value = '') => String(value || '').toLowerCase().trim();

function matches(record, trainee) {
  const recordEmail = normalizeEmail(record.trainee_email || record.user_email || record.created_by);
  const traineeEmail = normalizeEmail(trainee.user_email);
  return Boolean(
    (record.trainee_id && trainee.id && record.trainee_id === trainee.id) ||
    (record.user_id && trainee.user_id && record.user_id === trainee.user_id) ||
    (recordEmail && traineeEmail && recordEmail === traineeEmail)
  );
}

function getIsraelDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function isWithinDateRange(record, startDate, endDate) {
  const value = String(record.date || record.created_date || '').slice(0, 10);
  return value && value >= startDate && value <= endDate;
}

async function repairEntityRecords(base44, entityName, records, trainees, dryRun, startDate, endDate, maxFixes, offset) {
  const fixes = [];
  let skipped = 0;
  const relevantRecords = records.filter(record => isWithinDateRange(record, startDate, endDate));

  for (const record of relevantRecords) {
    const trainee = trainees.find(t => matches(record, t));
    if (!trainee) continue;

    const patch = {};
    if (!record.trainee_id) patch.trainee_id = trainee.id;
    if (!record.user_id && trainee.user_id) patch.user_id = trainee.user_id;
    if (!record.trainee_email && trainee.user_email) patch.trainee_email = trainee.user_email;
    if (entityName === 'MetricsEntry' && !record.coach_email && trainee.coach_email) patch.coach_email = trainee.coach_email;

    if (Object.keys(patch).length) {
      if (skipped < offset) {
        skipped += 1;
        continue;
      }
      if (fixes.length >= maxFixes) break;
      fixes.push({ entity: entityName, id: record.id, trainee_id: trainee.id, patch });
      if (!dryRun) await base44.asServiceRole.entities[entityName].update(record.id, patch);
    }
  }

  return fixes;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const payload = await req.json();
    const traineeId = payload?.trainee_id;
    const dryRun = payload?.dry_run !== false;
    const allTrainees = payload?.all_trainees === true;
    const daysBack = Number(payload?.days_back || 5);
    const maxFixes = Math.max(Number(payload?.max_fixes || 20), 1);
    const offset = Math.max(Number(payload?.offset || 0), 0);
    const endDate = getIsraelDateString();
    const start = new Date();
    start.setDate(start.getDate() - Math.max(daysBack - 1, 0));
    const startDate = getIsraelDateString(start);

    let trainees = [];
    if (allTrainees) {
      trainees = await base44.asServiceRole.entities.Trainee.filter({ coach_email: user.email });
    } else {
      if (!traineeId) return Response.json({ error: 'trainee_id is required' }, { status: 400 });
      trainees = await base44.asServiceRole.entities.Trainee.filter({ id: traineeId });
    }
    if (!trainees.length) return Response.json({ error: 'No trainees found' }, { status: 404 });

    const [mealRecords, waterRecords, metricsRecords] = await Promise.all([
      base44.asServiceRole.entities.MealEntry.list('-created_date', 5000),
      base44.asServiceRole.entities.WaterEntry.list('-created_date', 5000),
      base44.asServiceRole.entities.MetricsEntry.list('-created_date', 5000),
    ]);

    const fixes = [
      ...(await repairEntityRecords(base44, 'MealEntry', mealRecords, trainees, dryRun, startDate, endDate, maxFixes, offset)),
      ...(await repairEntityRecords(base44, 'WaterEntry', waterRecords, trainees, dryRun, startDate, endDate, maxFixes, offset)),
      ...(await repairEntityRecords(base44, 'MetricsEntry', metricsRecords, trainees, dryRun, startDate, endDate, maxFixes, offset)),
    ];

    console.log('SYNC_EVENT', JSON.stringify({
      entity: 'SYNC_REPAIR',
      trainee_id: traineeId || 'all',
      coach_id: user.id,
      source: dryRun ? 'dry_run' : 'repair',
      write_success: !dryRun,
      refresh_success: true,
      visible_to_coach: true,
      visible_to_trainee: true,
      fixes: fixes.length,
      start_date: startDate,
      end_date: endDate
    }));

    return Response.json({ dry_run: dryRun, days_back: daysBack, start_date: startDate, end_date: endDate, trainees_checked: trainees.length, max_fixes: maxFixes, offset, fixes_count: fixes.length, has_more: fixes.length >= maxFixes, fixes });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});