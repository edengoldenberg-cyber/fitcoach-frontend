import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function normalizeText(text) {
  if (!text) return '';
  return text.trim().toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[״"'`]/g, '')
    .replace(/[־-]/g, ' ');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    console.log('[migrateCustomNames] Starting migration...');

    // Get all exercise lines with custom_name but no exercise_id
    const lines = await base44.asServiceRole.entities.WorkoutExerciseLine.filter({
      exercise_id: null,
    });

    console.log('[migrateCustomNames] Found lines without exercise_id:', lines.length);

    const linesWithCustomName = lines.filter(l => l.custom_name);
    console.log('[migrateCustomNames] Lines with custom_name:', linesWithCustomName.length);

    // Get all exercises
    const exercises = await base44.asServiceRole.entities.Exercise.list();

    // Get all aliases
    const aliases = await base44.asServiceRole.entities.ExerciseAlias.list();

    // Build mapping
    const exerciseMap = {};
    exercises.forEach(ex => {
      const normalized = normalizeText(ex.name_he);
      exerciseMap[normalized] = ex.id;
    });

    // Add aliases
    aliases.forEach(alias => {
      const normalized = normalizeText(alias.normalized_alias);
      if (!exerciseMap[normalized]) {
        exerciseMap[normalized] = alias.exercise_id;
      }
    });

    console.log('[migrateCustomNames] Built mapping with', Object.keys(exerciseMap).length, 'entries');

    // Migrate
    let matched = 0;
    let notMatched = 0;
    const unmatchedNames = new Set();

    for (const line of linesWithCustomName) {
      const normalized = normalizeText(line.custom_name);
      const exerciseId = exerciseMap[normalized];

      if (exerciseId) {
        await base44.asServiceRole.entities.WorkoutExerciseLine.update(line.id, {
          exercise_id: exerciseId,
          custom_name_original: line.custom_name, // Keep original for reference
        });
        matched++;
        console.log('[migrateCustomNames] Matched:', line.custom_name, '->', exerciseId);
      } else {
        notMatched++;
        unmatchedNames.add(line.custom_name);
        console.log('[migrateCustomNames] NOT matched:', line.custom_name);
      }
    }

    console.log('[migrateCustomNames] ✅ Migration complete');
    console.log('[migrateCustomNames] Matched:', matched);
    console.log('[migrateCustomNames] Not matched:', notMatched);

    return Response.json({
      success: true,
      totalLines: linesWithCustomName.length,
      matched,
      notMatched,
      unmatchedNames: Array.from(unmatchedNames),
    });

  } catch (error) {
    console.error('[migrateCustomNames] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});