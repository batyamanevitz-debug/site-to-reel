// הגרסה בענן (Vercel): מקבלת לינק, מקליטה, שומרת את הסרטון ב-Vercel Blob ומחזירה קישור.
// הסרטון לא נשלח ישירות בתשובה, כי Vercel מגביל תשובה מפונקציה ל-4.5MB.
import { readFile } from 'node:fs/promises';
import { put } from '@vercel/blob';
import { launchBrowser, recordSite, nameFromUrl } from '../site-to-reel.mjs';

export const config = { maxDuration: 300 };

const json = (body, status = 200) => Response.json(body, { status });

export async function POST(request) {
  const { url, scrollSeconds } = await request.json().catch(() => ({}));
  let parsed;
  try { parsed = new URL(url); } catch { return json({ error: 'הלינק לא תקין' }, 400); }
  if (!/^https?:$/.test(parsed.protocol)) return json({ error: 'הלינק צריך להתחיל ב-https://' }, 400);

  const name = nameFromUrl(parsed.href);
  const browser = await launchBrowser();
  try {
    const file = await recordSite(browser, { name, url: parsed.href }, {
      scrollSeconds: Math.min(30, Math.max(5, +scrollSeconds || 12)),
    });
    const blob = await put(`reels/${name}.mp4`, await readFile(file), { access: 'public', contentType: 'video/mp4' });
    return json({ url: blob.url, name });
  } catch (e) {
    return json({ error: 'לא הצלחתי להקליט את האתר', detail: e.message }, 500);
  } finally {
    await browser.close();
  }
}
