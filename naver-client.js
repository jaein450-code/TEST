// API HUB header names verified from the application's Naver Cloud authentication screen.
// Do not guess an API HUB endpoint from a console URL or an nmap:// link.
export function createLocalSearchClient({ env = process.env, request = fetch } = {}) {
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) throw new Error('저장한 네이버 Client ID와 Client Secret이 실행 환경에 아직 적용되지 않았습니다.');
  const provider = env.NAVER_API_PROVIDER || 'apihub';
  if (!['apihub', 'legacy'].includes(provider)) throw new Error('지원하지 않는 네이버 인증 방식입니다.');
  if (provider === 'apihub' && !env.NAVER_LOCAL_SEARCH_URL) throw new Error('API HUB 지역 검색 요청 URL이 아직 확인되지 않았습니다. 공식 개발 문서에서 확인한 HTTPS 주소를 NAVER_LOCAL_SEARCH_URL에 설정해야 합니다.');
  const endpoint = provider === 'legacy' ? 'https://openapi.naver.com/v1/search/local.json' : env.NAVER_LOCAL_SEARCH_URL;
  const base = new URL(endpoint);
  if (base.protocol !== 'https:' || base.username || base.password || base.hash || base.search || base.port) throw new Error('네이버 요청 URL은 인증정보·쿼리·프래그먼트 없는 HTTPS 주소여야 합니다.');
  if (provider === 'apihub' && !base.hostname.endsWith('.apigw.ntruss.com')) throw new Error('공식 네이버 클라우드 API Gateway 호스트의 요청 URL을 확인해 주세요. 관리 콘솔·개발 가이드·지도 앱 실행 주소는 사용할 수 없습니다.');
  const headers = provider === 'apihub'
    ? { 'X-NCP-APIGW-API-KEY-ID': env.NAVER_CLIENT_ID, 'X-NCP-APIGW-API-KEY': env.NAVER_CLIENT_SECRET }
    : { 'X-Naver-Client-Id': env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET };
  return async query => {
    const url = new URL(base); url.search = new URLSearchParams({ query, display: '5', sort: 'random' });
    const response = await request(url, { signal: AbortSignal.timeout(15000), headers, redirect: 'error' });
    if (!response.ok) throw new Error(`네이버 API 요청 실패 (${response.status}). 인증 설정과 네트워크 접근을 확인하세요.`);
    const result = await response.json();
    if (!Array.isArray(result.items)) throw new Error('네이버 지역 검색 응답 형식이 올바르지 않습니다.');
    return result.items;
  };
}
