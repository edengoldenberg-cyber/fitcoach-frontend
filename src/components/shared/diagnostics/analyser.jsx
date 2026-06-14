/**
 * FitCoach Pro - Diagnostics Analyser
 * Rule-based analysis of diagnostic logs to identify root causes
 */

/**
 * Analyze diagnostic logs and identify issues
 * @param {array} logs - Array of log entries
 * @returns {object} Analysis result with summary, root cause, checks, and recommendations
 */
export const analyseLogs = (logs = []) => {
  const result = {
    summary: '',
    probableRootCause: '',
    lastAction: '',
    checks: [],
    recommendations: [],
    debug: {
      totalLogs: logs.length,
      errorCount: 0,
      warnCount: 0,
      lastActions: [],
      counts: {},
      filtersApplied: [],
      ids: {}
    }
  };

  if (logs.length === 0) {
    result.summary = 'אין לוגים זמינים לניתוח';
    result.probableRootCause = 'המערכת לא רשמה פעולות עדיין';
    return result;
  }

  // Gather basic stats
  result.debug.errorCount = logs.filter(l => l.level === 'error').length;
  result.debug.warnCount = logs.filter(l => l.level === 'warn').length;
  result.debug.lastActions = logs.slice(-10).map(l => l.action);
  result.lastAction = logs[logs.length - 1]?.action || 'unknown';

  // Extract meal suggestion flow
  const mealSuggestStart = logs.filter(l => l.action === 'MEAL_SUGGEST_START');
  const mealSuggestSources = logs.filter(l => l.action === 'MEAL_SUGGEST_SOURCES');
  const mealSuggestPreFilter = logs.filter(l => l.action === 'MEAL_SUGGEST_PRE_FILTER');
  const mealSuggestPostFilter = logs.filter(l => l.action === 'MEAL_SUGGEST_POST_FILTER');
  const mealSuggestResult = logs.filter(l => l.action === 'MEAL_SUGGEST_RESULT');
  const mealSuggestError = logs.filter(l => l.action === 'MEAL_SUGGEST_ERROR');

  // Extract coach recommendation import flow
  const coachRecImportStart = logs.filter(l => l.action === 'COACH_REC_IMPORT_START');
  const coachRecImportMatch = logs.filter(l => l.action === 'COACH_REC_IMPORT_MATCH');
  const coachRecImportSave = logs.filter(l => l.action === 'COACH_REC_IMPORT_SAVE');
  const coachRecImportError = logs.filter(l => l.action === 'COACH_REC_IMPORT_ERROR');

  // Store counts for debug
  result.debug.counts = {
    mealSuggestAttempts: mealSuggestStart.length,
    mealSuggestResults: mealSuggestResult.length,
    mealSuggestErrors: mealSuggestError.length,
    coachImports: coachRecImportStart.length
  };

  // CHECK 1: Meal suggestion errors
  if (mealSuggestError.length > 0) {
    const lastError = mealSuggestError[mealSuggestError.length - 1];
    result.checks.push({
      name: 'Meal Suggestion Errors',
      status: 'FAIL',
      details: `נמצאו ${mealSuggestError.length} שגיאות בניסיונות הצעת ארוחה: ${lastError.payload.error}`
    });
    result.probableRootCause = `שגיאה טכנית: ${lastError.payload.error}`;
    result.recommendations.push('בדוק את הקונסול לפרטים נוספים');
    result.recommendations.push('נסה לרענן את הדף');
  } else {
    result.checks.push({
      name: 'Meal Suggestion Errors',
      status: 'PASS',
      details: 'אין שגיאות טכניות'
    });
  }

  // CHECK 2: Data sources availability
  const lastSources = mealSuggestSources[mealSuggestSources.length - 1];
  if (lastSources) {
    const { coachRecommendedCount = 0, traineeFavoritesCount = 0, globalFallbackCount = 0 } = lastSources.payload;
    result.debug.counts.coachRecommended = coachRecommendedCount;
    result.debug.counts.traineeFavorites = traineeFavoritesCount;
    result.debug.counts.globalFallback = globalFallbackCount;

    const totalSources = coachRecommendedCount + traineeFavoritesCount + globalFallbackCount;

    if (totalSources === 0) {
      result.checks.push({
        name: 'Data Sources',
        status: 'FAIL',
        details: 'אין מקורות נתונים זמינים (לא מועדפים, לא המלצות מאמן, לא fallback)'
      });
      result.probableRootCause = 'אין מוצרי מזון זמינים במערכת';
      result.recommendations.push('מאמן: הוסף מוצרים מומלצים דרך מסך "מומלצים מהמאמן"');
      result.recommendations.push('מתאמן: הוסף מוצרי מזון למועדפים');
    } else if (coachRecommendedCount === 0 && traineeFavoritesCount === 0) {
      result.checks.push({
        name: 'Data Sources',
        status: 'WARN',
        details: `יש fallback בלבד (${globalFallbackCount} מוצרים). אין מועדפים אישיים או המלצות מאמן`
      });
      result.recommendations.push('מאמן: הוסף מוצרים מומלצים לשיפור ההצעות');
      result.recommendations.push('מתאמן: סמן מוצרים כמועדפים');
    } else {
      result.checks.push({
        name: 'Data Sources',
        status: 'PASS',
        details: `זמינים: ${coachRecommendedCount} המלצות מאמן, ${traineeFavoritesCount} מועדפים אישיים, ${globalFallbackCount} fallback`
      });
    }
  }

  // CHECK 3: Filter drop-off
  const lastPreFilter = mealSuggestPreFilter[mealSuggestPreFilter.length - 1];
  const lastPostFilter = mealSuggestPostFilter[mealSuggestPostFilter.length - 1];

  if (lastPreFilter && lastPostFilter) {
    const preCount = lastPreFilter.payload.candidatesCount || 0;
    const postCount = lastPostFilter.payload.candidatesCount || 0;
    const filtersApplied = lastPostFilter.payload.filtersApplied || [];
    result.debug.filtersApplied = filtersApplied;

    if (preCount > 0 && postCount === 0) {
      result.checks.push({
        name: 'Filter Impact',
        status: 'FAIL',
        details: `היו ${preCount} מוצרים לפני פילטרים, אך 0 אחרי הפילטרים. הפילטרים הבאים הפילו הכל: ${filtersApplied.join(', ')}`
      });
      result.probableRootCause = `הפילטרים (${filtersApplied.join(', ')}) הפילו את כל המוצרים הזמינים`;
      result.recommendations.push('בדוק התאמה בין סוג הארוחה (בוקר/צהריים/ערב) למוצרים במאגר');
      result.recommendations.push('בדוק אם יש הגדרות דיאטה/קטגוריה ספציפיות שמרוקנות הכל');
      result.recommendations.push('מאמן: ודא שהמוצרים המומלצים מסומנים עם meal_type="any" או מתאימים לארוחה');
    } else if (preCount > postCount * 3) {
      result.checks.push({
        name: 'Filter Impact',
        status: 'WARN',
        details: `הפילטרים הפחיתו מ-${preCount} ל-${postCount} מוצרים (${Math.round((1 - postCount/preCount)*100)}% הפילו)`
      });
      result.recommendations.push('שקול להרחיב את הגדרות הפילטרים למגוון רחב יותר');
    } else {
      result.checks.push({
        name: 'Filter Impact',
        status: 'PASS',
        details: `הפילטרים פעלו סביר: ${preCount} → ${postCount} מוצרים`
      });
    }
  }

  // CHECK 4: Final result quality
  const lastResult = mealSuggestResult[mealSuggestResult.length - 1];
  if (lastResult) {
    const { resultCount = 0, topItemsSample = [] } = lastResult.payload;

    if (resultCount === 0) {
      result.checks.push({
        name: 'Suggestion Result',
        status: 'FAIL',
        details: 'לא נוצרו הצעות ארוחה'
      });
      if (!result.probableRootCause) {
        result.probableRootCause = 'אלגוריתם ההצעות לא מצא מוצרים מתאימים';
      }
    } else if (resultCount < 3) {
      result.checks.push({
        name: 'Suggestion Result',
        status: 'WARN',
        details: `נוצרו רק ${resultCount} הצעות (מתחת ל-3)`
      });
      result.recommendations.push('הוסף עוד מוצרים למאגר לשיפור מגוון ההצעות');
    } else {
      result.checks.push({
        name: 'Suggestion Result',
        status: 'PASS',
        details: `נוצרו ${resultCount} הצעות בהצלחה. דוגמאות: ${topItemsSample.slice(0, 3).join(', ')}`
      });
    }
  }

  // CHECK 5: Coach import issues
  const lastImportMatch = coachRecImportMatch[coachRecImportMatch.length - 1];
  if (lastImportMatch) {
    const { matchedCount = 0, notFoundCount = 0, ambiguousCount = 0 } = lastImportMatch.payload;
    const totalImport = matchedCount + notFoundCount + ambiguousCount;

    if (notFoundCount > totalImport * 0.5) {
      result.checks.push({
        name: 'Coach Import Quality',
        status: 'WARN',
        details: `רוב המוצרים בייבוא לא נמצאו (${notFoundCount}/${totalImport}). יכול להיות חוסר התאמה בשמות`
      });
      result.recommendations.push('בדוק את שמות המוצרים - האם יש הבדלים קטנים (רווחים, אותיות)?');
      result.recommendations.push('נסה לנרמל שמות (להסיר רווחים כפולים, לאחד יחידים/רבים)');
    } else if (ambiguousCount > 5) {
      result.checks.push({
        name: 'Coach Import Quality',
        status: 'WARN',
        details: `${ambiguousCount} מוצרים התאימו למספר רשומות - צריך הבהרה`
      });
      result.recommendations.push('השתמש בפורמט "שם מוצר | ID" לייבוא מדויק');
    } else if (coachRecImportMatch.length > 0) {
      result.checks.push({
        name: 'Coach Import Quality',
        status: 'PASS',
        details: `ייבוא הצליח: ${matchedCount} מוצרים הותאמו, ${notFoundCount} לא נמצאו`
      });
    }
  }

  // CHECK 6: Import errors
  if (coachRecImportError.length > 0) {
    result.checks.push({
      name: 'Coach Import Errors',
      status: 'FAIL',
      details: `נכשל ייבוא מוצרים מומלצים (${coachRecImportError.length} שגיאות)`
    });
    result.recommendations.push('בדוק את הרשאות המשתמש');
    result.recommendations.push('ודא שהמאמן מחובר ופעיל');
  }

  // Generate summary
  const passCount = result.checks.filter(c => c.status === 'PASS').length;
  const warnCount = result.checks.filter(c => c.status === 'WARN').length;
  const failCount = result.checks.filter(c => c.status === 'FAIL').length;

  result.summary = `${passCount} ✅ | ${warnCount} ⚠️ | ${failCount} ❌`;

  if (!result.probableRootCause) {
    if (failCount === 0 && warnCount === 0) {
      result.probableRootCause = 'כל המערכות תקינות';
    } else if (failCount > 0) {
      result.probableRootCause = 'קיימות בעיות קריטיות שדורשות תיקון';
    } else {
      result.probableRootCause = 'המערכת פועלת אך יש אזורים לשיפור';
    }
  }

  return result;
};