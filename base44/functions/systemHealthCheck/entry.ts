import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const checks = {};

    // 1) Auth available
    try {
      checks.auth = {
        status: 'ok',
        label: 'אימות משתמש',
        message: `משתמש מחובר: ${user.email}`
      };
    } catch (err) {
      checks.auth = {
        status: 'error',
        label: 'אימות משתמש',
        message: err.message
      };
    }

    // 2) Trainee exists
    try {
      const trainees = await base44.asServiceRole.entities.Trainee.filter({ user_id: user.id });
      checks.trainee = {
        status: trainees.length > 0 ? 'ok' : 'warning',
        label: 'פרופיל מתאמן',
        message: trainees.length > 0 ? 'פרופיל קיים' : 'אין פרופיל מתאמן',
        fixable: trainees.length === 0
      };
    } catch (err) {
      checks.trainee = {
        status: 'error',
        label: 'פרופיל מתאמן',
        message: err.message
      };
    }

    // 3) Home data queries
    try {
      const today = new Date().toISOString().split('T')[0];
      await base44.asServiceRole.entities.MealEntry.filter({ date: today }, null, 1);
      checks.homeData = {
        status: 'ok',
        label: 'נתוני דף הבית',
        message: 'שאילתות עובדות'
      };
    } catch (err) {
      checks.homeData = {
        status: 'error',
        label: 'נתוני דף הבית',
        message: err.message
      };
    }

    // 4) Meals CRUD
    try {
      const meals = await base44.asServiceRole.entities.MealEntry.list(null, 1);
      checks.meals = {
        status: 'ok',
        label: 'ארוחות',
        message: 'מערכת ארוחות תקינה'
      };
    } catch (err) {
      checks.meals = {
        status: 'error',
        label: 'ארוחות',
        message: err.message
      };
    }

    // 5) Workouts CRUD
    try {
      const workouts = await base44.asServiceRole.entities.WorkoutSession.list(null, 1);
      checks.workouts = {
        status: 'ok',
        label: 'אימונים',
        message: 'מערכת אימונים תקינה'
      };
    } catch (err) {
      checks.workouts = {
        status: 'error',
        label: 'אימונים',
        message: err.message
      };
    }

    // 6) Units/Portions
    try {
      const units = await base44.asServiceRole.entities.FoodUnit.list(null, 1);
      checks.units = {
        status: units.length > 0 ? 'ok' : 'warning',
        label: 'יחידות מזון',
        message: units.length > 0 ? 'יחידות קיימות' : 'יחידות ברירת מחדל חסרות',
        fixable: units.length === 0
      };
    } catch (err) {
      checks.units = {
        status: 'error',
        label: 'יחידות מזון',
        message: err.message
      };
    }

    // 7) Daily goals
    try {
      const trainees = await base44.asServiceRole.entities.Trainee.list(null, 1);
      const hasGoals = trainees.length > 0 && trainees[0].target_calories > 0;
      checks.goals = {
        status: hasGoals ? 'ok' : 'warning',
        label: 'יעדים יומיים',
        message: hasGoals ? 'יעדים מוגדרים' : 'יעדים חסרים',
        fixable: !hasGoals
      };
    } catch (err) {
      checks.goals = {
        status: 'error',
        label: 'יעדים יומיים',
        message: err.message
      };
    }

    return Response.json(checks);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});