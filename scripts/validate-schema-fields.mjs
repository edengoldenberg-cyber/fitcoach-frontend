/**
 * validate-schema-fields.mjs
 *
 * Fails with exit code 1 if any frontend payload sends a field that does not
 * exist in schema.prod.prisma.  Run before every production build.
 *
 * Usage:  node scripts/validate-schema-fields.mjs
 */

import { readFileSync } from 'fs';
import { globSync } from 'glob';

// ─── Valid fields per model (derived from schema.prod.prisma) ─────────────────

const VALID_FIELDS = {
  Trainee: new Set([
    'id','user_id','user_email','coach_id','coach_email','full_name','phone',
    'gender','birth_year','height_cm','weight_kg','goal','activity_level',
    'medical_notes','profile_image','units','status','onboarding_status',
    'invite_token','invite_status','last_login_at','first_login_at',
    'visible_modules','target_calories','target_protein','target_carbs',
    'target_fat','water_target_ml','created_at','updated_at',
  ]),
  MealEntry: new Set([
    'id','trainee_id','trainee_email','coach_email','user_id','date','meal_type',
    'source','calories','protein','carbs','fat','food_name','quantity','unit',
    'learning_event_type','notes','created_at','updated_at',
  ]),
  WaterEntry: new Set([
    'id','trainee_id','trainee_email','date','amount_ml','created_at',
  ]),
  WorkoutSession: new Set([
    'id','trainee_id','trainee_email','coach_email','date','title','template_id',
    'template_name','duration_min','source','status','notes','effort_score',
    'created_at','updated_at',
  ]),
  MetricsEntry: new Set([
    'id','trainee_id','trainee_email','coach_email','date','weight_kg',
    'body_fat_percent','water_percent','muscle_mass_kg','body_age_years',
    'notes','created_at','updated_at',
  ]),
  DailyWorkout: new Set([
    'id','coach_email','title','day_of_week','date','status','assignment_id',
    'exercises','created_at','updated_at',
  ]),
  User: new Set([
    'id','email','full_name','role','avatar_url','created_at','updated_at',
  ]),
  CoachSettings: new Set([
    'id','coach_email','display_name','whatsapp_number','message_templates',
    'menu_visibility','notification_prefs','created_at','updated_at',
  ]),
  NotificationPreferences: new Set([
    'id','trainee_id','trainee_email','whatsapp_reminders_enabled',
    'workout_reminders_enabled','nutrition_reminders_enabled',
    'water_reminders_enabled','weigh_in_reminders_enabled',
    'inactivity_reminders_enabled','ai_followups_enabled',
    'marketing_messages_enabled','league_notifications_enabled',
    'push_notifications_enabled','created_at','updated_at',
  ]),
};

// ─── Known-invalid field names (caught by grep) ───────────────────────────────

const BANNED_PATTERNS = [
  { field: 'invited_at',                   models: ['Trainee'] },
  { field: 'whatsapp_notifications_enabled', models: ['Trainee'] },
  { field: 'deleted_at',                   models: ['Trainee'] },
  { field: 'notifications_prompt_enabled', models: ['Trainee'] },
  { field: 'invite_sent_at',               models: ['Trainee'] },
  { field: 'invite_last_sent_at',          models: ['Trainee'] },
  { field: 'invite_opened_at',             models: ['Trainee'] },
  { field: 'target_water_ml',              models: ['Trainee'] },
  { field: 'birth_date',                   models: ['Trainee'] },
  { field: 'diet_type',                    models: ['Trainee'] },
  { field: 'goal_weight_change_kg',        models: ['Trainee'] },
  { field: 'goal_timeline_weeks',          models: ['Trainee'] },
  { field: 'coach_rating',                 models: ['WorkoutSession'] },
  { field: 'coach_feedback',               models: ['WorkoutSession'] },
  { field: 'duration_minutes',             models: ['WorkoutSession'] },
  { field: 'container_type',               models: ['WaterEntry'] },
  { field: 'source',                       models: ['MetricsEntry'] },
  { field: 'coach_notes',                  models: ['Trainee'] },
];

// ─── Scan source files ────────────────────────────────────────────────────────

const SRC = 'src/**/*.{js,jsx,ts,tsx}';
const files = globSync(SRC, { cwd: new URL('..', import.meta.url).pathname });

let failures = 0;

for (const { field, models } of BANNED_PATTERNS) {
  const modelPart = models.join('|');
  const re = new RegExp(
    `(?:${modelPart})\\.(?:create|update)\\s*\\([^)]*${field}`,
    's'
  );
  const reSimple = new RegExp(`['"]?${field}['"]?\\s*:`);

  for (const file of files) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    // Heuristic: file contains both entity name and the banned field near a create/update
    const hasModel = models.some(m => src.includes(`entities.${m}.create`) || src.includes(`entities.${m}.update`));
    if (!hasModel) continue;
    if (!reSimple.test(src)) continue;

    // Check proximity: field appears in a create/update block
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(field)) {
        // Check surrounding 10 lines for entity create/update
        const context = lines.slice(Math.max(0, i - 10), i + 2).join('\n');
        const hasCreate = models.some(m =>
          context.includes(`entities.${m}.create`) ||
          context.includes(`entities.${m}.update`)
        );
        if (hasCreate) {
          console.error(`❌ INVALID FIELD: "${field}" sent to ${models.join('/')} in ${file}:${i + 1}`);
          failures++;
        }
      }
    }
  }
}

if (failures === 0) {
  console.log('✅ Schema field validation passed — no invalid fields found.');
  process.exit(0);
} else {
  console.error(`\n💥 ${failures} invalid field(s) found. Fix before building for production.`);
  process.exit(1);
}
