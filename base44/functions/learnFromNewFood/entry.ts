import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { foodItemId } = await req.json();

    if (!foodItemId) {
      return Response.json({ error: 'Missing foodItemId' }, { status: 400 });
    }

    // Fetch the newly created FoodItem
    const allFoods = await base44.asServiceRole.entities.FoodItem.list();
    const food = allFoods.find(f => f.id === foodItemId);

    if (!food) {
      console.log(`[learnFromNewFood] Food item ${foodItemId} not found`);
      return Response.json({ success: false, message: 'Food item not found' }, { status: 404 });
    }

    console.log(`[learnFromNewFood] Learning from: ${food.name_he}`);

    // Prepare data for AI learning
    const fileUrls = food.image_url ? [food.image_url] : null;

    const prompt = `You are a nutrition AI learning system. A new food product has been added to our database. Please analyze and enrich the following product information:

Product Name (Hebrew): ${food.name_he}
Product Name (English): ${food.name || ''}
Brand: ${food.brand || 'Generic'}
Category: ${food.category}

Nutritional Values (per 100g):
- Calories: ${food.per100_kcal} kcal
- Protein: ${food.per100_protein}g
- Carbs: ${food.per100_carbs}g
- Fat: ${food.per100_fat}g

${fileUrls ? `A product image has been provided for visual analysis.` : 'No product image available.'}

Please provide:
1. Validation: Are the nutritional values realistic for this product? Any red flags?
2. Category Suggestions: Is the current category appropriate?
3. Meal Tags: Which meals is this suitable for? (breakfast/lunch/dinner/snack)
4. Nutritional Role: Primary role (protein/carbs/fat/free-vegetable/treat)?
5. Similar Products: What similar products exist?
6. Quality Score: Rate data quality 1-5
7. Learning Notes: Key patterns for AI to remember about this product type

Respond in Hebrew.`;

    const aiResponse = await base44.integrations.Core.InvokeLLM({
      prompt,
      file_urls: fileUrls,
      model: 'gemini_3_flash', // Supports vision + fast response
    });

    console.log(`[learnFromNewFood] AI Analysis:\n${aiResponse}`);

    // Optionally, update the FoodItem with AI insights (stored as notes)
    // This preserves the learning for future reference
    const updatedFood = await base44.asServiceRole.entities.FoodItem.update(foodItemId, {
      ai_learning_notes: aiResponse,
      learned_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      foodId: foodItemId,
      foodName: food.name_he,
      aiLearning: aiResponse,
    });
  } catch (error) {
    console.error('[learnFromNewFood] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});