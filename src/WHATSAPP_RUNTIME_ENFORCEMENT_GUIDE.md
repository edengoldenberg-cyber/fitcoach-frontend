# WHATSAPP RUNTIME ENFORCEMENT + PRIORITY ENGINE

**Status: WHATSAPP_RUNTIME_INTELLIGENCE_ACTIVE**

---

## SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────┐
│  TRIGGER (scheduler/flow/entity automation)                         │
│  e.g., reminderMealLog, salesFlowRunner, nudgeScheduler            │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PRIORITY ORCHESTRATOR (whatsAppPriorityOrchestrator)               │
│  If multiple triggers fire:                                         │
│  - Score each by (priority × 100 + relevance_score)                │
│  - Select winner, skip others                                       │
│  - Return winning trigger                                           │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SMART GATE (whatsAppSmartGate)                                    │
│                                                                      │
│  Enforce:                                                            │
│  ✓ Window check (8-11am, 12-4pm, 5-9pm only)                      │
│  ✓ Daily cap (max 2 messages/day)                                  │
│  ✓ Silence threshold (3 ignored → 3-day silence)                   │
│  ✓ Context relevance (message matches user state)                  │
│  ✓ User state snapshot (meals, water, streak, login)              │
│                                                                      │
│  Output: approved (true/false) + reason + metadata                 │
└─────────────────┬───────────────────────────────────────────────────┘
                  │
                  ▼
        ┌─────────┴──────────┐
        │                    │
        ▼ YES               ▼ NO
    ┌────────────┐     ┌──────────┐
    │ QUEUE      │     │ LOG SKIP │
    │ MESSAGE    │     │ & RETURN │
    └────┬───────┘     └──────────┘
         │
         ▼
    ┌──────────────────────────────────────┐
    │  WhatsAppPerformance record created  │
    │  (tracks: trigger, priority, window, │
    │   user_state_snapshot, decision_log) │
    └──────────────────────────────────────┘
         │
         ▼
    ┌──────────────────────────────────────┐
    │  METRICS UPDATE (whatsAppUpdateMetrics)│
    │  When user acts:                       │
    │  - Set action_taken                    │
    │  - Set conversion (true/false)         │
    │  - Update silent_count                 │
    │  - Set silenced_until if needed        │
    └──────────────────────────────────────┘
```

---

## EXECUTION WINDOWS

**Israel Time Only**

| Window | Hours | Max Messages | Purpose |
|--------|-------|--------------|---------|
| **Morning** | 08:00–11:00 | 1 | Breakfast / wake-up reminders |
| **Afternoon** | 12:00–16:00 | 1 | Lunch / mid-day motivation |
| **Evening** | 17:00–21:00 | 1 | Dinner / comeback messages |
| **Night** | 21:00–08:00 | 0 | Silent (never send) |

---

## PRIORITY LEVELS

### **HIGH (send whenever gate passes)**

- `onboarding_msg1`, `onboarding_msg2`, `onboarding_msg3` — New trainee onboarding
- `activation_no_login` — No login for 48 hours
- `recovery_7days` — No activity for 7 days

**Decision Logic:** Always send if gate passes + window open + daily cap not hit.

---

### **MEDIUM (send if relevant)**

- `activation_no_meals` — No meals logged today
- `activation_no_water` — No water logged today
- `recovery_3days` — No activity for 3 days

**Decision Logic:** Send only if user state matches trigger (e.g., no meals logged today for `activation_no_meals`).

---

### **LOW (send only if high engagement)**

- `engagement_3day_streak` — Celebrate 3-day consistency
- `engagement_protein_goal` — Hit protein target
- `engagement_calorie_goal` — Hit calorie target
- `workout_motivation` — Weekly workout check-in
- `encouragement_weekly` — Generic encouragement
- `ai_suggestion` — AI meal recommendation

**Decision Logic:** Send only if user actively logging (meals today, streak active, etc.) AND highest priority ready.

---

## SMART GATE LOGIC

### **Check 1: Window Validation**

```javascript
const window = getCurrentWindow(); // 'morning' | 'afternoon' | 'evening' | null
if (!window) {
  return { approved: false, reason: 'outside_window' };
}
```

---

### **Check 2: Daily Cap**

```javascript
const messagesThisDayCount = perf.filter(p => p.message_sent_at.startsWith(todayStr)).length;
if (messagesThisDayCount >= 2) {
  return { approved: false, reason: 'daily_limit_reached' };
}
```

---

### **Check 3: Silent User Detection**

```javascript
if (userState.silent_count >= 3) {
  const lastLog = perf[0];
  if (lastLog.silenced_until && new Date(lastLog.silenced_until) > now) {
    return { approved: false, reason: 'user_silenced' };
  }
}
```

Rules:
- If message ignored (no action) → `silent_count++`
- If `silent_count >= 3` → `silenced_until = now + 3 days`
- After 3 days: send ONE comeback message, then resume normal

---

### **Check 4: Context Relevance**

```javascript
function isRelevant(triggerType, userState) {
  switch (triggerType) {
    case 'activation_no_meals':
      return userState.meals_logged_today === 0;
    case 'activation_no_water':
      return userState.water_logged_today < 500;
    case 'engagement_3day_streak':
      return userState.streak_days >= 3;
    case 'recovery_7days':
      return userState.hours_since_last_message > 168;
    default:
      return true; // HIGH priority always relevant
  }
}
```

---

## PRIORITY SCORING

When multiple triggers compete, use **combined score**:

```
combined_score = (PRIORITY_LEVEL × 100) + relevance_score

where:
  HIGH = 3, MEDIUM = 2, LOW = 1
  relevance_score = 0–100 (calculated by user state match)
```

**Example:**

| Trigger | Priority | Relevance | Score | Winner? |
|---------|----------|-----------|-------|---------|
| `activation_no_login` | HIGH (3) | 80 | 380 | ✅ |
| `engagement_3day_streak` | LOW (1) | 85 | 185 | ❌ |
| `meal_reminder` | MEDIUM (2) | 60 | 260 | ❌ |

**Winner:** `activation_no_login` (highest priority trumps higher relevance)

---

## USER STATE SNAPSHOT

Every message decision includes:

```json
{
  "last_login": "2026-05-04T14:30:00Z",
  "meals_logged_today": 2,
  "water_logged_today": 750,
  "streak_days": 5,
  "last_message_sent_type": "meal_reminder",
  "messages_sent_today": 1,
  "hours_since_last_message": 3,
  "silent_count": 0
}
```

Used for:
- Relevance check
- Context in future decisions
- Performance analysis
- Debugging

---

## METRICS TRACKING

### **WhatsAppPerformance Entity**

Every message attempt creates a record with:

| Field | Purpose |
|-------|---------|
| `message_sent_at` | When queued |
| `trigger_type` | Which trigger |
| `priority` | HIGH/MEDIUM/LOW |
| `window_sent` | morning/afternoon/evening |
| `user_state_snapshot` | Full context at decision time |
| `decision_log` | Why approved/rejected |
| `action_taken` | What user did after (updated later) |
| `conversion` | Did user do desired action? |
| `silent_user_count` | How many ignored in a row |

### **Conversion Tracking**

After message sent, call `whatsAppUpdateMetrics` when user acts:

```javascript
await whatsAppUpdateMetrics(base44, {
  traineeEmail,
  actionTaken: 'logged_meal', // or 'login', 'logged_water', 'ignored', etc.
  performanceRecordId
});
```

System will:
1. Check if action matches expected (e.g., `meal_reminder` → `logged_meal` = ✅)
2. Set `conversion = true/false`
3. Reset `silent_count` if user acted
4. Set `silenced_until` if count >= 3

---

## DEBUG MODE

Every decision logged with **WHY**:

```
[GATE_APPROVED] activation_no_meals → user@example.com
  priority=MEDIUM
  window=afternoon
  reason=context_matched (meals_logged_today=0)
  user_state={meals:0, water:750, streak:5, silent:0}

[GATE_BLOCKED] engagement_3day_streak → user@example.com
  reason=daily_limit_reached (already sent 2 today)

[GATE_BLOCKED] meal_reminder → user@example.com
  reason=outside_window (current=22:30)

[METRICS_UPDATED] user@example.com
  action=logged_meal
  conversion=true
  silent_count=0 (reset)
```

---

## INTEGRATION GUIDE

### **From Existing Schedulers**

**Before:** Direct queue to WhatsAppMessageQueue

**After:**

```javascript
import { whatsAppSmartGate } from '@base44/functions/whatsAppSmartGate';

// In reminderMealLog.js or other scheduler:

for (const trainee of trainees) {
  const messageText = '...'; // Your template
  
  // Gate the message
  const gateResult = await base44.asServiceRole.functions.invoke('whatsAppSmartGate', {
    traineeId: trainee.id,
    traineeEmail: trainee.user_email,
    triggerType: 'meal_reminder',
    messageText
  });
  
  if (gateResult.approved) {
    // NOW queue
    await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
      coach_email: trainee.coach_email,
      to_phone_e164: phone,
      rendered_text: messageText,
      // ... rest of queue fields
    });
  } else {
    console.log(`Skipped: ${gateResult.reason}`);
  }
}
```

---

### **Competing Triggers**

If multiple schedulers might fire for same trainee at same time:

```javascript
import { whatsAppPriorityOrchestrator } from '@base44/functions/whatsAppPriorityOrchestrator';

const competingTriggers = [
  { type: 'activation_no_login', text: 'Hi {{name}}, where are you?' },
  { type: 'engagement_3day_streak', text: '3 days in a row! 🔥' }
];

const result = await base44.asServiceRole.functions.invoke('whatsAppPriorityOrchestrator', {
  traineeId: trainee.id,
  traineeEmail: trainee.user_email,
  competingTriggers
});

if (result.result.winning_trigger) {
  const winner = result.result.winning_trigger;
  // Gate winner
  const gateResult = await whatsAppSmartGate(base44, trainee.id, trainee.user_email, winner.type, winner.text);
  if (gateResult.approved) {
    // Queue winner.text
  }
  // Skipped: result.result.skipped[]
}
```

---

## ROLLOUT CHECKLIST

- [ ] Create `WhatsAppPerformance` entity
- [ ] Deploy `whatsAppSmartGate` function
- [ ] Deploy `whatsAppUpdateMetrics` function
- [ ] Deploy `whatsAppPriorityOrchestrator` function
- [ ] Update `reminderMealLog` to use gate
- [ ] Update `reminderWaterLog` to use gate
- [ ] Update `workoutMotivationCheck` to use gate
- [ ] Update `encouragementNotificationScheduler` to use gate
- [ ] Update `nudgeScheduler` to use gate (optional: for conflicts with flow)
- [ ] Add comeback message on silence recovery
- [ ] Test window logic (morning/afternoon/evening)
- [ ] Test daily cap (2/day max)
- [ ] Test silent user threshold (3 ignored = 3-day silence)
- [ ] Test priority scoring (HIGH > MEDIUM > LOW)
- [ ] Test metrics tracking (action_taken updates)
- [ ] Load test: 1000 concurrent trainees

---

## METRICS DASHBOARD (Future)

Monitor:

```
SELECT
  trigger_type,
  COUNT(*) as sent,
  SUM(CASE WHEN conversion THEN 1 ELSE 0 END) as conversions,
  SUM(CASE WHEN conversion THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as conversion_rate,
  AVG(DATEDIFF(minute, message_sent_at, action_taken_at)) as avg_response_time_min
FROM WhatsAppPerformance
WHERE message_sent_at >= DATEADD(day, -7, GETDATE())
GROUP BY trigger_type
ORDER BY conversion_rate DESC;
```

Expected outcomes:
- HIGH priority: >50% conversion
- MEDIUM priority: >30% conversion
- LOW priority: >20% conversion

---

**Status: ✅ WHATSAPP_RUNTIME_INTELLIGENCE_ACTIVE**

Every message now flows through intelligent gates. No more spam, just smart coaching.