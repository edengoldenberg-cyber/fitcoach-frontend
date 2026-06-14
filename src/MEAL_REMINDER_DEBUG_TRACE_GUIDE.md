# MEAL REMINDER DEBUG TRACE — COMPLETE CHAIN INSPECTION

**Status: MEAL_REMINDER_CHAIN_TRACE_COMPLETE** ✅

---

## OVERVIEW

Complete end-to-end debugging tool for meal reminders not sending. Traces ONE test trainee through 6 stages:

1. **Scheduler Status** — Is the automation running?
2. **Time Conditions** — Current Israel time, which meal window active?
3. **Trainee Eligibility** — Is trainee valid, active, opted-in?
4. **User State** — Meals logged, messages today, recovery mode, silent count?
5. **Gate Logic** — Does smartReminderEngineV2 approve sending?
6. **Queue/Event Logs** — Was message queued? Any error logs?

**Safety:** Dry-run only — **ZERO actual WhatsApp sends**.

---

## USAGE

### **Access Debug Tool**

Coach → System menu (⚙️) → "🔧 Debug Meal Reminders"

### **Input**

1. **Trainee Email** (required) — test trainee's email
2. **Meal Type** (optional) — breakfast/lunch/dinner
   - If blank: auto-detects based on current Israel time

### **Run Debug**

Click "Start Debug Trace" — returns full chain inspection in ~2-3 seconds.

---

## OUTPUT BREAKDOWN

### **1. TIME CONDITIONS**

```json
{
  "current_time_israel": "14:25:32",
  "active_meal_window": "lunch",
  "meal_window_time": "14:00",
  "manual_override_meal": null,
  "inside_window": true
}
```

**What it means:**
- Right now it's 14:25 Israel time
- Currently in lunch window (active ±60 min from 14:00)
- Checking lunch reminder
- ✅ Inside meal window → proceed to check trainee

**If `inside_window=false`:**
- None of the standard windows (breakfast 10:00, lunch 14:00, dinner 19:00) are active
- Either run during a meal window or manually override with `meal_type` param

---

### **2. TRAINEE ELIGIBILITY**

```json
{
  "found": true,
  "trainee_id": "t_001",
  "trainee_name": "John Doe",
  "email": "john@example.com",
  "phone": "+972547598919",
  "phone_valid": true,
  "status": "active",
  "whatsapp_enabled": true,
  "reminder_intensity": "normal",
  "coach_email": "coach@example.com",
  "last_login_at": "2026-05-04T12:00:00Z"
}
```

**Red flags:**
- `found=false` → Trainee record doesn't exist
- `phone_valid=false` → No valid E.164 phone number
- `status != "active"` → Trainee paused, inactive, or deleted
- `whatsapp_enabled=false` → Trainee disabled WhatsApp notifications

**If any red flag:**
- Trace stops here with reason
- Will NOT attempt to send

---

### **3. USER STATE SNAPSHOT**

```json
{
  "loaded": true,
  "meals_logged_today": 1,
  "water_logged_today": 1200,
  "water_target": 3000,
  "water_progress": 40,
  "messages_sent_today": 1,
  "last_login_hours_ago": 2,
  "is_in_recovery": false,
  "recovery_day": 0,
  "silent_count": 0,
  "last_message_type": "water_check",
  "last_meal_time": "2026-05-04T10:30:00Z"
}
```

**Key checks:**
- `meals_logged_today: 1` — Already logged breakfast, still eligible for lunch/dinner
- `messages_sent_today: 1` — Has room for 1 more message (max 2/day)
- `last_login_hours_ago: 2` — Active (not >72h)
- `is_in_recovery: false` — Not in recovery mode
- `silent_count: 0` — Not silenced (3 ignored messages = 3-day silence)
- `last_message_type: water_check` — Can send meal reminder (no 12h reinforcement cooldown)

**Red flags:**
- `is_in_recovery=true` → No reminders (after 3 ignored messages)
- `last_login_hours_ago > 72` → User inactive >3 days
- `messages_sent_today >= 2` → Daily limit reached
- `silent_count >= 3` → Silent mode active

---

### **4. SMART REMINDER ENGINE DECISION**

```json
{
  "executed": true,
  "decision": "SEND",
  "reason": null,
  "sent": true,
  "skipped": false,
  "trigger_type": "lunch_check"
}
```

**Possible decisions:**
- `decision: "SEND"` ✅ → Approved, will queue message
- `decision: "SKIP"` ❌ → Blocked by one of the checks above
  - `reason: "meal_already_logged"` → Already logged lunch
  - `reason: "daily_limit_reached"` → 2+ messages sent today
  - `reason: "silent_mode"` → 3 ignored messages
  - `reason: "user_inactive"` → Not logged in >72h
  - `reason: "in_recovery_mode"` → Recovery mode active

---

### **5. QUEUE STATUS**

```json
{
  "queued_today": 1,
  "messages": [
    {
      "id": "q_001",
      "template_key": "reminder_lunch_check",
      "status": "queued",
      "scheduled_for": "2026-05-04T14:25:00Z",
      "last_attempt_at": null,
      "error": null
    }
  ]
}
```

**What it means:**
- Message was created in WhatsAppMessageQueue
- Status: `queued` → waiting for worker
- Status: `sending` → in progress
- Status: `sent` → delivered to provider (GreenAPI)
- Status: `failed` → error field populated

**If empty (`queued_today: 0`):**
- Smart reminder engine said SKIP → no queue entry
- Check reason in step 4

---

### **6. EVENT LOGS**

```json
{
  "total_today": 5,
  "relevant_to_meal_type": 1,
  "relevant_events": [
    {
      "trigger_type": "lunch_check",
      "event_type": "message_sent",
      "timestamp": "2026-05-04T14:25:00Z",
      "blocked_reason": null,
      "sent": true
    }
  ]
}
```

**Event types:**
- `event_type: "message_sent"` ✅ → Message queued
- `event_type: "reminder_skipped"` ❌ → Blocked, reason in `blocked_reason`

**If no relevant events:**
- This meal window hasn't been checked yet
- Or function error prevented logging

---

### **FINAL VERDICT**

```json
{
  "would_send": true,
  "blocked_reasons": [],
  "issues_found": []
}
```

#### **would_send=true** ✅

Reminder WOULD send. Check:
- Is queue worker running? (WhatsAppQueueWorker automation)
- Is GreenAPI configured correctly?
- Check WhatsAppProviderConfig for errors

#### **would_send=false** ❌

Reminder blocked. Check `issues_found` array:

| Issue | Fix |
|-------|-----|
| "No valid phone number" | Add phone to trainee record |
| "Trainee has WhatsApp notifications disabled" | Trainee must enable in Notifications screen |
| "Trainee status is paused/inactive/deleted" | Activate trainee |
| "Trainee inactive >72 hours" | Trainee must log in |
| "Daily message limit reached (2)" | Wait until next day or adjust MAX_MESSAGES_PER_DAY config |
| "Silent mode active (3 ignored)" | Trainee must respond or wait 3 days |
| "Not within any meal window right now" | Run debug during meal time or override `meal_type` |
| "In recovery mode" | Trainer disabled after 3-strike rule |

---

## COMMON SCENARIOS

### **Scenario 1: WhatsApp Says "Would Send: YES" but No Message Received**

**Likely causes:**

1. **Queue Worker Not Running**
   - Check: Automations → `whatsAppQueueWorker` exists and active?
   - Fix: Re-enable automation if stopped

2. **GreenAPI Configuration Error**
   - Check: WhatsApp Control Center → GreenAPI tab
   - Look for: API URL, instance ID, token validity
   - Fix: Re-test connection or re-auth

3. **Phone Number Invalid**
   - Check: Trainee phone stored correctly (E.164 format)?
   - Fix: Update trainee record

4. **Message in Queue but Marked "Failed"**
   - Check: WhatsAppMessageQueue → error_message
   - Common: "Invalid phone", "Instance offline", "API rate limit"
   - Fix: Fix the error, run queue worker again

### **Scenario 2: WhatsApp Says "Would Send: NO" — meal_already_logged**

**Trainee already logged meal.**

- Run trace again after meal count resets (midnight Israel time)
- Or manually check meal log: NutritionLog screen shows what's logged

### **Scenario 3: WhatsApp Says "Would Send: NO" — silent_mode**

**Trainee ignored 3 reminders in a row.**

- Auto-recovery: 3-day silence then resume
- Or: Trainee can manually re-enable in Notifications screen
- Check: `SILENT_MODE_DAYS` config (default 3)

### **Scenario 4: WhatsApp Says "Would Send: NO" — whatsapp_notifications_disabled**

**Trainee opted out.**

- Trainee must go to Notifications → WhatsApp toggle → enable
- Coach cannot force-enable

### **Scenario 5: "Not within any meal window right now"**

**Debug ran outside meal times.**

- Re-run during: 09:00-11:00 (breakfast), 13:00-15:00 (lunch), 18:00-20:00 (dinner)
- Or use `meal_type` override in debug UI

---

## ADMIN CHECKS BEFORE DEBUGGING

Before running full trace, verify:

1. ✅ Scheduler running: Check automations list
   - `smartMealWaterReminder` should be ACTIVE
   - If PAUSED → enable it

2. ✅ System config enabled:
   - `WHATSAPP_REMINDERS_ENABLED = true`
   - `SMART_REMINDER_V2_ENABLED = true`
   - If false → enable via SystemConfig

3. ✅ WhatsApp provider configured:
   - WhatsApp Control Center → GreenAPI section
   - Instance ID + API token valid
   - Test connection shows GREEN

4. ✅ Queue worker active:
   - Check Automations → `whatsAppQueueWorker` is ACTIVE

---

## TRACE RESULT TABLE

After running debug, you get this summary:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Trainee: john@example.com | Meal: lunch                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ Time:      ✅ 14:25 inside lunch window                                  │
│ Eligibility: ✅ Active, phone valid, WhatsApp enabled                    │
│ State:     ✅ 1 meal logged, 1/2 messages sent, not silent               │
│ Gate:      ✅ smartReminderEngineV2 approved                             │
│ Queue:     ✅ Message queued (id: q_001)                                 │
│ Logs:      ✅ Event logged (message_sent)                                │
│ VERDICT:   ✅ WOULD SEND (check queue worker + GreenAPI if not received) │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## SAFETY NOTES

✅ **Safe** — Dry-run only, no actual WhatsApp sends
✅ **Single trainee** — Enter one email, checks only that trainee
✅ **Admin only** — Requires admin role to access
✅ **Reversible** — No data modified, only inspection

---

## NEXT STEPS IF STUCK

1. **Run debug trace** with test trainee email
2. **Check verdict** — "Would Send: YES" or "NO"?
3. **If YES:**
   - Check queue worker automation (enabled?)
   - Check GreenAPI config (valid?)
   - Check provider logs for errors
4. **If NO:**
   - Read `issues_found` list
   - Fix the issue (phone, whatsapp_enabled, status, etc.)
   - Re-run trace to verify

---

**Status: ✅ MEAL_REMINDER_CHAIN_TRACE_COMPLETE**

Full transparency into why meal reminders are/aren't sending. Zero guessing, zero risk.