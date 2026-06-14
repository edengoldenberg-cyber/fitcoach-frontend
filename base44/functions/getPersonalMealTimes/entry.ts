/**
 * GET PERSONAL MEAL TIMES
 *
 * Load trainee's personal schedule.
 * Fallback to defaults if not set.
 *
 * Returns:
 * {
 *   breakfast: "HH:MM",
 *   lunch: "HH:MM",
 *   dinner: "HH:MM",
 *   wake: "HH:MM",
 *   sleep: "HH:MM"
 * }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULTS = {
  breakfast: '10:00',
  lunch: '14:00',
  dinner: '19:00',
  wake: '07:00',
  sleep: '23:00'
};

async function getPersonalMealTimes(base44, traineeEmail) {
  try {
    const schedule = await base44.asServiceRole.entities.TraineeSchedule.filter({
      trainee_email: traineeEmail
    }).catch(() => []);

    if (schedule.length === 0) {
      return DEFAULTS;
    }

    const sched = schedule[0];
    return {
      breakfast: sched.breakfast_time || DEFAULTS.breakfast,
      lunch: sched.lunch_time || DEFAULTS.lunch,
      dinner: sched.dinner_time || DEFAULTS.dinner,
      wake: sched.wake_time || DEFAULTS.wake,
      sleep: sched.sleep_time || DEFAULTS.sleep
    };
  } catch (err) {
    console.error('[getPersonalMealTimes] Error:', err.message);
    return DEFAULTS;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { traineeEmail } = await req.json();

    if (!traineeEmail) {
      return Response.json({
        ok: false,
        error: 'Missing: traineeEmail'
      }, { status: 400 });
    }

    const times = await getPersonalMealTimes(base44, traineeEmail);

    return Response.json({ ok: true, times });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { getPersonalMealTimes };