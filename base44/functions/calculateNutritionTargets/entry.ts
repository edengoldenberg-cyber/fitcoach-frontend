import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Calculate nutrition targets using Mifflin-St Jeor formula.
 * 
 * Input:
 * {
 *   traineeEmail: string,
 *   weight_kg: number,
 *   height_cm: number,
 *   birth_date: string (YYYY-MM-DD) | age: number,
 *   gender: "male" | "female",
 *   activity_routine: "sedentary" | "light_activity" | "moderate_activity" | "active" | "very_active",
 *   training_days_per_week: number,
 *   training_type: "strength" | "pilates" | "cardio" | "mixed" | "none",
 *   goal: "fat_loss" | "maintenance" | "muscle_gain" | "recomposition",
 *   pace: "slow" | "moderate" | "aggressive"
 * }
 * 
 * Returns:
 * {
 *   ok: true,
 *   bmr: number,
 *   tdee: number,
 *   daily_calories: number,
 *   daily_protein_g: number,
 *   daily_carbs_g: number,
 *   daily_fat_g: number,
 *   daily_water_ml: number,
 *   summary: string
 * }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const {
      traineeEmail,
      weight_kg,
      height_cm,
      birth_date,
      age,
      gender,
      activity_routine,
      training_days_per_week = 0,
      training_type = 'none',
      goal,
      pace = 'moderate'
    } = payload;

    // Validate inputs
    if (!traineeEmail || !weight_kg || !height_cm || !gender || !activity_routine || !goal) {
      return Response.json({
        error: 'Missing required fields: traineeEmail, weight_kg, height_cm, gender, activity_routine, goal'
      }, { status: 400 });
    }

    // Calculate age if not provided
    let ageYears = age;
    if (!ageYears && birth_date) {
      const birthDate = new Date(birth_date);
      const today = new Date();
      ageYears = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        ageYears--;
      }
    }

    if (!ageYears) {
      return Response.json({
        error: 'Must provide either age or birth_date'
      }, { status: 400 });
    }

    // === STEP 1: Calculate BMR (Mifflin-St Jeor) ===
    let bmr;
    if (gender === 'male') {
      bmr = 10 * weight_kg + 6.25 * height_cm - 5 * ageYears + 5;
    } else {
      bmr = 10 * weight_kg + 6.25 * height_cm - 5 * ageYears - 161;
    }

    // === STEP 2: Apply Activity Multiplier ===
    const activityMultipliers = {
      'sedentary': 1.2,
      'light_activity': 1.375,
      'moderate_activity': 1.55,
      'active': 1.725,
      'very_active': 1.9
    };

    let activityMultiplier = activityMultipliers[activity_routine] || 1.55;

    // Adjust for training
    if (training_days_per_week >= 5) {
      if (training_type === 'strength') {
        activityMultiplier += 0.1;
      } else if (training_type === 'cardio') {
        activityMultiplier += 0.15;
      } else if (training_type === 'mixed' || training_type === 'pilates') {
        activityMultiplier += 0.12;
      }
    } else if (training_days_per_week >= 3) {
      if (training_type === 'strength') {
        activityMultiplier += 0.05;
      } else if (training_type === 'cardio') {
        activityMultiplier += 0.08;
      } else if (training_type === 'mixed' || training_type === 'pilates') {
        activityMultiplier += 0.06;
      }
    }

    const tdee = Math.round(bmr * activityMultiplier);

    // === STEP 3: Adjust Calories by Goal ===
    let daily_calories = tdee;
    let safetyFloorApplied = false;
    let aggressiveWarning = '';

    // Determine safe deficit based on pace
    const deficitMap = {
      'slow': 0.15,      // 15% deficit
      'moderate': 0.20,  // 20% deficit
      'aggressive': 0.25 // 25% deficit (max safe)
    };

    if (goal === 'fat_loss') {
      const deficitPercent = deficitMap[pace] || 0.20;
      daily_calories = Math.round(tdee * (1 - deficitPercent));
      
      // Safety floor: min 1200 (female), 1500 (male)
      const minCalories = gender === 'female' ? 1200 : 1500;
      if (daily_calories < minCalories) {
        daily_calories = minCalories;
        safetyFloorApplied = true;
        if (pace === 'aggressive') {
          aggressiveWarning = 'יעד אגרסיבי — חישבנו גרעון בטוח יותר לבריאות שלך';
        }
      }
    } else if (goal === 'muscle_gain') {
      daily_calories = Math.round(tdee * 1.1); // +10% surplus
    } else if (goal === 'recomposition') {
      const deficitPercent = pace === 'aggressive' ? 0.15 : 0.10;
      daily_calories = Math.round(tdee * (1 - deficitPercent));
      const minCalories = gender === 'female' ? 1200 : 1500;
      if (daily_calories < minCalories) {
        daily_calories = minCalories;
        safetyFloorApplied = true;
      }
    }
    // maintenance stays at tdee

    // === STEP 4: Calculate Macros (with safety checks) ===
    let daily_protein_g;
    if (goal === 'fat_loss' || goal === 'recomposition') {
      daily_protein_g = Math.round(weight_kg * 2.0); // 2.0g per kg
    } else if (goal === 'muscle_gain') {
      daily_protein_g = Math.round(weight_kg * 1.8); // 1.8g per kg
    } else {
      daily_protein_g = Math.round(weight_kg * 1.8); // maintenance: 1.8g per kg
    }

    // Fat: 25-30% of calories, minimum 0.7g/kg
    const fat_percentage = goal === 'muscle_gain' ? 0.30 : 0.27;
    let daily_fat_g = Math.round((daily_calories * fat_percentage) / 9);
    const minFatG = Math.round(weight_kg * 0.7);
    daily_fat_g = Math.max(daily_fat_g, minFatG); // Ensure minimum fat

    // Carbs: remaining after protein and fat
    const protein_cals = daily_protein_g * 4;
    const fat_cals = daily_fat_g * 9;
    
    // Safety: if protein + fat exceeds calories, redistribute
    if (protein_cals + fat_cals > daily_calories * 1.1) {
      console.warn(`[calculateNutritionTargets] Macro redistribution needed`, {
        daily_calories,
        protein_cals,
        fat_cals,
        traineeEmail
      });
      // Reduce protein slightly, maintain fat minimum
      const adjustedProteinCals = Math.max(daily_calories * 0.25, Math.min(daily_protein_g * 4, daily_calories * 0.35));
      daily_protein_g = Math.round(adjustedProteinCals / 4);
    }
    
    const carb_cals = Math.max(0, daily_calories - protein_cals - fat_cals); // Prevent negative carbs
    let daily_carbs_g = Math.round(carb_cals / 4);

    // === SAFETY CHECK: Ensure no macro is negative ===
    if (daily_protein_g < 0 || daily_fat_g < 0 || daily_carbs_g < 0) {
      console.error(`[calculateNutritionTargets] NEGATIVE MACRO DETECTED - recalculating safely`, {
        protein: daily_protein_g,
        fat: daily_fat_g,
        carbs: daily_carbs_g,
        calories: daily_calories
      });
      
      // Fallback: Redistribute macros safely
      daily_protein_g = Math.max(50, Math.round(weight_kg * 1.5));
      daily_fat_g = Math.max(50, Math.round(daily_calories * 0.25 / 9));
      const safeCarbCals = Math.max(100, daily_calories - (daily_protein_g * 4) - (daily_fat_g * 9));
      daily_carbs_g = Math.round(safeCarbCals / 4);
      
      aggressiveWarning = 'יעד אגרסיבי — חישבנו יעד בטוח יותר לבריאות שלך';
    }

    // === STEP 5: Calculate Water ===
    // Formula: weight_kg * 35ml per kg
    // Gender-based minimums, capped at 4000ml
    let daily_water_ml = Math.round(weight_kg * 35);
    const waterMin = gender === 'female' ? 2000 : 3000;
    daily_water_ml = Math.max(waterMin, Math.min(daily_water_ml, 4000));

    // === STEP 6: Final Validation ===
    // Ensure NO negative values ever escape
    if (daily_calories < 0 || daily_protein_g < 0 || daily_fat_g < 0 || daily_carbs_g < 0) {
      console.error('[calculateNutritionTargets] CRITICAL: Negative values detected, blocking response', {
        daily_calories,
        daily_protein_g,
        daily_fat_g,
        daily_carbs_g
      });
      return Response.json({
        error: 'Calculation produced invalid targets (negative values). Please adjust your goal pace.'
      }, { status: 400 });
    }

    // Ensure macros roughly sum to calories
    const totalCalsFromMacros = (daily_protein_g * 4) + (daily_fat_g * 9) + (daily_carbs_g * 4);
    const deficitPercent = goal === 'fat_loss' ? Math.round((1 - (daily_calories / tdee)) * 100) : 0;

    const summary = `BMR: ${Math.round(bmr)}kcal | TDEE: ${tdee}kcal | Daily: ${daily_calories}kcal (${deficitPercent}% deficit) | P: ${daily_protein_g}g | C: ${daily_carbs_g}g | F: ${daily_fat_g}g | Water: ${daily_water_ml}ml`;

    console.log(`[calculateNutritionTargets] ${traineeEmail}: ${summary}${safetyFloorApplied ? ' [SAFETY FLOOR APPLIED]' : ''}`);

    return Response.json({
      ok: true,
      bmr: Math.round(bmr),
      tdee,
      daily_calories,
      daily_protein_g,
      daily_carbs_g,
      daily_fat_g,
      daily_water_ml,
      summary,
      calculation_details: {
        bmr: Math.round(bmr),
        activity_multiplier: activityMultiplier.toFixed(2),
        tdee,
        deficit_percent: deficitPercent,
        safety_floor_applied: safetyFloorApplied,
        aggressive_warning: aggressiveWarning,
        macros_total_cals: totalCalsFromMacros,
        validation_status: 'OK - all values positive'
      }
    });

  } catch (error) {
    console.error('[calculateNutritionTargets] Error:', error);
    return Response.json({
      error: error.message
    }, { status: 500 });
  }
});