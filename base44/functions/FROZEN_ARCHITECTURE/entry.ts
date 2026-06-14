# FROZEN ARCHITECTURE SPECIFICATION
**Date**: 2026-03-14 | **Status**: LOCKED | **Changes**: DEFENSIVE ONLY

This document freezes the WhatsApp lead management system architecture. All behavioral changes are forbidden. Only defensive protections (logging wraps, null checks, try/catch isolation) are permitted.

---

## SECTION A: FROZEN SYSTEM ARCHITECTURE

### Authority Matrix

| Component | Authority Level | Purpose | File |
|-----------|-----------------|---------|------|
| **onLeadCreated** | PRIMARY | Initialize first message, create flow session | `functions/onLeadCreated` |
| **whatsAppInboundWebhook** | PRIMARY | Ingest messages, deduplicate, match lead, route reply | `functions/whatsAppInboundWebhook` |
| **aiConversationAgent** | SECONDARY | Generate AI-driven replies (if AI Brain active) | `functions/aiConversationAgent` |
| **salesFlowRunner** | SECONDARY | Progress conversation flow (if AI not active) | `functions/salesFlowRunner` |
| **whatsAppQueueWorker** | PRIMARY | Only component that sends messages to provider | `functions/whatsAppQueueWorker` |

### Conversation Pipeline (Immutable)

```
Lead Created
    ↓
onLeadCreated selects SalesConversationFlow
    ↓
Creates WhatsAppMessageQueue (step 1)
    ↓
Creates LeadConversationState (session tracking)
    ↓
    ├─ Worker polls queue (5 min schedule)
    │    ↓
    │    whatsAppQueueWorker sends via Green API
    │    ↓
    │    Updates queue status: queued → sending → sent
    │
    ├─ Meanwhile: Inbound message arrives
    │    ↓
    │    whatsAppInboundWebhook (HTTP 200 immediate)
    │    ↓ (background processing)
    │    Deduplicate, match lead, save to LeadMessageThread
    │    ↓
    │    Route to reply authority:
    │         IF AI Brain active → aiConversationAgent
    │         ELSE → salesFlowRunner
    │    ↓
    │    Generate reply, queue it
    │    ↓
    │    Worker sends reply on next cycle
```

### Official Queue Status States

**Immutable State Progression**:

```
queued
    ↓
sending (when worker starts send)
    ↓
sent (success)
    ↓
provider_unconfirmed (success, no messageId)

OR

failed (any error, max 3 attempts)

OR

cancelled (explicitly cancelled)
```

**No other states permitted.**

---

## SECTION B: OFFICIAL LEAD LIFECYCLE STATES

### Lead Status Enum (Immutable)

```
NEW
    ↓
CONTACTED (when first message sent)
    ↓
INTERESTED (when lead replies, no explicit action)
    ↓
├─ CALL_REQUESTED (explicit request or detected by AI)
│     ↓
│     (CallTask created)
│
├─ BOOKED (when TrialBooking created)
│     ↓
│     (Trial session scheduled)
│
└─ CLOSED (opt-out, no response, or explicit close)
      ↓
      (No further messages)
```

### Lead Flags (Independent of Status)

| Flag | Type | Authority | Behavior |
|------|------|-----------|----------|
| `isSimulatorLead` | boolean | `onLeadCreated` (from source='manual_test') | Messages queued but never sent to Green API |
| `waOptOut` | boolean | `whatsAppInboundWebhook` (on opt-out keyword) | Blocks all downstream processing |
| `activeScriptId` | string | `aiConversationAgent` (if script active) | Script interpretation attempted before AI |
| `currentScriptStage` | number | Script engine | Prevents regression to lower stages |

### Lead Temperature (Intelligence Signal, Not State)

| Temperature | Criteria | Action |
|-------------|----------|--------|
| COLD | default | Normal conversation |
| WARM | leadScore ≥ 30 | Elevated attention |
| HOT | leadScore ≥ 60 OR hot triggers detected | Immediate sales call offer |

**HOT Lead Triggers**: goal + pain + urgency all present, OR explicit hot keyword

---

## SECTION C: OFFICIAL CONVERSATION LIFECYCLE STATES

### LeadConversationState (Flow Session Tracking)

**Immutable Progression**:

```
Created (sessionId generated)
    ↓
ACTIVE (messages being exchanged)
    ↓
├─ COMPLETED (all steps done, no error)
│
├─ PAUSED (manual pause by coach)
│
└─ STOPPED (manual stop, or AI escalation)
```

**Session Guarantees**:
- One `sessionId` per `onLeadCreated` invocation
- One active session per lead at any time
- Old sessions automatically deactivated on restart
- Session ID never changes during lead lifetime

### LeadMessageThread (Conversation History, Immutable)

**Properties**:
- `direction`: INBOUND or OUTBOUND (immutable after create)
- `senderType`: LEAD, SYSTEM, or STAFF
- `messageText`: Full message content
- `aiProcessed`: True if processed by AI (idempotency)
- `replyGenerationStartedAt`: Lock timestamp (30s timeout)
- `replyProducer`: Which system generated reply (aiConversationAgent or salesFlowRunner)
- `replyStatus`: pending → generated → queued → sent → failed

**Guarantee**: Each inbound message has exactly one reply authority (never two)

---

## SECTION D: REPLY AUTHORITY LOGIC (FROZEN)

### Single Reply Authority Rule

**Location**: `whatsAppInboundWebhook` line 572-611

**Pseudocode**:
```
ON inbound message saved to LeadMessageThread:

  IF (AI Brain config exists AND isActive === true) THEN
    // AI owns this reply
    → aiConversationAgent processes via entity automation
    → whatsAppInboundWebhook does NOT call salesFlowRunner
    
  ELSE
    // Sales Flow owns this reply
    → whatsAppInboundWebhook claims lock
    → sets replyGenerationStartedAt = now
    → invokes salesFlowRunner(continueFromReply=true)
    
ENDIF

// Lock timeout: 30 seconds
// If aiConversationAgent sees replyGenerationStartedAt < 30s, skip (already claimed)
```

### Authority Decision Authority

| Authority | Method | Source |
|-----------|--------|--------|
| Determines active AI | Query AIBrainConfig | `whatsAppInboundWebhook` line 574-575 |
| Locks reply generation | replyGenerationStartedAt + replyProducer | Both systems check before processing |
| Prevents duplicate replies | 30s idempotency window | `aiConversationAgent` line 302-313 |

**CRITICAL**: No race conditions. Both systems perform idempotent checks before claiming lock.

---

## SECTION E: SALES CALL ESCALATION LOGIC (FROZEN)

### Call Ready Triggers (Any One Triggers Creation)

**Source 1: Lead Explicit Request** (whatsAppInboundWebhook):
```
IF messageText.includes("תתקשר", "תחזור", "דבר איתי")
  → status = 'CALL_REQUESTED'
  → createCallTask invoked
```

**Source 2: Flow Step Configuration** (salesFlowRunner):
```
IF SalesConversationStep.suggest_call === true
  → After answer collected
  → createCallTask invoked
```

**Source 3: AI Intelligence Detection** (aiConversationAgent line 844-846):
```
IF (lead.intelligence.goal AND pain AND urgency present)
  → shouldOfferCall = true
  → LLM instructed to offer callback
  → action = 'callback_request'
  → createCallTask invoked
```

**Source 4: AI Explicit Action** (aiConversationAgent line 1163-1164):
```
IF action === 'callback_request'
  → createCallTask invoked
```

### CallTask Creation

**Function**: `functions/createCallTask`

**Invoked By**: 
- `whatsAppInboundWebhook` (async, non-blocking)
- `aiConversationAgent` line 1245
- Manual coach action (UI)

**Task Properties**:
```
{
  leadId: string,
  leadName: string,
  leadPhone: E164,
  coach_email: string,
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'MISSED' | 'NO_ANSWER',
  priority: 'HIGH' | 'MEDIUM' | 'LOW',
  reason: string,
  dueAt: ISO timestamp (default +2 hours),
  assignedTo: 'unassigned' | 'Eden' | 'Orly'
}
```

**Guard**: 
```
IF open task already exists for lead
  → skip creation (idempotent)
```

**IMMUTABLE**: Once created, task not updated by conversation engine. Only coach can change status.

---

## SECTION F: BOOKING HANDOFF LOGIC (FROZEN)

### Booking Intent Trigger

**Who Creates TrialBooking**: Coach via UI (not automatic)

**Entities Involved**:
- `Lead` (source of phone, name)
- `TrialSlot` (available training slots)
- `TrialBooking` (booking record)
- `CallTask` (associated call task)

**Handoff Sequence**:

```
1. AI offers callback (action='callback_request')
   → CallTask created (status: OPEN)
   
2. Lead confirms interest
   → CRM shows "CALL_REQUESTED" status
   
3. Coach accepts call / schedules slot
   → Creates TrialBooking linked to TrialSlot
   → Lead status → 'BOOKED'
   → CallTask status → 'SCHEDULED' or 'COMPLETED'
   
4. Lead joins training
   → TrialBooking.status → 'COMPLETED'
```

**CRM Signals**:
- Lead.status: CALL_REQUESTED → BOOKED
- CallTask visible: "Call Due at HH:MM"
- TrialBooking visible: "Training scheduled for DATE TIME"

**NOT Automatic**: Conversation engine does not create bookings. Coach action required.

---

## SECTION G: DEFENSIVE PROTECTIONS ADDED

### Logging Safety (Never Breaks Sending)

**Rule**: All diagnostics logging wrapped in try-catch, logged to console, never returned

**Changes**:

#### 1. `whatsAppQueueWorker` (lines 437-453, 372-390)
```javascript
// BEFORE
await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({...});

// AFTER
try {
  await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({...});
} catch (logErr) {
  console.log('[whatsAppQueueWorker] DiagnosticsLog error (non-fatal):', logErr?.message);
}
```

#### 2. `sendWhatsAppMessage` (lines 64-68, 160)
```javascript
// All diagnostics wrapped in try-catch
// Logging failures never returned to client
```

#### 3. `enqueueWhatsAppMessage` (lines 90-100)
```javascript
// Diagnostics log wrapped
// Worker trigger wrapped
// Neither blocks queue creation
```

#### 4. `interpretLeadReplyWithScript` (added)
```javascript
// Activity log wrapped with explicit non-fatal logging
// Enqueue failures logged, not returned
```

#### 5. `createCallTask` (added)
```javascript
// Activity log wrapped with explicit non-fatal logging
// Lead activity invocation non-blocking
```

### Thread Write Safety (Never Blocks Delivery)

**Rule**: All LeadMessageThread writes wrapped in try-catch, non-blocking

**Locations**:
- `whatsAppInboundWebhook`: Message save wrapped, continues on error
- `aiConversationAgent`: Thread writes wrapped, reply still queued
- `salesFlowRunner`: Thread writes wrapped, flow advances
- `whatsAppQueueWorker`: Thread write optional, never blocks send

### Queue Item Isolation (Worker Continues on Single Item Failure)

**File**: `whatsAppQueueWorker` lines 474-521

**Pattern**:
```javascript
for (const msg of due) {
  try {
    // Process message
    // Update queue
    // Write thread (non-blocking)
    // Log diagnostics (non-blocking)
  } catch (msgErr) {
    // Log error
    // Mark item as failed
    // Continue to next item
    // Never throw, never exit loop
  }
}
```

**Guarantee**: One malformed queue item cannot crash worker or remaining items.

### Provider Config Validation (Before Every Send)

**File**: `whatsAppQueueWorker` lines 80-120 + `sendWhatsAppMessage` lines 98-120

**Checks**:
```javascript
// NULL-SAFE ACCESS
const config = configs[0] || null;
if (!config) return { error: 'GREENAPI_CONFIG_NOT_FOUND' };

// PLACEHOLDER DETECTION
if (!config.instance_id || config.instance_id === 'YOUR_INSTANCE_ID') {
  return { error: 'GREENAPI_CONFIG_INCOMPLETE' };
}

// API TOKEN VALIDATION
if (!config.api_token || config.api_token === 'YOUR_API_TOKEN') {
  return { error: 'GREENAPI_CONFIG_INCOMPLETE' };
}
```

### Null-Safe Data Access (All Optional Fields)

**Changes Made**:

#### `createCallTask`
```javascript
// Before
if (lead.leadTemperature === 'HOT')

// After
if (lead && lead.leadTemperature === 'HOT')

// Before
[lead.firstName, lead.lastName].filter(Boolean).join(' ')

// After
(lead && (lead.firstName || lead.lastName))
  ? [lead.firstName, lead.lastName].filter(Boolean).join(' ')
  : 'Unknown'
```

#### `interpretLeadReplyWithScript`
```javascript
// All metadata fields null-safe
fromStage: stage?.id  // optional chaining
```

### Structured Error Responses

**Rule**: Never return HTTP 500 for non-fatal operations

**Changes**:
- Worker returns HTTP 200 even on total failure
- Diagnostics failures logged, not returned
- Activity log failures logged, not returned
- All errors have `errorCode` field for client diagnosis

---

## SECTION H: SOURCE OF TRUTH ENTITIES (IMMUTABLE)

| Entity | Official Keeper | Immutable Fields | Mutable Fields |
|--------|-----------------|------------------|----------------|
| **Lead** | Business State | `id`, `coach_email`, `phoneE164` | `status`, `leadScore`, `leadTemperature`, `answers` |
| **LeadConversationState** | Flow Engine | `sessionId` | `currentStepOrder`, `flowStatus` |
| **LeadMessageThread** | Message History | `direction`, `senderType`, `messageText` | `aiProcessed`, `replyStatus` |
| **WhatsAppMessageQueue** | Delivery Pipeline | `rendered_text`, `context_id` | `status`, `attempts`, `error_message` |
| **AIConversationLog** | AI Decisions | `leadId`, `brain_config_id` | `ai_status`, `last_ai_reply` |
| **CallTask** | Sales Actions | `leadId` | `status`, `priority`, `dueAt` |
| **TrialBooking** | Booking State | `leadId`, `slotId` | `status`, `bookedAt` |
| **SalesConversationFlow** | Flow Definition | `id`, `name` | `is_active` |
| **SalesConversationStep** | Step Definition | `stepOrder`, `messageText` | (none, read-only) |

**Guarantee**: Each state kept in exactly one entity. No duplication.

---

## VALIDATION CHECKLIST

✅ **First Message Authority**: ONLY `onLeadCreated` can queue step 1  
✅ **Delivery Pipeline**: ONLY worker sends to Green API  
✅ **Inbound Entry**: ONLY webhook can receive inbound messages  
✅ **Reply Authority**: Single lock mechanism prevents duplicate replies  
✅ **Queue States**: Immutable progression (queued → sending → sent/failed)  
✅ **Sales Call Triggers**: Four explicit triggers, all create CallTask  
✅ **Booking Handoff**: Coach-driven, not automatic  
✅ **Logging Safety**: All diagnostics wrapped, never break pipeline  
✅ **Thread Safety**: All writes wrapped, never block delivery  
✅ **Worker Resilience**: One item failure cannot crash worker  
✅ **Provider Validation**: Credentials checked before every send  
✅ **Null Safety**: All optional fields null-safe  
✅ **Error Structures**: Structured responses, no generic 500  

---

## LOCKED COMMITMENT

This architecture is FROZEN as of 2026-03-14.

**Permitted Changes**: Defensive protections only (logging, validation, error handling)  
**Forbidden Changes**: Any behavioral modification without explicit approval  
**Approval Required**: Any change to core logic (onLeadCreated, worker, webhook, AI, flow)  

**Status**: 🔒 LOCKED