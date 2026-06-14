import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { prompt } = await req.json();

        if (!prompt) {
            return Response.json({ error: 'Prompt is required' }, { status: 400 });
        }

        let nutritionMemoryContext = '';
        try {
            const trainees = await base44.entities.Trainee.filter({ user_email: user.email });
            const trainee = trainees?.[0] || null;
            const profileRows = await base44.entities.TraineeNutritionProfile.filter({ trainee_email: user.email });
            const profile = profileRows?.[0] || null;
            const personalFoods = trainee?.id ? await base44.entities.UserFoodItem.filter({ trainee_id: trainee.id, visibility: 'personal', active: true }) : [];
            const coachFoods = trainee?.coach_email ? await base44.entities.UserFoodItem.filter({ coach_email: trainee.coach_email, visibility: 'coach', active: true }) : [];
            const foodLines = [...personalFoods, ...coachFoods]
                .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
                .slice(0, 15)
                .map(item => `${item.food_name} (${item.visibility}, ${item.usage_count || 0} שימושים)`);
            nutritionMemoryContext = `\nזיכרון תזונתי אישי:\nמזונות מועדפים: ${(profile?.favorite_foods || []).slice(0, 10).map(item => item.food_name).join(', ')}\nדפוסי בוקר: ${(profile?.breakfast_patterns || []).join(', ')}\nדפוסי צהריים: ${(profile?.lunch_patterns || []).join(', ')}\nדפוסי ערב: ${(profile?.dinner_patterns || []).join(', ')}\nמאגר אישי/מאמן: ${foodLines.join(', ')}\nהימנע ממזונות שנמחקו הרבה: ${(profile?.foods_deleted_often || []).join(', ')}`;
        } catch (memoryError) {
            console.warn('Nutrition memory lookup failed:', memoryError.message);
        }

        const llmPrompt = `
אתה שף תזונאי מומחה בתזונה ישראלית. תפקידך להציע ארוחה אחת בריאה ומאוזנת שמתאימה לבקשת המשתמש.

חוקים חשובים:
1. הצע ארוחה אחת בלבד, ריאלית, עם מצרכים זמינים בישראל
2. ספק ניתוח תזונתי מדויק לפי USDA ולפי הכמויות שאתה מציע
3. כל הטקסטים בעברית
4. כמויות חייבות להיות ספציפיות (לדוגמה: "200 גרם", "1 כף גדולה")
5. ערכים תזונתיים - מספרים שלמים בלבד

בקשת המשתמש: "${prompt}"
${nutritionMemoryContext}

אם יש מאגר אישי או דפוסי אכילה חוזרים — העדף אותם בהצעה, כולל מזונות שהמשתמש אוכל הרבה וכמויות מועדפות.

החזר JSON בלבד בפורמט הבא:
{
  "meal_name": "שם הארוחה",
  "description": "תיאור קצר של הארוחה ולמה היא מתאימה",
  "ingredients": [
    {"item": "שם המרכיב", "quantity": "כמות ספציפית"}
  ],
  "preparation_instructions": [
    "שלב 1",
    "שלב 2"
  ],
  "calories": 0,
  "protein": 0,
  "carbs": 0,
  "fat": 0
}
        `.trim();

        const response = await base44.integrations.Core.InvokeLLM({
            prompt: llmPrompt,
            model: "claude_opus_4_7",
            response_json_schema: {
                type: "object",
                properties: {
                    meal_name: { type: "string" },
                    description: { type: "string" },
                    ingredients: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                item: { type: "string" },
                                quantity: { type: "string" }
                            },
                            required: ["item", "quantity"]
                        }
                    },
                    preparation_instructions: {
                        type: "array",
                        items: { type: "string" }
                    },
                    calories: { type: "integer" },
                    protein: { type: "integer" },
                    carbs: { type: "integer" },
                    fat: { type: "integer" }
                },
                required: ["meal_name", "description", "ingredients", "preparation_instructions", "calories", "protein", "carbs", "fat"]
            }
        });

        return Response.json(response);

    } catch (error) {
        console.error("Error in suggestMealAI:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});