// הגרסה בענן (Vercel): מקבלת לינק, מקליטה, ומחזירה את הסרטון.
// בלי אחסון: הסרטון (720x1280) חוזר ישירות בתשובה – Vercel מגביל תשובה ל-4.5MB, והסרטון קטן מזה.
// אם מחובר Vercel Blob – הסרטון נשמר שם ומוחזר קישור (מתאים גם לסרטונים ארוכים).
// GET /api/record = בדיקת מצב: מה קיים בשרת ומה חסר (Chrome, ffmpeg, אחסון).
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export const config = { maxDuration: 300 };

const json = (body, status = 200) => Response.json(body, { status });

export async function GET() {
  await import('../site-to-reel.mjs'); // מגדיר את הסביבה של Chrome לפני שבודקים אותו
  const checks = { blobToken: !!process.env.BLOB_READ_WRITE_TOKEN, vercel: !!process.env.VERCEL, node: process.version };
  try {
    const ffmpeg = (await import('ffmpeg-static')).default;
    checks.ffmpeg = ffmpeg && existsSync(ffmpeg) ? 'ok' : `חסר (${ffmpeg})`;
  } catch (e) { checks.ffmpeg = `שגיאה: ${e.message}`; }
  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    checks.chrome = (await chromium.executablePath()) ? 'ok' : 'חסר';
    checks.libnss3 = existsSync('/tmp/al2023/lib/libnss3.so') ? 'ok' : 'חסר';
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
    const name = nameFromUrl(parsed.href);
    browser = await launchBrowser();
    const file = await recordSite(browser, { name, url: parsed.href }, {
      scrollSeconds: Math.min(30, Math.max(5, +scrollSeconds || 12)),
    });
    const data = await readFile(file);
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`reels/${name}.mp4`, data, { access: 'public', contentType: 'video/mp4' });
      return json({ url: blob.url, name });
    }
    if (data.length > 4.4 * 1024 * 1024) {
      return json({ error: 'הסרטון יצא גדול מדי לשליחה ישירה. כדאי לבחור גלילה מהירה יותר, או לחבר Vercel Blob לפרויקט' }, 413);
    }
    return new Response(data, { headers: { 'Content-Type': 'video/mp4', 'X-Reel-Name': name } });
  } catch (e) {
    // כל שגיאה חוזרת עם הסבר – במקום "Internal Server Error" ריק
    return json({ error: 'לא הצלחתי להקליט את האתר', detail: e.message }, 500);
  } finally {
    await browser?.close().catch(() => {});
  }
}
