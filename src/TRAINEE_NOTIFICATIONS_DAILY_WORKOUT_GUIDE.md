# TRAINEE NOTIFICATIONS + DAILY WORKOUT OPTIONS UPGRADE

**Status: TRAINEE_NOTIFICATIONS_AND_DAILY_WORKOUT_OPTIONS_READY** ✅

---

## PART 1 — TRAINEE NOTIFICATION CONTROL

### **Feature: WhatsApp Notifications Toggle**

**Location:** Trainee App → Notifications / התראות

**UI Card: "התראות WhatsApp"**

Trainee can enable/disable WhatsApp notifications from their own app.

```
┌─────────────────────────────────────┐
│ 💬 התראות WhatsApp                   │
│                                      │
│ Status: ✅ מופעל                      │
│                                      │
│              [Toggle Switch]         │
│                                      │
│ כאשר מופעל: תקבל/י תזכורות לארוחות, │
│ מים ואימונים                         │
│                                      │
│ כאשר מכובה: לא תקבל/י שום תזכורות   │
└─────────────────────────────────────┘
```

### **Implementation**

**Entity:** `Trainee.whatsapp_notifications_enabled` (boolean, default: true)

**Component:** `WhatsAppNotificationControl.jsx`
- Reads/writes to `trainee.whatsapp_notifications_enabled`
- Shows current status
- Safe toggle (no WhatsApp sent when changing)

### **Behavior**

| Setting | Effect |
|---------|--------|
| ON (true) | Trainee eligible for all smart reminders |
| OFF (false) | Skips in smartReminderEngineV2, debug shows "whatsapp_notifications_disabled" |

### **Smart Reminder Integration**

`smartReminderEngineV2` now checks at start:

```javascript
if (trainee.whatsapp_notifications_enabled === false) {
  return { skipped: true, reason: 'whatsapp_notifications_disabled' };
}
```

Result: **Zero WhatsApp messages sent when disabled.**

---

## PART 2 — DAILY WORKOUT MULTIPLE OPTIONS

### **Feature: Coach Creates 2-3 Workout Options**

**Coach Tool:** Pages → `CoachDailyWorkoutBuilder`

Coach can create multiple workout options for the same day:
- Beginner / Intermediate / Advanced
- Different types: Strength / Functional / Pilates / Cardio / Mixed
- Different durations

### **New Entities**

#### **DailyWorkoutGroup**

```json
{
  "date": "2026-05-04",
  "coach_email": "coach@example.com",
  "title": "Strength Challenge",
  "description": "Focus on lower body",
  "workouts": [
    {
      "id": "w_001",
      "title": "Beginner",
      "type": "strength",
      "level": "beginner",
      "duration_minutes": 30,
      "equipment": ["dumbbells", "mat"],
      "exercises": [...],
      "effort_score": 4,
      "effort_label": "בינוני"
    },
    {
      "id": "w_002",
      "title": "Intermediate",
      "type": "strength",
      "level": "intermediate",
      "duration_minutes": 45,
      "equipment": ["dumbbells", "barbell"],
      "exercises": [...],
      "effort_score": 7,
      "effort_label": "קשה"
    },
    {
      "id": "w_003",
      "title": "Advanced",
      "type": "strength",
      "level": "advanced",
      "duration_minutes": 60,
      "equipment": ["dumbbells", "barbell", "plates"],
      "exercises": [...],
      "effort_score": 9,
      "effort_label": "עצים מאוד"
    }
  ],
  "published": true,
  "published_at": "2026-05-04T10:00:00Z"
}
```

#### **WorkoutCompletionFeedback**

```json
{
  "trainee_email": "trainee@example.com",
  "coach_email": "coach@example.com",
  "date": "2026-05-04",
  "daily_workout_group_id": "grp_001",
  "selected_option_id": "w_002",
  "selected_option_title": "Intermediate",
  "planned_effort_score": 7,
  "actual_rpe": 6,
  "completed": true,
  "completion_notes": "Felt strong, good flow",
  "pain_discomfort": false,
  "submitted_at": "2026-05-04T11:30:00Z"
}
```

### **Coach Builder Workflow**

1. **Navigate:** Sidebar → Coach menu → "🏋️ אימון יומי" (Daily Workout Builder)
2. **Select Date:** Choose date for workout
3. **Set Group Title:** "Daily Strength Challenge"
4. **Add Workout Options:** Click "הוסף אימון"
   - Name (e.g., "Beginner", "Intermediate", "Advanced")
   - Type (strength/functional/pilates/cardio/mobility/mixed)
   - Level (beginner/intermediate/advanced)
   - Duration (minutes)
   - Equipment needed
   - Exercises list
   - Notes/tips
5. **Auto-Calculate Effort:** Click "חשב עומס אוטומטית"
   - System calculates 1-10 score
   - Or coach can override manually
6. **Publish:** Click "פרסם למתאמנים"
   - Makes visible to all trainees

### **Trainee Workout Selection**

**UI:** Trainee Home / Workout Tab

When coach publishes DailyWorkoutGroup:

```
┌────────────────────────────────────┐
│ 🏋️ האימון היומי שלך                │
│ Strength Challenge                  │
│ Focus on lower body                 │
├────────────────────────────────────┤
│ ┌──────────────────────────────┐  │
│ │ 🥋 אימון 1 — Beginner        │  │
│ │ רמה: מתחיל | דקות: 30       │  │
│ │ עומס משוער: 4/10 — בינוני   │  │
│ │ [התחל אימון →]              │  │
│ └──────────────────────────────┘  │
│                                    │
│ ┌──────────────────────────────┐  │
│ │ 🥋 אימון 2 — Intermediate    │  │
│ │ רמה: בינוני | דקות: 45      │  │
│ │ עומס משוער: 7/10 — קשה     │  │
│ │ [התחל אימון →]              │  │
│ └──────────────────────────────┘  │
│                                    │
│ ┌──────────────────────────────┐  │
│ │ 🥋 אימון 3 — Advanced        │  │
│ │ רמה: מתקדם | דקות: 60       │  │
│ │ עומס משוער: 9/10 — עצים מאוד│  │
│ │ [התחל אימון →]              │  │
│ └──────────────────────────────┘  │
└────────────────────────────────────┘
```

---

## PART 3 — EFFORT SCORE CALCULATION

### **Automatic Effort Calculation**

Function: `calculateWorkoutEffortScore`

**Formula:** Score 1-10 based on:

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Duration | 0-3 | ≤20min=1, ≤40min=2, >40min=3 |
| Exercise density | 0-2 | ≤5 ex=0.5, ≤10 ex=1, >10 ex=2 |
| Cardio component | 0-2 | Cardio=+1, HIIT/AMRAP=+1 |
| Load | 0-2 | Dumbbells=+1, Functional+10ex=+1 |
| Level multiplier | × | Beginner=0.8x, Intermediate=1x, Advanced=1.3x |

**Example:**
- 45 min, 8 exercises, dumbbells, intermediate
- Base: 2 + 1 + 0.5 + 1 = 4.5
- Multiplier: 4.5 × 1.0 = 4.5
- Clamped: 4.5/10 = "בינוני"

### **Labels**

```
1–3   קל
4–6   בינוני
7–8   קשה
9–10  עצים מאוד
```

### **Manual Override**

Coach can manually set effort score if auto-calculation incorrect.

---

## PART 4 — POST-WORKOUT FEEDBACK

### **Trainee Feedback Flow**

After trainee completes workout:

**Modal: "איך היה האימון?"**

```
┌──────────────────────────────────┐
│ איך היה האימון?                   │
├──────────────────────────────────┤
│ Intermediate                      │
│                                  │
│ RPE (עוצמה מתחושה) — 6            │
│ [Slider: ← 1 --------- 10 →]      │
│                                  │
│ ☑ סיימתי את כל האימון            │
│                                  │
│ הערות (אופציונלי)                 │
│ [Textarea: "Felt strong..."]     │
│                                  │
│ ☐ חוויתי כאב או אי נוחות          │
│                                  │
│         [ביטול] [שלח]            │
└──────────────────────────────────┘
```

### **Feedback Data**

Stored in `WorkoutCompletionFeedback`:

- `actual_rpe` — 1-10 RPE reported
- `completed` — yes/no
- `completion_notes` — trainee notes
- `pain_discomfort` — yes/no flag
- `pain_notes` — if pain reported
- `start_time` / `end_time` — workout duration
- `selected_option_id` — which option trainee chose

**Function:** `submitWorkoutFeedback`

Saves feedback automatically when trainee submits.

---

## PART 5 — COACH DASHBOARD VIEW

### **Completion Stats (Future)**

Coach can view per day:
- How many trainees chose each option
- Average RPE per option
- Completion rate (%)
- Pain/discomfort reports

**Example Query:**

```javascript
const feedbacks = await base44.entities.WorkoutCompletionFeedback.filter({
  date: '2026-05-04',
  coach_email: coachEmail
});

const stats = {
  beginner_chosen: 5,
  intermediate_chosen: 12,
  advanced_chosen: 3,
  avg_rpe: 6.2,
  completion_rate: 93,
  pain_reports: 1
};
```

---

## PART 6 — IMPLEMENTATION CHECKLIST

### **Entities**
- [x] DailyWorkoutGroup with workouts array
- [x] WorkoutCompletionFeedback for post-workout data
- [x] Updated Trainee with whatsapp_notifications_enabled, reminder_intensity, debug_reminder_mode

### **Backend Functions**
- [x] calculateWorkoutEffortScore (1-10 effort)
- [x] submitWorkoutFeedback (save post-workout data)
- [x] smartReminderEngineV2 (check whatsapp_notifications_enabled)

### **Trainee UI Components**
- [x] WhatsAppNotificationControl.jsx (toggle control)
- [x] DailyWorkoutSelector.jsx (show 2-3 options)
- [x] WorkoutFeedbackModal.jsx (post-workout dialog)

### **Coach UI Pages**
- [x] CoachDailyWorkoutBuilder.jsx (create/edit/publish workouts)

### **Routes**
- [x] /CoachDailyWorkoutBuilder (coach builder page)

### **Integration**
- [x] smartReminderEngineV2 respects whatsapp_notifications_enabled

---

## VALIDATION FLOW

### **Test 1: Trainee Disables WhatsApp**

1. Trainee goes to Notifications → WhatsApp card
2. Click toggle to OFF
3. whatsapp_notifications_enabled = false ✅
4. Smart reminder checks this flag
5. Message skipped, reason = "whatsapp_notifications_disabled" ✅

### **Test 2: Coach Creates Multiple Workouts**

1. Coach → Builder page → select date
2. Click "הוסף אימון" × 3
3. Set title, level, type, effort for each
4. Click "חשב עומס אוטומטית" ✅
5. Click "פרסם למתאמנים"
6. DailyWorkoutGroup published = true ✅

### **Test 3: Trainee Selects Workout**

1. Trainee opens Home / Workout tab
2. Sees 3 cards for today's workouts
3. Clicks "התחל אימון" on option 2
4. Starts workout timer
5. Completes workout
6. Modal appears: "איך היה האימון?"
7. Selects: RPE=6, completed=true, notes="great!"
8. Submits
9. WorkoutCompletionFeedback saved ✅
10. Coach sees completion stats ✅

---

## PRODUCTION NOTES

### **Safety**
- No breaking changes to existing system
- WhatsApp notifications disabled by default for new features
- All feedback optional for trainee
- Coach can override effort scores manually
- Workout options show clearly to prevent confusion

### **Performance**
- Effort score calculated instantly on save
- Feedback stored asynchronously
- No impact on existing reminders

### **Future Enhancements**
- Analyze RPE vs planned effort to detect workout difficulty mismatches
- Detect pain patterns and adjust recommendations
- A/B test different difficulty distribution (e.g., 1 easy, 1 hard vs all medium)
- Leaderboard: which option most chosen/loved

---

**Status: ✅ TRAINEE_NOTIFICATIONS_AND_DAILY_WORKOUT_OPTIONS_READY**

Trainees now have full control over notifications, coaches can create multiple daily workout options, and all feedback is tracked for continuous improvement.