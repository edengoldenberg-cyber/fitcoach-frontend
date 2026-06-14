import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// PART 9: 24H / 48H / Final followup automation
// Sends timed follow-ups after no response

// DISABLED (launch blocker fix — 2024 sales system audit):
// This function is a legacy parallel system superseded by salesFlowRunner,
// leadFollowupScheduler, and nudgeScheduler. Disabled because:
//   1. Lead.list() loads ALL coaches' leads with no coach_email scoping (multi-tenant data exposure)
//   2. No GLOBAL_WHATSAPP_ENABLED kill switch check
//   3. No waOptOut check — continued sending to opted-out leads
//   4. Hardcoded Hebrew message strings not connected to any template system
//   5. The modern flow system never populates lead.last_followup_at (its sole trigger field),
//      so the function would have scanned all leads and sent to zero real targets anyway
// To re-enable: resolve all five issues above and coordinate with modern flow system.
Deno.serve(async (_req) => {
  console.log('[sendTimedFollowups] DISABLED — legacy system, returning immediately');
  return Response.json({
    ok: true,
    disabled: true,
    reason: 'superseded_by_modern_flow_system',
    sent: 0,
    checked: 0
  });
});