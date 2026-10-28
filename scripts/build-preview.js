import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [html, css, model, app] = await Promise.all(['public/index.html', 'public/style.css', 'public/model.js', 'public/app.js'].map(read));
// Only fictional fixtures enter this public artifact. Never read private DBs or inject authenticated API responses.
const previewAPI = `async function api(path, data) {
  if (path === '/api/dining' && data === undefined) return { restaurants: restaurantsForPreview, reviews: {} };
  throw new Error('이 파일은 가상 데이터 화면 미리보기입니다. 실제 맛집 등록과 리뷰 공유는 서버에서 이용해 주세요.');
}
`;
const start = app.indexOf('async function api(');
const end = app.indexOf('async function load()', start);
if (start < 0 || end < 0) throw new Error('Preview API replacement markers missing');
const demoApp = (app.slice(0, start) + previewAPI + app.slice(end))
  .replace(/^import[^;]+;\s*/, '')
  .replace('await init();', 'await init();\n' + `
$('#preview-help-close').onclick = () => $('#preview-help').close();
$('#preview-help-link').onclick = event => { event.preventDefault(); $('#preview-help').showModal(); };
`);
// Rename only the app's mutable collection; keep API property names unchanged.
const appCode = demoApp.replace(/\blet restaurants = \[\]/, 'let loadedRestaurants = []')
  .replace(/\brestaurants = snapshot\.restaurants/, 'loadedRestaurants = snapshot.restaurants')
  .replace(/filterRestaurants\(restaurants,/g, 'filterRestaurants(loadedRestaurants,')
  .replace(/\brestaurants\.find\(/g, 'loadedRestaurants.find(');
const finalScript = `(async () => {\n${model.replace(/^export /gm, '')}\nconst restaurantsForPreview = restaurants.map(r => ({ ...r }));\n${appCode}\n})().catch(error => { const node = document.querySelector('#load-message'); if (node) node.textContent = '미리보기를 불러오지 못했습니다. HTML 파일을 브라우저에서 직접 열어 주세요.'; console.error(error); });`;
if (/\bfetch\s*\(/.test(finalScript)) throw new Error('Standalone preview must not make network requests');
const help = `<dialog id="preview-help" class="preview-help" aria-labelledby="preview-help-title"><h2 id="preview-help-title">공개 맛집 노트 이용 안내</h2><p>이 파일은 가상 동탄 맛집을 둘러보는 미리보기입니다. 검색·조건 필터·지도 링크·상세 화면을 확인할 수 있습니다.</p><p>실제 서버에서는 로그인 없이 누구나 맛집과 리뷰를 볼 수 있습니다. 이 정적 파일에서는 가상 데이터만 표시하며 실제 등록과 리뷰 공유는 서버에서 이용할 수 있습니다.</p><p>회사명은 텍스트로 표시했습니다. 공식 로고 이미지 원본은 아직 적용하지 않았습니다.</p><button id="preview-help-close">확인</button></dialog>`;
const banner = `<aside class="preview-banner"><strong>화면 미리보기</strong> · 더퍼스트타워2차 기준의 가상 식당 6곳입니다. 실제 방문자 기록이나 리뷰는 포함하지 않습니다.<a href="#preview-help" id="preview-help-link">미리보기 안내 ↗</a><span class="company-logo-note">ONTO INNOVATION 회사명 텍스트 표시 · 공식 로고 이미지 원본 미적용</span></aside>`;
const preview = html.replace('<link rel="stylesheet" href="/style.css">', () => `<style>${css}</style>`)
  .replace('</header>', '</header>' + banner)
  .replace('<script type="module" src="/app.js"></script>', () => `${help}<script>${finalScript}</script>`)
  .replaceAll('href="/"', 'href="./index.html"')
  .replace('리뷰는 누구나 볼 수 있습니다. 즐겨찾기는 이 브라우저에 저장됩니다. 예시 식당에 남긴 리뷰는 실제 매장 평가가 아닙니다.', '가상 데이터 화면 미리보기입니다. 검색·필터·상세를 둘러볼 수 있으며 실제 맛집 등록·리뷰 공유는 동작하지 않습니다.')
  .replace('<title>동탄 맛집노트 — 더퍼스트타워2차에서 시작하는 한 끼</title>', '<title>동탄 맛집노트 · ONTO INNOVATION · 화면 미리보기</title>');
for (const filename of ['index.html', 'preview.html']) await writeFile(new URL(filename, root), preview);
console.log('Built self-contained index.html and preview.html with fictional data only');
