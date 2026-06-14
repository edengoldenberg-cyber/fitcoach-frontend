import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { recipeId } = await req.json();

    if (!recipeId) {
      return Response.json({ error: 'recipeId is required' }, { status: 400 });
    }

    // Fetch the recipe
    const recipe = await base44.asServiceRole.entities.Recipe.get(recipeId);
    if (!recipe) {
      return Response.json({ error: 'Recipe not found' }, { status: 404 });
    }

    // Build ingredients string for AI
    const ingredientsText = recipe.ingredients
      .map(ing => `${ing.quantity} ${ing.unit} ${ing.name}`)
      .join('\n');

    // Analyze ingredients with AI
    const nutritionAnalysis = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a nutritional expert. Analyze the following recipe ingredients and calculate the nutritional values.

Recipe Title: ${recipe.title}
Recipe Description: ${recipe.description}

Ingredients:
${ingredientsText}

Please provide:
1. Total nutritional values (calories, protein in grams, carbs in grams, fat in grams)
2. Estimated number of servings
3. Per-serving nutritional values
4. A brief Hebrew summary of the nutritional profile

Return ONLY a valid JSON object with this structure (no markdown, no extra text):
{
  "total_calories": number,
  "total_protein": number,
  "total_carbs": number,
  "total_fat": number,
  "servings": number,
  "per_serving_calories": number,
  "per_serving_protein": number,
  "per_serving_carbs": number,
  "per_serving_fat": number,
  "summary": "Hebrew text summary"
}`,
      response_json_schema: {
        type: 'object',
        properties: {
          total_calories: { type: 'number' },
          total_protein: { type: 'number' },
          total_carbs: { type: 'number' },
          total_fat: { type: 'number' },
          servings: { type: 'number' },
          per_serving_calories: { type: 'number' },
          per_serving_protein: { type: 'number' },
          per_serving_carbs: { type: 'number' },
          per_serving_fat: { type: 'number' },
          summary: { type: 'string' }
        },
        required: ['total_calories', 'total_protein', 'total_carbs', 'total_fat', 'servings']
      }
    });

    // Generate image if not provided
    let imageUrl = recipe.image_url;
    if (!imageUrl) {
      const generatedImage = await base44.integrations.Core.GenerateImage({
        prompt: `Create an appetizing and professional-looking food photography image of a dish called "${recipe.title}". The dish contains: ${ingredientsText.replace(/\n/g, ', ')}. Make it look delicious, well-plated, and ready to eat. High resolution, professional lighting.`
      });
      imageUrl = generatedImage.url;
    }

    // Update recipe with AI analysis results
    await base44.asServiceRole.entities.Recipe.update(recipeId, {
      nutritional_report: nutritionAnalysis,
      image_url: imageUrl,
      status: 'published'
    });

    return Response.json({
      success: true,
      nutritional_report: nutritionAnalysis,
      image_url: imageUrl
    });
  } catch (error) {
    console.error('Error analyzing recipe:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});