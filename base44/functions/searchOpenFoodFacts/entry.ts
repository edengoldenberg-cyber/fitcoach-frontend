import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { barcode } = await req.json();

    if (!barcode || barcode.trim() === '') {
      return Response.json({ error: 'Barcode is required' }, { status: 400 });
    }

    // Try OpenFoodFacts API first (Israeli/International products)
    try {
      const ofResponse = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
      );
      
      if (ofResponse.ok) {
        const ofData = await ofResponse.json();
        
        if (ofData.product) {
          const product = ofData.product;
          
          // Extract nutritional information per 100g
          const nutriments = product.nutriments || {};
          
          return Response.json({
            success: true,
            product: {
              barcode: barcode,
              name: product.product_name || product.generic_name || 'Unknown Product',
              calories: nutriments['energy-kcal'] || nutriments['energy-kcal_100g'] || 0,
              protein: nutriments['proteins'] || nutriments['proteins_100g'] || 0,
              carbs: nutriments['carbohydrates'] || nutriments['carbohydrates_100g'] || 0,
              fat: nutriments['fat'] || nutriments['fat_100g'] || 0,
              serving_weight: product.serving_quantity || 100,
              source: 'OpenFoodFacts',
              image_url: product.image_url || null,
            },
          });
        }
      }
    } catch (e) {
      // Continue to fallback if OpenFoodFacts fails
    }

    // Fallback: Return a message to use AI
    return Response.json({
      success: false,
      message: 'המוצר לא נמצא במאגר. אנא השתמש בתוספת AI כדי להוסיף את המוצר באופן ידני.',
      fallback: true,
    });
  } catch (error) {
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});