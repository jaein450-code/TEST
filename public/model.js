export const COMPANY = '동탄 더퍼스트타워2차';
export const COMPANY_ADDRESS = '경기도 화성시 동탄기흥로 614';
export const AREAS = ['회사 인근', '동탄역', '북광장', '남광장', '센트럴파크', '호수공원', '기타 동탄'];
export const CATEGORIES = ['한식', '양식', '일식', '중식', '카페', '기타'];
export const REVIEW_TAGS = ['빠르게 나와요', '혼밥하기 좋아요', '재방문하고 싶어요'];
// Fictional fixtures for exploring filters. These are not real businesses or measured routes.
export const restaurants = [
  { id: 'dt-demo-1', name: '예시 · 든든한 한식당', area: '회사 인근', category: '한식', dish: '제육볶음 정식', price: 9000, walkMinutes: 5, driveMinutes: null, groupSize: 4, parking: false, reservation: false, icon: '🍚', color: '#ead9c0' },
  { id: 'dt-demo-2', name: '예시 · 골목 파스타', area: '북광장', category: '양식', dish: '토마토 파스타', price: 14000, walkMinutes: 10, driveMinutes: 5, groupSize: 6, parking: true, reservation: true, icon: '🍝', color: '#eed1bc' },
  { id: 'dt-demo-3', name: '예시 · 점심 초밥', area: '남광장', category: '일식', dish: '모둠 초밥', price: 15000, walkMinutes: 15, driveMinutes: 8, groupSize: 4, parking: null, reservation: false, icon: '🍣', color: '#d6dfd3' },
  { id: 'dt-demo-4', name: '예시 · 오후 카페', area: '센트럴파크', category: '카페', dish: '샌드위치 세트', price: 10000, walkMinutes: null, driveMinutes: 10, groupSize: 2, parking: true, reservation: false, icon: '☕', color: '#dcd2c6' },
  { id: 'dt-demo-5', name: '예시 · 동료들 중식당', area: '동탄역', category: '중식', dish: '볶음밥', price: 11000, walkMinutes: null, driveMinutes: 10, groupSize: 16, parking: true, reservation: true, icon: '🍜', color: '#e7c6ab' },
  { id: 'dt-demo-6', name: '예시 · 함께 구이', area: '호수공원', category: '한식', dish: '구이 한 상 (1인)', price: 28000, walkMinutes: null, driveMinutes: 20, groupSize: 24, parking: true, reservation: true, icon: '🥩', color: '#cddbc2' }
].map(r => ({ ...r, demo: true, address: '', description: '화면과 필터를 확인하기 위한 가상 식당입니다. 메뉴·가격·이동 시간·회식 조건 모두 예시이며 실제 방문 정보가 아닙니다.' }));
export function todayInSeoul() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value && value >= '2000-01-01' && value <= todayInSeoul();
}
export function validateReview(r) {
  return typeof r?.name === 'string' && r.name.trim().length > 0 && r.name.length <= 30
    && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5
    && typeof r.text === 'string' && r.text.trim().length >= 5 && r.text.length <= 500
    && isDate(r.visitDate) && ['waitMinutes', 'mealMinutes'].every(k => r[k] === null || (Number.isInteger(r[k]) && r[k] >= 0 && r[k] <= 300))
    && Array.isArray(r.tags) && r.tags.length <= 3 && new Set(r.tags).size === r.tags.length && r.tags.every(t => REVIEW_TAGS.includes(t));
}
export function validateRestaurant(r) {
  const text = (key, min, max) => typeof r?.[key] === 'string' && r[key].trim().length >= min && r[key].length <= max;
  return text('name', 1, 60) && text('dish', 1, 100) && text('address', 5, 160) && text('description', 0, 500)
    && AREAS.includes(r.area) && CATEGORIES.includes(r.category) && Number.isInteger(r.price) && r.price > 0 && r.price <= 1000000
    && ['walkMinutes', 'driveMinutes'].every(k => r[k] === null || (Number.isInteger(r[k]) && r[k] >= 1 && r[k] <= 180))
    && (r.groupSize === null || (Number.isInteger(r.groupSize) && r.groupSize >= 1 && r.groupSize <= 500))
    && ['parking', 'reservation'].every(k => r[k] === null || typeof r[k] === 'boolean');
}
export function score(_restaurant, reviews) {
  return reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : null;
}
export function filterRestaurants(list, reviews, state, favorites = []) {
  const filtered = list.filter(r => {
    const entries = reviews[r.id] || [];
    if (state.demo === 'real' && r.demo) return false;
    if (state.category && state.category !== '전체' && r.category !== state.category) return false;
    if (state.area && state.area !== '전체' && r.area !== state.area) return false;
    if (state.saved && !favorites.includes(r.id)) return false;
    if (state.query && !`${r.name} ${r.area} ${r.dish} ${r.category} ${r.address}`.toLowerCase().includes(state.query.toLowerCase())) return false;
    if (state.price && r.price === null) return false;
    if (state.price === 'low' && r.price > 10000) return false;
    if (state.price === 'mid' && (r.price <= 10000 || r.price > 15000)) return false;
    if (state.price === 'high' && r.price <= 15000) return false;
    if (state.travel?.startsWith('walk') && (r.walkMinutes === null || r.walkMinutes > Number(state.travel.slice(4)))) return false;
    if (state.travel === 'drive10' && (r.driveMinutes === null || r.driveMinutes > 10)) return false;
    if (state.view === 'lunch' && (r.category === '카페' || r.walkMinutes === null || r.walkMinutes > 15)) return false;
    if (state.view === 'recommended' && !entries.some(v => v.tags.includes('재방문하고 싶어요'))) return false;
    if (state.view === 'dinner' && !(r.groupSize >= 6)) return false;
    if (state.people && !(r.groupSize >= Number(state.people))) return false;
    if (state.parking && r.parking !== true) return false;
    if (state.reservation && r.reservation !== true) return false;
    return true;
  });
  return filtered.sort((a, b) => {
    if (state.sort === 'name') return a.name.localeCompare(b.name, 'ko');
    if (state.sort === 'price') return (a.price ?? Infinity) - (b.price ?? Infinity);
    if (state.sort === 'walk') return (a.walkMinutes ?? Infinity) - (b.walkMinutes ?? Infinity);
    if (state.sort === 'rating') return Number(score(b, reviews[b.id] || []) || 0) - Number(score(a, reviews[a.id] || []) || 0);
    const votes = r => (reviews[r.id] || []).filter(v => v.tags.includes('재방문하고 싶어요')).length;
    return Number(a.demo) - Number(b.demo) || votes(b) - votes(a);
  });
}
export function mapLinks(r) {
  const query = r.demo ? `동탄 ${r.area === '회사 인근' ? COMPANY : r.area} 맛집` : `${r.name} ${r.address}`;
  return { naver: 'https://map.naver.com/p/search/' + encodeURIComponent(query), kakao: 'https://map.kakao.com/?q=' + encodeURIComponent(query), company: 'https://map.naver.com/p/search/' + encodeURIComponent(COMPANY + ' ' + COMPANY_ADDRESS) };
}
