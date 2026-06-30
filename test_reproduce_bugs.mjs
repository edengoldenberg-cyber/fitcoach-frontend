/**
 * Bug reproduction test — follows EXACT real user flow in production browser.
 * Does NOT test API directly. Uses the UI exactly as a trainee would.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const PROD_FE = 'https://fitcoach-frontend-omega.vercel.app';
const PROD_BE = 'https://fitcoach-server-production-19e8.up.railway.app';
const EMAIL   = 'shani12babi@gmail.com';
const PASSWORD = '12345678';

async function getJWT() {
  const r = await fetch(`${PROD_BE}/api/functions/verifyPasswordLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  return (await r.json())?.access_token;
}

async function main() {
  const jwt = await getJWT();
  console.log('JWT:', jwt ? 'obtained' : 'FAILED');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  // Capture all console logs and network errors
  const consoleLogs = [];
  const networkErrors = [];
  const apiRequests = [];
  const apiResponses = [];

  const page = await ctx.newPage();

  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') console.log('  [CONSOLE ERROR]', msg.text());
  });
  page.on('pageerror', err => {
    networkErrors.push(err.message);
    console.log('  [PAGE ERROR]', err.message);
  });
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes(PROD_BE) || url.includes('api')) {
      const status = resp.status();
      let body = '';
      try { body = await resp.text(); } catch {}
      apiResponses.push({ url, status, body: body.slice(0, 500) });
      if (status >= 400) {
        console.log(`  [API ERROR] ${status} ${url.replace(PROD_BE, '')}: ${body.slice(0, 200)}`);
      }
    }
  });
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/') && req.method() !== 'GET') {
      apiRequests.push({ method: req.method(), url: url.replace(PROD_BE, ''), body: req.postData()?.slice(0, 300) });
      console.log(`  [REQUEST] ${req.method()} ${url.replace(PROD_BE, '')}`);
    }
  });
  page.on('framenavigated', f => {
    if (f === page.mainFrame()) console.log('  [NAV]', f.url().replace(PROD_FE, ''));
  });

  // Inject JWT
  await page.addInitScript(t => {
    localStorage.setItem('fitcoach_token', t);
  }, jwt);

  console.log('\n═══ STEP 1: Navigate to NutritionLog ═══');
  await page.goto(`${PROD_FE}/NutritionLog`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Close startup overlay if present
  const closeOverlay = page.locator('button').filter({ hasText: '✕' }).first();
  if (await closeOverlay.isVisible().catch(() => false)) {
    await closeOverlay.click();
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: '/tmp/bug1_step1_nutrition_log.png' });
  console.log('Screenshot: /tmp/bug1_step1_nutrition_log.png');

  // Find all buttons on the page
  const allBtns = await page.locator('button').allTextContents();
  console.log('Buttons visible:', JSON.stringify(allBtns.filter(b => b.trim()).slice(0, 15)));

  console.log('\n═══ STEP 2: Open camera/photo dialog ═══');
  // Look for the "+" or add button or camera/photo button
  const addButtons = await page.locator('button, [role="button"]').all();
  let addMealBtn = null;

  // Try to find camera/add meal button
  for (const btn of addButtons) {
    const text = await btn.textContent().catch(() => '');
    const ariaLabel = await btn.getAttribute('aria-label').catch(() => '');
    if (text.includes('צלם') || text.includes('תמונה') || text.includes('AI') ||
        ariaLabel.includes('camera') || ariaLabel.includes('photo') ||
        text.includes('הוסף') || text.includes('+')) {
      console.log('Found button:', text.trim() || ariaLabel);
    }
  }

  // Look for the meal type add button (the + buttons in each meal category)
  const plusBtns = page.locator('button').filter({ hasText: '+' });
  const plusCount = await plusBtns.count();
  console.log('Plus buttons count:', plusCount);

  // Try clicking the first "+" to open AddMealActionSheet
  if (plusCount > 0) {
    await plusBtns.first().click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/bug1_step2_after_plus.png' });
    console.log('Screenshot after clicking +: /tmp/bug1_step2_after_plus.png');

    const sheetBtns = await page.locator('button').allTextContents();
    console.log('Sheet buttons:', JSON.stringify(sheetBtns.filter(b => b.trim()).slice(0, 20)));
  }

  // Look for camera option in the sheet
  const cameraOption = page.locator('button, [role="button"]').filter({ hasText: /צלם|מצלמה|תמונה|קמרה|AI תמונה/ }).first();
  const cameraVis = await cameraOption.isVisible().catch(() => false);
  console.log('Camera option visible:', cameraVis);
  if (cameraVis) {
    const cameraText = await cameraOption.textContent();
    console.log('Camera button text:', cameraText);
    await cameraOption.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/bug1_step3_camera_dialog.png' });
    console.log('Screenshot camera dialog: /tmp/bug1_step3_camera_dialog.png');
  }

  // Check page state after these clicks
  const pageText = await page.textContent('body').catch(() => '');
  console.log('Page text excerpt:', pageText.slice(0, 300));

  console.log('\n═══ STEP 3: Find camera/file input and upload food image ═══');
  // Look for the file input for camera
  const fileInputs = await page.locator('input[type="file"]').all();
  console.log('File inputs found:', fileInputs.length);

  // Check if we have a food image
  let foodImagePath = null;
  try {
    // Create a minimal valid food image using Node.js
    // Use a known good JPEG - download from reliable source
    const resp = await fetch('https://www.themealdb.com/images/media/meals/sytuqu1511553755.jpg', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      foodImagePath = '/tmp/food_image.jpg';
      writeFileSync(foodImagePath, Buffer.from(buf));
      console.log('Food image downloaded:', Buffer.from(buf).length, 'bytes');
    }
  } catch (e) {
    console.log('Could not download food image:', e.message);
  }

  if (foodImagePath && fileInputs.length > 0) {
    // Set the file on the camera input
    await fileInputs[0].setInputFiles(foodImagePath);
    console.log('File uploaded to input[0]');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/bug1_step4_file_uploaded.png' });
    console.log('Screenshot after upload: /tmp/bug1_step4_file_uploaded.png');
  }

  // Save all API responses for analysis
  console.log('\n═══ API Requests/Responses captured ═══');
  apiRequests.forEach(r => console.log(`  ${r.method} ${r.url}`));
  apiResponses.forEach(r => {
    if (r.status >= 400 || r.url.includes('Meal') || r.url.includes('analyze')) {
      console.log(`  [${r.status}] ${r.url.replace(PROD_BE, '')}: ${r.body.slice(0, 150)}`);
    }
  });

  writeFileSync('/tmp/bug_repro_logs.json', JSON.stringify({
    consoleLogs: consoleLogs.slice(-50),
    networkErrors,
    apiRequests,
    apiResponses: apiResponses.map(r => ({ ...r, body: r.body.slice(0, 300) }))
  }, null, 2));
  console.log('Full logs: /tmp/bug_repro_logs.json');

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
