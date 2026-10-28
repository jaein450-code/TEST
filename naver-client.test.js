import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalSearchClient } from './naver-client.js';
const env = { NAVER_CLIENT_ID: 'test-id', NAVER_CLIENT_SECRET: 'test-secret' };
test('API HUB fails closed before sending keys without a verified endpoint', () => {
  assert.throws(() => createLocalSearchClient({ env: {} }), /실행 환경/);
  assert.throws(() => createLocalSearchClient({ env }), /요청 URL/);
  for (const url of ['nmap://search', 'https://console.ncloud.com/naver-api-hub/application', 'http://example.apigw.ntruss.com/local', 'https://user:password@example.apigw.ntruss.com/local']) assert.throws(() => createLocalSearchClient({ env: { ...env, NAVER_LOCAL_SEARCH_URL: url } }));
});
test('API HUB uses the shown NCP headers, encoded query and refuses redirects', async () => {
  // Mock endpoint, not a claim about the real regional-search API path.
  const search = createLocalSearchClient({ env: { ...env, NAVER_LOCAL_SEARCH_URL: 'https://test.apigw.ntruss.com/mock-local' }, request: async (url, options) => {
    assert.equal(url.searchParams.get('query'), '동탄기흥로 614');
    assert.equal(options.headers['X-NCP-APIGW-API-KEY-ID'], 'test-id');
    assert.equal(options.headers['X-NCP-APIGW-API-KEY'], 'test-secret');
    assert.equal(options.headers['X-Naver-Client-Secret'], undefined);
    assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => ({ items: [{ title: '테스트' }] }) };
  } });
  assert.deepEqual(await search('동탄기흥로 614'), [{ title: '테스트' }]);
});
test('legacy headers and endpoint require explicit legacy selection', async () => {
  const search = createLocalSearchClient({ env: { ...env, NAVER_API_PROVIDER: 'legacy' }, request: async (url, options) => {
    assert.equal(url.origin, 'https://openapi.naver.com'); assert.equal(options.headers['X-Naver-Client-Secret'], 'test-secret');
    return { ok: true, json: async () => ({ items: [] }) };
  } });
  assert.deepEqual(await search('테스트'), []);
});
