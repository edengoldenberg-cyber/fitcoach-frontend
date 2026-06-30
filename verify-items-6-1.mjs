/**
 * Targeted: Items 1 & 6 — text AI meal + clarification buttons
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const PROD = 'https://fitcoach-frontend-omega.vercel.app';
const TRAINEE_EMAIL = 'edenchen1212@gmail.com';
const TRAINEE_PASS = '12345678';
const SHOTS_DIR = 'C:/Users/owner/Desktop/pw-shots/verify16-' + Date.now();
mkdirSync(SHOTS_DIR, { recursive: true });

async function shot(page, name) {
  const p = `${SHOTS_DIR}/${name}.png`;
  await page.screenshot({ path: p });
  console.log(`📸 ${name}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // Login
  await page.goto(PROD + '/LoginWithPassword', { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="email"]', TRAINEE_EMAIL);
  await page.fill('input[type="password"]', TRAINEE_PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // NutritionLog
  await page.goto(PROD + '/NutritionLog', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // "➕חדש" opens AddMealActionSheet which has "תאר ב-AI" option
  await page.locator('button:has-text("חדש")').click();
  await page.waitForTimeout(1000);
  await shot(page, '01-action-sheet');

  // Look for "AI" / text describe option in the sheet
  const sheetBtns = await page.locator('[role="dialog"] button, [class*="sheet"] button, [class*="bottom"] button').allTextContents();
  console.log('Sheet buttons:', sheetBtns);

  // Try to find the "תאר" or "AI" text option
  const aiTextBtn = page.locator('button:has-text("תאר"), button:has-text("AI"), button:has-text("טקסט"), button:has-text("הוסף ב")').first();
  const cnt = await aiTextBtn.count();
  console.log('AI text button in sheet:', cnt);

  if (cnt > 0) {
    await aiTextBtn.click();
    await page.waitForTimeout(1000);
    await shot(page, '02-ai-text-dialog');
  } else {
    // Escape and try direct path — add meal with AI is triggered from NutritionLog action bar
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // The "✨הצע" button was for suggestions. Let's look for "AI" meal adding
    // In NutritionLog there's a button row: הצע, נתח (photo), צלם, חדש
    // AddMealWithAI might be accessible through the "+" in a meal type section
    // Let's navigate directly to the meal section and click "+" then choose AI
    const addMealBtns = await page.locator('button[aria-label*="הוסף"], button:has-text("הוסף ארוחה"), button:has-text("AI")').allTextContents();
    console.log('Add meal buttons:', addMealBtns);
    await shot(page, '02b-after-escape');
  }

  // Dismiss any dialogs
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Try from TraineeHome — the "מה אכלת?" section
  await page.goto(PROD + '/TraineeHome', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, '03-trainee-home');

  // Look for AI meal button on home screen
  const homeAiBtn = page.locator('button:has-text("AI"), button:has-text("בינה"), button:has-text("הוסף")').first();
  if (await homeAiBtn.count() > 0) {
    await homeAiBtn.click();
    await page.waitForTimeout(1000);
    await shot(page, '04-home-ai-dialog');
  }

  // --- Direct approach: open AddMealWithAI via NutritionLog internal navigation ---
  await page.goto(PROD + '/NutritionLog', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Click into a meal type to expose per-meal actions
  await page.locator('text=ארוחת בוקר').first().click();
  await page.waitForTimeout(500);
  await shot(page, '05-after-meal-click');

  // Look for the AI button inside meal section
  const mealAiBtn = page.locator('button:has-text("AI"), button:has-text("הוסף עם"), button:has-text("נתח")').first();
  if (await mealAiBtn.count() > 0) {
    await mealAiBtn.click();
    await page.waitForTimeout(1000);
    await shot(page, '06-meal-ai-dialog');

    // Check for textarea
    const ta = page.locator('textarea').first();
    if (await ta.count() > 0) {
      await ta.fill('חביתה 2 ביצים עם 30 גרם גבינה לבנה');
      // Find the analyze button inside the dialog (not the one behind it)
      const analyzeBtn = page.locator('[role="dialog"] button:has-text("נתח"), [role="dialog"] button:has-text("AI"), [role="dialog"] button:has-text("מתקדם")').first();
      if (await analyzeBtn.count() > 0) {
        await analyzeBtn.click();
        console.log('Analyzing meal text...');
        await page.waitForTimeout(12000);
        await shot(page, '07-analysis-result');

        const bodyText = await page.textContent('body');
        const hasResult = bodyText.includes('קל׳') || bodyText.includes('קלוריות') || bodyText.includes('ח:');
        console.log('✅ ITEM 6 analysis result found:', hasResult);

        // Check clarification buttons
        const clarifyTexts = await page.locator('[role="dialog"] button.border-amber-300, [role="dialog"] .bg-amber-50 button').allTextContents();
        console.log('ITEM 1 clarification texts:', clarifyTexts);
        await shot(page, '08-clarification-check');
      }
    }
  }

  await browser.close();
  console.log('Done. Screenshots:', SHOTS_DIR);
}

run().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
