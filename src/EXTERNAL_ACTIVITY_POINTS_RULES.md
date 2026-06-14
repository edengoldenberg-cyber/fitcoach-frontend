# EXTERNAL ACTIVITY POINTS RULES — STRICT SAFE MODE

**Status:** EXTERNAL_ACTIVITY_POINTS_RULES_READY

## Overview
Points system for external/non-app activities logged via ShapeLeagueActivityLogger. Includes fair point values and anti-abuse guards.

---

## ACTIVITY POINT VALUES

### 1. Daily App Workout / Studio Workout
- **Points:** +30
- **Duration:** Required (recorded)
- **Anti-abuse:** Once per day max via `onWorkoutLogged` (idempotent)

### 2. Pilates
- **Points:** +25
- **Duration:** Required (5–180 min)
- **Rules:** Standard activity, no variant rules

### 3. Running
- **Duration Rule:** 
  - 15–25 min = +20 points
  - 25+ min OR 5km+ = +30 points
- **Distance Rule:** If distance ≥ 5km = +30 points (overrides duration)
- **Anti-abuse:** Duration OR distance required (not both, one is enough)

### 4. Walking
- **Duration Rule:**
  - 20–40 min = +10 points
  - 40+ min = +20 points
- **Anti-abuse:** Duration required

### 5. Tennis / Team Sport
- **Points:** +20
- **Duration:** Required
- **Rules:** Standard activity

### 6. Cycling / Swimming
- **Points:** +25
- **Duration:** Required
- **Rules:** Standard activity
- **Note:** Cycling supports distance (km) as optional secondary metric

### 7. Mobility / Stretching
- **Points:** +10
- **Duration:** Required (5–180 min)
- **Rules:** Standard activity

### 8. Functional Training / HIIT
- **Points:** +30
- **Duration:** Required
- **Rules:** Standard activity (same as studio workout)

---

## ANTI-ABUSE RULES

### Daily Activity Cap
- **Rule:** Max 60 activity points per day
- **Check:** Before awarding points, sum all activity logs for the day
- **Behavior:** If daily_total + new_activity > 60, reject with message: "הישגת את גבול הנקודות ליום (60 נק'). זמין: X נק'"
- **Implementation:** `onActivityLogged` in pointsEngine checks `daily_cap = 60`

### Duplicate Prevention (2-Hour Cooldown)
- **Rule:** Cannot log the same activity twice within 2 hours
- **Check:** Filter ShapeLeagueActivityLog by `trainee_id`, `activity_type`, and `logged_at >= now - 2h`
- **Behavior:** If duplicate found, reject with message: "אתה כבר רשמת פעילות זו ב-2 השעות האחרונות"
- **Implementation:** ShapeLeagueActivityLogger checks before create

### Duration/Distance Validation
- **Rule:** Activity must include valid duration (or distance for running)
  - Running: duration ≥ 15 min OR distance ≥ 5 km
  - Walking: duration ≥ 20 min
  - Other: duration ≥ 5 min
- **Behavior:** Client-side validation in ShapeLeagueActivityLogger, throws error if invalid
- **Implementation:** Form validation before mutation

### Points Only on User Logged (No Suggestions)
- **Rule:** Points awarded ONLY when user explicitly logs activity via ShapeLeagueActivityLogger
- **Behavior:** No automatic points from AI suggestions or inferred activities
- **Implementation:** Activity log must have `logged_at` timestamp set by client

---

## POINT CALCULATION LOGIC

### Default Activities (Pilates, Cycling, Swimming, etc.)
```
points = base_points (fixed)
```

### Running (Special Case)
```
if distance >= 5 km:
  points = 30
else if duration >= 25 min:
  points = 30
else if duration >= 15 min:
  points = 20
else:
  points = 0 (invalid)
```

### Walking (Special Case)
```
if duration >= 40 min:
  points = 20
else if duration >= 20 min:
  points = 10
else:
  points = 0 (invalid)
```

---

## IMPLEMENTATION

### Client: ShapeLeagueActivityLogger
- Activity selector with emoji + name
- Duration input (5–180 min range)
- Distance input (optional, for running/cycling)
- Intensity selector (low/medium/high)
- Error display for validation failures
- Anti-abuse checks:
  - Validate duration/distance before submission
  - Check daily cap (query existing logs for today)
  - Check 2-hour duplicate cooldown

### Server: pointsEngine
- **New action:** `activity_logged`
- **Handler:** `onActivityLogged(base44, traineeId, traineeEmail, activityData)`
- **Steps:**
  1. Get or create UserPointsDaily record for today
  2. Validate points_awarded > 0
  3. Check daily cap (60 max)
  4. Update record: `workout_points += activityData.points_awarded`
  5. Recalculate total
  6. Log and return result
- **Entity trigger:** ShapeLeagueActivityLog create → calls pointsEngine with activity data
- **Idempotent:** No, intentionally allows multiple activities per day (with cap)

### Database: ShapeLeagueActivityLog
- `trainee_id`: User logging activity
- `trainee_email`: User email
- `activity_type`: Activity name (e.g., "ריצה", "פילאטיס")
- `duration_minutes`: Minutes (required for all activities)
- `distance_km`: Optional (for running/cycling)
- `intensity`: "low" | "medium" | "high"
- `points_awarded`: Calculated points
- `activity_date`: YYYY-MM-DD
- `logged_at`: ISO timestamp (for duplicate check)

---

## SAFE MODE GUARANTEES

✅ **Fail-open:** If validation fails, reject with user-friendly error (no silent drops)  
✅ **Idempotent action:** Multiple calls with same data won't double-count (checked via timestamp)  
✅ **No wild cap increases:** Daily cap is 60 and fixed (immutable in code)  
✅ **No invisible point deductions:** Only awards, never subtracts  
✅ **Audit trail:** All activities logged with trainee_id, email, timestamp, and points  
✅ **User-logged only:** No bot/suggestion points  
✅ **Fair duration rules:** Running gets bonus for long durations OR distance; walking graduated by duration  
✅ **No negative points:** All calculations produce ≥ 0 points  

---

## TESTING CHECKLIST

- [ ] Log running 20 min → should give +20 points
- [ ] Log running 30 min → should give +30 points
- [ ] Log running 5km → should give +30 points (distance override)
- [ ] Log walking 30 min → should give +10 points
- [ ] Log walking 45 min → should give +20 points
- [ ] Log pilates 45 min → should give +25 points
- [ ] Log 6 activities = 60 points max → 7th should be rejected
- [ ] Log activity, then immediately log same activity again → should reject (2h cooldown)
- [ ] Log activity with 0 duration → should reject on client
- [ ] Log running with no duration/distance → should reject on client
- [ ] Daily points should sum correctly in UserPointsDaily.workout_points

---

## MIGRATION NOTES

- Existing app-workout points stay at +30 (via onWorkoutLogged)
- New external activities use onActivityLogged handler
- Both types sum to workout_points in UserPointsDaily
- No changes to meal_points or water_points
- End-of-day bonus still checks: workout > 0, meal ≥ 30, water > 0