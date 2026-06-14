import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const COACH_EMAIL = 'edengoldenberg@gmail.com';

const MERGES = [
  {
    name: 'אלה חנוכייב',
    canonicalId: '6a0dd938593d20ffc14675f9',
    canonicalEmail: 'ella198111@gmail.com',
    canonicalUserId: '6a0dd9337c5a112dfb1b3ebe',
    canonicalPatch: { coach_email: COACH_EMAIL, phone: '+972524850007', status: 'active' },
    duplicates: [{ id: '6a0dd8d50d6473e9ebcc8d5a', email: 'ell198111@gmail.com' }],
  },
  {
    name: 'גאולה וייס',
    canonicalId: '6a05ffcd432f1c1a97955974',
    canonicalEmail: 'geulla0221@gmail.com',
    canonicalUserId: '6a05ffc9204f0e4da0440627',
    canonicalPatch: { coach_email: COACH_EMAIL, status: 'active' },
    duplicates: [{ id: '6a05ff6442a6c7966c2a9389', email: 'geulla0322@gmail.com' }],
  },
  {
    name: 'רוני זר אביב',
    canonicalId: '69ff693041c03f9697694b64',
    canonicalEmail: 'ronyzeraviv@gmail.com',
    canonicalUserId: '69ff68ca7199c814bca1c8b8',
    canonicalPatch: { coach_email: COACH_EMAIL, status: 'active' },
    duplicates: [{ id: '69ff68ce31ace2150479564f', email: 'ronyzeraviv@gmail.com' }],
  },
  {
    name: 'הדר עבדי',
    canonicalId: '69fe2e32afc1979f3f3f80e2',
    canonicalEmail: 'hadarabady@gmail.com',
    canonicalUserId: '69fe2e2ce01d3ef38f7be56a',
    canonicalPatch: { coach_email: COACH_EMAIL, phone: '+972546988340', gender: 'female', height_cm: 159, status: 'active' },
    duplicates: [{ id: '69fe2d6096f358f006557a92', email: 'hadarabasy@gmail.com' }],
  },
  {
    name: 'יובל קפלן',
    canonicalId: '69fca6c153fd4787c6e9061e',
    canonicalEmail: 'yuvalka@mevoot-eron.com',
    canonicalUserId: '69fca6be3f4f4a3eac421054',
    canonicalPatch: { coach_email: COACH_EMAIL, phone: '+972556832225', gender: 'female', height_cm: 150, status: 'active' },
    duplicates: [{ id: '69fc9f7b76013c198bd1ee29', email: 'yuval.ron.kaplan@gmail.com' }],
  },
  {
    name: 'דיאנה אברהם',
    canonicalId: '69fdae9074a608f25c079817',
    canonicalEmail: 'dianaabram21@gmail.com',
    canonicalUserId: '69fdae8cb258f8c00c481174',
    canonicalPatch: { coach_email: COACH_EMAIL, phone: '+972507587475', status: 'active' },
    duplicates: [{ id: '69fc9e8d7d76010da20c78a2', email: 'shdianaavr@clalit.irg.il' }],
  },
  {
    name: 'Yulia Sherman',
    canonicalId: '699ca75dfe5ffcb865a7e683',
    canonicalEmail: 'masanaale@gmail.com',
    canonicalUserId: '69fc03c355340da6b8dc62ce',
    canonicalPatch: { coach_email: COACH_EMAIL, phone: '+972542039206', status: 'active' },
    duplicates: [{ id: '69fc03846b3aa2db72b4caf0', email: 'masananaale@gmail.com' }],
  },
  {
    name: 'יהלי ארזואן',
    canonicalId: '69f70121e5e49fcb208e42b6',
    canonicalEmail: 'yhlyrzwn800@gmail.com',
    canonicalUserId: '698a007cd7e329d32817ed03',
    canonicalPatch: { coach_email: COACH_EMAIL, phone: '+972509551441', gender: 'male', height_cm: 180, status: 'active' },
    duplicates: [{ id: '69f8a55650b0a1a2c5eb3004', email: 'yhlyrzwn800@gnail.com' }],
  },
];

const TRAINEE_LINKED_ENTITIES = [
  'MealEntry',
  'WaterEntry',
  'MetricsEntry',
  'ExerciseHistory',
  'TraineeWorkout',
  'WorkoutSession',
  'OnlineWorkoutLog',
  'UserNutritionMemory',
  'UserFoodItem',
  'UserPointsDaily',
  'ShapeLeagueActivityLog',
  'ShapeLeaguePointAdjustment',
  'ShapeLeagueMissionCompletion',
  'TraineeStreak',
  'WorkoutCompletionFeedback',
  'DeviceDailyStats',
  'ActivityLog',
  'BodyMeasurement',
  'WeeklyReflection',
  'ConnectedDevice',
  'NutritionTargets',
  'NotificationReceipt',
  'Notification',
  'PushSubscription',
  'PushToken',
  'WhatsAppPerformance',
  'WhatsAppEventLog',
  'AIConsultation',
  'CoachNote',
];

function uniqueById(records) {
  const seen = new Set();
  return records.filter((record) => {
    if (!record?.id || seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

async function safeFilter(entityApi, query) {
  try {
    return await entityApi.filter(query);
  } catch (_error) {
    return [];
  }
}

async function relinkEntity(base44, entityName, merge, dryRun) {
  const entityApi = base44.asServiceRole.entities[entityName];
  if (!entityApi) return { entity: entityName, updated: 0 };

  const queries = [{ trainee_id: merge.canonicalId }];
  for (const duplicate of merge.duplicates) {
    queries.push({ trainee_id: duplicate.id });
    if (duplicate.email) queries.push({ trainee_email: duplicate.email });
  }

  const batches = await Promise.all(queries.map((query) => safeFilter(entityApi, query)));
  const records = uniqueById(batches.flat());

  if (!records.length) return { entity: entityName, updated: 0 };

  const patch = {
    trainee_id: merge.canonicalId,
    trainee_email: merge.canonicalEmail,
    user_id: merge.canonicalUserId,
  };

  if (records.some((record) => Object.prototype.hasOwnProperty.call(record, 'coach_email'))) {
    patch.coach_email = COACH_EMAIL;
  }

  if (!dryRun) {
    for (const record of records) {
      await entityApi.update(record.id, patch);
    }
  }

  return { entity: entityName, updated: records.length };
}

async function relinkWhatsAppQueue(base44, merge, dryRun) {
  const entityApi = base44.asServiceRole.entities.WhatsAppMessageQueue;
  if (!entityApi) return 0;

  const batches = await Promise.all(
    merge.duplicates.map((duplicate) => safeFilter(entityApi, { context_id: duplicate.id }))
  );
  const records = uniqueById(batches.flat());

  if (!dryRun) {
    for (const record of records) {
      await entityApi.update(record.id, {
        context_id: merge.canonicalId,
        coach_email: COACH_EMAIL,
      });
    }
  }

  return records.length;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const dryRun = payload.dryRun !== false;
    const executeConfirmed = payload.confirm === 'MERGE_DUPLICATES_CAREFULLY';

    if (!dryRun && !executeConfirmed) {
      return Response.json({ error: 'Missing confirmation for live merge' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const results = [];

    for (const merge of MERGES) {
      const entityResults = [];
      let totalHistoryUpdated = 0;

      if (!dryRun) {
        await base44.asServiceRole.entities.Trainee.update(merge.canonicalId, merge.canonicalPatch);
      }

      for (const duplicate of merge.duplicates) {
        if (!dryRun) {
          await base44.asServiceRole.entities.Trainee.update(duplicate.id, {
            status: 'deleted',
            deleted_at: now,
            coach_notes: `רשומה כפולה שאוחדה לתוך ${merge.canonicalEmail}`,
          });
        }
      }

      for (const entityName of TRAINEE_LINKED_ENTITIES) {
        const result = await relinkEntity(base44, entityName, merge, dryRun);
        if (result.updated > 0) {
          entityResults.push(result);
          totalHistoryUpdated += result.updated;
        }
      }

      const queueUpdated = await relinkWhatsAppQueue(base44, merge, dryRun);
      totalHistoryUpdated += queueUpdated;

      results.push({
        name: merge.name,
        canonical_id: merge.canonicalId,
        canonical_email: merge.canonicalEmail,
        duplicates_hidden: merge.duplicates.length,
        history_records_updated: totalHistoryUpdated,
        entities: entityResults,
        whatsapp_queue_updated: queueUpdated,
      });
    }

    return Response.json({
      dryRun,
      merged_profiles: MERGES.length,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});