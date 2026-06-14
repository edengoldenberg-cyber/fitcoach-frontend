import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    console.log('🌱 [SEED_START]', { timestamp: new Date().toISOString() });
    
    const base44 = createClientFromRequest(req);
    
    // NO ADMIN CHECK - Allow all users to auto-seed templates

    // Define 30 breakfast templates
    const breakfastTemplates = [
      {
        meal_type: 'breakfast',
        name: 'Protein Power',
        description: 'גבוה חלבון, מאוזן פחמימות',
        sort_order: 1,
        roles: [
          { role: 'protein', min_grams: 30, max_grams: 50, target_percent_calories: 0.40, allowed_categories: ['חלבון', 'פחמימה'] },
          { role: 'carbs', min_grams: 30, max_grams: 50, target_percent_calories: 0.40, allowed_categories: ['פחמימה', 'דגנים'] },
          { role: 'fat', min_grams: 10, max_grams: 20, target_percent_calories: 0.20, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'breakfast',
        name: 'Carb Loading',
        description: 'פחמימות גבוהות, חלבון מתוך',
        sort_order: 2,
        roles: [
          { role: 'protein', min_grams: 20, max_grams: 35, target_percent_calories: 0.25, allowed_categories: ['חלבון'] },
          { role: 'carbs', min_grams: 50, max_grams: 80, target_percent_calories: 0.60, allowed_categories: ['דגנים', 'פחמימה'] },
          { role: 'vegetables', min_grams: 20, max_grams: 40, target_percent_calories: 0.10, allowed_categories: ['ירקות'] },
          { role: 'fat', min_grams: 5, max_grams: 15, target_percent_calories: 0.05, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'breakfast',
        name: 'Balanced Classic',
        description: 'מאוזן - חלבון, פחמימות, שומן',
        sort_order: 3,
        roles: [
          { role: 'protein', min_grams: 25, max_grams: 40, target_percent_calories: 0.30, allowed_categories: ['חלבון'] },
          { role: 'carbs', min_grams: 30, max_grams: 60, target_percent_calories: 0.45, allowed_categories: ['דגנים', 'פחמימה'] },
          { role: 'vegetables', min_grams: 15, max_grams: 30, target_percent_calories: 0.05, allowed_categories: ['ירקות'] },
          { role: 'fat', min_grams: 10, max_grams: 20, target_percent_calories: 0.20, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'breakfast',
        name: 'Keto Start',
        description: 'גבוה שומן, נמוך פחמימות',
        sort_order: 4,
        roles: [
          { role: 'protein', min_grams: 30, max_grams: 50, target_percent_calories: 0.35, allowed_categories: ['חלבון'] },
          { role: 'vegetables', min_grams: 30, max_grams: 50, target_percent_calories: 0.20, allowed_categories: ['ירקות'] },
          { role: 'fat', min_grams: 20, max_grams: 35, target_percent_calories: 0.45, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'breakfast',
        name: 'Light & Lean',
        description: 'נמוך שומן, גבוה פחמימות',
        sort_order: 5,
        roles: [
          { role: 'protein', min_grams: 25, max_grams: 40, target_percent_calories: 0.35, allowed_categories: ['חלבון'] },
          { role: 'carbs', min_grams: 45, max_grams: 70, target_percent_calories: 0.55, allowed_categories: ['דגנים', 'פחמימה'] },
          { role: 'vegetables', min_grams: 20, max_grams: 35, target_percent_calories: 0.10, allowed_categories: ['ירקות'] }
        ]
      },
      {
        meal_type: 'breakfast',
        name: 'Veggie Loaded',
        description: 'ירקות אתחזוקה, חלבון גבוה',
        sort_order: 6,
        roles: [
          { role: 'protein', min_grams: 28, max_grams: 45, target_percent_calories: 0.35, allowed_categories: ['חלבון'] },
          { role: 'vegetables', min_grams: 40, max_grams: 70, target_percent_calories: 0.25, allowed_categories: ['ירקות'] },
          { role: 'carbs', min_grams: 20, max_grams: 40, target_percent_calories: 0.30, allowed_categories: ['דגנים'] },
          { role: 'fat', min_grams: 8, max_grams: 15, target_percent_calories: 0.10, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'breakfast',
        name: 'Mediterranean',
        description: 'אתיופיה, שמן זית, ירקות',
        sort_order: 7,
        roles: [
          { role: 'protein', min_grams: 22, max_grams: 38, target_percent_calories: 0.28, allowed_categories: ['חלבון'] },
          { role: 'vegetables', min_grams: 35, max_grams: 60, target_percent_calories: 0.22, allowed_categories: ['ירקות'] },
          { role: 'carbs', min_grams: 28, max_grams: 50, target_percent_calories: 0.35, allowed_categories: ['דגנים'] },
          { role: 'fat', min_grams: 12, max_grams: 22, target_percent_calories: 0.15, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'breakfast',
        name: 'Green Bowl',
        description: 'ירקות, חלבון, דגנים',
        sort_order: 8,
        roles: [
          { role: 'vegetables', min_grams: 50, max_grams: 80, target_percent_calories: 0.30, allowed_categories: ['ירקות'] },
          { role: 'protein', min_grams: 24, max_grams: 40, target_percent_calories: 0.32, allowed_categories: ['חלבון'] },
          { role: 'carbs', min_grams: 30, max_grams: 55, target_percent_calories: 0.32, allowed_categories: ['דגנים'] },
          { role: 'fat', min_grams: 8, max_grams: 16, target_percent_calories: 0.06, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'breakfast',
        name: 'Fruit & Dairy',
        description: 'תירס, ירקות, מוצרי חלב',
        sort_order: 9,
        roles: [
          { role: 'protein', min_grams: 20, max_grams: 35, target_percent_calories: 0.28, allowed_categories: ['חלבון', 'פחמימה'] },
          { role: 'carbs', min_grams: 40, max_grams: 65, target_percent_calories: 0.50, allowed_categories: ['דגנים', 'פירות'] },
          { role: 'vegetables', min_grams: 15, max_grams: 30, target_percent_calories: 0.10, allowed_categories: ['ירקות'] },
          { role: 'fat', min_grams: 8, max_grams: 15, target_percent_calories: 0.12, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'breakfast',
        name: 'Super Protein',
        description: 'חלבון גבוה ביותר',
        sort_order: 10,
        roles: [
          { role: 'protein', min_grams: 40, max_grams: 65, target_percent_calories: 0.50, allowed_categories: ['חלבון'] },
          { role: 'carbs', min_grams: 25, max_grams: 45, target_percent_calories: 0.35, allowed_categories: ['דגנים'] },
          { role: 'fat', min_grams: 8, max_grams: 18, target_percent_calories: 0.15, allowed_categories: ['שומן'] }
        ]
      }
    ];

    // Duplicate to create 30 variations (3 sets)
    const breakfast = [];
    for (let i = 0; i < 3; i++) {
      breakfastTemplates.forEach((t, idx) => {
        breakfast.push({
          ...t,
          name: `${t.name} ${String.fromCharCode(97 + i)}`,
          sort_order: idx + 1 + i * 10
        });
      });
    }

    // Define 30 dinner templates
    const dinnerTemplates = [
      {
        meal_type: 'dinner',
        name: 'Grilled Protein',
        description: 'בשר צלוי, ירקות, דגנים',
        sort_order: 1,
        roles: [
          { role: 'protein', min_grams: 40, max_grams: 70, target_percent_calories: 0.40, allowed_categories: ['חלבון'] },
          { role: 'vegetables', min_grams: 40, max_grams: 70, target_percent_calories: 0.25, allowed_categories: ['ירקות'] },
          { role: 'carbs', min_grams: 30, max_grams: 55, target_percent_calories: 0.25, allowed_categories: ['דגנים'] },
          { role: 'fat', min_grams: 10, max_grams: 20, target_percent_calories: 0.10, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'dinner',
        name: 'Fish & Veg',
        description: 'דגים, ירקות, שומן בריא',
        sort_order: 2,
        roles: [
          { role: 'protein', min_grams: 35, max_grams: 60, target_percent_calories: 0.38, allowed_categories: ['חלבון'] },
          { role: 'vegetables', min_grams: 45, max_grams: 75, target_percent_calories: 0.28, allowed_categories: ['ירקות'] },
          { role: 'carbs', min_grams: 25, max_grams: 50, target_percent_calories: 0.20, allowed_categories: ['דגנים'] },
          { role: 'fat', min_grams: 12, max_grams: 25, target_percent_calories: 0.14, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'dinner',
        name: 'Balanced Plate',
        description: 'מאוזן - חלבון, פחמימות, ירקות',
        sort_order: 3,
        roles: [
          { role: 'protein', min_grams: 35, max_grams: 55, target_percent_calories: 0.33, allowed_categories: ['חלבון'] },
          { role: 'carbs', min_grams: 40, max_grams: 65, target_percent_calories: 0.40, allowed_categories: ['דגנים'] },
          { role: 'vegetables', min_grams: 50, max_grams: 80, target_percent_calories: 0.20, allowed_categories: ['ירקות'] },
          { role: 'fat', min_grams: 10, max_grams: 18, target_percent_calories: 0.07, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'dinner',
        name: 'Veggie Heavy',
        description: 'ירקות בריאים, חלבון, מינימום שומן',
        sort_order: 4,
        roles: [
          { role: 'vegetables', min_grams: 60, max_grams: 100, target_percent_calories: 0.35, allowed_categories: ['ירקות'] },
          { role: 'protein', min_grams: 32, max_grams: 50, target_percent_calories: 0.35, allowed_categories: ['חלבון'] },
          { role: 'carbs', min_grams: 25, max_grams: 45, target_percent_calories: 0.25, allowed_categories: ['דגנים'] },
          { role: 'fat', min_grams: 6, max_grams: 12, target_percent_calories: 0.05, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'dinner',
        name: 'Lean & Mean',
        description: 'חלבון גבוה, שומן נמוך',
        sort_order: 5,
        roles: [
          { role: 'protein', min_grams: 45, max_grams: 70, target_percent_calories: 0.45, allowed_categories: ['חלבון'] },
          { role: 'vegetables', min_grams: 40, max_grams: 70, target_percent_calories: 0.30, allowed_categories: ['ירקות'] },
          { role: 'carbs', min_grams: 20, max_grams: 40, target_percent_calories: 0.20, allowed_categories: ['דגנים'] }
        ]
      },
      {
        meal_type: 'dinner',
        name: 'Stew Style',
        description: 'תוספת, בשר, ירקות מבושלים',
        sort_order: 6,
        roles: [
          { role: 'protein', min_grams: 38, max_grams: 60, target_percent_calories: 0.36, allowed_categories: ['חלבון'] },
          { role: 'vegetables', min_grams: 55, max_grams: 85, target_percent_calories: 0.30, allowed_categories: ['ירקות'] },
          { role: 'carbs', min_grams: 35, max_grams: 60, target_percent_calories: 0.28, allowed_categories: ['דגנים'] },
          { role: 'fat', min_grams: 8, max_grams: 16, target_percent_calories: 0.06, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'dinner',
        name: 'Curry Night',
        description: 'תבלינים, דגנים, חלבון',
        sort_order: 7,
        roles: [
          { role: 'protein', min_grams: 32, max_grams: 50, target_percent_calories: 0.32, allowed_categories: ['חלבון'] },
          { role: 'carbs', min_grams: 45, max_grams: 70, target_percent_calories: 0.42, allowed_categories: ['דגנים'] },
          { role: 'vegetables', min_grams: 45, max_grams: 75, target_percent_calories: 0.20, allowed_categories: ['ירקות'] },
          { role: 'fat', min_grams: 10, max_grams: 18, target_percent_calories: 0.06, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'dinner',
        name: 'Salmon Special',
        description: 'סלמון, ירקות, שומן אומגה',
        sort_order: 8,
        roles: [
          { role: 'protein', min_grams: 40, max_grams: 65, target_percent_calories: 0.40, allowed_categories: ['חלבון'] },
          { role: 'vegetables', min_grams: 50, max_grams: 80, target_percent_calories: 0.25, allowed_categories: ['ירקות'] },
          { role: 'carbs', min_grams: 30, max_grams: 55, target_percent_calories: 0.25, allowed_categories: ['דגנים'] },
          { role: 'fat', min_grams: 12, max_grams: 22, target_percent_calories: 0.10, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'dinner',
        name: 'Pasta Night',
        description: 'פסטה מלא, בשר, ירקות',
        sort_order: 9,
        roles: [
          { role: 'carbs', min_grams: 55, max_grams: 85, target_percent_calories: 0.50, allowed_categories: ['דגנים'] },
          { role: 'protein', min_grams: 28, max_grams: 45, target_percent_calories: 0.28, allowed_categories: ['חלבון'] },
          { role: 'vegetables', min_grams: 35, max_grams: 60, target_percent_calories: 0.15, allowed_categories: ['ירקות'] },
          { role: 'fat', min_grams: 8, max_grams: 16, target_percent_calories: 0.07, allowed_categories: ['שומן'] }
        ]
      },
      {
        meal_type: 'dinner',
        name: 'Asian Fusion',
        description: 'אורז, ירקות מטוגנות, חלבון',
        sort_order: 10,
        roles: [
          { role: 'carbs', min_grams: 50, max_grams: 80, target_percent_calories: 0.48, allowed_categories: ['דגנים'] },
          { role: 'protein', min_grams: 32, max_grams: 50, target_percent_calories: 0.30, allowed_categories: ['חלבון'] },
          { role: 'vegetables', min_grams: 40, max_grams: 65, target_percent_calories: 0.15, allowed_categories: ['ירקות'] },
          { role: 'fat', min_grams: 10, max_grams: 18, target_percent_calories: 0.07, allowed_categories: ['שומן'] }
        ]
      }
    ];

    // Duplicate to create 30 variations
    const dinner = [];
    for (let i = 0; i < 3; i++) {
      dinnerTemplates.forEach((t, idx) => {
        dinner.push({
          ...t,
          name: `${t.name} ${String.fromCharCode(97 + i)}`,
          sort_order: idx + 1 + i * 10
        });
      });
    }

    // Combine all templates
    const allTemplates = [...breakfast, ...dinner];
    console.log('📦 TOTAL_TEMPLATES_TO_CREATE:', allTemplates.length);

    // Check if templates already exist
    const existing = await base44.asServiceRole.entities.MealTemplate.list();
    console.log('🔍 [SEED_CHECK_EXISTING]', {
      count: existing?.length || 0,
      isArray: Array.isArray(existing),
      activeCount: existing?.filter(t => t.is_active).length || 0
    });
    
    if (existing.length > 0) {
      console.log('✅ [SEED_SKIP] Templates already exist');
      return Response.json({
        success: true,
        created: 0,
        existing: existing.length,
        message: `Templates already exist (${existing.length} templates)`
      });
    }

    // Create all templates using service role (no user context required)
    console.log('📦 [SEED_BULK_CREATE_START]', { count: allTemplates.length });
    console.log('📋 [SEED_TEMPLATES_SAMPLE]', JSON.stringify(allTemplates.slice(0, 2), null, 2));
    
    try {
      const created = await base44.asServiceRole.entities.MealTemplate.bulkCreate(allTemplates);
      console.log('✅ [SEED_BULK_CREATE_DONE]', {
        requested: allTemplates.length,
        created: created?.length || 0,
        isArray: Array.isArray(created),
        sample: created?.[0] ? { id: created[0].id, name: created[0].name, is_active: created[0].is_active } : null
      });
      
      // Immediate verification
      const verification = await base44.asServiceRole.entities.MealTemplate.list();
      console.log('🔍 [SEED_VERIFY_SERVICE_ROLE]', {
        count: verification?.length || 0,
        isArray: Array.isArray(verification),
        activeCount: verification?.filter(t => t.is_active).length || 0
      });
      
      // Also test user-scoped read
      const userRead = await base44.entities.MealTemplate.list();
      console.log('🔍 [SEED_VERIFY_USER_SCOPE]', {
        count: userRead?.length || 0,
        isArray: Array.isArray(userRead),
        activeCount: userRead?.filter(t => t.is_active).length || 0
      });

      const elapsed = Date.now() - startTime;
      console.log('✅ [SEED_COMPLETE]', {
        elapsed,
        created: created?.length || 0,
        verified_service: verification?.length || 0,
        verified_user: userRead?.length || 0
      });

      return Response.json({
        success: true,
        created: created?.length || 0,
        verifiedServiceRole: verification?.length || 0,
        verifiedUserScope: userRead?.length || 0,
        elapsed,
        message: `Created ${created?.length || 0} templates (verified: ${verification?.length || 0}, user-readable: ${userRead?.length || 0})`
      });
    } catch (saveErr) {
      console.error('❌ [SEED_ERROR]', {
        message: saveErr?.message,
        stack: saveErr?.stack?.split('\n').slice(0, 3)
      });
      return Response.json({ 
        success: false, 
        error: saveErr.message,
        stack: saveErr.stack 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ [SEED_OUTER_ERROR]', {
      message: error?.message,
      stack: error?.stack?.split('\n').slice(0, 3)
    });
    return Response.json({ error: error.message }, { status: 500 });
  }
});