/**
 * verify-live.mjs
 * Drives the real deployed app, takes screenshots, checks API for DB writes.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const BASE = 'https://fitcoach-frontend-omega.vercel.app';
const API  = 'https://fitcoach-server-production-19e8.up.railway.app/api';
const DIR  = './pw-shots/live-verify';

const COACH_EMAIL = 'admin@fitcoach.local';
const COACH_PASS  = 'Admin123!';
const TRAINEE_EMAIL = 'edengoldenberg+e2e@gmail.com';
const TRAINEE_PASS  = 'E2ETest123!';

let browser, ctx, page;
let shotNum = 0;
const shots = [];
const log = [];

async function shot(label) {
  const name = `${String(shotNum++).padStart(3,'0')}-${label.replace(/[^a-z0-9]/gi,'-')}.png`;
  const path = `${DIR}/${name}`;
  await page.screenshot({ path, fullPage: false });
  shots.push({ path, label });
  console.log(`  📸  ${name}`);
  return path;
}

function note(msg) { log.push(msg); console.log(`  →  ${msg}`); }

async function setup() {
  await mkdir(DIR, { recursive: true });
  browser = await chromium.launch({ headless: true });
  ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
  });
  page = await ctx.newPage();

  // Collect ALL console errors and page errors for inspection
  ctx._allErrors = [];
  page.on('console', m => {
    if (m.type() === 'error') ctx._allErrors.push({ type: 'console', text: m.text() });
  });
  page.on('pageerror', e => ctx._allErrors.push({ type: 'pageerror', text: e.message }));
}

function getErrors() { return ctx._allErrors.splice(0); }

async function apiLogin(email, password) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const d = await r.json();
  return d.access_token;
}

async function hardLogout() {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await ctx.clearCookies();
}

async function loginViaUI(email, password) {
  await page.goto(`${BASE}/LoginWithPassword`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  getErrors(); // clear
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
}

// ─── FLOW 1: Coach home ───────────────────────────────────────────────────────
async function testCoachHome() {
  console.log('\n══ FLOW 1: Coach login + home ══\n');
  await loginViaUI(COACH_EMAIL, COACH_PASS);
  const url = page.url();
  note(`URL after login: ${url}`);
  await shot('coach-home');
  const errs = getErrors();
  note(`Errors after login: ${errs.length} — ${errs.map(e=>e.text.slice(0,80)).join(' | ') || 'none'}`);
  return { url, errs, path: shots.at(-1).path };
}

// ─── FLOW 2: Add trainee ──────────────────────────────────────────────────────
async function testAddTrainee(coachToken) {
  console.log('\n══ FLOW 2: Add trainee ══\n');
  await page.goto(`${BASE}/AddTrainee`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot('add-trainee-form');

  const ts = Date.now();
  const testEmail = `live-test-${ts}@test.local`;
  await page.locator('input[placeholder*="ישראל"], input[placeholder*="שם מלא"]').first().fill('Live Test User').catch(() => {});
  await page.locator('input[placeholder*="050"]').first().fill('0527654321').catch(() => {});
  await page.locator('input[type="email"]').first().fill(testEmail);
  await shot('add-trainee-filled');

  getErrors();
  await page.locator('button[type="submit"], button:has-text("הוסף מתאמן")').last().click({ timeout: 5000 });
  await page.waitForTimeout(8000);
  await shot('add-trainee-result');
  const errs = getErrors();
  const text = await page.textContent('body');
  const pageUrl = page.url();

  // Check DB for the new trainee
  let dbRecord = null;
  try {
    const r = await fetch(`${API}/entities/Trainee?user_email=${encodeURIComponent(testEmail)}`, {
      headers: { Authorization: `Bearer ${coachToken}` },
    });
    const data = await r.json();
    dbRecord = data[0] || null;
  } catch {}

  note(`Prisma errors: ${errs.filter(e=>e.text.includes('Unknown')||e.text.includes('prisma')).map(e=>e.text.slice(0,100)).join(' | ') || 'none'}`);
  note(`Success text visible: ${text.includes('נוסף בהצלחה') || text.includes('המתאמן נוסף')}`);
  note(`DB record created: ${dbRecord ? `id=${dbRecord.id}` : 'NOT FOUND'}`);
  note(`Error text on page: ${text.includes('שגיאה') ? 'YES' : 'no'}`);

  return { errs, dbRecord, text, path: shots.at(-1).path };
}

// ─── FLOW 3: Edit trainee ─────────────────────────────────────────────────────
async function testEditTrainee() {
  console.log('\n══ FLOW 3: Edit trainee ══\n');
  await page.goto(`${BASE}/CoachDashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await shot('coach-dashboard-list');

  // Click first trainee name to open detail
  const nameEl = page.locator('[class*="font-bold"][class*="truncate"]').first();
  const nameText = await nameEl.textContent().catch(() => '?');
  note(`Clicking trainee: "${nameText}"`);
  await nameEl.click({ force: true });
  await page.waitForTimeout(2500);
  await shot('trainee-detail-open');

  // Scroll button row
  await page.evaluate(() => {
    document.querySelectorAll('[class*="overflow-x-auto"],[class*="flex-nowrap"]')
      .forEach(r => r.scrollTo({ left: 9999, behavior: 'instant' }));
  });
  await page.waitForTimeout(400);

  getErrors();
  const editBtn = page.locator('button:has-text("ערוך")').first();
  await editBtn.click({ force: true, timeout: 3000 });
  await page.waitForTimeout(1500);
  await shot('edit-dialog-open');

  await page.locator('input[type="date"]').first().fill('1991-04-10').catch(() => {});
  await shot('edit-dialog-filled');
  await page.locator('button:has-text("שמור פרטים"), button:has-text("שמור")').first().click({ timeout: 5000 });
  await page.waitForTimeout(3500);
  await shot('edit-saved');

  const errs = getErrors();
  const fieldErrs = errs.filter(e => e.text.includes('birth_date') || e.text.includes('diet_type') || e.text.includes('Unknown field'));
  note(`Field-error Prisma errors: ${fieldErrs.map(e=>e.text.slice(0,100)).join(' | ') || 'none'}`);
  note(`All errors: ${errs.map(e=>e.text.slice(0,80)).join(' | ') || 'none'}`);

  return { errs, fieldErrs, path: shots.at(-1).path };
}

// ─── FLOW 4: CoachSettings ────────────────────────────────────────────────────
async function testCoachSettings() {
  console.log('\n══ FLOW 4: CoachSettings ══\n');
  getErrors();
  await page.goto(`${BASE}/CoachSettings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await shot('coach-settings');

  const errs = getErrors();
  const phoneErr = errs.filter(e => e.text.includes("Can't find variable") || e.text.includes('ReferenceError'));
  const text = await page.textContent('body');

  note(`ReferenceError/Phone crash: ${phoneErr.map(e=>e.text.slice(0,100)).join(' | ') || 'NONE'}`);
  note(`Page loaded (has הגדרות מאמן): ${text.includes('הגדרות מאמן')}`);
  note(`WhatsApp visible: ${text.includes('WhatsApp')}`);
  note(`Call Tasks visible: ${text.includes('Call Tasks')}`);
  note(`All errors: ${errs.map(e=>e.text.slice(0,80)).join(' | ') || 'none'}`);

  return { errs, phoneErr, text, path: shots.at(-1).path };
}

// ─── FLOW 5: Exercise bank ────────────────────────────────────────────────────
async function testExerciseBank(coachToken) {
  console.log('\n══ FLOW 5: Exercise bank ══\n');

  // First check DB for exercises
  let exerciseCount = 0;
  try {
    const r = await fetch(`${API}/entities/Exercise?_limit=5`, {
      headers: { Authorization: `Bearer ${coachToken}` },
    });
    const data = await r.json();
    exerciseCount = Array.isArray(data) ? data.length : 0;
    note(`DB exercises (top 5): ${data.map(e=>e.name_he||e.name).join(', ')}`);
  } catch {}

  await page.goto(`${BASE}/WorkoutLog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await shot('workout-log');

  // Open workout dialog
  const addBtn = page.locator('button:has-text("הוסף אימון")').first();
  if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addBtn.click();
    await page.waitForTimeout(2000);
    await shot('workout-dialog');
  }

  // Click add exercise
  const exBtn = page.locator('button:has-text("הוסף תרגיל"), button:has-text("+ תרגיל")').first();
  if (await exBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await exBtn.click();
    await page.waitForTimeout(2000);
  }
  await shot('exercise-picker');
  const text = await page.textContent('body');
  note(`DB exercise count: ${exerciseCount}`);
  note(`Empty state shown: ${text.includes('לא נמצאו תרגילים במאגר')}`);
  note(`Exercises in picker: ${!text.includes('לא נמצאו תרגילים במאגר')}`);

  return { exerciseCount, emptyShown: text.includes('לא נמצאו תרגילים'), path: shots.at(-1).path };
}

// ─── FLOW 6: Trainee login ────────────────────────────────────────────────────
async function testTraineeLogin() {
  console.log('\n══ FLOW 6: Trainee login + home ══\n');
  await hardLogout();
  await loginViaUI(TRAINEE_EMAIL, TRAINEE_PASS);
  const url = page.url();
  note(`Trainee URL after login: ${url}`);
  await shot('trainee-home');
  const errs = getErrors();
  note(`Errors: ${errs.map(e=>e.text.slice(0,80)).join(' | ') || 'none'}`);
  return { url, path: shots.at(-1).path };
}

// ─── FLOW 7: Water ────────────────────────────────────────────────────────────
async function testWater(traineeToken) {
  console.log('\n══ FLOW 7: Water quick-add ══\n');
  await page.goto(`${BASE}/NutritionLog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await shot('nutrition-log');

  const waterSection = page.locator('text=יומן מים').first();
  await waterSection.click({ force: true });
  await page.waitForTimeout(1200);
  await shot('water-expanded');

  const btn250 = page.locator('button:has-text("250 מ")').first();
  getErrors();
  await btn250.click({ force: true });
  await page.waitForTimeout(2500);
  await shot('water-after-250');

  const stillOpen = await page.locator('button:has-text("500 מ")').isVisible({ timeout: 2000 }).catch(() => false);
  const errs = getErrors();
  note(`Panel stays open after 250ml: ${stillOpen}`);
  note(`Prisma errors: ${errs.filter(e=>e.text.includes('prisma')||e.text.includes('Unknown')).map(e=>e.text.slice(0,80)).join(' | ') || 'none'}`);

  // Verify DB write
  let waterEntry = null;
  const today = new Date().toISOString().split('T')[0];
  try {
    const r = await fetch(`${API}/entities/WaterEntry?date=${today}`, {
      headers: { Authorization: `Bearer ${traineeToken}` },
    });
    const data = await r.json();
    waterEntry = Array.isArray(data) ? data.find(w => w.amount_ml === 250) : null;
    note(`DB WaterEntry (250ml): ${waterEntry ? `id=${waterEntry.id} amount=${waterEntry.amount_ml}` : 'NOT FOUND'}`);
  } catch (e) { note(`DB check error: ${e.message}`); }

  return { stillOpen, errs, waterEntry, path: shots.at(-1).path };
}

// ─── FLOW 8: AI meal ──────────────────────────────────────────────────────────
async function testAIMeal(traineeToken) {
  console.log('\n══ FLOW 8: AI meal analysis + save ══\n');
  await page.goto(`${BASE}/NutritionLog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await page.keyboard.press('Escape'); // close any open dialog

  const analyzeBtn = page.locator('button:has-text("נתח")').first();
  await analyzeBtn.click({ force: true });
  await page.waitForTimeout(2000);
  await shot('ai-dialog-open');

  const textarea = page.locator('textarea').first();
  await textarea.fill('חביתה עם 2 ביצים וכף שמן זית');
  await shot('ai-filled');

  const dialogBtn = page.locator('[role="dialog"] button:has-text("נתח"), [role="dialog"] button:has-text("נתח עם AI")').first();
  getErrors();
  await dialogBtn.click({ timeout: 5000 });
  note('AI analysis started...');
  await page.waitForTimeout(20000);
  await shot('ai-result');

  const text1 = await page.textContent('body');
  const hasCalories = /\d+\s*קל/.test(text1);
  const hasMacros   = text1.includes('חלבון');
  const hasQuestions = text1.includes('רוצה לדייק') || text1.includes('ענה על');
  note(`AI result - calories: ${hasCalories}, macros: ${hasMacros}, clarification: ${hasQuestions}`);

  // Answer clarification if present
  if (hasQuestions) {
    await shot('ai-clarification-questions');
    const optBtn = page.locator('[class*="amber"] button, button[class*="border-amber"]').first();
    if (await optBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await optBtn.click({ force: true });
      await page.waitForTimeout(600);
      await shot('ai-question-answered');
      const reBtn = page.locator('button:has-text("נתח מחדש"), button:has-text("לפי התשובות")').first();
      if (await reBtn.isEnabled({ timeout: 2000 }).catch(() => false)) {
        note('Re-analyze button enabled after 1 answer ✓');
        await reBtn.click();
        await page.waitForTimeout(15000);
        await shot('ai-reanalyzed');
      }
    }
  }

  // Save to diary
  const saveBtn = page.locator('button:has-text("הוסף ליומן")').first();
  await shot('ai-before-save');
  await saveBtn.click({ force: true, timeout: 5000 });
  await page.waitForTimeout(6000);
  await shot('ai-after-save');

  const errs = getErrors();
  const prismaErr = errs.filter(e =>
    e.text.includes('per100') || e.text.includes('grams_final') ||
    e.text.includes('Unknown field') || e.text.includes('Unknown argument') ||
    e.text.includes('ai_original_food_name') || e.text.includes('food_database_scope') ||
    e.text.includes('prisma')
  );
  note(`Prisma errors on save: ${prismaErr.map(e=>e.text.slice(0,120)).join(' | ') || 'none'}`);

  const dialogGone = !(await page.locator('[role="dialog"]').isVisible({ timeout: 1500 }).catch(() => false));
  note(`Dialog closed after save (success indicator): ${dialogGone}`);

  // Verify DB write
  await page.goto(`${BASE}/NutritionLog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await shot('nutrition-log-after-save');
  const today = new Date().toISOString().split('T')[0];
  let mealEntry = null;
  try {
    const r = await fetch(`${API}/entities/MealEntry?date=${today}`, {
      headers: { Authorization: `Bearer ${traineeToken}` },
    });
    const data = await r.json();
    mealEntry = Array.isArray(data) ? data.find(m => m.food_name && (m.food_name.includes('חביתה') || m.food_name.includes('ביצה') || m.food_name.includes('שמן'))) : null;
    const recent = Array.isArray(data) ? data.slice(0, 3).map(m => `${m.food_name}(${m.calories}kcal)`) : [];
    note(`DB meals today (recent): ${recent.join(', ')}`);
    note(`Meal entry (חביתה/ביצה): ${mealEntry ? `id=${mealEntry.id} cal=${mealEntry.calories}` : 'NOT FOUND in today'}`);
  } catch (e) { note(`DB check error: ${e.message}`); }

  return { hasCalories, hasMacros, hasQuestions, prismaErr, dialogGone, mealEntry, path: shots.at(-1).path };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  LIVE MOBILE VERIFICATION             ║');
  console.log(`║  ${BASE}  ║`);
  console.log('╚══════════════════════════════════════╝\n');

  await setup();

  const coachToken = await apiLogin(COACH_EMAIL, COACH_PASS);
  note(`Coach API token obtained: ${!!coachToken}`);

  // Coach flows
  const r1 = await testCoachHome();
  const r2 = await testAddTrainee(coachToken);
  const r3 = await testEditTrainee();
  const r4 = await testCoachSettings();
  const r5 = await testExerciseBank(coachToken);

  // Trainee flows
  const r6 = await testTraineeLogin();
  const traineeToken = await apiLogin(TRAINEE_EMAIL, TRAINEE_PASS);
  const r7 = await testWater(traineeToken);
  const r8 = await testAIMeal(traineeToken);

  await browser.close();

  // Summary
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║  RESULTS                              ║');
  console.log('╚══════════════════════════════════════╝\n');
  console.log('Log:\n' + log.map(l=>'  '+l).join('\n'));
  console.log('\nScreenshots:\n' + shots.map(s=>`  ${s.path}`).join('\n'));

  // Write results JSON for analysis
  await writeFile(`${DIR}/results.json`, JSON.stringify({ r1,r2,r3,r4,r5,r6,r7,r8, log, shots: shots.map(s=>s.path) }, null, 2));
  console.log(`\nResults saved to ${DIR}/results.json`);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
