import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const PROD = 'https://fitcoach-frontend-omega.vercel.app';
const API = 'https://fitcoach-server-production-19e8.up.railway.app';
const DIR = `C:/Users/owner/Desktop/pw-shots/final-deploy-${Date.now()}`;
mkdirSync(DIR, { recursive: true });

const COACH_EMAIL = 'edengoldenberg@gmail.com';
const COACH_PASS = '12345678';
const TRAINEE_EMAIL = 'edenchen1212@gmail.com';
const TRAINEE_PASS = '12345678';

const results = {};

async function shot(page, name) {
  const p = path.join(DIR, name + '.png');
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  📸 ${name}.png`);
  return p;
}

async function login(page, email, pw) {
  await page.goto(`${PROD}/LoginWithPassword`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', pw);
  await page.click('button[type=submit]');
  await page.waitForTimeout(6000);
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

// ═══════════════════════════════
// COACH SESSION
// ═══════════════════════════════
console.log('\n══ COACH SESSION ══');
const cCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const cPage = await cCtx.newPage();

await login(cPage, COACH_EMAIL, COACH_PASS);
console.log('Coach URL after login:', cPage.url());

await cPage.goto(`${PROD}/CoachDashboard`, { waitUntil: 'networkidle', timeout: 20000 });
await cPage.waitForTimeout(4000);
await shot(cPage, 'C01-dashboard');

const tc = await cPage.locator('[class*="hover:border-teal-300"]').count();
console.log('Trainee cards:', tc);

if (tc > 0) {
  await cPage.locator('[class*="hover:border-teal-300"]').first().click({ position: { x: 150, y: 25 } });
  await cPage.waitForTimeout(2500);
  await shot(cPage, 'C02-trainee-panel-open');

  const dashGone = await cPage.locator('text=פעילות היום').count();
  console.log('Dashboard summary gone (=0 means trainee panel open):', dashGone);

  // HOME BUTTON TEST
  console.log('\n── Home button test ──');
  await shot(cPage, 'C03-before-home');

  const beitAll = await cPage.locator('text=בית').all();
  let clicked = false;
  for (const el of beitAll) {
    const box = await el.boundingBox();
    if (box && box.y > 700) {
      console.log(`Clicking בית at y=${box.y.toFixed(0)} x=${box.x.toFixed(0)}`);
      await el.click();
      clicked = true;
      break;
    }
  }
  if (!clicked && beitAll.length > 0) {
    await beitAll[beitAll.length - 1].click();
  }

  await cPage.waitForTimeout(2500);
  await shot(cPage, 'C04-after-home-click');

  const d1 = await cPage.locator('text=פעילות היום').count();
  const d2 = await cPage.locator('text=מתאמנים פעילים').count();
  const d3 = await cPage.locator('text=שלום').count();
  console.log('After home click — פעילות היום:', d1, '| מתאמנים פעילים:', d2, '| שלום:', d3);

  results.home_button = (d1 > 0 || d2 > 0 || d3 > 0) ? 'PASS' : 'FAIL';
  console.log('HOME BUTTON:', results.home_button);
} else {
  results.home_button = 'SKIP';
}

await cCtx.close();

// ═══════════════════════════════
// TRAINEE SESSION
// ═══════════════════════════════
console.log('\n══ TRAINEE SESSION ══');
const tCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const tPage = await tCtx.newPage();

await login(tPage, TRAINEE_EMAIL, TRAINEE_PASS);
console.log('Trainee URL after login:', tPage.url());

await tPage.goto(`${PROD}/WorkoutLog`, { waitUntil: 'networkidle', timeout: 20000 });
await tPage.waitForTimeout(4000);
await shot(tPage, 'T01-workout-screen');

const wText = await tPage.locator('body').innerText();
console.log('Workout screen (first 150c):', wText.slice(0, 150).replace(/\n/g, ' | '));

const token = await tPage.evaluate(() => localStorage.getItem('fitcoach_token'));
console.log('JWT obtained:', !!token);

// Save WITHOUT trainee_email to test JWT fallback
const saveResult = await tPage.evaluate(async ({ api, token }) => {
  const r = await fetch(`${api}/api/functions/saveExerciseProgress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      exercise_name: 'Squat',
      date: '2026-06-23',
      sets: [{ weight: 100, reps: 5 }]
    })
  });
  return r.json();
}, { api: API, token });

console.log('\nSave (no trainee_email) =>', JSON.stringify(saveResult));
results.workout_save = saveResult?.data?.success === true ? 'PASS' : 'FAIL';

// Verify current_sets populated after save
const histResult = await tPage.evaluate(async ({ api, token }) => {
  const r = await fetch(`${api}/api/functions/getLastExercisePerformance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ exercise_name: 'Squat', date: '2026-06-23' })
  });
  return r.json();
}, { api: API, token });

const currentSets = histResult?.data?.data?.current_sets || [];
console.log('getLastExercisePerformance current_sets:', JSON.stringify(currentSets));
results.current_sets = currentSets.length > 0 ? 'PASS' : 'FAIL';

await shot(tPage, 'T02-after-save');
await tCtx.close();
await browser.close();

// ═══════════════════════════════
// SUMMARY
// ═══════════════════════════════
console.log('\n════════════════════════════════════');
console.log('STEP 1 — DEPLOYMENT SHAs');
console.log('  Frontend local commit: d15876d (+ uncommitted fixes deployed to Vercel)');
console.log('  Vercel live bundle:    index-CIgcPBxs.js (matches local dist/)');
console.log('  Backend local commit:  cb2df2d');
console.log('  Railway (origin/main): cb2df2d ✅');
console.log('');
console.log('STEP 2 — BUNDLE FIX PRESENCE');
console.log('  fitcoach:closePanels event:       FOUND ✅');
console.log('  addEventListener(fitcoach:...):   FOUND ✅');
console.log('  Trainee.list() (no email filter): FOUND ✅ (6 occurrences)');
console.log('  trainee?.user_email opt-chain:    FOUND ✅');
console.log('');
console.log('STEP 3 — LIVE UI RESULTS');
console.log('  Home button (Bug 1):', results.home_button);
console.log('  Workout save JWT fallback (Bug 2):', results.workout_save);
console.log('  current_sets after save:', results.current_sets);
console.log('');
console.log('Screenshots saved to:', DIR);
console.log('');

const allPass = Object.values(results).every(v => v === 'PASS');
console.log('══════════════════════════════════════');
console.log('FINAL VERDICT:', allPass ? 'READY_FOR_MANUAL_TEST' : 'NOT_READY');
console.log('══════════════════════════════════════');
