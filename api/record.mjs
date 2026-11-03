// הגרסה בענן (Vercel): מקבלת לינק, מקליטה, שומרת את הסרטון ב-Vercel Blob ומחזירה קישור.
// הסרטון לא נשלח ישירות בתשובה, כי Vercel מגביל תשובה מפונקציה ל-4.5MB.
// GET /api/record = בדיקת מצב: מה קיים בשרת ומה חסר (Chrome, ffmpeg, אחסון).
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export const config = { maxDuration: 300 };

const json = (body, status = 200) => Response.json(body, { status });

export async function GET() {
  const checks = { blobToken: !!process.env.BLOB_READ_WRITE_TOKEN, vercel: !!process.env.VERCEL, node: process.version };
  try {
    const ffmpeg = (await import('ffmpeg-static')).default;
    checks.ffmpeg = ffmpeg && existsSync(ffmpeg) ? 'ok' : `חסר (${ffmpeg})`;
  } catch (e) { checks.ffmpeg = `שגיאה: ${e.message}`; }
  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    checks.chrome = (await chromium.executablePath()) ? 'ok' : 'חסר';
  } catch (e) { checks.chrome = `שגיאה: ${e.message}`; }
  return json(checks);
}

export async function POST(request) {
  let browser;
  try {
    const { launchBrowser, recordSite, nameFromUrl } = await import('../site-to-reel.mjs');
    const { put } = await import('@vercel/blob');
    const { url, scrollSeconds } = await request.json().catch(() => ({}));
    let parsed;
    try { parsed = new URL(url); } catch { return json({ error: 'הלינק לא תקין' }, 400); }
    if (!/^https?:$/.test(parsed.protocol)) return json({ error: 'הלינק צריך להתחיל ב-https://' }, 400);
    if (!process.env.BLOB_READ_WRITE_TOKEN) return json({ error: 'האחסון לסרטונים (Vercel Blob) לא מחובר לפרויקט' }, 500);

    const name = nameFromUrl(parsed.href);
    browser = await launchBrowser();
    const file = await recordSite(browser, { name, url: parsed.href }, {
      scrollSeconds: Math.min(30, Math.max(5, +scrollSeconds || 12)),
    });
    const blob = await put(`reels/${name}.mp4`, await readFile(file), { access: 'public', contentType: 'video/mp4' });
    return json({ url: blob.url, name });
  } catch (e) {
    // כל שגיאה חוזרת עם הסבר – במקום "Internal Server Error" ריק
    return json({ error: 'לא הצלחתי להקליט את האתר', detail: e.message }, 500);
  } finally {
    await browser?.close().catch(() => {});
  }
}
