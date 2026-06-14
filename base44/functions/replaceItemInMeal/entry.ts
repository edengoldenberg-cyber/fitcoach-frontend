import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { plan_id, meal_index, item_index, action } = await req.json();
  // action: "replace" (get AI alternatives) or "remove" (redistribute calories)

  const planList = await base44.asServiceRole.entities.PersonalMealPlan.filter({ id: plan_id });
  const plan = planList[0];
  if (!plan) return Response.json({ error: 'Plan not found' }, { status: 404 });

  const meal = plan.meals[meal_index];
  const item = meal.items[item_index];

  if (action === 'replace') {
    // Ask AI for brand new alternatives for this specific item within this meal
    const prompt = `
אתה דיאטן קליני מומחה בתזונה ישראלית.
הבא חלופות חדשות ומשתנות לפריט הבא בארוחה.

**הארוחה:** ${meal.meal_name} (${Math.round(meal.meal_calories)} קק"ל)
**הפריט להחלפה:** ${item.food_item} (${item.quantity_description || item.quantity_grams + 'ג'}) - ${Math.round(item.calories)} קק"ל

**כל פריטי הארוחה הנוכחיים (לקונטקסט):**
${meal.items.map(i => `- ${i.food_item}: ${i.quantity_description}`).join('\n')}

דרישות:
1. הצע בדיוק 4 חלופות חדשות לגמרי שונות מהמקוריות
2. כל חלופה חייבת להתאים קלורית לפריט המקורי (±20 קק"ל)
3. מזון ישראלי נפוץ ומוכר בלבד
4. כמויות מדויקות בגרמים ובתיאור מעשי
5. ערכים תזונתיים מדויקים לכל חלופה

החזר JSON בלבד.
`;

    const schema = {
      type: "object",
      properties: {
        alternatives: {
          type: "array",
          items: {
            type: "object",
            properties: {
              food_item: { type: "string" },
              quantity_grams: { type: "number" },
              quantity_description: { type: "string" },
              calories: { type: "number" },
              protein: { type: "number" },
              carbs: { type: "number" },
              fat: { type: "number" }
            }
          }
        }
      }
    };

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: schema,
      model: 'claude_sonnet_4_6'
    });

    const data = result?.response || result;
    return Response.json({ success: true, alternatives: data?.alternatives || [] });

  } else if (action === 'remove') {
    // Remove item and redistribute its calories to the remaining items proportionally
    const removedItem = item;
    const remainingItems = meal.items.filter((_, i) => i !== item_index);

    if (remainingItems.length === 0) {
      return Response.json({ error: 'Cannot remove the only item in a meal' }, { status: 400 });
    }

    const totalRemainingCals = remainingItems.reduce((sum, i) => sum + (i.calories || 0), 0);
    const extraCals = removedItem.calories || 0;

    const updatedItems = remainingItems.map(i => {
      const ratio = totalRemainingCals > 0 ? (i.calories / totalRemainingCals) : (1 / remainingItems.length);
      const bonus = extraCals * ratio;
      // Scale up proportionally
      const scale = (i.calories + bonus) / (i.calories || 1);
      return {
        ...i,
        calories: Math.round((i.calories || 0) + bonus),
        protein: Math.round((i.protein || 0) * scale),
        carbs: Math.round((i.carbs || 0) * scale),
        fat: Math.round((i.fat || 0) * scale),
        quantity_grams: Math.round((i.quantity_grams || 0) * scale),
        quantity_description: i.quantity_description // keep original description
      };
    });

    const updatedMeal = {
      ...meal,
      items: updatedItems,
      meal_calories: updatedItems.reduce((s, i) => s + i.calories, 0),
      meal_protein: updatedItems.reduce((s, i) => s + i.protein, 0),
      meal_carbs: updatedItems.reduce((s, i) => s + i.carbs, 0),
      meal_fat: updatedItems.reduce((s, i) => s + i.fat, 0),
    };

    const updatedMeals = plan.meals.map((m, i) => i === meal_index ? updatedMeal : m);

    await base44.asServiceRole.entities.PersonalMealPlan.update(plan_id, { meals: updatedMeals });

    return Response.json({ success: true, updatedMeal });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
});