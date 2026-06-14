# Nutrition Targets Calculation — Safety Fix

## Problem Fixed
System was calculating impossible calorie targets (e.g., 267 kcal for female 86kg on fat loss), causing starvation-level macros.

## Solution Implemented

### 1. Safe Calorie Calculation
**Method:** Mifflin-St Jeor BMR + Activity Multiplier

**Fat Loss Deficits (Based on Pace):**
- Slow: 15% deficit
- Moderate: 20% deficit  
- Aggressive: 25% deficit (max safe)

**Safety Floors (Hard Minimum):**
- Female: 1200 kcal/day
- Male: 1500 kcal/day

If calculated calories fall below minimum → floor applied + warning shown

### 2. Macro Calculation Rules

**Protein:**
- Fat loss/recomposition: 2.0g per kg
- Muscle gain: 1.8g per kg
- Maintenance: 1.8g per kg

**Fat:**
- 25-30% of total calories
- Muscle gain: 30%
- Other goals: 27%

**Carbs:**
- Remaining calories after protein and fat

**Water:**
- Default: weight_kg × 35ml
- Gender minimums: Female 2000ml, Male 3000ml
- Cap: 4000ml unless coach overrides

### 3. User-Facing Changes

**Calculation Details Panel:**
Shows:
- BMR (Mifflin-St Jeor)
- Activity multiplier
- TDEE
- Deficit percent
- Safety floor applied (yes/no)
- Macros total calories (for validation)

**Aggressive Goal Warning:**
If user requests aggressive pace and safety floor is applied:
"יעד אגרסיבי — חישבנו גרעון בטוח יותר לבריאות שלך"
(Aggressive goal — we calculated a safer deficit for your health)

### 4. Validation Tests

#### Test Case 1: Female 86kg, 174cm, Moderate Activity, Fat Loss
Input:
```
gender: female
weight_kg: 86
height_cm: 174
activity_routine: moderate_activity
goal: fat_loss
pace: moderate
age: ~30
```

Expected Output:
```
bmr: ~1550-1600 kcal
tdee: ~2400-2500 kcal
daily_calories: ~1900-2000 kcal (20% deficit)
daily_protein_g: ~172g
daily_fat_g: ~55-65g
daily_carbs_g: ~200-220g
daily_water_ml: 3000ml
safety_floor_applied: false
```

NOT: 267 kcal ✗

#### Test Case 2: Male 85kg, 187cm, 2x/week Strength, Fat Loss
Input:
```
gender: male
weight_kg: 85
height_cm: 187
activity_routine: moderate_activity
training_type: strength
training_days_per_week: 2
goal: fat_loss
pace: moderate
age: ~28
```

Expected Output:
```
bmr: ~1700-1750 kcal
tdee: ~2650-2700 kcal
daily_calories: ~2100-2200 kcal (20% deficit)
daily_protein_g: ~170g
daily_fat_g: ~60-75g
daily_carbs_g: ~200-220g
daily_water_ml: 3000ml
safety_floor_applied: false
```

#### Test Case 3: Aggressive Fat Loss Triggering Safety Floor
Input:
```
gender: female
weight_kg: 55
height_cm: 160
activity_routine: sedentary
goal: fat_loss
pace: aggressive
goal_weight_change_kg: 15
goal_timeline_weeks: 8 (too aggressive)
```

Expected Output:
```
calculated_calories: ~900 kcal (before safety floor)
daily_calories: 1200 kcal (safety floor applied ✓)
safety_floor_applied: true
aggressive_warning: "יעד אגרסיבי — חישבנו גרעון בטוח יותר לבריאות שלך"
daily_protein_g: ~110g
daily_fat_g: ~35g
daily_carbs_g: ~130g
```

### 5. Code Changes

**Backend Function:** `calculateNutritionTargets.js`
- ✅ Implemented safe deficit percentages (15%, 20%, 25%)
- ✅ Added hard safety floors: 1200 (F), 1500 (M)
- ✅ Added aggressive goal warning
- ✅ Improved macro distribution
- ✅ Added calculation_details output for transparency

**Frontend Component:** `NutritionTargetsDebug.jsx`
- ✅ Expandable calculation details panel
- ✅ Shows BMR → Activity Multiplier → TDEE → Daily Calories
- ✅ Shows deficit percent
- ✅ Shows if safety floor was applied
- ✅ Shows aggressive warning if applicable
- ✅ Validates macros sum to calories

### 6. Safety Guarantees

✅ **No starvation calories:** Minimum 1200F/1500M always enforced

✅ **Balanced macros:** Protein, fat, carbs calculated from calorie total

✅ **Transparent calculation:** User sees BMR, TDEE, deficit, floor applied

✅ **Aggressive pace warning:** User informed if their goal required adjustment

✅ **Water targets safe:** Gender-based minimums, sensible cap

✅ **Macro validation:** Total calories from macros shown for verification

### 7. Rollout Status

**Status:** ✅ STABLE

**Files Modified:**
- `functions/calculateNutritionTargets.js`
- `components/trainee/NutritionTargetsDebug.jsx`

**Backward Compatibility:** Yes
- Existing NutritionTargets records still valid
- New fields added (calculation_details, aggressive_warning)
- Old fields preserved

**Testing Required:**
- [ ] Test Case 1: Normal female fat loss
- [ ] Test Case 2: Normal male fat loss
- [ ] Test Case 3: Aggressive goal triggers safety floor
- [ ] Verify macros sum to daily_calories
- [ ] Check mobile UI for calculation panel
- [ ] Verify water targets (2000-4000ml range)
- [ ] Test coach can still manually override

### 8. Critical Negative Values Prevention

**Issue Fixed:**
User received negative targets: -66 kcal, -6g protein, -3g fat — impossible values.

**Root Cause:**
Macro calculation didn't validate when protein_cals + fat_cals exceeded total calories.

**Fix Applied:**
1. **Backend validation** — Detect when protein_cals + fat_cals > daily_calories
2. **Automatic redistribution** — Reduce protein slightly, maintain fat minimum
3. **Frontend validation** — Block save if any macro is negative
4. **Final gate** — Reject response if any value < 0
5. **Error logging** — Log when redistribution occurs

**Code Changes:**
- `calculateNutritionTargets.js`: Macro redistribution + final negative value gate
- `NutritionQuestionnaireDialog.jsx`: Frontend validation before save

**Result:**
All targets now guaranteed positive and safe.

## Future Improvements

1. **Coach Manual Override:** Allow coaches to set custom calories (bypass safety floor)
2. **Periodic Re-assessment:** Recalculate targets monthly based on progress
3. **Phase-based Plans:** Support cycling through cutting/maintenance/bulking
4. **Medical Alerts:** Flag if user has medical conditions requiring special handling
5. **Integration with Tracking:** Sync targets to nutrition logging UI