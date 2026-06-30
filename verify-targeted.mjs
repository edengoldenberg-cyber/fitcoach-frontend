/**
 * verify-targeted.mjs
 * Targeted checks for remaining unverified flows:
 *   A. Exercise bank — tested as TRAINEE (not coach)
 *   B. Meal list visible after AI save — scroll down to verify
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const BASE = 'https://fitcoach-frontend-omega.vercel.app';
const API  = 'https://fitcoach-server-production-19e8.up.railway.app/api';
const DIR  = './pw-shots/targeted';

const TRAINEE_EMAIL = 'edengoldenberg+e2e@gmail.com';
const TRAINEE_PASS  = 'E2ETest123!';

let browser, ctx, page;
let n = 0;
async function shot(label) {
  const f = `${DIR}/${String(n++).padStart(3,'0')}-${label.replace(/[^a-z0-9]/gi,'-')}.png`;
  await page.screenshot({ path: f, fullPage: false });
  console.log(`  📸  ${f}`);
  return f;
}
function note(m) { console.log(`  →  ${m}`); }

async function setup() {
  await mkdir(DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });
  ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
  });
  page = await ctx.newPage();
  ctx._errs = [];
  page.on('console', m => { if (m.type()==='error') ctx._errs.push(m.text()); });
  page.on('pageerror', e => ctx._errs.push(e.message));
}
function errs() { return ctx._errs.splice(0); }

async function loginTrainee() {
  await page.goto(`${BASE}/LoginWithPassword`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', TRAINEE_EMAIL);
  await page.fill('input[type="password"]', TRAINEE_PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  note(`Trainee URL after login: ${page.url()}`);
  // Navigate past onboarding if stuck
  if (page.url().includes('Onboarding') || page.url().includes('SetPassword')) {
    note('Bypassing onboarding → navigating directly to target pages');
    // Mark onboarding complete via API
    const token = await (await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TRAINEE_EMAIL, password: TRAINEE_PASS }),
    })).json().then(d => d.access_token);

    if (token) {
      // Find trainee record and mark onboarding complete
      const trainees = await fetch(`${API}/entities/Trainee`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      const trainee = Array.isArray(trainees) ? trainees[0] : null;
      if (trainee) {
        await fetch(`${API}/entities/Trainee/${trainee.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ onboarding_status: 'completed' }),
        });
        note(`Onboarding marked complete for trainee ${trainee.id}`);
      }
      // Store token in localStorage so app recognises it
      await page.evaluate((t) => { localStorage.setItem('fitcoach_token', t); }, token);
    }
    await page.goto(`${BASE}/WorkoutLog`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
  }
}

// ── A: Exercise bank as trainee ───────────────────────────────────────────────
async function testExerciseBank() {
  console.log('\n══ A: Exercise bank (as TRAINEE) ══\n');

  await page.goto(`${BASE}/WorkoutLog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const urlA = page.url();
  const textA = await page.textContent('body');
  note(`WorkoutLog URL: ${urlA}`);
  note(`RouteGuard blocked ("טוען הרשאות"): ${textA.includes('טוען הרשאות')}`);
  note(`Page loaded (has אימון/תרגיל): ${textA.includes('אימון') || textA.includes('תרגיל')}`);
  await shot('A-workout-log');

  // Try to open add-workout dialog
  const addBtn = page.locator('button:has-text("הוסף אימון"), button:has-text("+ אימון"), button:has-text("אימון חדש")').first();
  const addVisible = await addBtn.isVisible({ timeout: 4000 }).catch(() => false);
  note(`Add workout button visible: ${addVisible}`);
  if (addVisible) {
    await addBtn.click();
    await page.waitForTimeout(2000);
    await shot('A-add-workout-dialog');

    // Click add exercise
    const exBtn = page.locator('button:has-text("הוסף תרגיל"), button:has-text("+ תרגיל")').first();
    if (await exBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await exBtn.click();
      await page.waitForTimeout(2000);
      await shot('A-exercise-picker-open');
    }
  }

  // Check exercise picker state
  const text = await page.textContent('body');
  const empty = text.includes('לא נמצאו תרגילים במאגר');
  const hasExercises = text.includes('לחיצת') || text.includes('מתח') || text.includes('סקוואט') || text.includes('דדליפט');
  note(`Exercise picker empty state: ${empty}`);
  note(`Exercise names visible: ${hasExercises}`);
  await shot('A-exercise-bank-state');

  // Try searching
  const searchInput = page.locator('input[placeholder*="חפש"]').first();
  if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await searchInput.fill('לחיצת');
    await page.waitForTimeout(1200);
    await shot('A-exercise-search');
    const afterSearch = await page.textContent('body');
    const searchResults = afterSearch.includes('לחיצת');
    note(`Search "לחיצת" found results: ${searchResults}`);

    // Try clicking first result
    const firstResult = page.locator('button:has-text("לחיצת")').first();
    if (await firstResult.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstResult.click();
      await page.waitForTimeout(1000);
      await shot('A-exercise-selected');
      note('Exercise selected from bank ✓');
    }
  }

  const e = errs().filter(e => e.includes('Unknown')||e.includes('prisma')||e.includes('empty'));
  note(`Prisma/errors: ${e.length ? e[0].slice(0,100) : 'none'}`);
}

// ── B: Meal list visible after AI save ────────────────────────────────────────
async function testMealListVisible() {
  console.log('\n══ B: Meal list visible in NutritionLog ══\n');

  await page.goto(`${BASE}/NutritionLog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await shot('B-nutrition-top');

  // Scroll down to where meal list should be
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(1000);
  await shot('B-nutrition-scrolled-1');

  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(1000);
  await shot('B-nutrition-scrolled-2');

  const text = await page.textContent('body');
  const hasMeals = text.includes('ביצה') || text.includes('חביתה') || text.includes('שמן זית');
  const hasMealType = text.includes('ארוחת צהריים') || text.includes('ארוחת בוקר') || text.includes('ארוחת ערב') || text.includes('חטיפים');
  note(`Meal entries visible (ביצה/חביתה/שמן זית): ${hasMeals}`);
  note(`Meal type labels visible: ${hasMealType}`);

  // Check today's totals
  const calories = text.match(/(\d+)\s*קל/)?.[1];
  note(`Calories shown in total: ${calories || 'not found'}`);

  // Also check via API
  const token = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TRAINEE_EMAIL, password: TRAINEE_PASS }),
  }).then(r => r.json()).then(d => d.access_token);

  const today = new Date().toISOString().split('T')[0];
  const meals = await fetch(`${API}/entities/MealEntry?date=${today}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json()).catch(() => []);

  note(`DB MealEntry count today: ${Array.isArray(meals) ? meals.length : 'error'}`);
  if (Array.isArray(meals)) {
    meals.slice(0, 5).forEach(m => note(`  DB meal: "${m.food_name}" ${m.calories}kcal id=${m.id}`));
  }
}

async function main() {
  console.log('╔═══════════════════════════════╗');
  console.log('║  TARGETED VERIFICATION         ║');
  console.log('╚═══════════════════════════════╝\n');
  await setup();
  await loginTrainee();
  await testExerciseBank();
  await testMealListVisible();
  await browser.close();
  console.log('\nDone. Screenshots in', DIR);
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
