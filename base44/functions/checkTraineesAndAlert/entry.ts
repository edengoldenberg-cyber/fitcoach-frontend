import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const alerts = [];
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];
    
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];
    
    const threeWeeksAgo = new Date(today);
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
    const threeWeeksAgoStr = threeWeeksAgo.toISOString().split('T')[0];

    // Get all active trainees
    const allTrainees = await base44.asServiceRole.entities.Trainee.filter({ status: 'active' });
    
    // Get all data
    const allMeals = await base44.asServiceRole.entities.MealEntry.list('-date', 5000);
    const allWorkouts = await base44.asServiceRole.entities.WorkoutSession.list('-date', 5000);
    const allWater = await base44.asServiceRole.entities.WaterEntry.list('-date', 5000);

    for (const trainee of allTrainees) {
      const coachEmail = trainee.coach_email;
      const traineeEmail = trainee.user_email;
      
      // Check 1: No activity for 3 consecutive days
      const last3DaysMeals = allMeals.filter(m => 
        m.trainee_email === traineeEmail && m.date >= threeDaysAgoStr
      );
      const last3DaysWorkouts = allWorkouts.filter(w => 
        w.trainee_email === traineeEmail && w.date >= threeDaysAgoStr
      );
      const last3DaysWater = allWater.filter(w => 
        w.trainee_email === traineeEmail && w.date >= threeDaysAgoStr
      );
      
      const hasAnyActivity = last3DaysMeals.length > 0 || last3DaysWorkouts.length > 0 || last3DaysWater.length > 0;
      
      if (!hasAnyActivity) {
        const lastMeal = allMeals.find(m => m.trainee_email === traineeEmail);
        const lastWorkout = allWorkouts.find(w => w.trainee_email === traineeEmail);
        const lastWater = allWater.find(w => w.trainee_email === traineeEmail);
        
        const lastActivity = [lastMeal?.date, lastWorkout?.date, lastWater?.date]
          .filter(Boolean)
          .sort()
          .reverse()[0];
        
        alerts.push({
          coach_email: coachEmail,
          trainee_email: traineeEmail,
          trainee_name: trainee.full_name,
          alert_type: 'inactive_3_days',
          severity: 'high',
          title: `${trainee.full_name} - 3 ימים ללא פעילות`,
          summary: `המתאמן לא עדכן שום נתונים (תזונה, אימון, מים) ב-3 ימים אחרונים. פעילות אחרונה: ${lastActivity || 'לא זוהה'}`,
          data_snapshot: {
            last_activity: lastActivity,
            days_inactive: 3
          }
        });
      }
      
      // Check 2: Declining metrics over 2 weeks
      const last2WeeksMeals = allMeals.filter(m => 
        m.trainee_email === traineeEmail && m.date >= twoWeeksAgoStr
      );
      const last2WeeksWorkouts = allWorkouts.filter(w => 
        w.trainee_email === traineeEmail && w.date >= twoWeeksAgoStr
      );
      
      if (last2WeeksMeals.length > 0 || last2WeeksWorkouts.length > 0) {
        // Split into week 1 and week 2
        const oneWeekAgo = new Date(today);
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const oneWeekAgoStr = oneWeekAgo.toISOString().split('T')[0];
        
        const week1Meals = last2WeeksMeals.filter(m => m.date >= oneWeekAgoStr);
        const week2Meals = last2WeeksMeals.filter(m => m.date < oneWeekAgoStr);
        const week1Workouts = last2WeeksWorkouts.filter(w => w.date >= oneWeekAgoStr);
        const week2Workouts = last2WeeksWorkouts.filter(w => w.date < oneWeekAgoStr);
        
        const avgCalWeek1 = week1Meals.length > 0 
          ? week1Meals.reduce((sum, m) => sum + (m.calories || 0), 0) / week1Meals.length
          : 0;
        const avgCalWeek2 = week2Meals.length > 0 
          ? week2Meals.reduce((sum, m) => sum + (m.calories || 0), 0) / week2Meals.length
          : 0;
        
        const workoutsWeek1 = week1Workouts.length;
        const workoutsWeek2 = week2Workouts.length;
        
        const calorieDecline = avgCalWeek2 > 0 && avgCalWeek1 < avgCalWeek2 * 0.8;
        const workoutDecline = workoutsWeek2 > 0 && workoutsWeek1 < workoutsWeek2 * 0.5;
        
        if (calorieDecline || workoutDecline) {
          const issues = [];
          if (calorieDecline) issues.push(`קלוריות ירדו מ-${Math.round(avgCalWeek2)} ל-${Math.round(avgCalWeek1)}`);
          if (workoutDecline) issues.push(`אימונים ירדו מ-${workoutsWeek2} ל-${workoutsWeek1}/שבוע`);
          
          alerts.push({
            coach_email: coachEmail,
            trainee_email: traineeEmail,
            trainee_name: trainee.full_name,
            alert_type: 'declining_metrics',
            severity: 'medium',
            title: `${trainee.full_name} - ירידה במדדים`,
            summary: `זוהתה ירידה משמעותית ב-2 שבועות אחרונים: ${issues.join(', ')}. כדאי לברר מה קורה.`,
            data_snapshot: {
              week1_calories: Math.round(avgCalWeek1),
              week2_calories: Math.round(avgCalWeek2),
              week1_workouts: workoutsWeek1,
              week2_workouts: workoutsWeek2
            }
          });
        }
      }
      
      // Check 3: Excellent performance (90%+ compliance for 3 weeks)
      const last3WeeksMeals = allMeals.filter(m => 
        m.trainee_email === traineeEmail && m.date >= threeWeeksAgoStr
      );
      const last3WeeksWorkouts = allWorkouts.filter(w => 
        w.trainee_email === traineeEmail && w.date >= threeWeeksAgoStr
      );
      const last3WeeksWater = allWater.filter(w => 
        w.trainee_email === traineeEmail && w.date >= threeWeeksAgoStr
      );
      
      const nutritionDays = new Set(last3WeeksMeals.map(m => m.date)).size;
      const workoutDays = last3WeeksWorkouts.length;
      const waterDays = new Set(last3WeeksWater.map(w => w.date)).size;
      
      const nutritionRate = (nutritionDays / 21) * 100;
      const workoutRate = (workoutDays / 9) * 100; // 3 workouts/week * 3 weeks
      const waterRate = (waterDays / 21) * 100;
      
      const overallCompliance = (nutritionRate * 0.4) + (workoutRate * 0.3) + (waterRate * 0.3);
      
      if (overallCompliance >= 90) {
        alerts.push({
          coach_email: coachEmail,
          trainee_email: traineeEmail,
          trainee_name: trainee.full_name,
          alert_type: 'excellent_performance',
          severity: 'low',
          title: `${trainee.full_name} - ביצועים מצוינים! 🔥`,
          summary: `המתאמן משיג ${Math.round(overallCompliance)}% התמדה ב-3 שבועות אחרונים! תזונה: ${Math.round(nutritionRate)}%, אימונים: ${Math.round(workoutRate)}%, מים: ${Math.round(waterRate)}%. כדאי לעודד ולחזק!`,
          data_snapshot: {
            overall_compliance: Math.round(overallCompliance),
            nutrition_rate: Math.round(nutritionRate),
            workout_rate: Math.round(workoutRate),
            water_rate: Math.round(waterRate)
          }
        });
      }
    }

    // Save alerts to database (avoid duplicates by checking last 24h)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const existingAlerts = await base44.asServiceRole.entities.CoachAlert.filter({
      created_date: { $gte: yesterday.toISOString() }
    });

    const newAlerts = [];
    for (const alert of alerts) {
      const isDuplicate = existingAlerts.some(existing => 
        existing.trainee_email === alert.trainee_email &&
        existing.alert_type === alert.alert_type &&
        !existing.is_dismissed
      );
      
      if (!isDuplicate) {
        const created = await base44.asServiceRole.entities.CoachAlert.create(alert);
        newAlerts.push(created);
      }
    }

    return Response.json({
      success: true,
      alerts_checked: allTrainees.length,
      new_alerts_created: newAlerts.length,
      alerts: newAlerts
    });

  } catch (error) {
    console.error('Error checking trainees:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});