import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const coach = await base44.auth.me();

    if (!coach) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { traineeEmail } = await req.json();

    if (!traineeEmail) {
      return Response.json({ error: 'traineeEmail required' }, { status: 400 });
    }

    // Fetch trainee
    const trainees = await base44.asServiceRole.entities.Trainee.filter({ user_email: traineeEmail });
    if (!trainees || trainees.length === 0) {
      return Response.json({ error: 'Trainee not found' }, { status: 404 });
    }
    const trainee = trainees[0];

    const results = {
      trainee: {
        id: trainee.id,
        name: trainee.full_name,
        email: trainee.user_email,
      },
      timestamp: new Date().toISOString(),
      tests: [],
      summary: { passed: 0, failed: 0, warnings: 0 },
      overallStatus: 'passed',
    };

    // Test A: Auth & Permissions
    try {
      if (!trainee.user_id) {
        results.tests.push({
          category: 'Auth',
          name: 'User ID exists',
          status: 'failed',
          error: 'trainee.user_id is missing - run Backfill tool',
          details: 'Go to Manage Trainees → Fix user_id button',
        });
        results.summary.failed++;
      } else {
        results.tests.push({
          category: 'Auth',
          name: 'User ID exists',
          status: 'passed',
          details: `user_id: ${trainee.user_id.substring(0, 8)}...`,
        });
        results.summary.passed++;

        // Verify auth user exists
        try {
          const authUser = await base44.asServiceRole.entities.User.get(trainee.user_id);
          if (authUser) {
            results.tests.push({
              category: 'Auth',
              name: 'Auth user exists',
              status: 'passed',
              details: `Email: ${authUser.email}`,
            });
            results.summary.passed++;
          } else {
            results.tests.push({
              category: 'Auth',
              name: 'Auth user exists',
              status: 'failed',
              error: 'Auth user not found - orphaned user_id',
            });
            results.summary.failed++;
          }
        } catch (err) {
          results.tests.push({
            category: 'Auth',
            name: 'Auth user exists',
            status: 'failed',
            error: err.message,
          });
          results.summary.failed++;
        }
      }
    } catch (err) {
      results.tests.push({
        category: 'Auth',
        name: 'User ID check',
        status: 'failed',
        error: err.message,
      });
      results.summary.failed++;
    }

    // Test B: Meals CRUD
    const today = new Date().toISOString().split('T')[0];
    let testMealId = null;
    
    // B1: Create test meal
    try {
      const testMeal = await base44.asServiceRole.entities.MealEntry.create({
        trainee_email: traineeEmail,
        date: today,
        meal_type: 'snack',
        food_name: '[QA-TEST] בדיקה אוטומטית',
        quantity: 100,
        unit: 'gram',
        calories: 50,
        protein: 5,
        carbs: 5,
        fat: 1,
      });
      testMealId = testMeal.id;
      results.tests.push({
        category: 'Meals',
        name: 'Create meal',
        status: 'passed',
        details: `Meal created: ${testMealId}`,
      });
      results.summary.passed++;
    } catch (err) {
      results.tests.push({
        category: 'Meals',
        name: 'Create meal',
        status: 'failed',
        error: err.message,
      });
      results.summary.failed++;
    }

    // B2: Verify read
    if (testMealId) {
      try {
        const meals = await base44.asServiceRole.entities.MealEntry.filter({
          trainee_email: traineeEmail,
          date: today,
        });
        const foundMeal = meals.find(m => m.id === testMealId);
        if (foundMeal) {
          results.tests.push({
            category: 'Meals',
            name: 'Read meal',
            status: 'passed',
          });
          results.summary.passed++;
        } else {
          results.tests.push({
            category: 'Meals',
            name: 'Read meal',
            status: 'failed',
            error: 'Created meal not found in query',
          });
          results.summary.failed++;
        }
      } catch (err) {
        results.tests.push({
          category: 'Meals',
          name: 'Read meal',
          status: 'failed',
          error: err.message,
        });
        results.summary.failed++;
      }
    }

    // B3: Update meal
    if (testMealId) {
      try {
        await base44.asServiceRole.entities.MealEntry.update(testMealId, {
          quantity: 150,
          calories: 75,
        });
        results.tests.push({
          category: 'Meals',
          name: 'Update meal',
          status: 'passed',
        });
        results.summary.passed++;
      } catch (err) {
        results.tests.push({
          category: 'Meals',
          name: 'Update meal',
          status: 'failed',
          error: err.message,
        });
        results.summary.failed++;
      }
    }

    // B4: Totals calculation (smoke test)
    try {
      const allMeals = await base44.asServiceRole.entities.MealEntry.filter({
        trainee_email: traineeEmail,
        date: today,
      });
      const totals = allMeals.reduce((acc, m) => ({
        calories: acc.calories + (m.calories || 0),
        protein: acc.protein + (m.protein || 0),
      }), { calories: 0, protein: 0 });
      
      if (totals.calories >= 0 && totals.protein >= 0) {
        results.tests.push({
          category: 'Meals',
          name: 'Totals calculation',
          status: 'passed',
          details: `${totals.calories} cal, ${totals.protein}g protein`,
        });
        results.summary.passed++;
      }
    } catch (err) {
      results.tests.push({
        category: 'Meals',
        name: 'Totals calculation',
        status: 'failed',
        error: err.message,
      });
      results.summary.failed++;
    }

    // Test C: Workouts CRUD
    let testWorkoutId = null;
    
    // C1: Create test workout
    try {
      const testWorkout = await base44.asServiceRole.entities.WorkoutSession.create({
        trainee_email: traineeEmail,
        date: today,
        title: '[QA-TEST] אימון בדיקה',
        duration_minutes: 45,
      });
      testWorkoutId = testWorkout.id;
      results.tests.push({
        category: 'Workouts',
        name: 'Create workout',
        status: 'passed',
        details: `Workout created: ${testWorkoutId}`,
      });
      results.summary.passed++;
    } catch (err) {
      results.tests.push({
        category: 'Workouts',
        name: 'Create workout',
        status: 'failed',
        error: err.message,
      });
      results.summary.failed++;
    }

    // C2: Verify workout read
    if (testWorkoutId) {
      try {
        const workouts = await base44.asServiceRole.entities.WorkoutSession.filter({
          trainee_email: traineeEmail,
          date: today,
        });
        const foundWorkout = workouts.find(w => w.id === testWorkoutId);
        if (foundWorkout) {
          results.tests.push({
            category: 'Workouts',
            name: 'Read workout',
            status: 'passed',
          });
          results.summary.passed++;
        } else {
          results.tests.push({
            category: 'Workouts',
            name: 'Read workout',
            status: 'failed',
            error: 'Workout not found or exercises missing',
          });
          results.summary.failed++;
        }
      } catch (err) {
        results.tests.push({
          category: 'Workouts',
          name: 'Read workout',
          status: 'failed',
          error: err.message,
        });
        results.summary.failed++;
      }
    }

    // Test D: Metrics CRUD
    let testMetricId = null;
    
    // D1: Create test metric
    try {
      const testMetric = await base44.asServiceRole.entities.MetricsEntry.create({
        trainee_email: traineeEmail,
        date: today,
        weight_kg: 75.5,
        body_fat_percent: 18.5,
        source: 'manual',
      });
      testMetricId = testMetric.id;
      results.tests.push({
        category: 'Metrics',
        name: 'Create metric',
        status: 'passed',
        details: `Metric created: ${testMetricId}`,
      });
      results.summary.passed++;
    } catch (err) {
      results.tests.push({
        category: 'Metrics',
        name: 'Create metric',
        status: 'failed',
        error: err.message,
      });
      results.summary.failed++;
    }

    // D2: Verify metric read
    if (testMetricId) {
      try {
        const metrics = await base44.asServiceRole.entities.MetricsEntry.filter({
          trainee_email: traineeEmail,
          date: today,
        });
        const foundMetric = metrics.find(m => m.id === testMetricId);
        if (foundMetric) {
          results.tests.push({
            category: 'Metrics',
            name: 'Read metric',
            status: 'passed',
          });
          results.summary.passed++;
        } else {
          results.tests.push({
            category: 'Metrics',
            name: 'Read metric',
            status: 'failed',
            error: 'Metric not found',
          });
          results.summary.failed++;
        }
      } catch (err) {
        results.tests.push({
          category: 'Metrics',
          name: 'Read metric',
          status: 'failed',
          error: err.message,
        });
        results.summary.failed++;
      }
    }

    // Cleanup: Delete test data
    try {
      if (testMealId) {
        await base44.asServiceRole.entities.MealEntry.delete(testMealId);
      }
      if (testWorkoutId) {
        await base44.asServiceRole.entities.WorkoutSession.delete(testWorkoutId);
      }
      if (testMetricId) {
        await base44.asServiceRole.entities.MetricsEntry.delete(testMetricId);
      }
      results.tests.push({
        category: 'Cleanup',
        name: 'Delete test data',
        status: 'passed',
      });
      results.summary.passed++;
    } catch (err) {
      results.tests.push({
        category: 'Cleanup',
        name: 'Delete test data',
        status: 'warning',
        error: err.message,
      });
      results.summary.warnings++;
    }

    // Overall status
    if (results.summary.failed > 0) {
      results.overallStatus = 'failed';
    } else if (results.summary.warnings > 0) {
      results.overallStatus = 'warning';
    }

    return Response.json(results);
  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
});