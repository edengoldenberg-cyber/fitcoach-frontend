# Simulator Authentication Architecture

## The Problem

The simulator needs to execute the **exact same pipeline** as production leads, but faces architectural constraints:

### Base44 Platform Constraints

1. **Entity automations don't fire for backend-created leads**
   - Safety feature to prevent infinite loops
   - Applies even when using user-context creates within backend functions

2. **Service-role function invocation doesn't preserve auth context**
   - `base44.asServiceRole.functions.invoke()` results in 403 errors
   - No way to manually trigger entity automation with proper auth

3. **Cannot import/call other function modules directly**
   - Deno Deploy isolation prevents relative imports
   - Each function runs in separate isolate

### Why Production and Simulator Differ

**PRODUCTION LEAD (from webhook/UI):**
```
User creates Lead via UI/webhook
→ Lead.create (user context)
→ onLeadCreated automation FIRES AUTOMATICALLY ✓
→ flow initialization
→ queue creation
→ worker processing
→ provider send (real API)
```

**SIMULATOR LEAD (from createSimulatorLead):**
```
Admin calls createSimulatorLead backend function
→ Lead.create (service-role context)
→ onLeadCreated automation DOES NOT FIRE ✗
→ createSimulatorLead DUPLICATES flow logic inline
→ queue creation
→ worker processing
→ provider send (simulated)
```

## The Solution: Controlled Duplication

Since Base44 platform constraints prevent true automation triggering from backend functions, we **intentionally duplicate** the initialization logic in both places:

### 1. `onLeadCreated` (entity automation)
- Runs automatically for production leads (created via UI/webhook)
- Lines 183-339: Flow initialization logic

### 2. `createSimulatorLead` (backend function)
- Runs manually for simulator leads (created via admin function)
- Lines 159-260: **IDENTICAL** flow initialization logic

### Critical Requirements

**Both functions MUST maintain identical logic for:**
- Flow selection (`SalesConversationFlow` query)
- Step retrieval and sorting
- Session ID generation (`sess_${timestamp}_${random}`)
- State record creation (`LeadConversationState`)
- Message rendering (template variable replacement)
- Queue item creation (`WhatsAppMessageQueue`)
- Activity logging (`LeadActivityLog`)

**The ONLY differences:**
- `createSimulatorLead`: Sets `provider_type: 'simulator'` and `isSimulatorLead: true`
- `onLeadCreated`: Sets `provider_type: 'greenapi'` and determines simulator mode from `lead.source`

### Why This Is The Correct Architecture

1. **Functionality Equivalence**: Both paths execute identical business logic
2. **Testing Parity**: Simulator validates the same code path that production uses
3. **Maintainability**: Changes to flow logic must be applied to both functions (documented below)
4. **Platform Compliance**: Works within Base44's architectural constraints

## Maintenance Protocol

**When modifying lead initialization logic:**

1. ✅ Update BOTH `onLeadCreated` AND `createSimulatorLead`
2. ✅ Keep logic synchronized line-by-line
3. ✅ Test both production and simulator paths
4. ✅ Document any intentional differences

**Common modification points:**
- Flow selection criteria
- Step ordering/filtering
- Message template rendering
- Queue item configuration
- Activity log structure

## Testing Verification

To verify simulator matches production:

```javascript
// Create simulator lead
const simResult = await base44.functions.invoke('createSimulatorLead', {
  name: "Test Lead",
  phone: "0509998888",
  source: "manual_test"
});

// Check queue, state, and activity logs match production structure
const queue = await base44.entities.WhatsAppMessageQueue.filter({ context_id: simResult.leadId });
const state = await base44.entities.LeadConversationState.filter({ leadId: simResult.leadId });
const logs = await base44.entities.LeadActivityLog.filter({ leadId: simResult.leadId });

// Verify:
// - queue[0].status === 'queued'
// - queue[0].provider_type === 'simulator'
// - state[0].flowStatus === 'ACTIVE'
// - logs contain STEP_SENT activity
```

## Why Alternative Solutions Don't Work

### ❌ HTTP invocation with service-role key
- Requires `BASE44_SERVICE_ROLE_KEY` secret (not available in dev)
- Would work in production but breaks local testing

### ❌ Dynamic module import
- `import('./onLeadCreated.js')` fails with "No such file"
- Deno Deploy isolates functions independently

### ❌ User-context Lead creation
- Entity automations still don't fire from backend functions
- Base44 safety feature prevents this

### ❌ Shared utility module
- Cannot create shared code between isolated functions
- Would require Base44 platform changes

## Summary

The simulator uses **intentional, documented code duplication** to achieve functional equivalence with production while respecting Base44's architectural constraints. This is **the only viable solution** given platform limitations, and is maintainable through clear documentation and testing protocols.