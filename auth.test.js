import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuth, mailTransport } from './auth.js';
function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'matzip-auth-'));
  const mail = []; let time = 1700000000000; let code = '123456';
  const options = { directory, now: () => time, generateCode: () => code, sendMail: async (email, code) => { mail.push({ email, code }); }, ...overrides };
  const auth = createAuth(options);
  t.after(() => { auth.close(); rmSync(directory, { recursive: true, force: true }); });
  return { auth, mail, advance: ms => { time += ms; }, code: value => { code = value; } };
}
test('exact corporate domain, normalized email, OTP consumption and logout', async t => {
  const f = fixture(t);
  for (const email of ['person@gmail.com', 'person@ontoinnovation.com.attacker.com', 'person@sub.ontoinnovation.com', 'person@ontoinnovation.com@other.com']) await assert.rejects(f.auth.request(email, 'ip'), { status: 400 });
  await f.auth.request(' Person@ONTOINNOVATION.COM ', 'ip');
  assert.deepEqual(f.mail, [{ email: 'person@ontoinnovation.com', code: '123456' }]);
  assert.throws(() => f.auth.verify('person@ontoinnovation.com', '000000'), { status: 400 });
  const token = f.auth.verify('person@ontoinnovation.com', '123456');
  assert.equal(f.auth.session(token), 'person@ontoinnovation.com');
  assert.equal(f.auth.session('forged'), null);
  assert.throws(() => f.auth.verify('person@ontoinnovation.com', '123456'), { status: 400 });
  f.auth.logout(token); assert.equal(f.auth.session(token), null);
});
test('OTP expires and locks after five failures; resending invalidates previous code', async t => {
  const f = fixture(t); const email = 'person@ontoinnovation.com';
  await f.auth.request(email, 'ip');
  for (let i = 0; i < 5; i++) assert.throws(() => f.auth.verify(email, '000000'), { status: 400 });
  assert.throws(() => f.auth.verify(email, '123456'), { status: 400 });
  f.advance(60000); f.code('654321'); await f.auth.request(email, 'ip');
  assert.throws(() => f.auth.verify(email, '123456'), { status: 400 });
  f.advance(600000); assert.throws(() => f.auth.verify(email, '654321'), { status: 400 });
});
test('sessions expire and request rate limits survive reconnecting to database', async t => {
  const f = fixture(t); const email = 'person@ontoinnovation.com';
  await f.auth.request(email, 'ip');
  await assert.rejects(f.auth.request(email, 'ip'), { status: 429 });
  const token = f.auth.verify(email, '123456'); f.advance(28800000);
  assert.equal(f.auth.session(token), null);
  for (let i=0;i<5;i++) { await f.auth.request(email, 'ip'); f.advance(60000); }
  await assert.rejects(f.auth.request(email, 'ip'), { status: 429 });
});
test('failed or unconfigured delivery cannot create a usable challenge', async t => {
  const f = fixture(t, { sendMail: async () => { throw new Error('provider failure'); } });
  await assert.rejects(f.auth.request('person@ontoinnovation.com', 'ip'), { status: 503 });
  assert.throws(() => f.auth.verify('person@ontoinnovation.com', '123456'), { status: 400 });
  const missing = fixture(t, { sendMail: null });
  await assert.rejects(missing.auth.request('person@ontoinnovation.com', 'ip'), { status: 503 });
  assert.equal(mailTransport({ directory: '/unused', env: { NODE_ENV: 'production', AUTH_DEV_MAIL: '1' } }), null);
});

test('independent app sender sends one OTP only to the requesting corporate recipient', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'matzip-sender-'));
  const deliveries = [];
  const sender = '맛집노트 <login@verified-app.example>';
  const sendMail = mailTransport({ directory, env: { NODE_ENV: 'production', AUTH_MAIL_FROM: sender, RESEND_API_KEY: 'fake-test-key' }, request: async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body); assert.equal(body.from, sender); assert.equal(body.to.length, 1);
    assert.ok(body.to[0].endsWith('@ontoinnovation.com')); assert.ok(body.text.includes(body.to[0]));
    deliveries.push(body); return { ok: true };
  } });
  const auth = createAuth({ directory, sendMail, generateCode: () => '246810' });
  t.after(() => { auth.close(); rmSync(directory, { recursive: true, force: true }); });
  await auth.request('Person@ontoinnovation.com', 'ip');
  assert.deepEqual(deliveries[0].to, ['person@ontoinnovation.com']);
  assert.equal(auth.session(auth.verify('person@ontoinnovation.com', '246810')), 'person@ontoinnovation.com');
  await auth.request('another@ontoinnovation.com', 'ip');
  assert.deepEqual(deliveries[1].to, ['another@ontoinnovation.com']);
  for (const email of ['outsider@example.com', 'a@ontoinnovation.com,b@ontoinnovation.com', 'a@ontoinnovation.com.attacker.com']) await assert.rejects(auth.request(email, 'ip'), { status: 400 });
  assert.equal(deliveries.length, 2);
});
