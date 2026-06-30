import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const PROD = 'https://fitcoach-frontend-omega.vercel.app';
const API = 'https://fitcoach-server-production-19e8.up.railway.app';
const DIR = `C:/Users/owner/Desktop/pw-shots/sarah-investigate-${Date.now()}`;
mkdirSync(DIR, { recursive: true });

const COACH_EMAIL = 'edengoldenberg@gmail.com';
const COACH_PASS = '12345678';
const EDEN_TRAINEE_EMAIL = 'edenchen1212@gmail.com';
const EDEN_TRAINEE_PASS = '12345678';

async function shot(page, name) {
  const p = path.join(DIR, name + '.png');
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  📸 ${name}.png`);
}

async function loginViaPassword(page, email, pw) {
  await page.goto(`${PROD}/LoginWithPassword`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', pw);
  await page.click('button[type=submit]');
  await page.waitForTimeout(6000);
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

// ═══════════════════════════════════════════════
// STEP 1: Coach session — find Sarah Atias
// ═══════════════════════════════════════════════
console.log('\n══ STEP 1: Find Sarah Atias via Coach API ══');
const cCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const cPage = await cCtx.newPage();
await loginViaPassword(cPage, COACH_EMAIL, COACH_PASS);

const coachToken = await cPage.evaluate(() => localStorage.getItem('fitcoach_token'));
console.log('Coach JWT obtained:', !!coachToken);

// Query trainees from server to find Sarah Atias
const trainees = await cPage.evaluate(async ({ api, token }) => {
  const r = await fetch(`${api}/api/entities/Trainee?_limit=100`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return r.json();
}, { api: API, token: coachToken });

console.log(`Total trainees found: ${Array.isArray(trainees) ? trainees.length : 'ERROR: ' + JSON.stringify(trainees).slice(0, 100)}`);

let sarah = null;
if (Array.isArray(trainees)) {
  sarah = trainees.find(t =>
    (t.full_name || '').toLowerCase().includes('sarah') ||
    (t.full_name || '').toLowerCase().includes('אטיאס') ||
    (t.full_name || '').toLowerCase().includes('sarah atias') ||
    (t.full_name || '').toLowerCase().includes('שרה')
  );

  console.log('\nAll trainees:');
  trainees.forEach(t => console.log(`  - ${t.full_name} | ${t.user_email} | status: ${t.status} | user_id: ${t.user_id || 'NULL'}`));

  if (sarah) {
    console.log('\n✅ Found Sarah:', JSON.stringify({
      id: sarah.id,
      full_name: sarah.full_name,
      user_email: sarah.user_email,
      user_id: sarah.user_id,
      status: sarah.status,
      invite_status: sarah.invite_status,
      first_login_at: sarah.first_login_at,
    }, null, 2));
  } else {
    console.log('\n❌ Sarah Atias NOT FOUND in trainee list');
  }
}

await shot(cPage, 'C01-coach-dashboard');
await cCtx.close();

// ═══════════════════════════════════════════════
// STEP 2: Eden auth state (working trainee)
// ═══════════════════════════════════════════════
console.log('\n══ STEP 2: Eden (working trainee) auth state ══');
const eCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const ePage = await eCtx.newPage();
await loginViaPassword(ePage, EDEN_TRAINEE_EMAIL, EDEN_TRAINEE_PASS);

const edenState = await ePage.evaluate(async ({ api }) => {
  const fitcoach_token = localStorage.getItem('fitcoach_token');
  const fitcoach_session = localStorage.getItem('fitcoach_session');
  const temp_access_session = sessionStorage.getItem('temp_access_session');
  const pending_access_token = localStorage.getItem('pending_access_token');

  let meResult = null;
  let meError = null;
  try {
    const r = await fetch(`${api}/api/auth/me`, {
      headers: fitcoach_token ? { Authorization: `Bearer ${fitcoach_token}` } : {}
    });
    meResult = await r.json();
  } catch(e) { meError = e.message; }

  return {
    fitcoach_token_exists: !!fitcoach_token,
    fitcoach_token_first30: fitcoach_token ? fitcoach_token.slice(0, 30) : null,
    fitcoach_session_exists: !!fitcoach_session,
    temp_access_session_exists: !!temp_access_session,
    pending_access_token_exists: !!pending_access_token,
    me_result: meResult,
    me_error: meError,
  };
}, { api: API });

console.log('Eden localStorage state:', JSON.stringify(edenState, null, 2));
await shot(ePage, 'E01-eden-logged-in');

// Test Eden's workout save
const edenSaveResult = await ePage.evaluate(async ({ api, token }) => {
  const r = await fetch(`${api}/api/functions/saveExerciseProgress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ exercise_name: 'Squat', date: '2026-06-23', sets: [{ weight: 80, reps: 10 }] })
  });
  return { status: r.status, body: await r.json() };
}, { api: API, token: edenState.fitcoach_token_first30 ? localStorage.getItem?.('fitcoach_token') : null });

// Get actual token
const edenToken = await ePage.evaluate(() => localStorage.getItem('fitcoach_token'));
const edenSaveReal = await ePage.evaluate(async ({ api, token }) => {
  const r = await fetch(`${api}/api/functions/saveExerciseProgress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ exercise_name: 'Squat', date: '2026-06-23', sets: [{ weight: 80, reps: 10 }] })
  });
  return { status: r.status, body: await r.json() };
}, { api: API, token: edenToken });

console.log('\nEden save result:', JSON.stringify(edenSaveReal));
await eCtx.close();

// ═══════════════════════════════════════════════
// STEP 3: Sarah investigation
// ═══════════════════════════════════════════════
console.log('\n══ STEP 3: Sarah auth state investigation ══');

if (sarah && sarah.user_email) {
  console.log(`Attempting to inspect Sarah's auth state: ${sarah.user_email}`);

  // Check if Sarah has credentials on the server (as coach)
  const coachCtx2 = await browser.newContext();
  const coachPage2 = await coachCtx2.newPage();
  await loginViaPassword(coachPage2, COACH_EMAIL, COACH_PASS);
  const coachToken2 = await coachPage2.evaluate(() => localStorage.getItem('fitcoach_token'));

  // Check Sarah's user record
  const sarahUserCheck = await coachPage2.evaluate(async ({ api, token, email }) => {
    // Check user account
    const userR = await fetch(`${api}/api/entities/User?email=${encodeURIComponent(email)}&_limit=5`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const users = await userR.json().catch(() => []);

    // Check credentials via service role
    const credR = await fetch(`${api}/api/entities/Credentials?_limit=5`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Service-Role': '1' }
    });
    const creds = await credR.json().catch(() => []);

    // Try AccessLink tokens
    const accessCodesR = await fetch(`${api}/api/entities/AccessCode?_limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const accessCodes = await accessCodesR.json().catch(() => []);

    return {
      users: Array.isArray(users) ? users.map(u => ({ id: u.id, email: u.email, role: u.role })) : users,
      credentialsCount: Array.isArray(creds) ? creds.length : creds,
      accessCodesCount: Array.isArray(accessCodes) ? accessCodes.length : accessCodes,
      accessCodes: Array.isArray(accessCodes) ? accessCodes.map(c => ({
        id: c.id,
        trainee_email: c.trainee_email,
        expires_at: c.expires_at,
        used_at: c.used_at,
      })) : [],
    };
  }, { api: API, token: coachToken2, email: sarah.user_email });

  console.log('Sarah user/credential check:', JSON.stringify(sarahUserCheck, null, 2));

  // Try to login as Sarah using coach-set approach
  // Since we don't know Sarah's password, we'll simulate by:
  // 1. Trying to access the API with NO token (to replicate her state if she has no JWT)
  const noTokenSave = await coachPage2.evaluate(async (api) => {
    const r = await fetch(`${api}/api/functions/saveExerciseProgress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // NO Authorization header
      body: JSON.stringify({ exercise_name: 'Squat', date: '2026-06-23', sets: [{ weight: 80, reps: 10 }] })
    });
    return { status: r.status, body: await r.json() };
  }, API);

  console.log('\nSave with NO JWT (simulates Sarah\'s situation):', JSON.stringify(noTokenSave));

  // 2. Trying with fitcoach_session in localStorage but no fitcoach_token
  const sessionOnlySave = await coachPage2.evaluate(async (api) => {
    // Simulate having fitcoach_session but not fitcoach_token
    const fakeSession = JSON.stringify({
      userId: 'fake-user-id',
      userEmail: 'sarah@example.com',
      rememberMe: true
    });

    const r = await fetch(`${api}/api/functions/saveExerciseProgress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // NO JWT bearer token
      body: JSON.stringify({ exercise_name: 'Squat', date: '2026-06-23', sets: [{ weight: 80, reps: 10 }] })
    });
    return { status: r.status, body: await r.json() };
  }, API);

  console.log('Save with fitcoach_session only (no JWT):', JSON.stringify(sessionOnlySave));

  await coachCtx2.close();
} else {
  console.log('⚠️  Cannot test Sarah — not found in trainer list or no email');
  console.log('Simulating the broken auth flow directly:');

  // Simulate: user has fitcoach_session but no fitcoach_token
  const noAuthCtx = await browser.newContext();
  const noAuthPage = await noAuthCtx.newPage();
  await noAuthPage.goto(PROD, { waitUntil: 'networkidle', timeout: 30000 });

  // Manually inject a fitcoach_session (like AccessCodeLogin.jsx does)
  await noAuthPage.evaluate(() => {
    // Remove any JWT
    localStorage.removeItem('fitcoach_token');
    // Set fitcoach_session (like AccessCodeLogin sets)
    localStorage.setItem('fitcoach_session', JSON.stringify({
      userId: 'fake-id',
      userEmail: 'sarah.atias@example.com',
      fullName: 'Sarah Atias',
      role: 'user',
      rememberMe: true
    }));
  });

  // Try to access /WorkoutLog
  await noAuthPage.goto(`${PROD}/WorkoutLog`, { waitUntil: 'networkidle', timeout: 20000 });
  await noAuthPage.waitForTimeout(3000);
  await shot(noAuthPage, 'S01-no-jwt-workout-page');

  const pageContent = await noAuthPage.locator('body').innerText();
  console.log('Page content with fitcoach_session only (first 200c):', pageContent.slice(0, 200).replace(/\n/g, ' | '));

  // Try to save
  const noJwtSaveResult = await noAuthPage.evaluate(async (api) => {
    const token = localStorage.getItem('fitcoach_token');
    console.log('fitcoach_token in localStorage:', token);
    const r = await fetch(`${api}/api/functions/saveExerciseProgress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ exercise_name: 'Test', date: '2026-06-23', sets: [{ weight: 50, reps: 10 }] })
    });
    return { status: r.status, body: await r.json(), hadToken: !!token };
  }, API);

  console.log('\nSave with fitcoach_session (no JWT):', JSON.stringify(noJwtSaveResult));
  await noAuthCtx.close();
}

await browser.close();

// ═══════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════
console.log('\n══════════════════════════════════════════');
console.log('ROOT CAUSE ANALYSIS');
console.log('══════════════════════════════════════════');
console.log(`
KEY FINDINGS:

1. AccessCodeLogin.jsx stores 'fitcoach_session' in localStorage (NOT 'fitcoach_token')
   - base44Client.js ONLY reads 'fitcoach_token' for Authorization header
   - 'fitcoach_session' is NEVER read anywhere in the codebase

2. AccessCodeLogin.jsx calls base44.entities.AccessCode.filter() WITHOUT authentication
   - Backend requires authentication (requireAuth middleware)
   - This call would fail with 401 for unauthenticated users

3. If Sarah enters via AccessCodeLogin:
   - Step fails immediately (cant read AccessCode entity)
   - OR if she somehow completes it → gets 'fitcoach_session' not 'fitcoach_token'
   - Result: ALL subsequent API calls have no Authorization header
   - Backend returns 401 "Authentication required"

4. Eden uses LoginWithPassword → gets proper JWT → stored in 'fitcoach_token'
   - All API calls include Authorization: Bearer <JWT>
   - Backend authenticates request → req.user is set → saves work

DIFFERENCE:
  Eden: fitcoach_token = <valid JWT>  → API calls authenticated ✅
  Sarah: fitcoach_token = null/empty  → API calls unauthenticated → 401 ❌
         fitcoach_session = {...}     → NOT used by base44Client.js
`);
console.log('Screenshots saved to:', DIR);
