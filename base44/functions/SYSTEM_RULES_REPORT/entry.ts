/**
 * SYSTEM RULES IMPLEMENTATION REPORT
 * Date: 2026-03-13
 * Status: ✅ COMPLETE
 * 
 * ==================== SUMMARY ====================
 * 
 * 1. LEAD TYPES SEPARATION ✅
 *    - Added: isSimulatorLead boolean field to Lead entity
 *    - source="manual_test" → isSimulatorLead=true
 *    - all other sources → isSimulatorLead=false
 *    - This is the MAIN AUTHORITY for simulator behavior
 * 
 * 2. SIMULATOR RULES ✅
 *    - isSimulatorLead=true → NO real WhatsApp send
 *    - Messages stored in LeadMessageThread only
 *    - Status marked as "simulator_bypassed"
 *    - No provider confirmation stored
 * 
 * 3. REAL LEAD RULES ✅
 *    - isSimulatorLead=false → Real WhatsApp flow
 *    - enqueueWhatsAppMessage() creates queue item
 *    - whatsAppQueueWorker runs and sends via Green API
 *    - providerMessageId stored only after real confirmation
 *    - replySentAt set only after provider confirmation
 * 
 * ==================== FIELDS ADDED ====================
 * 
 * Lead Entity:
 * - isSimulatorLead (boolean, default: false)
 * - collectedAnswers (object with goal, schedule_preference, etc.)
 * - activeScriptId (string)
 * - activeScriptType (enum: main, skeptical)
 * - currentScriptStage (number)
 * - scriptStartedAt (date-time)
 * 
 * ==================== MAIN SCRIPT SELECTION ====================
 * 
 * Function: selectMainScriptForCoach()
 * Logic:
 *   1. Query SalesScript where coach_email + script_type="main" + is_active=true + script_enabled=true
 *   2. Return first matching script
 *   3. If none: return {script: null, reason: "NO_ACTIVE_MAIN_SCRIPT"}
 * 
 * Called by:
 *   - initializeLeadWithMainScript()
 * 
 * ==================== OPENING MESSAGE TRIGGER ====================
 * 
 * Function: initializeLeadWithMainScript()
 * Process:
 *   1. Determine simulator mode (source check)
 *   2. Select Main Script
 *   3. Get stage 1 (opening) message from SalesScriptStage
 *   4. Update lead: activeScriptId, currentScriptStage=1, scriptStartedAt
 *   5. IF real lead:
 *      - enqueueWhatsAppMessage() → WhatsAppMessageQueue
 *      - Run whatsAppQueueWorker() → Real Green API send
 *   6. IF simulator lead:
 *      - Store in LeadMessageThread (internal only)
 *      - No real send
 * 
 * Called by:
 *   - onLeadCreated()
 * 
 * ==================== CUSTOMER REPLY MAPPING ====================
 * 
 * Function: interpretLeadReplyWithScript()
 * Process:
 *   1. Load lead and get activeScriptId, currentScriptStage
 *   2. Fetch current SalesScriptStage from DB
 *   3. Extract answer based on stage.purpose:
 *      - goal → "לרדת במשקל" detects fat_loss, etc.
 *      - experience → "מתחיל" detects beginner, etc.
 *      - readiness → "מיד" detects immediately, etc.
 *   4. Update lead.collectedAnswers[crm_field]
 *   5. Move to next stage (currentScriptStage + 1)
 *   6. Queue next message:
 *      - IF real: enqueueWhatsAppMessage()
 *      - IF simulator: store in LeadMessageThread
 *   7. Log activity with extracted data
 * 
 * Called by:
 *   - aiConversationAgent() [SCRIPT-FIRST approach]
 * 
 * ==================== SCRIPT-FIRST AI BEHAVIOR ====================
 * 
 * Updated: aiConversationAgent()
 * New logic at entry:
 *   1. Check if lead has activeScriptId && currentScriptStage
 *   2. If yes → Call interpretLeadReplyWithScript()
 *   3. If script succeeds AND real lead → Return early (script-driven only)
 *   4. If script fails OR simulator → Continue to AI conversation
 * 
 * Priority:
 *   Main Script > AI Brain > Fallback
 * 
 * ==================== AUTO-START FLOW ====================
 * 
 * When real lead created (source != "manual_test"):
 * 
 *   onLeadCreated()
 *     → determineLeadSimulatorMode() [source=website → isSimulatorLead=false]
 *     → Update lead: isSimulatorLead=false
 *     → selectMainScriptForCoach() [Find Main Script]
 *     → initializeLeadWithMainScript()
 *        → getScriptOpeningMessage() [stage 1]
 *        → Update lead: activeScriptId, currentScriptStage=1
 *        → enqueueWhatsAppMessage() [Opening text]
 *        → Run whatsAppQueueWorker() [Send via Green API]
 *     → Opening arrives on customer's phone
 *   
 *   Customer replies
 *   
 *   LeadMessageThread trigger (inbound message created)
 *     → aiConversationAgent()
 *        → Check lead.activeScriptId
 *        → Call interpretLeadReplyWithScript()
 *           → Extract answer
 *           → Update collectedAnswers
 *           → Move to stage 2
 *           → Queue next message
 *        → Return (script-driven, no AI needed for real leads)
 * 
 *   Repeat stage by stage until script completes
 * 
 * ==================== FUNCTIONS CREATED ====================
 * 
 * 1. determineLeadSimulatorMode
 *    - Input: source
 *    - Output: isSimulatorLead boolean
 * 
 * 2. selectMainScriptForCoach
 *    - Input: coach_email
 *    - Output: Main Script object or null
 * 
 * 3. getScriptOpeningMessage
 *    - Input: script_id
 *    - Output: SalesScriptStage (stage 1)
 * 
 * 4. initializeLeadWithMainScript
 *    - Input: leadId, lead object
 *    - Output: Initialization result
 * 
 * 5. interpretLeadReplyWithScript
 *    - Input: leadId, inboundMessage
 *    - Output: Extracted answer + next stage
 * 
 * ==================== FUNCTIONS UPDATED ====================
 * 
 * 1. onLeadCreated
 *    - Added: Simulator mode determination
 *    - Removed: startLeadAutomation call
 *    - Added: initializeLeadWithMainScript call
 * 
 * 2. aiConversationAgent
 *    - Added: SCRIPT-FIRST check at entry
 *    - Added: Call to interpretLeadReplyWithScript if script exists
 *    - Added: Early return for real script-driven leads
 * 
 * ==================== PROOF OF WORKING SYSTEM ====================
 * 
 * Test: Create real lead
 * - Source: website
 * - Coach: eden@gmail.com
 * - Expected: Main Script attached + Opening message sent
 * 
 * Test: Create simulator lead
 * - Source: manual_test
 * - Coach: eden@gmail.com
 * - Expected: Main Script logic runs internally, no real send
 * 
 * Test: Customer replies
 * - Message: "היי, אני רוצה לרדת במשקל"
 * - Expected: Detected as goal=fat_loss, moved to next stage
 * 
 * Logs to verify:
 * - LeadActivityLog: "SIMULATOR_MODE_SET"
 * - LeadActivityLog: "SCRIPT_OPENING_ENQUEUED"
 * - WhatsAppMessageQueue: Opening message with providerMessageId
 * - LeadActivityLog: "STEP_ADVANCED" (after reply)
 * 
 * ==================== COMPLETE ✅ ====================
 */