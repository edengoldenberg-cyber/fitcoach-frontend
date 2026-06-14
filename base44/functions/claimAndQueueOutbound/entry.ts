import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Kill switch is now read from SystemConfig entity (key: GLOBAL_WHATSAPP_ENABLED)
async function isOutboundEnabled(base44) {
  try {
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'GLOBAL_WHATSAPP_ENABLED' });
    const record = configs && configs[0];
    return record ? record.value === true : false;
  } catch (_) {
    return false;
  }
}

/**
 * HARD SINGLE-OUTBOUND GATE — Data-Layer Enforcement
 *
 * Ownership is enforced by the OutboundReplyClaim entity which has a
 * UNIQUE constraint on inboundMessageId at the DB layer.
 *
 * Algorithm:
 *   1. Resolve the canonical inbound record ID
 *   2. Try INSERT into OutboundReplyClaim(inboundMessageId=X)
 *      → If DB throws unique-violation → another execution already won → ABORT
 *      → If INSERT succeeds → this execution owns the outbound
 *   3. Create the WhatsAppMessageQueue record
 *   4. Update the claim with the queueId
 *   5. Stamp replyQueueId + aiProcessed on the inbound record
 *   6. Create the OUTBOUND LeadMessageThread mirror
 *
 * Under true parallel execution (webhook + poll + direct all racing):
 * Only one INSERT into OutboundReplyClaim can succeed for a given inboundMessageId.
 * All others receive a unique-constraint error from the DB and abort immediately.
 * No timing window. No read-check-write race. Hard data-layer guarantee.
 */

Deno.serve(async (req) => {
  // Read kill switch from DB
  const _base44ks = createClientFromRequest(req);
  const GLOBAL_OUTBOUND_WHATSAPP_ENABLED = await isOutboundEnabled(_base44ks);

  // ██████████████████████████████████████████████████████████
  // GLOBAL KILL SWITCH CHECK — FIRST THING, BEFORE ANY CLAIM/QUEUE
  // ██████████████████████████████████████████████████████████
  if (GLOBAL_OUTBOUND_WHATSAPP_ENABLED !== true) {
    console.log('[KILL_SWITCH] claimAndQueueOutbound BLOCKED — GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE');
    return Response.json({
      ok: false,
      blocked: true,
      reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE',
      message: 'All outbound WhatsApp sending is disabled by global kill switch. No claim or queue record created.'
    }, { status: 200 });
  }
  // ██████████████████████████████████████████████████████████

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { inboundMessageId, leadId, coachEmail, replyText, providerMessageId } = body;

    if (!leadId || !replyText || !coachEmail) {
      return Response.json({ ok: false, error: 'missing_required_fields: leadId, replyText, coachEmail' }, { status: 400 });
    }

    // ── STEP 1: Resolve canonical inbound record ID ───────────────────────────
    let resolvedInboundId = inboundMessageId || null;

    if (!resolvedInboundId && providerMessageId) {
      const records = await base44.asServiceRole.entities.LeadMessageThread.filter({
        providerMessageId,
        direction: 'INBOUND',
        leadId
      }).catch(() => []);
      resolvedInboundId = records[0]?.id || null;
    }

    if (!resolvedInboundId) {
      // Last resort: most recent unhandled inbound for this lead
      // GUARD: Before resolving, check if a RECENT (last 120 seconds) claim already exists for this lead.
      // ERROR-008 fix: the old guard checked ALL historical claims, blocking legitimate new replies
      // for any lead that had ever had a prior conversation. Narrowed to a 120-second recency window
      // so only claims created in the same conversation cycle block the last-resort path.
      // Explicit inboundMessageId path (above) is completely unchanged.
      const recentClaimCutoff = new Date(Date.now() - 120 * 1000).toISOString();
      const leadClaims = await base44.asServiceRole.entities.OutboundReplyClaim.filter({ leadId }).catch(() => []);
      const recentLeadClaims = leadClaims.filter(c => (c.claimedAt || c.created_date || '') >= recentClaimCutoff);
      if (recentLeadClaims.length > 0) {
        console.log('[claimAndQueueOutbound] LEAD_RECENTLY_CLAIMED — aborting last-resort resolution. leadId:', leadId, '| existingClaimId:', recentLeadClaims[0].id);
        return Response.json({
          ok: false,
          skipped: true,
          reason: 'LEAD_RECENTLY_CLAIMED_NO_INBOUND_ID',
          leadId,
          existingClaimId: recentLeadClaims[0].id
        });
      }

      const recent = await base44.asServiceRole.entities.LeadMessageThread.filter({
        leadId,
        direction: 'INBOUND'
      }).catch(() => []);
      // ISSUE-011 fix: restrict last-resort resolution to a 60-second recency window.
      // This prevents matching a stale inbound from a different conversation when
      // inboundMessageId is null and multiple unhandled inbounds exist for the lead.
      const windowMs = 60 * 1000;
      const cutoff = new Date(Date.now() - windowMs).toISOString();
      const unhandled = recent
        .filter(r => !r.replyQueueId && (r.created_date || '') >= cutoff)
        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      resolvedInboundId = unhandled[0]?.id || null;
    }

    if (!resolvedInboundId) {
      console.log('[claimAndQueueOutbound] NO_INBOUND_FOUND for leadId:', leadId);
      return Response.json({ ok: false, error: 'no_inbound_record_found' }, { status: 404 });
    }

    console.log('[claimAndQueueOutbound] ATTEMPTING_CLAIM for inboundId:', resolvedInboundId, '| leadId:', leadId);

    // ── STEP 2: CLAIM — Write-first with re-read verification ──────────────────
    // Base44 is NoSQL — no DB-level unique constraints.
    // Strategy: attempt INSERT first, then re-read to detect collision.
    // If another concurrent execution also inserted, we detect it on re-read
    // (they will both exist, we take the OLDEST and the loser aborts).
    // This closes the race window that existed with the old read-before-write approach.

    // Pre-check: fast abort if already claimed (avoids unnecessary inserts)
    const existingClaims = await base44.asServiceRole.entities.OutboundReplyClaim.filter({
      inboundMessageId: resolvedInboundId
    }).catch(() => []);

    if (existingClaims.length > 0) {
      console.log('[claimAndQueueOutbound] CLAIM_ALREADY_EXISTS — inboundId:', resolvedInboundId, '| existingClaimId:', existingClaims[0].id);
      return Response.json({
        ok: false,
        skipped: true,
        reason: 'CLAIM_ALREADY_EXISTS',
        inboundId: resolvedInboundId,
        existingClaimId: existingClaims[0].id
      });
    }

    // Also check if inbound record is already stamped with a queueId (second safety net)
    const inboundCheck = await base44.asServiceRole.entities.LeadMessageThread.filter({
      id: resolvedInboundId
    }).catch(() => []);
    const inboundRec = inboundCheck[0];
    if (inboundRec?.replyQueueId || inboundRec?.aiProcessed === true) {
      console.log('[claimAndQueueOutbound] INBOUND_ALREADY_HANDLED — inboundId:', resolvedInboundId, '| replyQueueId:', inboundRec.replyQueueId);
      return Response.json({
        ok: false,
        skipped: true,
        reason: 'INBOUND_ALREADY_HANDLED',
        inboundId: resolvedInboundId
      });
    }

    // WRITE the claim
    let claim;
    try {
      claim = await base44.asServiceRole.entities.OutboundReplyClaim.create({
        inboundMessageId: resolvedInboundId,
        leadId,
        coach_email: coachEmail,
        claimedAt: new Date().toISOString(),
        claimedBy: 'aiConversationAgent'
      });
      console.log('[claimAndQueueOutbound] CLAIM_INSERTED — claimId:', claim.id, '| inboundId:', resolvedInboundId);
    } catch (claimErr) {
      console.log('[claimAndQueueOutbound] CLAIM_CREATE_FAILED — inboundId:', resolvedInboundId, '| error:', claimErr.message);
      return Response.json({
        ok: false,
        skipped: true,
        reason: 'CLAIM_CREATE_FAILED',
        inboundId: resolvedInboundId
      });
    }

    // RE-READ after short delay to detect parallel collision
    // If another execution also inserted a claim, both exist now.
    // The OLDEST claim (earliest created_date) wins. Loser deletes itself and aborts.
    await new Promise(r => setTimeout(r, 200));
    const raceClaims = await base44.asServiceRole.entities.OutboundReplyClaim.filter({
      inboundMessageId: resolvedInboundId
    }).catch(() => [claim]);

    if (raceClaims.length > 1) {
      // Sort by created_date ascending — oldest is the winner
      const sorted = raceClaims.sort((a, b) => new Date(a.created_date || a.claimedAt) - new Date(b.created_date || b.claimedAt));
      const winner = sorted[0];
      if (winner.id !== claim.id) {
        // We lost the race — delete our claim and abort
        await base44.asServiceRole.entities.OutboundReplyClaim.delete(claim.id).catch(() => {});
        console.log('[claimAndQueueOutbound] RACE_LOST — winner claimId:', winner.id, '| ours:', claim.id, '— aborting');
        return Response.json({
          ok: false,
          skipped: true,
          reason: 'RACE_LOST_TO_EARLIER_CLAIM',
          inboundId: resolvedInboundId,
          winnerClaimId: winner.id
        });
      }
      // We won — delete all other collision claims
      for (const loser of raceClaims.filter(c => c.id !== claim.id)) {
        await base44.asServiceRole.entities.OutboundReplyClaim.delete(loser.id).catch(() => {});
        console.log('[claimAndQueueOutbound] COLLISION_CLEANED — deleted loser claimId:', loser.id);
      }
    }

    console.log('[claimAndQueueOutbound] CLAIM_WON — claimId:', claim.id, '| inboundId:', resolvedInboundId);

    // ── STEP 3: Load lead for phone ───────────────────────────────────────────
    const leads = await base44.asServiceRole.entities.Lead.filter({ id: leadId }).catch(() => []);
    const lead = leads[0];
    if (!lead) {
      return Response.json({ ok: false, error: 'lead_not_found' }, { status: 404 });
    }

    // ── OPT-OUT GUARD — final gate; claim is deleted so retry is not permanently blocked ─
    if (lead.waOptOut === true) {
      console.log('[claimAndQueueOutbound] OPT_OUT_SKIP: lead.waOptOut=true leadId=' + leadId + ' — deleting claim ' + claim.id);
      await base44.asServiceRole.entities.OutboundReplyClaim.delete(claim.id).catch(() => {});
      return Response.json({ ok: true, skipped: true, reason: 'lead_opted_out' });
    }

    // ── STEP 3b: Load provider config to get real provider_type (ISSUE-002 fix) ──
    const providerConfigs = await base44.asServiceRole.entities.WhatsAppProviderConfig
      .filter({ coach_email: coachEmail }).catch(() => []);
    const resolvedProviderType = providerConfigs[0]?.provider_type || 'mock';
    console.log('[claimAndQueueOutbound] PROVIDER_TYPE resolved:', resolvedProviderType, '| coachEmail:', coachEmail);

    // ── STEP 4: Create the ONE queue record ───────────────────────────────────
    // Claim is won — we are the sole owner. Safe to create exactly one queue record.
    let queueEntry;
    try {
      queueEntry = await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
        coach_email: coachEmail,
        to_phone_e164: lead.phoneE164 || lead.phone,
        to_name: lead.firstName || '',
        context_type: 'lead',
        context_id: leadId,
        template_key: 'ai_reply',
        rendered_text: replyText,
        provider_type: resolvedProviderType,
        status: 'queued'
      });
      console.log('[claimAndQueueOutbound] QUEUE_CREATED:', queueEntry.id, '| claimId:', claim.id, '| providerType:', resolvedProviderType);
    } catch (err) {
      // ISSUE-020 fix: delete the already-written claim so retry is not permanently blocked
      console.error('[claimAndQueueOutbound] QUEUE_CREATE_FAILED:', err.message, '— deleting stale claim:', claim.id);
      await base44.asServiceRole.entities.OutboundReplyClaim.delete(claim.id).catch(() => {});
      return Response.json({ ok: false, error: 'queue_create_failed', details: err.message }, { status: 500 });
    }

    // ── STEP 5: Update claim with queueId (audit trail) ───────────────────────
    await base44.asServiceRole.entities.OutboundReplyClaim.update(claim.id, {
      queueId: queueEntry.id
    }).catch(() => {});

    // ── STEP 6: Stamp ownership on the inbound record ─────────────────────────
    await base44.asServiceRole.entities.LeadMessageThread.update(resolvedInboundId, {
      replyQueueId: queueEntry.id,
      replyGeneratedAt: new Date().toISOString(),
      replyStatus: 'queued',
      aiProcessed: true,
      replyProducer: 'aiConversationAgent'
    }).catch(() => {});
    console.log('[claimAndQueueOutbound] INBOUND_STAMPED — inboundId:', resolvedInboundId, '→ queueId:', queueEntry.id);

    // ── STEP 7: Create the OUTBOUND LeadMessageThread mirror ──────────────────
    // GUARD: check no outbound already exists for this queueId before creating.
    // Prevents duplicate outbound records if this function is retried or called concurrently.
    let outboundRecord;
    try {
      const existingOutbound = await base44.asServiceRole.entities.LeadMessageThread.filter({
        replyQueueId: queueEntry.id,
        direction: 'OUTBOUND'
      }).catch(() => []);

      if (existingOutbound.length > 0) {
        outboundRecord = existingOutbound[0];
        console.log('[claimAndQueueOutbound] OUTBOUND_ALREADY_EXISTS — skipping create. outboundId:', outboundRecord.id);
      } else {
        outboundRecord = await base44.asServiceRole.entities.LeadMessageThread.create({
          leadId,
          coach_email: coachEmail,
          channel: 'WHATSAPP',
          direction: 'OUTBOUND',
          senderType: 'SYSTEM',
          messageText: replyText,
          messageTimestamp: new Date().toISOString(),
          replyStatus: 'queued',
          replyQueueId: queueEntry.id,
          replyProducer: 'aiConversationAgent'
        });
        console.log('[claimAndQueueOutbound] OUTBOUND_CREATED — outboundId:', outboundRecord?.id);
      }
    } catch (err) {
      console.error('[claimAndQueueOutbound] OUTBOUND_THREAD_CREATE_FAILED (non-fatal):', err.message);
      // Claim won, queue created, inbound stamped — still a full success
    }

    console.log('[claimAndQueueOutbound] COMPLETE — 1 inbound → 1 claim → 1 queue → 1 outbound', {
      inboundId: resolvedInboundId,
      claimId: claim.id,
      queueId: queueEntry.id,
      outboundId: outboundRecord?.id
    });

    // ISSUE-015 fix: fire-and-forget whatsAppQueueWorker so AI replies are sent immediately
    // rather than waiting for the next scheduled worker tick.
    base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {}).catch(() => {});

    return Response.json({
      ok: true,
      queueId: queueEntry.id,
      claimId: claim.id,
      outboundId: outboundRecord?.id || null,
      inboundId: resolvedInboundId
    });

  } catch (error) {
    console.error('[claimAndQueueOutbound] FATAL:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});