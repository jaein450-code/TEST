import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt, createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const hash = v => createHash('sha256').update(v).digest('hex');
export function createAuth({ directory, sendMail, now = Date.now, generateCode = () => String(randomInt(1000000)).padStart(6, '0') }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(directory, 'auth.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS challenges (email TEXT PRIMARY KEY, digest TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS requests (email TEXT NOT NULL, ip TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS request_time ON requests(created);
    CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, verified INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL);`);
  db.prepare('INSERT OR IGNORE INTO settings VALUES (?, ?)').run('otp-key', randomBytes(32).toString('hex'));
  const key = db.prepare('SELECT value FROM settings WHERE key = ?').get('otp-key').value;
  const digest = (email, code) => createHmac('sha256', key).update(`${email}:${code}`).digest('hex');
  const normalize = v => {
    if (typeof v !== 'string' || v.length > 254) return null;
    const email = v.trim().toLowerCase();
    return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@ontoinnovation\.com$/.test(email) ? email : null;
  };
  const fail = (status, message) => Object.assign(new Error(message), { status });
  return {
    async request(value, ip) {
      const email = normalize(value);
      if (!email) throw fail(400, '@ontoinnovation.com 회사 이메일을 입력해 주세요.');
      const time = now();
      db.prepare('DELETE FROM requests WHERE created < ?').run(time - 3600000);
      db.prepare('DELETE FROM sessions WHERE expires <= ?').run(time);
      db.prepare('DELETE FROM challenges WHERE expires <= ?').run(time);
      const recent = db.prepare('SELECT COUNT(*) AS count, MAX(created) AS latest FROM requests WHERE email = ?').get(email);
      const byIP = db.prepare('SELECT COUNT(*) AS count FROM requests WHERE ip = ?').get(ip);
      if (recent.count >= 5 || byIP.count >= 20 || (recent.latest != null && time - recent.latest < 60000)) throw fail(429, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
      if (!sendMail) throw fail(503, '인증 메일 발송이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.');
      const code = generateCode(); const d = digest(email, code);
      db.prepare('INSERT INTO requests VALUES (?, ?, ?)').run(email, ip, time);
      db.prepare('INSERT OR REPLACE INTO challenges VALUES (?, ?, ?, 0)').run(email, d, time + 600000);
      try { await sendMail(email, code); }
      catch { db.prepare('DELETE FROM challenges WHERE email = ? AND digest = ?').run(email, d); throw fail(503, '인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.'); }
    },
    verify(value, code) {
      const email = normalize(value);
      if (!email || typeof code !== 'string' || !/^\d{6}$/.test(code)) throw fail(400, '회사 이메일과 6자리 인증번호를 확인해 주세요.');
      const row = db.prepare('SELECT * FROM challenges WHERE email = ?').get(email);
      if (!row || row.expires <= now() || row.attempts >= 5) throw fail(400, '인증번호가 만료되었거나 사용할 수 없습니다. 다시 요청해 주세요.');
      db.prepare('UPDATE challenges SET attempts = attempts + 1 WHERE email = ?').run(email);
      if (!timingSafeEqual(Buffer.from(row.digest, 'hex'), Buffer.from(digest(email, code), 'hex'))) throw fail(400, '인증번호가 올바르지 않습니다.');
      db.prepare('DELETE FROM challenges WHERE email = ?').run(email);
      db.prepare('INSERT OR REPLACE INTO users VALUES (?, ?)').run(email, now());
      const token = randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hash(token), email, now() + 28800000);
      return token;
    },
    session(token) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
      return db.prepare('SELECT email FROM sessions WHERE digest = ? AND expires > ?').get(hash(token), now())?.email || null;
    },
    logout(token) { if (typeof token === 'string') db.prepare('DELETE FROM sessions WHERE digest = ?').run(hash(token)); },
    isHealthy() { return db.prepare('SELECT 1 AS ok').get().ok === 1; },
    close() { db.close(); }
  };
}
export function mailTransport({ directory, env }) {
  if (env.NODE_ENV !== 'production' && env.AUTH_DEV_MAIL === '1') {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    return async (email, code) => writeFileSync(join(directory, 'development-mail.json'), JSON.stringify({ email, code, warning: 'Development only. Never serve this file over HTTP.' }), { mode: 0o600 });
  }
  if (!env.RESEND_API_KEY || !env.AUTH_MAIL_FROM) return null;
  return async (email, code) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.AUTH_MAIL_FROM, to: [email], subject: '맛집노트 회사 이메일 인증번호', text: `인증번호: ${code}\n10분 이내에 입력해 주세요.\n본인이 요청하지 않았다면 이 메일을 무시하세요.` })
    });
    if (!response.ok) throw new Error('Mail delivery failed');
  };
}
