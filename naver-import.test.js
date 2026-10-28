import { test } from 'node:test';
import assert from 'node:assert/strict';
import { point, distanceMeters, prepareImport, resolveOffice } from './naver-import.js';
import { filterRestaurants } from './public/model.js';
const center = { lat: 37.2, lng: 127.1 };
const item = (meters, overrides = {}) => ({ title: '<b>테스트 식당</b>', roadAddress: '경기도 화성시 동탄 테스트로 1', category: '음식점>한식', mapx: '1271000000', mapy: String(Math.round((center.lat + meters / 6371008.8 * 180 / Math.PI) * 1e7)), ...overrides });
test('Naver WGS84 coordinates and actual 5km straight-line boundary are validated', () => {
  assert.deepEqual(point(item(0)), center);
  assert.equal(distanceMeters(center, center), 0);
  assert.throws(() => point({ mapx: '300000', mapy: '500000' }), /Unsupported/);
  assert.throws(() => point({ mapx: '', mapy: '' }));
  const result = prepareImport([item(4999), item(5001, {title:'바깥 식당'}), item(10, {mapx:'missing'}), item(0, {category:'카페,디저트>카페'})], center);
  assert.equal(result.restaurants.length, 1); assert.equal(result.report.outside, 1); assert.equal(result.report.invalid, 2);
  assert.equal(result.restaurants[0].name, '테스트 식당'); assert.equal(result.restaurants[0].price, null); assert.equal(result.restaurants[0].walkMinutes, null);
  for(const price of ['low','mid','high']) assert.equal(filterRestaurants(result.restaurants,{}, {price}).length,0);
  assert.equal(filterRestaurants(result.restaurants,{}, {travel:'walk15'}).length,0);
});
test('repeat Naver results deduplicate and ambiguous office matches never guess coordinates', () => {
  const data=prepareImport([item(10),item(10)],center); assert.equal(data.restaurants.length,1); assert.equal(data.report.duplicate,1);
  const office={...item(0),title:'동탄더퍼스트타워2차',roadAddress:'경기도 화성시 동탄기흥로 614'};
  assert.deepEqual(resolveOffice([office]),center);
  assert.throws(()=>resolveOffice([{...office,roadAddress:'경기도 화성시 동탄기흥로 614-1'}]));
  assert.throws(()=>resolveOffice([office,{...office,mapx:'1272000000'}]));
  assert.throws(()=>resolveOffice([{...office,title:'다른 건물'}]));
});
