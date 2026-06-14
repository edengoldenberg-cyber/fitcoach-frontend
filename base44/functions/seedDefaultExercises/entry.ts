import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const CATEGORY_MAP = {
  'חזה': 'חזה',
  'גב': 'גב',
  'כתפיים': 'כתפיים',
  'יד קדמית': 'יד קדמית',
  'יד אחורית': 'יד אחורית',
  'רגליים': 'רגליים',
  'ישבן': 'ישבן',
  'ליבה': 'ליבה',
  'אירובי': 'אירובי'
};

const EQUIPMENT_MAP = {
  'מוט חופשי': 'מוט חופשי',
  'משקולות יד': 'משקולות יד',
  'סמית': 'סמית',
  'כבל קרוס': 'כבל קרוס',
  'משקל גוף': 'משקל גוף',
  'פולי עליון': 'פולי עליון',
  'פולי תחתון': 'פולי תחתון',
  'מכונה': 'מכונה',
  'גומיה': 'גומיה',
  'אירובי': 'אירובי',
  'חבל': 'חבל',
  'חתירה': 'חתירה'
};

const DEFAULT_EXERCISES_CSV = `name,category,equipment
לחיצת חזה מוט,חזה,מוט חופשי
לחיצת חזה משקולות,חזה,משקולות יד
לחיצת חזה סמית,חזה,סמית
פרפר משקולות,חזה,משקולות יד
פרפר כבל קרוס,חזה,כבל קרוס
קרוס עליון חזה,חזה,כבל קרוס
קרוס תחתון חזה,חזה,כבל קרוס
לחיצת חזה שיפוע חיובי,חזה,מוט חופשי
לחיצת חזה שיפוע שלילי,חזה,מוט חופשי
שכיבות סמיכה,חזה,משקל גוף
פולי עליון רחב,גב,פולי עליון
פולי עליון צר,גב,פולי עליון
חתירה פולי תחתון,גב,פולי תחתון
חתירה משקולת יד,גב,משקולות יד
חתירה מוט,גב,מוט חופשי
חתירה סמית,גב,סמית
מתח,גב,משקל גוף
מתח בסיוע,גב,משקל גוף
פולאובר כבל,גב,כבל קרוס
פולאובר משקולת,גב,משקולות יד
לחיצת כתפיים מוט,כתפיים,מוט חופשי
לחיצת כתפיים משקולות,כתפיים,משקולות יד
לחיצת כתפיים סמית,כתפיים,סמית
הרחקת כתפיים משקולות,כתפיים,משקולות יד
הרחקת כתפיים כבל,כתפיים,כבל קרוס
הרחקה אחורית משקולות,כתפיים,משקולות יד
הרחקה אחורית כבל,כתפיים,כבל קרוס
משיכת חבל לפנים,כתפיים,כבל קרוס
הרחקה קדמית משקולות,כתפיים,משקולות יד
כפיפת מרפקים מוט,יד קדמית,מוט חופשי
כפיפת מרפקים משקולות,יד קדמית,משקולות יד
כפיפת מרפקים פולי תחתון,יד קדמית,פולי תחתון
פטישים משקולות,יד קדמית,משקולות יד
כפיפת מרפקים כבל,יד קדמית,כבל קרוס
פשיטת מרפקים כבל,יד אחורית,כבל קרוס
פשיטת מרפקים חבל,יד אחורית,כבל קרוס
פשיטת מרפקים מעל הראש כבל,יד אחורית,כבל קרוס
מקבילים,יד אחורית,משקל גוף
לחיצה צרה מוט,יד אחורית,מוט חופשי
סקוואט מוט,רגליים,מוט חופשי
סקוואט סמית,רגליים,סמית
מכרע קדמי,רגליים,משקולות יד
מכרע בולגרי,רגליים,משקולות יד
לחיצת רגליים,רגליים,מכונה
פשיטת רגליים,רגליים,מכונה
כפיפת ברך,רגליים,מכונה
דדליפט מוט,רגליים,מוט חופשי
דדליפט רומני,רגליים,מוט חופשי
גוד מורנינג,רגליים,מוט חופשי
תאומים בעמידה,רגליים,משקל גוף
תאומים משקולות,רגליים,משקולות יד
היפ טראסט,ישבן,מוט חופשי
גשר ישבן,ישבן,משקל גוף
פשיטת ירך כבל,ישבן,כבל קרוס
מקרבי ירך,רגליים,מכונה
מרחיקי ירך,רגליים,מכונה
הליכת סרטן גומיה,ישבן,גומיה
כפיפות בטן,ליבה,משקל גוף
הרמות רגליים,ליבה,משקל גוף
פלאנק,ליבה,משקל גוף
פלאנק צדדי,ליבה,משקל גוף
בטן כבל,ליבה,כבל קרוס
הליכה,אירובי,אירובי
ריצה,אירובי,אירובי
אופניים,אירובי,אירובי
חתירה,אירובי,חתירה
קפיצה בחבל,אירובי,חבל`;

const normalizeName = (name) => {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
};

const parseCSV = (csv) => {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header.trim()] = values[idx]?.trim() || '';
    });
    return obj;
  });
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    console.log('[SEED_DEFAULT_EXERCISES_START]');

    const exercises = parseCSV(DEFAULT_EXERCISES_CSV);
    console.log('[PARSED_CSV]', { count: exercises.length });

    const existing = await base44.asServiceRole.entities.Exercise.list();
    const existingNormalized = new Set(
      existing.map(ex => normalizeName(ex.name_he))
    );

    console.log('[EXISTING_EXERCISES]', { count: existing.length });

    const toCreate = exercises
      .filter(ex => !existingNormalized.has(normalizeName(ex.name)))
      .map(ex => {
        const category = CATEGORY_MAP[ex.category] || 'אחר';
        const equipment = ex.equipment 
          ? ex.equipment.split('|').map(e => EQUIPMENT_MAP[e.trim()]).filter(Boolean)
          : [];

        return {
          name_he: ex.name,
          muscle_group_primary: category,
          equipment: equipment,
          movement_pattern: 'אחר',
          is_default: true,
          status: 'active',
          created_by_coach: user.email
        };
      });

    if (toCreate.length === 0) {
      console.log('[SEED_SKIP]', { reason: 'ALL_EXIST' });
      return Response.json({
        success: true,
        message: 'All exercises already exist',
        created: 0,
        total: existing.length
      });
    }

    const created = await base44.asServiceRole.entities.Exercise.bulkCreate(toCreate);

    console.log('[SEED_DONE]', {
      created: created.length,
      skipped: exercises.length - created.length,
      total: existing.length + created.length
    });

    return Response.json({
      success: true,
      created: created.length,
      skipped: exercises.length - created.length,
      total: existing.length + created.length,
      exercises: created.map(ex => ({ id: ex.id, name: ex.name_he, category: ex.muscle_group_primary }))
    });

  } catch (err) {
    console.error('[SEED_ERROR]', err);
    return Response.json({
      success: false,
      error: err.message
    }, { status: 500 });
  }
});