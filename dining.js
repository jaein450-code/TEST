import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { restaurants, validateRestaurant, validateReview } from './public/model.js';
export function createDining(directory) {
  const db = new DatabaseSync(join(directory, 'dining.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS restaurants (id TEXT PRIMARY KEY, data TEXT NOT NULL, author TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL, author TEXT NOT NULL, visit_date TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL, UNIQUE(restaurant_id, author, visit_date));
    CREATE INDEX IF NOT EXISTS reviews_restaurant ON reviews(restaurant_id);`);
  const fail = (status, message) => Object.assign(new Error(message), { status });
  const all = () => [...restaurants, ...db.prepare('SELECT data FROM restaurants ORDER BY created DESC').all().map(row => JSON.parse(row.data))];
  return {
    snapshot(visitor) {
      const reviews = {};
      for (const row of db.prepare('SELECT * FROM reviews ORDER BY visit_date DESC, created DESC, id DESC').all()) {
        (reviews[row.restaurant_id] ||= []).push({ ...JSON.parse(row.data), id: row.id, created: row.created, mine: row.author === visitor });
      }
      return { restaurants: all(), reviews };
    },
    addRestaurant(visitor, input) {
      if (!validateRestaurant(input)) throw fail(400, '매장 이름·주소·메뉴·가격과 입력값을 확인해 주세요.');
      if (db.prepare('SELECT COUNT(*) AS n FROM restaurants WHERE author = ? AND created >= ?').get(visitor, new Date(Date.now() - 86400000).toISOString()).n >= 20) throw fail(429, '하루 등록 가능 횟수를 초과했습니다.');
      const r = Object.fromEntries(['name', 'area', 'category', 'dish', 'price', 'walkMinutes', 'driveMinutes', 'groupSize', 'parking', 'reservation', 'address', 'description'].map(k => [k, typeof input[k] === 'string' ? input[k].trim() : input[k]]));
      r.id = randomUUID(); r.demo = false; r.icon = { 한식: '🍚', 양식: '🍝', 일식: '🍣', 중식: '🍜', 카페: '☕', 기타: '🍽️' }[r.category]; r.color = '#dde4ce';
      db.prepare('INSERT INTO restaurants VALUES (?, ?, ?, ?)').run(r.id, JSON.stringify(r), visitor, new Date().toISOString());
      return r;
    },
    addReview(visitor, restaurantId, input) {
      if (!all().some(r => r.id === restaurantId)) throw fail(404, '맛집을 찾을 수 없습니다.');
      if (!validateReview(input)) throw fail(400, '닉네임, 별점, 방문 날짜, 5자 이상의 리뷰와 소요 시간을 확인해 주세요.');
      if (db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE author = ? AND created >= ?').get(visitor, new Date(Date.now() - 86400000).toISOString()).n >= 100) throw fail(429, '하루 리뷰 등록 횟수를 초과했습니다.');
      const review = { name: input.name.trim(), rating: input.rating, text: input.text.trim(), visitDate: input.visitDate, waitMinutes: input.waitMinutes, mealMinutes: input.mealMinutes, tags: input.tags };
      try { db.prepare('INSERT INTO reviews VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), restaurantId, visitor, review.visitDate, JSON.stringify(review), new Date().toISOString()); }
      catch (error) { if (String(error.message).includes('UNIQUE constraint')) throw fail(409, '같은 식당의 같은 방문 날짜에는 리뷰를 한 번만 작성할 수 있습니다.'); throw error; }
    },
    deleteReview(visitor, id) {
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw fail(400, '리뷰 번호를 확인해 주세요.');
      if (!db.prepare('DELETE FROM reviews WHERE id = ? AND author = ?').run(id, visitor).changes) throw fail(404, '삭제할 본인 리뷰를 찾을 수 없습니다.');
    },
    isHealthy() { return db.prepare('SELECT 1 AS ok').get().ok === 1; },
    close() { db.close(); }
  };
}
