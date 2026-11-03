// אוטומציה: מקבלת רשימת אתרים ומייצרת לכל אחד סרטון גלילה אנכי 1080x1920
// מוכן לעריכה ב-CapCut / לרילס.
// שימוש:  node site-to-reel.mjs            (כל האתרים ב-sites.json)
//         node site-to-reel.mjs lavi-katan (אתר אחד לפי שם)
//         node site-to-reel.mjs https://...  (כל לינק, בלי לגעת ב-sites.json)
// אותן פונקציות משמשות גם את הכלי בדפדפן (server.mjs).
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = path.join(homedir(), '.cache/puppeteer/chrome/win64-131.0.6778.108/chrome-win64/chrome.exe');
export const OUT = path.join(HERE, 'out');
const SCROLL_SECONDS = 12; // משך הגלילה מלמעלה עד למטה
const HOLD_TOP = 1500;     // השהייה בראש העמוד (מ"ש)
const HOLD_END = 1000;

export function launchBrowser() {
  return puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
}

// שם קובץ מתוך כתובת האתר + שעה, כדי לא לדרוס סרטון קודם
export function nameFromUrl(url) {
  const u = new URL(url);
  const slug = (u.hostname + u.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  return `${slug}-${stamp}`;
}

// מקליטה אתר אחד ומחזירה את הנתיב ל-MP4. זורקת שגיאה אם האתר לא נטען.
export async function recordSite(browser, site, { scrollSeconds = SCROLL_SECONDS } = {}) {
  mkdirSync(OUT, { recursive: true });
  const page = await browser.newPage();
  try {
    // מסך טלפון: 432x768 ביחס פיקסלים 2.5 = 1080x1920
    await page.setViewport({ width: 432, height: 768, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true });
    await page.goto(site.url, { waitUntil: 'networkidle2', timeout: 60000 });
    // סוגרים באנר עוגיות אם יש (כפתור "דחייה" / "אישור")
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /דחי|רק הכרחי|אישור|מסכימ|Accept|Decline/i.test(x.textContent));
      b?.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const raw = path.join(OUT, `${site.name}.webm`);
    const recorder = await page.screencast({ path: raw });
    await new Promise(r => setTimeout(r, HOLD_TOP));
    // אתרים בסגנון סיפור: לוחצים על כפתור (למשל "התחל") ונותנים לסרט להתנגן
    if (site.clickText) {
      await page.evaluate((txt) => {
        const el = [...document.querySelectorAll('button, a, [role=button]')].find(x => x.textContent.includes(txt));
        el?.click();
      }, site.clickText);
    }
    if (site.playSeconds) await new Promise(r => setTimeout(r, site.playSeconds * 1000));
    // גלילה חלקה ואחידה עד סוף העמוד
    await page.evaluate(async (ms) => {
      // אתרים עם scroll-behavior: smooth "נתקעים" כשגוללים פריים-פריים – מבטלים
      document.documentElement.style.scrollBehavior = 'auto';
      document.body.style.scrollBehavior = 'auto';
      const max = document.documentElement.scrollHeight - innerHeight;
      const start = performance.now();
      await new Promise(done => {
        const step = (t) => {
          const p = Math.min(1, (t - start) / ms);
          const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          scrollTo(0, max * ease);
          p < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      });
    }, scrollSeconds * 1000);
    await new Promise(r => setTimeout(r, HOLD_END));
    await recorder.stop();

    // המרה ל-MP4 אנכי 1080x1920, 30fps – פורמט ש-CapCut ורילס אוהבים
    const mp4 = path.join(OUT, `${site.name}.mp4`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw,
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30',
      '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', mp4]);
    if (existsSync(mp4)) rmSync(raw);
    return mp4;
  } finally {
    await page.close();
  }
}

// הרצה מהטרמינל
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const only = process.argv[2];
  const sites = /^https?:\/\//.test(only ?? '')
    ? [{ name: nameFromUrl(only), url: only }]
    : JSON.parse(readFileSync(path.join(HERE, 'sites.json'), 'utf8')).filter(s => !only || s.name === only);

  const browser = await launchBrowser();
  for (const site of sites) {
    console.log(`🎬 ${site.name} ← ${site.url}`);
    try {
      const mp4 = await recordSite(browser, site);
      console.log(`  ✅ ${mp4}`);
    } catch (e) {
      console.log(`  ⚠️ לא נטען: ${e.message}`);
      process.exitCode = 1;
    }
  }
  await browser.close();
}
