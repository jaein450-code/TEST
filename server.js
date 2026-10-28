import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createVisitors } from './visitors.js';
import { createDining } from './dining.js';
export function createApp({ directory, env = process.env } = {}) {
  directory = resolve(directory || env.DATA_DIR || '.local');
  const publicOrigin = env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL;
  const production = env.NODE_ENV === 'production';
  if (production && !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(publicOrigin || '')) throw new Error('Production requires an HTTPS PUBLIC_ORIGIN');
  const visitors = createVisitors({ directory });
  const dining = createDining(directory);
  const cookie = token => `matzip_visitor=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${production ? '; Secure' : ''}`;
  const files = { '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/model.js': ['model.js', 'text/javascript'], '/preview': ['../preview.html', 'text/html'] };
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'");
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/healthz' && ['GET', 'HEAD'].includes(req.method)) {
        const healthy = visitors.isHealthy() && dining.isHealthy();
        json(healthy ? 200 : 503, { status: healthy ? 'ok' : 'unavailable' }); return;
      }
      const token = /(?:^|;\s*)matzip_visitor=([^;]*)/.exec(req.headers.cookie || '')?.[1];
      let visitor = visitors.resolve(token);
      if (req.method === 'GET' && ['/', '/index.html', '/api/dining'].includes(path) && !visitor) {
        const created = visitors.create(); visitor = created.id;
        res.setHeader('Set-Cookie', cookie(created.token));
      }
      if (path.startsWith('/api/')) {
        if (path.startsWith('/api/auth/')) { json(404, { message: '메일 인증과 로그인 기능은 제거되었습니다.' }); return; }
        if (req.method === 'GET' && path === '/api/dining') { json(200, dining.snapshot(visitor)); return; }
        if (req.method !== 'POST') { json(405, { message: '지원하지 않는 요청입니다.' }); return; }
        if (req.headers.origin !== (publicOrigin || `http://${req.headers.host}`) || !req.headers['content-type']?.startsWith('application/json')) { json(403, { message: '허용되지 않은 요청입니다.' }); return; }
        if (!visitor) { json(403, { message: '페이지를 새로고침하고 브라우저 쿠키를 허용해 주세요.' }); return; }
        if (!visitors.allowWrite(req.socket.remoteAddress || 'unknown')) { json(429, { message: '등록 요청이 많습니다. 잠시 후 다시 시도해 주세요.' }); return; }
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4096) { json(413, { message: '요청이 너무 큽니다.' }); return; } }
        let data;
        try { data = JSON.parse(body); } catch { json(400, { message: '요청 형식을 확인해 주세요.' }); return; }
        if (!data || typeof data !== 'object' || Array.isArray(data)) { json(400, { message: '요청 형식을 확인해 주세요.' }); return; }
        if (path === '/api/dining/restaurants') { json(201, dining.addRestaurant(visitor, data)); return; }
        if (path === '/api/dining/reviews') { dining.addReview(visitor, data.restaurantId, data); json(201, { message: '리뷰가 공개되었습니다.' }); return; }
        if (path === '/api/dining/reviews/delete') { dining.deleteReview(visitor, data.id); json(200, { message: '리뷰가 삭제되었습니다.' }); return; }
        json(404, { message: '요청을 찾을 수 없습니다.' }); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      let file = files[path];
      if (path === '/' || path === '/index.html') file = ['index.html', 'text/html'];
      if (!file) { res.writeHead(404); res.end('Not found'); return; }
      let body = await readFile(new URL(`./public/${file[0]}`, import.meta.url));
      if (path === '/preview') {
        const nonce = randomBytes(18).toString('base64');
        res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'`);
        body = Buffer.from(body.toString().replace('<script>', `<script nonce="${nonce}">`));
      }
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) { json(error.status || 500, { message: error.status ? error.message : '서버 오류가 발생했습니다.' }); }
  });
  server.on('close', () => { visitors.close(); dining.close(); }); return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  createApp().listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('맛집노트 listening on port ' + (process.env.PORT || 3000)));
}
