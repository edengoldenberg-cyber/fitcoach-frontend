/**
 * PRIORITY ORCHESTRATOR — Handle multiple competing triggers
 *
 * When multiple triggers fire simultaneously:
 * 1. Collect all triggered messages + priorities
 * 2. Apply smart selection logic:
 *    - Select highest priority only
 *    - If same priority: prefer most relevant to user state
 *    - Skip others (log why)
 * 3. Pass winning message to whatsAppSmartGate
 * 4. Queue ONLY winner
 *
 * Usage (from schedulers/flows):
 * const winner = await selectBestTrigger(base44, traineeEmail, triggers);
 * if (winner) {
 *   const gateResult = await whatsAppSmartGate(base44, traineeId, traineeEmail, winner.type, winner.text);
 *   if (gateResult.approved) {
 *     // Queue message
 *   }
 * }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PRIORITIES = {
  'HIGH': 3,
  'MEDIUM': 2,
  'LOW': 1
};

const TRIGGER_PRIORITIES = {
  'onboarding_msg1': 'HIGH',
  'onboarding_msg2': 'HIGH',
  'onboarding_msg3': 'HIGH',
  'activation_no_login': 'HIGH',
  'recovery_7days': 'HIGH',
  'activation_no_meals': 'MEDIUM',
  'activation_no_water': 'MEDIUM',
  'recovery_3days': 'MEDIUM',
  'engagement_3day_streak': 'LOW',
  'engagement_protein_goal': 'LOW',
  'engagement_calorie_goal': 'LOW',
  'workout_motivation': 'LOW',
  'encouragement_weekly': 'LOW',
  'ai_suggestion': 'LOW'
};

/**
 * Relevance score: 0–100
 * Higher = better fit for user state
 */
function getRelevanceScore(triggerType, userState) {
  let score = 50; // baseline

  switch (triggerType) {
    case 'activation_no_login':
      // Highly relevant if user hasn't logged in
      score = userState.last_login ? 30 : 90;
      break;

    case 'activation_no_meals':
      // Highly relevant if no meals logged today
      score = userState.meals_logged_today === 0 ? 90 : 20;
      break;

    case 'activation_no_water':
      // Relevant if minimal water
      score = userState.water_logged_today < 500 ? 85 : 25;
      break;

    case 'recovery_3days':
      // Relevant if last message was 3+ days ago
      score = userState.hours_since_last_message > 72 ? 85 : 30;
      break;

    case 'recovery_7days':
      // Relevant if last message was 7+ days ago
      score = userState.hours_since_last_message > 168 ? 95 : 20;
      break;

    case 'engagement_3day_streak':
      // Relevant if user has streak
      score = userState.streak_days >= 3 ? 80 : 30;
      break;

    case 'engagement_protein_goal':
    case 'engagement_calorie_goal':
      // Relevant if user is actively logging
      score = userState.meals_logged_today > 0 ? 75 : 25;
      break;

    case 'workout_motivation':
      // Relevant if user is engaged
      score = userState.hours_since_last_message < 24 ? 70 : 40;
      break;
  }

  return score;
}

/**
 * Select best trigger from competing list
 *
 * Returns:
 * {
 *   winning_trigger: { type, text, priority, relevance_score },
 *   skipped: [{ type, priority, reason }, ...],
 *   selection_reason: "highest_priority" | "best_relevance" | "only_option"
 * }
 */
async function selectBestTrigger(base44, traineeId, traineeEmail, competingTriggers, userState = null) {
  if (!competingTriggers || competingTriggers.length === 0) {
    return null;
  }

  // Single trigger — just return it
  if (competingTriggers.length === 1) {
    const t = competingTriggers[0];
    return {
      winning_trigger: {
        type: t.type,
        text: t.text,
        priority: TRIGGER_PRIORITIES[t.type] || 'LOW',
        relevance_score: 50
      },
      skipped: [],
      selection_reason: 'only_option'
    };
  }

  // Load user state if not provided
  if (!userState) {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const mealsToday = await base44.asServiceRole.entities.MealEntry.filter({
        trainee_email: traineeEmail,
        date: todayStr
      }).catch(() => []);

      const waterToday = await base44.asServiceRole.entities.WaterEntry.filter({
        trainee_email: traineeEmail,
        date: todayStr
      }).catch(() => []);

      const perfLogs = await base44.asServiceRole.entities.WhatsAppPerformance.filter({
        trainee_email: traineeEmail
      }, '-message_sent_at', 1).catch(() => []);

      userState = {
        meals_logged_today: mealsToday.length,
        water_logged_today: waterToday.reduce((sum, w) => sum + (w.amount_ml || 0), 0),
        hours_since_last_message: perfLogs[0]
          ? Math.round((Date.now() - new Date(perfLogs[0].message_sent_at).getTime()) / (1000 * 60 * 60))
          : 999,
        streak_days: 0,
        last_login: null
      };
    } catch (_) {
      userState = {};
    }
  }

  // Score each trigger
  const scored = competingTriggers.map(t => ({
    type: t.type,
    text: t.text,
    priority: TRIGGER_PRIORITIES[t.type] || 'LOW',
    priority_score: PRIORITIES[TRIGGER_PRIORITIES[t.type] || 'LOW'],
    relevance_score: getRelevanceScore(t.type, userState),
    combined_score: (PRIORITIES[TRIGGER_PRIORITIES[t.type] || 'LOW'] * 100) + getRelevanceScore(t.type, userState)
  }));

  // Sort by combined score (priority * 100 + relevance)
  scored.sort((a, b) => b.combined_score - a.combined_score);

  const winner = scored[0];
  const skipped = scored.slice(1);

  let selectionReason = 'best_combined_score';
  if (winner.priority_score > skipped[0].priority_score) {
    selectionReason = 'highest_priority';
  } else if (winner.relevance_score > skipped[0].relevance_score) {
    selectionReason = 'best_relevance';
  }

  console.log(`[PRIORITY_ORCHESTRATOR] Selected: ${winner.type} | Skipped: ${skipped.map(s => s.type).join(', ')} | Reason: ${selectionReason}`);

  return {
    winning_trigger: {
      type: winner.type,
      text: winner.text,
      priority: winner.priority,
      relevance_score: winner.relevance_score
    },
    skipped: skipped.map(s => ({
      type: s.type,
      priority: s.priority,
      relevance_score: s.relevance_score,
      reason: `Lost to ${winner.type} (score: ${s.combined_score} < ${winner.combined_score})`
    })),
    selection_reason: selectionReason
  };
}

// ─────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { traineeId, traineeEmail, competingTriggers, userState } = await req.json();

    if (!traineeEmail || !competingTriggers) {
      return Response.json({
        ok: false,
        error: 'Missing: traineeEmail, competingTriggers (array)'
      }, { status: 400 });
    }

    const result = await selectBestTrigger(base44, traineeId, traineeEmail, competingTriggers, userState);

    return Response.json({
      ok: true,
      result
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { selectBestTrigger };