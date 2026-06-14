export function validateMealData(aiResult, freeText) {
  const errors = [];
  const warnings = [];

  if (!aiResult || !aiResult.total) {
    return { valid: false, errors: ['חסרים נתונים בסיסיים'], warnings: [] };
  }

  const { total } = aiResult;

  // 1) בדיקת מאקרו שליליים
  if (total.protein < 0 || total.carbs < 0 || total.fat < 0) {
    errors.push('ערכי מאקרו לא יכולים להיות שליליים');
  }

  // 2) בדיקת התאמה בין קלוריות למאקרו
  const caloriesFromMacros = (total.protein * 4) + (total.carbs * 4) + (total.fat * 9);
  const difference = Math.abs(total.calories - caloriesFromMacros);
  const percentDifference = (difference / total.calories) * 100;

  if (percentDifference > 25) {
    errors.push(`אי-התאמה בין קלוריות (${total.calories}) למאקרו (${Math.round(caloriesFromMacros)} מחושב). הפער: ${Math.round(percentDifference)}%`);
  }

  // 3) כללי מינימום לפי מילות מפתח
  const textLower = freeText.toLowerCase();
  
  // באגט בלי כמות מספקת
  if (textLower.includes('באגט') && total.calories < 250) {
    errors.push('באגט צריך להכיל לפחות 250 קלוריות. האם זה חצי או שלם? ציין גרמים או גודל.');
  }

  // שניצל מטוגן בלי כמות מספקת
  if (textLower.includes('שניצל') && textLower.includes('מטוגן') && total.calories < 250) {
    errors.push('שניצל מטוגן צריך לפחות 250 קלוריות. כמה חתיכות? מה הגודל?');
  }

  // באגט + שניצל מטוגן (מנה מלאה)
  if (textLower.includes('באגט') && textLower.includes('שניצל') && textLower.includes('מטוגן') && total.calories < 550) {
    errors.push('באגט עם שניצל מטוגן צריך לפחות 550 קלוריות. ציין חצי/שלם באגט וכמה שניצלים.');
  }

  // 4) אזהרות
  if (total.calories > 2000) {
    warnings.push('ארוחה גדולה מאוד - האם הערכים נכונים?');
  }

  if (total.protein > 100) {
    warnings.push('כמות חלבון גבוהה מאוד - האם זה נכון?');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}