import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PGlite } from '@electric-sql/pglite';
import { createPostgresStores, postgresOptions } from './postgres.js';
import { createApp } from './server.js';
import { todayInSeoul } from './public/model.js';
function poolFor(db) { return { query: (sql, args) => db.query(sql, args), end: () => db.close() }; }
const restaurant = { name:'테스트 식당',area:'회사 인근',category:'한식',dish:'정식',price:10000,walkMinutes:5,driveMinutes:null,groupSize:8,parking:true,reservation:null,address:'경기도 화성시 테스트 주소',description:'' };
const review = { name:'방문자',rating:5,text:'정말 맛있게 먹었어요',visitDate:todayInSeoul(),waitMinutes:0,mealMinutes:25,tags:['재방문하고 싶어요'] };
test('PostgreSQL keeps visitor ownership and public data after engine restart; duplicate and foreign deletes fail', async t => {
 const dir=mkdtempSync(join(tmpdir(),'matzip-pg-'));let stores=await createPostgresStores({pool:poolFor(new PGlite(dir))});
 t.after(async()=>{await stores.close();rmSync(dir,{recursive:true,force:true})});
 const a=await stores.visitors.create(),b=await stores.visitors.create();
 assert.equal(await stores.visitors.resolve(a.token),a.id);assert.equal(await stores.visitors.resolve('a'.repeat(64)),null);
 const r=await stores.dining.addRestaurant(a.id,restaurant);
 await stores.dining.addReview(a.id,r.id,review);
 await assert.rejects(stores.dining.addReview(a.id,r.id,review),{status:409});
 const snapshot=await stores.dining.snapshot(b.id);assert.equal(snapshot.reviews[r.id][0].mine,false);assert.equal(snapshot.reviews[r.id][0].text,review.text);
 await assert.rejects(stores.dining.deleteReview(b.id,snapshot.reviews[r.id][0].id),{status:404});
 await stores.close();stores=await createPostgresStores({pool:poolFor(new PGlite(dir))});
 assert.equal(await stores.visitors.resolve(a.token),a.id);
 const mine=(await stores.dining.snapshot(a.id)).reviews[r.id][0];assert.equal(mine.mine,true);
 await stores.dining.deleteReview(a.id,mine.id);assert.deepEqual((await stores.dining.snapshot(b.id)).reviews,{});
 assert.equal((await stores.dining.snapshot(a.id)).restaurants.length,7);
});
test('PostgreSQL request limits are atomic under simultaneous public requests', async t => {
 let time=1000000000000;const stores=await createPostgresStores({pool:poolFor(new PGlite()),now:()=>time});t.after(()=>stores.close());
 const allowed=await Promise.all(Array.from({length:70},()=>stores.visitors.allowWrite('same-ip')));
 assert.equal(allowed.filter(Boolean).length,60);time+=600000;assert.equal(await stores.visitors.allowWrite('same-ip'),true);
});
test('PostgreSQL Naver imports are repeatable and avoid duplicate user registrations', async t => {
 const stores=await createPostgresStores({pool:poolFor(new PGlite())});t.after(()=>stores.close());
 const r=await stores.dining.addRestaurant('visitor',restaurant);
 assert.equal(await stores.dining.importRestaurants([{...r,id:'naver-existing'}]),0);
 const imported={...r,id:'naver-other',name:'다른 매장',source:'naver'};
 assert.equal(await stores.dining.importRestaurants([imported]),1);
 assert.equal(await stores.dining.importRestaurants([imported]),0);
});
test('Render Free server serves and writes through PostgreSQL without a local disk', async t => {
 const pool=poolFor(new PGlite());
 const server=await createApp({env:{NODE_ENV:'production',RENDER_EXTERNAL_URL:'https://matzip-test.onrender.com',DATABASE_URL:'postgresql://test.invalid/test'},postgresPool:pool});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(r=>server.close(r));await server.storageClosed});
 const home=await fetch(base);assert.equal(home.status,200);const cookie=home.headers.get('set-cookie').split(';')[0];
 assert.deepEqual(await(await fetch(base+'/healthz')).json(),{status:'ok'});
 const response=await fetch(base+'/api/dining/restaurants',{method:'POST',headers:{Cookie:cookie,Origin:'https://matzip-test.onrender.com','Content-Type':'application/json'},body:JSON.stringify(restaurant)});
 assert.equal(response.status,201);
 assert.equal((await(await fetch(base+'/api/dining',{headers:{Cookie:cookie}})).json()).restaurants.length,7);
});
test('Neon connections always verify TLS certificates and do not allow plaintext protocols', () => {
 const options=postgresOptions('postgresql://user:fake@db.example/test?sslmode=disable');
 assert.deepEqual(options.ssl,{rejectUnauthorized:true});assert.equal(new URL(options.connectionString).searchParams.has('sslmode'),false);
 assert.throws(()=>postgresOptions('http://example.test'),/PostgreSQL/);
});
