import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const FRONTEND = 'https://fitcoach-frontend-omega.vercel.app';
const EMAIL    = 'edengoldenberg@gmail.com';
const PASS     = '12345678';
const SHOTS    = 'C:/Users/owner/Desktop/אפליקציה חדשה/pw-shots/nav-verify';
fs.mkdirSync(SHOTS, { recursive: true });
const shot = n => path.join(SHOTS, n);

const browser = await chromium.launch({ headless: true });
// Use desktop viewport so the menu text is visible
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// Login
await page.goto(`${FRONTEND}/LoginWithPassword`, { waitUntil: 'networkidle', timeout: 20000 });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASS);
await page.click('button[type="submit"]');
await page.waitForTimeout(4000);

// Step 1: CoachDashboard
await page.goto(`${FRONTEND}/CoachDashboard`, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: shot('01-coach-dashboard.png'), fullPage: false });
console.log('[1] CoachDashboard');

// Step 2: Click "תפריט מאמן" hamburger button (now visible on desktop)
await page.click('button:has-text("תפריט מאמן")');
await page.waitForTimeout(1500);
await page.screenshot({ path: shot('02-menu-open.png'), fullPage: false });
console.log('[2] Menu open - URL:', page.url());

// Step 3: Look for the WhatsApp automations item in the slide-out menu
const waItem = page.locator('text=אוטומציות WhatsApp').first();
const count = await waItem.count();
console.log('[3] "אוטומציות WhatsApp" found in menu:', count > 0 ? 'YES' : 'NO');

if (count > 0) {
  await waItem.scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot('03-whatsapp-item-visible.png'), fullPage: false });
  await waItem.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: shot('04-automations-page.png'), fullPage: true });
  console.log('[4] Landed on:', page.url());
} else {
  // Scroll the menu to find it
  await page.screenshot({ path: shot('03-menu-scroll.png'), fullPage: true });
}

await ctx.close();
await browser.close();
