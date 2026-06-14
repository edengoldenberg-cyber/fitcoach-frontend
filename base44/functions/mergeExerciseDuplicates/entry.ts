import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizeName(name) {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[-_]/g, '')
    .replace(/[^\u0590-\u05FFa-z0-9 ]/g, '');
}

function normalizeEquipment(equipment) {
  if (!equipment || !Array.isArray(equipment)) return [];
  return [...equipment].sort();
}

function getMergeKey(exercise) {
  const normalized = normalizeName(exercise.name_he || '');
  const category = exercise.muscle_group_primary || '';
  const equipment = normalizeEquipment(exercise.equipment).join('|');
  return `${normalized}::${category}::${equipment}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const startTime = Date.now();
    const report = {
      step: 'scanning',
      totalExercises: 0,
      duplicateGroups: 0,
      exercisesMerged: 0,
      finalCount: 0,
      duration: 0,
      errors: [],
    };

    // Step 1: Fetch all exercises
    report.step = 'scanning';
    const allExercises = await base44.asServiceRole.entities.Exercise.list('-created_date', 1000);
    report.totalExercises = allExercises.length;

    if (allExercises.length === 0) {
      return Response.json({
        success: true,
        report: {
          ...report,
          message: 'לא נמצאו תרגילים במערכת',
          duration: Date.now() - startTime,
        }
      });
    }

    // Step 2: Group by merge key
    report.step = 'grouping';
    const groups = new Map();

    for (const exercise of allExercises) {
      const key = getMergeKey(exercise);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(exercise);
    }

    // Find duplicate groups (groups with more than 1 exercise)
    const duplicateGroups = Array.from(groups.values()).filter(g => g.length > 1);
    report.duplicateGroups = duplicateGroups.length;

    if (duplicateGroups.length === 0) {
      return Response.json({
        success: true,
        report: {
          ...report,
          message: 'לא נמצאו כפילויות לאיחוד',
          duration: Date.now() - startTime,
        }
      });
    }

    // Step 3: Merge duplicates
    report.step = 'updating_references';
    
    for (const group of duplicateGroups) {
      try {
        // Choose canonical (oldest)
        const canonical = group.sort((a, b) => 
          new Date(a.created_date) - new Date(b.created_date)
        )[0];
        
        const duplicates = group.filter(e => e.id !== canonical.id);

        // Update references in DailyWorkoutExercise
        const dailyWorkoutExercises = await base44.asServiceRole.entities.DailyWorkoutExercise.list('-created_date', 5000);
        for (const dwe of dailyWorkoutExercises) {
          if (duplicates.some(d => d.id === dwe.exercise_id)) {
            await base44.asServiceRole.entities.DailyWorkoutExercise.update(dwe.id, {
              exercise_id: canonical.id,
              exercise_name: canonical.name_he,
            });
          }
        }

        // Update references in TraineeWorkoutExercise
        const traineeWorkoutExercises = await base44.asServiceRole.entities.TraineeWorkoutExercise.list('-created_date', 5000);
        for (const twe of traineeWorkoutExercises) {
          if (duplicates.some(d => d.id === twe.exercise_id)) {
            await base44.asServiceRole.entities.TraineeWorkoutExercise.update(twe.id, {
              exercise_id: canonical.id,
              exercise_name: canonical.name_he,
            });
          }
        }

        // Step 4: Delete duplicates
        report.step = 'removing_duplicates';
        for (const duplicate of duplicates) {
          await base44.asServiceRole.entities.Exercise.delete(duplicate.id);
          report.exercisesMerged++;
        }
      } catch (err) {
        report.errors.push({
          group: group.map(e => e.name_he).join(', '),
          error: err.message,
        });
      }
    }

    // Final count
    const finalExercises = await base44.asServiceRole.entities.Exercise.list('-created_date', 1000);
    report.finalCount = finalExercises.length;
    report.duration = Date.now() - startTime;
    report.step = 'completed';

    return Response.json({
      success: true,
      report,
    });

  } catch (error) {
    console.error('[MERGE_DUPLICATES_ERROR]', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});