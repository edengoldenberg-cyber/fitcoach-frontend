import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const defaultRules = [
      {
        is_enabled: true,
        rule_type: 'meal_missing',
        target_scope: 'all',
        schedule_time_1: '10:30',
        schedule_time_2: '15:30',
        schedule_time_3: '21:00',
        channel_priority: ['in_app', 'email'],
        message_template_he: 'עוד לא מילאת ארוחות היום 🍽️',
        coach_email: user.email,
      },
      {
        is_enabled: true,
        rule_type: 'water_missing',
        target_scope: 'all',
        schedule_time_1: '14:00',
        schedule_time_2: '18:00',
        threshold_value: 1500,
        channel_priority: ['in_app', 'email'],
        message_template_he: 'תזכורת מים 💧',
        coach_email: user.email,
      },
      {
        is_enabled: true,
        rule_type: 'workout_missing',
        target_scope: 'all',
        schedule_time_1: '20:00',
        channel_priority: ['in_app', 'email'],
        message_template_he: 'האימון שלך היום 💪',
        coach_email: user.email,
      },
      {
        is_enabled: true,
        rule_type: 'inactivity_24h',
        target_scope: 'all',
        schedule_time_1: '09:00',
        channel_priority: ['in_app', 'email'],
        message_template_he: 'מתגעגעים אליך! 👋',
        coach_email: user.email,
      },
    ];

    const created = await base44.asServiceRole.entities.NotificationRule.bulkCreate(defaultRules);

    return Response.json({
      success: true,
      created: created.length,
      rules: created,
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});