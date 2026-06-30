import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const PROD_FE = 'https://fitcoach-frontend-omega.vercel.app';
const PROD_BE = 'https://fitcoach-server-production-19e8.up.railway.app';
const EMAIL   = 'shani12babi@gmail.com';
const PASSWORD = '12345678';

async function getJWT() {
  const r = await fetch(`${PROD_BE}/api/functions/verifyPasswordLogin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  return (await r.json())?.access_token;
}

async function main() {
  const jwt = await getJWT();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();

  const saveLog = { requests: [], responses: [], errors: [], consoleErrors: [] };

  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/')) {
      const entry = { method: req.method(), url: url.replace(PROD_BE, '[BE]'), body: req.postData()?.slice(0, 800), ts: new Date().toISOString() };
      if (req.method() !== 'GET') {
        saveLog.requests.push(entry);
        if (url.includes('MealEntry') || url.includes('analyze') || url.includes('saveAI')) {
          console.log(`  ▶ ${req.method()} ${url.replace(PROD_BE, '[BE]')}`);
          if (req.postData()) console.log('    Body:', req.postData().slice(0, 500));
        }
      }
    }
  });
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('/api/')) {
      let body = ''; try { body = await resp.text(); } catch {}
      const entry = { status: resp.status(), url: url.replace(PROD_BE, '[BE]'), body: body.slice(0, 800), ts: new Date().toISOString() };
      saveLog.responses.push(entry);
      if (url.includes('MealEntry') || url.includes('analyze')) {
        console.log(`  ◀ ${resp.status()} ${url.replace(PROD_BE, '[BE]')}: ${body.slice(0, 300)}`);
      }
      if (resp.status() >= 400) {
        saveLog.errors.push(entry);
        console.log(`  ❌ ERROR ${resp.status()}: ${body.slice(0, 200)}`);
      }
    }
  });
  page.on('console', msg => {
    const t = msg.text();
    saveLog.consoleErrors.push({ type: msg.type(), text: t });
    if (msg.type() === 'error' || t.includes('PHOTO-SAVE') || t.includes('partial save') || t.includes('שגיאה')) {
      console.log(`  [CONSOLE.${msg.type()}] ${t.slice(0, 300)}`);
    }
  });
  page.on('framenavigated', f => { if (f === page.mainFrame()) console.log('  [NAV]', f.url().replace(PROD_FE, '')); });

  await page.addInitScript(t => localStorage.setItem('fitcoach_token', t), jwt);

  console.log('\n═══ REPRODUCING BUG: Camera meal save ═══\n');

  // 1. Load NutritionLog
  await page.goto(`${PROD_FE}/NutritionLog`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  const pwaNo = page.locator('text=לא עכשיו').first();
  if (await pwaNo.isVisible().catch(() => false)) { await pwaNo.click(); await page.waitForTimeout(300); }

  // 2. Click camera button
  await page.locator('button').filter({ hasText: 'צלם' }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/full1_dialog_opened.png' });

  // 3. Upload food image to gallery input
  await page.locator('input[type="file"]').nth(1).setInputFiles('/tmp/food.jpg');
  await page.waitForTimeout(1000);

  // 4. Click Analyze inside dialog
  const analyzeBtn = page.locator('[role="dialog"] button').filter({ hasText: /נתח/ }).first();
  if (await analyzeBtn.isVisible().catch(() => false)) {
    await analyzeBtn.click();
    console.log('Analyzing image...');
    try {
      await page.waitForFunction(() => {
        const dlg = document.querySelector('[role="dialog"]');
        return dlg && (dlg.innerText.includes('לאיזו') || dlg.innerText.includes('קלוריות') || dlg.innerText.includes('שגיאה'));
      }, { timeout: 90000 });
    } catch { console.log('Analysis timeout'); }
    await page.screenshot({ path: '/tmp/full2_after_analysis.png' });
    console.log('AI analysis done');
  }

  // 5. Continue through meal type selection
  const continueBtn = page.locator('[role="dialog"] button').filter({ hasText: /המשך/ }).first();
  if (await continueBtn.isVisible().catch(() => false)) {
    console.log('\nClicking "המשך לאישור"...');
    await continueBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/full3_review.png' });

    const reviewText = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return dlg ? dlg.innerText.slice(0, 600) : '';
    });
    console.log('Review screen:', reviewText.slice(0, 300));
  }

  // 6. Click Save
  const saveBtn = page.locator('[role="dialog"] button').filter({ hasText: /שמור/ }).first();
  const saveBtnVis = await saveBtn.isVisible().catch(() => false);
  console.log('\nSave button visible:', saveBtnVis);

  if (saveBtnVis) {
    console.log('Clicking "שמור ארוחה"...');
    const beforeSaveCount = saveLog.responses.filter(r => r.url.includes('MealEntry')).length;

    await saveBtn.click();
    await page.waitForTimeout(8000); // Wait for save + any errors

    await page.screenshot({ path: '/tmp/full4_after_save.png' });

    const mealSaves = saveLog.responses.filter(r => r.url.includes('MealEntry') && saveLog.requests.find(req => req.url.includes('MealEntry') && req.method === 'POST'));
    const newResponses = saveLog.responses.filter(r => r.url.includes('MealEntry')).slice(beforeSaveCount);

    console.log('\n═══ SAVE RESULT ═══');
    console.log('MealEntry POST requests made:', saveLog.requests.filter(r => r.url.includes('MealEntry') && r.method === 'POST').length);
    console.log('MealEntry responses:', saveLog.responses.filter(r => r.url.includes('MealEntry')).length);

    const postResponses = saveLog.responses.filter(r => r.url.includes('MealEntry'));
    postResponses.forEach(r => {
      console.log(`  Status ${r.status}: ${r.body.slice(0, 200)}`);
    });

    // Check page for error/success
    const pageFinal = await page.evaluate(() => document.body.innerText.slice(0, 500));
    const hasError = pageFinal.includes('שגיאה') || pageFinal.includes('Error');
    const hasSuccess = !document.querySelector('[role="dialog"]');
    console.log('\nError visible on page:', hasError);
    console.log('Dialog still open:', await page.locator('[role="dialog"]').isVisible().catch(() => false));

    if (hasError) {
      const errorMatch = pageFinal.match(/שגיאה[^\n]*/);
      console.log('Error text:', errorMatch?.[0]);
    }

    // KEY: Check console for the exact error
    const photoSaveLogs = saveLog.consoleErrors.filter(c => c.text.includes('PHOTO') || c.text.includes('save') || c.text.includes('partial') || c.text.includes('שגיאה'));
    console.log('\nRelevant console logs:', photoSaveLogs.length);
    photoSaveLogs.forEach(c => console.log(`  [${c.type}]`, c.text.slice(0, 200)));
  }

  writeFileSync('/tmp/full_save_log.json', JSON.stringify(saveLog, null, 2));
  console.log('\nFull log: /tmp/full_save_log.json');

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
