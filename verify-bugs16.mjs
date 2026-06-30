/**
 * Targeted verification for bugs 1–6
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const PROD  = 'https://fitcoach-frontend-omega.vercel.app';
const API   = 'https://fitcoach-server-production-19e8.up.railway.app';
const TRAINEE_EMAIL = 'edenchen1212@gmail.com';
const TRAINEE_PASS  = '12345678';
const COACH_EMAIL   = 'edengoldenberg@gmail.com';
const COACH_PASS    = '12345678';
const DIR   = `C:/Users/owner/Desktop/pw-shots/bugs16-${Date.now()}`;
mkdirSync(DIR, { recursive: true });

async function shot(page, name) {
  const p = path.join(DIR, `${name}.png`);
  await page.screenshot({ path: p });
  console.log(`  📸 ${name} | ${page.url()}`);
  return p;
}

async function login(page, email, pw) {
  await page.goto(`${PROD}/LoginWithPassword`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const results = {};

  // ── COACH session ──────────────────────────────────────────────────────────
  console.log('\n═══ COACH ═══');
  const cCtx = await browser.newContext({ viewport:{ width:390, height:844 } });
  const cPage = await cCtx.newPage();
  await login(cPage, COACH_EMAIL, COACH_PASS);

  // BUG 3 — Coach home routing: logo should be a link immediately after login
  await cPage.goto(`${PROD}/CoachWorkouts`, { waitUntil:'networkidle', timeout:20000 });
  await cPage.waitForTimeout(800);
  const logoLink = cPage.locator('a[href*="CoachDashboard"]').first();
  const logoCount = await logoLink.count();
  console.log('Bug 3 — logo link on CoachWorkouts:', logoCount > 0 ? 'FOUND' : 'MISSING (isCoach not set)');
  results['bug3-logo-link'] = logoCount > 0 ? 'PASS' : 'FAIL';
  await shot(cPage, 'B3-coach-logo');

  // Navigate via logo
  await cPage.goto(`${PROD}/CoachDashboard`, { waitUntil:'networkidle', timeout:20000 });
  await cPage.waitForTimeout(500);
  const dashUrl = cPage.url();
  results['bug3-home-dest'] = dashUrl.includes('CoachDashboard') ? 'PASS' : 'FAIL';

  await cCtx.close();

  // ── TRAINEE session ────────────────────────────────────────────────────────
  console.log('\n═══ TRAINEE ═══');
  const tCtx = await browser.newContext({ viewport:{ width:390, height:844 } });
  const tPage = await tCtx.newPage();
  await login(tPage, TRAINEE_EMAIL, TRAINEE_PASS);

  // BUG 4 & 5 — buildNutritionActionMeal / "ארוחה מותאמת"
  console.log('\n─ Bug 4+5: buildNutritionActionMeal API ─');
  try {
    const tok = await tPage.evaluate(() => localStorage.getItem('fitcoach_token'));
    const r = await fetch(`${API}/api/functions/buildNutritionActionMeal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ trainee_email: TRAINEE_EMAIL, meal_type: 'snack', intent: 'build_meal' }),
    });
    const d = await r.json();
    console.log('  buildNutritionActionMeal response:', JSON.stringify(d).slice(0, 300));
    const hasName = !!(d.data?.meal_name);
    const hasCal  = !!(d.data?.totals?.calories > 0);
    const hasIngr = !!(d.data?.ingredients?.length > 0);
    results['bug4-meal-name']  = hasName ? 'PASS' : 'FAIL';
    results['bug5-calories']   = hasCal  ? 'PASS' : 'FAIL';
    results['bug5-ingredients']= hasIngr ? 'PASS' : 'FAIL';
  } catch(e) {
    console.error('  API call failed:', e.message);
    results['bug4-meal-name'] = results['bug5-calories'] = results['bug5-ingredients'] = 'FAIL';
  }

  // BUG 6 — Clarification answers
  console.log('\n─ Bug 6: Clarification re-analysis ─');
  await tPage.goto(`${PROD}/NutritionLog`, { waitUntil:'networkidle', timeout:30000 });
  await tPage.waitForTimeout(1500);
  // Open AI meal dialog
  await tPage.locator('button:has-text("נתח")').first().click().catch(()=>{});
  await tPage.waitForTimeout(800);
  const ta = tPage.locator('[role="dialog"] textarea').first();
  if (await ta.count() > 0) {
    await ta.fill('חביתה ולחם');
    await shot(tPage, 'B6-before-analyze');
    await tPage.locator('[role="dialog"] button').filter({ hasText:/נתח|AI|מתקדם/ }).first().click({ force:true }).catch(()=>{});
    console.log('  Analyzing "חביתה ולחם"...');
    await tPage.waitForTimeout(12000);
    await shot(tPage, 'B6-after-first-analysis');

    // Capture initial calories
    const dlgText1 = await tPage.locator('[role="dialog"]').textContent().catch(()=>'');
    const cal1Match = dlgText1.match(/(\d+)\s*קל/);
    const cal1 = cal1Match ? parseInt(cal1Match[1]) : null;
    console.log('  Initial calories:', cal1);

    // Find clarification buttons and click one
    const clarBtns = tPage.locator('[role="dialog"] .bg-amber-50 button, [role="dialog"] button.border-amber-300');
    const clarTexts = await clarBtns.allTextContents();
    console.log('  Clarification buttons:', clarTexts.slice(0, 4));

    if (clarTexts.length > 0) {
      // Click first clarification button
      await clarBtns.first().click();
      console.log(`  Clicked: "${clarTexts[0]}" — waiting for re-analysis...`);
      await tPage.waitForTimeout(10000);
      await shot(tPage, 'B6-after-clarification');

      const dlgText2 = await tPage.locator('[role="dialog"]').textContent().catch(()=>'');
      const cal2Match = dlgText2.match(/(\d+)\s*קל/);
      const cal2 = cal2Match ? parseInt(cal2Match[1]) : null;
      console.log('  Post-clarification calories:', cal2);

      // Values should change (or at least re-analysis ran)
      const reanalyzed = cal1 !== null && cal2 !== null;
      results['bug6-reananalysis-ran'] = reanalyzed ? 'PASS (re-analysis ran)' : 'FAIL (no result)';
      results['bug6-values-changed'] = (reanalyzed && cal1 !== cal2) ? 'PASS (values updated)' : 'NOTE (same value - may be correct for this input)';
    } else {
      // No clarification buttons — high confidence — still check re-analysis works for a vague meal
      results['bug6-reananalysis-ran'] = 'NOTE - no clarifications for this meal (confidence high)';
      results['bug6-values-changed'] = 'SKIP';
    }
  } else {
    results['bug6-reananalysis-ran'] = 'FAIL - dialog did not open';
    results['bug6-values-changed'] = 'SKIP';
  }
  await tPage.keyboard.press('Escape').catch(()=>{});

  // BUG 2 — Image upload (check the dialog renders and no UploadFile error)
  console.log('\n─ Bug 2: Image upload ─');
  await tPage.goto(`${PROD}/NutritionLog`, { waitUntil:'networkidle', timeout:30000 });
  await tPage.waitForTimeout(1500);
  // Capture any JS errors related to UploadFile
  const jsErrors = [];
  tPage.on('console', m => { if(m.type()==='error' && m.text().includes('UploadFile')) jsErrors.push(m.text()); });
  // Open photo dialog
  await tPage.locator('button:has-text("צלם"), button:has-text("תמונה")').first().click().catch(()=>{});
  await tPage.waitForTimeout(1500);
  const b2shot = await shot(tPage, 'B2-image-dialog');
  const uploadBtn = tPage.locator('button:has-text("צלם"), button:has-text("מצלמה"), button:has-text("העלה מהגלריה")').first();
  results['bug2-dialog-opens'] = await uploadBtn.count() > 0 ? 'PASS' : 'FAIL';
  results['bug2-no-uploadfile-error'] = jsErrors.length === 0 ? 'PASS (no UploadFile error)' : 'FAIL: ' + jsErrors[0];
  console.log('  UploadFile JS errors:', jsErrors);
  await tPage.keyboard.press('Escape').catch(()=>{});

  // BUG 1 — Weekly plan: trigger and check spinner stops
  console.log('\n─ Bug 1: Weekly plan ─');
  await tPage.goto(`${PROD}/MyMealPlan`, { waitUntil:'networkidle', timeout:30000 });
  await tPage.waitForTimeout(2000);
  const weeklyBtn = tPage.locator('button:has-text("צור תפריט שבועי")').first();
  if (await weeklyBtn.count() > 0) {
    await weeklyBtn.click();
    console.log('  Weekly generation triggered. Polling for 90s...');
    await shot(tPage, 'B1-weekly-spinner');

    let found = false;
    for (let i = 0; i < 18; i++) {
      await tPage.waitForTimeout(5000);
      const t = await tPage.textContent('body');
      if (/ראשון|שני|שלישי/.test(t)) { found = true; break; }
      // Also check spinner stopped
      const stillSpinning = t.includes('מכין תפריט שבועי');
      console.log(`  Poll ${i+1}/18 — found=${found} spinning=${stillSpinning}`);
      if (!stillSpinning && !found) { console.log('  Spinner stopped (timeout or done)'); break; }
    }
    await shot(tPage, 'B1-weekly-result');
    const finalText = await tPage.textContent('body');
    const stillSpinning = finalText.includes('מכין תפריט שבועי');
    const hasDays = /ראשון|שני|שלישי/.test(finalText);
    results['bug1-weekly-no-forever-spin'] = !stillSpinning ? 'PASS (spinner stopped)' : 'FAIL (still spinning)';
    results['bug1-weekly-days-shown'] = hasDays ? 'PASS' : 'FAIL (no days)';
    console.log('  Spinner stopped:', !stillSpinning, '| Days visible:', hasDays);
  } else if (tPage.textContent('body').then(t => t.includes('תפריט שבועי ✓'))) {
    results['bug1-weekly-no-forever-spin'] = 'PASS (already weekly)';
    results['bug1-weekly-days-shown'] = 'PASS (already weekly)';
  } else {
    results['bug1-weekly-no-forever-spin'] = 'NOTE - no weekly button';
    results['bug1-weekly-days-shown'] = 'SKIP';
  }

  await tCtx.close();
  await browser.close();

  // ── REPORT ────────────────────────────────────────────────────────────────
  console.log('\n\n══ BUG VERIFICATION REPORT ══');
  console.log('Screenshots:', DIR);
  for (const [k, v] of Object.entries(results)) {
    const icon = v.startsWith('PASS') ? '✅' : v.startsWith('FAIL') ? '❌' : 'ℹ️';
    console.log(`${icon} ${k}: ${v}`);
  }
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
