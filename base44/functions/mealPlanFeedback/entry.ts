import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

async function callOpenAI(systemPrompt, userPrompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return JSON.parse(data.choices[0].message.content);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { plan_id, feedback, day_index } = await req.json();

  const plan = await base44.asServiceRole.entities.PersonalMealPlan.get(plan_id);
  if (!plan) return Response.json({ error: 'Plan not found' }, { status: 404 });

  const isWeekly = plan.is_weekly && plan.weekly_days?.length > 0;
  const currentDay = isWeekly ? plan.weekly_days[day_index || 0] : null;
  const currentMeals = isWeekly ? (currentDay?.meals || []) : (plan.meals || []);

  const targetCal = Number(isWeekly ? currentDay?.daily_calories : plan.daily_calories) || 2000;
  const targetProtein = Number(isWeekly ? currentDay?.daily_protein : plan.daily_protein) || 150;
  const targetCarbs = Number(isWeekly ? currentDay?.daily_carbs : plan.daily_carbs) || 200;
  const targetFat = Number(isWeekly ? currentDay?.daily_fat : plan.daily_fat) || 70;

  const systemPrompt = `אתה דיאטן קליני מומחה. קבל תפריט יומי קיים ובקשת שינוי ממשתמש.

**משימתך:**
1. בצע את השינוי המבוקש
2. לאחר השינוי — אזן מחדש את כל הארוחות ביום כך שהסכום הכולל יהיה בדיוק ±5% מהיעדים הבאים:
   - קלוריות: ${targetCal} קק"ל
   - חלבון: ${targetProtein}ג
   - פחמימות: ${targetCarbs}ג
   - שומן: ${targetFat}ג

**כללי איזון:**
- אם נוסף מאכל קלורי → הפחת מאחרים בארוחות אחרות (בעיקר מארוחת הצהריים/ערב)
- אם הוסר מאכל → הגדל/הוסף פריטים בארוחות אחרות
- שמור על 4 ארוחות עם אותם שמות וזמנים
- כמויות מדויקות בגרמים + תיאור מעשי
- ערכים תזונתיים ריאליים (לא להמציא)
- alternatives תמיד []

**פורמט תשובה:**
החזר JSON עם:
- "meals": מערך כל 4 הארוחות המלאות לאחר שינוי + איזון
- "ai_response": משפט קצר בעברית המסביר מה שינית ואיך איזנת`;

  const userPrompt = `תפריט נוכחי:
${JSON.stringify(currentMeals, null, 2)}

בקשת שינוי: ${feedback}

בצע את השינוי ואזן את כל התפריט היומי כך שהסך הכולל יהיה ${targetCal} קק"ל | חלבון ${targetProtein}ג | פחמימות ${targetCarbs}ג | שומן ${targetFat}ג`;

  const result = await callOpenAI(systemPrompt, userPrompt);

  if (!result?.meals) {
    return Response.json({ error: 'AI did not return valid meals' }, { status: 500 });
  }

  const newMeals = result.meals;
  const totals = {
    daily_calories: Math.round(newMeals.reduce((s, m) => s + (m.meal_calories || 0), 0)),
    daily_protein: Math.round(newMeals.reduce((s, m) => s + (m.meal_protein || 0), 0)),
    daily_carbs: Math.round(newMeals.reduce((s, m) => s + (m.meal_carbs || 0), 0)),
    daily_fat: Math.round(newMeals.reduce((s, m) => s + (m.meal_fat || 0), 0)),
  };

  if (isWeekly) {
    const updatedDays = plan.weekly_days.map((d, i) =>
      i === (day_index || 0) ? { ...d, meals: newMeals, ...totals } : d
    );
    await base44.asServiceRole.entities.PersonalMealPlan.update(plan_id, { weekly_days: updatedDays });
  } else {
    await base44.asServiceRole.entities.PersonalMealPlan.update(plan_id, { meals: newMeals, ...totals });
  }

  return Response.json({ success: true, ai_response: result.ai_response, updatedMeals: newMeals, totals });
});