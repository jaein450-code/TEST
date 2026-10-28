import { createHash } from 'node:crypto';
export const OFFICE_ADDRESS = '경기도 화성시 동탄기흥로 614';
export function point(item) {
  if (!/^\d+$/.test(String(item?.mapx)) || !/^\d+$/.test(String(item?.mapy))) throw new Error('Missing Naver coordinates');
  const p = { lng: Number(item.mapx) / 1e7, lat: Number(item.mapy) / 1e7 };
  if (!(p.lng >= 124 && p.lng <= 132 && p.lat >= 33 && p.lat <= 39)) throw new Error('Unsupported coordinate format; WGS84 × 10^7 required');
  return p;
}
export function distanceMeters(a, b) {
  const rad = n => n * Math.PI / 180;
  const lat = rad(b.lat - a.lat), lng = rad(b.lng - a.lng);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(lng / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function plain(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|apos);/g, (_, key) => ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[key]).trim();
}
export function resolveOffice(items) {
  const candidates = items.filter(i => /더퍼스트타워.*(?:2|Ⅱ|II)/i.test(plain(i.title)) && /동탄기흥로\s*614(?:\s|$)/.test(i.roadAddress || ''));
  const points = new Map(candidates.map(i => { const p = point(i); return [`${p.lat},${p.lng}`, p]; }));
  if (points.size !== 1) throw new Error('회사 건물의 정확한 좌표를 확정하지 못했습니다. 주소와 건물명을 확인해야 합니다.');
  return [...points.values()][0];
}
export function prepareImport(items, center, fetchedAt = new Date().toISOString()) {
  if (!Number.isFinite(center?.lat) || !Number.isFinite(center?.lng)) throw new Error('Invalid company coordinates');
  const records = new Map(); const report = { received: items.length, outside: 0, invalid: 0, duplicate: 0 };
  for (const item of items) {
    try {
      const category = plain(item.category), name = plain(item.title), address = plain(item.roadAddress || item.address);
      if (!name || !address || !/음식점|한식|중식|일식|양식|분식|패스트푸드|치킨|피자|뷔페/.test(category) || /카페|커피|디저트/.test(category)) { report.invalid++; continue; }
      const location = point(item), distance = distanceMeters(center, location);
      if (distance > 5000) { report.outside++; continue; }
      const key = `${name.replace(/\s/g, '').toLowerCase()}|${address.replace(/\s/g, '')}`;
      const id = 'naver-' + createHash('sha256').update(key).digest('hex').slice(0, 24);
      if (records.has(id)) { report.duplicate++; continue; }
      const cuisine = ['한식','중식','일식','양식'].find(c => category.includes(c)) || '기타';
      records.set(id, { id, name, address, category: cuisine, area: '기타 동탄', dish: '메뉴 확인 필요', price: null, walkMinutes: null, driveMinutes: null, groupSize: null, parking: null, reservation: null, description: '네이버 지역 검색에서 가져온 매장입니다. 메뉴·가격·영업 상태와 이동 시간은 방문 전 확인해 주세요.', demo: false, source: 'naver', sourceCategory: category, fetchedAt, location, distanceMeters: Math.round(distance), officeAddress: OFFICE_ADDRESS, officeLocation: center, icon: '🍽️', color: '#dde4ce' });
    } catch { report.invalid++; }
  }
  return { restaurants: [...records.values()], report: { ...report, accepted: records.size }, center, officeAddress: OFFICE_ADDRESS, fetchedAt };
}
