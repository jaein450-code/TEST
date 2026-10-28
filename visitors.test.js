import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVisitors } from './visitors.js';
test('anonymous ownership survives restart, rejects forged cookies and expires', t => {
  const directory = mkdtempSync(join(tmpdir(), 'matzip-visitors-')); let time = 1000000000000;
  let visitors = createVisitors({ directory, now: () => time });
  t.after(() => { visitors.close(); rmSync(directory, { recursive: true, force: true }); });
  const first = visitors.create(), second = visitors.create();
  assert.notEqual(first.id, second.id); assert.notEqual(first.token, second.token);
  assert.equal(visitors.resolve(first.token), first.id);
  for (const token of [null, 'forged', 'a'.repeat(64)]) assert.equal(visitors.resolve(token), null);
  visitors.close(); visitors = createVisitors({ directory, now: () => time });
  assert.equal(visitors.resolve(first.token), first.id);
  time += 31536000000; assert.equal(visitors.resolve(first.token), null);
});
test('public write burst limits persist and recover after ten minutes', t => {
  const directory = mkdtempSync(join(tmpdir(), 'matzip-limits-')); let time = 1000000000000;
  let visitors = createVisitors({ directory, now: () => time });
  t.after(() => { visitors.close(); rmSync(directory, { recursive: true, force: true }); });
  for (let i = 0; i < 60; i++) assert.equal(visitors.allowWrite('ip'), true);
  visitors.close(); visitors = createVisitors({ directory, now: () => time });
  assert.equal(visitors.allowWrite('ip'), false); assert.equal(visitors.allowWrite('different-ip'), true);
  time += 600000; assert.equal(visitors.allowWrite('ip'), true);
});
