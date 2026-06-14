import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    // Check if already initialized
    const existing = await base44.asServiceRole.entities.FoodUnit.filter({ scope_type: 'global' });
    if (existing.length > 0) {
      return Response.json({ 
        message: 'Units already initialized',
        count: existing.length 
      });
    }

    const globalUnits = [
      // בסיס
      { unit_name_he: 'גרם', grams_per_unit: 1, display_order: 1, is_default: true },
      { unit_name_he: '100 גרם', grams_per_unit: 100, display_order: 2 },
      
      // כפות וכפיות
      { unit_name_he: 'כפית שטוחה', grams_per_unit: 5, display_order: 10 },
      { unit_name_he: 'כפית גדושה', grams_per_unit: 7, display_order: 11 },
      { unit_name_he: 'כף שטוחה', grams_per_unit: 15, display_order: 12 },
      { unit_name_he: 'כף גדושה', grams_per_unit: 25, display_order: 13 },
      
      // כוסות ונוזלים
      { unit_name_he: 'כוס חד פעמית (200ml)', grams_per_unit: 200, display_order: 20 },
      { unit_name_he: 'כוס מדידה (240ml)', grams_per_unit: 240, display_order: 21 },
      { unit_name_he: 'בקבוק קטן (500ml)', grams_per_unit: 500, display_order: 22 },
      { unit_name_he: 'בקבוק גדול (1.5L)', grams_per_unit: 1500, display_order: 23 },
    ];

    const categoryUnits = [
      // ביצים
      { scope_type: 'category', scope_value: 'חלבון', unit_name_he: 'ביצה M', grams_per_unit: 50, display_order: 100 },
      { scope_type: 'category', scope_value: 'חלבון', unit_name_he: 'ביצה L', grams_per_unit: 60, display_order: 101 },
      
      // יוגורטים (category-level defaults)
      { scope_type: 'category', scope_value: 'חלב ומוצריו', unit_name_he: 'גביע (סטנדרטי)', grams_per_unit: 200, display_order: 80, is_default: true },
      { scope_type: 'category', scope_value: 'חלב ומוצריו', unit_name_he: 'גביע קטן', grams_per_unit: 150, display_order: 81 },
      { scope_type: 'category', scope_value: 'חלב ומוצריו', unit_name_he: 'גביע 250', grams_per_unit: 250, display_order: 82 },
      { scope_type: 'category', scope_value: 'חלב ומוצריו', unit_name_he: 'גביע משפחתי', grams_per_unit: 500, display_order: 83 },
      { scope_type: 'category', scope_value: 'חלב ומוצריו', unit_name_he: '1/2 גביע', grams_per_unit: 100, display_order: 84, notes: 'חצי גביע סטנדרטי' },
      { scope_type: 'category', scope_value: 'חלב ומוצריו', unit_name_he: '1/4 גביע', grams_per_unit: 50, display_order: 85, notes: 'רבע גביע סטנדרטי' },
      
      // לחמים ופיתות
      { scope_type: 'category', scope_value: 'דגנים', unit_name_he: 'פרוסת לחם רגילה', grams_per_unit: 30, display_order: 110 },
      { scope_type: 'category', scope_value: 'דגנים', unit_name_he: 'פרוסת לחם קל', grams_per_unit: 25, display_order: 111 },
      { scope_type: 'category', scope_value: 'דגנים', unit_name_he: 'פיתה רגילה', grams_per_unit: 90, display_order: 112 },
      { scope_type: 'category', scope_value: 'דגנים', unit_name_he: 'פיתה קטנה', grams_per_unit: 60, display_order: 113 },
      { scope_type: 'category', scope_value: 'דגנים', unit_name_he: 'טורטיה בינונית', grams_per_unit: 50, display_order: 114 },
      { scope_type: 'category', scope_value: 'דגנים', unit_name_he: 'טורטיה גדולה', grams_per_unit: 70, display_order: 115 },
      { scope_type: 'category', scope_value: 'דגנים', unit_name_he: 'לחמניה רגילה', grams_per_unit: 80, display_order: 116 },
      { scope_type: 'category', scope_value: 'דגנים', unit_name_he: 'בייגל', grams_per_unit: 95, display_order: 117 },
      
      // יוגורטים וגבינות
      { scope_type: 'category', scope_value: 'חלב ומוצריו', unit_name_he: 'גביע יוגורט קטן', grams_per_unit: 150, display_order: 120 },
      { scope_type: 'category', scope_value: 'חלב ומוצריו', unit_name_he: 'גביע יוגורט גדול', grams_per_unit: 200, display_order: 121 },
      { scope_type: 'category', scope_value: 'חלב ומוצריו', unit_name_he: 'גביע קוטג׳', grams_per_unit: 250, display_order: 122 },
      { scope_type: 'category', scope_value: 'חלב ומוצריו', unit_name_he: 'גביע גבינה לבנה', grams_per_unit: 250, display_order: 123 },
      
      // אורז ופסטה מבושלים
      { scope_type: 'category', scope_value: 'פחמימה', unit_name_he: 'כף אורז מבושל', grams_per_unit: 20, display_order: 130 },
      { scope_type: 'category', scope_value: 'פחמימה', unit_name_he: 'כוס אורז מבושל', grams_per_unit: 160, display_order: 131 },
      { scope_type: 'category', scope_value: 'פחמימה', unit_name_he: 'כף פסטה מבושלת', grams_per_unit: 20, display_order: 132 },
      { scope_type: 'category', scope_value: 'פחמימה', unit_name_he: 'כוס פסטה מבושלת', grams_per_unit: 140, display_order: 133 },
      
      // קטניות
      { scope_type: 'category', scope_value: 'קטניות', unit_name_he: 'כף קטניות מבושלות', grams_per_unit: 20, display_order: 140 },
      { scope_type: 'category', scope_value: 'קטניות', unit_name_he: 'כוס קטניות מבושלות', grams_per_unit: 160, display_order: 141 },
      
      // ירקות
      { scope_type: 'category', scope_value: 'ירקות', unit_name_he: 'עגבניה בינונית', grams_per_unit: 120, display_order: 150 },
      { scope_type: 'category', scope_value: 'ירקות', unit_name_he: 'מלפפון בינוני', grams_per_unit: 120, display_order: 151 },
      { scope_type: 'category', scope_value: 'ירקות', unit_name_he: 'גזר בינוני', grams_per_unit: 70, display_order: 152 },
      { scope_type: 'category', scope_value: 'ירקות', unit_name_he: 'פלפל בינוני', grams_per_unit: 150, display_order: 153 },
      { scope_type: 'category', scope_value: 'ירקות', unit_name_he: 'בצל בינוני', grams_per_unit: 110, display_order: 154 },
      
      // פירות
      { scope_type: 'category', scope_value: 'פירות', unit_name_he: 'בננה בינונית', grams_per_unit: 120, display_order: 160 },
      { scope_type: 'category', scope_value: 'פירות', unit_name_he: 'תפוח בינוני', grams_per_unit: 180, display_order: 161 },
      { scope_type: 'category', scope_value: 'פירות', unit_name_he: 'תפוז בינוני', grams_per_unit: 160, display_order: 162 },
      { scope_type: 'category', scope_value: 'פירות', unit_name_he: 'אבוקדו בינוני (חלק אכיל)', grams_per_unit: 140, display_order: 163 },
      { scope_type: 'category', scope_value: 'פירות', unit_name_he: 'תמר מג׳הול', grams_per_unit: 24, display_order: 164 },
      
      // שומנים וממרחים
      { scope_type: 'category', scope_value: 'שומן', unit_name_he: 'כפית שמן', grams_per_unit: 5, display_order: 170 },
      { scope_type: 'category', scope_value: 'שומן', unit_name_he: 'כף שמן', grams_per_unit: 14, display_order: 171 },
      { scope_type: 'category', scope_value: 'ממרח', unit_name_he: 'כפית טחינה', grams_per_unit: 7, display_order: 172 },
      { scope_type: 'category', scope_value: 'ממרח', unit_name_he: 'כף טחינה', grams_per_unit: 20, display_order: 173 },
      { scope_type: 'category', scope_value: 'ממרח', unit_name_he: 'כף חומוס', grams_per_unit: 25, display_order: 174 },
      { scope_type: 'category', scope_value: 'ממרח', unit_name_he: 'כף חמאת בוטנים', grams_per_unit: 16, display_order: 175 },
      { scope_type: 'category', scope_value: 'ממרח', unit_name_he: 'כפית חמאת בוטנים', grams_per_unit: 8, display_order: 176 },
      { scope_type: 'category', scope_value: 'ממרח', unit_name_he: 'כף ממרח שוקולד', grams_per_unit: 20, display_order: 177 },
    ];

    const allUnits = [
      ...globalUnits.map(u => ({ ...u, scope_type: 'global', scope_value: '', created_by: user.email })),
      ...categoryUnits.map(u => ({ ...u, created_by: user.email }))
    ];

    await base44.asServiceRole.entities.FoodUnit.bulkCreate(allUnits);

    return Response.json({
      success: true,
      message: `יחידות ברירת מחדל נוצרו בהצלחה`,
      total: allUnits.length,
      global: globalUnits.length,
      category: categoryUnits.length
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});