import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { action } = await req.json(); // 'check' or 'clean'

    // Get all food items
    const allItems = await base44.asServiceRole.entities.FoodItem.list();

    let validItems = 0;
    let missingDataItems = [];

    for (const item of allItems) {
      const hasAllMacros = 
        typeof item.per100_kcal === 'number' && item.per100_kcal > 0 &&
        typeof item.per100_protein === 'number' && item.per100_protein >= 0 &&
        typeof item.per100_carbs === 'number' && item.per100_carbs >= 0 &&
        typeof item.per100_fat === 'number' && item.per100_fat >= 0;

      if (hasAllMacros) {
        validItems++;
      } else {
        missingDataItems.push(item);
      }
    }

    // If action is clean, delete invalid items
    if (action === 'clean') {
      for (const item of missingDataItems) {
        // Delete units first
        const units = await base44.asServiceRole.entities.FoodUnit.filter({ 
          food_item_id: item.id 
        });
        for (const unit of units) {
          await base44.asServiceRole.entities.FoodUnit.delete(unit.id);
        }
        
        // Delete item
        await base44.asServiceRole.entities.FoodItem.delete(item.id);
      }

      return Response.json({
        success: true,
        cleaned: missingDataItems.length,
        remaining: validItems
      });
    }

    // Just check
    return Response.json({
      success: true,
      total: allItems.length,
      valid: validItems,
      invalid: missingDataItems.length,
      invalidItems: missingDataItems.map(i => ({
        id: i.id,
        name: i.name_he || i.name,
        barcode: i.barcode,
        missing: {
          kcal: !item.per100_kcal,
          protein: typeof item.per100_protein !== 'number',
          carbs: typeof item.per100_carbs !== 'number',
          fat: typeof item.per100_fat !== 'number'
        }
      }))
    });

  } catch (err) {
    console.error('[CheckFoodQuality] Error:', err);
    return Response.json({ 
      error: err.message,
      success: false 
    }, { status: 500 });
  }
});