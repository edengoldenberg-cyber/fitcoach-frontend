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

  const saveRequests = [];
  const saveResponses = [];
  let saveAttempted = false;

  page.on('request', req => {
    if (req.url().includes('/api/entities/MealEntry') && req.method() === 'POST') {
      saveAttempted = true;
      saveRequests.push({
        url: req.url(),
        body: req.postData(),
        ts: new Date().toISOString(),
      });
      console.log('  [SAVE REQUEST] POST /api/entities/MealEntry');
      console.log('  Body:', req.postData()?.slice(0, 400));
    }
  });
  page.on('response', async resp => {
    if (resp.url().includes('/api/entities/MealEntry') && resp.request().method() === 'POST') {
      const body = await resp.text().catch(() => '');
      saveResponses.push({ status: resp.status(), body, ts: new Date().toISOString() });
      console.log(`  [SAVE RESPONSE] ${resp.status()}: ${body.slice(0, 300)}`);
    }
    if (resp.url().includes('analyzeAndEnrichMealPhoto')) {
      const body = await resp.text().catch(() => '');
      console.log(`  [AI RESPONSE] ${resp.status()}: ${body.slice(0, 200)}`);
    }
  });
  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('PHOTO') || t.includes('SAVE') || t.includes('שגיאה') || t.includes('error') || t.includes('Error')) {
      console.log(`  [CONSOLE ${msg.type()}] ${t.slice(0, 200)}`);
    }
  });
  page.on('framenavigated', f => { if (f === page.mainFrame()) console.log('  [NAV]', f.url().replace(PROD_FE, '')); });

  await page.addInitScript(t => localStorage.setItem('fitcoach_token', t), jwt);

  // ── LOAD NUTRITION ──
  console.log('\n══ 1. Load NutritionLog ══');
  await page.goto(`${PROD_FE}/NutritionLog`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  // Dismiss PWA banner
  const no = page.locator('text=לא עכשיו').first();
  if (await no.isVisible().catch(() => false)) { await no.click(); await page.waitForTimeout(500); }
  await page.screenshot({ path: '/tmp/t1_loaded.png' });

  // ── OPEN CAMERA DIALOG ──
  console.log('\n══ 2. Click camera button ══');
  await page.locator('button').filter({ hasText: 'צלם' }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/t2_dialog.png' });

  // See what's in dialog
  const dialogContent = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return dlg ? dlg.innerText.slice(0, 300) : 'NO DIALOG';
  });
  console.log('Dialog content:', dialogContent);

  // ── UPLOAD FILE ──
  console.log('\n══ 3. Upload food image ══');
  // Gallery input is input[type=file] without capture attribute
  const galleryInput = page.locator('input[type="file"]:not([capture])').first();
  const cameraInput  = page.locator('input[type="file"][capture]').first();

  const galleryVisible = await galleryInput.count() > 0;
  const cameraCount   = await page.locator('input[type="file"]').count();
  console.log('File inputs:', cameraCount);

  await page.screenshot({ path: '/tmp/t3_before_upload.png' });

  // Use gallery input (second input, no capture)
  try {
    await page.locator('input[type="file"]').nth(1).setInputFiles('/tmp/food.jpg');
    console.log('Gallery input: file set');
  } catch {
    try {
      await page.locator('input[type="file"]').first().setInputFiles('/tmp/food.jpg');
      console.log('Camera input: file set');
    } catch (e) { console.log('File set error:', e.message); }
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/t4_after_upload.png' });

  const afterUploadContent = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return dlg ? dlg.innerText.slice(0, 400) : document.body.innerText.slice(0, 400);
  });
  console.log('After upload:', afterUploadContent.slice(0, 200));

  // ── CLICK ANALYZE ──
  console.log('\n══ 4. Click analyze inside dialog ══');
  // The analyze button inside dialog is the one that says "נתח עם AI"
  const analyzeInDialog = page.locator('[role="dialog"] button').filter({ hasText: /נתח|AI/ }).first();
  const analyzeVis = await analyzeInDialog.isVisible().catch(() => false);
  console.log('Analyze button in dialog:', analyzeVis);

  if (!analyzeVis) {
    // Show all buttons in dialog
    const dialogBtns = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return [];
      return Array.from(dlg.querySelectorAll('button')).map(b => b.textContent?.trim().slice(0, 30));
    });
    console.log('Dialog buttons:', JSON.stringify(dialogBtns));
  }

  if (analyzeVis) {
    await analyzeInDialog.click();
    console.log('Analyzing... (waiting up to 90s)');

    try {
      await page.waitForFunction(() => {
        const dlg = document.querySelector('[role="dialog"]');
        if (!dlg) return true;
        const text = dlg.innerText;
        return text.includes('קלוריות') || text.includes('שמור') || text.includes('שגיאה') || text.includes('ביטחון') || text.includes('לא ניתן');
      }, { timeout: 90000 });
    } catch { console.log('Analysis timeout after 90s'); }

    await page.screenshot({ path: '/tmp/t5_analyzed.png' });

    const analysisContent = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return dlg ? dlg.innerText.slice(0, 600) : 'NO DIALOG';
    });
    console.log('After analysis:', analysisContent.slice(0, 400));
  }

  // ── SAVE ──
  console.log('\n══ 5. Click Save button ══');
  const saveInDialog = page.locator('[role="dialog"] button').filter({ hasText: /שמור/ }).first();
  const saveVis = await saveInDialog.isVisible().catch(() => false);
  console.log('Save button visible:', saveVis);

  if (saveVis) {
    await saveInDialog.click();
    console.log('Save clicked');
    await page.waitForTimeout(6000);
    await page.screenshot({ path: '/tmp/t6_after_save.png' });

    const afterSave = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log('After save page text:', afterSave.slice(0, 300));
    console.log('Save attempted:', saveAttempted);
    console.log('Save requests:', saveRequests.length);
    console.log('Save responses:', saveResponses.map(r => `${r.status}: ${r.body.slice(0, 200)}`));

    if (saveRequests.length === 0) {
      console.log('\n⚠️  NO SAVE REQUEST MADE — Frontend blocked the save before API call');
    }
    if (saveResponses.some(r => r.status >= 400)) {
      console.log('\n❌ SAVE FAILED — API returned error');
    }
    if (saveResponses.some(r => r.status === 200)) {
      console.log('\n✅ SAVE SUCCEEDED — MealEntry created');
    }
  } else {
    console.log('No save button found — check dialog state');
    const finalDialogBtns = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return [];
      return Array.from(dlg.querySelectorAll('button')).map(b => b.textContent?.trim().slice(0, 40));
    });
    console.log('Dialog buttons:', JSON.stringify(finalDialogBtns));
  }

  // Save logs
  writeFileSync('/tmp/cam_log.json', JSON.stringify({ saveRequests, saveResponses }, null, 2));
  console.log('\nFull log: /tmp/cam_log.json');

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
