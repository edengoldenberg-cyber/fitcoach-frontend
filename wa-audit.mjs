/**
 * Phase 1 — Audit existing WhatsApp automation UI in production
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const FRONTEND = 'https://fitcoach-frontend-omega.vercel.app';
const EMAIL    = 'edengoldenberg@gmail.com';
const PASS     = '12345678';
const SHOTS    = 'C:/Users/owner/Desktop/אפליקציה חדשה/pw-shots/wa-audit';
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (n) => path.join(SHOTS, n);

const browser = await chromium.launch({ headless: true });

async function loginAs(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/LoginWithPassword`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  return page;
}

// ── Audit pages ──────────────────────────────────────────────────────────────
const PAGES_TO_AUDIT = [
  { name: 'CoachAutomations',        path: '/CoachAutomations',        file: '01-coach-automations.png' },
  { name: 'ReminderAutomations',     path: '/ReminderAutomations',     file: '02-reminder-automations.png' },
  { name: 'WhatsAppControlCenter',   path: '/WhatsAppControlCenter',   file: '03-wa-control-center.png' },
  { name: 'WhatsAppManager',         path: '/WhatsAppManager',         file: '04-wa-manager.png' },
  { name: 'WhatsAppControlPanel',    path: '/WhatsAppControlPanel',    file: '05-wa-control-panel.png' },
  { name: 'AutomationSettings',      path: '/AutomationSettings',      file: '06-automation-settings.png' },
  { name: 'WhatsAppDebugCenter',     path: '/WhatsAppDebugCenter',     file: '07-wa-debug-center.png' },
];

const audit = [];

for (const p of PAGES_TO_AUDIT) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await loginAs(ctx);

  try {
    await page.goto(`${FRONTEND}${p.path}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    const hasError = pageText.includes('404') || pageText.includes('not found') || pageText.includes('שגיאה');
    const hasContent = pageText.length > 100;

    await page.screenshot({ path: shot(p.file), fullPage: true });

    audit.push({
      page:     p.name,
      path:     p.path,
      loaded:   !hasError && hasContent,
      url:      finalUrl,
      preview:  pageText.substring(0, 100).replace(/\n/g, ' '),
      file:     p.file,
    });

    console.log(`[AUDIT] ${p.name}: ${!hasError && hasContent ? 'LOADED' : 'ERROR/EMPTY'}`);
    console.log(`  preview: ${pageText.substring(0, 80).replace(/\n/g, ' ')}`);
  } catch(e) {
    console.log(`[AUDIT] ${p.name}: CRASHED — ${e.message}`);
    audit.push({ page: p.name, path: p.path, loaded: false, error: e.message });
  }

  await ctx.close();
}

await browser.close();

// Summary
console.log('\n=== AUDIT SUMMARY ===');
console.log('Page                     | Loaded? | Preview');
console.log('-------------------------|---------|--------');
for (const a of audit) {
  const pad = (s, n) => String(s).substring(0, n).padEnd(n);
  console.log(`${pad(a.page, 26)}| ${a.loaded ? 'YES    ' : 'NO     '}| ${(a.preview || a.error || '').substring(0, 60)}`);
}
