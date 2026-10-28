import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDining } from '../dining.js';
import { OFFICE_ADDRESS, prepareImport, resolveOffice } from '../naver-import.js';
import { createLocalSearchClient } from '../naver-client.js';
const directory = resolve(process.env.DATA_DIR || '.local');

try {
  const search = createLocalSearchClient();
  const center = resolveOffice(await search(OFFICE_ADDRESS + ' 더퍼스트타워2차'));
  const items = [];
  for (const area of ['동탄기흥로 614', '동탄 영천동', '동탄역', '동탄 청계동', '동탄 능동', '동탄 석우동', '동탄 반송동', '동탄 북광장', '동탄 남광장']) {
    for (const food of ['한식 식당', '중식 식당', '일식 식당', '양식 식당', '분식', '고기집']) {
      items.push(...await search(`${area} ${food}`));
      await new Promise(r => setTimeout(r, 120));
    }
  }
  const result = prepareImport(items, center);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(join(directory, 'naver-import-report.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify(result.report)); console.log('검토용 결과: .local/naver-import-report.json. DB에는 쓰지 않았습니다. --apply 옵션으로 등록할 수 있습니다.'); }
  else {
    if (!result.restaurants.length) throw new Error('반경 안의 식당이 없어 등록하지 않았습니다.');
    const store = createDining(directory); store.close();
    const db = new DatabaseSync(join(directory, 'dining.sqlite'));
    const key = r => `${r.name.replace(/\s/g, '').toLowerCase()}|${r.address.replace(/\s/g, '')}`;
    const existing = new Set(db.prepare('SELECT data FROM restaurants').all().map(row => key(JSON.parse(row.data))));
    let added = 0;
    try {
      db.exec('BEGIN IMMEDIATE');
      const insert = db.prepare('INSERT OR IGNORE INTO restaurants VALUES (?, ?, ?, ?)');
      for (const r of result.restaurants) { if (existing.has(key(r))) continue; added += Number(insert.run(r.id, JSON.stringify(r), 'naver-import', result.fetchedAt).changes); existing.add(key(r)); }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    finally { db.close(); }
    console.log(JSON.stringify({ ...result.report, added }));
  }
  console.log('검색으로 수집한 후보만 포함합니다. 반경 내 전체 식당 목록을 보장하지 않습니다. 거리는 도보 경로가 아닌 직선거리입니다.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
