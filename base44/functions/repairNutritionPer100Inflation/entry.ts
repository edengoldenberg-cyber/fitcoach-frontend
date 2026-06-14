import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ENTITY_NAMES = ['UserFoodItem', 'UserNutritionMemory', 'UserRecentFoods'];

function isInflatedUnitRecord(row = {}) {
  const unit = String(row.unit || row.default_unit || row.corrected_unit || '').toLowerCase();
  const correctedGrams = Number(row.corrected_grams || 0);
  const servingSize = Number(row.serving_size || row.default_quantity || 0);
  const caloriesPer100 = Number(row.calories_per_100g || 0);
  const correctedCalories = Number(row.corrected_calories || 0);

  if (!['unit', 'יחידה', 'מנה', 'portion', 'serving'].includes(unit)) return false;
  if (correctedGrams > 1 || servingSize > 1) return false;
  if (caloriesPer100 <= 950) return false;
  return correctedCalories > 0 && correctedCalories <= 2500 && Math.abs(caloriesPer100 - correctedCalories * 100) <= Math.max(5, correctedCalories * 2);
}

function repairPayload(row = {}) {
  return {
    calories_per_100g: Math.round(Number(row.corrected_calories || 0)),
    protein_per_100g: Math.round(Number(row.corrected_protein || 0) * 10) / 10,
    carbs_per_100g: Math.round(Number(row.corrected_carbs || 0) * 10) / 10,
    fat_per_100g: Math.round(Number(row.corrected_fat || 0) * 10) / 10,
    notes: `${row.notes || ''}\n[auto-repair] Fixed unit-as-100g nutrition inflation on ${new Date().toISOString()}`.trim()
  };
}

async function repairEntity(base44, entityName, dryRun) {
  const rows = await base44.asServiceRole.entities[entityName].list('-updated_date', 500);
  const candidates = rows.filter(isInflatedUnitRecord);
  const repaired = [];

  for (const row of candidates) {
    const payload = repairPayload(row);
    repaired.push({ id: row.id, food_name: row.food_name, before: row.calories_per_100g, after: payload.calories_per_100g });
    if (!dryRun) {
      await base44.asServiceRole.entities[entityName].update(row.id, payload);
    }
  }

  return { entityName, scanned: rows.length, candidates: candidates.length, repaired };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;
    const results = [];

    for (const entityName of ENTITY_NAMES) {
      results.push(await repairEntity(base44, entityName, dryRun));
    }

    return Response.json({ ok: true, dryRun, results });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});