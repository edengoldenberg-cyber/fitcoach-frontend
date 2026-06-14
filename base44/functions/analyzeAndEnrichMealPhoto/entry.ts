import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// GPT-4o Vision — strict Israeli meal recognition with clarifying questions
async function identifyFoodWithGPT4o(imageUrl, userAnswers = null, userNotes = '') {
  const clarificationsContext = userAnswers
    ? `\n\nThe user has already answered clarifying questions:\n${JSON.stringify(userAnswers, null, 2)}\nUse these answers for accurate weights. Set needs_clarification=false and do NOT add more questions.`
    : '';
  const notesContext = userNotes
    ? `\n\nUser-provided food text / notes (AUTHORITATIVE when it names foods):\n"${userNotes}"\nIf this text lists foods, use it as the source of truth for which foods are present. Do NOT add unrelated visible items that are not mentioned unless they are unmistakably part of the same food. If the text says תמר וקשיו, analyze תמר and קשיו and return nutrition values even if the image is small or unclear.`
    : '';

  const needsClarificationValue = 'false';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content: `You are a strict food logging assistant for an Israeli fitness app. Your job is to analyze either a visible food photo OR a nutrition-label photo.

          NUTRITION LABEL MODE — CRITICAL:
          - If the image is a nutrition facts label / תווית ערכים תזונתיים, DO NOT return empty items.
          - Extract the values from the label and create one generic item named "מוצר מתווית תזונתית".
          - Prefer the serving/package column if visible (e.g. "ביחידה", "במנה", "במוצר", "50 גרם"). Otherwise use the 100g column with grams=100.
          - If a 50g serving shows 220 kcal and 7.3g protein, return grams=50, calories=220, protein=7.3 and matching macros.
          - Set confidence="medium" if the label is partially readable, "high" only if all key values are clear.
          - In notes, say this was calculated from the nutrition label and should be renamed by the user if needed.

          ABSOLUTE RULES — violating any of these is a critical failure:
          1. NEVER invent food items. If you cannot see it clearly, do not include it.
2. NEVER use brand names, café names, or restaurant names (e.g. never say "ארומה", "קפה קפה", "מקדונלד'ס"). Use ONLY generic Hebrew food names.
3. NEVER describe composite dishes like "כריך גבינה וריבה" as a single item. ALWAYS break into individual visible components: "פרוסת לחם לבן", "גבינה צהובה", "ריבה".
4. Only list items you can see with high confidence in the image. If something is ambiguous, ask a clarifying question instead of guessing.
5. Do NOT add drinks, sauces, toppings, or garnishes unless clearly visible.
6. Use simple, generic Hebrew food names: "לחם לבן", "גבינה צהובה", "ריבה", "ביצה", "עגבנייה", "מלפפון", etc.
7. CRITICAL — the "name_he" field is the FINAL product name that will appear in the user's food log. It MUST be a safe, generic name. NEVER put a brand name or creative description in name_he. Use ONLY the basic food category name, e.g.: "גבינה צהובה", "לחם לבן", "ריבה", "קצפת", "עוגה", "מאפה".
8. If you are not confident about a specific type (e.g. what type of cheese, what type of bread), you MUST ask a clarifying question — do NOT guess and invent a name.

CLARIFYING QUESTIONS — OPTIONAL, NEVER BLOCK NUTRITION:
- Always return the best preliminary food items and gram estimates first.
- Add clarifying questions only when they improve accuracy for high-impact uncertainty.
- Never return empty items just because clarification could improve accuracy.
- If user text already names foods clearly, do not ask what the food is; estimate standard portions and ask only optional quantity questions.
- Ask about: exact type/variety of main items, fat percentage for dairy, cooking method, quantity/weight estimation.
- For meats: ask if home-cooked or restaurant, cooking method (grilled/fried/baked).
- For bread/sandwiches: ask bread type AND filling details only if not clear from user text.
- For salads: ask if oil/dressing was added and how much.
- Maximum 2 questions for simple meals, up to 3 for complex meals.

EXAMPLE — if the image shows toast with yellow cheese slices and jam:
WRONG: "כריך גבינה ארומה", "מאפה גבינה", "טוסט גבינה ריבה"
CORRECT items: "פרוסת לחם לבן" (40g), "גבינה צהובה" (30g), "ריבה" (15g)
CORRECT questions: "איזה סוג לחם? לבן / שיפון / מלא?", "איזה גבינה צהובה? (28%, אמריקאית, גאודה...)", "איזה ריבה?"
`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this meal photo together with the user-provided text if present.

Priority order:
1. If the user text names foods, those foods are authoritative and must be included.
2. Use the image to estimate portion size and confirm visible details.
3. Do not invent extra foods that are not named in the text unless they are unmistakably visible and relevant.
4. Always return preliminary nutrition-ready items; clarifying questions are optional and must not block items.

${clarificationsContext}${notesContext}

Return ONLY valid JSON (no markdown, no extra text):
{
  "meal_name": "תיאור קצר של מה שנראה בתמונה בעברית",
  "confidence": "high|medium|low",
  "notes": "הערה קצרה בעברית על איכות הזיהוי",
  "needs_clarification": ${needsClarificationValue},
  "clarifying_questions": [
    {
      "id": "unique_id",
      "question": "שאלה ספציפית — לדוגמה: איזה סוג גבינה צהובה? (28% שומן, אמריקאית, גאודה, אמנטל)",
      "type": "choice",
      "options": ["גבינה צהובה 28%", "גבינה אמריקאית", "גאודה", "אמנטל"],
      "default_value": "גבינה צהובה 28%"
    }
  ],
  "items": [
    {
      "name_he": "שם בסיסי בעברית (ללא מותג)",
      "name_en": "basic English name (no brand)",
      "grams": 40,
      "preparation": "raw/grilled/cooked/fried",
      "calories": 0,
      "protein": 0,
      "carbs": 0,
      "fat": 0,
      "per100_kcal": 0,
      "per100_protein": 0,
      "per100_carbs": 0,
      "per100_fat": 0
    }
  ]
}`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'high' }
            }
          ]
        }
      ]
    })
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('GPT4o no content. error=' + JSON.stringify(data.error));
  console.log('[GPT4o RESULT]', content.slice(0, 500));
  const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('[GPT4o PARSE ERROR]', e.message, cleaned.slice(0, 200));
    return { items: [], meal_name: 'שגיאת ניתוח', confidence: 'low', notes: 'GPT-4o parse error', needs_clarification: false, clarifying_questions: [] };
  }
}

// GPT-4o Text — smart conversational free-text meal analysis
function normalizeAnswerMap(userAnswers = null) {
  if (!userAnswers || typeof userAnswers !== 'object') return {};
  return Object.fromEntries(Object.entries(userAnswers).map(([id, data]) => [id, {
    ...data,
    answer: String(data?.answer || data?.value || data || '').toLowerCase(),
    grams: Number(data?.grams || 0) || null
  }]));
}

function correctKnownTextItems(items = [], mealText = '') {
  const text = String(mealText || '').toLowerCase();
  if (!/מגנום|magnum/.test(text)) return items;
  return items.map(item => {
    const name = normalizeFoodName(item.name_he || item.name || '');
    if (!name.includes('מאפה') && !name.includes('pastry')) return item;
    return {
      ...item,
      name_he: 'ארטיק מגנום',
      name_en: 'Magnum ice cream bar',
      grams: /מיני|mini/.test(text) ? 45 : 86,
      preparation: 'ice cream bar',
      confidence: 'high',
      assumption_note: 'תוקן אוטומטית: מגנום הוא ארטיק גלידה, לא מאפה'
    };
  });
}

function applyAnswerGramsToItems(items = [], userAnswers = null) {
  const answers = normalizeAnswerMap(userAnswers);
  return items.map((item) => {
    const itemName = normalizeFoodName(item.name_he || item.name || item.food_key || '');
    const matchingAnswer = Object.entries(answers).find(([id, answer]) => {
      const foodKey = normalizeFoodName(answer.food_key || id);
      return foodKey && (itemName.includes(foodKey) || foodKey.includes(itemName) || id.includes('pastry') && itemName.includes('מאפה') || id.includes('butter') && itemName.includes('חמאה'));
    })?.[1];
    if (!matchingAnswer?.grams) return item;
    return {
      ...item,
      grams: matchingAnswer.grams,
      confidence: item.confidence === 'low' ? 'medium' : item.confidence,
      assumption_note: `${matchingAnswer.grams} גרם לפי תשובת המשתמש`
    };
  });
}

function buildSmartQuestionHints(mealText = '') {
  const text = String(mealText || '').toLowerCase();
  const hints = [];
  if (/מגנום|magnum/.test(text)) hints.push('מגנום/Magnum הוא ארטיק גלידה מצופה שוקולד, לא מאפה. לעולם אל תסווג אותו כמאפה ואל תשאל שאלת גודל מאפה עבורו.');
  if (/מאפה|בורקס|קרואסון|לחמנ|פיתה|לחם/.test(text) && !/מגנום|magnum/.test(text)) hints.push('מאפה/לחם: שאל על גודל המאפה גם אם המשתמש כתב קטן, כי זו אי ודאות קלורית גבוהה.');
  if (/חמאה|שמן|טיגון|מקושקש|מטוגן/.test(text)) hints.push('שומן בישול: שאל על כפית/כף חמאה או שמן אם הכמות לא ברורה.');
  if (/לבאנה|לבנה|יוגורט|גבינה/.test(text)) hints.push('מוצר חלב: שאל רגיל/עתיר חלבון רק אם זה משנה חלבון או קלוריות.');
  if (/חצי|קצת|מעט|קטן|בינוני|גדול/.test(text)) hints.push('כמות חלקית: השתמש במילים שכבר קיימות בטקסט כהנחה ראשונית, אבל שאל כשיש השפעה קלורית גבוהה.');
  return hints.join('\n');
}

function getBreadClarificationLabel(text = '') {
  if (/לחמנ/.test(text)) return 'לחמנייה';
  if (/פיתה/.test(text)) return 'פיתה';
  if (/לחם/.test(text)) return 'לחם';
  if (/בורקס/.test(text)) return 'בורקס';
  if (/קרואסון/.test(text)) return 'קרואסון';
  return 'מאפה';
}

function deterministicTextQuestions(mealText = '', userAnswers = null) {
  const text = String(mealText || '').toLowerCase();
  const answered = normalizeAnswerMap(userAnswers);
  const questions = [];

  if (/מאפה|בורקס|קרואסון|לחמנ|פיתה|לחם/.test(text) && !/מגנום|magnum/.test(text) && !answered.pastry_size) {
    const breadLabel = getBreadClarificationLabel(text);
    questions.push({
      id: 'pastry_size',
      food_key: breadLabel,
      question: `${breadLabel} הייתה בערך בגודל קטן, בינוני או גדול?`,
      impact: 'high',
      options: [
        { label: 'קטנה', value: 'קטן', grams: 80 },
        { label: 'בינונית', value: 'בינוני', grams: 120 },
        { label: 'גדולה', value: 'גדול', grams: 180 }
      ]
    });
  }

  if (/חמאה|שמן|מקושקש|מטוגן/.test(text) && !answered.butter_amount) {
    questions.push({
      id: 'butter_amount',
      food_key: /שמן/.test(text) ? 'שמן' : 'חמאה',
      question: /שמן/.test(text) ? 'כמה שמן בערך היה בבישול?' : 'השתמשת בכפית חמאה או יותר?',
      impact: 'high',
      options: [
        { label: 'כפית', value: 'כפית', grams: 5 },
        { label: 'כף', value: 'כף', grams: 15 },
        { label: 'יותר מכף', value: 'יותר מכף', grams: 20 }
      ]
    });
  }

  return questions;
}

async function identifyFoodFromText(mealText, userAnswers = null, personalPortionContext = '') {
  const answersContext = userAnswers
    ? `\n\nThe user answered clarification questions. Use these answers as hard constraints and recalculate. Do not ask repeated questions:\n${JSON.stringify(userAnswers, null, 2)}`
    : '';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1600,
      messages: [
        {
          role: 'system',
          content: `You are a smart Israeli nutrition coach. Analyze Hebrew meal text conversationally.

          Core behavior:
          1. Always parse normal Hebrew meal descriptions into food items. Never fail just because quantities are unclear.
          2. Give a preliminary estimate first using reasonable Israeli portions.
          3. Generate ONLY high-impact clarification questions, maximum 2 for simple meals and maximum 3 for complex meals.
          4. Prioritize calorie/protein uncertainty: pastries/bread size, oil/butter amount, dairy protein/fat type, unclear quantity.
          5. Do NOT ask generic questions. Ask contextual questions about the actual food. If the user wrote לחמנייה, call it לחמנייה in questions — not מאפה.
          6. If the user already answered, recalculate from answers and set needs_clarification=false unless a critical unknown remains.
          7. If text is normal Hebrew food text, output items even at low confidence. Never return empty items for a normal meal.
          8. Question options must be quick chips with label/value and grams when relevant.
          9. Return ONLY JSON.
          10. Important Israeli product rule: "מגנום" / "Magnum" means an ice cream bar coated with chocolate, NOT a pastry. Classify it as "ארטיק מגנום" or "גלידת מגנום" and never ask pastry-size questions for it.

Hebrew portion guide:
- ביצה בינונית = 55g, ביצה גדולה = 65g
- כפית חמאה/שמן = 5g, כף = 15g
- כף לבאנה = 30g, שתי כפות = 60g
- חצי מלפפון = 50g, מלפפון בינוני = 100g
- מאפה קטן = 80g, בינוני = 120g, גדול = 180g
- מגנום רגיל = 86g, מגנום מיני = 45g
- פרוסת לחם = 30g

Return schema:
{
  "meal_name": "short Hebrew meal name",
  "confidence": "high|medium|low",
  "uncertainty_score": 0-100,
  "notes": "Hebrew note. If questions exist, start with: ניתוח ראשוני — חלק מהכמויות הוערכו",
  "needs_clarification": true|false,
  "clarifying_questions": [
    {
      "id": "pastry_size",
      "food_key": "שם המאכל המדויק מהטקסט, למשל לחמנייה",
      "question": "הלחמנייה הייתה קטנה, בינונית או גדולה? — השתמש בשם המדויק מהטקסט", 
      "impact": "high",
      "options": [
        {"label":"קטן", "value":"קטן", "grams":80},
        {"label":"בינוני", "value":"בינוני", "grams":120},
        {"label":"גדול", "value":"גדול", "grams":180}
      ]
    }
  ],
  "items": [
    {"name_he":"שם בעברית", "name_en":"English name", "grams":150, "preparation":"standard", "confidence":"high|medium|low", "assumption_note":"Hebrew assumption note"}
  ]
}`
        },
        {
          role: 'user',
          content: `Meal text: "${mealText}"

Contextual uncertainty hints:
${buildSmartQuestionHints(mealText)}

${personalPortionContext ? `\nPersonal user portion habits:\n${personalPortionContext}` : ''}${answersContext}`
        }
      ]
    })
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('GPT4o no content. error=' + JSON.stringify(data.error));
  const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.items?.length) return fallbackParseHebrewMealText(mealText, userAnswers);
    parsed.items = applyAnswerGramsToItems(correctKnownTextItems(parsed.items, mealText), userAnswers);
    const deterministicQuestions = deterministicTextQuestions(mealText, userAnswers);
    const isMagnumMeal = /מגנום|magnum/.test(String(mealText || '').toLowerCase());
    const aiQuestions = (parsed.clarifying_questions || []).filter(q => q?.impact !== 'low' && !(isMagnumMeal && /מאפה|pastry/.test(`${q?.id || ''} ${q?.food_key || ''} ${q?.question || ''}`.toLowerCase())));
    const mergedQuestions = [...deterministicQuestions, ...aiQuestions]
      .filter((q, index, arr) => {
        if (!q?.id) return false;
        const key = normalizeFoodName(q.food_key || q.id);
        return arr.findIndex(other => other.id === q.id || (key && normalizeFoodName(other.food_key || other.id) === key)) === index;
      });
    parsed.clarifying_questions = userAnswers ? [] : mergedQuestions.slice(0, parsed.items.length <= 3 ? 2 : 3);
    parsed.needs_clarification = parsed.clarifying_questions.length > 0 && !userAnswers;
    parsed.notes = parsed.needs_clarification ? (parsed.notes || 'ניתוח ראשוני — חלק מהכמויות הוערכו') : (userAnswers ? 'הארוחה חושבה מחדש לפי התשובות שלך' : parsed.notes);
    return parsed;
  } catch (e) {
    return fallbackParseHebrewMealText(mealText, userAnswers);
  }
}

function fallbackParseHebrewMealText(mealText = '', userAnswers = null) {
  const text = String(mealText || '').toLowerCase();
  const items = [];
  const questions = [];
  const hasAnswer = (id) => userAnswers && userAnswers[id]?.answer;
  const answerText = (id) => String(userAnswers?.[id]?.answer || '').toLowerCase();

  const numberFromText = (nearText, fallback = 1) => {
    if (/שתי|שני|2/.test(nearText)) return 2;
    if (/שלוש|3/.test(nearText)) return 3;
    if (/ארבע|4/.test(nearText)) return 4;
    if (/חצי/.test(nearText)) return 0.5;
    return fallback;
  };

  if (/מגנום|magnum/.test(text)) {
    const count = numberFromText(text, 1);
    const gramsPerUnit = /מיני|mini/.test(text) ? 45 : 86;
    items.push({ name_he: 'ארטיק מגנום', name_en: 'Magnum ice cream bar', grams: Math.round(gramsPerUnit * count), preparation: 'ice cream bar', confidence: 'high', assumption_note: `${count} מגנום ${/מיני|mini/.test(text) ? 'מיני' : 'רגיל'}` });
  }

  if (/ביצ/.test(text)) {
    const count = numberFromText(text, 1);
    items.push({ name_he: 'ביצה', name_en: 'egg', grams: Math.round(55 * count), preparation: /מקושקש/.test(text) ? 'scrambled' : 'standard', confidence: 'high', assumption_note: `${count} ביצים בינוניות` });
  }

  if (/חמאה|שמן/.test(text)) {
    let grams = 5;
    if (/כף/.test(text) || answerText('butter_amount').includes('כף')) grams = 15;
    if (/יותר/.test(answerText('butter_amount'))) grams = 15;
    items.push({ name_he: /חמאה/.test(text) ? 'חמאה' : 'שמן', name_en: /חמאה/.test(text) ? 'butter' : 'oil', grams, preparation: 'added fat', confidence: hasAnswer('butter_amount') ? 'medium' : 'low', assumption_note: `${grams} גרם לפי ${hasAnswer('butter_amount') ? 'תשובת המשתמש' : 'הערכה ראשונית'}` });
    if (!hasAnswer('butter_amount')) {
      questions.push({ id: 'butter_amount', food_key: 'חמאה', question: 'השתמשת בכפית חמאה או יותר?', impact: 'high', options: [{ label: 'כפית', value: 'כפית', grams: 5 }, { label: 'כף', value: 'כף', grams: 15 }, { label: 'יותר מכף', value: 'יותר מכף', grams: 20 }] });
    }
  }

  if (/לבאנה|לבנה/.test(text)) {
    const count = /שתי|2/.test(text) ? 2 : 1;
    items.push({ name_he: 'לבאנה', name_en: 'labneh', grams: count * 30, preparation: 'standard', confidence: 'medium', assumption_note: `${count} כפות` });
    if (!hasAnswer('labneh_type')) {
      questions.push({ id: 'labneh_type', food_key: 'לבאנה', question: 'הלבאנה הייתה רגילה או עתירת חלבון?', impact: 'medium', options: [{ label: 'רגילה', value: 'רגילה' }, { label: 'עתירת חלבון', value: 'עתירת חלבון' }] });
    }
  }

  if (/מלפפון/.test(text)) {
    items.push({ name_he: 'מלפפון', name_en: 'cucumber', grams: /חצי/.test(text) ? 50 : 100, preparation: 'raw', confidence: 'high', assumption_note: /חצי/.test(text) ? 'חצי מלפפון' : 'מלפפון בינוני' });
  }

  if (/מאפה|בורקס|קרואסון|לחמנ|פיתה|לחם/.test(text)) {
    const breadLabel = getBreadClarificationLabel(text);
    let grams = 80;
    if (answerText('pastry_size').includes('בינוני')) grams = 120;
    if (answerText('pastry_size').includes('גדול')) grams = 180;
    items.push({ name_he: /כוסמין/.test(text) ? `${breadLabel} מקמח כוסמין` : breadLabel, name_en: breadLabel === 'לחמנייה' ? 'bread roll' : 'pastry or bread', grams, preparation: 'baked', confidence: hasAnswer('pastry_size') ? 'medium' : 'low', assumption_note: `${grams} גרם לפי ${hasAnswer('pastry_size') ? 'תשובת המשתמש' : `${breadLabel} קטנה משוערת`}` });
    if (!hasAnswer('pastry_size')) {
      questions.push({ id: 'pastry_size', food_key: breadLabel, question: `${breadLabel} הייתה בערך בגודל קטן, בינוני או גדול?`, impact: 'high', options: [{ label: 'קטנה', value: 'קטן', grams: 80 }, { label: 'בינונית', value: 'בינוני', grams: 120 }, { label: 'גדולה', value: 'גדול', grams: 180 }] });
    }
  }

  return {
    meal_name: 'ניתוח ארוחה מטקסט',
    confidence: questions.length ? 'low' : 'medium',
    uncertainty_score: questions.length ? 70 : 35,
    notes: questions.length ? 'ניתוח ראשוני — חלק מהכמויות הוערכו' : 'הניתוח מבוסס על הערכות מנות נפוצות בישראל',
    needs_clarification: questions.length > 0 && !userAnswers,
    clarifying_questions: userAnswers ? [] : questions.slice(0, items.length <= 3 ? 2 : 3),
    items
  };
}

function normalizeFoodName(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getPersonalCorrections(base44, user) {
  const trainees = await base44.entities.Trainee.filter({ user_email: user.email }).catch(() => []);
  const trainee = trainees?.[0] || null;
  if (!trainee?.id) return [];
  const foods = await base44.entities.UserFoodItem.filter({ trainee_id: trainee.id, visibility: 'personal', active: true }).catch(() => []);
  return foods.filter(food => food.source === 'ai_correction' || food.original_ai_name || food.corrected_name);
}

function isSafePersonalNutrition(food = {}) {
  const calories = Number(food.calories_per_100g || 0);
  const protein = Number(food.protein_per_100g || 0);
  const carbs = Number(food.carbs_per_100g || 0);
  const fat = Number(food.fat_per_100g || 0);
  return calories >= 0 && calories <= 950 && protein >= 0 && protein <= 110 && carbs >= 0 && carbs <= 110 && fat >= 0 && fat <= 110;
}

function applyPersonalCorrections(items, corrections) {
  const safeCorrections = (corrections || []).filter(isSafePersonalNutrition);
  return (items || []).map((item) => {
    const itemName = normalizeFoodName(item.name || item.name_he || item.food_name);
    const match = safeCorrections.find(food => {
      const original = normalizeFoodName(food.original_ai_name || '');
      const corrected = normalizeFoodName(food.corrected_name || food.food_name || '');
      return (original && (itemName.includes(original) || original.includes(itemName))) ||
        (corrected && (itemName.includes(corrected) || corrected.includes(itemName)));
    });
    if (!match) return item;
    const grams = Number(item.grams || match.serving_size || 100) || 100;
    const factor = grams / 100;
    return {
      ...item,
      name: match.corrected_name || match.food_name,
      name_he: match.corrected_name || match.food_name,
      grams,
      calories: Math.round((match.calories_per_100g || 0) * factor),
      protein: Math.round((match.protein_per_100g || 0) * factor * 10) / 10,
      carbs: Math.round((match.carbs_per_100g || 0) * factor * 10) / 10,
      fat: Math.round((match.fat_per_100g || 0) * factor * 10) / 10,
      per100_kcal: match.calories_per_100g || 0,
      per100_protein: match.protein_per_100g || 0,
      per100_carbs: match.carbs_per_100g || 0,
      per100_fat: match.fat_per_100g || 0,
      nutrition_source: 'personal_ai_correction',
      user_food_item_id: match.id,
      original_ai_name: item.name || item.name_he || item.food_name
    };
  });
}

async function getPersonalPortionContext(base44, user) {
  const profiles = await base44.entities.TraineeNutritionProfile.filter({ trainee_email: user.email }).catch(() => []);
  const profile = profiles?.[0] || null;
  if (!profile?.preferred_portion_sizes) return '';
  return JSON.stringify(profile.preferred_portion_sizes).slice(0, 1200);
}

async function saveClarificationHabits(base44, user, userAnswers) {
  if (!userAnswers || typeof userAnswers !== 'object') return;
  const trainees = await base44.entities.Trainee.filter({ user_email: user.email }).catch(() => []);
  const trainee = trainees?.[0] || null;
  if (!trainee?.user_email) return;

  const profiles = await base44.entities.TraineeNutritionProfile.filter({ trainee_email: trainee.user_email }).catch(() => []);
  const profile = profiles?.[0] || null;
  const preferredPortionSizes = { ...(profile?.preferred_portion_sizes || {}) };
  const now = new Date().toISOString();

  Object.entries(userAnswers).forEach(([id, answerData]) => {
    const foodKey = normalizeFoodName(answerData?.food_key || id);
    if (!foodKey) return;
    preferredPortionSizes[foodKey] = {
      ...(preferredPortionSizes[foodKey] || {}),
      question: answerData?.question || '',
      answer: answerData?.answer || answerData,
      grams: answerData?.grams || preferredPortionSizes[foodKey]?.grams || null,
      last_used_at: now
    };
  });

  const payload = {
    trainee_id: trainee.id,
    trainee_email: trainee.user_email,
    preferred_portion_sizes: preferredPortionSizes,
    updated_at: now
  };

  if (profile) await base44.entities.TraineeNutritionProfile.update(profile.id, payload);
  else await base44.entities.TraineeNutritionProfile.create(payload);
}

function estimateNutritionFallback(item) {
  const name = normalizeFoodName(item.name_he || item.name || '');
  const grams = Number(item.grams || 100) || 100;
  const table = [
    { match: 'ביצה', kcal: 155, protein: 13, carbs: 1, fat: 11 },
    { match: 'חמאה', kcal: 717, protein: 0.9, carbs: 0.1, fat: 81 },
    { match: 'שמן', kcal: 884, protein: 0, carbs: 0, fat: 100 },
    { match: 'בצל', kcal: 40, protein: 1.1, carbs: 9.3, fat: 0.1 },
    { match: 'אבוקדו', kcal: 160, protein: 2, carbs: 8.5, fat: 14.7 },
    { match: 'תמר', kcal: 277, protein: 1.8, carbs: 75, fat: 0.2 },
    { match: 'תמרים', kcal: 277, protein: 1.8, carbs: 75, fat: 0.2 },
    { match: 'קשיו', kcal: 553, protein: 18, carbs: 30, fat: 44 },
    { match: 'קוטג', kcal: 75, protein: 9.5, carbs: 4.4, fat: 1.8 },
    { match: 'קוטג׳', kcal: 75, protein: 9.5, carbs: 4.4, fat: 1.8 },
    { match: 'לבאנה', kcal: 150, protein: 7, carbs: 4, fat: 11 },
    { match: 'לבנה', kcal: 150, protein: 7, carbs: 4, fat: 11 },
    { match: 'מלפפון', kcal: 15, protein: 0.7, carbs: 3.6, fat: 0.1 },
    { match: 'מגנום', kcal: 320, protein: 4, carbs: 30, fat: 21 },
    { match: 'ארטיק', kcal: 320, protein: 4, carbs: 30, fat: 21 },
    { match: 'גלידה', kcal: 320, protein: 4, carbs: 30, fat: 21 },
    { match: 'בצל', kcal: 40, protein: 1.1, carbs: 9.3, fat: 0.1 },
    { match: 'מאפה', kcal: 330, protein: 8, carbs: 45, fat: 13 },
    { match: 'לחם', kcal: 250, protein: 8, carbs: 48, fat: 2 }
  ];
  const base = table.find(row => name.includes(row.match)) || { kcal: 180, protein: 6, carbs: 22, fat: 6 };
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

function isInflatedEggNutrition(item, nutrition) {
  const name = normalizeFoodName(item.name_he || item.name || '');
  const isEgg = name.includes('ביצה') || name.includes('ביצים') || name.includes('חביתה');
  if (!isEgg) return false;
  const grams = Number(item.grams || 100) || 100;
  const calories = Number(nutrition?.calories || 0);
  const per100Kcal = Number(nutrition?.per100_kcal || (grams ? (calories / grams) * 100 : 0));
  return per100Kcal > 220 || calories > grams * 2.2;
}

function isNutritionResultReasonable(item, nutrition) {
  if (isInflatedEggNutrition(item, nutrition)) return false;
  const grams = Number(item.grams || 100) || 100;
  const calories = Number(nutrition?.calories || 0);
  const protein = Number(nutrition?.protein || 0);
  const carbs = Number(nutrition?.carbs || 0);
  const fat = Number(nutrition?.fat || 0);
  const per100Kcal = Number(nutrition?.per100_kcal || 0);
  const per100Protein = Number(nutrition?.per100_protein || 0);
  const per100Carbs = Number(nutrition?.per100_carbs || 0);
  const per100Fat = Number(nutrition?.per100_fat || 0);

  if (![calories, protein, carbs, fat].every(Number.isFinite)) return false;
  if (calories < 0 || protein < 0 || carbs < 0 || fat < 0) return false;
  if (calories > grams * 9.5 + 30) return false;
  if (protein + carbs + fat > grams * 1.25 + 10) return false;
  if (per100Kcal > 950 || per100Protein > 110 || per100Carbs > 110 || per100Fat > 110) return false;
  return true;
}

function sanitizeNutritionForItem(item, nutrition) {
  if (isNutritionResultReasonable(item, nutrition)) return nutrition;
  console.warn('[NUTRITION_SANITY_FALLBACK]', item.name_he || item.name, item.grams, JSON.stringify(nutrition).slice(0, 300));
  return estimateNutritionFallback(item);
}

function hasMeaningfulMealText(mealText = '') {
  const text = String(mealText || '').trim().toLowerCase();
  if (!text) return false;
  if (/^נתח\s+את\s+הארוחה\s+בתמונה$/.test(text)) return false;
  return /[א-תa-z]/i.test(text) && text.length >= 3;
}

function mergeImageTextNotes(mealText = '', userNotes = '') {
  return [hasMeaningfulMealText(mealText) ? `טקסט הארוחה: ${mealText}` : '', userNotes ? `תיקון/הערת משתמש: ${userNotes}` : '']
    .filter(Boolean)
    .join('\n');
}

// OpenAI — precise nutritional analysis per item with Israeli food focus
async function getNutritionForItem(item) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: `You are a precise nutrition expert. Return ONLY valid JSON with nutritional values. No markdown, no explanation.`
        },
        {
          role: 'user',
          content: `Give exact nutritional values for:
Food: "${item.name_he}" (${item.name_en || ''})
Preparation: "${item.preparation || 'standard'}"
Amount: ${item.grams} grams

Use Israeli food composition values:
- לחם לבן: ~250 kcal/100g, 8g protein, 48g carbs, 2g fat
- גבינה צהובה 9%: ~270 kcal/100g, 25g protein, 1g carbs, 18g fat
- גבינה צהובה 28%: ~350 kcal/100g, 25g protein, 1g carbs, 27g fat
- קטשופ: ~100 kcal/100g, 1.5g protein, 25g carbs, 0.5g fat
- ביצה: ~155 kcal/100g, 13g protein, 1g carbs, 11g fat
- ארטיק מגנום / Magnum ice cream bar: ~320 kcal/100g, 4g protein, 30g carbs, 21g fat

Return ONLY this JSON (values for the EXACT ${item.grams}g amount):
{"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "per100_kcal": 0, "per100_protein": 0, "per100_carbs": 0, "per100_fat": 0, "confidence_note": "note"}`
        }
      ]
    })
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No nutrition content from OpenAI');
  console.log(`[NUTRITION] ${item.name_he} (${item.grams}g):`, content.slice(0, 200));
  const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
  return sanitizeNutritionForItem(item, JSON.parse(cleaned));
}

// ── PATCH 1: per100 guarantee ──────────────────────────────────────────────
// Ensures every returned item always has consistent per100_* values.
// Rules (applied per nutrient pair):
//   1. per100 > 0  → source of truth; recompute total for consistency
//   2. per100 <= 0, total > 0  → derive per100 = total * 100 / safeGrams
//   3. both <= 0   → preserve zero (zero may be legitimate, e.g. water)
// grams is clamped to a minimum of 1 to prevent division by zero.
function ensurePer100(item) {
  const safeGrams = Math.max(Number(item.grams) || 1, 1);

  const syncPair = (per100Raw, totalRaw, isCalories) => {
    const per100 = Number(per100Raw) || 0;
    const total  = Number(totalRaw)  || 0;

    if (per100 > 0) {
      const derived = (per100 / 100) * safeGrams;
      return {
        per100,
        total: isCalories ? Math.round(derived) : Math.round(derived * 10) / 10,
      };
    }
    if (total > 0) {
      return { per100: (total / safeGrams) * 100, total };
    }
    return { per100: 0, total: 0 };
  };

  const cal  = syncPair(item.per100_kcal,     item.calories, true);
  const prot = syncPair(item.per100_protein,  item.protein,  false);
  const carb = syncPair(item.per100_carbs,    item.carbs,    false);
  const fat  = syncPair(item.per100_fat,      item.fat,      false);

  return {
    ...item,
    grams:         safeGrams,
    calories:      cal.total,
    protein:       prot.total,
    carbs:         carb.total,
    fat:           fat.total,
    per100_kcal:     cal.per100,
    per100_protein:  prot.per100,
    per100_carbs:    carb.per100,
    per100_fat:      fat.per100,
  };
}
// ── end PATCH 1 ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { image_url, meal_text, user_answers, user_notes } = body;

    if (meal_text && user_answers) {
      await saveClarificationHabits(base44, user, user_answers).catch((e) => console.warn('Clarification habit save failed:', e.message));
    }

    if (!image_url && !meal_text) {
      return Response.json({ error: 'image_url or meal_text required' }, { status: 400 });
    }

    // ── STEP 1: Identify food items (vision or text), pass user answers if provided ──
    const personalPortionContext = meal_text ? await getPersonalPortionContext(base44, user) : '';
    const textNotesForImage = mergeImageTextNotes(meal_text, user_notes || '');
    const visionResult = image_url
      ? await identifyFoodWithGPT4o(image_url, user_answers || null, textNotesForImage)
      : await identifyFoodFromText(meal_text, user_answers || null, personalPortionContext);

    // Image analysis should never stop at clarification only; always try to return preliminary nutrition.
    if (image_url && hasMeaningfulMealText(meal_text) && (!visionResult.items || visionResult.items.length === 0)) {
      const textFallback = await identifyFoodFromText(meal_text, user_answers || null, personalPortionContext);
      if (textFallback.items?.length) {
        visionResult.items = textFallback.items;
        visionResult.meal_name = textFallback.meal_name;
        visionResult.confidence = textFallback.confidence;
        visionResult.notes = 'הניתוח חושב לפי המלל שהוזן, והתמונה שימשה כהקשר משלים.';
        visionResult.uncertainty_score = textFallback.uncertainty_score;
        visionResult.needs_clarification = textFallback.needs_clarification;
        visionResult.clarifying_questions = textFallback.clarifying_questions;
      }
    }

    if (!visionResult.items || visionResult.items.length === 0) {
      if (!image_url) {
        const fallbackResult = fallbackParseHebrewMealText(meal_text, user_answers || null);
        if (fallbackResult.items?.length) {
          visionResult.items = fallbackResult.items;
          visionResult.meal_name = fallbackResult.meal_name;
          visionResult.confidence = fallbackResult.confidence;
          visionResult.notes = fallbackResult.notes;
          visionResult.uncertainty_score = fallbackResult.uncertainty_score;
          visionResult.needs_clarification = fallbackResult.needs_clarification;
          visionResult.clarifying_questions = fallbackResult.clarifying_questions;
        } else {
          return Response.json({
            needs_clarification: false,
            meal_name: 'ניתוח ארוחה מטקסט',
            confidence: 'low',
            notes: 'לא זוהו מספיק רכיבים — אפשר לערוך ידנית או לפרט עוד.',
            items: [],
          });
        }
      } else {
        if (hasMeaningfulMealText(meal_text)) {
          const fallbackResult = fallbackParseHebrewMealText(meal_text, user_answers || null);
          if (fallbackResult.items?.length) {
            visionResult.items = fallbackResult.items;
            visionResult.meal_name = fallbackResult.meal_name;
            visionResult.confidence = 'medium';
            visionResult.notes = 'הניתוח חושב לפי המלל שהוזן כי התמונה לא הספיקה לזיהוי מדויק.';
            visionResult.uncertainty_score = fallbackResult.uncertainty_score;
            visionResult.needs_clarification = fallbackResult.needs_clarification;
            visionResult.clarifying_questions = fallbackResult.clarifying_questions;
          } else {
            return Response.json({
              needs_clarification: false,
              meal_name: 'לא זוהו מאכלים',
              confidence: 'low',
              notes: 'לא הצלחנו לזהות מאכלים בתמונה או במלל. אפשר לפרט עוד או לערוך ידנית.',
              items: [],
            });
          }
        } else {
          return Response.json({
            needs_clarification: false,
            meal_name: 'לא זוהו מאכלים',
            confidence: 'low',
            notes: 'לא הצלחנו לזהות מאכלים בתמונה. נסה לצלם מזווית אחרת עם תאורה טובה יותר.',
            items: [],
          });
        }
      }
    }

    const personalCorrections = await getPersonalCorrections(base44, user);

    // ── STEP 2: OpenAI — precise nutritional analysis per item (parallel) ──
    const enrichedItems = await Promise.all(
      visionResult.items.map(async (item) => {
        let nutrition;
        const hasLabelNutrition = Number(item.calories || 0) > 0 || Number(item.per100_kcal || 0) > 0;
        if (hasLabelNutrition) {
          nutrition = sanitizeNutritionForItem(item, {
            calories: Number(item.calories || 0),
            protein: Number(item.protein || 0),
            carbs: Number(item.carbs || 0),
            fat: Number(item.fat || 0),
            per100_kcal: Number(item.per100_kcal || 0),
            per100_protein: Number(item.per100_protein || 0),
            per100_carbs: Number(item.per100_carbs || 0),
            per100_fat: Number(item.per100_fat || 0),
            confidence_note: 'nutrition_label'
          });
        } else {
          try {
            nutrition = await getNutritionForItem(item);
          } catch (e) {
            console.warn('[NUTRITION_FALLBACK]', item.name_he, e.message);
            nutrition = estimateNutritionFallback(item);
          }
          nutrition = sanitizeNutritionForItem(item, nutrition);
        }
        return {
          name: item.name_he,
          name_en: item.name_en,
          preparation: item.preparation,
          grams: item.grams,
          calories: Math.round(nutrition.calories || 0),
          protein: Math.round((nutrition.protein || 0) * 10) / 10,
          carbs: Math.round((nutrition.carbs || 0) * 10) / 10,
          fat: Math.round((nutrition.fat || 0) * 10) / 10,
          per100_kcal: nutrition.per100_kcal || 0,
          per100_protein: nutrition.per100_protein || 0,
          per100_carbs: nutrition.per100_carbs || 0,
          per100_fat: nutrition.per100_fat || 0,
          nutrition_source: nutrition.confidence_note === 'fallback estimate' ? 'fallback_estimate' : 'ai_enriched',
          ai_confidence_note: item.assumption_note || nutrition.confidence_note || '',
          confidence: item.confidence || visionResult.confidence || 'medium'
        };
      })
    );

    const learnedItems = applyPersonalCorrections(enrichedItems, personalCorrections);
    const finalItems   = learnedItems.map(ensurePer100);

    return Response.json({
      needs_clarification: !!visionResult.needs_clarification && !user_answers,
      clarifying_questions: !user_answers ? (visionResult.clarifying_questions || []).slice(0, 3) : [],
      meal_name: visionResult.meal_name,
      confidence: visionResult.confidence,
      uncertainty_score: visionResult.uncertainty_score || null,
      notes: visionResult.notes,
      items: finalItems,
      analysis_engines: image_url ? 'gpt4o_vision + claude_nutrition' : 'smart_text_analysis + nutrition_estimator',
    });

  } catch (error) {
    console.error('[MAIN ERROR]', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});