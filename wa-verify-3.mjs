/**
 * WhatsApp Trigger System — Full Production Verification
 * Tests: onTraineeCreated (invite via queue) + sendWelcomeWhatsApp + consent defaults
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const API          = 'https://fitcoach-server-production-19e8.up.railway.app';
const FRONTEND     = 'https://fitcoach-frontend-omega.vercel.app';
const COACH_EMAIL  = 'edengoldenberg@gmail.com';
const COACH_PASS   = '12345678';
const TEST_PHONE   = '0535716559';
const TEST_PHONE_E164 = '+972535716559';
const SHOTS_DIR    = 'C:/Users/owner/Desktop/אפליקציה חדשה/pw-shots/wa-triggers';

fs.mkdirSync(SHOTS_DIR, { recursive: true });
const shot = (name) => path.join(SHOTS_DIR, name);

function log(k, v) { console.log(`[${k}]`, typeof v === 'string' ? v : JSON.stringify(v)); }

async function login() {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: COACH_EMAIL, password: COACH_PASS }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('Login failed: ' + JSON.stringify(d));
  return d.access_token;
}

async function fn(token, name, body = {}) {
  const r = await fetch(`${API}/api/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
}

async function get(token, path) {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json().catch(() => []);
}

async function getQueue(token, phone) {
  const items = await get(token, '/api/entities/WhatsAppMessageQueue?_sort=-created_at&_limit=50');
  return Array.isArray(items)
    ? items.filter(q => q.to_phone_e164 && q.to_phone_e164.includes('535716559'))
    : [];
}

const token = await login();
log('AUTH', 'OK');

// ─── Clean up: delete previous test trainee if exists ────────────────────────
const TEST_EMAIL = `wa_test_${Date.now()}@fitcoach-verify.local`;
log('TEST_EMAIL', TEST_EMAIL);

// ── TEST 1: onTraineeCreated — create trainee → queue invite ────────────────
log('=== TEST 1: onTraineeCreated ===', '');

// Create User
const newUser = await fetch(`${API}/api/entities/User`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ email: TEST_EMAIL, full_name: 'WA Test User', role: 'user' }),
}).then(r => r.json());
log('CREATE_USER', { id: newUser.id, email: newUser.email });

// Create Trainee
const newTrainee = await fetch(`${API}/api/entities/Trainee`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    user_id:     newUser.id,
    user_email:  TEST_EMAIL,
    full_name:   'WA Test User',
    phone:       TEST_PHONE_E164,
    coach_email: COACH_EMAIL,
    status:      'active',
  }),
}).then(r => r.json());
log('CREATE_TRAINEE', { id: newTrainee.id, phone: newTrainee.phone, email: newTrainee.user_email });

// Call onTraineeCreated
const otcResult = await fn(token, 'onTraineeCreated', { data: newTrainee });
log('ON_TRAINEE_CREATED_RESULT', otcResult);

const inviteQueueId    = otcResult?.queue_id;
const inviteIdempKey   = otcResult?.idempotency_key;
const invitePhone      = otcResult?.phone;
const inviteLink       = otcResult?.invite_link;

log('INVITE_QUEUE_ID',    inviteQueueId   || 'MISSING');
log('INVITE_IDEM_KEY',    inviteIdempKey  || 'MISSING');
log('INVITE_PHONE_CHATID', invitePhone    || 'MISSING');
log('INVITE_LINK',        inviteLink      || 'MISSING');

// Check NotificationPreferences created
const prefsItems = await get(token, `/api/entities/NotificationPreferences?trainee_id=${newTrainee.id}`);
const prefs = Array.isArray(prefsItems) ? prefsItems[0] : null;
log('NOTIFICATION_PREFS_CREATED', prefs ? {
  trainee_id:                  prefs.trainee_id,
  whatsapp_reminders_enabled:  prefs.whatsapp_reminders_enabled,
  workout_reminders_enabled:   prefs.workout_reminders_enabled,
  nutrition_reminders_enabled: prefs.nutrition_reminders_enabled,
  water_reminders_enabled:     prefs.water_reminders_enabled,
} : 'NOT_FOUND');

// Test idempotency — call onTraineeCreated again, should return duplicate=true
const otcDup = await fn(token, 'onTraineeCreated', { data: newTrainee });
log('ON_TRAINEE_CREATED_DUPLICATE', { duplicate: otcDup?.duplicate, sent: otcDup?.sent });

// Run queue worker to deliver invite
await new Promise(r => setTimeout(r, 1000));
const worker1 = await fn(token, 'whatsAppQueueWorker', {});
log('WORKER_AFTER_INVITE', worker1?.data || worker1);

// Check queue record for invite
await new Promise(r => setTimeout(r, 1000));
const inviteQueue = await getQueue(token, TEST_PHONE_E164);
const inviteRecord = inviteQueue.find(q => q.idempotency_key === inviteIdempKey);
log('INVITE_QUEUE_RECORD', inviteRecord ? {
  id:       inviteRecord.id,
  status:   inviteRecord.status,
  template: inviteRecord.template_key,
  sent_at:  inviteRecord.sent_at,
  attempts: inviteRecord.attempts,
  error:    inviteRecord.error || null,
} : 'NOT_FOUND');

// Screenshot: queue state
const browser = await chromium.launch({ headless: true });
const ctx1 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page1 = await ctx1.newPage();
// Capture a visual summary of the queue record
const summaryHtml = `
<html><body style="font-family:monospace;padding:20px;background:#0f172a;color:#94a3b8">
<h2 style="color:#22d3ee">TEST 1 — onTraineeCreated Queue Invite</h2>
<table style="border-collapse:collapse;width:100%">
${[
  ['Trigger', 'onTraineeCreated called after trainee creation'],
  ['Trainee ID', newTrainee.id],
  ['Phone (raw)', TEST_PHONE],
  ['Phone (chatId)', invitePhone || 'MISSING'],
  ['Idempotency key', inviteIdempKey || 'MISSING'],
  ['Queue ID', inviteQueueId || 'MISSING'],
  ['Queue status', inviteRecord?.status || 'NOT_FOUND'],
  ['sent_at', inviteRecord?.sent_at || 'NULL'],
  ['Duplicate call', otcDup?.duplicate ? 'TRUE ✅' : 'FALSE ❌'],
  ['NotificationPrefs created', prefs ? 'YES ✅' : 'NO ❌'],
  ['All reminders OFF', prefs && !prefs.whatsapp_reminders_enabled ? 'YES ✅' : 'NO ❌'],
].map(([k,v]) => `<tr><td style="padding:8px;border:1px solid #334155;color:#e2e8f0">${k}</td><td style="padding:8px;border:1px solid #334155;color:${v?.includes('MISSING')||v?.includes('NO')||v?.includes('NOT_FOUND') ? '#f87171' : '#4ade80'}">${v}</td></tr>`).join('')}
</table></body></html>`;
await page1.setContent(summaryHtml);
await page1.screenshot({ path: shot('test1-invite-queue.png'), fullPage: true });
await ctx1.close();

// ── TEST 2: sendWelcomeWhatsApp — first login via invite link ───────────────
log('=== TEST 2: sendWelcomeWhatsApp ===', '');

// First: get the invite token from the trainee record
const updatedTrainee = await fetch(`${API}/api/entities/Trainee/${newTrainee.id}`, {
  headers: { Authorization: `Bearer ${token}` },
}).then(r => r.json()).catch(() => null);
const inviteToken = updatedTrainee?.invite_token;
log('INVITE_TOKEN_FROM_DB', inviteToken ? inviteToken.slice(0, 10) + '...' : 'MISSING');

// Simulate first login via invite link → /api/auth/invite/:token/login
let welcomeTriggeredByServer = false;
let welcomeQueueRecord = null;
if (inviteToken) {
  const loginRes = await fetch(`${API}/api/auth/invite/${inviteToken}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const loginData = await loginRes.json();
  log('INVITE_LOGIN_RESULT', { ok: loginData.ok, has_password: loginData.has_password, trainee_name: loginData.trainee_name });
  welcomeTriggeredByServer = loginData.ok === true;
}

// Give server time to enqueue welcome
await new Promise(r => setTimeout(r, 2000));

// Run queue worker
const worker2 = await fn(token, 'whatsAppQueueWorker', {});
log('WORKER_AFTER_WELCOME', worker2?.data || worker2);

// Check for welcome queue record
await new Promise(r => setTimeout(r, 1000));
const welcomeQueue = await getQueue(token, TEST_PHONE_E164);
welcomeQueueRecord = welcomeQueue.find(q => q.idempotency_key === `welcome:${newTrainee.id}`);
log('WELCOME_QUEUE_RECORD', welcomeQueueRecord ? {
  id:           welcomeQueueRecord.id,
  status:       welcomeQueueRecord.status,
  template_key: welcomeQueueRecord.template_key,
  context_type: welcomeQueueRecord.context_type,
  sent_at:      welcomeQueueRecord.sent_at,
  attempts:     welcomeQueueRecord.attempts,
  error:        welcomeQueueRecord.error || null,
} : 'NOT_FOUND');

// Test idempotency: call sendWelcomeWhatsApp again — should be duplicate
const welcomeDup = await fn(token, 'sendWelcomeWhatsApp', { trainee_id: newTrainee.id });
log('WELCOME_DUPLICATE_CHECK', { duplicate: welcomeDup?.duplicate, sent: welcomeDup?.sent });

// Screenshot: welcome queue state
const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page2 = await ctx2.newPage();
const welcomeHtml = `
<html><body style="font-family:monospace;padding:20px;background:#0f172a;color:#94a3b8">
<h2 style="color:#22d3ee">TEST 2 — sendWelcomeWhatsApp (First Login)</h2>
<table style="border-collapse:collapse;width:100%">
${[
  ['Trigger', 'AccessLink /invite/:token/login (first_login_at was null)'],
  ['Server triggered welcome', welcomeTriggeredByServer ? 'YES ✅' : 'NO ❌'],
  ['Idempotency key', `welcome:${newTrainee.id}`],
  ['Queue ID', welcomeQueueRecord?.id || 'NOT_FOUND'],
  ['Queue status', welcomeQueueRecord?.status || 'NOT_FOUND'],
  ['context_type', welcomeQueueRecord?.context_type || 'NOT_FOUND'],
  ['sent_at', welcomeQueueRecord?.sent_at || 'NULL'],
  ['Duplicate call', welcomeDup?.duplicate ? 'TRUE ✅' : 'FALSE ❌'],
].map(([k,v]) => `<tr><td style="padding:8px;border:1px solid #334155;color:#e2e8f0">${k}</td><td style="padding:8px;border:1px solid #334155;color:${(v?.toString().includes('NOT_FOUND')||v?.toString().includes('NO ❌')||v==='FALSE ❌') ? '#f87171' : '#4ade80'}">${v}</td></tr>`).join('')}
</table></body></html>`;
await page2.setContent(welcomeHtml);
await page2.screenshot({ path: shot('test2-welcome-queue.png'), fullPage: true });
await ctx2.close();

// ── TEST 3: Reminder consent — enable + run batch + worker ──────────────────
log('=== TEST 3: Reminder consent + batch ===', '');

// Enable all reminder types for test trainee
const enableConsent = await fn(token, 'updateAutomationConsent', {
  trainee_id: newTrainee.id,
  preferences: {
    whatsapp_reminders_enabled:   true,
    workout_reminders_enabled:    true,
    nutrition_reminders_enabled:  true,
    water_reminders_enabled:      true,
    weigh_in_reminders_enabled:   true,
    inactivity_reminders_enabled: true,
  },
});
log('CONSENT_ENABLED', enableConsent?.id ? 'YES' : 'FAILED');

// Run batch dry-run to see what would fire for test trainee
const dryRun = await fn(token, 'runReminderBatch', { dry_run: true });
const dryForTest = (dryRun?.data?.report || []).filter(r => r.trainee === TEST_EMAIL);
log('DRY_RUN_FOR_TEST', dryForTest.length ? dryForTest : 'no entries (trainee may be inactive or no phone match)');
log('DRY_RUN_TIME', dryRun?.data?.israel_time);

// Run inactivity_reminder (no time window restriction)
const batchInactivity = await fn(token, 'runReminderBatch', { types: ['inactivity_reminder'] });
const inactivityForTest = (batchInactivity?.data?.report || []).filter(r => r.trainee === TEST_EMAIL);
log('INACTIVITY_BATCH', { totals: batchInactivity?.data?.totals, for_test: inactivityForTest });

// Run queue worker
const worker3 = await fn(token, 'whatsAppQueueWorker', {});
log('WORKER_AFTER_REMINDER', worker3?.data || worker3);

// Check queue for reminder
await new Promise(r => setTimeout(r, 1000));
const reminderQueue = await getQueue(token, TEST_PHONE_E164);
const reminderRecord = reminderQueue.find(q => q.context_type === 'automation' && q.template_key === 'inactivity_nudge');
log('REMINDER_QUEUE_RECORD', reminderRecord ? {
  id:           reminderRecord.id,
  status:       reminderRecord.status,
  template_key: reminderRecord.template_key,
  context_type: reminderRecord.context_type,
  sent_at:      reminderRecord.sent_at,
  attempts:     reminderRecord.attempts,
} : 'NOT_FOUND (trainee may not be inactive enough or batch ran before)');

// Screenshot reminder test
const ctx3 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page3 = await ctx3.newPage();
const reminderHtml = `
<html><body style="font-family:monospace;padding:20px;background:#0f172a;color:#94a3b8">
<h2 style="color:#22d3ee">TEST 3 — Reminder Consent + Batch</h2>
<table style="border-collapse:collapse;width:100%">
${[
  ['Consent enabled', enableConsent?.id ? 'YES ✅' : 'NO ❌'],
  ['Israel time at batch', dryRun?.data?.israel_time || '?'],
  ['Dry-run entries for test', dryForTest.length > 0 ? JSON.stringify(dryForTest.map(r=>({type:r.type,result:r.result}))) : 'NONE (new trainee, no activity history)'],
  ['Inactivity batch totals', JSON.stringify(batchInactivity?.data?.totals)],
  ['Inactivity for test trainee', inactivityForTest.length > 0 ? JSON.stringify(inactivityForTest[0]) : 'SKIP (recently created = recently active)'],
  ['Worker processed', worker3?.data?.processed],
  ['Reminder queue record', reminderRecord?.status || 'NOT_FOUND (expected — new trainee recently active)'],
].map(([k,v]) => `<tr><td style="padding:8px;border:1px solid #334155;color:#e2e8f0">${k}</td><td style="padding:8px;border:1px solid #334155;color:#94a3b8">${v}</td></tr>`).join('')}
</table></body></html>`;
await page3.setContent(reminderHtml);
await page3.screenshot({ path: shot('test3-reminder-consent.png'), fullPage: true });
await ctx3.close();

await browser.close();

// ─── Final table ──────────────────────────────────────────────────────────────
const t1_invite_queued   = !!(otcResult?.ok && (inviteQueueId));
const t1_invite_sent     = inviteRecord?.status === 'sent';
const t1_no_duplicate    = otcDup?.duplicate === true;
const t1_prefs_created   = !!prefs;
const t1_prefs_off       = prefs && !prefs.whatsapp_reminders_enabled;

const t2_welcome_queued  = !!welcomeQueueRecord;
const t2_welcome_sent    = welcomeQueueRecord?.status === 'sent';
const t2_no_duplicate    = welcomeDup?.duplicate === true;

const t3_consent_enabled = !!enableConsent?.id;

const allPhoneNorm = invitePhone === '972535716559@c.us';

console.log('\n═══════════════════════════════════════════════════════════════════════════════');
console.log('WHATSAPP TRIGGER VERIFICATION TABLE');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('Trigger              | Queue ID                   | Green idMessage | Dup? | PASS/FAIL');
console.log('---------------------|----------------------------|-----------------|------|----------');

const rows = [
  ['Phone normalization',   `chatId=${invitePhone||'?'}`,    'N/A',  'N/A',                     allPhoneNorm ? 'PASS' : 'FAIL'],
  ['onTraineeCreated',      inviteQueueId?.slice(-8)||'?',   t1_invite_sent?'sent via queue':'queued', t1_no_duplicate?'NO':'CHECK', (t1_invite_queued&&t1_invite_sent&&t1_no_duplicate)?'PASS':'PARTIAL'],
  ['Invite idempotency',    inviteIdempKey?.slice(-15)||'?', 'N/A',  t1_no_duplicate?'YES ✅':'NO ❌',  t1_no_duplicate?'PASS':'FAIL'],
  ['NotificationPrefs OFF', newTrainee.id?.slice(-8)||'?',   'N/A',  'N/A',                     (t1_prefs_created&&t1_prefs_off)?'PASS':'FAIL'],
  ['sendWelcomeWhatsApp',   welcomeQueueRecord?.id?.slice(-8)||'?', t2_welcome_sent?'sent via queue':'queued||missing', t2_no_duplicate?'NO':'CHECK', (t2_welcome_queued&&t2_welcome_sent&&t2_no_duplicate)?'PASS':(t2_welcome_queued?'PARTIAL':'FAIL')],
  ['Welcome idempotency',   `welcome:${newTrainee.id?.slice(-8)}`, 'N/A', t2_no_duplicate?'YES ✅':'NO ❌', t2_no_duplicate?'PASS':'FAIL'],
  ['Consent blocked→on',    enableConsent?.id?.slice(-8)||'?', 'N/A', 'N/A',                    t3_consent_enabled?'PASS':'FAIL'],
];

for (const [t,q,idm,dup,v] of rows) {
  const pad = (s,n) => String(s||'').substring(0,n).padEnd(n);
  console.log(`${pad(t,21)}| ${pad(q,27)}| ${pad(idm,16)}| ${pad(dup,5)}| ${v}`);
}

const allPass = t1_invite_queued && t1_invite_sent && t1_no_duplicate && t1_prefs_created && t1_prefs_off
             && t2_welcome_queued && t2_welcome_sent && t2_no_duplicate && t3_consent_enabled && allPhoneNorm;

console.log('\n═══════════════════════════════════════════════════════════════════════════════');
console.log('Phone:  0535716559 →', invitePhone);
console.log('Invite queue status:', inviteRecord?.status || 'NOT_FOUND');
console.log('Welcome queue status:', welcomeQueueRecord?.status || 'NOT_FOUND');
console.log('All reminders OFF by default:', (t1_prefs_created && t1_prefs_off) ? 'YES' : 'NO');
console.log('Consent re-enable works:', t3_consent_enabled ? 'YES' : 'NO');
console.log('');
console.log(allPass ? 'FINAL VERDICT: WHATSAPP_TRIGGERS_READY' : 'FINAL VERDICT: WHATSAPP_TRIGGERS_NOT_READY');

if (!allPass) {
  if (!t1_invite_queued || !t1_invite_sent) console.log('  ❌ invite not queued/sent');
  if (!t1_no_duplicate) console.log('  ❌ invite idempotency failed');
  if (!t1_prefs_created) console.log('  ❌ NotificationPreferences not created');
  if (!t2_welcome_queued) console.log('  ❌ welcome not queued');
  if (!t2_welcome_sent) console.log('  ❌ welcome not sent by worker');
  if (!t2_no_duplicate) console.log('  ❌ welcome idempotency failed');
}
console.log('═══════════════════════════════════════════════════════════════════════════════');
