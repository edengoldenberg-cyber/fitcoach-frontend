import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const OPENFOODFACTS_API = 'https://world.openfoodfacts.org/cgi/search.pl';
const PAGE_SIZE = 100;
const DELAY_MS = 250;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { targetCount = 1000, jobId } = await req.json();

    // Update job status
    if (jobId) {
      await base44.asServiceRole.entities.ImportJob.update(jobId, {
        status: 'running',
        started_at: new Date().toISOString()
      });
    }

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let currentPage = 1;
    let totalProcessed = 0;

    try {
      while (totalProcessed < targetCount) {
        // Fetch page from Open Food Facts
        const params = new URLSearchParams({
          search_simple: '1',
          json: '1',
          page_size: PAGE_SIZE.toString(),
          page: currentPage.toString(),
          tagtype_0: 'countries',
          tag_contains_0: 'contains',
          tag_0: 'israel',
          fields: 'code,product_name,product_name_he,brands,categories,countries_tags,serving_size,nutriments'
        });

        const url = `${OPENFOODFACTS_API}?${params}`;
        
        let retries = 0;
        let response;
        
        while (retries < 3) {
          try {
            response = await fetch(url);
            if (response.ok) break;
          } catch (err) {
            retries++;
            if (retries >= 3) throw err;
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          }
        }

        const data = await response.json();
        const products = data.products || [];

        if (products.length === 0) {
          break; // No more products
        }

        // Process each product
        for (const product of products) {
          if (totalProcessed >= targetCount) break;

          // Filter: Must have Israel in countries_tags
          if (!product.countries_tags?.includes('en:israel')) {
            skippedCount++;
            continue;
          }

          // Filter: Must have required nutriments
          const nutriments = product.nutriments || {};
          if (!nutriments['energy-kcal_100g'] || 
              nutriments['proteins_100g'] === undefined ||
              nutriments['carbohydrates_100g'] === undefined ||
              nutriments['fat_100g'] === undefined) {
            skippedCount++;
            continue;
          }

          // Extract serving grams
          let servingGrams = null;
          if (product.serving_size) {
            const match = product.serving_size.match(/(\d+)\s*g/i);
            if (match) {
              servingGrams = parseFloat(match[1]);
            }
          }

          const barcode = product.code || null;
          const isBarcode729 = barcode?.startsWith('729') || false;

          const foodData = {
            barcode,
            name: product.product_name || 'Unknown',
            name_he: product.product_name_he || null,
            brand: product.brands || null,
            categories: product.categories || null,
            source: 'openfoodfacts',
            per100_kcal: Math.round(nutriments['energy-kcal_100g']),
            per100_protein: Math.round(nutriments['proteins_100g'] * 10) / 10,
            per100_carbs: Math.round(nutriments['carbohydrates_100g'] * 10) / 10,
            per100_fat: Math.round(nutriments['fat_100g'] * 10) / 10,
            serving_grams: servingGrams,
            country_israel: true,
            is_barcode_729: isBarcode729,
            last_synced_at: new Date().toISOString()
          };

          // Upsert: Check if exists by barcode
          let foodItem;
          if (barcode) {
            const existing = await base44.asServiceRole.entities.FoodItem.filter({ barcode });
            if (existing.length > 0) {
              await base44.asServiceRole.entities.FoodItem.update(existing[0].id, foodData);
              foodItem = { ...existing[0], ...foodData };
              updatedCount++;
            } else {
              foodItem = await base44.asServiceRole.entities.FoodItem.create(foodData);
              importedCount++;
            }
          } else {
            // No barcode - check by name
            const existing = await base44.asServiceRole.entities.FoodItem.filter({ 
              name: foodData.name,
              brand: foodData.brand 
            });
            if (existing.length > 0) {
              await base44.asServiceRole.entities.FoodItem.update(existing[0].id, foodData);
              foodItem = { ...existing[0], ...foodData };
              updatedCount++;
            } else {
              foodItem = await base44.asServiceRole.entities.FoodItem.create(foodData);
              importedCount++;
            }
          }

          // Create units
          await createUnitsForFood(base44, foodItem, product);

          totalProcessed++;
        }

        // Update job progress
        if (jobId) {
          await base44.asServiceRole.entities.ImportJob.update(jobId, {
            imported_count: importedCount,
            updated_count: updatedCount,
            skipped_count: skippedCount,
            current_page: currentPage
          });
        }

        currentPage++;
        
        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }

      // Job completed successfully
      if (jobId) {
        await base44.asServiceRole.entities.ImportJob.update(jobId, {
          status: 'success',
          imported_count: importedCount,
          updated_count: updatedCount,
          skipped_count: skippedCount,
          finished_at: new Date().toISOString()
        });
      }

      return Response.json({
        success: true,
        imported: importedCount,
        updated: updatedCount,
        skipped: skippedCount,
        total: totalProcessed
      });

    } catch (err) {
      console.error('[ImportIsraeliFoods] Error:', err);
      
      if (jobId) {
        await base44.asServiceRole.entities.ImportJob.update(jobId, {
          status: 'failed',
          last_error: err.message,
          finished_at: new Date().toISOString()
        });
      }

      throw err;
    }

  } catch (err) {
    console.error('[ImportIsraeliFoods] Error:', err);
    return Response.json({ 
      error: err.message,
      success: false 
    }, { status: 500 });
  }
});

async function createUnitsForFood(base44, foodItem, product) {
  // Delete existing units
  const existingUnits = await base44.asServiceRole.entities.FoodUnit.filter({ 
    food_item_id: foodItem.id 
  });
  for (const unit of existingUnits) {
    await base44.asServiceRole.entities.FoodUnit.delete(unit.id);
  }

  const units = [];
  const text = `${product.product_name || ''} ${product.product_name_he || ''} ${product.categories || ''}`.toLowerCase();

  // ALWAYS: 100 גרם (default) + גרם (for direct input)
  units.push({
    food_item_id: foodItem.id,
    unit_name: '100 גרם',
    grams_per_unit: 100,
    is_default: true
  });

  units.push({
    food_item_id: foodItem.id,
    unit_name: 'גרם',
    grams_per_unit: 1,
    is_default: false
  });

  // If serving_grams exists
  if (foodItem.serving_grams && foodItem.serving_grams > 0) {
    units.push({
      food_item_id: foodItem.id,
      unit_name: 'מנה',
      grams_per_unit: foodItem.serving_grams,
      is_default: false
    });
  }

  // Category-based units
  const spreadsKeywords = ['חומוס', 'טחינה', 'מיונז', 'ממרח', 'hummus', 'tahini', 'spread', 'pesto', 'פסטו'];
  const isSpreads = spreadsKeywords.some(k => text.includes(k));

  const liquidKeywords = ['חלב', 'משקה', 'juice', 'drink', 'milk', 'water', 'מים', 'יוגורט', 'שייק', 'smoothie'];
  const isLiquid = liquidKeywords.some(k => text.includes(k));

  const cheeseKeywords = ['גבינה צהובה', 'cheese slice', 'גבינת עמק'];
  const isCheese = cheeseKeywords.some(k => text.includes(k));

  const breadKeywords = ['לחם', 'bread', 'פרוסת'];
  const isBread = breadKeywords.some(k => text.includes(k));

  // Add כף/כפית for spreads or general
  if (isSpreads) {
    units.push({
      food_item_id: foodItem.id,
      unit_name: 'כף',
      grams_per_unit: 15,
      is_default: false
    });
    units.push({
      food_item_id: foodItem.id,
      unit_name: 'כפית',
      grams_per_unit: 5,
      is_default: false
    });
  }

  // Add כוס for liquids
  if (isLiquid) {
    units.push({
      food_item_id: foodItem.id,
      unit_name: 'כוס',
      grams_per_unit: 240,
      is_default: false
    });
  }

  // Add פרוסה for cheese/bread
  if (isCheese) {
    units.push({
      food_item_id: foodItem.id,
      unit_name: 'פרוסה',
      grams_per_unit: 25,
      is_default: false
    });
  }

  if (isBread) {
    units.push({
      food_item_id: foodItem.id,
      unit_name: 'פרוסה',
      grams_per_unit: 30,
      is_default: false
    });
  }

  // Create all units
  for (const unitData of units) {
    await base44.asServiceRole.entities.FoodUnit.create(unitData);
  }
}