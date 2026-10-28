import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './server.js';
async function fixture(t, env = {}) {
  const root = mkdtempSync(join(tmpdir(), 'matzip-public-'));
  const directory = join(root, 'persistent', 'matzip');
  let server, base;
  const start = async () => { server = await createApp({ env: { ...env, DATA_DIR: directory } }); await new Promise(r => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; };
  await start();
  t.after(async () => { if (server.listening) await new Promise(r => server.close(r)); rmSync(root, { recursive: true, force: true }); });
  return {
    directory,
    get: (path, cookie, method = 'GET') => fetch(base + path, { method, headers: cookie ? { Cookie: cookie } : {} }),
    post: (path, data, cookie, origin = env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL || base) => fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data) }),
    restart: async () => { await new Promise(r => server.close(r)); await start(); }
  };
}
test('public homepage and APIs need no login; removed email routes stay unavailable', async t => {
  const f = await fixture(t);
  const home = await f.get('/'); const html = await home.text();
  assert.equal(home.status, 200); assert.match(html, /id="grid"/); assert.ok(!html.includes('id="email-form"'));
  const header = home.headers.get('set-cookie'); assert.match(header, /matzip_visitor=/); assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/);
  for (const path of ['/app.js', '/model.js', '/api/dining']) assert.equal((await f.get(path)).status, 200);
  for (const path of ['/api/auth/request','/api/auth/verify','/api/auth/me','/api/auth/logout']) { assert.equal((await f.get(path)).status, 404); assert.equal((await f.post(path, {})).status, 404); }
  for (const path of ['/.local/visitors.sqlite','/.local/auth.sqlite','/visitors.sqlite','/dining.sqlite','/login.js','/login.html']) assert.equal((await f.get(path)).status, 404);
  assert.equal((await f.get('/healthz', null, 'HEAD')).status, 200);
  assert.deepEqual(await (await f.get('/healthz')).json(), { status: 'ok' });
});
test('public writes still reject cross-site requests, missing or forged ownership cookies', async t => {
  const f = await fixture(t); const home = await f.get('/'); const cookie = home.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.post('/api/dining/restaurants', {})).status, 403);
  assert.equal((await f.post('/api/dining/restaurants', {}, 'matzip_visitor=' + 'a'.repeat(64))).status, 403);
  assert.equal((await f.post('/api/dining/restaurants', {}, cookie, 'https://attacker.example')).status, 403);
  for (let i=0;i<60;i++) assert.equal((await f.post('/api/dining/restaurants', {}, cookie)).status, 400);
  assert.equal((await f.post('/api/dining/restaurants', {}, cookie)).status, 429);
});
test('production uses secure persistent visitor cookie and Render HTTPS origin', async t => {
  await assert.rejects(createApp({ env: { NODE_ENV: 'production' } }), /HTTPS/);
  const f = await fixture(t, { NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://matzip-test.onrender.com' });
  const home = await f.get('/'); const header = home.headers.get('set-cookie'); assert.match(header, /; Secure/);
  assert.ok(existsSync(join(f.directory, 'visitors.sqlite'))); assert.ok(existsSync(join(f.directory, 'dining.sqlite')));
  const cookie = header.split(';')[0]; await f.restart();
  const page = await f.get('/', cookie); assert.equal(page.status, 200); assert.equal(page.headers.get('set-cookie'), null);
  assert.equal((await f.post('/api/dining/restaurants', {}, cookie)).status, 400);
  assert.equal((await f.post('/api/dining/restaurants', {}, cookie, 'https://attacker.example')).status, 403);
});
test('standalone preview has no private records, network fetches or email login requirements', async t => {
  const f = await fixture(t); const preview = await f.get('/preview'); assert.equal(preview.status, 200);
  const text = await preview.text(); assert.match(text, /가상 식당 6곳/);
  const policy = preview.headers.get('content-security-policy'); assert.match(policy, /connect-src 'none'/);
  const nonce = /script-src 'nonce-([^']+)'/.exec(policy)[1]; assert.ok(text.includes(`<script nonce="${nonce}">`));
  assert.equal(/\bfetch\s*\(/.test(text), false); assert.equal(text.includes('/api/auth/'), false);
});
