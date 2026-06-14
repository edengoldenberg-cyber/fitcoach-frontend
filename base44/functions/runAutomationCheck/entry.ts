import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    // Load all coaches with active external members
    const allMembers = await base44.asServiceRole.entities.ExternalMember.list();
    const allRules = await base44.asServiceRole.entities.AutomationRule.list();

    let rulesChecked = 0;
    let membersMatched = 0;
    let messagesCreated = 0;
    let errorsFound = 0;

    // Group by coach
    const coachGroups = {};
    allMembers.forEach(member => {
      if (!coachGroups[member.coach_email]) {
        coachGroups[member.coach_email] = [];
      }
      coachGroups[member.coach_email].push(member);
    });

    // For each coach
    for (const coachEmail of Object.keys(coachGroups)) {
      const coachMembers = coachGroups[coachEmail];
      const coachRules = allRules.filter(r => r.coach_email === coachEmail && r.isActive);

      // For each rule
      for (const rule of coachRules) {
        rulesChecked++;

        try {
          // Check each member against this rule
          for (const member of coachMembers) {
            const shouldTrigger = await checkTrigger(base44, rule, member);

            if (shouldTrigger) {
              membersMatched++;

              try {
                // Create log entry
                const message = rule.messageTemplate.replace('{name}', member.name);

                await base44.asServiceRole.entities.AutomationLog.create({
                  coach_email: coachEmail,
                  member_id: member.id,
                  rule_id: rule.id,
                  member_name: member.name,
                  rule_name: rule.name,
                  trigger_type: rule.triggerType,
                  status: 'pending',
                  message: message
                });

                messagesCreated++;
              } catch (logErr) {
                errorsFound++;
                await base44.asServiceRole.entities.SystemDiagnostics.create({
                  coach_email: coachEmail,
                  module: 'AutomationEngine',
                  errorType: 'LogCreationError',
                  message: `Failed to create log for ${member.name}`,
                  stack: logErr.stack,
                  severity: 'warning'
                });
              }
            }
          }
        } catch (ruleErr) {
          errorsFound++;
          await base44.asServiceRole.entities.SystemDiagnostics.create({
            coach_email: coachEmail,
            module: 'AutomationEngine',
            errorType: 'RuleProcessingError',
            message: `Failed to process rule: ${rule.name}`,
            stack: ruleErr.stack,
            severity: 'warning'
          });
        }
      }
    }

    return Response.json({
      success: true,
      summary: {
        rulesChecked,
        membersMatched,
        messagesCreated,
        errors: errorsFound
      }
    });
  } catch (error) {
    // Log critical error
    await base44.asServiceRole.entities.SystemDiagnostics.create({
      coach_email: 'system',
      module: 'AutomationEngine',
      errorType: 'CriticalError',
      message: error.message,
      stack: error.stack,
      severity: 'critical'
    }).catch(() => {});

    // Return error but don't crash
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

async function checkTrigger(base44, rule, member) {
  try {
    const today = new Date();
    const triggerDate = new Date();
    triggerDate.setDate(triggerDate.getDate() - rule.delayDays);

    switch (rule.triggerType) {
      case 'noAttendance':
        // Check if no visit in last X days
        if (!member.lastVisitDate) return true;
        const lastVisit = new Date(member.lastVisitDate);
        const daysSinceVisit = Math.floor((today - lastVisit) / (1000 * 60 * 60 * 24));
        return daysSinceVisit >= rule.delayDays;

      case 'birthday':
        // Check if birthday is today
        if (!member.birthday) return false;
        const birthDate = new Date(member.birthday);
        return (
          birthDate.getMonth() === today.getMonth() &&
          birthDate.getDate() === today.getDate()
        );

      case 'lowAttendance':
        // Check if attendance rate is low
        return member.attendanceRate < 50;

      case 'noWorkoutLog':
        // Check if member has no recent workout logs
        try {
          const logs = await base44.asServiceRole.entities.ExerciseHistory.filter({
            trainee_email: member.email
          });
          if (!logs || logs.length === 0) return true;
          const lastLog = logs[0];
          const daysNoLog = Math.floor((today - new Date(lastLog.date)) / (1000 * 60 * 60 * 24));
          return daysNoLog >= rule.delayDays;
        } catch {
          return false;
        }

      case 'noNutritionLog':
        // Check if member has no recent nutrition logs
        try {
          const meals = await base44.asServiceRole.entities.MealEntry.filter({
            trainee_email: member.email
          });
          if (!meals || meals.length === 0) return true;
          const lastMeal = meals[0];
          const daysNoMeal = Math.floor((today - new Date(lastMeal.created_date)) / (1000 * 60 * 60 * 24));
          return daysNoMeal >= rule.delayDays;
        } catch {
          return false;
        }

      default:
        return false;
    }
  } catch (err) {
    console.error('Trigger check error:', err);
    return false;
  }
}