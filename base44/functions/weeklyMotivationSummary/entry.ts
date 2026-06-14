import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Kill switch (identical pattern to all other scheduler functions) ─────────
async function isOutboundEnabled(base44) {
  try {
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'GLOBAL_WHATSAPP_ENABLED' });
    return configs[0]?.value === true;
  } catch (_) { return false; }
}

// ── Phone normalisation (Israel-only E.164) ────────────────────────────────
function normalizePhone(p) {
  if (!p) return null;
  let s = String(p).trim().replace(/[\s\-().,]/g, '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^972\d{9}$/.test(s)) s = '+' + s;
  if (/^0\d{9}$/.test(s)) s = '+972' + s.slice(1);
  if (/^\+972\d{9}$/.test(s)) return s;
  return null;
}

Deno.serve(async (req) => {
  // ── GUARD 1: Global kill switch — checked before everything else ────────
  const _ks = createClientFromRequest(req);
  if (!(await isOutboundEnabled(_ks))) {
    return Response.json({
      ok: false, blocked: true,
      reason: 'GLOBAL_WHATSAPP_KILL_SWITCH_ACTIVE',
    }, { status: 200 });
  }

  try {
    const base44 = createClientFromRequest(req);
    // Authenticated caller check
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trainee_email, testPhone } = await req.json();

    // ── GUARD 2: Fetch trainee via asServiceRole (not user-scoped context) ─
    const trainees = await base44.asServiceRole.entities.Trainee.filter({ user_email: trainee_email });
    const trainee = trainees[0];
    if (!trainee) {
      return Response.json({ error: 'Trainee not found' }, { status: 404 });
    }

    // ── GUARD 3: Only active trainees ──────────────────────────────────────
    if (trainee.status !== 'active') {
      return Response.json({ ok: false, reason: 'trainee_not_active', status: trainee.status });
    }

    // ── GUARD 4: Respect WhatsApp opt-out ─────────────────────────────────
    if (trainee.whatsapp_notifications_enabled === false) {
      return Response.json({ ok: false, reason: 'opt_out', trainee: trainee_email });
    }

    // ── Data calculations (unchanged from original) ────────────────────────
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // Jerusalem timezone
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    const weekStartStr = startOfWeek.toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    const workouts = await base44.asServiceRole.entities.WorkoutSession.filter({ trainee_email }).catch(() => []);
    const weekWorkouts = workouts.filter(w => {
      const wDate = w.date || (w.created_date ? w.created_date.split('T')[0] : null);
      return wDate && wDate >= weekStartStr && wDate <= todayStr;
    });
    const workoutCount = weekWorkouts.length;

    const meals = await base44.asServiceRole.entities.MealEntry.filter({ trainee_email }).catch(() => []);
    const weekMeals = meals.filter(m => {
      const mDate = m.date || (m.created_date ? m.created_date.split('T')[0] : null);
      return mDate && mDate >= weekStartStr && mDate <= todayStr;
    });

    const targetDailyCalories = trainee.target_calories || 2000;
    const weekDays = Math.max(1, weekMeals.length > 0 ? Math.ceil((new Date(todayStr).getTime() - startOfWeek.getTime()) / (1000 * 60 * 60 * 24)) : 1);
    const targetWeeklyCalories = targetDailyCalories * weekDays;
    const actualWeeklyCalories = weekMeals.reduce((sum, m) => sum + (m.total_calories || 0), 0);
    const weeklyDeficit = Math.max(0, targetWeeklyCalories - actualWeeklyCalories);
    const estimatedWeightLoss = (weeklyDeficit / 7700).toFixed(2);
    const estimatedFatLoss = (weeklyDeficit / 7000).toFixed(2);

    const metrics = await base44.asServiceRole.entities.MetricsEntry.filter({ trainee_email }).catch(() => []);
    const latestMetric = metrics.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())[0];
    const currentWeight = latestMetric?.weight_kg || trainee.weight_kg;

    let progressText = '';
    if (trainee.goal === 'lose' && trainee.goal_weight_change_kg) {
      const remaining = trainee.goal_weight_change_kg - ((trainee.weight_kg || 0) - (currentWeight || 0));
      const percentRemaining = Math.max(0, remaining / trainee.goal_weight_change_kg * 100);
      progressText = `${percentRemaining.toFixed(0)}% נשאר ליעד (${remaining.toFixed(1)} ק"ג)`;
    } else if (trainee.goal === 'gain' && trainee.goal_weight_change_kg) {
      const gained = (currentWeight || 0) - (trainee.weight_kg || 0);
      const percentDone = Math.min(100, gained / trainee.goal_weight_change_kg * 100);
      progressText = `${percentDone.toFixed(0)}% מיעד ההשקלה (${gained.toFixed(1)} ק"ג)`;
    } else {
      progressText = `משקל נוכחי: ${(currentWeight || 0).toFixed(1)} ק"ג`;
    }

    const prevWeekStart = new Date(startOfWeek);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0];
    const prevWeekEnd = new Date(prevWeekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() + 6);
    const prevWeekEndStr = prevWeekEnd.toISOString().split('T')[0];
    const prevWeekWorkouts = workouts.filter(w => {
      const wDate = w.date || (w.created_date ? w.created_date.split('T')[0] : null);
      return wDate && wDate >= prevWeekStartStr && wDate <= prevWeekEndStr;
    });
    const prevWorkoutCount = prevWeekWorkouts.length;
    const workoutChange = workoutCount - prevWorkoutCount;
    const workoutTrend = workoutChange > 0 ? `📈 ${workoutChange} אימונים יותר מאשבוע שעבר`
                      : workoutChange < 0 ? `📉 ${Math.abs(workoutChange)} אימונים פחות מאשבוע שעבר`
                      : '➡️ אותו מספר אימונים';

    const message = `📊 סיכום שבוע - ${trainee.full_name}\n\n` +
      `💪 אימונים: ${workoutCount} סשנים השבוע\n${workoutTrend}\n\n` +
      `🔥 גירעון קלורי: ${weeklyDeficit.toLocaleString('he-IL')} קק"ל\n` +
      `⚖️ הערכה:\n` +
      `   • ירידה משקל: ~${estimatedWeightLoss} ק"ג\n` +
      `   • ירידה שומן: ~${estimatedFatLoss} ק"ג\n\n` +
      `🎯 התקדמות: ${progressText}\n\n` +
      `💪 אתה בדרך הנכונה! המשך כך!`;

    // ── GUARD 5: Idempotency — one weekly summary per trainee per day ─────
    const sessionId = `${trainee.id}__weekly_summary__${todayStr}`;
    if (!testPhone) {
      // Only apply dedup for real (non-test) sends
      const alreadyQueued = await base44.asServiceRole.entities.WhatsAppMessageQueue
        .filter({ session_id: sessionId }).catch(() => []);
      if (alreadyQueued.length > 0) {
        return Response.json({
          ok: false, reason: 'already_sent_today',
          session_id: sessionId,
          message,
        });
      }
    }

    // Global daily frequency cap — same WhatsAppEventLog source as smartMealWaterReminder
    if (!testPhone) {
      const capLogs = await base44.asServiceRole.entities.WhatsAppEventLog.filter({
        trainee_email: trainee_email,
        event_type: 'message_sent'
      }, '-timestamp', 5).catch(() => []);
      if (capLogs.filter(e => e.timestamp?.startsWith(todayStr)).length >= 2) {
        return Response.json({ ok: false, reason: 'daily_cap_reached', trainee: trainee_email });
      }
    }

    // ── Queue the message ──────────────────────────────────────────────────
    if (trainee.phone || testPhone) {
      const phoneToUse = testPhone || trainee.phone;
      const normalized = normalizePhone(phoneToUse);

      if (normalized) {
        // ── GUARD 6: Real provider lookup scoped to this coach ────────────
        // Never hardcode provider_type — always read from coach's config.
        const providers = await base44.asServiceRole.entities.WhatsAppProviderConfig
          .filter({ coach_email: trainee.coach_email }).catch(() => []);
        const provider = providers.find(p => p.is_enabled && p.status === 'connected')
          || providers.find(p => p.is_enabled)
          || providers[0];
        const providerType = provider?.provider_type || 'greenapi';

        await base44.asServiceRole.entities.WhatsAppMessageQueue.create({
          coach_email: trainee.coach_email,
          to_phone_e164: normalized,
          to_name: trainee.full_name,
          context_type: 'trainee',
          context_id: trainee.id,
          rendered_text: message,
          provider_type: providerType,
          status: 'queued',
          // session_id prevents duplicate sends on repeated invocations
          session_id: testPhone ? null : sessionId,
        });

        // Register in shared EventLog so other schedulers see this in the daily cap
        if (!testPhone) {
          await base44.asServiceRole.entities.WhatsAppEventLog.create({
            trainee_email: trainee_email,
            event_type: 'message_sent',
            trigger_type: 'weekly_motivation_summary',
            timestamp: new Date().toISOString()
          }).catch(() => {});
        }
      }
    }

    return Response.json({ success: true, message, workoutCount, deficit: weeklyDeficit });
  } catch (error) {
    console.error('[weeklyMotivationSummary] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
