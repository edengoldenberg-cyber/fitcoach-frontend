import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function likelyEmailFix(email) {
  const normalized = normalizeEmail(email);
  return normalized.replace(/\.con$/, '.com');
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const coachEmail = user.email;
    const coachTraineeRecords = await base44.asServiceRole.entities.Trainee.filter({ coach_email: coachEmail });
    const coachTrainees = coachTraineeRecords.filter((t) => !['deleted', 'inactive'].includes(t.status));
    const allTrainees = await base44.asServiceRole.entities.Trainee.list('-updated_date', 1000);
    const activeAllTrainees = allTrainees.filter((t) => !['deleted', 'inactive'].includes(t.status));

    const coachEmailSet = new Set(coachTrainees.map((t) => normalizeEmail(t.user_email)).filter(Boolean));
    const issues = [];

    for (const trainee of coachTrainees) {
      const email = normalizeEmail(trainee.user_email);
      const fixedEmail = likelyEmailFix(email);
      const nameKey = normalizeName(trainee.full_name);
      const phoneKey = normalizePhone(trainee.phone);

      if (email && fixedEmail !== email) {
        const matchingByFixedEmail = activeAllTrainees.filter((t) => normalizeEmail(t.user_email) === fixedEmail);
        issues.push({
          type: 'suspicious_email_typo',
          trainee_id: trainee.id,
          full_name: trainee.full_name,
          current_email: trainee.user_email,
          suggested_email: fixedEmail,
          matching_records: matchingByFixedEmail.map((t) => ({
            id: t.id,
            full_name: t.full_name,
            user_email: t.user_email,
            coach_email: t.coach_email,
            user_id: t.user_id,
            status: t.status,
          })),
        });
      }

      const duplicatesByName = activeAllTrainees.filter((t) => t.id !== trainee.id && normalizeName(t.full_name) === nameKey && nameKey);
      if (duplicatesByName.length > 0) {
        issues.push({
          type: 'duplicate_name',
          trainee_id: trainee.id,
          full_name: trainee.full_name,
          current_email: trainee.user_email,
          matching_records: duplicatesByName.map((t) => ({
            id: t.id,
            full_name: t.full_name,
            user_email: t.user_email,
            coach_email: t.coach_email,
            user_id: t.user_id,
            status: t.status,
          })),
        });
      }

      if (phoneKey) {
        const duplicatesByPhone = activeAllTrainees.filter((t) => t.id !== trainee.id && normalizePhone(t.phone) === phoneKey);
        if (duplicatesByPhone.length > 0) {
          issues.push({
            type: 'duplicate_phone',
            trainee_id: trainee.id,
            full_name: trainee.full_name,
            current_email: trainee.user_email,
            phone: trainee.phone,
            matching_records: duplicatesByPhone.map((t) => ({
              id: t.id,
              full_name: t.full_name,
              user_email: t.user_email,
              coach_email: t.coach_email,
              user_id: t.user_id,
              status: t.status,
            })),
          });
        }
      }
    }

    const externalMatchingCoachEmails = activeAllTrainees.filter((t) => {
      const email = normalizeEmail(t.user_email);
      return email && coachEmailSet.has(email) && t.coach_email !== coachEmail;
    }).map((t) => ({
      id: t.id,
      full_name: t.full_name,
      user_email: t.user_email,
      coach_email: t.coach_email,
      user_id: t.user_id,
      status: t.status,
    }));

    const repair_candidates = issues.map((issue) => ({
      type: issue.type,
      canonical: {
        id: issue.trainee_id,
        full_name: issue.full_name,
        user_email: issue.current_email || '',
        coach_email: coachEmail,
      },
      duplicates: (issue.matching_records || []).map((match) => ({
        id: match.id,
        full_name: match.full_name,
        user_email: match.user_email,
        coach_email: match.coach_email,
        status: match.status,
      })),
    }));

    const summary_lines = repair_candidates.map((candidate) => {
      const matches = candidate.duplicates
        .map((match) => `${match.id} | ${match.full_name} | ${match.user_email} | ${match.coach_email} | ${match.status}`)
        .join(' ; ');
      return `${candidate.type}: KEEP ${candidate.canonical.id} | ${candidate.canonical.full_name} | ${candidate.canonical.user_email} -> MERGE ${matches}`;
    });

    return Response.json({
      coach_email: coachEmail,
      checked_trainees: coachTrainees.length,
      issues_count: issues.length,
      repair_candidates,
      summary_lines,
      external_matching_count: externalMatchingCoachEmails.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});