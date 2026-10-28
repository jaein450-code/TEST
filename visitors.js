import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const hash = token => createHash('sha256').update(token).digest('hex');
export function createVisitors({ directory, now = Date.now }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(directory, 'visitors.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS visitors (digest TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS writes (ip TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS writes_time ON writes(created);`);
  return {
    resolve(token) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
      return db.prepare('SELECT id FROM visitors WHERE digest = ? AND expires > ?').get(hash(token), now())?.id || null;
    },
    create() {
      db.prepare('DELETE FROM visitors WHERE expires <= ?').run(now());
      const token = randomBytes(32).toString('hex'), id = randomUUID();
      db.prepare('INSERT INTO visitors VALUES (?, ?, ?)').run(hash(token), id, now() + 31536000000);
      return { token, id };
    },
    allowWrite(ip) {
      db.prepare('DELETE FROM writes WHERE created <= ?').run(now() - 600000);
      if (db.prepare('SELECT COUNT(*) AS n FROM writes WHERE ip = ?').get(ip).n >= 60) return false;
      db.prepare('INSERT INTO writes VALUES (?, ?)').run(ip, now()); return true;
    },
    isHealthy() { return db.prepare('SELECT 1 AS ok').get().ok === 1; },
    close() { db.close(); }
  };
}
