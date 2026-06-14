import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function cleanJson(content = '') {
  return String(content).replace(/```json\n?|\n?```/g, '').trim();
}

function fallbackEstimate(name, grams) {
  const text = String(name || '').toLowerCase();
  const table = [
    { match: 'מגנום', kcal: 320, protein: 4, carbs: 30, fat: 21 },
    { match: 'ארטיק', kcal: 320, protein: 4, carbs: 30, fat: 21 },
    { match: 'גלידה', kcal: 320, protein: 4, carbs: 30, fat: 21 },
    { match: 'קפה', kcal: 2, protein: 0.1, carbs: 0, fat: 0 },
    { match: 'חלב', kcal: 60, protein: 3.2, carbs: 4.8, fat: 3 },
    { match: 'שיבולת', kcal: 380, protein: 13, carbs: 67, fat: 7 },
    { match: 'ביצה', kcal: 155, protein: 13, carbs: 1, fat: 11 },
    { match: 'לחם', kcal: 250, protein: 8, carbs: 48, fat: 2 },
    { match: 'גבינה', kcal: 250, protein: 18, carbs: 4, fat: 18 },
    { match: 'מאפה', kcal: 330, protein: 8, carbs: 45, fat: 13 }
  ];
  const base = table.find(row => text.includes(row.match)) || { kcal: 180, protein: 6, carbs: 22, fat: 6 };
  const factor = grams / 100;
  return {
    calories: Math.round(base.kcal * factor),
    protein: Math.round(base.protein * factor * 10) / 10,
    carbs: Math.round(base.carbs * factor * 10) / 10,
    fat: Math.round(base.fat * factor * 10) / 10,
    per100_kcal: base.kcal,
    per100_protein: base.protein,
    per100_carbs: base.carbs,
    per100_fat: base.fat,
    confidence_note: 'fallback estimate'
  };
}

function parseExplicitTotalCalories(correctionNote = '') {
  const text = String(correctionNote || '').toLowerCase();
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:קלוריות|קלורי|קלו|קל׳|קק"ל|kcal|cal)/i);
  if (!match) return 0;
  const calories = Number(match[1].replace(',', '.'));
  return Number.isFinite(calories) && calories > 0 ? calories : 0;
}

function buildExplicitCaloriesResult(item, itemName, grams, calories) {
  const currentCalories = Number(item.calories || 0);
  const scale = currentCalories > 0 ? calories / currentCalories : 0;
  const fallback = fallbackEstimate(itemName, grams);
  const protein = scale > 0 ? Number(item.protein || 0) * scale : fallback.protein;
  const carbs = scale > 0 ? Number(item.carbs || 0) * scale : fallback.carbs;
  const fat = scale > 0 ? Number(item.fat || 0) * scale : fallback.fat;
  return {
    name: itemName,
    calories,
    protein: Math.max(0, protein),
    carbs: Math.max(0, carbs),
    fat: Math.max(0, fat),
    per100_kcal: grams > 0 ? Math.round((calories / grams) * 100) : 0,
    per100_protein: grams > 0 ? Math.round((Math.max(0, protein) / grams) * 1000) / 10 : 0,
    per100_carbs: grams > 0 ? Math.round((Math.max(0, carbs) / grams) * 1000) / 10 : 0,
    per100_fat: grams > 0 ? Math.round((Math.max(0, fat) / grams) * 1000) / 10 : 0,
    confidence: 'high',
    confidence_note: 'עודכן לפי קלוריות שהוזנו ידנית'
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const item = body.item || {};
    const itemName = String(body.item_name || item.name || item.food_name || '').trim();
    const correctionNote = String(body.correction_note || '').trim();
    const correctionGramsMatch = correctionNote.match(/(\d+(?:[.,]\d+)?)\s*(?:גרם|ג׳|גר'|gram|grams|g)/i);
    const correctedGrams = correctionGramsMatch ? Number(correctionGramsMatch[1].replace(',', '.')) : 0;
    const grams = correctedGrams > 0 ? correctedGrams : (Number(body.grams || item.quantity_grams || item.estimated_grams || 100) || 100);

    if (!itemName) {
      return Response.json({ error: 'item_name required' }, { status: 400 });
    }

    const explicitCalories = parseExplicitTotalCalories(correctionNote);
    if (explicitCalories > 0) {
      const parsed = buildExplicitCaloriesResult(item, itemName, grams, explicitCalories);
      return Response.json({
        name: parsed.name || itemName,
        food_name: parsed.name || itemName,
        quantity_grams: grams,
        estimated_grams: grams,
        quantity_display: `${grams} גרם`,
        calories: Math.round(Number(parsed.calories || 0)),
        protein: Math.round(Number(parsed.protein || 0) * 10) / 10,
        carbs: Math.round(Number(parsed.carbs || 0) * 10) / 10,
        fat: Math.round(Number(parsed.fat || 0) * 10) / 10,
        confidence: 'high',
        nutrition_source: 'manual_ai_correction',
        source_text_segment: parsed.confidence_note,
        per100_kcal: parsed.per100_kcal || 0,
        per100_protein: parsed.per100_protein || 0,
        per100_carbs: parsed.per100_carbs || 0,
        per100_fat: parsed.per100_fat || 0
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 350,
        messages: [
          {
            role: 'system',
            content: 'You are a precise Israeli nutrition expert. Return ONLY valid JSON. No markdown, no explanation.'
          },
          {
            role: 'user',
            content: `Analyze this SINGLE food item only. Do not analyze the whole meal.\nFood item: "${itemName}"\nAmount: ${grams} grams\nUser correction/context: "${correctionNote}"\n\nImportant: Magnum / מגנום is an ice cream bar, not pastry.\n\nReturn values for exactly ${grams} grams only:\n{"name":"Hebrew food name","quantity_grams":${grams},"quantity_display":"${grams} גרם","calories":0,"protein":0,"carbs":0,"fat":0,"per100_kcal":0,"per100_protein":0,"per100_carbs":0,"per100_fat":0,"confidence":"high|medium|low","confidence_note":"short Hebrew note"}`
          }
        ]
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    let parsed;

    if (content) {
      parsed = JSON.parse(cleanJson(content));
    } else {
      parsed = fallbackEstimate(itemName, grams);
    }

    return Response.json({
      name: parsed.name || itemName,
      food_name: parsed.name || itemName,
      quantity_grams: grams,
      estimated_grams: grams,
      quantity_display: parsed.quantity_display || `${grams} גרם`,
      calories: Math.round(Number(parsed.calories || 0)),
      protein: Math.round(Number(parsed.protein || 0) * 10) / 10,
      carbs: Math.round(Number(parsed.carbs || 0) * 10) / 10,
      fat: Math.round(Number(parsed.fat || 0) * 10) / 10,
      confidence: parsed.confidence || 'medium',
      nutrition_source: 'single_item_ai_reanalysis',
      source_text_segment: parsed.confidence_note || 'נותח מחדש כפריט בודד',
      per100_kcal: parsed.per100_kcal || 0,
      per100_protein: parsed.per100_protein || 0,
      per100_carbs: parsed.per100_carbs || 0,
      per100_fat: parsed.per100_fat || 0
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});