# SMART MEAL & WATER REMINDER SYSTEM

**Status: SMART_MEAL_WATER_REMINDERS_ACTIVE**

---

## SYSTEM OVERVIEW

```
┌─────────────────────────────────────────────────────┐
│  SCHEDULED CHECK TIMES (Israel Time)                │
│                                                     │
│  10:00 → Breakfast check                           │
│  14:00 → Lunch check                               │
│  18:00 → Water check                               │
│  19:00 → Dinner check                              │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  SMART MEAL/WATER REMINDER (smartMealWaterReminder) │
│                                                     │
│  1. Load user state (meals today, water today,     │
│     last login, messages sent)                      │
│                                                     │
│  2. Evaluate relevance:                             │
│     - breakfast: send if 0 meals logged            │
│     - lunch: send if <2 meals logged               │
│     - dinner: send if <3 meals logged              │
│     - water: send if <50% of daily target          │
│                                                     │
│  3. Enforce anti-spam:                              │
│     - max 2 messages/day                           │
│     - max 1 per trigger type                       │
│     - no messages if inactive >3 days              │
│     - no messages if in recovery mode              │
│                                                     │
│  4. Gate through whatsAppSmartGate                  │
│     - window validation                             │
│     - daily cap check                              │
│     - context relevance                            │
│                                                     │
│  5. Log decision in WhatsAppEventLog                │
│     - message_sent or reminder_skipped             │
│     - reason / blocked_reason                      │
│     - full user state snapshot                     │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  REINFORCEMENT & RECOVERY HANDLER                   │
│  (mealWaterReinforcementHandler)                    │
│                                                     │
│  When meal logged:                                  │
│  → if reminder sent today → send celebration      │
│                                                     │
│  When water goal reached:                           │
│  → send goal celebration (once/day)                │
│                                                     │
│  Scheduled checks (daily):                          │
│  → if inactive 3 days → send comeback #1           │
│  → if inactive 7 days → send comeback #2           │
│  → then stop reminders (recovery mode)             │
└─────────────────────────────────────────────────────┘
```

---

## CHECK TIME LOGIC

### **Breakfast (10:00)**

**Send reminder if:**
- ✅ 0 meals logged today
- ✅ No reminder sent today
- ✅ User logged in within 3 days
- ✅ Total messages today < 2
- ✅ Not in recovery mode

**Message:**
```
בוקר טוב {{firstName}}! 🌅

עדיין לא רשמת ארוחת בוקר?
התחלה טובה ביום = תוצאות טובות יותר 💪

רשום עכשיו
```

---

### **Lunch (14:00)**

**Send reminder if:**
- ✅ <2 meals logged today (breakfast only)
- ✅ No meal reminder sent today
- ✅ User logged in within 3 days
- ✅ Total messages today < 2
- ✅ Not in recovery mode

**Message:**
```
שלום {{firstName}}! 🥗

זמן ארוחת צהריים!
עדיין לא רשמת? בואו נעדכן 📝
```

---

### **Dinner (19:00)**

**Send reminder if:**
- ✅ <3 meals logged today
- ✅ No meal reminder sent today
- ✅ User logged in within 3 days
- ✅ Total messages today < 2
- ✅ Not in recovery mode

**Message:**
```
ערב טוב {{firstName}}! 🍽️

סיום יום טוב עם ארוחת ערב!
רשום בקלות בואו 👇
```

---

### **Water (18:00)**

**Send reminder if:**
- ✅ Water logged today < 50% of daily target
- ✅ No water reminder sent today
- ✅ User logged in within 3 days
- ✅ Total messages today < 2
- ✅ Not in recovery mode

**Message:**
```
💧 שלום {{firstName}}!

עוד {{remaining}}% מיעד המים שלך!
כוס מים עכשיו = בדרך לקיים 🎯
```

---

## ANTI-SPAM RULES (MANDATORY)

| Rule | Enforcement |
|------|-------------|
| **Max 2 messages/day** | Reminder system checks `messages_sent_today` before sending |
| **No duplicate reminders** | Each trigger type tracked per day (breakfast, lunch, dinner, water) |
| **User inactive >3 days** | No reminders sent; recovery mode activates |
| **Never send 21:00–08:00** | Window validation in whatsAppSmartGate |
| **No reminders in recovery** | `is_in_recovery_mode` flag blocks all reminders |

---

## POSITIVE REINFORCEMENT (CRITICAL)

### **Meal Logged Reinforcement**

**Trigger:** User logs a meal TODAY, AND a meal reminder was sent today

**Message:**
```
אלוף/ה! בדיוק ככה ממשיכים 💪

כל רישום זו צעד בכיוון הנכון!
```

**Important:** Reinforcement does NOT count toward daily message limit

---

### **Water Goal Celebration**

**Trigger:** User reaches daily water target

**Message:**
```
סגרת יעד מים להיום! 💧🔥

{{firstName}}, זה בדיוק מה שצריך!
הגוף שלך תודה לך 🙌
```

**Important:** Only sent once per day (even if user adds more water)

---

## RECOVERY MODE (3-7 DAYS INACTIVE)

### **3-Day Inactivity**

**Trigger:** User hasn't logged in for 3 days

**Message:**
```
{{firstName}}, רואים שלא היית איתנו כמה ימים 🤔

חזור בואו — אנחנו כאן בשבילך 💙

תחיל עם ארוחה אחת קטנה 💪
```

**Sent once, then:**
- No more reminders for 3 days (recovery mode active)

---

### **7-Day Inactivity**

**Trigger:** User hasn't logged in for 7 days

**Message:**
```
{{firstName}}, סוגר לך את זה 🫡

אם זה פחות מתאים עכשיו הכל טוב.
אם רוצה לחזור — אני פה בשביל לעזור 💪
```

**Final message — no more reminders after this**

---

## EVENT LOGGING (WhatsAppEventLog)

Every decision creates a record with:

```json
{
  "trainee_id": "...",
  "trainee_email": "...",
  "trigger_type": "breakfast_check" | "lunch_check" | "dinner_check" | "water_check" | "recovery_3day" | "recovery_7day" | "reinforcement_meal" | "reinforcement_water",
  "event_type": "message_sent" | "reminder_skipped" | "reinforcement_sent" | "recovery_sent",
  "timestamp": "2026-05-04T10:00:00Z",
  "message_sent": "Full message text (if sent)",
  "reason": "Why sent (e.g., breakfast_not_logged, water_below_target)",
  "blocked_reason": "Why NOT sent (e.g., daily_limit_reached, user_inactive)",
  "user_state": {
    "meals_logged_today": 1,
    "water_logged_today": 750,
    "daily_water_target": 2500,
    "last_login_hours_ago": 12,
    "messages_sent_today": 1,
    "is_in_recovery_mode": false
  },
  "decision_metadata": {
    "check_time": "breakfast",
    "competing_triggers": ["breakfast_check"],
    "selected_reason": "only_option"
  }
}
```

---

## INTEGRATION GUIDE

### **Scheduled Calls**

Set up cron jobs to call `smartMealWaterReminder` at check times:

```javascript
// At 10:00 Israel time (every trainee)
const trainees = await base44.entities.Trainee.filter({ status: 'active' });
for (const trainee of trainees) {
  await base44.functions.invoke('smartMealWaterReminder', {
    traineeId: trainee.id,
    traineeEmail: trainee.user_email
  });
}
```

---

### **Meal Logged (Entity Automation)**

When a MealEntry is created:

```javascript
// Trigger: MealEntry.create
const result = await base44.functions.invoke('mealWaterReinforcementHandler', {
  traineeId: event.trainee_id,
  traineeEmail: event.trainee_email,
  action: 'meal_logged'
});
```

---

### **Water Goal (Scheduled Check)**

Once per day (e.g., 20:00):

```javascript
const trainees = await base44.entities.Trainee.filter({ status: 'active' });
for (const trainee of trainees) {
  await base44.functions.invoke('mealWaterReinforcementHandler', {
    traineeId: trainee.id,
    traineeEmail: trainee.user_email,
    action: 'water_goal_reached'
  });
}
```

---

### **Recovery Check (Scheduled)**

Once per day (e.g., 08:00):

```javascript
const trainees = await base44.entities.Trainee.filter({ status: 'active' });
for (const trainee of trainees) {
  await base44.functions.invoke('mealWaterReinforcementHandler', {
    traineeId: trainee.id,
    traineeEmail: trainee.user_email,
    action: 'recovery_check'
  });
}
```

---

## TEST SCENARIOS

| Scenario | Expected Behavior |
|----------|------------------|
| User did not log breakfast | ✅ Message at 10:00 |
| User logged breakfast | ❌ No message at 10:00 |
| User already got 2 messages today | ❌ No more messages (blocked) |
| User inactive >3 days | ❌ No reminders (recovery mode) |
| User inactive exactly 3 days | ✅ Send recovery message #1 |
| User inactive exactly 7 days | ✅ Send recovery message #2 |
| User logs meal after reminder | ✅ Send reinforcement (doesn't count toward limit) |
| User reaches water goal | ✅ Send celebration (once/day) |
| Time is 22:00 (night) | ❌ No reminders (outside window) |

---

## METRICS & ANALYTICS

Query to measure reminder effectiveness:

```sql
SELECT
  trigger_type,
  COUNT(*) as reminders_sent,
  SUM(CASE WHEN reason LIKE '%logged' THEN 1 ELSE 0 END) as acted_upon,
  SUM(CASE WHEN reason LIKE '%logged' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as action_rate
FROM WhatsAppEventLog
WHERE event_type = 'message_sent'
  AND timestamp >= DATEADD(day, -7, GETDATE())
GROUP BY trigger_type
ORDER BY action_rate DESC;
```

Expected outcomes:
- Breakfast: >40% action rate
- Lunch: >35% action rate
- Dinner: >30% action rate
- Water: >25% action rate

---

## ROLLOUT CHECKLIST

- [ ] Create `WhatsAppEventLog` entity
- [ ] Deploy `smartMealWaterReminder` function
- [ ] Deploy `mealWaterReinforcementHandler` function
- [ ] Set up 4 daily cron jobs (10:00, 14:00, 18:00, 19:00)
- [ ] Set up meal logging trigger → reinforcement
- [ ] Set up daily 20:00 water goal check
- [ ] Set up daily 08:00 recovery check
- [ ] Test all 10 scenarios above
- [ ] Monitor event logs for first week
- [ ] Adjust message timing if needed
- [ ] Measure action rates (target: >30% overall)

---

**Status: ✅ SMART_MEAL_WATER_REMINDERS_ACTIVE**

Reminders are behavior-driven, context-aware, and respectful of user time + engagement patterns.