/**
 * pilot-verify.mjs — Pilot readiness test suite
 * Tests all observable flows against http://localhost:5173
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const CHROME = 'C:/Users/owner/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const BASE   = 'http://localhost:5173';
const SHOTS  = 'C:/Users/owner/Desktop/pilot-shots';
try { mkdirSync(SHOTS, { recursive: true }); } catch (_) {}

const results = [];
const log = (id, status, detail, shot) => {
  results.push({ id, status, detail, shot });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️ ';
  console.log(`  ${icon} ${status.padEnd(7)} [${id}] ${detail}`);
};

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox']
});

async function freshPage(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const net = [], cons = [];
  page.on('request',  r => { if (!r.url().match(/\.(js|css|png|ico|woff)$/)) net.push(`→${r.method()} ${r.url().replace(BASE,'').slice(0,80)}`); });
  page.on('response', r => { if (!r.url().match(/\.(js|css|png|ico|woff)$/)) net.push(`←${r.status()} ${r.url().replace(BASE,'').slice(0,80)}`); });
  page.on('console',  m => cons.push(`[${m.type()}] ${m.text().slice(0,120)}`));
  return { page, ctx, net, cons };
}

async function shot(page, name) {
  const p = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: p });
  return p;
}

async function getBodyText(page) {
  return page.evaluate(() => document.body.innerText.slice(0, 400));
}

// ═══════════════════════════════════════════════════════════════
// T01 — Google login screen renders at /
// ═══════════════════════════════════════════════════════════════
{
  const { page, ctx, net } = await freshPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const p = await shot(page, 'T01-home');

  const googleBtn  = await page.$('button:has-text("Google")');
  const pwLink     = await page.$('button:has-text("אימייל וסיסמה"), a:has-text("אימייל וסיסמה")');
  const bodyText   = await getBodyText(page);
  const isOnRoot   = page.url() === `${BASE}/` || page.url() === `${BASE}`;

  if (googleBtn && pwLink && isOnRoot) {
    log('T01', 'PASS', `GoogleLoginScreen rendered — Google button ✓, password link ✓`, p);
  } else {
    log('T01', 'FAIL', `Google btn:${!!googleBtn} pwLink:${!!pwLink} URL:${page.url()}\nbody:${bodyText}`, p);
  }
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════
// T02 — Password login page renders — all 5 elements
// ═══════════════════════════════════════════════════════════════
{
  const { page, ctx } = await freshPage();
  await page.goto(`${BASE}/LoginWithPassword`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 12000 }).catch(() => {});
  const p = await shot(page, 'T02-login-with-password');

  const email   = await page.$('input[type="email"]');
  const pass    = await page.$('input[type="password"]');
  const submit  = await page.$('button[type="submit"]');
  const google  = await page.$('button:has-text("Google")');
  const forgot  = await page.$('button:has-text("שכחתי")');

  const all5 = email && pass && submit && google && forgot;
  if (all5) {
    log('T02', 'PASS', 'All 5 elements: email ✓ password ✓ submit ✓ google ✓ forgot ✓', p);
  } else {
    log('T02', 'FAIL', `email:${!!email} pass:${!!pass} submit:${!!submit} google:${!!google} forgot:${!!forgot}`, p);
  }
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════
// T03 — Password login wrong credentials → verifyPasswordLogin called, Hebrew error
// ═══════════════════════════════════════════════════════════════
{
  const { page, ctx, net } = await freshPage();
  await page.goto(`${BASE}/LoginWithPassword`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 12000 }).catch(() => {});

  await page.locator('input[type="email"]').fill('test@example.com');
  await page.locator('input[type="password"]').fill('wrongpassword');

  const respPromise = page.waitForResponse(
    r => r.url().includes('/functions/verifyPasswordLogin'),
    { timeout: 15000 }
  ).catch(() => null);

  await page.locator('input[type="password"]').press('Enter');
  const resp = await respPromise;
  await page.waitForTimeout(3000);
  const p = await shot(page, 'T03-wrong-password');

  const { errorElFound, errorElText } = await page.evaluate(() => {
    const el = document.querySelector('.bg-red-50');
    return { errorElFound: !!el, errorElText: el?.innerText?.trim() || null };
  });

  const funcCalled = !!resp;
  const httpStatus = resp ? resp.status() : null;
  const body       = resp ? await resp.json().catch(() => null) : null;
  const hebrewOk   = errorElText?.includes('אימייל') || errorElText?.includes('סיסמה');

  if (funcCalled && httpStatus === 404 && hebrewOk) {
    log('T03', 'FAIL',
      `verifyPasswordLogin called ✓ but HTTP 404 — function NOT DEPLOYED. Error UI correct: "${errorElText}"`,
      p);
  } else if (funcCalled && (httpStatus === 401 || httpStatus === 200) && hebrewOk) {
    log('T03', 'PASS', `HTTP ${httpStatus}, Hebrew error: "${errorElText}"`, p);
  } else if (!funcCalled) {
    log('T03', 'FAIL', 'verifyPasswordLogin was not called at all — form submit broken', p);
  } else {
    log('T03', 'FAIL', `HTTP ${httpStatus} body:${JSON.stringify(body)?.slice(0,100)} ui:${errorElText}`, p);
  }
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════
// T04 — AccessCodeLogin renders as PUBLIC route (no redirect)
// ═══════════════════════════════════════════════════════════════
{
  const { page, ctx } = await freshPage();
  await page.goto(`${BASE}/AccessCodeLogin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const p = await shot(page, 'T04-access-code-login');

  const finalUrl = page.url();
  const redirectedToLogin = finalUrl.includes('login') && !finalUrl.includes('AccessCode');
  const codeInput  = await page.$('input[type="text"]');
  const emailInput = await page.$('input[type="email"]');
  const bodyText   = await getBodyText(page);

  if (!redirectedToLogin && (codeInput || emailInput)) {
    log('T04', 'PASS', `AccessCodeLogin rendered as public route. URL:${finalUrl}`, p);
  } else if (redirectedToLogin) {
    log('T04', 'FAIL', `Redirected to login — /AccessCodeLogin is NOT in isPublicRoute. URL:${finalUrl}`, p);
  } else {
    log('T04', 'FAIL', `Unexpected state. URL:${finalUrl} body:${bodyText.slice(0,100)}`, p);
  }
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════
// T05 — MagicLogin renders (deprecated but routes must still work)
// ═══════════════════════════════════════════════════════════════
{
  const { page, ctx } = await freshPage();
  await page.goto(`${BASE}/MagicLogin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const p = await shot(page, 'T05-magic-login');

  const finalUrl = page.url();
  const bodyText = await getBodyText(page);
  const crashed  = await page.$('.error-boundary, [data-error]');
  const hasContent = bodyText.length > 20;

  if (!crashed && hasContent && !finalUrl.includes('error')) {
    log('T05', 'PASS', `MagicLogin page loaded without crash. URL:${finalUrl}`, p);
  } else {
    log('T05', 'FAIL', `Crash or empty. URL:${finalUrl} body:${bodyText.slice(0,100)}`, p);
  }
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════
// T06 — AccessLink with no token → shows error, does not crash
// ═══════════════════════════════════════════════════════════════
{
  const { page, ctx } = await freshPage();
  await page.goto(`${BASE}/AccessLink`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const p = await shot(page, 'T06-access-link-no-token');

  const bodyText = await getBodyText(page);
  const finalUrl = page.url();
  const hebrewError = bodyText.includes('קישור') || bodyText.includes('token') || bodyText.includes('חסר');
  const crashed  = bodyText.includes('Something went wrong') || bodyText.includes('undefined');

  if (hebrewError && !crashed) {
    log('T06', 'PASS', `AccessLink no-token shows error state: "${bodyText.slice(0,60)}"`, p);
  } else if (crashed) {
    log('T06', 'FAIL', `Page crashed: ${bodyText.slice(0,100)}`, p);
  } else {
    log('T06', 'FAIL', `Unexpected state. URL:${finalUrl} body:${bodyText.slice(0,100)}`, p);
  }
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════
// T07 — SetPassword with no session → no-session state, no crash
// ═══════════════════════════════════════════════════════════════
{
  const { page, ctx } = await freshPage();
  await page.goto(`${BASE}/SetPassword`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const p = await shot(page, 'T07-set-password-no-session');

  const bodyText = await getBodyText(page);
  const finalUrl = page.url();
  const noSessionUI = bodyText.includes('session') || bodyText.includes('קישור') || bodyText.includes('Session') || bodyText.includes('לא נמצא');
  const crashed  = bodyText.includes('undefined') || bodyText.includes('Cannot read');
  const hasForm  = !!(await page.$('input[type="password"]'));

  if (noSessionUI && !crashed) {
    log('T07', 'PASS', `SetPassword no-session shows graceful fallback: "${bodyText.slice(0,60)}"`, p);
  } else if (hasForm) {
    log('T07', 'PASS', 'SetPassword form renders even without session (acceptable)', p);
  } else if (crashed) {
    log('T07', 'FAIL', `Crash: ${bodyText.slice(0,100)}`, p);
  } else {
    log('T07', 'FAIL', `Unexpected: URL:${finalUrl} body:${bodyText.slice(0,100)}`, p);
  }
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════
// T08 — Admin routes protected: /DebugPage, /TraineeQA, /SystemTest
//        Unauthenticated user must NOT see admin content
// ═══════════════════════════════════════════════════════════════
for (const route of ['/DebugPage', '/TraineeQA', '/SystemTest']) {
  const { page, ctx } = await freshPage();
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const p = await shot(page, `T08${route.replace('/','')}-admin-route`);

  const finalUrl  = page.url();
  const bodyText  = await getBodyText(page);
  const isGoogle  = bodyText.includes('Google') || bodyText.includes('כניסה') || finalUrl.includes('login');
  const isSpinner = bodyText.length < 10;
  const hasAdminContent = bodyText.includes('Debug') || bodyText.includes('System Test') || bodyText.includes('TraineeQA') || bodyText.includes('QA');

  if (hasAdminContent) {
    log(`T08${route}`, 'FAIL', `Admin content exposed to unauthenticated user at ${route}`, p);
  } else if (isGoogle || isSpinner) {
    log(`T08${route}`, 'PASS', `${route} → login redirect or spinner (not admin content)`, p);
  } else {
    log(`T08${route}`, 'PASS', `${route} → no admin content visible: "${bodyText.slice(0,60)}"`, p);
  }
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════
// T09 — TraineeHome / unauthenticated → GoogleLoginScreen (not auto-create)
// ═══════════════════════════════════════════════════════════════
{
  const { page, ctx } = await freshPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const p = await shot(page, 'T09-trainee-home-unauth');

  const bodyText  = await getBodyText(page);
  const isGoogle  = bodyText.includes('Google') || bodyText.includes('FIT COACH PRO');
  const isCreating = bodyText.includes('יוצר פרופיל') || bodyText.includes('Creating');
  const crashed    = bodyText.includes('undefined') || bodyText.includes('Cannot read');

  if (isGoogle && !isCreating) {
    log('T09', 'PASS', 'Unauthenticated / shows GoogleLoginScreen, no auto-create', p);
  } else if (isCreating) {
    log('T09', 'FAIL', 'Auto-create UI shown for unauthenticated user — TraineeHome guard failed', p);
  } else if (crashed) {
    log('T09', 'FAIL', `Crash: ${bodyText.slice(0,100)}`, p);
  } else {
    log('T09', 'FAIL', `Unexpected state: ${bodyText.slice(0,100)}`, p);
  }
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════
// T10 — Protected pages redirect unauthenticated users (/CRM, /ManageTrainees, /NutritionLog)
// ═══════════════════════════════════════════════════════════════
for (const route of ['/CRM', '/ManageTrainees', '/NutritionLog']) {
  const { page, ctx } = await freshPage();
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const p = await shot(page, `T10${route.replace('/','')}`);

  const bodyText = await getBodyText(page);
  const finalUrl = page.url();
  const isPublicFallback = bodyText.includes('Google') || bodyText.includes('FIT COACH') || bodyText.includes('כניסה');
  const hasPageContent   = bodyText.length > 200;

  if (isPublicFallback || !hasPageContent) {
    log(`T10${route}`, 'PASS', `${route} → login redirect/spinner for unauthenticated user`, p);
  } else {
    log(`T10${route}`, 'FAIL', `${route} exposed to unauthenticated user: "${bodyText.slice(0,80)}"`, p);
  }
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════
// T11 — Password login forgotten password button exists and sends request
// ═══════════════════════════════════════════════════════════════
{
  const { page, ctx, net } = await freshPage();
  await page.goto(`${BASE}/LoginWithPassword`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 12000 }).catch(() => {});
  await page.locator('input[type="email"]').fill('test@example.com');

  const respPromise = page.waitForResponse(
    r => r.url().includes('reset-password'),
    { timeout: 8000 }
  ).catch(() => null);

  const forgotBtn = page.locator('button:has-text("שכחתי")');
  await forgotBtn.click({ force: true });
  const resp = await respPromise;
  await page.waitForTimeout(2000);
  const p = await shot(page, 'T11-forgot-password');

  const toastOrMsg = await page.evaluate(() => {
    const sonn = document.querySelector('[data-sonner-toast]');
    return sonn?.innerText?.trim() || null;
  });

  if (resp) {
    log('T11', 'PASS', `Forgot password → reset-password-request called HTTP ${resp.status()}. Toast: "${toastOrMsg}"`, p);
  } else if (toastOrMsg) {
    log('T11', 'PASS', `Forgot password toast shown: "${toastOrMsg}" (request may have gone to base44 directly)`, p);
  } else {
    log('T11', 'FAIL', `Forgot password button clicked but no request and no toast`, p);
  }
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
await browser.close();

console.log('\n══════════════════════════════════════════════════════');
console.log('PILOT READINESS SUMMARY');
console.log('══════════════════════════════════════════════════════');
let pass = 0, fail = 0;
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} ${r.status.padEnd(7)} ${r.id}`);
  if (r.status === 'PASS') pass++; else fail++;
}
console.log(`\n${pass} PASS  ${fail} FAIL  (${results.length} total observable)`);
console.log(`Screenshots: ${SHOTS}`);
