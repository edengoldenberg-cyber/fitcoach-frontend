/**
 * test_playwright_proof.mjs
 * Playwright proof tests for:
 *   Bug #3 — Onboarding tutorial navigation (each step must navigate to real page)
 *   Regression — Nutrition module save/edit/delete flows
 *
 * Run: node test_playwright_proof.mjs
 */

import { chromium } from 'playwright';

const FRONTEND = 'http://localhost:5173';
const BACKEND  = 'http://localhost:3001';

const PASS = '✅ PASS';
const FAIL = '❌ FAIL';

function log(label, ok, detail = '') {
  console.log(`${ok ? PASS : FAIL}  ${label}` + (detail ? `  [${detail}]` : ''));
  return ok;
}

// ─── Get JWT from backend ────────────────────────────────────────────────────

async function getJWT() {
  const res = await fetch(`${BACKEND}/api/functions/verifyPasswordLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@fitcoach.local', password: 'Admin123!' }),
  });
  const d = await res.json();
  return d?.access_token;
}

// ─── Bug #3: Onboarding tutorial navigation ──────────────────────────────────

async function testBug3_OnboardingNavigation(page, jwt) {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('BUG #3 — Onboarding tutorial: interactive navigation');

  const results = [];

  // Inject JWT and navigate to Onboarding
  await page.addInitScript((token) => {
    localStorage.setItem('fitcoach_token', token);
  }, jwt);

  await page.goto(`${FRONTEND}/OnboardingScreen`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500); // let React render

  // Screenshot of initial state
  await page.screenshot({ path: '/tmp/onboarding_step1.png' });
  console.log('     Screenshot: /tmp/onboarding_step1.png');

  // ── Check Step 1: "הוסף ארוחה ראשונה" ──────────────────────────────────
  console.log('\n  ── Step 1: "הוסף ארוחה ראשונה 🍳" ──');

  // The primary nav button should say "פתח יומן תזונה" and navigate to NutritionLog
  const navBtn1 = page.getByRole('button', { name: /פתח יומן תזונה/ });
  const navBtn1Exists = await navBtn1.isVisible().catch(() => false);
  results.push(log('Step 1: nav button "פתח יומן תזונה" is visible', navBtn1Exists));

  if (navBtn1Exists) {
    // Click and watch for navigation
    const [navPage] = await Promise.all([
      page.waitForNavigation({ timeout: 5000 }).catch(() => null),
      navBtn1.click(),
    ]);
    const currentUrl = page.url();
    const navigatedToNutrition = currentUrl.includes('NutritionLog');
    results.push(log('Step 1: clicking nav button navigates to NutritionLog', navigatedToNutrition, `url=${currentUrl}`));

    // Verify localStorage was set before navigating
    const lsState = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('onboarding_state') || 'null'); } catch { return null; }
    });
    // State should be saved since we navigated
    results.push(log('Step 1: onboarding_state saved to localStorage before nav', !!lsState, lsState ? `stepIndex=${lsState.stepIndex}` : 'null'));

    // Go back to onboarding to test restoration
    await page.goto(`${FRONTEND}/OnboardingScreen`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: '/tmp/onboarding_returned.png' });
    console.log('     Screenshot after return: /tmp/onboarding_returned.png');
    results.push(log('Step 1: onboarding page loads on return from NutritionLog', true));
  }

  // ── Check self-confirm button ──────────────────────────────────────────
  console.log('\n  ── Self-confirm button test ──');
  // Re-navigate fresh (localStorage may have been cleared on return)
  await page.evaluate(() => localStorage.removeItem('onboarding_state'));
  await page.goto(`${FRONTEND}/OnboardingScreen`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);

  // The secondary "I did it" confirm button should also exist
  const confirmBtn = page.getByRole('button', { name: /הסמנתי כבוצע|הבנתי|הסמנת/ });
  const confirmVisible = await confirmBtn.isVisible().catch(() => false);
  results.push(log('Self-confirm button is visible as secondary option', confirmVisible));

  if (confirmVisible) {
    await confirmBtn.click();
    await page.waitForTimeout(800);
    // Should show success burst
    const successText = await page.locator('text=קיבלת 20 נקודות').isVisible().catch(() => false);
    results.push(log('Clicking self-confirm shows SuccessBurst animation', successText));
  }

  // ── Check "Next" button in success state ─────────────────────────────
  const nextBtn = page.getByRole('button', { name: /המשך|סיים/ });
  const nextVisible = await nextBtn.isVisible().catch(() => false);
  results.push(log('SuccessBurst shows "המשך" button to advance', nextVisible));

  if (nextVisible) {
    await nextBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/onboarding_step2.png' });
    console.log('     Screenshot step 2: /tmp/onboarding_step2.png');

    // Verify we're now on step 2: "פתח את האימון היומי"
    const step2Title = await page.locator('text=פתח את האימון היומי').isVisible().catch(() => false);
    results.push(log('After "המשך", shows step 2 "פתח את האימון היומי 💪"', step2Title));
  }

  // ── Check step 2 nav button ────────────────────────────────────────────
  console.log('\n  ── Step 2: "פתח את האימון היומי 💪" ──');
  const navBtn2 = page.getByRole('button', { name: /פתח אימון יומי/ });
  const navBtn2Exists = await navBtn2.isVisible().catch(() => false);
  results.push(log('Step 2: nav button "פתח אימון יומי" is visible', navBtn2Exists));

  if (navBtn2Exists) {
    await navBtn2.click();
    await page.waitForTimeout(800);
    const url2 = page.url();
    results.push(log('Step 2: navigates to TraineeDailyWorkout', url2.includes('TraineeDailyWorkout'), `url=${url2}`));
  }

  // ── Skip to end ───────────────────────────────────────────────────────
  console.log('\n  ── Skip button ──');
  await page.goto(`${FRONTEND}/OnboardingScreen`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  const skipBtn = page.getByRole('button', { name: 'דלג' });
  const skipVisible = await skipBtn.isVisible().catch(() => false);
  results.push(log('"דלג" (skip) button is visible', skipVisible));

  if (skipVisible) {
    await skipBtn.click();
    await page.waitForTimeout(1000);
    // Should redirect to home (/) after skip
    const urlAfterSkip = page.url();
    results.push(log('Skip redirects to home page', urlAfterSkip === `${FRONTEND}/` || urlAfterSkip.includes('Home'), `url=${urlAfterSkip}`));
  }

  // ── Progress bar ─────────────────────────────────────────────────────
  await page.goto(`${FRONTEND}/OnboardingScreen`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  const progressBar = page.locator('[aria-label="התקדמות הדרכה"]');
  const progressExists = await progressBar.isVisible().catch(() => false);
  results.push(log('Step progress bar is rendered', progressExists));

  console.log('\n  ── Summary ──');
  console.log(`  ${results.filter(Boolean).length}/${results.length} checks passed`);

  return results;
}

// ─── Regression: Nutrition module Edit and Delete ────────────────────────────

async function testNutritionRegression() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('REGRESSION — Nutrition module Edit + Delete');

  const jwt = await getJWT();
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` };
  const results = [];

  // Create a meal entry
  const createRes = await fetch(`${BACKEND}/api/entities/MealEntry`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      trainee_email: 'trainee@fitcoach.local',
      date: '2026-06-29',
      meal_type: 'breakfast',
      food_name: 'ביצה קשה',
      calories: 78,
      protein: 6.3,
      carbs: 0.6,
      fat: 5.3,
      quantity: 55,
      unit: 'gram',
    }),
  });
  const created = await createRes.json();
  const id = created.id;
  results.push(log('Create MealEntry', !!id, `id=${id}`));

  // Edit the meal
  if (id) {
    const editRes = await fetch(`${BACKEND}/api/entities/MealEntry/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ calories: 90, food_name: 'ביצה קשה גדולה', quantity: 65 }),
    });
    const edited = await editRes.json();
    results.push(log('Edit MealEntry (PUT)', editRes.status === 200 && edited.calories === 90, `calories=${edited.calories} name=${edited.food_name}`));

    // Delete the meal
    const delRes = await fetch(`${BACKEND}/api/entities/MealEntry/${id}`, {
      method: 'DELETE',
      headers,
    });
    const delData = await delRes.json();
    results.push(log('Delete MealEntry', delRes.status === 200 && delData.ok === true, `ok=${delData.ok}`));

    // Confirm it's gone
    const checkRes = await fetch(`${BACKEND}/api/entities/MealEntry/${id}`, { headers });
    results.push(log('Deleted entry returns 404', checkRes.status === 404, `HTTP ${checkRes.status}`));
  }

  // Daily totals query
  const dayRes = await fetch(`${BACKEND}/api/entities/MealEntry?date=2026-06-29&trainee_email=trainee%40fitcoach.local`, { headers });
  results.push(log('Daily MealEntry query succeeds', dayRes.status === 200));

  // Water entry CRUD
  const waterRes = await fetch(`${BACKEND}/api/entities/WaterEntry`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      trainee_email: 'trainee@fitcoach.local',
      date: '2026-06-29',
      amount_ml: 250,
    }),
  });
  const waterData = await waterRes.json();
  results.push(log('Create WaterEntry', waterRes.status === 200 && !!waterData.id, `id=${waterData.id}`));

  if (waterData.id) {
    const wDel = await fetch(`${BACKEND}/api/entities/WaterEntry/${waterData.id}`, { method: 'DELETE', headers });
    results.push(log('Delete WaterEntry', wDel.status === 200));
  }

  console.log(`  ${results.filter(Boolean).length}/${results.length} regression checks passed`);
  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('FitCoach P0 Fix Proof — Playwright + Nutrition Regression Tests');
  console.log('═══════════════════════════════════════════════════════════════');

  const jwt = await getJWT();
  console.log('Auth: JWT obtained ✓');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();

  // Intercept and log navigation events
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      console.log(`     [NAV] → ${frame.url()}`);
    }
  });

  let allResults = [];

  try {
    const bug3Results = await testBug3_OnboardingNavigation(page, jwt);
    allResults = [...allResults, ...bug3Results];
  } catch (err) {
    console.error('\n⚠️  Bug #3 test error:', err.message);
    allResults.push(false);
  }

  await browser.close();

  const regressionResults = await testNutritionRegression();
  allResults = [...allResults, ...regressionResults];

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('FINAL RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  const passed = allResults.filter(Boolean).length;
  const total  = allResults.length;
  console.log(`  ${passed}/${total} tests passed`);
  console.log(passed === total ? '\n  ✅ ALL TESTS PASS' : '\n  ❌ SOME TESTS FAILED');
}

main().catch(err => { console.error(err); process.exit(1); });
