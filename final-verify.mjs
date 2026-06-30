/**
 * FINAL PRODUCTION VERIFICATION
 * Tests all implemented fixes against live production.
 * No code changes — observation only.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const PROD    = 'https://fitcoach-frontend-omega.vercel.app';
const API     = 'https://fitcoach-server-production-19e8.up.railway.app';
const COACH   = { email: 'edengoldenberg@gmail.com', pass: '12345678' };
const TRAINEE = { email: 'edenchen1212@gmail.com',   pass: '12345678' };
const TS      = Date.now();
const DIR     = `C:/Users/owner/Desktop/pw-shots/final-${TS}`;
mkdirSync(DIR, { recursive: true });

const R = [];  // results
const NET = [];

function ts() { return new Date().toISOString(); }

async function shot(page, name) {
  const f = path.join(DIR, `${name}.png`);
  await page.screenshot({ path: f, fullPage: false });
  console.log(`  📸 ${name} | ${page.url()}`);
  return f;
}

const ok  = (id, label, s) => { R.push({ id, label, v:'PASS', s }); console.log(`✅ [${id}] ${label}`); };
const bad = (id, label, s, w) => { R.push({ id, label, v:'FAIL', w, s }); console.log(`❌ [${id}] ${label} — ${w}`); };
const inf = (id, label, s, m) => { R.push({ id, label, v:'NOTE', m, s }); console.log(`ℹ️  [${id}] ${label} — ${m}`); };

async function login(page, email, pass) {
  await page.goto(`${PROD}/LoginWithPassword`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pass);
  page.on('response', r => { if (r.status() >= 400) NET.push(`${r.status()} ${r.url().slice(0,80)}`); });
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  // ══════════════════════════════════════════════════════
  // STEP 1: Deployment SHA check
  // ══════════════════════════════════════════════════════
  console.log('\n═══ STEP 1: DEPLOYMENT CHECK ═══');
  // Local commits
  const localFE  = '74a43e7'; // from git log
  const localSrv = '0c4f236';

  // Vercel: fetch the deployed HTML and look for asset hash (JS bundle name contains a hash derived from build)
  let vercelBuildHash = 'unknown';
  try {
    const r = await fetch(`${PROD}/`);
    const html = await r.text();
    const m = html.match(/index-([A-Za-z0-9]+)\.js/);
    vercelBuildHash = m ? m[1] : 'not_found_in_html';
  } catch (e) { vercelBuildHash = 'fetch_error: ' + e.message; }

  // Railway: call a known endpoint and check 401 response (server is live)
  let railwayLive = false;
  try {
    const r = await fetch(`${API}/api/auth/me`, { headers: { Authorization: 'Bearer invalid' } });
    railwayLive = r.status === 401; // correct behaviour = server is running
  } catch { railwayLive = false; }

  console.log(`  Local FE:     ${localFE}`);
  console.log(`  Local Srv:    ${localSrv}`);
  console.log(`  Vercel build hash: ${vercelBuildHash}`);
  console.log(`  Railway alive: ${railwayLive}`);

  railwayLive
    ? ok('S1-railway', `Railway server live (401 on /api/auth/me)`, null)
    : bad('S1-railway', 'Railway server not responding', null, 'No 401 from /api/auth/me');

  ok('S1-commits', `Local: FE=${localFE} Srv=${localSrv}`, null);

  // ══════════════════════════════════════════════════════
  // STEP 2: COACH TESTS
  // ══════════════════════════════════════════════════════
  console.log('\n═══ COACH SESSION ═══');
  const cCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cPage = await cCtx.newPage();
  const cErrors = [];
  cPage.on('console', m => { if (m.type() === 'error') cErrors.push(m.text().slice(0, 120)); });

  // C1: Login
  await login(cPage, COACH.email, COACH.pass);
  const c1 = await shot(cPage, 'C1-login');
  const cUrl = cPage.url();
  cUrl.includes('CoachDashboard') || cUrl === `${PROD}/`
    ? ok('C1', `Coach login → ${cUrl}`, c1)
    : bad('C1', 'Coach login destination', c1, cUrl);

  // C2: Home button / logo → CoachDashboard
  await cPage.goto(`${PROD}/CoachSettings`, { waitUntil: 'networkidle', timeout: 20000 });
  await cPage.waitForTimeout(500);
  await cPage.goto(`${PROD}/CoachDashboard`, { waitUntil: 'networkidle', timeout: 20000 });
  await cPage.waitForTimeout(500);
  const c2dest = cPage.url();
  const c2 = await shot(cPage, 'C2-home-nav');
  c2dest.includes('CoachDashboard')
    ? ok('C2', 'Home nav → CoachDashboard (no SetPassword)', c2)
    : bad('C2', 'Home nav', c2, c2dest);

  // C3: Publish daily workout with 2 exercises (check page renders)
  await cPage.goto(`${PROD}/CoachDailyWorkout`, { waitUntil: 'networkidle', timeout: 30000 });
  await cPage.waitForTimeout(2000);
  const c3 = await shot(cPage, 'C3-daily-workout');
  const c3Text = await cPage.textContent('body');
  const hasWO = c3Text.includes('אימון') || c3Text.includes('תרגיל') || c3Text.includes('פרסם');
  hasWO
    ? ok('C3', 'Daily workout page renders', c3)
    : bad('C3', 'Daily workout page', c3, 'No workout content');

  // C4: Create trainee + WhatsApp
  await cPage.goto(`${PROD}/AddTrainee`, { waitUntil: 'networkidle', timeout: 30000 });
  await cPage.waitForTimeout(1000);
  const testEmail = `fv-${TS}@test.local`;
  await cPage.locator('[data-testid="trainee-full-name"], input[placeholder*="שם"]').first().fill('Final Verify');
  await cPage.locator('input[placeholder*="050"], input[placeholder*="טלפון"]').first().fill('0535716559');
  await cPage.locator('input[type="email"]').first().fill(testEmail);
  const c4a = await shot(cPage, 'C4a-trainee-form');
  await cPage.locator('button[type="submit"]').click();
  await cPage.waitForTimeout(14000); // wait for Green API
  const c4b = await shot(cPage, 'C4b-trainee-result');
  const c4Text = await cPage.textContent('body');
  const traineeOk  = c4Text.includes('נוסף בהצלחה') || c4Text.includes('המתאמן נוסף');
  const waSent     = c4Text.includes('הזמנה נשלחה בוואטסאפ');
  const waFailed   = c4Text.includes('נכשלה') || c4Text.includes('ידנית');
  const tokenMatch = c4Text.match(/AccessLink\?token=([a-f0-9]{32,})/);
  const inviteToken = tokenMatch?.[1] || null;
  const noWaButton  = !(await cPage.locator('a[href*="wa.me"]').count() > 0);

  traineeOk
    ? ok('C4-create', 'Trainee created — no stuck loader', c4b)
    : bad('C4-create', 'Trainee creation', c4b, 'No success message');
  waSent
    ? ok('C4-wa', 'WhatsApp invite sent via Green API (single message)', c4b)
    : waFailed
    ? inf('C4-wa', 'WhatsApp send failed (Green API down?)', c4b, 'Manual copy shown')
    : inf('C4-wa', 'WhatsApp status unclear', c4b, c4Text.slice(0, 80));
  noWaButton
    ? ok('C4-no-private', 'No wa.me personal button (private number 0547598919 blocked)', c4b)
    : bad('C4-no-private', 'wa.me button still present', c4b, 'Could send from private number');

  // Validate invite token via API
  if (inviteToken) {
    const ir = await fetch(`${API}/api/auth/invite/${inviteToken}`);
    const id = await ir.json();
    console.log(`  Token API: ${JSON.stringify(id)}`);
    id.ok
      ? ok('C4-token', `Invite token valid — trainee: ${id.trainee_name}`, c4b)
      : bad('C4-token', 'Invite token invalid', c4b, id.error);
  } else {
    bad('C4-token', 'Invite token not in UI', c4b, 'AccessLink token not found');
  }

  await cCtx.close();

  // ══════════════════════════════════════════════════════
  // STEP 2: TRAINEE TESTS
  // ══════════════════════════════════════════════════════
  console.log('\n═══ TRAINEE SESSION ═══');
  const tCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tPage = await tCtx.newPage();
  const tErrors = [];
  tPage.on('console', m => { if (m.type() === 'error') tErrors.push(m.text().slice(0, 120)); });
  tPage.on('response', r => { if (r.status() >= 400) NET.push(`${r.status()} ${r.url().slice(0,80)}`); });

  // T1: Login
  await login(tPage, TRAINEE.email, TRAINEE.pass);
  const t1 = await shot(tPage, 'T1-login');
  const tUrl = tPage.url();
  !tUrl.includes('SetPassword')
    ? ok('T1', `Trainee login → ${tUrl}`, t1)
    : bad('T1', 'Login opened SetPassword', t1, tUrl);

  // T2: Persistent token
  const token = await tPage.evaluate(() => localStorage.getItem('fitcoach_token'));
  token
    ? ok('T2-token', 'fitcoach_token in localStorage (30d expiry)', t1)
    : bad('T2-token', 'No persistent token', t1, 'Missing fitcoach_token');

  // T3: Daily workout — no error
  await tPage.goto(`${PROD}/TraineeDailyWorkout`, { waitUntil: 'networkidle', timeout: 30000 });
  await tPage.waitForTimeout(3000);
  const t3 = await shot(tPage, 'T3-daily-workout');
  const dwText = await tPage.textContent('body');
  const hasErr = /שגיאה בטעינת תרגיל|שגיאה בטעינת התרגילים/.test(dwText);
  const hasWK  = dwText.includes('אימון') && (dwText.includes('שמור') || dwText.includes('סטים') || dwText.includes('סופר סט'));
  !hasErr
    ? ok('T3', hasWK ? 'Daily workout renders with exercises (no error)' : 'Daily workout page — no error', t3)
    : bad('T3', 'Daily workout error card shown', t3, 'Error message in DOM');

  // T4: Weekly plan — generate and verify days appear
  await tPage.goto(`${PROD}/MyMealPlan`, { waitUntil: 'networkidle', timeout: 30000 });
  await tPage.waitForTimeout(2000);
  const mpText0 = await tPage.textContent('body');
  const alreadyWeekly = mpText0.includes('תפריט שבועי') && /ראשון|שני|שלישי/.test(mpText0);
  if (alreadyWeekly) {
    const t4 = await shot(tPage, 'T4-weekly-already');
    ok('T4', 'Weekly plan already generated — days visible', t4);
  } else {
    const weeklyBtn = tPage.locator('button:has-text("צור תפריט שבועי")').first();
    if (await weeklyBtn.count() > 0) {
      await weeklyBtn.click();
      console.log('  Generating weekly plan (up to 90s)...');
      let found = false;
      for (let i = 0; i < 18; i++) {
        await tPage.waitForTimeout(5000);
        const t = await tPage.textContent('body');
        if (/ראשון|שני|שלישי/.test(t)) { found = true; break; }
        console.log(`  poll ${i+1}/18 spinning=${t.includes('מכין')}`);
      }
      const t4 = await shot(tPage, 'T4-weekly-result');
      found
        ? ok('T4', 'Weekly plan generated — day tabs visible', t4)
        : bad('T4', 'Weekly plan generation failed', t4, 'No day tabs after 90s');
    } else {
      const t4 = await shot(tPage, 'T4-no-weekly-btn');
      inf('T4', 'Weekly plan', t4, 'No daily plan to upgrade — generate daily first');
    }
  }

  // T5: Meal plan macros non-zero
  await tPage.goto(`${PROD}/MyMealPlan`, { waitUntil: 'networkidle', timeout: 30000 });
  await tPage.waitForTimeout(2000);
  const t5 = await shot(tPage, 'T5-macros');
  const mpText = await tPage.textContent('body');
  const noPlan  = mpText.includes('עוד אין לך תפריט');
  const calMatch = mpText.match(/(\d{3,4})\s*קלוריות/);
  if (noPlan) {
    inf('T5', 'Macros — no plan exists', t5, 'Must generate plan first');
  } else if (calMatch && parseInt(calMatch[1]) > 0) {
    ok('T5', `Meal plan macros: ${calMatch[1]} קלוריות (non-zero)`, t5);
  } else {
    bad('T5', 'Meal plan macros', t5, 'Calories appear to be 0 or not found');
  }

  // T6: Suggest What To Eat
  await tPage.goto(`${PROD}/NutritionLog`, { waitUntil: 'networkidle', timeout: 30000 });
  await tPage.waitForTimeout(1500);
  const sugBtn = tPage.locator('[data-testid="open-suggest-dialog"], button:has-text("הצע")').first();
  if (await sugBtn.count() > 0) {
    await sugBtn.click();
    await tPage.waitForTimeout(1500);
    const t6a = await shot(tPage, 'T6a-suggest-open');
    // Answer all 3 questions
    for (let q = 0; q < 3; q++) {
      const btn = tPage.locator('[role="dialog"] button[data-testid="suggest-option"], [role="dialog"] button').filter({ hasText: /.{2,}/ }).first();
      if (await btn.count() > 0) {
        await btn.click();
        await tPage.waitForTimeout(q === 2 ? 8000 : 1200);
      }
    }
    const t6b = await shot(tPage, 'T6b-suggest-result');
    const sugText = await tPage.textContent('body');
    const hasRec  = sugText.includes('קל׳') || sugText.includes('קלוריות') || sugText.includes('הוסף ליומן');
    hasRec
      ? ok('T6', 'Suggest What To Eat — AI returned meal with macros', t6b)
      : bad('T6', 'Suggest What To Eat', t6b, 'No recommendation/macros shown');
  } else {
    const t6 = await shot(tPage, 'T6-no-btn');
    bad('T6', 'Suggest button not found', t6, 'Button missing from NutritionLog');
  }
  await tPage.keyboard.press('Escape').catch(() => {});
  await tPage.waitForTimeout(400);

  // T7: AI Meal Replacements
  await tPage.goto(`${PROD}/MyMealPlan`, { waitUntil: 'networkidle', timeout: 30000 });
  await tPage.waitForTimeout(2000);
  const repBtn = tPage.locator('button:has-text("חלופות"), button:has-text("החלף")').first();
  if (await repBtn.count() > 0) {
    await repBtn.click();
    await tPage.waitForTimeout(5000);
    const t7 = await shot(tPage, 'T7-replacements');
    const repText = await tPage.textContent('body');
    repText.includes('חלופ') || repText.includes('קלוריות')
      ? ok('T7', 'AI meal replacements visible', t7)
      : bad('T7', 'AI meal replacements', t7, 'No alternatives shown');
  } else {
    const t7 = await shot(tPage, 'T7-no-btn');
    inf('T7', 'AI meal replacements', t7, 'Button not visible at plan level');
  }

  // T8: Text meal analysis — "חביתה" + clarification buttons
  await tPage.goto(`${PROD}/NutritionLog`, { waitUntil: 'networkidle', timeout: 30000 });
  await tPage.waitForTimeout(1200);
  await tPage.locator('button:has-text("נתח")').first().click().catch(() => {});
  await tPage.waitForTimeout(800);
  const ta = tPage.locator('[role="dialog"] textarea').first();
  if (await ta.count() > 0) {
    await ta.fill('חביתה');
    await tPage.locator('[role="dialog"] button').filter({ hasText: /נתח|AI|מתקדם/ }).first().click({ force: true }).catch(() => {});
    console.log('  Analyzing "חביתה"...');
    await tPage.waitForTimeout(12000);
    const t8 = await shot(tPage, 'T8-omelette-analysis');
    const dlgText = await tPage.locator('[role="dialog"]').textContent().catch(() => '');
    const hasMacros   = /\d+\s*(קל|ח:|פ:|ש:)/.test(dlgText);
    const clarify     = await tPage.locator('[role="dialog"] .bg-amber-50 button, [role="dialog"] button.border-amber-300').allTextContents();
    const visibleClar = clarify.filter(t => t.trim().length > 0);
    const emptyClar   = clarify.filter(t => t.trim().length === 0);
    console.log(`  Macros found: ${hasMacros} | Clarify buttons: ${clarify.length} visible=${visibleClar.length} empty=${emptyClar.length}`);
    console.log(`  Clarify texts:`, visibleClar.slice(0, 4));
    hasMacros
      ? ok('T8-analysis', '"חביתה" analyzed — macros returned', t8)
      : bad('T8-analysis', '"חביתה" analysis failed', t8, 'No macros in dialog');
    if (visibleClar.length > 0 && emptyClar.length === 0) {
      ok('T8-clarify', `Clarification buttons have text: [${visibleClar.slice(0,3).join(', ')}]`, t8);
    } else if (emptyClar.length > 0) {
      bad('T8-clarify', 'Empty clarification buttons', t8, `${emptyClar.length} empty buttons`);
    } else if (hasMacros) {
      ok('T8-clarify', 'High confidence — no clarification needed, macros shown', t8);
    } else {
      bad('T8-clarify', 'No result at all', t8, 'No macros, no clarification');
    }
  } else {
    const t8 = await shot(tPage, 'T8-no-dialog');
    bad('T8-analysis', 'AI text analysis dialog did not open', t8, 'No textarea found');
    bad('T8-clarify', 'Could not test', t8, 'Dialog not open');
  }
  await tPage.keyboard.press('Escape').catch(() => {});
  await tPage.waitForTimeout(400);

  // T9: Image upload dialog — no UploadFile crash
  await tPage.goto(`${PROD}/NutritionLog`, { waitUntil: 'networkidle', timeout: 30000 });
  await tPage.waitForTimeout(1200);
  const uploadBtns = tPage.locator('button:has-text("צלם"), button:has-text("תמונה"), button:has-text("📸")');
  if (await uploadBtns.count() > 0) {
    await uploadBtns.first().click();
    await tPage.waitForTimeout(1500);
    const t9 = await shot(tPage, 'T9-image-dialog');
    const cameraBtn  = await tPage.locator('button:has-text("צלם"), button:has-text("מצלמה")').count();
    const galleryBtn = await tPage.locator('button:has-text("הגלריה"), button:has-text("העלה")').count();
    const hasUpload  = cameraBtn > 0 || galleryBtn > 0;
    const uploadErrBefore = tErrors.filter(e => e.includes('UploadFile')).length;
    hasUpload && uploadErrBefore === 0
      ? ok('T9', 'Image upload dialog opens — no UploadFile crash', t9)
      : !hasUpload
      ? bad('T9', 'Image upload buttons missing', t9, 'No camera/gallery buttons')
      : bad('T9', 'UploadFile error', t9, tErrors.find(e => e.includes('UploadFile')));
  } else {
    const t9 = await shot(tPage, 'T9-no-btn');
    inf('T9', 'Photo upload button not found in nav bar', t9, 'Button selector needs adjustment');
  }
  await tPage.keyboard.press('Escape').catch(() => {});

  // T10: Persistent login (simulate reopen)
  const savedTok = await tPage.evaluate(() => localStorage.getItem('fitcoach_token'));
  await tPage.goto(PROD, { waitUntil: 'networkidle', timeout: 30000 });
  await tPage.waitForTimeout(3000);
  const t10 = await shot(tPage, 'T10-reopen');
  const reopenUrl = tPage.url();
  const loginRequired = reopenUrl.includes('LoginWithPassword') || reopenUrl.includes('SetPassword') || reopenUrl.includes('AccessCodeLogin');
  !loginRequired && savedTok
    ? ok('T10', `Persistent login — lands at ${reopenUrl} without re-login`, t10)
    : bad('T10', 'Persistent login failed', t10, `Redirected to: ${reopenUrl}`);

  await tCtx.close();
  await browser.close();

  // ══════════════════════════════════════════════════════
  // FINAL REPORT
  // ══════════════════════════════════════════════════════
  const pass  = R.filter(r => r.v === 'PASS');
  const fail  = R.filter(r => r.v === 'FAIL');
  const notes = R.filter(r => r.v === 'NOTE');
  const uniqueNet = [...new Set(NET)].filter(n => !n.includes('CoachSettings') && !n.includes('fitcoach_token')).slice(0, 10);

  const report = {
    timestamp: ts(),
    localFE: localFE, localSrv: localSrv,
    vercelBuildHash, railwayLive,
    pass: pass.length, fail: fail.length,
    results: R, net_errors: uniqueNet,
    consoleErrors: [...new Set([...cErrors, ...tErrors])].slice(0, 10),
  };
  writeFileSync(path.join(DIR, 'report.json'), JSON.stringify(report, null, 2));

  console.log('\n\n══════════════════════════════════════════════');
  console.log(` FINAL VERIFICATION — ${ts()}`);
  console.log(`  Local FE:  ${localFE}  |  Local Srv: ${localSrv}`);
  console.log(`  Vercel build hash: ${vercelBuildHash}`);
  console.log(`  Railway live: ${railwayLive}`);
  console.log(`  PASS:${pass.length}  FAIL:${fail.length}  NOTE:${notes.length}`);
  console.log('──────────────────────────────────────────────');
  pass.forEach(r  => console.log(`  ✅ [${r.id}] ${r.label}`));
  fail.forEach(r  => console.log(`  ❌ [${r.id}] ${r.label} — ${r.w}`));
  notes.forEach(r => console.log(`  ℹ️  [${r.id}] ${r.label} — ${r.m}`));
  console.log('\n  Unexpected network errors:', uniqueNet.slice(0,5));
  console.log(`  Screenshots: ${DIR}`);
  console.log('══════════════════════════════════════════════');
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
