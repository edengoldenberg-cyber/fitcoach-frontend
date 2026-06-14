import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Check existing templates
    const existing = await base44.asServiceRole.entities.MealTemplate.list();
    if (existing.length > 0) {
      return Response.json({ 
        success: false, 
        message: 'Templates already exist',
        count: existing.length 
      });
    }

    // Fetch all foods to get IDs for templates
    const allFoods = await base44.asServiceRole.entities.FoodItem.list();
    
    // Helper to find food by name
    const findFood = (name) => {
      const normalized = name.toLowerCase().trim();
      return allFoods.find(f => 
        f.name_he?.toLowerCase().includes(normalized) ||
        f.name?.toLowerCase().includes(normalized)
      );
    };

    // Define concrete meal templates with real food items
    const templates = [
      // ========== BREAKFAST ==========
      {
        meal_type: 'breakfast',
        name: 'בוקר חלבוני יוגורט',
        description: 'יוגורט יווני + בננה + שקדים',
        target_calories_approx: 350,
        foods: [
          {
            food_item_id: findFood('יוגורט יווני')?.id || '',
            food_name: 'יוגורט יווני 5%',
            grams: 200,
            role: 'protein'
          },
          {
            food_item_id: findFood('בננה')?.id || '',
            food_name: 'בננה',
            grams: 120,
            role: 'carbs'
          },
          {
            food_item_id: findFood('שקדים')?.id || '',
            food_name: 'שקדים',
            grams: 20,
            role: 'fat'
          }
        ],
        is_active: true,
        sort_order: 1
      },
      {
        meal_type: 'breakfast',
        name: 'בוקר ביצים מלוח',
        description: 'ביצים + לחם מלא + סלט + קוטג׳',
        target_calories_approx: 400,
        foods: [
          {
            food_item_id: findFood('ביצה')?.id || '',
            food_name: 'ביצים',
            grams: 100,
            role: 'protein'
          },
          {
            food_item_id: findFood('לחם')?.id || '',
            food_name: 'לחם מלא',
            grams: 60,
            role: 'carbs'
          },
          {
            food_item_id: findFood('מלפפון')?.id || '',
            food_name: 'מלפפון + עגבניה',
            grams: 100,
            role: 'vegetables'
          },
          {
            food_item_id: findFood('קוטג׳')?.id || '',
            food_name: 'קוטג׳ 5%',
            grams: 100,
            role: 'dairy'
          }
        ],
        is_active: true,
        sort_order: 2
      },
      {
        meal_type: 'breakfast',
        name: 'בוקר שיבולת שועל',
        description: 'שיבולת + חלב + תות',
        target_calories_approx: 380,
        foods: [
          {
            food_item_id: findFood('שיבולת')?.id || '',
            food_name: 'שיבולת שועל',
            grams: 60,
            role: 'carbs'
          },
          {
            food_item_id: findFood('חלב')?.id || '',
            food_name: 'חלב 1%',
            grams: 250,
            role: 'dairy'
          },
          {
            food_item_id: findFood('תות')?.id || '',
            food_name: 'תות שדה',
            grams: 80,
            role: 'fruit'
          }
        ],
        is_active: true,
        sort_order: 3
      },

      // ========== LUNCH ==========
      {
        meal_type: 'lunch',
        name: 'צהריים עוף ואורז',
        description: 'חזה עוף + אורז + ברוקולי',
        target_calories_approx: 550,
        foods: [
          {
            food_item_id: findFood('חזה עוף')?.id || '',
            food_name: 'חזה עוף',
            grams: 150,
            role: 'protein'
          },
          {
            food_item_id: findFood('אורז')?.id || '',
            food_name: 'אורז לבן מבושל',
            grams: 200,
            role: 'carbs'
          },
          {
            food_item_id: findFood('ברוקולי')?.id || '',
            food_name: 'ברוקולי מאודה',
            grams: 150,
            role: 'vegetables'
          },
          {
            food_item_id: findFood('שמן זית')?.id || '',
            food_name: 'שמן זית',
            grams: 10,
            role: 'fat'
          }
        ],
        is_active: true,
        sort_order: 4
      },
      {
        meal_type: 'lunch',
        name: 'צהריים טונה סלט',
        description: 'טונה + תפו״א + סלט',
        target_calories_approx: 500,
        foods: [
          {
            food_item_id: findFood('טונה')?.id || '',
            food_name: 'טונה במים',
            grams: 120,
            role: 'protein'
          },
          {
            food_item_id: findFood('תפוח אדמה')?.id || '',
            food_name: 'תפוח אדמה מבושל',
            grams: 200,
            role: 'carbs'
          },
          {
            food_item_id: findFood('חסה')?.id || '',
            food_name: 'סלט ירוק',
            grams: 150,
            role: 'vegetables'
          },
          {
            food_item_id: findFood('טחינה')?.id || '',
            food_name: 'טחינה',
            grams: 15,
            role: 'fat'
          }
        ],
        is_active: true,
        sort_order: 5
      },

      // ========== DINNER ==========
      {
        meal_type: 'dinner',
        name: 'ערב דג ובטטה',
        description: 'פילה דג + בטטה + ירקות',
        target_calories_approx: 480,
        foods: [
          {
            food_item_id: findFood('דג')?.id || '',
            food_name: 'פילה דג',
            grams: 150,
            role: 'protein'
          },
          {
            food_item_id: findFood('בטטה')?.id || '',
            food_name: 'בטטה אפויה',
            grams: 180,
            role: 'carbs'
          },
          {
            food_item_id: findFood('קישוא')?.id || '',
            food_name: 'קישוא + גזר',
            grams: 150,
            role: 'vegetables'
          }
        ],
        is_active: true,
        sort_order: 6
      },
      {
        meal_type: 'dinner',
        name: 'ערב קל גבינה',
        description: 'גבינה בולגרית + סלט + לחם',
        target_calories_approx: 380,
        foods: [
          {
            food_item_id: findFood('גבינה')?.id || '',
            food_name: 'גבינה בולגרית 5%',
            grams: 100,
            role: 'protein'
          },
          {
            food_item_id: findFood('עגבניה')?.id || '',
            food_name: 'עגבניות + מלפפון',
            grams: 150,
            role: 'vegetables'
          },
          {
            food_item_id: findFood('לחם')?.id || '',
            food_name: 'לחם מלא',
            grams: 50,
            role: 'carbs'
          },
          {
            food_item_id: findFood('אבוקדו')?.id || '',
            food_name: 'אבוקדו',
            grams: 40,
            role: 'fat'
          }
        ],
        is_active: true,
        sort_order: 7
      },

      // ========== SNACK ==========
      {
        meal_type: 'snack',
        name: 'חטיף קוטג׳ פרי',
        description: 'קוטג׳ + תפוח + אגוזים',
        target_calories_approx: 280,
        foods: [
          {
            food_item_id: findFood('קוטג׳')?.id || '',
            food_name: 'קוטג׳ 5%',
            grams: 150,
            role: 'protein'
          },
          {
            food_item_id: findFood('תפוח')?.id || '',
            food_name: 'תפוח',
            grams: 120,
            role: 'fruit'
          },
          {
            food_item_id: findFood('אגוזי מלך')?.id || '',
            food_name: 'אגוזי מלך',
            grams: 15,
            role: 'fat'
          }
        ],
        is_active: true,
        sort_order: 8
      },
      {
        meal_type: 'snack',
        name: 'חטיף בר חלבון',
        description: 'בר חלבון + בננה',
        target_calories_approx: 320,
        foods: [
          {
            food_item_id: findFood('בר חלבון')?.id || '',
            food_name: 'בר חלבון',
            grams: 60,
            role: 'protein'
          },
          {
            food_item_id: findFood('בננה')?.id || '',
            food_name: 'בננה',
            grams: 120,
            role: 'fruit'
          }
        ],
        is_active: true,
        sort_order: 9
      }
    ];

    // Filter out templates with missing foods
    const validTemplates = templates.filter(t => 
      t.foods.every(f => f.food_item_id && f.food_item_id.length > 0)
    );

    if (validTemplates.length === 0) {
      return Response.json({
        success: false,
        error: 'No valid templates - foods not found in database',
        totalAttempted: templates.length,
        missingFoods: templates.flatMap(t => 
          t.foods.filter(f => !f.food_item_id).map(f => f.food_name)
        )
      }, { status: 400 });
    }

    // Bulk create templates
    const created = await base44.asServiceRole.entities.MealTemplate.bulkCreate(validTemplates);

    console.log('[SEED_TEMPLATES] Created:', created.length);

    return Response.json({
      success: true,
      count: created.length,
      skipped: templates.length - validTemplates.length,
      templates: created.map(t => ({ 
        id: t.id, 
        name: t.name, 
        meal_type: t.meal_type,
        foods_count: t.foods?.length || 0 
      }))
    });

  } catch (err) {
    console.error('[SEED_TEMPLATES] Error:', err);
    return Response.json({ 
      error: err?.message || 'Unknown error',
      stack: err?.stack
    }, { status: 500 });
  }
});