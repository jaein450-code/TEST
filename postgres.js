import pg from 'pg';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { restaurants, validateRestaurant, validateReview } from './public/model.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
export function postgresOptions(connectionString) {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  // Explicit verified TLS; URI parameters must not weaken certificate checks.
  for (const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true }, max: 3, connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000 };
}
export async function createPostgresStores({ connectionString, pool: suppliedPool, now = Date.now }) {
  const pool = suppliedPool || new pg.Pool(postgresOptions(connectionString));
  pool.on?.('error', () => console.error('PostgreSQL background connection failed'));
  const schema = [
    'CREATE TABLE IF NOT EXISTS matzip_visitors (digest TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, expires BIGINT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS matzip_write_limits (ip TEXT PRIMARY KEY, window_start BIGINT NOT NULL, count INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS matzip_restaurants (id TEXT PRIMARY KEY, data JSONB NOT NULL, author TEXT NOT NULL, created TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    'CREATE TABLE IF NOT EXISTS matzip_reviews (id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL, author TEXT NOT NULL, visit_date TEXT NOT NULL, data JSONB NOT NULL, created TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(restaurant_id, author, visit_date))',
    'CREATE INDEX IF NOT EXISTS matzip_reviews_restaurant ON matzip_reviews(restaurant_id)'
  ];
  try { for (const sql of schema) await pool.query(sql); }
  catch (error) { await pool.end(); throw error; }
  const healthy = async () => (await pool.query('SELECT 1 AS ok')).rows[0].ok === 1;
  const all = async () => [...restaurants, ...(await pool.query('SELECT data FROM matzip_restaurants ORDER BY created DESC, id DESC')).rows.map(row => row.data)];
  const visitors = {
    async resolve(token) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
      return (await pool.query('SELECT id FROM matzip_visitors WHERE digest=$1 AND expires>$2', [hash(token), now()])).rows[0]?.id || null;
    },
    async create() {
      await pool.query('DELETE FROM matzip_visitors WHERE expires<=$1', [now()]);
      const token=randomBytes(32).toString('hex'), id=randomUUID();
      await pool.query('INSERT INTO matzip_visitors VALUES ($1,$2,$3)', [hash(token),id,now()+31536000000]);
      return {token,id};
    },
    async allowWrite(ip) {
      const time=now();
      await pool.query('DELETE FROM matzip_write_limits WHERE window_start < $1', [time-86400000]);
      const result=await pool.query(`INSERT INTO matzip_write_limits VALUES ($1,$2,1)
        ON CONFLICT(ip) DO UPDATE SET
          window_start=CASE WHEN matzip_write_limits.window_start+600000<=$2 THEN $2 ELSE matzip_write_limits.window_start END,
          count=CASE WHEN matzip_write_limits.window_start+600000<=$2 THEN 1 ELSE matzip_write_limits.count+1 END
        WHERE matzip_write_limits.window_start+600000<=$2 OR matzip_write_limits.count<60 RETURNING count`, [ip,time]);
      return result.rows.length===1;
    },
    isHealthy: healthy
  };
  const dining = {
    async snapshot(visitor) {
      const reviews={};
      for (const row of (await pool.query('SELECT * FROM matzip_reviews ORDER BY visit_date DESC,created DESC,id DESC')).rows) {
        (reviews[row.restaurant_id] ||= []).push({...row.data,id:row.id,created:new Date(row.created).toISOString(),mine:row.author===visitor});
      }
      return { restaurants:await all(), reviews };
    },
    async addRestaurant(visitor,input) {
      if (!validateRestaurant(input)) throw fail(400,'매장 이름·주소·메뉴·가격과 입력값을 확인해 주세요.');
      const r=Object.fromEntries(['name','area','category','dish','price','walkMinutes','driveMinutes','groupSize','parking','reservation','address','description'].map(k=>[k,typeof input[k]==='string'?input[k].trim():input[k]]));
      Object.assign(r,{id:randomUUID(),demo:false,icon:{한식:'🍚',양식:'🍝',일식:'🍣',중식:'🍜',카페:'☕',기타:'🍽️'}[r.category],color:'#dde4ce'});
      const result=await pool.query(`INSERT INTO matzip_restaurants(id,data,author)
        SELECT $1,$2::jsonb,$3 WHERE (SELECT COUNT(*) FROM matzip_restaurants WHERE author=$3 AND created>=NOW()-INTERVAL '1 day')<20 RETURNING id`,[r.id,JSON.stringify(r),visitor]);
      if (!result.rows.length) throw fail(429,'하루 등록 가능 횟수를 초과했습니다.');
      return r;
    },
    async addReview(visitor,restaurantId,input) {
      if (!(await all()).some(r=>r.id===restaurantId)) throw fail(404,'맛집을 찾을 수 없습니다.');
      if (!validateReview(input)) throw fail(400,'닉네임, 별점, 방문 날짜, 5자 이상의 리뷰와 소요 시간을 확인해 주세요.');
      const r={name:input.name.trim(),rating:input.rating,text:input.text.trim(),visitDate:input.visitDate,waitMinutes:input.waitMinutes,mealMinutes:input.mealMinutes,tags:input.tags};
      try {
        const result=await pool.query(`INSERT INTO matzip_reviews(id,restaurant_id,author,visit_date,data)
          SELECT $1,$2,$3,$4,$5::jsonb WHERE (SELECT COUNT(*) FROM matzip_reviews WHERE author=$3 AND created>=NOW()-INTERVAL '1 day')<100 RETURNING id`,[randomUUID(),restaurantId,visitor,r.visitDate,JSON.stringify(r)]);
        if (!result.rows.length) throw fail(429,'하루 리뷰 등록 횟수를 초과했습니다.');
      } catch(error) { if(error.code==='23505') throw fail(409,'같은 식당의 같은 방문 날짜에는 리뷰를 한 번만 작성할 수 있습니다.'); throw error; }
    },
    async deleteReview(visitor,id) {
      if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id)) throw fail(400,'리뷰 번호를 확인해 주세요.');
      if(!(await pool.query('DELETE FROM matzip_reviews WHERE id=$1 AND author=$2 RETURNING id',[id,visitor])).rows.length) throw fail(404,'삭제할 본인 리뷰를 찾을 수 없습니다.');
    },
    async importRestaurants(records) {
      let added=0;
      for(const r of records) {
        const result=await pool.query(`INSERT INTO matzip_restaurants(id,data,author)
          SELECT $1,$2::jsonb,'naver-import' WHERE NOT EXISTS (SELECT 1 FROM matzip_restaurants
            WHERE regexp_replace(lower(data->>'name'),'\\s','','g')=regexp_replace(lower($3),'\\s','','g')
            AND regexp_replace(data->>'address','\\s','','g')=regexp_replace($4,'\\s','','g'))
          ON CONFLICT(id) DO NOTHING RETURNING id`,[r.id,JSON.stringify(r),r.name,r.address]);
        added+=result.rows.length;
      }
      return added;
    },
    isHealthy:healthy
  };
  return {visitors,dining,close:()=>pool.end()};
}
