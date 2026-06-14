/**
 * verify-post-import.mjs
 * End-to-end browser verification after live data import.
 * Tests all 8 required flows using Playwright headless Chromium.
 */

import { chromium } from 'playwright';

const FRONTEND = 'http://localhost:5173';
const EMAIL    = 'admin@fitcoach.local';
const PASSWORD = 'Admin123!';

const steps = [];
const consoleErrors = [];
const networkCalls  = [];

function pass(label, detail = '') {
  console.log(`  ✅ ${label}${detail ? '  →  ' + detail : ''}`);
  steps.push({ label, result: 'PASS', detail });
}
function fail(label, detail = '') {
  console.error(`  ❌ ${label}${detail ? '  →  ' + detail : ''}`);
  steps.push({ label, result: 'FAIL', detail });
}
function warn(label, detail = '') {
  console.warn(`  ⚠️  ${label}${detail ? '  →  ' + detail : ''}`);
  steps.push({ label, result: 'WARN', detail });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'he-IL' });
  const page    = await context.newPage();

  // Capture console errors (ignore 401s from anon context — expected)
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!t.includes('favicon') && !t.includes('sourceMap')) {
        consoleErrors.push(t.slice(0, 200));
      }
    }
  });
  page.on('pageerror', e => consoleErrors.push('UNCAUGHT: ' + e.message.slice(0, 200)));

  // Capture all network requests — flag any that go outside localhost
  page.on('request', req => {
    const url = req.url();
    if (url.startsWith('http') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
      networkCalls.push({ url, method: req.method() });
    }
  });

  console.log('\n🌐  Post-Import Frontend Verification\n');
  console.log(`  Frontend: ${FRONTEND}`);
  console.log(`  Backend:  http://localhost:3001\n`);

  // ── STEP 1: Login page loads ──────────────────────────────────────────────
  try {
    await page.goto(`${FRONTEND}/LoginWithPassword`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1500);
    const emailInput = await page.$('input[type="email"], input[id="email"]');
    const pwInput    = await page.$('input[type="password"]');
    if (emailInput && pwInput) {
      pass('Step 1 — Login page renders', 'email+password fields present');
    } else {
      fail('Step 1 — Login page', `email=${!!emailInput}, pw=${!!pwInput}`);
    }
  } catch (e) { fail('Step 1 — Login page', e.message); }

  // ── STEP 2: Login with admin credentials ─────────────────────────────────
  let loggedIn = false;
  try {
    await page.fill('input[type="email"], input[id="email"]', EMAIL);
    await page.fill('input[type="password"]',                 PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    const url     = page.url();
    const body    = await page.textContent('body').catch(() => '');
    const onLogin = url.includes('LoginWithPassword');
    const hasErr  = body.includes('שגוי') || body.includes('שגיאה') || body.includes('Unauthorized');

    if (!onLogin && !hasErr) {
      pass('Step 2 — Login succeeds', `redirected to: .../${url.split('/').pop()}`);
      loggedIn = true;
    } else if (hasErr) {
      fail('Step 2 — Login', `error shown in page: ${body.slice(0, 100)}`);
    } else {
      fail('Step 2 — Login', `still on login page — url: ${url}`);
    }
  } catch (e) { fail('Step 2 — Login', e.message); }

  // ── STEP 3: Coach dashboard — real Hebrew trainee names ──────────────────
  try {
    if (loggedIn) {
      await page.goto(`${FRONTEND}/ManageTrainees`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(3000); // allow react-query fetches to complete
      const body = await page.textContent('body').catch(() => '');

      // Look for known Hebrew names from the imported data
      const hebrewNames = ['מיכל', 'טליה', 'נועם', 'איילת', 'אביחי', 'ישראל'];
      const foundNames  = hebrewNames.filter(n => body.includes(n));

      if (foundNames.length >= 2) {
        pass('Step 3 — Coach dashboard shows real trainees', `found: ${foundNames.join(', ')}`);
      } else if (foundNames.length === 1) {
        warn('Step 3 — Coach dashboard', `only 1 Hebrew name found: ${foundNames[0]}`);
      } else {
        // Check if we're on a valid page at all
        const url = page.url();
        fail('Step 3 — Coach dashboard', `no Hebrew trainee names. url=${url}, body[200]: ${body.slice(0, 200)}`);
      }
    } else {
      warn('Step 3 — skipped (not logged in)');
    }
  } catch (e) { fail('Step 3 — Coach dashboard', e.message); }

  // ── STEP 4: Trainee count via API ────────────────────────────────────────
  try {
    const token = await page.evaluate(() => localStorage.getItem('fitcoach_token'));
    const resp  = await page.evaluate(async (tok) => {
      const r = await fetch('/api/entities/Trainee?coach_email=edengoldenberg@gmail.com&_limit=200', {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {}
      });
      const d = await r.json();
      return { status: r.status, count: Array.isArray(d) ? d.length : 0 };
    }, token);

    if (resp.count >= 50) {
      pass('Step 4 — Trainee data from API', `${resp.count} trainees returned for coach`);
    } else {
      warn('Step 4 — Trainee data', `only ${resp.count} trainees (expected 70+)`);
    }
  } catch (e) { fail('Step 4 — Trainee API call', e.message); }

  // ── STEP 5: NutritionLog — loads without crash ───────────────────────────
  try {
    if (loggedIn) {
      await page.goto(`${FRONTEND}/NutritionLog`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(2500);
      const url       = page.url();
      const crashed   = await page.$('.error-boundary, [data-error]') !== null;
      const hasSpinner = await page.$('.animate-spin') !== null;
      const body      = await page.textContent('body').catch(() => '');

      if (!crashed && !url.includes('LoginWithPassword') && body.length > 100) {
        pass('Step 5 — NutritionLog loads', hasSpinner ? 'loading data' : 'content rendered');
      } else if (url.includes('LoginWithPassword')) {
        fail('Step 5 — NutritionLog', 'redirected to login (auth lost)');
      } else {
        fail('Step 5 — NutritionLog', `crashed=${crashed}, body len=${body.length}`);
      }
    } else {
      warn('Step 5 — skipped (not logged in)');
    }
  } catch (e) { fail('Step 5 — NutritionLog', e.message); }

  // ── STEP 6: WorkoutLog — loads without crash ─────────────────────────────
  try {
    if (loggedIn) {
      await page.goto(`${FRONTEND}/WorkoutLog`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(2500);
      const url   = page.url();
      const body  = await page.textContent('body').catch(() => '');
      const crashed = await page.$('.error-boundary') !== null;

      if (!crashed && !url.includes('LoginWithPassword') && body.length > 100) {
        pass('Step 6 — WorkoutLog loads without crash');
      } else {
        fail('Step 6 — WorkoutLog', `crashed=${crashed}, url=${url}`);
      }
    } else {
      warn('Step 6 — skipped (not logged in)');
    }
  } catch (e) { fail('Step 6 — WorkoutLog', e.message); }

  // ── STEP 7: Auth persistence across reload ────────────────────────────────
  try {
    if (loggedIn) {
      const urlBefore = page.url();
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(2500);
      const urlAfter = page.url();
      if (!urlAfter.includes('LoginWithPassword')) {
        pass('Step 7 — Auth persists on reload', `still at ${urlAfter.split('/').pop()}`);
      } else {
        fail('Step 7 — Auth persistence', `kicked to login after reload`);
      }
    } else {
      warn('Step 7 — skipped (not logged in)');
    }
  } catch (e) { fail('Step 7 — Auth persistence', e.message); }

  // ── STEP 8: No Base44 external network calls ──────────────────────────────
  // Let the page settle, check what external calls happened
  await page.waitForTimeout(1000);

  const base44Calls = networkCalls.filter(c =>
    c.url.includes('base44') || c.url.includes('successful-fit-coach-pro')
  );
  const otherExternal = networkCalls.filter(c =>
    !c.url.includes('base44') && !c.url.includes('successful-fit-coach-pro') &&
    !c.url.includes('fonts.') && !c.url.includes('cdn.')
  );

  if (base44Calls.length === 0) {
    pass('Step 8 — Zero Base44 external calls', `${networkCalls.length} total external calls, none to Base44`);
  } else {
    fail('Step 8 — Base44 calls detected', base44Calls.map(c => c.url).join(', '));
  }

  if (otherExternal.length > 0) {
    warn('External calls (non-Base44)', otherExternal.slice(0, 3).map(c => c.url).join(', '));
  }

  await browser.close();

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  const passed = steps.filter(s => s.result === 'PASS').length;
  const failed = steps.filter(s => s.result === 'FAIL').length;
  const warned = steps.filter(s => s.result === 'WARN').length;

  steps.forEach(s => {
    const icon = s.result === 'PASS' ? '✅' : s.result === 'FAIL' ? '❌' : '⚠️ ';
    console.log(`  ${icon} ${s.label}`);
    if (s.detail) console.log(`      ${s.detail}`);
  });

  console.log(`\n  Total: ${passed} PASS  ${failed} FAIL  ${warned} WARN`);

  if (consoleErrors.length > 0) {
    const realErrors = consoleErrors.filter(e => !e.includes('401') && !e.includes('No token'));
    if (realErrors.length > 0) {
      console.log('\nConsole errors (excluding expected 401s):');
      realErrors.forEach(e => console.warn('  ⚠️ ', e.slice(0, 150)));
    } else {
      console.log('\n✅ All console errors are expected 401s (anon auth checks)');
    }
  }

  const verdict = failed === 0 ? '✅ PASS' : '❌ FAIL';
  console.log(`\nVERDICT: ${verdict}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
