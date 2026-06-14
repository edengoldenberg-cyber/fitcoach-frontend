import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if templates already exist
    const existing = await base44.asServiceRole.entities.MealTemplate.list();
    if (existing.length > 0) {
      return Response.json({ 
        message: 'Templates already exist', 
        count: existing.length 
      });
    }

    const templates = [
      // בוקר - יוגורט בול
      {
        name: 'יוגורט בול',
        meal_type: 'בוקר',
        focus: 'מאוזן',
        priority: 8,
        slots: [
          { role: 'חלבון', allowed_categories: ['חלב ומוצריו'], optional: false, max_items: 1 },
          { role: 'פרי', allowed_categories: ['פירות'], optional: false, max_items: 1 },
          { role: 'פחמימה', allowed_categories: ['דגנים'], optional: true, max_items: 1 },
          { role: 'שומן', allowed_categories: ['שומן'], optional: true, max_items: 1 }
        ],
        rules: {
          avoid_combos: [],
          max_total_items: 4,
          allow_repeat_food: false
        }
      },
      
      // בוקר - סנדוויץ'
      {
        name: 'סנדוויץ׳',
        meal_type: 'בוקר',
        focus: 'מאוזן',
        priority: 9,
        slots: [
          { role: 'פחמימה', allowed_categories: ['דגנים', 'פחמימה'], optional: false, max_items: 1 },
          { role: 'חלבון', allowed_categories: ['חלב ומוצריו', 'ממרח', 'חלבון'], optional: false, max_items: 1 },
          { role: 'ירק/חופשי', allowed_categories: ['ירקות'], optional: true, max_items: 1 }
        ],
        rules: {
          avoid_combos: ['בשר+דגנים מתוקים'],
          max_total_items: 3,
          allow_repeat_food: false
        }
      },
      
      // בוקר - ביצים
      {
        name: 'ביצים',
        meal_type: 'בוקר',
        focus: 'יותר חלבון',
        priority: 7,
        slots: [
          { role: 'חלבון', allowed_categories: ['חלבון'], optional: false, max_items: 1 },
          { role: 'פחמימה', allowed_categories: ['דגנים', 'פחמימה'], optional: true, max_items: 1 },
          { role: 'ירק/חופשי', allowed_categories: ['ירקות'], optional: true, max_items: 1 }
        ],
        rules: {
          avoid_combos: [],
          max_total_items: 3,
          allow_repeat_food: false
        }
      },
      
      // בוקר - דייסה
      {
        name: 'דייסה',
        meal_type: 'בוקר',
        focus: 'מאוזן',
        priority: 8,
        slots: [
          { role: 'פחמימה', allowed_categories: ['דגנים'], optional: false, max_items: 1 },
          { role: 'חלבון', allowed_categories: ['חלב ומוצריו'], optional: false, max_items: 1 },
          { role: 'פרי', allowed_categories: ['פירות'], optional: true, max_items: 1 }
        ],
        rules: {
          avoid_combos: [],
          max_total_items: 3,
          allow_repeat_food: false
        }
      },
      
      // צהריים/ערב - צלחת מלאה
      {
        name: 'צלחת מלאה',
        meal_type: 'צהריים',
        focus: 'מאוזן',
        priority: 9,
        slots: [
          { role: 'חלבון', allowed_categories: ['חלבון'], optional: false, max_items: 1 },
          { role: 'פחמימה', allowed_categories: ['דגנים', 'פחמימה', 'קטניות'], optional: false, max_items: 1 },
          { role: 'ירק/חופשי', allowed_categories: ['ירקות'], optional: false, max_items: 1 }
        ],
        rules: {
          avoid_combos: [],
          max_total_items: 4,
          allow_repeat_food: false
        }
      },
      
      {
        name: 'צלחת מלאה',
        meal_type: 'ערב',
        focus: 'מאוזן',
        priority: 9,
        slots: [
          { role: 'חלבון', allowed_categories: ['חלבון'], optional: false, max_items: 1 },
          { role: 'פחמימה', allowed_categories: ['דגנים', 'פחמימה', 'קטניות'], optional: true, max_items: 1 },
          { role: 'ירק/חופשי', allowed_categories: ['ירקות'], optional: false, max_items: 1 }
        ],
        rules: {
          avoid_combos: [],
          max_total_items: 3,
          allow_repeat_food: false
        }
      },
      
      // סלט חלבון
      {
        name: 'סלט חלבון',
        meal_type: 'צהריים',
        focus: 'יותר חלבון',
        priority: 7,
        slots: [
          { role: 'חלבון', allowed_categories: ['חלבון', 'חלב ומוצריו'], optional: false, max_items: 1 },
          { role: 'ירק/חופשי', allowed_categories: ['ירקות'], optional: false, max_items: 1 },
          { role: 'שומן', allowed_categories: ['שומן'], optional: true, max_items: 1 }
        ],
        rules: {
          avoid_combos: [],
          max_total_items: 3,
          allow_repeat_food: false
        }
      },
      
      {
        name: 'סלט חלבון',
        meal_type: 'ערב',
        focus: 'יותר חלבון',
        priority: 8,
        slots: [
          { role: 'חלבון', allowed_categories: ['חלבון', 'חלב ומוצריו'], optional: false, max_items: 1 },
          { role: 'ירק/חופשי', allowed_categories: ['ירקות'], optional: false, max_items: 1 },
          { role: 'שומן', allowed_categories: ['שומן'], optional: true, max_items: 1 }
        ],
        rules: {
          avoid_combos: [],
          max_total_items: 3,
          allow_repeat_food: false
        }
      },
      
      // נשנושים
      {
        name: 'חלבון+פרי',
        meal_type: 'ביניים',
        focus: 'מאוזן',
        priority: 8,
        slots: [
          { role: 'חלבון', allowed_categories: ['חלבון', 'חלב ומוצריו'], optional: false, max_items: 1 },
          { role: 'פרי', allowed_categories: ['פירות'], optional: false, max_items: 1 }
        ],
        rules: {
          avoid_combos: [],
          max_total_items: 2,
          allow_repeat_food: false
        }
      },
      
      {
        name: 'כריך קטן',
        meal_type: 'ביניים',
        focus: 'מאוזן',
        priority: 7,
        slots: [
          { role: 'פחמימה', allowed_categories: ['דגנים', 'פחמימה'], optional: false, max_items: 1 },
          { role: 'חלבון', allowed_categories: ['חלב ומוצריו', 'חלבון', 'ממרח'], optional: false, max_items: 1 }
        ],
        rules: {
          avoid_combos: [],
          max_total_items: 2,
          allow_repeat_food: false
        }
      }
    ];

    const created = await base44.asServiceRole.entities.MealTemplate.bulkCreate(templates);
    
    return Response.json({ 
      success: true, 
      created: created.length,
      templates: created.map(t => ({ id: t.id, name: t.name, meal_type: t.meal_type }))
    });
    
  } catch (error) {
    console.error('Error initializing templates:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});