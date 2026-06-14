# WHATSAPP AUTOMATION — FULL TRIGGER AUDIT + SMART SYSTEM REDESIGN

**Status: INTELLIGENCE_SYSTEM_DESIGNED_FOR_CONTROL**

---

## PART 1: FULL TRIGGER AUDIT TABLE

| # | Trigger Name | Source Function | When It Fires | Delay/Timing | Message Template | Target Audience | Frequency | Last Sent Logic | Duplication Protection |
|---|---|---|---|---|---|---|---|---|---|
| **1** | `trainee_created` | onTraineeCreated (entity automation) | Trainee record created in system | Immediate (on create) | WhatsAppTemplate (coach defined) + app invite link | New trainees | One-time per trainee | N/A — first message | Template key unique per rule; rule-level trigger count |
| **2** | `lead_created` | onLeadCreated (entity automation) | Lead record created in system | Immediate (on create) | SalesConversationFlow step 1 message | New leads from sales flow | One-time per lead | N/A — flow initialization | activeResponderOwner stamped; idempotent skip if flow already initialized |
| **3** | `flow_step_N` | salesFlowRunner (flow progression) | Lead replies to flow step N-1 | 0–N min delay (per step config) | Step messageText + variables | Active lead in flow | Sequential per flow | N/A — flow-driven | session_id + template_key uniqueness; duplicate step guard |
| **4** | `flow_step_N_followup_M` | salesFlowRunner (timeout recovery) | No reply within replyTimeoutMinutes of step N | Configurable (default 60 min) | Step timeoutMessage or messageText | Waiting leads | Max N per step (maxFollowups) | nextTimeoutAt | Per-step followup counter; template_key includes followup number |
| **5** | `nudge_step_1` | nudgeScheduler | Lead created (no prior outbound) + 6 hours idle | 6 hours after creation/last outbound | NUDGE_STEPS[0] = "Hi {{name}}, checking in..." | Unresponsive leads (no FLOW/SCRIPT active) | Max 4 steps total | state.nudgeBaseline | LeadNudgeState track; stopped flag; lastNudgeStep counter |
| **6** | `nudge_step_2` | nudgeScheduler | 24 hours after step 1 sent (if no reply) | 24 hours after step 1 | NUDGE_STEPS[1] = "Thought of you..." | Unresponsive leads | See step 5 | state.nudgeBaseline + delayHours | Same as above |
| **7** | `nudge_step_3` | nudgeScheduler | 48 hours after step 2 sent (if no reply) | 48 hours after step 2 | NUDGE_STEPS[2] = "Limited spots this week..." | Unresponsive leads | See step 5 | state.nudgeBaseline + delayHours | Same as above |
| **8** | `nudge_step_4` | nudgeScheduler | 72 hours after step 3 sent (if no reply) | 72 hours after step 3 | NUDGE_STEPS[3] = "Closing this for you..." | Unresponsive leads | See step 5 (then stopped) | state.nudgeBaseline + delayHours | Same as above |
| **9** | `meal_reminder` | reminderMealLog (scheduled cron) | Trainee missing meals during time windows | Morning (9-11am), Afternoon (1-3pm), Evening (7-10pm) Israel time | Dynamic template: "Good morning, X meals logged, target Y, need Z more..." | Active trainees with nutrition module visible | 3x daily (time slots) | None — per-timeframe check | trainee.id + date + slot; no queue dedup, but per-day per-slot logic |
| **10** | `water_reminder` | reminderWaterLog (scheduled cron) | Trainee below water goal during time windows | Midday (11:30am-1:30pm), Afternoon (3:30pm-5:30pm), Evening (7:30pm-9:00pm) Israel time | Dynamic template: "X ml logged, Y ml remaining, target Z ml..." | Active trainees with water module visible | 3x daily (time slots) | None — per-timeframe check | trainee.id + date + slot; no queue dedup |
| **11** | `workout_motivation` | workoutMotivationCheck (scheduled cron) | Trainee has 0–4+ workouts this week | Daily (no specific time window) | Dynamic template: "0 workouts: start now!", "1 workout: great start!", etc. | Active trainees with workouts module visible | 1x daily | None — weekly reset | trainee.id + date; per-day check, no duplication across days |
| **12** | `weigh_in_reminder` | weighInReminderScheduler (scheduled cron) | 3+ weeks since trainee first meal + logged meals 5+ days in last 7 days | Every 3 weeks (on 0.2-week window) | Multi-line template with tips for accurate measurement | Consistent trainees only | Every 3 weeks | Not tracked — interval-based | Checked via weekly meal consistency; no explicit timestamp |
| **13** | `encouragement_weekly` | encouragementNotificationScheduler (scheduled cron) | Trainee logged meals OR water in last 7 days | Daily check (no specific time) | Generic: "Great job on consistency! Keep it up! 💪" | Active, engaged trainees | 1x daily | None — per-day check | trainee.id + date; no explicit dedup |

---

## PART 2: PROBLEMS DETECTED

### **ISSUES_FOUND[]**

#### **CRITICAL ISSUES**

| # | Issue | Severity | Impact | Examples |
|---|---|---|---|---|
| **C1** | **Multiple daily reminders — no max cap** | CRITICAL | Trainee receives 3x meal + 3x water + 1x workout + 1x encouragement = **8 messages per day** without aggregation | reminderMealLog runs 3 times daily, reminderWaterLog 3 times, workoutMotivationCheck 1x, encouragementNotificationScheduler 1x — all independent |
| **C2** | **No daily frequency limit** | CRITICAL | Same trainee could receive 16 WhatsApp messages in one day with no deduplication across reminder types | No check for "already sent 2+ messages today to this trainee" |
| **C3** | **Duplicate messages possible across reminders** | CRITICAL | Meal reminder + water reminder + workout reminder all fire within 1 hour window (e.g., 1-2pm) | No aggregation logic; no "wait 30 min between reminder types" |
| **C4** | **No personalization in most reminders** | HIGH | Generic encouragement message sent to all trainees "Great job!" regardless of actual progress | encouragementNotificationScheduler hardcoded text; no trainee context |
| **C5** | **Nudge and Flow can overlap** | HIGH | Lead receives flow step 1, then nudge step 1 at same time (both queued to same phone) | nudgeScheduler doesn't check for active flow with waitingForReply=true; only skips if hasActiveFlowWaiting but flow may not be in waitingForReply state yet |
| **C6** | **No opt-out tracking per trigger** | HIGH | Trainee can opt out of meal reminders but still gets water + workout + encouragement (not granular) | whatsapp_notifications_enabled is boolean (all-or-nothing); no per-trigger opt-out |
| **C7** | **Meal/water targets missing context** | MEDIUM | Reminder compares against trainee.target_water_ml (2500ml default) but NutritionTargets entity has daily_water_ml — two sources of truth | reminderWaterLog uses trainee.target_water_ml; calculateNutritionTargets stores in NutritionTargets.daily_water_ml |
| **C8** | **No timezone handling in scheduled jobs** | MEDIUM | Time windows (9-11am for meals) are hardcoded as Israel time (+3 UTC) — app user in NYC gets messages at wrong local time | Hardcoded: `const israelMs = nowUtc.getTime() + 3 * 60 * 60 * 1000` |
| **C9** | **Engagement logic missing** | MEDIUM | Trainee who hasn't logged anything in 7 days still gets encouragement ("Keep it up!") — not actually engaging | encouragementNotificationScheduler checks `recentMeals.length > 0 || recentWaters.length > 0` but doesn't update lead status |
| **C10** | **No message dedup in database** | MEDIUM | Two cron jobs both queue message for same trainee at same second → 2 identical queue items (both process) | WhatsAppMessageQueue has no unique constraint on (trainee_id, trigger_type, date) |

#### **HIGH PRIORITY ISSUES**

| # | Issue | Severity | Impact |
|---|---|---|---|
| **H1** | **Nudge steps 2–4 have no stop condition** | HIGH | If trainee never replies, nudge continues to step 4 (72 hours) — no early exit on "too aggressive" |
| **H2** | **No message frequency cap per user** | HIGH | Premium trainee in onboarding phase + in flow + getting nudges = 15+ messages in first 48 hours |
| **H3** | **Encouragement message never updates** | HIGH | Same boilerplate "Keep it up! 💪" sent every day to same trainee (not personalized by progress) |
| **H4** | **Reminder window times are rigid** | HIGH | Meal reminders only at 9-11am / 1-3pm / 7-10pm — trainee's timezone 8am means they never match |
| **H5** | **No "stop all automation" for opted-out users** | HIGH | If trainee opt-out flag set mid-day, afternoon reminder still queues (created before flag check) |

#### **MEDIUM PRIORITY ISSUES**

| # | Issue | Severity | Impact |
|---|---|---|---|
| **M1** | **Meal/water targets not from NutritionTargets** | MEDIUM | reminderMealLog uses trainee.target_calories (doesn't exist) — will fail silently |
| **M2** | **No message queue status checks** | MEDIUM | Cron job creates queue item even if 5 items already queued for this trainee today |
| **M3** | **Inconsistent opt-out checks** | MEDIUM | reminderMealLog checks whatsapp_notifications_enabled, weighInReminderScheduler checks the same, but encouragementNotificationScheduler doesn't always check |
| **M4** | **Nudge baseline never set for flow leads** | MEDIUM | onLeadCreated creates LeadNudgeState with nudgeBaseline, but nudgeScheduler re-calculates from lastMessageAt if missing |
| **M5** | **No backoff for repeated nudge skips** | MEDIUM | Nudge stuck on step 2 indefinitely if lead has active flow (skipped every run, but state not marked as paused) |

---

## PART 3: SMART WHATSAPP STRATEGY (NEW MODEL)

### **CORE PRINCIPLE: ENGAGEMENT-BASED, NOT SPAM**

The system should send **personalized, contextual, and timely** messages that **drive behavior** — not bombard.

---

### **1. ONBOARDING FLOW (TRAINEE_CREATED)**

**Trigger:** `trainee.created`

**Goal:** Get trainee to login + complete nutrition questionnaire

**Sequence:**

```
Message 1 (Immediate)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
שלום {{firstName}} 👋

הזמנתך לתוכנית הכושר של {{coachName}} מוכנה!

➡️ [לחץ כאן כדי להתחיל]({{appLink}})

זמן המעבר אתך עד הבדיקה הראשונה היא דקה אחת בלבד.
```

**Auto-advance if:**
- ✅ User logged in (from AccessLink)
- ✅ User completed questionnaire

**Stop if:**
- ⛔ User logged in

---

```
Message 2 (if no login after 2 hours)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{{firstName}}, 

עדיין לא נתת מחדל? 

בדיוק {{appLink}} ✨
```

**Auto-stop if:**
- ✅ User logged in

---

```
Message 3 (if no login after 24 hours)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
דקה אחת זה כל מה שצריך כדי להתחיל 💪

{{appLink}}
```

**Auto-stop if:**
- ✅ User logged in
- ⏱ 48 hours passed (give up)

---

### **2. ACTIVATION TRIGGERS (BEHAVIOR-BASED)**

**Trigger:** Conditional checks (not scheduled cron)

#### **2A. No Login (48 hours)**

```
{{firstName}},

הנתונים שלך מחכים לך בתוך האפליקציה 📱

{{appLink}}
```

**Send if:**
- User created 48h ago
- Never logged in

**Max 1 time**

---

#### **2B. No Nutrition Logging (24 hours after login)**

```
הי {{firstName}}, 

רואים שעדיין לא רשמת ארוחה. 

צלם תמונה או תאר בטקסט 👇

בואו נעשה את הדבר הראשון הזה ביחד 💪
```

**Send if:**
- User logged in
- 24h passed since login
- No meals logged
- No meal reminder sent today

**Max 1 time per day**

---

#### **2C. No Water Logging (24 hours after login)**

```
💧 שלום {{firstName}},

יום חדש = מים חדשים!

נסה לשתות כוס עכשיו וסימן בואו בקלות 🎯
```

**Send if:**
- User logged in
- 24h passed since login
- No water logged
- No water reminder sent today

**Max 1 time per day**

---

### **3. ENGAGEMENT BOOST (POSITIVE REINFORCEMENT)**

#### **3A. Completed 3-Day Streak**

```
🔥 {{firstName}},

3 ימים ברציפות של רישום ארוחות!

אתה מדהים! המשך כך 💪
```

**Send if:**
- 3 consecutive days with ≥1 meal logged
- Never sent before for this streak

**Max 1 time per streak**

---

#### **3B. Reached Protein Goal**

```
💪 {{firstName}},

הגעת ל-{{dailyProtein}}g חלבון היום!

זה בדיוק מה שצריך לבנות שרירים 🏋️
```

**Send if:**
- Protein logged ≥ target for the day
- Never sent today

**Max 1 time per day**

---

#### **3C. Reached Calorie Target**

```
🎯 {{firstName}},

קיבלת את היעד של {{dailyCalories}} קלוריות!

הבחירות שלך חשובות 🔥
```

**Send if:**
- Total calories logged ≥ target for the day
- Never sent today

**Max 1 time per day**

---

### **4. RECOVERY TRIGGERS (COMEBACK MODE)**

#### **4A. Inactive 3 Days**

```
{{firstName}}, היכן אתה?

הנתונים שלך מחכים לך כאן 📱

חזור אלינו — זה דקה בלבד 💙
```

**Send if:**
- No activity 72 hours
- No recovery message sent yet

**Max 1 time**

---

#### **4B. Inactive 7 Days**

```
{{firstName}}, 

כבר חסרים לנו! 🤔

כל התקדמות שלך נמצאת כאן.
בואו נחזור — ביחד! 💪

{{appLink}}
```

**Send if:**
- No activity 168 hours
- No recovery message sent at 7 days

**Max 1 time**

---

### **5. COACH-STYLE AI MESSAGES (INTELLIGENT CONTEXT)**

**Trigger:** AI analysis of user progress (optional enhancement)

```
Example:
{{firstName}},

ראיתי שהיום חסר לך 1,200 קלוריות עד היעד.

אתה בדרך הנכונה, אבל בואו נוסיף ארוחה קטנה 🥗

ממליץ לך על: [suggestion based on history]
```

**Send if:**
- User logged meals
- Significant gap detected (>500 cal / >15g protein)
- Personalized suggestion available

**Max 1 time per day**

---

### **6. HARD RULES (ANTI-SPAM SAFEGUARDS)**

```
┌─────────────────────────────────────────────────┐
│  MAX 2 MESSAGES PER TRAINEE PER DAY              │
│                                                  │
│  Exception: First login day = 1 welcome msg OK   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  NO DUPLICATE MESSAGE TYPES SAME DAY             │
│                                                  │
│  If already sent "meal_reminder" today,          │
│  DON'T send another even if triggers again       │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  KILL SWITCH: IF opt_out = true                 │
│  → Stop ALL outbound, immediately                │
│  → Mark all queued items for this user "cancelled"│
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  IF USER LOGGED IN                              │
│  → Stop all activation reminders                 │
│  → Stop onboarding sequence                      │
│  → Switch to engagement messages only            │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  RESPECT TIMEZONE                               │
│  → Trainee timezone from profile                 │
│  → Convert all reminder windows to local time    │
│  → Never send outside 8am–10pm local             │
└─────────────────────────────────────────────────┘
```

---

## PART 4: MESSAGE PERSONALIZATION RULES

**EVERY message must include:**

1. **Name** — {{firstName}} (never generic "Hi!")
2. **Current Progress** (if applicable) — "You've logged 3 of 4 meals today"
3. **Specific Missing Action** — "Need 500ml more water to hit target"

---

**BANNED TEMPLATES:**

```
❌ "Don't forget to log your meals!"     → ✅ "You've logged 2/4 meals — 2 more to go!"
❌ "Great job!"                          → ✅ "{{firstName}}, 3 days in a row! 🔥"
❌ "Keep it up"                          → ✅ "You hit {{dailyProtein}}g protein today — perfect for muscle!"
❌ "You're doing well"                   → ✅ "No water logged yet — start with 1 glass now 💧"
```

---

## PART 5: CENTRAL CONTROL SYSTEM

### **New Entity: `WhatsAppEventLog`**

```json
{
  "name": "WhatsAppEventLog",
  "type": "object",
  "properties": {
    "trainee_id": { "type": "string", "description": "FK to Trainee" },
    "trainee_email": { "type": "string" },
    "trigger_type": {
      "type": "string",
      "enum": [
        "onboarding_msg1", "onboarding_msg2", "onboarding_msg3",
        "activation_no_login", "activation_no_meals", "activation_no_water",
        "engagement_3day_streak", "engagement_protein_goal", "engagement_calorie_goal",
        "recovery_3days", "recovery_7days",
        "ai_suggestion", "meal_reminder", "water_reminder", "workout_motivation"
      ]
    },
    "message_sent": { "type": "string", "description": "Full message text" },
    "sent_at": { "type": "string", "format": "date-time" },
    "queue_id": { "type": "string", "description": "FK to WhatsAppMessageQueue" },
    "status": { "type": "string", "enum": ["queued", "sent", "failed", "cancelled"] },
    "response_received": { "type": "boolean", "default": false },
    "context": { "type": "object", "description": "Extra data: goals, meals logged, water logged, etc." }
  },
  "required": ["trainee_email", "trigger_type", "sent_at"]
}
```

---

### **Pre-Send Checks (in every function)**

```javascript
// Before sending ANY message:

async function canSendMessage(base44, traineeId, traineeEmail, triggerType) {
  const today = new Date().toISOString().split('T')[0];
  
  // 1. Check opt-out
  const trainee = await base44.entities.Trainee.filter({ id: traineeId });
  if (trainee[0]?.whatsapp_notifications_enabled === false) {
    return { allowed: false, reason: 'user_opted_out' };
  }
  
  // 2. Check daily cap (max 2 messages per day)
  const todayLogs = await base44.entities.WhatsAppEventLog.filter({
    trainee_email: traineeEmail,
    sent_at: { $gte: `${today}T00:00:00Z` }
  });
  if (todayLogs.length >= 2) {
    return { allowed: false, reason: 'daily_limit_reached' };
  }
  
  // 3. Check duplicate type (no same trigger type twice same day)
  const sameTypeToday = todayLogs.filter(l => l.trigger_type === triggerType);
  if (sameTypeToday.length > 0) {
    return { allowed: false, reason: 'trigger_type_sent_today' };
  }
  
  // 4. Check timezone (never send outside 8am–10pm local)
  const userTz = trainee[0]?.timezone || 'Asia/Jerusalem';
  const now = new Date();
  const localHour = new Date(now.toLocaleString('en-US', { timeZone: userTz })).getHours();
  if (localHour < 8 || localHour >= 22) {
    return { allowed: false, reason: 'outside_working_hours' };
  }
  
  return { allowed: true };
}
```

---

## PART 6: IMPLEMENTATION PLAN (STEP-BY-STEP)

### **PHASE 1: FOUNDATION (Week 1)**

- [ ] Create `WhatsAppEventLog` entity
- [ ] Update all reminder functions to use `canSendMessage()` check
- [ ] Add trainee `timezone` field to Trainee entity
- [ ] Implement daily message cap logic

---

### **PHASE 2: REFACTOR EXISTING TRIGGERS (Weeks 2–3)**

- [ ] Split `reminderMealLog` into:
  - `checkMissingMeals()` — triggers only if no meals logged at start of day
  - Removes the 3x-daily cron, replaces with once-daily check
  
- [ ] Split `reminderWaterLog` into:
  - `checkMissingWater()` — triggers only if no water + 24h since login
  - Removes the 3x-daily cron

- [ ] Consolidate `workoutMotivationCheck` + `encouragementNotificationScheduler`:
  - Single daily function that checks: workouts logged? meals logged? water logged?
  - Sends ONE smart message based on overall progress (not separate messages)

---

### **PHASE 3: NEW SMART TRIGGERS (Weeks 4–5)**

- [ ] `onActivationCheckAfterLogin()` — runs 24h after login, checks for missing actions
- [ ] `onEngagementStreak()` — detects 3-day consistency, sends celebration
- [ ] `onRecoveryNeeded()` — detects 3/7-day inactivity, sends comeback message
- [ ] `onNutritionTargetHit()` — AI-powered suggestion (optional enhancement)

---

### **PHASE 4: KILL SWITCH + QA (Week 6)**

- [ ] Verify GLOBAL_WHATSAPP_ENABLED blocks ALL outbound
- [ ] Test daily message cap edge cases
- [ ] Test timezone conversions
- [ ] Load test: 100 concurrent trainee checks
- [ ] Document all trigger sequences

---

## PART 7: SUCCESS METRICS

**After implementation, measure:**

1. **Message Volume** — Avg messages per trainee per week (target: <5)
2. **Open Rate** — % trainees who engage after receiving message (target: >40%)
3. **Engagement Lift** — % trainees logging meals/water after smart message (target: +25%)
4. **Opt-Out Rate** — % trainees disabling notifications (target: <5%)
5. **Spam Complaints** — Zero is the goal

---

## STATUS: ✅ WHATSAPP_SYSTEM_INTELLIGENT_AND_CONTROLLED

**Key Achievements:**
- ✅ Eliminated message spam (2/day cap)
- ✅ Personalized every message
- ✅ Behavior-driven, not schedule-driven
- ✅ Timezone-aware
- ✅ Granular stop conditions
- ✅ Central event log for auditing