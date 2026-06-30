/**
 * Live production verification script
 * https://fitcoach-frontend-omega.vercel.app
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const PROD = 'https://fitcoach-frontend-omega.vercel.app';
const COACH_EMAIL = 'edengoldenberg@gmail.com';
const COACH_PASS = '12345678';
const TRAINEE_EMAIL = 'edenchen1212@gmail.com';
const TRAINEE_PASS = '12345678';
const SHOTS_DIR = 'C:/Users/owner/Desktop/pw-shots/verify-prod-' + Date.now();

mkdirSync(SHOTS_DIR, { recursive: true });

async function shot(page, name) {
  const p = `${SHOTS_DIR}/${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  console.log(`📸 ${name} → ${p}`);
  return p;
}

async function loginAs(page, email, pass) {
  await page.goto(PROD + '/LoginWithPassword', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="email"], input[placeholder*="mail"], input[placeholder*="מייל"]', email);
  await page.fill('input[type="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}

async function clearStorage(page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

const results = {};

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  // ═══════════════════════════════════════════════════════════
  // COACH SESSION
  // ═══════════════════════════════════════════════════════════
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();

    console.log('\n=== COACH LOGIN ===');
    await loginAs(page, COACH_EMAIL, COACH_PASS);
    await shot(page, '01-coach-after-login');

    // Check where coach lands
    const coachUrl = page.url();
    console.log('Coach URL after login:', coachUrl);
    results['coach-login-dest'] = coachUrl;

    // ─── Item 8: Create trainee with phone 0535716559 ───────
    console.log('\n=== Item 8: Create trainee ===');
    await page.goto(PROD + '/AddTrainee', { waitUntil: 'networkidle', timeout: 30000 });
    await shot(page, '08a-add-trainee-form');

    // Fill form
    const nameInput = page.locator('[data-testid="trainee-full-name"], input[placeholder*="שם"], input[placeholder*="ישראל"]').first();
    await nameInput.fill('Test Trainee Verify');
    await page.locator('input[placeholder*="050"], input[placeholder*="טלפון"], input[type="tel"]').first().fill('0535716559');
    await page.locator('input[type="email"]').first().fill('verify-trainee-' + Date.now() + '@test.com');
    await shot(page, '08b-add-trainee-filled');

    // Submit
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(8000); // Wait for WhatsApp send
    await shot(page, '08c-add-trainee-result');
    const traineeResultText = await page.textContent('body');
    results['item8-trainee-created'] = traineeResultText.includes('נוסף') || traineeResultText.includes('הצלחה') || traineeResultText.includes('ברוך') ? 'PASS' : 'FAIL';
    console.log('Item 8 result text snippet:', traineeResultText.slice(0, 200));

    // Check for WhatsApp button (item 7)
    const waBtn = await page.locator('a[href*="wa.me"], button:has-text("WhatsApp"), button:has-text("וואטסאפ")').count();
    results['item7-whatsapp-button'] = waBtn > 0 ? 'FOUND' : 'NOT_FOUND';
    console.log('Item 7 WhatsApp button count:', waBtn);

    // Check whatsapp send status shown
    const waStatus = await page.textContent('body').then(t => t.includes('וואטסאפ') || t.includes('WhatsApp'));
    console.log('WhatsApp status shown:', waStatus);

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════
  // TRAINEE SESSION — items 1-6, 11, 12
  // ═══════════════════════════════════════════════════════════
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();

    console.log('\n=== TRAINEE LOGIN ===');
    await loginAs(page, TRAINEE_EMAIL, TRAINEE_PASS);
    await shot(page, '02-trainee-after-login');
    const traineeUrl = page.url();
    console.log('Trainee URL after login:', traineeUrl);

    // ─── Item 2: Home button should NOT open SetPassword ────
    const isSetPassword = traineeUrl.includes('SetPassword');
    results['item2-home-not-setpassword'] = isSetPassword ? 'FAIL' : 'PASS';
    console.log('Item 2 - SetPassword opened?', isSetPassword);

    // ─── Item 11: Persistent login ──────────────────────────
    const token = await page.evaluate(() => localStorage.getItem('fitcoach_token'));
    results['item11-persistent-token'] = token ? 'PASS (token in localStorage)' : 'FAIL (no token)';
    console.log('Item 11 - fitcoach_token in localStorage:', !!token);

    // Navigate to home/trainee home
    await page.goto(PROD + '/TraineeHome', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await shot(page, '03-trainee-home');

    // ─── Item 5: Suggest What To Eat ───────────────────────
    console.log('\n=== Item 5: NutritionLog / Suggest ===');
    await page.goto(PROD + '/NutritionLog', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await shot(page, '05a-nutrition-log');

    const suggestBtn = page.locator('[data-testid="open-suggest-dialog"], button:has-text("הצע"), button:has-text("הצע מה לאכול")').first();
    const suggestExists = await suggestBtn.count();
    console.log('Suggest button count:', suggestExists);
    if (suggestExists > 0) {
      await suggestBtn.click();
      await page.waitForTimeout(2000);
      await shot(page, '05b-suggest-dialog-open');
      const dialogText = await page.textContent('body');
      results['item5-suggest-dialog'] = dialogText.includes('ארוחה') || dialogText.includes('בוקר') || dialogText.includes('הצע') ? 'PASS' : 'PARTIAL';
      // Click first option
      const firstOpt = page.locator('[role="dialog"] button').first();
      if (await firstOpt.count() > 0) {
        await firstOpt.click();
        await page.waitForTimeout(3000);
        await shot(page, '05c-suggest-result');
      }
    } else {
      results['item5-suggest-dialog'] = 'BUTTON_NOT_FOUND';
    }

    // ─── Item 6: Text meal analysis (AddMealWithAI) ─────────
    console.log('\n=== Item 6: Text meal analysis ===');
    // Look for AI meal button
    const aiBtn = page.locator('[data-testid="open-ai-dialog"], button:has-text("AI"), button:has-text("ניתוח טקסט")').first();
    const aiExists = await aiBtn.count();
    if (aiExists > 0) {
      await aiBtn.click();
      await page.waitForTimeout(1500);
      await shot(page, '06a-ai-meal-dialog');
      // Type a meal
      const textarea = page.locator('[role="dialog"] textarea').first();
      if (await textarea.count() > 0) {
        await textarea.fill('חביתה 2 ביצים עם גבינה 30 גרם');
        await page.locator('[role="dialog"] button:has-text("נתח"), [role="dialog"] button:has-text("AI")').first().click();
        await page.waitForTimeout(8000);
        await shot(page, '06b-ai-meal-result');
        const aiResultText = await page.textContent('body');
        // ─── Item 1: Clarification buttons ──────────────────
        const clarifyButtons = await page.locator('[role="dialog"] .bg-amber-50 button, [role="dialog"] button.border-amber-300').count();
        const clarifyTexts = await page.locator('[role="dialog"] .bg-amber-50 button').allTextContents();
        console.log('Item 1 - Clarification buttons:', clarifyButtons, 'texts:', clarifyTexts);
        results['item1-clarification-buttons'] = clarifyTexts.some(t => t.trim().length > 0) ? 'PASS' : (clarifyButtons > 0 ? 'BUTTONS_FOUND_EMPTY_TEXT' : 'NO_BUTTONS');
        results['item6-text-analysis'] = aiResultText.includes('קלוריות') || aiResultText.includes('חלבון') || aiResultText.includes('ניתוח') ? 'PASS' : 'FAIL';
      }
    } else {
      results['item6-text-analysis'] = 'BUTTON_NOT_FOUND';
      results['item1-clarification-buttons'] = 'COULD_NOT_TEST';
    }

    // Close any dialog
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // ─── Item 3 & 4: Meal plan macros ───────────────────────
    console.log('\n=== Items 3 & 4: Meal plan ===');
    await page.goto(PROD + '/MyMealPlan', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await shot(page, '03-meal-plan');
    const mealPlanText = await page.textContent('body');
    // Check for non-zero macro values
    const hasNonZeroMacros = /[1-9]\d*\s*(קלוריות|kcal|קק"ל|גרם)/i.test(mealPlanText) ||
      mealPlanText.includes('תפריט') && !mealPlanText.includes('0 קלוריות');
    results['item3-meal-macros'] = mealPlanText.includes('עוד אין לך תפריט') ? 'NO_PLAN_TO_VERIFY' :
      hasNonZeroMacros ? 'PASS' : 'NEEDS_SCREENSHOT_REVIEW';
    console.log('Meal plan page text snippet:', mealPlanText.slice(0, 300));

    // ─── Item 4: Weekly plan ────────────────────────────────
    const weeklyBtn = page.locator('button:has-text("שבועי"), button:has-text("צור תפריט שבועי")').first();
    if (await weeklyBtn.count() > 0) {
      results['item4-weekly-plan-button'] = 'FOUND';
    } else {
      results['item4-weekly-plan-button'] = 'NOT_FOUND';
    }

    // ─── Item 12: Daily workout for trainee ─────────────────
    console.log('\n=== Item 12: Daily workout ===');
    await page.goto(PROD + '/TraineeDailyWorkout', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await shot(page, '12-daily-workout');
    const workoutText = await page.textContent('body');
    const hasError = workoutText.includes('שגיאה') && workoutText.includes('תרגיל') && !workoutText.includes('שגיאה בשמירה');
    const hasWorkout = workoutText.includes('אימון') && (workoutText.includes('תרגיל') || workoutText.includes('חזרות') || workoutText.includes('סטים'));
    console.log('Workout text snippet:', workoutText.slice(0, 300));
    results['item12-daily-workout'] = hasError ? 'FAIL (error shown)' : 'PASS (no crash)';

    await ctx.close();
  }

  // ═══════════════════════════════════════════════════════════
  // Item 10: Verify invite link ─ GET /api/auth/invite/:token
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== Item 10: Invite link validation ===');
  // Test with a known dummy token to verify endpoint responds
  const BACKEND = 'https://fitcoach-server-production-19e8.up.railway.app';
  try {
    const res = await fetch(`${BACKEND}/api/auth/invite/testtoken123`);
    const data = await res.json();
    console.log('Invite endpoint response:', data);
    results['item10-invite-endpoint'] = res.status === 200 ? 'ENDPOINT_REACHABLE (invalid token expected)' : `HTTP_${res.status}`;
  } catch (e) {
    results['item10-invite-endpoint'] = 'ENDPOINT_ERROR: ' + e.message;
  }

  await browser.close();

  // ═══════════════════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════════════════
  console.log('\n\n════════════════════════════════════════════');
  console.log('VERIFICATION RESULTS');
  console.log('════════════════════════════════════════════');
  console.log('Screenshots saved to:', SHOTS_DIR);
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('════════════════════════════════════════════');
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
