import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReview, validateRestaurant, score, restaurants, filterRestaurants, todayInSeoul, mapLinks } from './public/model.js';
const review = { name: '방문자', rating: 5, text: '점심으로 먹기 좋았어요', visitDate: todayInSeoul(), waitMinutes: 0, mealMinutes: 25, tags: ['재방문하고 싶어요'] };
test('reviews require a real past visit date, valid durations and known tags', () => {
  assert.equal(validateReview(review), true);
  for (const patch of [{ name: ' ' }, { rating: 0 }, { rating: 6 }, { rating: 2.5 }, { text: '짧음' }, { text: '가'.repeat(501) }, { visitDate: '2099-01-01' }, { visitDate: '2025-02-30' }, { visitDate: null }, { mealMinutes: -1 }, { waitMinutes: 1.5 }, { tags: ['가짜 태그'] }, { tags: ['재방문하고 싶어요', '재방문하고 싶어요'] }]) assert.equal(validateReview({ ...review, ...patch }), false, JSON.stringify(patch));
});
test('scores never substitute fictional ratings for unreviewed places', () => {
  assert.equal(score(restaurants[0], []), null);
  assert.equal(score(restaurants[0], [{ rating: 3 }, { rating: 4 }]), '3.5');
});
test('lunch, recommendations, dinner, price boundaries and unknown travel filters', () => {
  const list = [...restaurants, { ...restaurants[0], id: 'real', demo: false, price: 15001, walkMinutes: null }];
  assert.equal(filterRestaurants(list, {}, { view: 'lunch' }).length, 3);
  assert.equal(filterRestaurants(list, {}, { view: 'recommended' }).length, 0);
  assert.equal(filterRestaurants(list, { 'dt-demo-1': [review] }, { view: 'recommended' }).length, 1);
  assert.equal(filterRestaurants(list, {}, { view: 'dinner', people: '10', parking: true, reservation: true }).length, 2);
  assert.equal(filterRestaurants(list, {}, { travel: 'walk5' }).length, 1);
  assert.equal(filterRestaurants(list, {}, { travel: 'walk10' }).length, 2);
  assert.equal(filterRestaurants(list, {}, { travel: 'walk15' }).length, 3);
  assert.equal(filterRestaurants(list, {}, { travel: 'drive10' }).length, 4);
  assert.equal(filterRestaurants(list, {}, { price: 'low' }).length, 2);
  assert.equal(filterRestaurants(list, {}, { price: 'mid' }).length, 3);
  assert.equal(filterRestaurants(list, {}, { price: 'high' }).length, 2);
  assert.equal(filterRestaurants(list, {}, { demo: 'real' }).length, 1);
  assert.equal(filterRestaurants(list, {}, { area: '북광장', query: '파스타' }).length, 1);
  assert.equal(filterRestaurants(list, {}, { saved: true }, ['dt-demo-6'])[0].id, 'dt-demo-6');
});
test('restaurant registration requires trustworthy field types and does not invent unknown information', () => {
  const r = { ...restaurants[0], address: '경기도 화성시 동탄 테스트 주소', description: '', walkMinutes: null, driveMinutes: null, groupSize: null, parking: null, reservation: null };
  assert.equal(validateRestaurant(r), true);
  for (const patch of [{ price: -1 }, { price: 1.1 }, { name: ' ' }, { address: '' }, { category: '분류 오류' }, { area: '서울' }, { parking: 'true' }, { walkMinutes: 0 }, { groupSize: -1 }]) assert.equal(validateRestaurant({ ...r, ...patch }), false);
  const links = mapLinks({ ...r, demo: false, name: '가게 & 이름' });
  assert.equal(new URL(links.kakao).searchParams.get('q'), '가게 & 이름 경기도 화성시 동탄 테스트 주소');
  assert.ok(!decodeURIComponent(mapLinks(restaurants[0]).naver).includes(restaurants[0].name));
});
