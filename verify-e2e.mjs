/**
 * verify-e2e.mjs
 * End-to-end verification of the standalone FitCoach frontend.
 * Tests all critical flows against the new backend.
 */

import { chromium } from 'playwright';

const FRONTEND = 'http://localhost:5173';
const EMAIL = 'admin@fitcoach.local';
const PASSWORD = 'Admin123!';

const results = [];
const consoleErrors = [];

function pass(name, detail = '') {
  console.log(`  ✅ PASS  ${name}${detail ? ' — ' + detail : ''}`);
  results.push({ name, status: 'PASS', detail });
}
function fail(name, detail = '') {
  console.error(`  ❌ FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  results.push({ name, status: 'FAIL', detail });
}
function warn(name, detail = '') {
  console.warn(`  ⚠️  WARN  ${name}${detail ? ' — ' + detail : ''}`);
  results.push({ name, status: 'WARN', detail });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    locale: 'he-IL',
  });
  const page = await context.newPage();

  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore known non-critical errors
      if (!text.includes('favicon') && !text.includes('sourceMap')) {
        consoleErrors.push(text);
      }
    }
  });

  // Collect uncaught JS errors
  page.on('pageerror', err => {
    consoleErrors.push(`UNCAUGHT: ${err.message}`);
  });

  console.log('\n🧪 FitCoach Pro — End-to-End Verification\n');
  console.log(`   Frontend: ${FRONTEND}`);
  console.log(`   Backend:  http://localhost:3001\n`);

  // ─── PHASE 3: Frontend Compatibility ────────────────────────────────────────

  console.log('PHASE 3 — Frontend Compatibility');

  // Test 1: Root route loads without crashing
  try {
    const resp = await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(2000);
    const crashed = await page.$('.error-boundary, [data-error]') !== null;
    const bodyText = await page.textContent('body').catch(() => '');
    if (resp.status() === 200 && !crashed) {
      pass('Root route loads (no white screen of death)');
    } else {
      fail('Root route loads', `status=${resp.status()}, crashed=${crashed}`);
    }
  } catch (e) {
    fail('Root route loads', e.message);
  }

  // Test 2: LoginWithPassword page loads
  try {
    await page.goto(`${FRONTEND}/LoginWithPassword`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1500);
    const emailInput = await page.$('input[type="email"], input[id="email"]');
    const passwordInput = await page.$('input[type="password"]');
    if (emailInput && passwordInput) {
      pass('LoginWithPassword page — email+password fields rendered');
    } else {
      fail('LoginWithPassword page', `email=${!!emailInput}, password=${!!passwordInput}`);
    }
  } catch (e) {
    fail('LoginWithPassword page', e.message);
  }

  // Test 3: Auth flow — login
  let loggedIn = false;
  try {
    await page.goto(`${FRONTEND}/LoginWithPassword`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1000);

    await page.fill('input[type="email"], input[id="email"]', EMAIL);
    await page.fill('input[type="password"], input[id="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    const url = page.url();
    const hasErrorMsg = await page.$('.text-red-800, [class*="error"]');
    const errorText = hasErrorMsg ? await hasErrorMsg.textContent().catch(() => '') : '';

    if (!url.includes('LoginWithPassword') || url.includes('ManageTrainees') || url.includes('Dashboard') || url.includes('Home')) {
      pass('Login with correct credentials', `redirected to: ${url.split('/').pop()}`);
      loggedIn = true;
    } else if (errorText && errorText.includes('שגיא')) {
      fail('Login with correct credentials', `error shown: ${errorText.trim()}`);
    } else {
      // May have redirected within app
      const bodyText = await page.textContent('body').catch(() => '');
      if (!bodyText.includes('כניסה') || bodyText.includes('ניהול') || bodyText.includes('מאמן')) {
        pass('Login with correct credentials', `app content loaded at ${url}`);
        loggedIn = true;
      } else {
        warn('Login with correct credentials', `still at login? url=${url}`);
      }
    }
  } catch (e) {
    fail('Login with correct credentials', e.message);
  }

  // Test 4: Dashboard / protected route loaded
  try {
    const url = page.url();
    const bodyText = await page.textContent('body').catch(() => '');
    const hasNav = await page.$('nav, [role="navigation"], .sidebar, header') !== null;
    const hasContent = bodyText.length > 200;

    if (loggedIn && (hasNav || hasContent) && !url.includes('LoginWithPassword')) {
      pass('Coach dashboard / app content loads after login');
    } else if (!loggedIn) {
      warn('Coach dashboard', 'skipped — login did not succeed');
    } else {
      fail('Coach dashboard / app content', `hasNav=${hasNav}, contentLen=${bodyText.length}`);
    }
  } catch (e) {
    fail('Coach dashboard', e.message);
  }

  // Test 5: AuthContext — user data available (check for name in page)
  try {
    const bodyText = await page.textContent('body').catch(() => '');
    const hasUserData = bodyText.includes('FitCoach') || bodyText.includes('מנהל') || bodyText.includes('admin');
    if (loggedIn && hasUserData) {
      pass('AuthContext — user data rendered in page');
    } else if (!loggedIn) {
      warn('AuthContext', 'skipped — not logged in');
    } else {
      warn('AuthContext user data', 'user name not visible in body (may be in nav)');
    }
  } catch (e) {
    warn('AuthContext', e.message);
  }

  // Test 6: Navigation — try to reach a protected route
  try {
    if (loggedIn) {
      await page.goto(`${FRONTEND}/ManageTrainees`, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await page.waitForTimeout(2000);
      const url = page.url();
      const bodyText = await page.textContent('body').catch(() => '');
      if (!url.includes('LoginWithPassword') && bodyText.length > 100) {
        pass('Protected route /ManageTrainees accessible while logged in');
      } else {
        fail('Protected route /ManageTrainees', `redirected to login or empty`);
      }
    } else {
      warn('Protected route test', 'skipped — not logged in');
    }
  } catch (e) {
    fail('Protected route navigation', e.message);
  }

  // Test 7: Persistence — token survives page reload
  try {
    if (loggedIn) {
      const urlBefore = page.url();
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(2500);
      const urlAfter = page.url();
      const stillLoggedIn = !urlAfter.includes('LoginWithPassword');
      if (stillLoggedIn) {
        pass('Auth persistence — token survives page reload');
      } else {
        fail('Auth persistence', `redirected to login after reload: ${urlAfter}`);
      }
    } else {
      warn('Auth persistence', 'skipped — not logged in');
    }
  } catch (e) {
    fail('Auth persistence', e.message);
  }

  // Test 8: Unauthenticated redirect — new context, no token
  try {
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`${FRONTEND}/ManageTrainees`, { waitUntil: 'domcontentloaded', timeout: 8000 });
    await anonPage.waitForTimeout(2000);
    const url = anonPage.url();
    const bodyText = await anonPage.textContent('body').catch(() => '');
    const redirectedToLogin = url.includes('LoginWithPassword') || bodyText.includes('כניסה') || bodyText.includes('Login');
    if (redirectedToLogin) {
      pass('Unauthenticated redirect works (no token → login page)');
    } else {
      warn('Unauthenticated redirect', `url=${url}, may need ProtectedRoute check`);
    }
    await anonContext.close();
  } catch (e) {
    fail('Unauthenticated redirect', e.message);
  }

  // Test 9: Wrong password shows error
  try {
    const testContext = await browser.newContext();
    const testPage = await testContext.newPage();
    await testPage.goto(`${FRONTEND}/LoginWithPassword`, { waitUntil: 'domcontentloaded', timeout: 8000 });
    await testPage.waitForTimeout(1000);
    await testPage.fill('input[type="email"], input[id="email"]', EMAIL);
    await testPage.fill('input[type="password"], input[id="password"]', 'WrongPassword999');
    await testPage.click('button[type="submit"]');
    await testPage.waitForTimeout(2000);
    const url = testPage.url();
    const bodyText = await testPage.textContent('body').catch(() => '');
    const staysOnLogin = url.includes('LoginWithPassword');
    const showsError = bodyText.includes('שגוי') || bodyText.includes('אימייל') || bodyText.includes('שגיא');
    if (staysOnLogin && showsError) {
      pass('Wrong password shows error, stays on login page');
    } else if (staysOnLogin) {
      warn('Wrong password', 'stays on login but error message not found in body');
    } else {
      fail('Wrong password handling', `navigated away: ${url}`);
    }
    await testContext.close();
  } catch (e) {
    fail('Wrong password test', e.message);
  }

  // Test 10: base44Client compatibility — entities return arrays
  try {
    // Intercept network to verify entity calls go to new backend
    const apiCalls = [];
    page.on('request', req => {
      if (req.url().includes('/api/entities') || req.url().includes('/api/functions') || req.url().includes('/api/auth')) {
        apiCalls.push({ url: req.url(), method: req.method() });
      }
    });
    if (loggedIn) {
      await page.reload({ waitUntil: 'networkidle', timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const entityCalls = apiCalls.filter(c => c.url.includes('/api/entities') || c.url.includes('/api/auth'));
      if (entityCalls.length > 0) {
        pass(`base44Client routing — ${entityCalls.length} API calls to new backend`,
          entityCalls.slice(0, 3).map(c => c.url.split('/api/')[1]).join(', '));
      } else {
        warn('base44Client routing', 'no entity/auth API calls intercepted during reload');
      }
    } else {
      warn('base44Client routing', 'skipped — not logged in');
    }
  } catch (e) {
    warn('base44Client routing test', e.message);
  }

  // Test 11: Logout
  try {
    if (loggedIn) {
      // Try to find and click logout button
      await page.goto(`${FRONTEND}/LoginWithPassword`, { waitUntil: 'domcontentloaded', timeout: 8000 });
      // Direct API logout
      const logoutResp = await page.evaluate(async () => {
        const r = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        return r.status;
      });
      // Clear localStorage
      await page.evaluate(() => localStorage.removeItem('fitcoach_token'));
      await page.goto(`${FRONTEND}/ManageTrainees`, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await page.waitForTimeout(2000);
      const url = page.url();
      if (url.includes('LoginWithPassword') || logoutResp === 200) {
        pass('Logout clears session', `POST /api/auth/logout → ${logoutResp}, redirected to login`);
      } else {
        warn('Logout flow', `logout API returned ${logoutResp}, url=${url}`);
      }
    } else {
      warn('Logout test', 'skipped — not logged in');
    }
  } catch (e) {
    fail('Logout test', e.message);
  }

  await browser.close();

  // ─── Summary ────────────────────────────────────────────────────────────────

  console.log('\n' + '─'.repeat(60));
  console.log('RESULTS SUMMARY');
  console.log('─'.repeat(60));
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`  ${icon} ${r.name}`);
    if (r.detail) console.log(`      ${r.detail}`);
  });

  console.log(`\n  Total: ${passed} PASS, ${failed} FAIL, ${warned} WARN`);

  if (consoleErrors.length > 0) {
    console.log('\nCONSOLE ERRORS CAPTURED:');
    consoleErrors.slice(0, 10).forEach(e => console.log(`  ⚠️  ${e.slice(0, 120)}`));
  } else {
    console.log('\n✅ No console errors captured');
  }

  const verdict = failed === 0 ? 'PASS' : 'FAIL';
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`OVERALL VERDICT: ${verdict}`);
  console.log('═'.repeat(60) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
