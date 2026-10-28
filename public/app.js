import { COMPANY, AREAS, CATEGORIES, REVIEW_TAGS, validateReview, score, filterRestaurants, mapLinks, todayInSeoul } from './model.js';
const $ = s => document.querySelector(s);
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const defaults = { category: '전체', query: '', saved: false, sort: 'recommended', view: 'all', area: '전체', price: '', travel: '', people: '', parking: false, reservation: false, demo: 'all' };
const state = { ...defaults };
let restaurants = [], reviews = {}, favorites = [], memberEmail, activeId;
const won = n => n === null ? '가격 확인 필요' : n.toLocaleString('ko-KR') + '원';
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('visible'), 3500); }
async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (response.status === 401) { location.replace('/'); throw new Error('다시 로그인해 주세요.'); }
  const result = await response.json(); if (!response.ok) throw new Error(result.message || '요청에 실패했습니다.'); return result;
}
async function load() { const snapshot = await api('/api/dining'); restaurants = snapshot.restaurants; reviews = snapshot.reviews; $('#load-message').textContent = ''; render(); }
function saveFavorites() { try { localStorage.setItem(`matzip:${memberEmail}:favorites`, JSON.stringify(favorites)); } catch { toast('저장 공간을 사용할 수 없어 즐겨찾기는 현재 화면에서만 유지됩니다.'); } }
const entries = r => reviews[r.id] || [];
const votes = r => entries(r).filter(v => v.tags.includes('재방문하고 싶어요')).length;
function travelLabel(r) { return r.walkMinutes !== null ? `도보 ${r.walkMinutes}분` : r.driveMinutes !== null ? `차량 ${r.driveMinutes}분` : (Number.isFinite(r.distanceMeters) ? `직선 ${(r.distanceMeters / 1000).toFixed(2)}km` : '이동 시간 확인 필요'); }
function card(r) {
  const rating = score(r, entries(r));
  return `<article class="card"><div class="food-art" style="--food-color:${r.color}"><button class="open-art" data-open="${r.id}" aria-label="${escape(r.name)} 상세 보기"><span>${r.icon}</span></button><span class="location">⌖ ${escape(r.area)} · ${travelLabel(r)}${r.demo ? ' (예시)' : ''}</span><button class="favorite ${favorites.includes(r.id) ? 'selected' : ''}" data-favorite="${r.id}" aria-label="${escape(r.name)} 저장" aria-pressed="${favorites.includes(r.id)}">${favorites.includes(r.id) ? '♥' : '♡'}</button></div><div class="card-content"><div class="data-badge ${r.demo ? 'demo' : ''}">${r.demo ? '가상 식당 · 모든 정보 예시' : r.source === 'naver' ? '네이버 지역 검색 · 방문 전 확인' : '직원 등록 · 방문 전 확인'}</div><div class="card-title"><button data-open="${r.id}">${escape(r.name)}</button><span>${rating ? `★ ${rating}` : '리뷰 대기'}</span></div><p>${escape(r.dish)}</p><div class="meta">${r.category} <span>·</span> ${won(r.price)} / 1인</div><div class="tags"><span>리뷰 ${entries(r).length}</span><span>재방문 추천 ${votes(r)}</span>${r.groupSize >= 6 ? `<span>단체 ${r.groupSize}명</span>` : ''}</div></div></article>`;
}
function render() {
  $('#categories').innerHTML = ['전체', ...CATEGORIES].map((c, i) => `<button data-category="${c}" aria-pressed="${state.category === c}" class="${state.category === c ? 'active' : ''}">${['✦', '🍚', '🍝', '🍣', '🥟', '☕', '🍽️'][i]} ${c}</button>`).join('');
  for (const view of ['lunch', 'recommended', 'dinner']) {
    $(`#${view}-count`).textContent = `${filterRestaurants(restaurants, reviews, { ...defaults, view, demo: state.demo }).length}곳`;
    $(`[data-view="${view}"]`).setAttribute('aria-pressed', state.view === view);
  }
  $('[data-view="all"]').setAttribute('aria-pressed', state.view === 'all');
  $('#list-title').textContent = state.saved ? '내가 저장한 맛집' : ({ lunch: '회사 근처 점심', recommended: '동료들이 추천한 곳', dinner: '회식하기 좋은 곳', all: '동탄 전체 맛집' })[state.view];
  const list = filterRestaurants(restaurants, reviews, state, favorites);
  $('#result-count').textContent = `총 ${list.length}곳 · 실제 등록 ${list.filter(r => !r.demo).length}곳${list.some(r => r.demo) ? ' · 예시 포함' : ''}`;
  $('#saved-count').textContent = favorites.length; $('#saved').setAttribute('aria-pressed', state.saved);
  $('#grid').innerHTML = list.length ? list.map(card).join('') : `<div class="empty"><span>⌕</span><h3>${state.view === 'recommended' ? '아직 동료들의 재방문 추천이 없어요' : '조건에 맞는 맛집이 없어요'}</h3><p>조건을 바꾸거나, 알고 있는 동탄 맛집을 등록해 보세요.</p><button id="empty-reset">전체 맛집 보기</button></div>`;
}
function average(rows, key) { const values = rows.map(r => r[key]).filter(v => v !== null); return values.length ? `${Math.round(values.reduce((a, b) => a + b, 0) / values.length)}분 (${values.length}건)` : '기록 없음'; }
const availability = value => value === null ? '확인 필요' : value ? '가능' : '불가';
function detail(id) {
  const r = restaurants.find(r => r.id === id); if (!r) return; activeId = id;
  const rows = entries(r), links = mapLinks(r), rating = score(r, rows);
  $('#detail-content').innerHTML = `<div class="detail-art" style="background:${r.color}">${r.icon}</div><div class="detail-body"><p class="eyebrow">동탄 · ${r.category} · ${escape(r.area)}</p><h2>${escape(r.name)} <span class="rating">${rating ? '★ ' + rating : '리뷰 대기'}</span></h2><p class="data-badge ${r.demo ? 'demo' : ''}">${r.demo ? '가상 식당입니다. 가격·이동 시간·회식 조건 모두 예시입니다.' : (r.source === 'naver' ? `네이버 지역 검색 · 회사에서 직선 ${(r.distanceMeters / 1000).toFixed(2)}km · 수집일 ${r.fetchedAt.slice(0, 10)}` : '직원이 직접 등록한 정보입니다. 방문 전 최신 정보를 확인하세요.')}</p><p>${escape(r.description || '동료가 발견한 동탄 맛집입니다.')}</p><p class="meta">${r.demo ? '실제 매장 주소 없음' : escape(r.address)}<br>${escape(r.dish)} · ${won(r.price)} / 1인<br>${COMPANY} 기준: 도보 ${r.walkMinutes ?? '미확인'}${r.walkMinutes === null ? '' : '분'} · 차량 ${r.driveMinutes ?? '미확인'}${r.driveMinutes === null ? '' : '분'}<br>단체석 ${r.groupSize === null ? '확인 필요' : r.groupSize + '명'} · 주차 ${availability(r.parking)} · 예약 ${availability(r.reservation)}</p><div class="map-links"><a target="_blank" rel="noopener noreferrer" href="${links.naver}">네이버지도 ${r.demo ? '주변 맛집 검색' : '매장 검색'} ↗</a><a target="_blank" rel="noopener noreferrer" href="${links.kakao}">카카오맵 검색 ↗</a><a target="_blank" rel="noopener noreferrer" href="${links.company}">회사 위치 확인 ↗</a></div><p class="muted">지도에서 출발지를 ‘${COMPANY}’로 설정해 경로를 확인하세요. 표시된 이동 시간은 지도 계산값이 아닙니다.</p><h3>동료들의 방문 기록</h3><div class="review-summary"><span>평균 대기 <b>${average(rows, 'waitMinutes')}</b></span><span>평균 식사 <b>${average(rows, 'mealMinutes')}</b></span><span>재방문 추천 <b>${votes(r)}건</b></span></div><div class="review-list">${rows.map(v => `<article><div class="review-heading"><strong>${escape(v.name)}${v.mine ? ' · 나' : ''}</strong><span class="rating">${'★'.repeat(v.rating)}</span>${v.mine ? `<button class="delete-review" data-delete-review="${v.id}">내 리뷰 삭제</button>` : ''}</div><small>방문 ${v.visitDate} · 대기 ${v.waitMinutes === null ? '미기록' : v.waitMinutes + '분'} · 식사 ${v.mealMinutes === null ? '미기록' : v.mealMinutes + '분'}</small><p>${escape(v.text)}</p><div class="tags">${v.tags.map(tag => `<span>${tag}</span>`).join('')}</div></article>`).join('') || '<p class="muted">아직 방문 기록이 없어요. 첫 번째 기억을 남겨 주세요.</p>'}</div><form id="review-form"><h3>직원들과 리뷰 나누기</h3><p class="muted">${r.demo ? '가상 식당에 대한 연습용 리뷰입니다. 실제 방문 평가가 아닙니다.' : '동료들이 점심과 회식을 고르는 데 도움이 되는 방문 기록을 남겨 주세요.'}</p><div class="review-fields"><label>닉네임 *<input name="name" required maxlength="30" placeholder="동료에게 보일 이름"></label><label>별점 *<select name="rating" required><option value="5">★★★★★ 5점</option><option value="4">★★★★ 4점</option><option value="3">★★★ 3점</option><option value="2">★★ 2점</option><option value="1">★ 1점</option></select></label><label>방문 날짜 *<input name="visitDate" type="date" required min="2000-01-01" max="${todayInSeoul()}" value="${todayInSeoul()}"></label><label>대기 시간 (분)<input name="waitMinutes" type="number" min="0" max="300" step="1" placeholder="모르면 비워 두세요"></label><label>식사 소요 시간 (분)<input name="mealMinutes" type="number" min="0" max="300" step="1" placeholder="모르면 비워 두세요"></label></div><fieldset class="review-tag-options"><legend>이런 점이 좋았어요</legend>${REVIEW_TAGS.map(tag => `<label><input type="checkbox" name="tags" value="${tag}"> ${tag}</label>`).join('')}</fieldset><label>리뷰 *<textarea name="text" required minlength="5" maxlength="500" placeholder="메뉴, 대기 시간, 재방문하고 싶은 이유를 남겨 주세요."></textarea></label><p id="review-message" role="status"></p><button class="primary">직원들에게 리뷰 공유하기</button><p class="muted">회사 이메일은 공개되지 않습니다. 닉네임과 리뷰는 인증된 직원들에게 공유됩니다. 같은 식당·방문 날짜당 리뷰 1개를 남길 수 있습니다.</p></form></div>`;
  $('#review-form').onsubmit = async e => {
    e.preventDefault(); const form = e.target, data = new FormData(form), button = form.querySelector('button.primary');
    const review = { name: data.get('name').trim(), rating: Number(data.get('rating')), text: data.get('text').trim(), visitDate: data.get('visitDate'), waitMinutes: optionalNumber(data.get('waitMinutes')), mealMinutes: optionalNumber(data.get('mealMinutes')), tags: data.getAll('tags') };
    if (!validateReview(review)) { $('#review-message').textContent = '입력값과 방문 날짜를 확인해 주세요.'; return; }
    button.disabled = true;
    try { await api('/api/dining/reviews', { ...review, restaurantId: id }); await load(); detail(id); toast('동료들에게 방문 기록이 공유됐어요.'); }
    catch (error) { $('#review-message').textContent = error.message; }
    finally { button.disabled = false; }
  };
  if (!$('#detail').open) $('#detail').showModal();
}
function optionalNumber(value) { return value === '' ? null : Number(value); }
function reset() { Object.assign(state, { ...defaults, view: 'all' }); $('#filters').reset(); $('#search').value = ''; $('#sort').value = 'recommended'; render(); }
document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.category) { state.category = b.dataset.category; render(); }
  if (b.dataset.view) { state.view = b.dataset.view; render(); }
  if (b.dataset.open) detail(b.dataset.open);
  if (b.dataset.favorite) { const id = b.dataset.favorite; favorites = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id]; saveFavorites(); render(); }
  if (b.dataset.search) { $('#search').value = b.dataset.search; state.query = b.dataset.search; render(); }
  if (b.id === 'reset' || b.id === 'empty-reset') reset();
  if (b.dataset.deleteReview) {
    b.disabled = true;
    try { await api('/api/dining/reviews/delete', { id: b.dataset.deleteReview }); await load(); detail(activeId); toast('내 리뷰를 삭제했어요.'); }
    catch (error) { toast(error.message); b.disabled = false; }
  }
  if (b.id === 'retry-load') { try { await load(); } catch { showLoadError(); } }
});
$('#search-form').onsubmit = e => { e.preventDefault(); state.query = $('#search').value.trim(); render(); };
$('#search').oninput = () => { state.query = $('#search').value.trim(); render(); };
$('#sort').onchange = e => { state.sort = e.target.value; render(); };
$('#filters').onsubmit = e => e.preventDefault();
$('#filters').onchange = () => { const data = new FormData($('#filters')); for (const k of ['area', 'price', 'travel', 'people', 'demo']) state[k] = data.get(k); state.parking = data.has('parking'); state.reservation = data.has('reservation'); render(); };
$('#saved').onclick = () => { state.saved = !state.saved; render(); };
$('.close').onclick = () => $('#detail').close(); $('.close-register').onclick = () => $('#registration').close();
for (const selector of ['#detail', '#registration']) $(selector).addEventListener('click', e => { if (e.target === $(selector)) { const rect = e.target.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) e.target.close(); } });
$('#company-map').href = mapLinks({ demo: true, area: '회사 인근' }).company;
const restaurantForm = $('#restaurant-form');
restaurantForm.elements.area.innerHTML = AREAS.map(area => `<option>${area}</option>`).join('');
restaurantForm.elements.category.innerHTML = CATEGORIES.map(c => `<option>${c}</option>`).join('');
$('#register').onclick = () => { $('#restaurant-message').textContent = ''; $('#registration').showModal(); };
restaurantForm.onsubmit = async e => {
  e.preventDefault(); const data = new FormData(restaurantForm), button = restaurantForm.querySelector('button.primary');
  const input = Object.fromEntries(data);
  for (const key of ['price', 'walkMinutes', 'driveMinutes', 'groupSize']) input[key] = optionalNumber(input[key]);
  for (const key of ['parking', 'reservation']) input[key] = input[key] === '' ? null : input[key] === 'true';
  button.disabled = true;
  try { const restaurant = await api('/api/dining/restaurants', input); await load(); reset(); $('#registration').close(); restaurantForm.reset(); detail(restaurant.id); toast('동탄 맛집이 동료들에게 공유됐어요.'); }
  catch (error) { $('#restaurant-message').textContent = error.message; }
  finally { button.disabled = false; }
};
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
function showLoadError() { $('#result-count').textContent = '맛집을 불러오지 못했습니다.'; $('#load-message').innerHTML = '서버 연결을 확인한 후 다시 시도해 주세요. <button id="retry-load">다시 불러오기</button>'; }
async function init() {
  try {
    const member = await api('/api/auth/me'); memberEmail = member.email; $('#member-email').textContent = memberEmail;
    try { const saved = JSON.parse(localStorage.getItem(`matzip:${memberEmail}:favorites`)); favorites = Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : []; } catch { favorites = []; }
    await load();
  } catch { showLoadError(); }
}
$('#logout').onclick = async () => { try { await api('/api/auth/logout', {}); location.replace('/'); } catch (error) { toast(error.message); } };
await init();
