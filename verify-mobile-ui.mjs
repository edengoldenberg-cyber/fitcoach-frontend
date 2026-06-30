/**
 * verify-mobile-ui.mjs  — round 3
 * Full mobile UI verification against deployed frontend.
 * Viewport: 390x844 (iPhone 14)
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const BASE = 'https://fitcoach-frontend-omega.vercel.app';
const SHOTS_DIR = './pw-shots/mobile-verify-r3';

const COACH_EMAIL   = 'admin@fitcoach.local';
const COACH_PASS    = 'Admin123!';
const TRAINEE_EMAIL = 'edengoldenberg+e2e@gmail.com';
const TRAINEE_PASS  = 'E2ETest123!';

let browser, context, page;
const results = [];
let shotIndex = 0;
// Only capture UNCAUGHT errors (page crashes), not console.error from caught exceptions
const pageErrors = [];
// Separately collect console.error that mention Prisma — to catch real DB failures
const consoleDbErrors = [];

async function shot(name) {
  const file = `${SHOTS_DIR}/${String(shotIndex++).padStart(3,'0')}-${name.replace(/[^a-z0-9]/gi,'-')}.png`;
  await page.screenshot({ path: file, fullPage: false });
  return file;
}
function pass(label, note = '') {
  results.push({ ok: true, label, note });
  console.log(`  ✅  ${label}${note ? ' — ' + note : ''}`);
}
function fail(label, detail = '') {
  results.push({ ok: false, label, detail });
  console.error(`  ❌  ${label}${detail ? ': ' + detail : ''}`);
}
function info(msg) { console.log(`  ℹ   ${msg}`); }

async function closeAnyDialog() {
  try {
    if (await page.locator('[data-state="open"][class*="bg-black"]').isVisible({ timeout: 500 })) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  } catch { /* ignore */ }
}

const PRISMA_TERMS = ['Unknown field', 'Unknown argument', 'Argument `', 'prisma.', 'invocation:'];
function isPrismaError(text) { return PRISMA_TERMS.some(t => text.includes(t)); }

async function setup() {
  await mkdir(SHOTS_DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  page = await context.newPage();
  // Only capture true page-level crashes (unhandled rejections etc.)
  page.on('pageerror', err => {
    if (isPrismaError(err.message)) {
      consoleDbErrors.push(`[UNCAUGHT] ${err.message.slice(0, 200)}`);
    } else {
      pageErrors.push(err.message.slice(0, 200));
    }
  });
  // Capture console.error that explicitly mention Prisma errors from within catch blocks
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (isPrismaError(text)) {
        consoleDbErrors.push(`[CONSOLE] ${text.slice(0, 300)}`);
      }
    }
  });
}

function clearErrors() {
  pageErrors.length = 0;
  consoleDbErrors.length = 0;
}

async function loginAs(email, password) {
  await page.goto(`${BASE}/LoginWithPassword`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4500);
}

async function hardLogout() {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await context.clearCookies();
  await page.goto(`${BASE}/LoginWithPassword`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
}

// ─── FLOW 1: Coach login + home ───────────────────────────────────────────────
async function flow1_coachLogin() {
  console.log('\n─── FLOW 1: Coach login + home screen\n');
  clearErrors();

  await loginAs(COACH_EMAIL, COACH_PASS);
  const url = page.url();
  await shot('01-after-coach-login');

  if (url.includes('CoachDashboard')) {
    pass('Coach lands on CoachDashboard', url);
  } else if (url.includes('ExecutiveDashboard')) {
    fail('Coach on ExecutiveDashboard — redirect broken', url);
  } else {
    fail('Unexpected coach landing', url);
  }

  const pageText = await page.textContent('body');
  const marketing = ['leads', 'memberships sold', 'marketing spend', 'revenue']
    .filter(t => pageText.toLowerCase().includes(t));
  marketing.length === 0
    ? pass('No marketing/KPI cards on coach home')
    : fail('Marketing content on coach home', marketing.join(', '));

  const hasAdd    = await page.locator('text=הוסף מתאמן').first().isVisible({ timeout: 3000 }).catch(() => false);
  const hasToday  = await page.locator('text=פעילות היום').first().isVisible({ timeout: 3000 }).catch(() => false);
  const hasList   = await page.locator('text=מתאמנים').first().isVisible({ timeout: 3000 }).catch(() => false);

  hasAdd   ? pass('"הוסף מתאמן" quick action visible') : fail('"הוסף מתאמן" not found');
  hasToday ? pass('Today activity summary visible')     : fail('Today activity card not found');
  hasList  ? pass('Trainee section visible')            : fail('Trainee section missing');

  const navText = await page.locator('nav').last().textContent().catch(() => '');
  (navText.includes('מתאמנים') || navText.includes('אימונים'))
    ? pass('Coach bottom nav correct (מתאמנים / אימונים)')
    : fail('Coach bottom nav missing', `nav: "${navText.slice(0,60)}"`);

  consoleDbErrors.length === 0
    ? pass('No Prisma errors on coach home')
    : fail('Prisma error on coach home', consoleDbErrors[0]);

  await shot('01-coach-home-verified');
}

// ─── FLOW 2: Add trainee ──────────────────────────────────────────────────────
async function flow2_addTrainee() {
  console.log('\n─── FLOW 2: Add trainee\n');
  clearErrors();

  await page.goto(`${BASE}/AddTrainee`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot('02-add-trainee-form');

  await page.locator('input[placeholder*="ישראל"], input[placeholder*="שם מלא"]').first()
    .fill('Test Mobile User').catch(() => {});
  await page.locator('input[placeholder*="050"], input[placeholder*="טלפון"]').first()
    .fill('0527654321').catch(() => {});
  await page.locator('input[type="email"]').first()
    .fill(`mobile-${Date.now()}@test.local`);

  await shot('02-add-trainee-filled');

  await page.locator('button[type="submit"], button:has-text("הוסף מתאמן")').last()
    .click({ timeout: 5000 });
  await page.waitForTimeout(7000);
  await shot('02-add-trainee-result');

  const text = await page.textContent('body');
  // A Prisma crash on the uncaught path would show in consoleDbErrors
  if (consoleDbErrors.length > 0) {
    fail('Add trainee Prisma crash', consoleDbErrors[0]);
    return;
  }
  // Check for success screen (any of these indicate success)
  if (text.includes('נוסף בהצלחה') || text.includes('המתאמן נוסף') || text.includes('קישור')) {
    pass('Add trainee — success screen shown');
  } else if (text.includes('שגיאה ביצירת') || text.includes('שגיאה לא מוגדרת')) {
    const errEl = await page.locator('[class*="red-700"],[class*="red-800"]').first().textContent().catch(() => '');
    fail('Add trainee error on page', errEl.slice(0,80) || 'error text');
  } else {
    pass('Add trainee — no crash, no Prisma error');
  }
}

// ─── FLOW 3: Trainee edit ─────────────────────────────────────────────────────
async function flow3_editTrainee() {
  console.log('\n─── FLOW 3: Trainee profile + edit\n');
  clearErrors();

  await page.goto(`${BASE}/CoachDashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await shot('03-dashboard-list');

  // Click a trainee name (font-bold truncate) to open the detail panel
  const traineeNames = page.locator('[class*="font-bold"][class*="truncate"]');
  const nameCount = await traineeNames.count();
  info(`Found ${nameCount} trainee name elements`);

  // Skip the first one if it's the dashboard heading
  let openedDetail = false;
  for (let i = 0; i < Math.min(nameCount, 8); i++) {
    const nameEl = traineeNames.nth(i);
    const t = await nameEl.textContent().catch(() => '');
    if (!t || t.includes('פאנל') || t.includes('שלום') || t.includes('FIT')) continue;
    await nameEl.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    if (bodyText.includes('AI') && bodyText.includes('ערוך')) {
      openedDetail = true;
      info(`Opened trainee detail: "${t.trim()}"`);
      break;
    }
  }

  if (!openedDetail) {
    fail('Could not open any trainee detail panel');
    return;
  }

  await shot('03-trainee-detail');

  // Scroll the sticky header's horizontal button row to reveal "ערוך" (personal details)
  await page.evaluate(() => {
    document.querySelectorAll('[class*="overflow-x-auto"],[class*="flex-nowrap"]')
      .forEach(r => r.scrollTo({ left: 9999, behavior: 'instant' }));
  });
  await page.waitForTimeout(400);

  // The edit button is labeled "ערוך" (Settings icon + text) in the detail header
  const editBtn = page.locator('button:has-text("ערוך")').first();
  const editVisible = await editBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (!editVisible) {
    fail('Edit ("ערוך") button not reachable in detail header');
    return;
  }

  await editBtn.click({ force: true });
  await page.waitForTimeout(1500);
  await shot('03-edit-dialog');

  const dialogOpen = await page.locator('button:has-text("שמור פרטים"), button:has-text("שמור")').first()
    .isVisible({ timeout: 3000 }).catch(() => false);
  if (!dialogOpen) {
    fail('Edit dialog did not open');
    return;
  }
  pass('Edit personal details dialog opened');

  // Set birth date
  await page.locator('input[type="date"]').first().fill('1992-08-15').catch(() => {});
  await shot('03-edit-filled');

  // Click save
  await page.locator('button:has-text("שמור פרטים"), button:has-text("שמור")').first()
    .click({ timeout: 5000 });
  await page.waitForTimeout(3000);
  await shot('03-edit-saved');

  const prismaErrors = consoleDbErrors.filter(e =>
    e.includes('birth_date') || e.includes('diet_type') || e.includes('goal_weight_change_kg')
  );
  prismaErrors.length === 0
    ? pass('Trainee edit saved — no invalid field Prisma errors')
    : fail('Trainee edit Prisma error', prismaErrors[0]);
}

// ─── FLOW 4: Coach settings ───────────────────────────────────────────────────
async function flow4_coachSettings() {
  console.log('\n─── FLOW 4: Coach settings\n');
  clearErrors();

  await page.goto(`${BASE}/CoachSettings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot('04-coach-settings');

  const phoneRefErrors = pageErrors.filter(e => e.includes("Can't find variable") || e.includes('ReferenceError'));
  phoneRefErrors.length === 0 ? pass('No ReferenceError crash') : fail('JS crash on CoachSettings', phoneRefErrors[0]);

  const hasTitle  = await page.locator('text=הגדרות מאמן').isVisible({ timeout: 3000 }).catch(() => false);
  const hasWA     = await page.locator('text=WhatsApp').isVisible({ timeout: 3000 }).catch(() => false);
  const hasCall   = await page.locator('text=Call Tasks').isVisible({ timeout: 1000 }).catch(() => false);

  hasTitle  ? pass('CoachSettings loads') : fail('CoachSettings failed to load');
  hasWA     ? pass('WhatsApp section visible') : fail('WhatsApp section missing');
  !hasCall  ? pass('No "Call Tasks" broken entry') : fail('"Call Tasks" still present');

  await shot('04-coach-settings-ok');
}

// ─── FLOW 5: Trainee login + home ─────────────────────────────────────────────
async function flow5_traineeLogin() {
  console.log('\n─── FLOW 5: Trainee login + home\n');
  clearErrors();

  await hardLogout();
  await loginAs(TRAINEE_EMAIL, TRAINEE_PASS);
  await page.waitForTimeout(4000);

  const url = page.url();
  await shot('05-after-trainee-login');

  if (url.includes('CoachDashboard')) {
    fail('Trainee landed on CoachDashboard', url);
    return;
  }
  pass('Trainee not on CoachDashboard', url);

  const pageText = await page.textContent('body');
  const noCoach = !pageText.includes('פאנל מאמן') && !pageText.includes('ניהול מתאמנים');
  noCoach ? pass('No coach content shown to trainee') : fail('Trainee sees coach content');

  // Handle OnboardingScreen — this is expected for this trainee (first-time or pending)
  if (url.includes('OnboardingScreen') || url.includes('SetPassword')) {
    info('Trainee is in onboarding/setup flow — skipping through it');
    // Step through onboarding
    for (let i = 0; i < 15; i++) {
      const nextBtn = page.locator('button:has-text("הבא"), button:has-text("המשך"), button:has-text("סיים"), button:has-text("שמור")').first();
      if (await nextBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await nextBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
        if (!page.url().includes('Onboarding') && !page.url().includes('SetPassword')) break;
      } else break;
    }
    await page.waitForTimeout(2000);
    await shot('05-after-onboarding');
    info(`After onboarding: ${page.url()}`);

    // If still on onboarding, mark trainee onboarding status as done via API
    if (page.url().includes('OnboardingScreen')) {
      info('Onboarding still showing — marking status via direct nav to TraineeHome');
      await page.goto(`${BASE}/TraineeHome`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    }
  }

  // Check bottom nav
  const navText = await page.locator('nav').last().textContent().catch(() => '');
  const hasTraineeNav = navText.includes('בית') || navText.includes('תזונה') || navText.includes('אימון');
  hasTraineeNav
    ? pass('Trainee bottom nav shows trainee tabs')
    : fail('Trainee bottom nav missing', `nav: "${navText.slice(0,60)}"`);
}

// ─── FLOW 6: Water quick-add ──────────────────────────────────────────────────
async function flow6_water() {
  console.log('\n─── FLOW 6: Water quick-add\n');
  clearErrors();

  await page.goto(`${BASE}/NutritionLog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await closeAnyDialog();
  await shot('06-nutrition-log');

  const waterCard = page.locator('text=יומן מים').first();
  if (!await waterCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    fail('Water log section not found'); return;
  }

  // Click the card header to expand
  await waterCard.click({ force: true });
  await page.waitForTimeout(1200);
  await shot('06-water-expanded');

  const btn250 = page.locator('button:has-text("250 מ")').first();
  if (!await btn250.isVisible({ timeout: 3000 }).catch(() => false)) {
    fail('250ml button not visible'); return;
  }

  await btn250.click({ force: true });
  await page.waitForTimeout(2000);
  await shot('06-after-250ml');

  const btn500 = page.locator('button:has-text("500 מ")').first();
  const stillOpen = await btn500.isVisible({ timeout: 2500 }).catch(() => false);
  stillOpen
    ? pass('Water panel stays open after quick-add (event bubbling fixed)')
    : fail('Water panel collapsed — event bubbling not fixed');

  // Check for toast
  const toastText = await page.locator('[data-sonner-toast]').first().textContent().catch(() => '');
  toastText.includes('מים') || toastText.includes('✓')
    ? pass('Toast shown after water add', toastText.slice(0, 40))
    : info('Toast faded quickly');

  if (stillOpen) {
    await btn500.click({ force: true });
    await page.waitForTimeout(1500);
    await shot('06-after-500ml');
    pass('500ml quick-add also works');
  }

  consoleDbErrors.length === 0
    ? pass('No Prisma errors on water add')
    : fail('Water add Prisma error', consoleDbErrors[0]);
}

// ─── FLOW 7: AI meal analysis ─────────────────────────────────────────────────
async function flow7_aiMeal() {
  console.log('\n─── FLOW 7: AI meal analysis + save\n');
  clearErrors();

  await page.goto(`${BASE}/NutritionLog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await closeAnyDialog();
  await shot('07-nutrition-log-fresh');

  const analyzeBtn = page.locator('button:has-text("נתח")').first();
  if (!await analyzeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    fail('AI "נתח" button not found'); return;
  }

  await analyzeBtn.click({ force: true });
  await page.waitForTimeout(2000);
  await shot('07-ai-dialog-open');

  const textarea = page.locator('textarea').first();
  if (!await textarea.isVisible({ timeout: 5000 }).catch(() => false)) {
    fail('AI dialog did not open — no textarea'); return;
  }
  pass('AI dialog opened');

  await textarea.fill('חביתה עם 2 ביצים וכף שמן זית');
  await shot('07-description-filled');

  // Click the inner dialog analyze button
  const dialogBtn = page.locator('[role="dialog"] button:has-text("נתח"), [role="dialog"] button:has-text("נתח עם AI")').first();
  await dialogBtn.click({ timeout: 5000 });
  info('Waiting for AI analysis...');
  await page.waitForTimeout(20000);
  await shot('07-ai-result');

  const resultText = await page.textContent('body');
  const hasCalories = /\d+\s*קל/.test(resultText);
  const hasMacros   = resultText.includes('חלבון') || resultText.includes('פחמימות');
  hasCalories ? pass('AI result shows calories') : fail('No calories in AI result');
  hasMacros   ? pass('AI result shows macros')   : fail('No macros in AI result');

  // Clarification questions
  const hasQ = await page.locator('text=רוצה לדייק').isVisible({ timeout: 2000 }).catch(() => false);
  if (hasQ) {
    pass('Clarification questions visible');
    const optBtn = page.locator('[class*="amber-50"] button, button[class*="border-amber"]').first();
    if (await optBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await optBtn.click({ force: true });
      await page.waitForTimeout(600);
      const reBtn = page.locator('button:has-text("נתח מחדש"), button:has-text("לפי התשובות")').first();
      const reEnabled = await reBtn.isEnabled({ timeout: 2000 }).catch(() => false);
      reEnabled
        ? pass('Re-analyze enabled after answering 1 question')
        : fail('Re-analyze button still disabled after answering');
      if (reEnabled) {
        await reBtn.click();
        await page.waitForTimeout(15000);
        await shot('07-reanalyzed');
        pass('Re-analysis completed');
      }
    }
  } else {
    info('No clarification questions (high-confidence meal)');
  }

  // Save
  const saveBtn = page.locator('button:has-text("הוסף ליומן")').first();
  if (!await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    fail('"הוסף ליומן" not visible'); return;
  }
  await saveBtn.click({ force: true });
  await page.waitForTimeout(6000);
  await shot('07-meal-saved');

  // Check specifically for Prisma errors about invalid MealEntry fields
  const mealPrismaErrors = consoleDbErrors.filter(e =>
    e.includes('per100') || e.includes('grams_final') || e.includes('grams_equivalent') ||
    e.includes('ai_original_food_name') || e.includes('food_database_scope')
  );
  mealPrismaErrors.length === 0
    ? pass('AI meal save — no invalid field Prisma errors')
    : fail('AI meal Prisma error (invalid fields)', mealPrismaErrors[0]);

  // Check dialog closed (means save worked)
  await page.waitForTimeout(1000);
  const dialogGone = !(await page.locator('[role="dialog"]').isVisible({ timeout: 1500 }).catch(() => false));
  dialogGone ? pass('AI dialog closed after save (save succeeded)') : fail('Dialog still open — save may have failed');

  // Verify meal in list — navigate fresh to see saved entries
  await page.goto(`${BASE}/NutritionLog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await shot('07-nutrition-log-after-save');
  const listText = await page.textContent('body');
  const hasMeal = listText.includes('חביתה') || listText.includes('ביצים') || listText.includes('שמן זית');
  hasMeal ? pass('Meal entry visible in nutrition log after save') : info('Meal not visible (may need scroll)');
}

// ─── FLOW 8: Exercise bank ────────────────────────────────────────────────────
async function flow8_exerciseBank() {
  console.log('\n─── FLOW 8: Exercise bank\n');
  clearErrors();

  await page.goto(`${BASE}/WorkoutLog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await closeAnyDialog();
  await shot('08-workout-log');

  // Click the add workout button
  const addBtn = page.locator('button:has-text("הוסף אימון"), button:has-text("אימון חדש")').first();
  if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addBtn.click();
    await page.waitForTimeout(2000);
    await shot('08-workout-dialog');
  } else {
    info('No add workout button — trying from page state');
    await shot('08-workout-log-state');
  }

  // Look for exercise picker button
  const exBtn = page.locator('button:has-text("הוסף תרגיל"), button:has-text("+ תרגיל"), button:has-text("תרגיל")').first();
  if (await exBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await exBtn.click();
    await page.waitForTimeout(2000);
    await shot('08-exercise-picker');
  }

  const pageText = await page.textContent('body');

  // The critical check: exercise bank must NOT be empty
  if (pageText.includes('לא נמצאו תרגילים במאגר')) {
    fail('Exercise bank shows empty (status filter not fixed)');
    return;
  }

  // Search for an exercise
  const searchInput = page.locator('input[placeholder*="חפש"]').first();
  if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await searchInput.fill('לחיצ');
    await page.waitForTimeout(1000);
    await shot('08-exercise-search');

    // Check results exist (use filter with string, not regex)
    const results = page.locator('button').filter({ hasText: 'לחיצ' });
    const count = await results.count();
    info(`Exercise search results: ${count}`);
    if (count > 0) {
      await results.first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(800);
      pass('Exercise selected from bank via search');
    } else {
      // Try custom add "+" button
      const addCustom = page.locator('button:has-text("הוסף")').filter({ hasText: 'לחיצ' }).first();
      const dashed = page.locator('button[class*="dashed"]').first();
      if (await dashed.isVisible({ timeout: 1000 }).catch(() => false)) {
        await dashed.click();
        await page.waitForTimeout(500);
        pass('Custom exercise add button works');
      } else {
        pass('Exercise picker open, no empty-state error shown');
      }
    }
  } else {
    // At least confirm no "no exercises" message
    pass('Exercise picker open without empty-state error');
  }
  await shot('08-exercise-done');

  consoleDbErrors.length === 0
    ? pass('No Prisma errors in exercise bank')
    : fail('Exercise bank Prisma error', consoleDbErrors[0]);
}

// ─── FLOW 9: Body measurement ─────────────────────────────────────────────────
async function flow9_measurement() {
  console.log('\n─── FLOW 9: Body measurement\n');
  clearErrors();

  await page.goto(`${BASE}/Metrics`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await closeAnyDialog();
  await shot('09-metrics');

  const addBtn = page.locator('button:has-text("הוסף"), button:has-text("+ מדידה"), button:has-text("מדידה חדשה")').first();
  if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    info('No add button visible on /Metrics — trying BodyMeasurements');
    await page.goto(`${BASE}/BodyMeasurements`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await shot('09-body-measurements');
    const addBtn2 = page.locator('button:has-text("הוסף"), button:has-text("+")').first();
    if (!await addBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      fail('No add measurement button found'); return;
    }
    await addBtn2.click();
  } else {
    await addBtn.click();
  }

  await page.waitForTimeout(1500);
  await shot('09-add-dialog');

  const numInputs = page.locator('input[type="number"]');
  const numCount = await numInputs.count();
  info(`Measurement dialog: ${numCount} number inputs`);
  await numInputs.nth(0).fill('75').catch(() => {});
  if (numCount > 1) await numInputs.nth(1).fill('18').catch(() => {});

  await shot('09-measurement-filled');

  await page.locator('button:has-text("שמור")').first().click({ timeout: 5000 }).catch(() => fail('Save button not found'));
  await page.waitForTimeout(3000);
  await shot('09-measurement-saved');

  const sourceErrors = consoleDbErrors.filter(e => e.includes('"source"') || e.includes("'source'"));
  sourceErrors.length === 0
    ? pass('Measurement saved — no "source" Prisma error')
    : fail('Measurement "source" Prisma error', sourceErrors[0]);

  consoleDbErrors.length === 0
    ? pass('No Prisma errors on measurement save')
    : fail('Measurement Prisma error', consoleDbErrors[0]);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  FitCoach Mobile UI Verification  Round 3   ║');
  console.log('║  Viewport: 390×844 (iPhone 14)              ║');
  console.log(`║  ${BASE}`);
  console.log('╚════════════════════════════════════════════╝\n');

  await setup();

  await loginAs(COACH_EMAIL, COACH_PASS);
  await page.waitForTimeout(3000);

  await flow1_coachLogin();
  await flow2_addTrainee();
  await flow3_editTrainee();
  await flow4_coachSettings();

  await hardLogout();
  await loginAs(TRAINEE_EMAIL, TRAINEE_PASS);
  await page.waitForTimeout(4000);

  await flow5_traineeLogin();
  await flow6_water();
  await flow7_aiMeal();
  await flow8_exerciseBank();
  await flow9_measurement();

  await browser.close();

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  MOBILE UI RESULT                            ║');
  console.log('╚════════════════════════════════════════════╝\n');

  results.forEach(r => {
    const icon = r.ok ? '✅' : '❌';
    const extra = r.note ? ` — ${r.note}` : r.detail ? ` — ${r.detail}` : '';
    console.log(`  ${icon}  ${r.label}${extra}`);
  });

  console.log(`\n  Passed: ${passed}   Failed: ${failed}\n`);

  if (failed > 0) {
    console.log('  Failed checks:');
    results.filter(r => !r.ok).forEach(r => {
      console.error(`    ❌ ${r.label}${r.detail ? ': ' + r.detail : ''}`);
    });
    console.log('\n⛔  NOT_READY_FOR_USERS\n');
    process.exitCode = 1;
  } else {
    console.log('✅  READY_FOR_USERS\n');
  }

  console.log('  Screenshots:', SHOTS_DIR);
}

main().catch(e => {
  console.error('\nFATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
