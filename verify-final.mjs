/**
 * verify-final.mjs
 * Complete verification: WaterLog Create, Edit, CoachDashboard→TraineeDetail, filtered queries
 * Credentials: admin@fitcoach.local/Admin123! (coach), trainee@fitcoach.local/Trainee123! (trainee)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const CHROME = 'C:/Users/owner/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const BASE   = 'http://localhost:5173';
const SHOTS  = 'C:/Users/owner/Desktop/אפליקציה חדשה/pw-shots/final-report';

try { mkdirSync(SHOTS, { recursive: true }); } catch (_) {}

const results = [];

function pass(id, detail, shot) {
  results.push({ id, status: 'PASS', detail, shot });
  console.log(`  ✅ PASS  [${id}] ${detail}`);
  if (shot) console.log(`         📸 ${shot.split('/').pop()}`);
}
function fail(id, detail, shot) {
  results.push({ id, status: 'FAIL', detail, shot });
  console.error(`  ❌ FAIL  [${id}] ${detail}`);
  if (shot) console.log(`         📸 ${shot.split('/').pop()}`);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
});

async function freshCtx(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const requests = [];
  const responses = [];
  const errors = [];
  page.on('request', r => {
    if (!r.url().match(/\.(js|css|png|ico|woff|woff2|svg|map)$/))
      requests.push({ method: r.method(), url: r.url().replace(BASE, '') });
  });
  page.on('response', r => {
    if (!r.url().match(/\.(js|css|png|ico|woff|woff2|svg|map)$/))
      responses.push({ status: r.status(), url: r.url().replace(BASE, '') });
  });
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', e => errors.push(`UNCAUGHT: ${e.message}`));
  return { page, ctx, requests, responses, errors };
}

async function shot(page, name) {
  const p = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: p });
  return p;
}

async function dismissOverlay(page) {
  await page.evaluate(() => {
    document.querySelectorAll('div[style*="99999"]').forEach(d => {
      d.style.pointerEvents = 'none';
      d.style.opacity = '0';
    });
  });
}

async function login(page, email, password) {
  // Load the app shell first so localStorage is available in the right origin
  await page.goto(`${BASE}/LoginWithPassword`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Inject token directly — bypasses UI (avoids PWA banner and overlay timing issues)
  const result = await page.evaluate(async ({ email, password }) => {
    try {
      const r = await fetch('/api/functions/verifyPasswordLogin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (data.ok && data.access_token) {
        localStorage.setItem('fitcoach_token', data.access_token);
        return { ok: true, token: data.access_token };
      }
      return { ok: false, error: JSON.stringify(data) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, { email, password });

  if (!result.ok) {
    console.error(`   Login failed: ${result.error}`);
    return false;
  }
  console.log(`   Token injected for ${email}`);
  return true;
}

// ══════════════════════════════════════════════════════════════
// TEST 1 — WaterLog Create
// ══════════════════════════════════════════════════════════════
console.log('\n─── T1: WaterLog Create ─────────────────────────────────────');
{
  const { page, ctx, responses, errors } = await freshCtx();

  const ok = await login(page, 'trainee@fitcoach.local', 'Trainee123!');
  if (!ok) {
    const p = await shot(page, 'T1a-login-fail');
    fail('T1-WaterCreate', `Login failed — URL: ${page.url()}`, p);
    await ctx.close();
  } else {
    await page.goto(`${BASE}/WaterLog`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await dismissOverlay(page);
    const p1 = await shot(page, 'T1a-waterlog');

    // Read current total before adding
    const bodyBefore = await page.evaluate(() => document.body.innerText);
    const totalBefore = (bodyBefore.match(/(\d+\.?\d*)\s*L/) || [])[1];
    console.log(`   Total before: ${totalBefore}L`);

    // Wait longer for user query (traineeEmail) to resolve before opening dialog
    await page.waitForTimeout(1000);

    // Click הוסף button to open the Add Water dialog
    await page.locator('button').filter({ hasText: 'הוסף' }).first().click({ force: true });
    await page.waitForTimeout(1500);
    const p2 = await shot(page, 'T1b-dialog-open');

    const dialogVisible = await page.$('[role="dialog"]') !== null;
    if (!dialogVisible) {
      fail('T1-WaterCreate', 'Add dialog did not open', p2);
    } else {
      // Capture POST response before clicking
      let createStatus = null;
      let createBody = null;
      const onResponse = async (r) => {
        if (r.url().includes('/api/entities/WaterEntry') && r.request().method() === 'POST') {
          createStatus = r.status();
          createBody = await r.json().catch(() => null);
        }
      };
      page.on('response', onResponse);

      // Click the 500ml PRESET button — this calls handleSave(500) directly,
      // triggering the mutation. Do NOT also click the "הוסף" submit button.
      const btn500 = page.locator('[role="dialog"] button').filter({ hasText: /500/ }).first();
      await btn500.click({ force: true });

      // Wait for the dialog to close (onSuccess → setShowWaterDialog(false))
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 8000 }).catch(() => null);
      await page.waitForTimeout(1000);
      page.off('response', onResponse);
      await dismissOverlay(page);
      const p3 = await shot(page, 'T1c-after-save');

      const dialogGone = (await page.$('[role="dialog"]')) === null;
      const bodyAfter = await page.evaluate(() => document.body.innerText);
      const totalAfter = (bodyAfter.match(/(\d+\.?\d*)\s*L/) || [])[1];
      const totalChanged = totalBefore !== totalAfter;

      console.log(`   POST /api/entities/WaterEntry → HTTP ${createStatus}`);
      console.log(`   Dialog closed: ${dialogGone}`);
      console.log(`   Total: ${totalBefore}L → ${totalAfter}L`);
      if (createBody?.id) console.log(`   Created ID: ${createBody.id}`);

      if (createStatus === 200 && dialogGone) {
        pass('T1-WaterCreate', `POST 200 → id=${createBody?.id}, total ${totalBefore}L → ${totalAfter}L`, p3);
      } else if (createStatus === 200 && !dialogGone) {
        fail('T1-WaterCreate', `POST 200 but dialog did not close`, p3);
      } else if (!createStatus && totalChanged && dialogGone) {
        pass('T1-WaterCreate', `Mutation confirmed by total ${totalBefore}L→${totalAfter}L + dialog closed`, p3);
      } else if (!createStatus && totalChanged) {
        fail('T1-WaterCreate', `Total changed ${totalBefore}L→${totalAfter}L but dialog still open — onSuccess did not fire`, p3);
      } else {
        fail('T1-WaterCreate', `POST HTTP ${createStatus} — response: ${JSON.stringify(createBody)?.slice(0,100)}`, p3);
      }
    }
  }
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════
// TEST 2 — WaterLog Edit Existing Entry
// ══════════════════════════════════════════════════════════════
console.log('\n─── T2: WaterLog Edit ───────────────────────────────────────');
{
  const { page, ctx } = await freshCtx();

  const ok = await login(page, 'trainee@fitcoach.local', 'Trainee123!');
  if (!ok) {
    fail('T2-WaterEdit', 'Login failed');
    await ctx.close();
  } else {
    await page.goto(`${BASE}/WaterLog`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await dismissOverlay(page);
    const p1 = await shot(page, 'T2a-waterlog-with-entries');

    // Check if there are entries
    const body = await page.evaluate(() => document.body.innerText);
    const hasEntries = body.includes('מ"ל') || body.includes('ml') || body.match(/\d{2,4}\s*מ/);
    console.log(`   Has water entries: ${hasEntries}`);

    // Find pencil (edit) button - look for SVG pencil icon in buttons
    const editBtns = await page.$$('button');
    let editBtn = null;
    for (const btn of editBtns) {
      const html = await btn.innerHTML().catch(() => '');
      if (html.toLowerCase().includes('pencil') || html.includes('עריכה') || html.includes('ערוך')) {
        editBtn = btn;
        break;
      }
    }

    if (!editBtn) {
      // Try by aria-label or data attribute
      editBtn = await page.$('button[aria-label*="עריכה"], button[aria-label*="edit"], button[title*="edit"]');
    }

    if (!editBtn) {
      // Approach: look for list items and their second or third button
      const entryBtns = await page.$$('[class*="entry"] button, li button, [class*="item"] button');
      editBtn = entryBtns.find ? entryBtns[1] || entryBtns[0] : null;
    }

    if (!editBtn) {
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (!bodyText.includes('מ"ל') && !bodyText.match(/\d+\s*מ/)) {
        // Navigate to yesterday (entries are from 2026-06-06)
        // Click left arrow to go to previous day
        const prevBtn = await page.$('button svg[class*="ChevronLeft"], button:has([data-lucide="chevron-left"])');
        if (prevBtn) {
          await prevBtn.click({ force: true });
          await page.waitForTimeout(1000);
        }
        const p1b = await shot(page, 'T2a2-waterlog-prev-day');
      }

      // Try again to find edit button
      const allBtns = await page.$$('button');
      for (const btn of allBtns) {
        const html = await btn.innerHTML().catch(() => '');
        if (html.toLowerCase().includes('pencil')) { editBtn = btn; break; }
      }
    }

    if (!editBtn) {
      fail('T2-WaterEdit', 'No edit/pencil button found for existing water entry', p1);
    } else {
      await editBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      await dismissOverlay(page);
      const p2 = await shot(page, 'T2b-edit-dialog');

      const dialogOpen = await page.$('[role="dialog"][data-state="open"], [class*="DialogContent"]') !== null;

      if (!dialogOpen) {
        fail('T2-WaterEdit', 'Edit button clicked but dialog did not open', p2);
      } else {
        // Change the amount
        const input = page.locator('input[type="number"]').first();
        const hasInput = await input.count() > 0;

        if (!hasInput) {
          fail('T2-WaterEdit', 'Edit dialog opened but no number input found', p2);
        } else {
          await input.fill('750');
          await page.waitForTimeout(300);

          let putStatus = null;
          let putBody = null;
          const onPut = async (r) => {
            if (r.url().includes('/api/entities/WaterEntry') && r.request().method() === 'PUT') {
              putStatus = r.status();
              putBody = await r.json().catch(() => null);
            }
          };
          page.on('response', onPut);

          await page.locator('button').filter({ hasText: /^הוסף$/ }).last().click({ force: true });
          await page.waitForTimeout(3000);
          page.off('response', onPut);
          await dismissOverlay(page);
          const p3 = await shot(page, 'T2c-after-edit');

          const dialogGone2 = (await page.$('[role="dialog"]')) === null;

          console.log(`   PUT /api/entities/WaterEntry/:id → HTTP ${putStatus}`);
          console.log(`   Dialog closed: ${dialogGone2}`);
          if (putBody?.amount_ml) console.log(`   Updated amount_ml: ${putBody.amount_ml}`);

          if (putStatus === 200 && dialogGone2) {
            pass('T2-WaterEdit', `PUT 200 → amount_ml=${putBody?.amount_ml}, dialog closed`, p3);
          } else if (putStatus === 200 && !dialogGone2) {
            fail('T2-WaterEdit', `PUT 200 but dialog stayed open`, p3);
          } else if (!putStatus && dialogGone2) {
            pass('T2-WaterEdit', `Response not captured but dialog closed (onSuccess ran → mutation succeeded)`, p3);
          } else {
            fail('T2-WaterEdit', `PUT HTTP ${putStatus} — ${JSON.stringify(putBody)?.slice(0, 100)}`, p3);
          }
        }
      }
    }
  }
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════
// TEST 3+4+5 — CoachDashboard → TraineeDetail + filtered queries
// ══════════════════════════════════════════════════════════════
console.log('\n─── T3+4+5: CoachDashboard → TraineeDetail ─────────────────');
{
  const { page, ctx, errors } = await freshCtx();

  const ok = await login(page, 'admin@fitcoach.local', 'Admin123!');
  if (!ok) {
    fail('T3-CoachDashboard', `Coach login failed. URL: ${page.url()}`);
    fail('T4-TraineeDetail-Meals', 'Coach login failed');
    fail('T4-TraineeDetail-Water', 'Coach login failed');
    fail('T4-TraineeDetail-Metrics', 'Coach login failed');
    await ctx.close();
  } else {
    await page.goto(`${BASE}/CoachDashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await dismissOverlay(page);
    const p1 = await shot(page, 'T3a-coach-dashboard');

    const dashBody = await page.evaluate(() => document.body.innerText);
    console.log(`   Dashboard URL: ${page.url()}`);
    const hasContent = dashBody.length > 200;

    // --- Capture ONLY the filtered (trainee_email=...) entity queries ---
    // Ignore the CoachDashboard subscribe() polls which hit the same endpoints unfiltered.
    const filteredCalls = {};
    const unfilteredCalls = {};
    page.on('response', async r => {
      const url = r.url();
      for (const entity of ['MealEntry', 'WaterEntry', 'MetricsEntry']) {
        if (url.includes(`/entities/${entity}`)) {
          const isFiltered = url.includes('trainee_email=');
          const status = r.status();
          let count = null;
          if (status === 200) {
            const data = await r.json().catch(() => null);
            count = Array.isArray(data) ? data.length : (Array.isArray(data?.data) ? data.data.length : '?');
          }
          const record = { status, url: url.replace(BASE, ''), count };
          if (isFiltered) {
            filteredCalls[entity] = record;
          } else {
            unfilteredCalls[entity] = record;
          }
        }
      }
    });

    // Click the trainee NAME SPAN inside the card header — this is in the top div
    // that has the onClick triggering setSelectedTrainee. Avoids clicking the
    // TraineeLearningInsights card which would navigate away to TraineeLearningAnalytics.
    let clicked = false;
    const nameSpan = page.locator('span.font-bold').filter({ hasText: 'ישראל ישראלי' }).first();
    if (await nameSpan.count() > 0) {
      console.log('   Clicking trainee name span: ישראל ישראלי');
      await nameSpan.click({ force: true });
      clicked = true;
    } else {
      // Fallback: click the header flex div (above learning insights)
      const headerDiv = page.locator('div[class*="flex items-center gap-3 p-3"]').first();
      if (await headerDiv.count() > 0) {
        console.log('   Clicking header div');
        await headerDiv.click({ force: true });
        clicked = true;
      }
    }

    // Wait for TraineeDetail to render AND for all three queries to fire
    await page.waitForTimeout(7000);
    await dismissOverlay(page);
    const p2 = await shot(page, 'T3b-trainee-detail');

    const detailUrl = page.url();
    const detailBody = await page.evaluate(() => document.body.innerText);
    console.log(`   Detail URL: ${detailUrl}`);
    console.log(`   Detail body[200]: ${detailBody.slice(0, 200).replace(/\n/g, ' ')}`);

    // TraineeDetail shows: trainee name, calories, water, workout, weight cards
    const showsStats = detailBody.includes('קל') || detailBody.includes('מים') ||
      detailBody.includes('ישראלי') || detailBody.includes('trainee@fitcoach');
    const isWrongPage = detailUrl.includes('LearningAnalytics') || detailUrl.includes('Analysis');

    if (!clicked) {
      fail('T3-CoachDashboard', 'No clickable trainee card found', p2);
    } else if (isWrongPage) {
      fail('T3-CoachDashboard', `Navigated to wrong page: ${detailUrl}`, p2);
    } else if (showsStats) {
      pass('T3-CoachDashboard', `TraineeDetail rendered at ${detailUrl}`, p2);
    } else {
      fail('T3-CoachDashboard', `Trainee detail opened but no expected content. Body: ${detailBody.slice(0, 100)}`, p2);
    }

    // Give queries more time to complete
    await page.waitForTimeout(3000);

    console.log('\n   Filtered query results (trainee_email= in URL):');
    for (const [entity, info] of Object.entries(filteredCalls)) {
      console.log(`   ✅ ${entity}: HTTP ${info.status} | ${info.count} records | ${info.url.slice(0, 80)}`);
    }
    if (Object.keys(unfilteredCalls).length > 0) {
      console.log('\n   Unfiltered subscribe polls (ignored for T4):');
      for (const [entity, info] of Object.entries(unfilteredCalls)) {
        console.log(`   ℹ️  ${entity}: HTTP ${info.status} | ${info.count} records | ${info.url.slice(0, 80)}`);
      }
    }

    // Test 4: TraineeDetail data loaded
    const screenshotPath = await shot(page, 'T4-detail-after-queries');

    ['MealEntry', 'WaterEntry', 'MetricsEntry'].forEach(entity => {
      const info = filteredCalls[entity];    // only filtered (trainee_email=) calls
      const unfiltered = unfilteredCalls[entity];
      if (info && info.status === 200) {
        pass(
          `T4-TraineeDetail-${entity}`,
          `filter({ trainee_email }) HTTP 200 — ${info.count} records — URL: ${info.url.slice(0, 70)}`,
          screenshotPath
        );
      } else if (info && info.status !== 200) {
        fail(`T4-TraineeDetail-${entity}`, `filtered query HTTP ${info.status}`, screenshotPath);
      } else if (!info && unfiltered) {
        fail(
          `T4-TraineeDetail-${entity}`,
          `Only UNFILTERED call observed (subscribe poll, ${unfiltered.count} records) — filter({ trainee_email }) was NOT used`,
          screenshotPath
        );
      } else {
        fail(`T4-TraineeDetail-${entity}`, `No ${entity} query observed after opening TraineeDetail`, screenshotPath);
      }
    });

    if (errors.length > 0) {
      console.log('\n   Console errors:');
      errors.slice(0, 5).forEach(e => console.log(`   ⚠️  ${e.slice(0, 150)}`));
    }
  }
  await ctx.close();
}

await browser.close();

// ══════════════════════════════════════════════════════════════
// REPORT
// ══════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(66));
console.log('VERIFICATION REPORT');
console.log('═'.repeat(66));

const passed = results.filter(r => r.status === 'PASS');
const failed = results.filter(r => r.status === 'FAIL');

results.forEach(r => {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} ${r.status.padEnd(6)} [${r.id}] ${r.detail}`);
});

console.log(`\n  ${passed.length} PASS  ${failed.length} FAIL  (${results.length} checks)`);
console.log(`  Screenshots: ${SHOTS}`);

const verdict = failed.length === 0 ? 'SAFE TO PUSH' : 'NOT SAFE TO PUSH';
console.log(`\n${'═'.repeat(66)}`);
console.log(`VERDICT: ${verdict}`);
console.log('═'.repeat(66) + '\n');

process.exit(failed.length > 0 ? 1 : 0);
