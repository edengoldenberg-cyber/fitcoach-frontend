/**
 * Full new-trainee flow — production end-to-end.
 * API calls via Node.js fetch; UI steps via Playwright.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const PROD = 'https://fitcoach-frontend-omega.vercel.app';
const API  = 'https://fitcoach-server-production-19e8.up.railway.app';
const DIR  = `C:/Users/owner/Desktop/pw-shots/new-trainee-${Date.now()}`;
mkdirSync(DIR, { recursive: true });

const COACH_EMAIL = 'edengoldenberg@gmail.com';
const COACH_PASS  = '12345678';

const TS            = Date.now();
const TRAINEE_EMAIL = `e2e-${TS}@fitcoach-test.local`;
const TRAINEE_NAME  = `E2E Trainee ${TS.toString().slice(-5)}`;
const TRAINEE_PHONE = '0541234567';
const TRAINEE_PASS  = `Fit${TS.toString().slice(-4)}!A`;

let stepNum = 0;
const results = {};
function step(label) {
  stepNum++;
  console.log(`\n[STEP ${stepNum}] ${label}`);
  return stepNum;
}

async function shot(page, label) {
  const name = `${String(stepNum).padStart(2,'0')}-${label}.png`;
  const p = path.join(DIR, name);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  📸 ${name}`);
  return name;
}

async function apiFetch(method, path2, body, token, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path2}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

// ══════════════════════════════════════════════════════
// STEP 1 — Coach logs in (UI)
// ══════════════════════════════════════════════════════
step('Coach logs in');
const cCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const cPage = await cCtx.newPage();
await cPage.goto(`${PROD}/LoginWithPassword`, { waitUntil: 'networkidle', timeout: 30000 });
await cPage.fill('input[type=email]', COACH_EMAIL);
await cPage.fill('input[type=password]', COACH_PASS);
await shot(cPage, 'coach-login');
await cPage.click('button[type=submit]');
await cPage.waitForTimeout(6000);
await shot(cPage, 'coach-dashboard');
results.s1_coach_login = cPage.url().includes('CoachDashboard') ? 'PASS' : 'FAIL';
console.log('  URL:', cPage.url(), '→', results.s1_coach_login);
const coachToken = await cPage.evaluate(() => localStorage.getItem('fitcoach_token'));
console.log('  Coach JWT:', !!coachToken);
await cCtx.close();

// ══════════════════════════════════════════════════════
// STEP 2 — Create User + Trainee records (Node.js API)
// ══════════════════════════════════════════════════════
step(`Create trainee user: ${TRAINEE_EMAIL}`);

const userResp = await apiFetch('POST', '/api/entities/User', {
  email: TRAINEE_EMAIL, full_name: TRAINEE_NAME, role: 'user'
}, coachToken);
const userId = userResp.data.id;
console.log('  User created:', userId ? 'YES' : 'NO', userId?.slice(0,12));
if (!userId) { console.error('  ERR:', JSON.stringify(userResp)); }

// Generate a 48-char hex invite token
const inviteToken = Array.from({ length: 24 }, () =>
  Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');

step('Create Trainee record with invite_token');
const traineeResp = await apiFetch('POST', '/api/entities/Trainee', {
  user_id:       userId,
  user_email:    TRAINEE_EMAIL,
  full_name:     TRAINEE_NAME,
  phone:         TRAINEE_PHONE,
  coach_email:   COACH_EMAIL,
  status:        'active',
  invite_token:  inviteToken,
  invite_status: 'invited',
}, coachToken);
const traineeId = traineeResp.data.id;
console.log('  Trainee created:', traineeId ? 'YES' : 'NO', traineeId?.slice(0,12));
if (!traineeId) { console.error('  ERR:', JSON.stringify(traineeResp)); }
results.s2_trainee_created = traineeId ? 'PASS' : 'FAIL';

// ══════════════════════════════════════════════════════
// STEP 3 — Send WhatsApp invite (API)
// ══════════════════════════════════════════════════════
const INVITE_URL = `${PROD}/AccessLink?token=${inviteToken}`;
step(`Send WhatsApp to ${TRAINEE_PHONE} | link: ${INVITE_URL}`);
const waResp = await apiFetch('POST', '/api/functions/sendTraineeInviteViaWhatsApp', {
  phone: TRAINEE_PHONE, name: TRAINEE_NAME, invite_link: INVITE_URL
}, coachToken);
console.log('  WhatsApp result:', JSON.stringify(waResp.data));
results.s3_whatsapp = waResp.data?.ok ? (waResp.data?.sent ? 'SENT ✅' : `OK (not sent: ${waResp.data?.error || waResp.data?.not_on_whatsapp ? 'not on WA' : 'other'})`) : `FAILED`;
console.log('  Invite URL trainee receives:', INVITE_URL);

// ══════════════════════════════════════════════════════
// STEP 4 — Validate invite token (public endpoint)
// ══════════════════════════════════════════════════════
step('Validate invite token (public)');
const validateResp = await apiFetch('GET', `/api/auth/invite/${inviteToken}`);
console.log('  Validation response:', JSON.stringify(validateResp.data));
results.s4_token_valid = validateResp.data?.ok ? 'PASS' : 'FAIL';

// ══════════════════════════════════════════════════════
// STEP 5 — Trainee opens invite link (clean browser)
// ══════════════════════════════════════════════════════
step('Trainee opens invite link — fresh browser (no prior auth)');
const tCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const tPage = await tCtx.newPage();

// Capture the auto-login API call
const autoLoginCalls = [];
tPage.on('response', async resp => {
  if (resp.url().includes('/invite/') && resp.url().includes('/login')) {
    try {
      const body = await resp.json();
      autoLoginCalls.push({ status: resp.status(), ok: body.ok, hasToken: !!body.access_token });
    } catch { /* */ }
  }
});

await tPage.goto(INVITE_URL, { waitUntil: 'networkidle', timeout: 40000 });
await tPage.waitForTimeout(4000);
await shot(tPage, 'trainee-accesslink-opened');
const urlAfterOpen = tPage.url();
console.log('  URL after AccessLink:', urlAfterOpen);
console.log('  Auto-login API calls:', JSON.stringify(autoLoginCalls));
results.s5_no_redirect_to_login = !urlAfterOpen.includes('LoginWithPassword') ? 'PASS' : 'FAIL';
console.log('  Stays off LoginWithPassword:', results.s5_no_redirect_to_login);

// ══════════════════════════════════════════════════════
// STEP 6 — Check fitcoach_token in localStorage
// ══════════════════════════════════════════════════════
step('fitcoach_token exists in localStorage');
const traineeJWT = await tPage.evaluate(() => localStorage.getItem('fitcoach_token'));
console.log('  fitcoach_token:', traineeJWT ? `FOUND (${traineeJWT.slice(0,30)}...)` : 'MISSING');
results.s6_jwt_in_storage = traineeJWT ? 'PASS' : 'FAIL';
await shot(tPage, 'trainee-localStorage-check');

// ══════════════════════════════════════════════════════
// STEP 7 — Verify JWT is valid
// ══════════════════════════════════════════════════════
step('Verify JWT — call auth/me');
let meResp = null;
if (traineeJWT) {
  const r = await apiFetch('GET', '/api/auth/me', null, traineeJWT);
  meResp = r.data;
  console.log('  auth/me:', JSON.stringify(meResp));
  results.s7_jwt_valid = meResp?.email === TRAINEE_EMAIL ? 'PASS' : 'FAIL';
} else {
  results.s7_jwt_valid = 'FAIL (no token)';
}

// ══════════════════════════════════════════════════════
// STEP 8 — SetPassword page
// ══════════════════════════════════════════════════════
step('SetPassword page opens');
await tPage.waitForTimeout(2000);
const setPassUrl = tPage.url();
console.log('  Current URL:', setPassUrl);
results.s8_setpassword = setPassUrl.includes('SetPassword') ? 'PASS' : 'FAIL';
await shot(tPage, 'trainee-setpassword-page');

const pwText = await tPage.locator('body').innerText();
console.log('  Page text (150c):', pwText.slice(0, 150).replace(/\n/g, ' | '));

// ══════════════════════════════════════════════════════
// STEP 9 — Set password
// ══════════════════════════════════════════════════════
step(`Set password: ${TRAINEE_PASS}`);
const pwFields = tPage.locator('input[type=password]');
const pwCount  = await pwFields.count();
console.log('  Password fields:', pwCount);

if (pwCount >= 2) {
  await pwFields.first().fill(TRAINEE_PASS);
  await pwFields.nth(1).fill(TRAINEE_PASS);
  await shot(tPage, 'trainee-password-filled');

  const saveBtn = tPage.locator('button').filter({ hasText: /שמור|כנס/ }).first();
  if (await saveBtn.count() > 0) {
    await saveBtn.click();
    await tPage.waitForTimeout(6000);
  }
  await shot(tPage, 'trainee-after-save-password');
  const afterUrl = tPage.url();
  console.log('  URL after password save:', afterUrl);
  results.s9_password_set = !afterUrl.includes('SetPassword') ? 'PASS' : 'FAIL (still on SetPassword)';
} else {
  console.log('  Page text for debug:', pwText.slice(0, 300));
  results.s9_password_set = `FAIL (${pwCount} fields found)`;
}

// ══════════════════════════════════════════════════════
// STEP 10 — TraineeHome
// ══════════════════════════════════════════════════════
step('TraineeHome reached');
await tPage.waitForTimeout(2000);
const homeUrl = tPage.url();
const homeText = await tPage.locator('body').innerText();
console.log('  URL:', homeUrl);
console.log('  Content (100c):', homeText.slice(0, 100).replace(/\n/g, ' | '));
results.s10_home = (homeText.includes('FIT COACH') || homeText.includes('בית') || homeText.includes('אימון')) ? 'PASS' : 'FAIL';
await shot(tPage, 'trainee-home');

// ══════════════════════════════════════════════════════
// STEP 11 — Save a workout exercise
// ══════════════════════════════════════════════════════
step('Trainee saves a workout');
const finalJWT = await tPage.evaluate(() => localStorage.getItem('fitcoach_token'));
if (finalJWT) {
  const wSave = await apiFetch('POST', '/api/functions/saveExerciseProgress', {
    exercise_name: 'E2E Push-Up',
    date: new Date().toISOString().slice(0, 10),
    sets: [{ weight: 0, reps: 20 }, { weight: 0, reps: 18 }]
  }, finalJWT);
  console.log('  Workout save:', JSON.stringify(wSave.data));
  results.s11_workout = wSave.data?.data?.success ? 'PASS' : `FAIL (${JSON.stringify(wSave.data)})`;
} else {
  results.s11_workout = 'FAIL (no JWT)';
}
await shot(tPage, 'trainee-workout-saved');

await tCtx.close();

// ══════════════════════════════════════════════════════
// CLEANUP
// ══════════════════════════════════════════════════════
if (traineeId) {
  await apiFetch('PUT', `/api/entities/Trainee/${traineeId}`, { status: 'deleted' }, coachToken);
}
if (userId) {
  await apiFetch('PUT', `/api/entities/User/${userId}`,
    { email: `deleted-${TS}@cleanup.local` }, coachToken, { 'X-Service-Role': '1' });
}
console.log('\n  Test records cleaned up.');

await browser.close();

// ══════════════════════════════════════════════════════
// FINAL REPORT
// ══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════');
console.log('FINAL REPORT — NEW TRAINEE E2E');
console.log(`Trainee: ${TRAINEE_EMAIL}`);
console.log(`Invite:  ${INVITE_URL}`);
console.log('═══════════════════════════════════════════════════════════');

const table = [
  ['S1',  'Coach logs in',                    results.s1_coach_login],
  ['S2',  'Trainee created (user + record)',   results.s2_trainee_created],
  ['S3',  'WhatsApp invite sent',              results.s3_whatsapp],
  ['S4',  'Token validates (public endpoint)', results.s4_token_valid],
  ['S5',  'AccessLink: no redirect to login',  results.s5_no_redirect_to_login],
  ['S6',  'fitcoach_token in localStorage',    results.s6_jwt_in_storage],
  ['S7',  'JWT valid — auth/me OK',            results.s7_jwt_valid],
  ['S8',  'SetPassword page opens',            results.s8_setpassword],
  ['S9',  'Password saved',                    results.s9_password_set],
  ['S10', 'TraineeHome reached',               results.s10_home],
  ['S11', 'Workout exercise saved',            results.s11_workout],
];

table.forEach(([s, desc, res]) => {
  const ok = res && (res === 'PASS' || res.startsWith('SENT') || res.startsWith('OK'));
  console.log(`  ${ok ? '✅' : '❌'}  ${s.padEnd(4)} ${desc.padEnd(40)} ${res}`);
});

const crit = ['s1_coach_login','s2_trainee_created','s4_token_valid','s5_no_redirect_to_login',
              's6_jwt_in_storage','s7_jwt_valid','s8_setpassword','s9_password_set',
              's10_home','s11_workout'];
const allPass = crit.every(k => results[k] === 'PASS');
console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log(allPass ? 'PASS ✅' : 'FAIL ❌');
console.log('═══════════════════════════════════════════════════════════');
console.log('Screenshots:', DIR);
writeFileSync(path.join(DIR, 'results.json'),
  JSON.stringify({ results, invite_url: INVITE_URL, trainee_email: TRAINEE_EMAIL }, null, 2));
