/**
 * Test the AIAnalyzeMealDialog flow — this is the "🔍נתח" button path
 * which ALSO has camera/gallery buttons inside it.
 * The error "חלק מהמרכיבים לא נשמרו" comes from this dialog's handleSave.
 */
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  const allPosts = [];
  const allErrors = [];
  const consoleOut = [];

  page.on('request', req => {
    if (req.method() !== 'GET' && req.url().includes('/api/')) {
      const entry = {
        method: req.method(),
        url: req.url().replace(PROD_BE, '[BE]'),
        body: req.postData(),
      };
      allPosts.push(entry);
      console.log(`  → ${req.method()} ${entry.url}`);
      if (req.postData()?.length < 500) console.log('    ', req.postData());
    }
  });
  page.on('response', async resp => {
    if (resp.url().includes('/api/') && resp.request().method() !== 'GET') {
      let body = ''; try { body = await resp.text(); } catch {}
      const status = resp.status();
      console.log(`  ← ${status} ${resp.url().replace(PROD_BE, '[BE]')}: ${body.slice(0, 200)}`);
      if (status >= 400) allErrors.push({ status, url: resp.url(), body });
    }
  });
  page.on('console', msg => {
    const t = msg.text();
    consoleOut.push({ type: msg.type(), text: t });
    if (t.includes('MUTATION') || t.includes('SAVE') || t.includes('שגיאה') || t.includes('error') || t.includes('Error') || t.includes('SMOKE')) {
      console.log(`  [${msg.type()}] ${t.slice(0, 300)}`);
    }
  });
  page.on('framenavigated', f => { if (f === page.mainFrame()) console.log('  [NAV]', f.url().replace(PROD_FE, '')); });

  await page.addInitScript(t => localStorage.setItem('fitcoach_token', t), jwt);

  console.log('\n═══ TEST: AIAnalyzeMealDialog → Text+Photo → Save ═══\n');

  // Load NutritionLog
  await page.goto(`${PROD_FE}/NutritionLog`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  const no = page.locator('text=לא עכשיו').first();
  if (await no.isVisible().catch(() => false)) { await no.click(); await page.waitForTimeout(300); }

  await page.screenshot({ path: '/tmp/ad1_loaded.png' });

  // Click "🔍נתח" to open AIAnalyzeMealDialog
  console.log('\n── Click "נתח" button ──');
  const analyzeBtn = page.locator('button').filter({ hasText: 'נתח' }).first();
  await analyzeBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/ad2_dialog.png' });

  const dlgText = await page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText?.slice(0, 200) || '');
  console.log('Dialog opened:', dlgText.slice(0, 100));

  // Type food description
  console.log('\n── Type food description ──');
  const textarea = page.locator('[role="dialog"] textarea').first();
  if (await textarea.isVisible().catch(() => false)) {
    await textarea.fill('חזה עוף 150 גרם עם אורז 100 גרם');
    console.log('Typed food description');
  }

  // Check for camera button inside dialog
  console.log('\n── Check for camera/gallery buttons inside dialog ──');
  const dlgBtns = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return dlg ? Array.from(dlg.querySelectorAll('button, input[type=file]')).map(e => ({
      tag: e.tagName, text: e.textContent?.trim()?.slice(0, 30), accept: e.getAttribute?.('accept'), capture: e.getAttribute?.('capture')
    })) : [];
  });
  console.log('Dialog elements:', JSON.stringify(dlgBtns));

  // Try uploading photo via gallery input inside dialog
  const galleryInDialog = page.locator('[role="dialog"] input[type="file"]').nth(1);
  if (await galleryInDialog.count() > 0) {
    console.log('\n── Upload photo via gallery in dialog ──');
    await galleryInDialog.setInputFiles('/tmp/food.jpg');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/ad3_photo_uploaded.png' });
    console.log('Photo uploaded');
  }

  // Click Analyze
  console.log('\n── Click analyze ──');
  const analyzeInDlg = page.locator('[role="dialog"] button').filter({ hasText: /נתח עם|Analyze/ }).first();
  if (await analyzeInDlg.isVisible().catch(() => false)) {
    await analyzeInDlg.click();
    console.log('Analyzing (up to 90s)...');
    try {
      await page.waitForFunction(() => {
        const dlg = document.querySelector('[role="dialog"]');
        return dlg && (dlg.innerText.includes('קלוריות') || dlg.innerText.includes('שמור') || dlg.innerText.includes('שגיאה') || dlg.innerText.includes('ביטחון'));
      }, { timeout: 90000 });
    } catch { console.log('Timeout waiting for analysis result'); }

    await page.screenshot({ path: '/tmp/ad4_analyzed.png' });
    const afterAnalysis = await page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText?.slice(0, 400) || '');
    console.log('After analysis:', afterAnalysis.slice(0, 300));
  }

  // Click Save
  console.log('\n── Click Save ──');
  const saveDlgBtn = page.locator('[role="dialog"] button').filter({ hasText: /שמור|Save/ }).first();
  const saveVis = await saveDlgBtn.isVisible().catch(() => false);
  console.log('Save button visible:', saveVis);

  if (saveVis) {
    await saveDlgBtn.click();
    console.log('Save clicked — waiting 8s...');
    await page.waitForTimeout(8000);
    await page.screenshot({ path: '/tmp/ad5_after_save.png' });

    const afterSave = await page.evaluate(() => document.body.innerText.slice(0, 600));
    const hasError = afterSave.includes('שגיאה');
    const dialogStillOpen = await page.locator('[role="dialog"]').isVisible().catch(() => false);

    console.log('\n═══ SAVE RESULT ═══');
    console.log('Error visible:', hasError);
    console.log('Dialog still open:', dialogStillOpen);
    console.log('POST requests made:', allPosts.filter(r => r.url.includes('MealEntry')).length);
    console.log('API errors:', allErrors.length);

    if (hasError) {
      const errMatch = afterSave.match(/שגיאה[^\n]{0,100}/);
      console.log('Error text:', errMatch?.[0]);
    }

    // Key: check what was in the POST body
    const mealPosts = allPosts.filter(r => r.url.includes('MealEntry'));
    if (mealPosts.length > 0) {
      console.log('\n=== MealEntry POST bodies ===');
      mealPosts.forEach((r, i) => {
        try {
          const body = JSON.parse(r.body);
          console.log(`\nIngredient ${i+1}:`, JSON.stringify(body, null, 2).slice(0, 500));
        } catch { console.log(r.body?.slice(0, 300)); }
      });
    } else {
      console.log('\n⚠️  NO MealEntry POST requests made — frontend blocked save');
    }

    // Check console logs for mutation errors
    const mutErrors = consoleOut.filter(c => c.text.includes('MUTATION_ERROR') || c.text.includes('MUTATION_ON_ERROR'));
    if (mutErrors.length) {
      console.log('\n=== Mutation Errors ===');
      mutErrors.forEach(e => console.log(e.text.slice(0, 300)));
    }
  } else {
    const allDlgBtns = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return dlg ? Array.from(dlg.querySelectorAll('button')).map(b => b.textContent?.trim()) : [];
    });
    console.log('Dialog buttons (no save found):', JSON.stringify(allDlgBtns));
  }

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message, '\n', e.stack?.split('\n').slice(0,5).join('\n')); process.exit(1); });
