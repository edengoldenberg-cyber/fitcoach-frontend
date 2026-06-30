/**
 * Camera flow reproduction — traces every step, captures all requests/responses
 */
import { chromium } from 'playwright';
import { writeFileSync, existsSync } from 'fs';

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

async function downloadFoodImage() {
  const urls = [
    'https://www.themealdb.com/images/media/meals/sytuqu1511553755.jpg',
    'https://static.toiimg.com/thumb/92764640.cms?width=320&height=240',
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://google.com' } });
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 5000) {
          writeFileSync('/tmp/food.jpg', buf);
          console.log(`Downloaded food image: ${buf.length} bytes from ${url}`);
          return '/tmp/food.jpg';
        }
      }
    } catch {}
  }
  // Create a minimal valid JPEG if all downloads fail
  // This is a real minimal JPEG (8x8 pixels, solid color)
  const minJpeg = Buffer.from([
    0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,
    0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,
    0x07,0x07,0x07,0x09,0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,
    0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,0x24,0x2E,0x27,0x20,
    0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,
    0x39,0x3D,0x38,0x32,0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x08,
    0x00,0x08,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,0x01,0x05,0x01,0x01,
    0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,
    0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0xFF,0xC4,0x00,0xB5,0x10,0x00,0x02,0x01,0x03,
    0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,0x01,0x7D,0x01,0x02,0x03,0x00,
    0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,
    0x81,0x91,0xA1,0x08,0x23,0x42,0xB1,0xC1,0x15,0x52,0xD1,0xF0,0x24,0x33,0x62,0x72,
    0x82,0x09,0x0A,0x16,0x17,0x18,0x19,0x1A,0x25,0x26,0x27,0x28,0x29,0x2A,0x34,0x35,
    0x36,0x37,0x38,0x39,0x3A,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4A,0x53,0x54,0x55,
    0x56,0x57,0x58,0x59,0x5A,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6A,0x73,0x74,0x75,
    0x76,0x77,0x78,0x79,0x7A,0x83,0x84,0x85,0x86,0x87,0x88,0x89,0x8A,0x92,0x93,0x94,
    0x95,0x96,0x97,0x98,0x99,0x9A,0xA2,0xA3,0xA4,0xA5,0xA6,0xA7,0xA8,0xA9,0xAA,0xB2,
    0xB3,0xB4,0xB5,0xB6,0xB7,0xB8,0xB9,0xBA,0xC2,0xC3,0xC4,0xC5,0xC6,0xC7,0xC8,0xC9,
    0xCA,0xD2,0xD3,0xD4,0xD5,0xD6,0xD7,0xD8,0xD9,0xDA,0xE1,0xE2,0xE3,0xE4,0xE5,0xE6,
    0xE7,0xE8,0xE9,0xEA,0xF1,0xF2,0xF3,0xF4,0xF5,0xF6,0xF7,0xF8,0xF9,0xFA,0xFF,0xDA,
    0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0xFB,0x26,0x8A,0x28,0x03,0xFF,0xD9
  ]);
  writeFileSync('/tmp/food.jpg', minJpeg);
  console.log('Created minimal JPEG:', minJpeg.length, 'bytes');
  return '/tmp/food.jpg';
}

async function main() {
  const jwt = await getJWT();
  if (!jwt) { console.error('LOGIN FAILED'); process.exit(1); }

  const foodImage = await downloadFoodImage();

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();

  // Track ALL API calls precisely
  const allRequests = [];
  const allResponses = [];
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      allRequests.push({ ts: Date.now(), method: req.method(), url: req.url().replace(PROD_FE, '').replace(PROD_BE, '[BE]'), body: req.postData()?.slice(0, 500) });
    }
  });
  page.on('response', async resp => {
    if (resp.url().includes('/api/')) {
      let body = '';
      try { body = await resp.text(); } catch {}
      allResponses.push({ ts: Date.now(), status: resp.status(), url: resp.url().replace(PROD_FE, '').replace(PROD_BE, '[BE]'), body: body.slice(0, 800) });
      if (resp.status() >= 400) console.log(`  ❌ ${resp.status()} ${resp.url().replace(PROD_BE, '[BE]')}: ${body.slice(0,200)}`);
    }
  });
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('error') || text.includes('Error') || text.includes('FAIL') || text.includes('שגיאה') || text.includes('MUTATION') || text.includes('SAVE') || text.includes('PHOTO')) {
      console.log(`  [${msg.type().toUpperCase()}] ${text.slice(0, 200)}`);
    }
  });
  page.on('framenavigated', f => {
    if (f === page.mainFrame()) console.log('  [NAV]', f.url().replace(PROD_FE, ''));
  });

  await page.addInitScript(t => localStorage.setItem('fitcoach_token', t), jwt);

  console.log('\n══ STEP 1: Load NutritionLog ══');
  await page.goto(`${PROD_FE}/NutritionLog`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Dismiss PWA prompt and startup overlay
  for (const selector of ['button:has-text("לא עכשיו")', 'button:has-text("✕")', 'button:has-text("×")']) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(300);
    }
  }

  await page.screenshot({ path: '/tmp/cam_1_nutrition.png' });
  console.log('Page title:', await page.title());

  console.log('\n══ STEP 2: Click camera button "📸צלם" ══');
  const cameraBtn = page.locator('button').filter({ hasText: 'צלם' }).first();
  const cameraVisible = await cameraBtn.isVisible().catch(() => false);
  console.log('Camera button visible:', cameraVisible);

  if (!cameraVisible) {
    console.log('Available buttons:', await page.locator('button').allTextContents());
    await browser.close();
    return;
  }

  await cameraBtn.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/cam_2_dialog_opened.png' });

  // Capture dialog state
  const dialogText = await page.textContent('body').catch(() => '');
  const dialogBtns = await page.locator('button').allTextContents();
  console.log('Dialog buttons:', JSON.stringify(dialogBtns.filter(b => b.trim()).slice(0, 20)));

  console.log('\n══ STEP 3: Upload food image ══');
  // Find the file inputs (camera and gallery)
  const fileInputs = await page.locator('input[type="file"]').all();
  console.log('File inputs found:', fileInputs.length);
  for (let i = 0; i < fileInputs.length; i++) {
    const accept = await fileInputs[i].getAttribute('accept');
    const capture = await fileInputs[i].getAttribute('capture');
    console.log(`  Input[${i}]: accept=${accept} capture=${capture}`);
  }

  // Use the gallery input (no capture attribute) or first available
  const galleryInput = fileInputs.find ? fileInputs[1] || fileInputs[0] : fileInputs[0];
  if (galleryInput && foodImage) {
    await galleryInput.setInputFiles(foodImage);
    console.log('Food image uploaded to file input');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/cam_3_image_selected.png' });
  }

  // Look for "Analyze" / "נתח" button
  const analyzeBtn = page.locator('button').filter({ hasText: /נתח|AI|Sparkles|ניתוח/ }).first();
  if (await analyzeBtn.isVisible().catch(() => false)) {
    console.log('\n══ STEP 4: Click analyze button ══');
    await analyzeBtn.click();
    console.log('Analyzing... (waiting up to 60s for AI response)');

    // Wait for analysis to complete (look for results or error)
    try {
      await page.waitForFunction(() => {
        const body = document.body.textContent;
        return body.includes('קלוריות') || body.includes('שמור') || body.includes('שגיאה') || body.includes('ביטחון');
      }, { timeout: 60000 });
    } catch {
      console.log('Analysis timeout');
    }

    await page.screenshot({ path: '/tmp/cam_4_after_analysis.png' });
    const afterAnalysis = await page.locator('button').allTextContents();
    console.log('Buttons after analysis:', JSON.stringify(afterAnalysis.filter(b => b.trim()).slice(0, 15)));

    const pageContent = await page.textContent('body').catch(() => '');
    console.log('Page shows calories?', pageContent.includes('קלוריות'));
    console.log('Page shows error?', pageContent.includes('שגיאה'));
    console.log('Page text excerpt:', pageContent.slice(0, 400));
  }

  // Look for save button
  const saveBtn = page.locator('button').filter({ hasText: /שמור/ }).first();
  if (await saveBtn.isVisible().catch(() => false)) {
    console.log('\n══ STEP 5: Click Save ══');

    // Clear previous responses to isolate the save request
    const beforeSaveResponses = [...allResponses];

    await saveBtn.click();
    console.log('Save clicked — waiting for result...');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/cam_5_after_save.png' });

    // Find the MealEntry create requests
    const afterSaveResponses = allResponses.filter(r => !beforeSaveResponses.includes(r));
    console.log('\n  === SAVE API CALLS ===');
    afterSaveResponses.forEach(r => {
      console.log(`  [${r.status}] ${r.url}: ${r.body.slice(0, 300)}`);
    });

    // Check for error toast
    const pageAfterSave = await page.textContent('body').catch(() => '');
    console.log('Error visible?', pageAfterSave.includes('שגיאה'));
    console.log('Success visible?', pageAfterSave.includes('נשמר') || pageAfterSave.includes('✅'));
    if (pageAfterSave.includes('שגיאה')) {
      const errMatch = pageAfterSave.match(/שגיאה[^.!?]+/);
      console.log('Error message:', errMatch?.[0]);
    }
  }

  // Final state
  const finalBtns = await page.locator('button').allTextContents();
  console.log('\nFinal buttons:', JSON.stringify(finalBtns.filter(b => b.trim()).slice(0, 15)));

  // Save full API log
  writeFileSync('/tmp/camera_api_log.json', JSON.stringify({
    requests: allRequests.map(r => ({ method: r.method, url: r.url, bodyPreview: r.body?.slice(0, 200) })),
    responses: allResponses.map(r => ({ status: r.status, url: r.url, body: r.body?.slice(0, 500) })),
  }, null, 2));
  console.log('\nFull API log: /tmp/camera_api_log.json');

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
