import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function ago(hours) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function israelToday() {
  return new Date(Date.now() + 3 * 3600_000).toISOString().split('T')[0];
}

function daysBefore(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await base44.auth.me().catch(() => null);
    const coachEmail = body?.coachEmail || user?.email || null;

    const cutoff24h = ago(24);
    const today = israelToday();
    const day7 = daysBefore(7);
    const day30 = daysBefore(30);
    const day0 = daysBefore(0); // today midnight

    // ── All queries in parallel ──────────────────────────────────────────
    const [
      allSystemConfig,
      providerConfigs,
      queueRecent,
      diagRecent,
      eventRecent,
      leads,
      trainees,
      trialBookings,
    ] = await Promise.all([
      // List all SystemConfig to extract multiple keys in one call
      base44.asServiceRole.entities.SystemConfig
        .list().catch(() => []),

      coachEmail
        ? base44.asServiceRole.entities.WhatsAppProviderConfig
            .filter({ coach_email: coachEmail }).catch(() => [])
        : base44.asServiceRole.entities.WhatsAppProviderConfig
            .list().catch(() => []),

      // Last 500 queue records — covers ~24h for any real gym
      base44.asServiceRole.entities.WhatsAppMessageQueue
        .list('-created_date', 500).catch(() => []),

      // Last 400 diagnostic events
      base44.asServiceRole.entities.WhatsAppDiagnosticsLog
        .list('-created_date', 400).catch(() => []),

      // Last 500 event log entries (message_sent + skipped)
      base44.asServiceRole.entities.WhatsAppEventLog
        .list('-timestamp', 500).catch(() => []),

      coachEmail
        ? base44.asServiceRole.entities.Lead
            .filter({ coach_email: coachEmail }).catch(() => [])
        : base44.asServiceRole.entities.Lead
            .list('-created_date', 1000).catch(() => []),

      coachEmail
        ? base44.asServiceRole.entities.Trainee
            .filter({ coach_email: coachEmail }).catch(() => [])
        : base44.asServiceRole.entities.Trainee
            .filter({ status: 'active' }).catch(() => []),

      // TrialBookings — needed for Trial→Membership conversion
      coachEmail
        ? base44.asServiceRole.entities.TrialBooking
            .filter({ coach_email: coachEmail }).catch(() => [])
        : base44.asServiceRole.entities.TrialBooking
            .list('-created_date', 500).catch(() => []),
    ]);

    // ── SystemConfig values ──────────────────────────────────────────────
    const cfgMap = Object.fromEntries(allSystemConfig.map(c => [c.key, c.value]));
    const whatsappEnabled = cfgMap['GLOBAL_WHATSAPP_ENABLED'] === true;
    // Pricing config — set via SystemConfig entity (key/value store)
    const membershipPrice     = cfgMap['MEMBERSHIP_MONTHLY_PRICE']     != null ? Number(cfgMap['MEMBERSHIP_MONTHLY_PRICE'])     : null;
    const whatsappMonthlyCost = cfgMap['WHATSAPP_MONTHLY_COST']        != null ? Number(cfgMap['WHATSAPP_MONTHLY_COST'])        : null;
    const totalMarketingSpend = cfgMap['TOTAL_MONTHLY_MARKETING_SPEND']!= null ? Number(cfgMap['TOTAL_MONTHLY_MARKETING_SPEND']): null;
    const providerConnected = providerConfigs.some(
      p => p.is_enabled && p.status === 'connected'
    );

    // ── Queue metrics ────────────────────────────────────────────────────
    const queue24h = queueRecent.filter(q => (q.created_date || '') >= cutoff24h);
    const queueFailed24h = queue24h.filter(q => q.status === 'failed');
    const queueSent24h = queue24h.filter(
      q => q.status === 'sent' || q.status === 'provider_unconfirmed'
    ).length;
    const nowMs = Date.now();
    const queueStale = queueRecent.filter(
      q => q.status === 'queued' &&
           q.created_date &&
           nowMs - new Date(q.created_date).getTime() > 15 * 60_000
    );
    const queueTotal24h = queue24h.length;
    const queueFailRate = queueTotal24h > 0
      ? Math.round((queueFailed24h.length / queueTotal24h) * 100) : 0;

    // Detailed failed items (last 10) for the failure table
    const failedItemsSample = queueFailed24h.slice(0, 10).map(q => ({
      id: q.id,
      phone: q.to_phone_e164,
      name: q.to_name,
      template: q.template_key,
      coach: q.coach_email,
      age: Math.round((nowMs - new Date(q.created_date).getTime()) / 60_000) + 'm ago',
    }));

    const staleItemsSample = queueStale.slice(0, 10).map(q => ({
      id: q.id,
      phone: q.to_phone_e164,
      template: q.template_key,
      ageMin: Math.round((nowMs - new Date(q.created_date).getTime()) / 60_000),
    }));

    // ── Diagnostic log metrics (24h) ────────────────────────────────────
    const diags24h = diagRecent.filter(d => (d.created_date || '') >= cutoff24h);
    const leadNotFound24h = diags24h.filter(d => d.event === 'LEAD_NOT_FOUND').length;
    const flowNoClaim24h = diags24h.filter(d =>
      d.event === 'RULE_TRIGGERED' &&
      (String(d.payload?.rule || '')).includes('FLOW_NO_ENGINE_CLAIMED')
    ).length;
    const multiCollision24h = diags24h.filter(
      d => d.event === 'MULTI_LEAD_PHONE_COLLISION'
    ).length;
    const traineeWins24h = diags24h.filter(
      d => d.event === 'LEAD_TRAINEE_COLLISION_TRAINEE_WINS'
    ).length;
    const totalInbound24h = diags24h.filter(d => d.event === 'INBOUND_RAW').length;
    const leadNotFoundRate = totalInbound24h > 0
      ? Math.round((leadNotFound24h / totalInbound24h) * 100) : 0;

    // Routing distribution (24h)
    const routingAI   = diags24h.filter(d => d.event === 'ROUTING_BRAIN_AI_PRIORITY').length;
    const routingFlow = diags24h.filter(d => d.event === 'ROUTING_BRAIN_FLOW_PRIORITY').length;
    const routingLeg  = diags24h.filter(d => d.event === 'ROUTING_BRAIN_FLOW_LEGACY').length;

    // ── EventLog metrics (today) ─────────────────────────────────────────
    const todayEvents = eventRecent.filter(e => (e.timestamp || '').startsWith(today));
    const sentToday = todayEvents.filter(e => e.event_type === 'message_sent').length;
    const skippedToday = todayEvents.filter(e => e.event_type === 'reminder_skipped').length;

    // Daily cap violations: trainees with >2 message_sent today
    const sentCountByTrainee = {};
    for (const e of todayEvents.filter(ev => ev.event_type === 'message_sent')) {
      const k = e.trainee_email || 'unknown';
      sentCountByTrainee[k] = (sentCountByTrainee[k] || 0) + 1;
    }
    const capViolationsToday = Object.values(sentCountByTrainee).filter(c => c > 2).length;

    // Scheduler coverage: distinct trigger_types seen today
    const schedulersSeen = [...new Set(
      todayEvents.filter(e => e.event_type === 'message_sent' && e.trigger_type)
                 .map(e => e.trigger_type)
    )];

    // ── Lead funnel ──────────────────────────────────────────────────────
    const newLeadsToday = leads.filter(l => (l.created_date || '') >= day0).length;
    const newLeadsWeek  = leads.filter(l => (l.created_date || '') >= day7).length;
    const newLeadsMonth = leads.filter(l => (l.created_date || '') >= day30).length;
    const bookedLeads   = leads.filter(l => l.status === 'BOOKED').length;
    const activeLeads   = leads.filter(
      l => !['BOOKED', 'CLOSED', 'NO_RESPONSE'].includes(l.status)
    ).length;
    const optOutsToday  = leads.filter(
      l => l.waOptOut && (l.updated_date || '') >= day0
    ).length;
    const trialConversionRate = newLeadsMonth > 0
      ? Math.round((bookedLeads / newLeadsMonth) * 100) : 0;

    // Lead status distribution
    const statusCounts = {};
    for (const l of leads) {
      statusCounts[l.status || 'UNKNOWN'] = (statusCounts[l.status || 'UNKNOWN'] || 0) + 1;
    }

    // ── Trainee metrics ──────────────────────────────────────────────────
    const activeTrainees   = trainees.filter(t => t.status === 'active').length;
    const newTraineesMonth = trainees.filter(t => (t.created_date || '') >= day30).length;
    const membershipConversionRate = newLeadsMonth > 0
      ? Math.round((newTraineesMonth / newLeadsMonth) * 100) : 0;

    // ── Business KPIs ────────────────────────────────────────────────────
    //
    // GROUP 1 — Volume (raw counts, 30-day window)
    //   Leads:       Lead[created_date >= day30].length         = newLeadsMonth
    //   Trials:      TrialBooking[created_date >= day30].length
    //   Members:     Trainee[created_date >= day30].length      = newTraineesMonth
    //
    // GROUP 2 — Conversion rates (same-period approximation; timing lag is
    //   acceptable for a real-time monthly dashboard)
    //   Lead → Trial:   trialBookingsMonth / newLeadsMonth
    //   Trial → Member: newTraineesMonth   / trialBookingsMonth
    //   Lead → Member:  newTraineesMonth   / newLeadsMonth
    //
    // GROUP 3 — Financial
    //   CAC:       TOTAL_MONTHLY_MARKETING_SPEND / newTraineesMonth
    //   Total MRR: activeTrainees × MEMBERSHIP_MONTHLY_PRICE   (recurring, not new-only)
    //
    // SECONDARY (not shown in exec strip)
    //   WA Cost/Member: WHATSAPP_MONTHLY_COST / newTraineesMonth

    const trialBookingsMonth = trialBookings.filter(t => (t.created_date || '') >= day30).length;

    // GROUP 2 — Conversion
    const leadToTrialRate = newLeadsMonth > 0
      ? Math.round((trialBookingsMonth / newLeadsMonth) * 100) : null;

    const trialToMembershipRate = trialBookingsMonth > 0
      ? Math.round((newTraineesMonth / trialBookingsMonth) * 100) : null;

    const leadToMembershipRate = newLeadsMonth > 0
      ? Math.round((newTraineesMonth / newLeadsMonth) * 100) : null;

    // GROUP 3 — Financial
    const totalMRR = membershipPrice != null
      ? activeTrainees * membershipPrice : null;

    const cac = totalMarketingSpend != null && newTraineesMonth > 0
      ? Math.round(totalMarketingSpend / newTraineesMonth) : null;

    // SECONDARY — available for WhatsAppHealthDashboard, not in exec strip
    const waCostPerMember = whatsappMonthlyCost != null && newTraineesMonth > 0
      ? Math.round(whatsappMonthlyCost / newTraineesMonth) : null;

    const businessKpis = {
      // GROUP 1 — Volume
      leadsThisMonth:       newLeadsMonth,
      trialsThisMonth:      trialBookingsMonth,
      membershipsThisMonth: newTraineesMonth,
      // GROUP 2 — Conversion (Green/Amber/Red thresholds in comments)
      leadToTrialRate,        // % | null — Green ≥30%, Amber 15–29%, Red <15%
      trialToMembershipRate,  // % | null — Green ≥50%, Amber 25–49%, Red <25%
      leadToMembershipRate,   // % | null — Green ≥15%, Amber  8–14%, Red  <8%
      // GROUP 3 — Financial
      cac,                    // ₪ | null — requires TOTAL_MONTHLY_MARKETING_SPEND
      totalMRR,               // ₪ | null — requires MEMBERSHIP_MONTHLY_PRICE
      // SECONDARY
      waCostPerMember,        // ₪ | null — requires WHATSAPP_MONTHLY_COST
      // Config availability flags
      priceConfigured:     membershipPrice      != null,
      marketingConfigured: totalMarketingSpend  != null,
    };

    // ── Alerts (sorted critical → warning) ───────────────────────────────
    const alerts = [];

    if (!whatsappEnabled) {
      alerts.push({ level: 'critical', metric: 'kill_switch',
        message: 'WhatsApp kill switch is ACTIVE — no outbound messages sending' });
    }
    if (whatsappEnabled && !providerConnected) {
      alerts.push({ level: 'critical', metric: 'provider',
        message: 'WhatsApp provider not connected — check Green API settings' });
    }
    if (queueFailRate > 5) {
      alerts.push({ level: 'critical', metric: 'queue_fail_rate',
        message: `Queue failure rate ${queueFailRate}% in last 24h (threshold 5%)`,
        value: queueFailRate });
    } else if (queueFailRate > 1) {
      alerts.push({ level: 'warning', metric: 'queue_fail_rate',
        message: `Queue failure rate ${queueFailRate}% in last 24h (threshold 1%)`,
        value: queueFailRate });
    }
    if (queueStale.length > 5) {
      alerts.push({ level: 'critical', metric: 'queue_stale',
        message: `${queueStale.length} messages stuck in queue for >15 min`,
        value: queueStale.length });
    } else if (queueStale.length > 0) {
      alerts.push({ level: 'warning', metric: 'queue_stale',
        message: `${queueStale.length} message(s) pending >15 min in queue`,
        value: queueStale.length });
    }
    if (leadNotFoundRate > 8) {
      alerts.push({ level: 'critical', metric: 'lead_not_found',
        message: `LEAD_NOT_FOUND rate ${leadNotFoundRate}% of inbounds in 24h (threshold 8%)`,
        value: leadNotFoundRate });
    } else if (leadNotFoundRate > 3) {
      alerts.push({ level: 'warning', metric: 'lead_not_found',
        message: `LEAD_NOT_FOUND rate ${leadNotFoundRate}% of inbounds in 24h`,
        value: leadNotFoundRate });
    }
    if (flowNoClaim24h > 3) {
      alerts.push({ level: 'critical', metric: 'flow_no_claim',
        message: `${flowNoClaim24h} FLOW_NO_ENGINE_CLAIMED events in 24h`,
        value: flowNoClaim24h });
    } else if (flowNoClaim24h > 0) {
      alerts.push({ level: 'warning', metric: 'flow_no_claim',
        message: `${flowNoClaim24h} FLOW_NO_ENGINE_CLAIMED event(s) in 24h`,
        value: flowNoClaim24h });
    }
    if (multiCollision24h > 10) {
      alerts.push({ level: 'critical', metric: 'phone_collision',
        message: `${multiCollision24h} multi-lead phone collisions in 24h (threshold 10)`,
        value: multiCollision24h });
    } else if (multiCollision24h > 3) {
      alerts.push({ level: 'warning', metric: 'phone_collision',
        message: `${multiCollision24h} multi-lead phone collisions in 24h`,
        value: multiCollision24h });
    }
    if (capViolationsToday > 0) {
      alerts.push({ level: 'warning', metric: 'cap_violations',
        message: `${capViolationsToday} trainee(s) exceeded 2-message daily cap today`,
        value: capViolationsToday });
    }
    if (optOutsToday > 0) {
      alerts.push({ level: 'warning', metric: 'opt_out',
        message: `${optOutsToday} lead(s) opted out of WhatsApp today`,
        value: optOutsToday });
    }

    alerts.sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.level] - { critical: 0, warning: 1, info: 2 }[b.level]));

    // ── Derived status signals (for Executive Dashboard traffic lights) ──
    const whatsappStatus =
      !whatsappEnabled || !providerConnected ? 'red' :
      (queueFailRate > 5 || queueStale.length > 5) ? 'red' :
      (queueFailRate > 1 || queueStale.length > 0) ? 'yellow' : 'green';

    const automationStatus =
      capViolationsToday > 0 || flowNoClaim24h > 3 ? 'yellow' :
      sentToday === 0 ? 'yellow' : 'green';

    const leadsStatus =
      newLeadsToday > 0 ? 'green' :
      newLeadsWeek > 0  ? 'yellow' : 'red';

    const trialsStatus =
      (leadToTrialRate ?? 0) >= 30 ? 'green' :
      (leadToTrialRate ?? 0) >= 15 ? 'yellow' : 'red';

    const membershipsStatus =
      newTraineesMonth > 0 && (leadToMembershipRate ?? 0) >= 15 ? 'green' :
      newTraineesMonth > 0 ? 'yellow' : 'red';

    const systemStatus =
      alerts.some(a => a.level === 'critical') ? 'red' :
      alerts.some(a => a.level === 'warning')  ? 'yellow' : 'green';

    return Response.json({
      ok: true,
      coachEmail: coachEmail || 'system',
      updatedAt: new Date().toISOString(),

      signals: { whatsappStatus, automationStatus, leadsStatus, trialsStatus, membershipsStatus, systemStatus },
      alerts,

      whatsapp: {
        enabled: whatsappEnabled,
        providerConnected,
        queueFailed24h: queueFailed24h.length,
        queueSent24h,
        queueTotal24h,
        queueStaleCount: queueStale.length,
        queueFailRate,
        leadNotFound24h,
        leadNotFoundRate,
        flowNoClaim24h,
        multiCollision24h,
        traineeWins24h,
        totalInbound24h,
        sentToday,
        skippedToday,
        capViolationsToday,
        schedulersSeen,
        routing: { ai: routingAI, flow: routingFlow, legacy: routingLeg },
        failedItems: failedItemsSample,
        staleItems: staleItemsSample,
      },
      crm: {
        newLeadsToday,
        newLeadsWeek,
        newLeadsMonth,
        bookedLeads,
        activeLeads,
        optOutsToday,
        trialConversionRate,
        membershipConversionRate,
        statusDistribution: statusCounts,
      },
      trainees: {
        activeCount: activeTrainees,
        newThisMonth: newTraineesMonth,
      },
      businessKpis,
    });
  } catch (error) {
    console.error('[operationalMonitoringAggregator] Error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});
