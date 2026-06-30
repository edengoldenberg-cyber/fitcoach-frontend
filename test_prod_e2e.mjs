import { chromium } from 'playwright';

const PROD_FE = 'https://fitcoach-frontend-omega.vercel.app';
const PROD_BE = 'https://fitcoach-server-production-19e8.up.railway.app';
const EMAIL   = 'shani12babi@gmail.com';
const PASSWORD = '12345678';

let passed = 0, failed = 0;
const RESULTS = [];

function log(test, ok, detail = '') {
  if (ok) passed++; else failed++;
  const status = ok ? 'PASS' : 'FAIL';
  RESULTS.push({ test, status, detail });
  console.log(`[${status}] ${test}` + (detail ? ` — ${detail}` : ''));
  return ok;
}

async function getJWT() {
  const r = await fetch(`${PROD_BE}/api/functions/verifyPasswordLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const d = await r.json();
  return d?.access_token;
}

// ─── TEST 6: Onboarding via Playwright ───────────────────────────────────────

async function test6_Onboarding(jwt) {
  console.log('\n══ TEST 6: Onboarding (Playwright, production) ══');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await ctx.newPage();

  page.on('framenavigated', f => {
    if (f === page.mainFrame()) console.log('  [NAV]', f.url().replace(PROD_FE, ''));
  });

  // Inject JWT + navigate to onboarding
  await page.addInitScript(t => localStorage.setItem('fitcoach_token', t), jwt);
  await page.goto(`${PROD_FE}/OnboardingScreen`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Dismiss any startup overlay
  const x = page.locator('button').filter({ hasText: '✕' }).first();
  if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(500); }

  await page.screenshot({ path: '/tmp/prod_onb1.png' });

  // Verify page loads
  const h1 = await page.locator('h1').textContent().catch(() => '');
  log('Onboarding page loads', h1.includes('מדריך'), `h1="${h1.trim()}"`);

  // Verify step title (trainee role for shani)
  const h2 = await page.locator('h2').textContent().catch(() => '');
  log('Step 1 title visible', h2.length > 3, `"${h2.trim()}"`);

  // Verify progress bar
  const progress = await page.locator('[aria-label]').first().isVisible().catch(() => false);
  log('Progress bar renders', progress);

  // Get all buttons
  const btns = await page.locator('button').allTextContents();
  console.log('  Buttons:', JSON.stringify(btns));

  // Find nav button (trainee step 1 = "פתח יומן תזונה" or similar)
  const navBtn = page.locator('button').filter({ hasText: 'פתח' }).first();
  const navVis = await navBtn.isVisible().catch(() => false);
  log('Step 1 nav button visible', navVis);

  if (navVis) {
    const navText = await navBtn.textContent();
    console.log('  Nav button text:', navText.trim());
    await navBtn.click();
    await page.waitForTimeout(2000);
    const url = page.url();
    log('Nav button navigates to feature page', !url.includes('OnboardingScreen') || url.includes('Nutrition') || url.includes('Trainee'), url.replace(PROD_FE, ''));

    // Check localStorage saved
    const ls = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('onboarding_state') || 'null'); } catch { return null; }
    });
    log('localStorage.onboarding_state saved before navigation', !!ls, ls ? `step=${ls.stepIndex}` : 'null');

    await page.screenshot({ path: '/tmp/prod_onb2.png' });

    // Return to onboarding
    await page.goto(`${PROD_FE}/OnboardingScreen`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
    const x2 = page.locator('button').filter({ hasText: '✕' }).first();
    if (await x2.isVisible().catch(() => false)) { await x2.click(); await page.waitForTimeout(500); }

    const lsCleared = await page.evaluate(() => localStorage.getItem('onboarding_state'));
    log('localStorage cleared after state restore', lsCleared === null, `val=${lsCleared}`);
    await page.screenshot({ path: '/tmp/prod_onb3.png' });
  }

  // Self-confirm test
  await page.goto(`${PROD_FE}/OnboardingScreen`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  const x3 = page.locator('button').filter({ hasText: '✕' }).first();
  if (await x3.isVisible().catch(() => false)) { await x3.click(); await page.waitForTimeout(500); }

  const confirmBtn = page.locator('button').filter({ hasText: 'הסמנתי' }).first();
  log('Self-confirm "הסמנתי" button visible', await confirmBtn.isVisible().catch(() => false));

  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/prod_onb4.png' });
    const body = await page.textContent('body').catch(() => '');
    const hasWin = body.includes('ניצחון') || body.includes('נקודות') || body.includes('רואים') || body.includes('מעולה');
    log('SuccessBurst win text appears after confirm', hasWin);

    const nextBtn = page.locator('button').filter({ hasText: 'המשך' }).first();
    log('"המשך" button appears', await nextBtn.isVisible().catch(() => false));

    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(800);
      const h2b = await page.locator('h2').textContent().catch(() => '');
      log('Step 2 advances to new title', h2b !== h2 && h2b.length > 0, `"${h2b.trim()}"`);
      await page.screenshot({ path: '/tmp/prod_onb5.png' });
    }
  }

  // Skip test
  await page.goto(`${PROD_FE}/OnboardingScreen`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  const x4 = page.locator('button').filter({ hasText: '✕' }).first();
  if (await x4.isVisible().catch(() => false)) { await x4.click(); await page.waitForTimeout(500); }

  const skipBtn = page.locator('button').filter({ hasText: 'דלג' }).first();
  log('Skip "דלג" button visible', await skipBtn.isVisible().catch(() => false));
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(2500);
    const urlAfterSkip = page.url();
    log('Skip redirects away from onboarding', !urlAfterSkip.includes('OnboardingScreen'), urlAfterSkip.replace(PROD_FE, ''));
    await page.screenshot({ path: '/tmp/prod_onb6.png' });
  }

  await browser.close();
}

// ─── TEST 7: Nutrition Regression ────────────────────────────────────────────

async function test7_Regression(jwt) {
  console.log('\n══ TEST 7: Nutrition Regression ══');
  const h = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` };
  const EMAIL = 'shani12babi@gmail.com';
  const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

  // 7a: Add meal
  const cr = await fetch(`${PROD_BE}/api/entities/MealEntry`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ trainee_email: EMAIL, date: TODAY, meal_type: 'breakfast', food_name: 'גבינה לבנה 5%', calories: 97, protein: 8, carbs: 6, fat: 3, quantity: 100, unit: 'gram' }),
  });
  const meal = await cr.json();
  log('7a: Add meal (breakfast)', cr.status === 200 && !!meal.id, `id=${meal.id} cal=${meal.calories}`);

  // 7b: Edit meal
  if (meal.id) {
    const ed = await fetch(`${PROD_BE}/api/entities/MealEntry/${meal.id}`, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ calories: 120, food_name: 'גבינה לבנה 9%', notes: 'עריכה בדיקה' }),
    });
    const edited = await ed.json();
    log('7b: Edit meal', ed.status === 200 && edited.calories === 120, `cal=${edited.calories} name=${edited.food_name}`);

    // 7c: Delete meal
    const dl = await fetch(`${PROD_BE}/api/entities/MealEntry/${meal.id}`, { method: 'DELETE', headers: h });
    log('7c: Delete meal', dl.status === 200);
    const ck = await fetch(`${PROD_BE}/api/entities/MealEntry/${meal.id}`, { headers: h });
    log('7c: Deleted → 404', ck.status === 404, `HTTP ${ck.status}`);
  }

  // 7d: Water entry
  const wc = await fetch(`${PROD_BE}/api/entities/WaterEntry`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ trainee_email: EMAIL, date: TODAY, amount_ml: 250 }),
  });
  const water = await wc.json();
  log('7d: Add water entry', wc.status === 200 && !!water.id, `id=${water.id} ml=${water.amount_ml}`);
  if (water.id) {
    const wd = await fetch(`${PROD_BE}/api/entities/WaterEntry/${water.id}`, { method: 'DELETE', headers: h });
    log('7d: Delete water', wd.status === 200);
  }

  // 7e: Camera AI save (extra fields — Bug #1 final proof)
  const camSave = await fetch(`${PROD_BE}/api/entities/MealEntry`, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      trainee_email: EMAIL, date: TODAY, meal_type: 'lunch', food_name: 'בדיקת שדות עודפים',
      calories: 200, protein: 15, carbs: 10, fat: 8, quantity: 150, unit: 'gram',
      source: 'photo_ai', per100_kcal: 133, grams_final: 150, ai_original_food_name: 'test',
      food_database_scope: 'ai', user_food_item_id: null, per100_protein: 10, per100_carbs: 6.7, per100_fat: 5.3,
    }),
  });
  const camData = await camSave.json();
  log('7e: Camera AI save with extra fields (Bug #1)', camSave.status === 200 && !!camData.id, `id=${camData.id}`);
  log('7e: Extra fields stripped (per100_kcal undefined)', camData.per100_kcal === undefined, `per100_kcal=${camData.per100_kcal}`);
  if (camData.id) {
    await fetch(`${PROD_BE}/api/entities/MealEntry/${camData.id}`, { method: 'DELETE', headers: h });
  }

  // 7f: Text AI analysis
  const ai = await fetch(`${PROD_BE}/api/functions/analyzeAndEnrichMealPhoto`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ meal_text: 'יוגורט דנונה 100 גרם', meal_type: 'breakfast' }),
  });
  const aiData = await ai.json();
  const aiR = aiData?.data?.response ?? aiData?.data;
  log('7f: Text AI analysis returns results', ai.status === 200 && (aiR?.total_calories || 0) > 0, `cal=${aiR?.total_calories}`);
  log('7f: Canonical DB lookup runs', aiR?.items?.length > 0, `items=${aiR?.items?.length} src=${aiR?.items?.[0]?.nutrition_source}`);

  // 7g: Clean up test meals from TEST 2
  const del1 = await fetch(`${PROD_BE}/api/entities/MealEntry/cmqz6g7q00007xhmbmrg93wty`, { method: 'DELETE', headers: h });
  const del2 = await fetch(`${PROD_BE}/api/entities/MealEntry/cmqz6gw8z0009xhmbf9s5spmc`, { method: 'DELETE', headers: h });
  log('7g: Test meal cleanup', del1.status === 200 || del1.status === 404, `cleanup1=${del1.status} cleanup2=${del2.status}`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PRODUCTION E2E — fitcoach-frontend-omega.vercel.app');
  console.log('User:', EMAIL, '(trainee)');
  console.log('═══════════════════════════════════════════════════════════');

  const jwt = await getJWT();
  if (!jwt) { console.error('LOGIN FAILED'); process.exit(1); }
  console.log('Auth: JWT obtained ✓');

  await test6_Onboarding(jwt);
  await test7_Regression(jwt);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`RESULTS: ${passed} PASS / ${failed} FAIL`);
  RESULTS.forEach(r => console.log(`  [${r.status}] ${r.test}${r.detail ? ' — ' + r.detail : ''}`));
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
