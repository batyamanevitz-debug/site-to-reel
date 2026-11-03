// הכלי בדפדפן: שרת קטן שמגיש את הדף ומריץ הקלטות בתור, אחת אחרי השנייה.
// הפעלה: node server.mjs  →  http://localhost:4321
import http from 'node:http';
import { readFileSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launchBrowser, recordSite, nameFromUrl } from './site-to-reel.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4321;
const jobs = new Map();   // id → { url, status, file, error, name }
const queue = [];
let busy = false;

async function work() {
  if (busy || !queue.length) return;
  busy = true;
  const job = queue.shift();
  job.status = 'recording';
  const browser = await launchBrowser();
  try {
    job.file = await recordSite(browser, { name: job.name, url: job.url }, { scrollSeconds: job.scrollSeconds });
    job.status = 'done';
  } catch (e) {
    job.status = 'error';
    job.error = e.message;
  } finally {
    await browser.close();
    job.resolve?.();
    busy = false;
    work();
  }
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

// הגשת וידאו עם תמיכה ב-Range, כדי שאפשר יהיה לדלג בנגן
function sendVideo(req, res, file, download) {
  const size = statSync(file).size;
  const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' };
  if (download) headers['Content-Disposition'] = `attachment; filename="${path.basename(file)}"`;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const start = m[1] ? +m[1] : 0;
    const end = m[2] ? +m[2] : size - 1;
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': size });
    createReadStream(file).pipe(res);
  }
}

http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(readFileSync(path.join(HERE, 'public/index.html')));
  }

  if (req.method === 'POST' && pathname === '/api/jobs') {
    const { url, scrollSeconds } = await readBody(req);
    let parsed;
    try { parsed = new URL(url); } catch { return json(res, 400, { error: 'הלינק לא תקין' }); }
    if (!/^https?:$/.test(parsed.protocol)) return json(res, 400, { error: 'הלינק צריך להתחיל ב-https://' });
    const id = randomUUID();
    const job = { url: parsed.href, name: nameFromUrl(parsed.href), status: 'queued', scrollSeconds: Math.min(30, Math.max(5, +scrollSeconds || 12)) };
    jobs.set(id, job);
    queue.push(job);
    work();
    return json(res, 200, { id });
  }

  // אותו ממשק כמו בענן (api/record.mjs): מחכים לסיום ומחזירים קישור לסרטון
  if (req.method === 'POST' && pathname === '/api/record') {
    const { url, scrollSeconds } = await readBody(req);
    let parsed;
    try { parsed = new URL(url); } catch { return json(res, 400, { error: 'הלינק לא תקין' }); }
    if (!/^https?:$/.test(parsed.protocol)) return json(res, 400, { error: 'הלינק צריך להתחיל ב-https://' });
    const id = randomUUID();
    const job = { url: parsed.href, name: nameFromUrl(parsed.href), status: 'queued', scrollSeconds: Math.min(30, Math.max(5, +scrollSeconds || 12)) };
    const finished = new Promise(r => (job.resolve = r));
    jobs.set(id, job);
    queue.push(job);
    work();
    await finished;
    if (job.status !== 'done') return json(res, 500, { error: 'לא הצלחתי להקליט את האתר', detail: job.error });
    return json(res, 200, { url: `/api/jobs/${id}/video`, name: job.name });
  }

  const m = /^\/api\/jobs\/([\w-]+)(\/video)?$/.exec(pathname);
  if (req.method === 'GET' && m) {
    const job = jobs.get(m[1]);
    if (!job) return json(res, 404, { error: 'לא נמצא' });
    if (m[2]) {
      if (job.status !== 'done') return json(res, 409, { error: 'הסרטון עוד לא מוכן' });
      return sendVideo(req, res, job.file, searchParams.has('download'));
    }
    return json(res, 200, { status: job.status, error: job.error, name: job.name, position: queue.indexOf(job) + 1 });
  }

  json(res, 404, { error: 'לא נמצא' });
}).listen(PORT, '127.0.0.1', () => console.log(`Site → Reel פועל: http://localhost:${PORT}`));
