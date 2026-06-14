/**
 * Meal Styles Configuration
 * Defines meal archetypes with bases, toppings, and constraints
 */

export const MEAL_STYLES = {
  breakfast: {
    SWEET_BOWL: {
      id: 'SWEET_BOWL',
      name: 'קערה מתוקה 🥣',
      description: 'יוגורט/דייסה + גרנולה + פרי',
      bases: ['יוגורט', 'דייסה', 'פתיתים'],
      allowedToppings: ['פרי', 'גרנולה', 'דבש', 'אגוזים', 'גרעינים'],
      forbiddenToppings: ['בשר', 'עוף', 'דגים', 'טונה', 'ביצים', 'גבינה'],
      maxItems: 4,
      complexity: 'simple'
    },
    SAVORY_PLATE: {
      id: 'SAVORY_PLATE',
      name: 'צלחת מלוחה 🍳',
      description: 'ביצים/גבינה + ירקות + לחם',
      bases: ['ביצים', 'גבינה לבנה', 'גבינת שמנת'],
      allowedToppings: ['ירקות', 'עגבניה', 'מלפפון', 'בצל', 'זיתון', 'טחינה', 'לחם'],
      forbiddenToppings: ['בשר', 'עוף', 'דגים', 'טונה', 'פרי', 'מתוקים', 'דבש'],
      maxItems: 4,
      complexity: 'simple'
    },
    SANDWICH: {
      id: 'SANDWICH',
      name: 'כריך 🥪',
      description: 'לחם + חלבון + ירקות',
      bases: ['לחם', 'לחם כוסמת', 'לחם קמח'],
      allowedToppings: ['עוף משולש', 'טונה', 'גבינה', 'ביצה', 'חמוס', 'עגבניה', 'מלפפון', 'טחינה', 'חרדל'],
      forbiddenToppings: ['בשר אדום', 'שוקולד', 'מתוקים', 'דבש'],
      maxItems: 4,
      complexity: 'medium'
    },
    SHAKE: {
      id: 'SHAKE',
      name: 'שייק חלבון 🥤',
      description: 'סקופ/יוגורט + פרי + נוזל',
      bases: ['סקופ חלבון', 'יוגורט יווני', 'חלב'],
      allowedToppings: ['פרי', 'בננה', 'תותים', 'מנגו', 'קוקוס', 'דבש', 'מקימה'],
      forbiddenToppings: ['בשר', 'עוף', 'דגים', 'טונה', 'ביצים', 'גבינה', 'ירקות'],
      maxItems: 3,
      complexity: 'simple'
    }
  },
  lunch: {
    PROTEIN_BOWL: {
      id: 'PROTEIN_BOWL',
      name: 'קערת חלבון 🍗',
      description: 'חלבון (עוף/דגים/טונה) + פחמימה + ירקות',
      bases: ['עוף', 'דגים', 'טונה', 'חומוס'],
      allowedToppings: ['סלט', 'עדשים', 'אורז', 'תפוח אדמה', 'גרעינים'],
      forbiddenToppings: ['מתוקים', 'שוקולד', 'דבש'],
      maxItems: 5,
      complexity: 'medium'
    },
    SALAD_WITH_PROTEIN: {
      id: 'SALAD_WITH_PROTEIN',
      name: 'סלט עם חלבון 🥗',
      description: 'סלט רחב + חלבון + חומץ/שמן',
      bases: ['סלט עדנים', 'סלט רומא', 'ספינאץ'],
      allowedToppings: ['עוף', 'דגים', 'טונה', 'עירוק', 'לימון', 'זיתונים', 'אגוזים'],
      forbiddenToppings: ['מתוקים', 'שוקולד'],
      maxItems: 5,
      complexity: 'simple'
    }
  },
  dinner: {
    PROTEIN_PLATE: {
      id: 'PROTEIN_PLATE',
      name: 'צלחת חלבון 🥩',
      description: 'חלבון + סיד פחמימות + ירקות',
      bases: ['עוף', 'דגים', 'טונה'],
      allowedToppings: ['אורז', 'תפוח אדמה', 'אפונה', 'ירקות אפויים', 'סלט'],
      forbiddenToppings: ['מתוקים', 'שוקולד'],
      maxItems: 5,
      complexity: 'medium'
    },
    LIGHT_PLATE: {
      id: 'LIGHT_PLATE',
      name: 'צלחת קלה 🥬',
      description: 'חלבון + ירקות (פחות פחמימות)',
      bases: ['דגים לבנים', 'עוף', 'טופו'],
      allowedToppings: ['ברוקולי', 'גזר', 'בצל', 'עגבניה', 'זוקיני'],
      forbiddenToppings: ['מתוקים', 'פחמימות כבדות'],
      maxItems: 4,
      complexity: 'simple'
    }
  }
};

/**
 * Base foods mapping - maps style bases to actual food items
 */
export const BASE_FOOD_CATEGORIES = {
  'יוגורט': ['יוגורט יווני', 'יוגורט יווני 0%', 'יוגורט 2%'],
  'דייסה': ['דייסה אפלה', 'דייסה חיטה'],
  'פתיתים': ['קורנפלקס', 'שיבולת שועל', 'פתיתי שיבולת'],
  'ביצים': ['ביצים', 'ביצה'],
  'גבינה לבנה': ['גבינה לבנה', 'קוטג\' גבינה'],
  'גבינת שמנת': ['גבינת שמנת', 'גבינה לבנה שמנת'],
  'לחם': ['לחם קמח', 'לחם לבן'],
  'לחם כוסמת': ['לחם כוסמת'],
  'לחם קמח': ['לחם קמח'],
  'עוף משולש': ['עוף משולש מבושל', 'עוף'],
  'סקופ חלבון': ['סקופ חלבון'],
  'יוגורט יווני': ['יוגורט יווני 0%', 'יוגורט יווני 2%'],
  'חלב': ['חלב 2%', 'חלב 1%'],
  'חומוס': ['חומוס'],
  'עדשים': ['עדשים אדומות', 'עדשים ירוקות'],
  'אורז': ['אורז לבן', 'אורז חום'],
  'תפוח אדמה': ['תפוח אדמה'],
  'דגים': ['דגים לבנים', 'סלמון'],
  'סלמון': ['סלמון'],
  'טונה': ['טונה שימורים'],
  'טופו': ['טופו']
};

/**
 * Check if food belongs to category in meal style
 */
export function foodMatchesCategory(foodName, category) {
  const normalized = foodName.toLowerCase().trim();
  const categoryFoods = BASE_FOOD_CATEGORIES[category] || [];
  
  return categoryFoods.some(cat => 
    normalized.includes(cat.toLowerCase()) || 
    cat.toLowerCase().includes(normalized.substring(0, 4))
  );
}

/**
 * Get applicable styles for a meal type
 */
export function getStylesForMeal(mealType) {
  return MEAL_STYLES[mealType] || MEAL_STYLES.lunch;
}

/**
 * Score a style based on available foods
 */
export function scoreStyleForAvailableFoods(style, availableFoods) {
  let score = 0;
  
  // Check base availability
  const baseAvailable = style.bases.some(base => 
    availableFoods.some(food => foodMatchesCategory(food.name_he, base))
  );
  
  if (baseAvailable) score += 100;
  
  // Check topping availability
  const availableToppings = style.allowedToppings.filter(topping =>
    availableFoods.some(food => foodMatchesCategory(food.name_he, topping))
  );
  
  score += availableToppings.length * 20;
  
  return score;
}