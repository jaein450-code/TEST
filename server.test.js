import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './server.js';

test('HTTP signup, protected content, CSRF, logout and restart persistence', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'matzip-http-')); const mail = [];
  let server;
  t.after(async () => { if (server?.listening) await new Promise(r => server.close(r)); rmSync(directory, { recursive: true, force: true }); });
  async function start() {
    server = createApp({ directory, env: {}, sendMail: async (email, code) => { mail.push({ email, code }); } });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${server.address().port}`;
  }
  let base = await start();
  const post = (path, data, cookie, origin = base) => fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data) });
  let response = await fetch(base + '/'); assert.match(await response.text(), /id="code-form"/);
  const preview = await fetch(base + '/preview');
  assert.equal(preview.status, 200);
  const previewBody = await preview.text();
  assert.match(previewBody, /가상 식당 6곳/);
  assert.match(previewBody, /ONTO INNOVATION/);
  assert.match(preview.headers.get('content-security-policy'), /connect-src 'none'/);
  const nonce = /script-src 'nonce-([^']+)'/.exec(preview.headers.get('content-security-policy'))[1];
  assert.ok(previewBody.includes(`<script nonce="${nonce}">`));
  assert.equal(/\bfetch\s*\(/.test(previewBody), false);
  assert.equal(previewBody.includes('@ontoinnovation.com"'), false);

  for (const path of ['/app.js', '/model.js', '/api/auth/me']) assert.equal((await fetch(base + path)).status, 401);
  for (const path of ['/.local/auth.sqlite', '/public/index.html']) assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await post('/api/auth/request', { email: 'person@ontoinnovation.com' }, null, 'https://attacker.example')).status, 403);
  assert.equal((await post('/api/auth/request', { email: 'person@gmail.com' })).status, 400);
  response = await post('/api/auth/request', { email: 'person@ontoinnovation.com' }); assert.equal(response.status, 200);
  assert.equal((await response.text()).includes(mail[0].code), false);
  response = await post('/api/auth/verify', { email: 'person@ontoinnovation.com', code: mail[0].code });
  assert.equal(response.status, 200); const header = response.headers.get('set-cookie'); assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/);
  const cookie = header.split(';')[0];
  response = await fetch(base + '/', { headers: { Cookie: cookie } }); assert.match(await response.text(), /id="grid"/);
  assert.equal((await fetch(base + '/model.js', { headers: { Cookie: cookie } })).status, 200);
  await new Promise(r => server.close(r)); base = await start();
  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await post('/api/auth/request', { email: 'person@ontoinnovation.com' })).status, 429);
  assert.equal((await post('/api/auth/logout', {}, cookie)).status, 200);
  assert.equal((await fetch(base + '/model.js', { headers: { Cookie: cookie } })).status, 401);
});
test('production requires HTTPS origin and sets Secure session cookie', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'matzip-prod-')); let code;
  assert.throws(() => createApp({ directory, env: { NODE_ENV: 'production' } }), /HTTPS/);
  const server = createApp({ directory, env: { NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://company.example' }, sendMail: async (_, value) => { code = value; } });
  t.after(async () => { await new Promise(r => server.close(r)); rmSync(directory, { recursive: true, force: true }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { Origin: 'https://company.example', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  await post('/api/auth/request', { email: 'person@ontoinnovation.com' });
  const result = await post('/api/auth/verify', { email: 'person@ontoinnovation.com', code }); assert.equal(result.status, 200); assert.match(result.headers.get('set-cookie'), /; Secure/);
});

test('Render HTTPS origin and DATA_DIR persist sessions across server restarts', async t => {
  const root = mkdtempSync(join(tmpdir(), 'matzip-render-'));
  const directory = join(root, 'persistent-volume', 'matzip');
  const env = { NODE_ENV: 'production', DATA_DIR: directory, RENDER_EXTERNAL_URL: 'https://matzip-test.onrender.com' };
  let server, code, base;
  const start = async () => {
    server = createApp({ env, sendMail: async (_, value) => { code = value; } });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  };
  t.after(async () => { if (server?.listening) await new Promise(r => server.close(r)); rmSync(root, { recursive: true, force: true }); });
  await start();
  const post = (path, data, origin = env.RENDER_EXTERNAL_URL) => fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const health = await fetch(base + '/healthz'); assert.equal(health.status, 200); assert.deepEqual(await health.json(), { status: 'ok' });
  assert.equal((await fetch(base + '/healthz', { method: 'HEAD' })).status, 200);
  assert.equal((await post('/api/auth/request', { email: 'person@ontoinnovation.com' }, 'https://attacker.example')).status, 403);
  assert.equal((await post('/api/auth/request', { email: 'person@ontoinnovation.com' })).status, 200);
  const verified = await post('/api/auth/verify', { email: 'person@ontoinnovation.com', code }); assert.equal(verified.status, 200);
  const header = verified.headers.get('set-cookie'); assert.match(header, /; Secure/); const cookie = header.split(';')[0];
  const { existsSync } = await import('node:fs');
  assert.ok(existsSync(join(directory, 'auth.sqlite'))); assert.ok(existsSync(join(directory, 'dining.sqlite')));
  await new Promise(r => server.close(r)); await start();
  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } })).status, 200);
  for (const path of ['/var/data/matzip/auth.sqlite', '/auth.sqlite', '/dining.sqlite', '/.local/auth.sqlite']) assert.equal((await fetch(base + path)).status, 404);
  assert.throws(() => createApp({ env: { ...env, PUBLIC_ORIGIN: 'http://insecure.example' } }), /HTTPS/);
});
