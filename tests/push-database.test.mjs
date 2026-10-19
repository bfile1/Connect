import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('database triggers, access rules, retry leases and repeatable migration',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated;
 insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 const migration=await readFile(new URL('../supabase/notifications.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 await db.exec(`insert into public.connect_members values
 ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',array[0]),
 ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',array[1]),
 ('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',array[2,3,4]);
 set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);`);
 await assert.rejects(db.query('select * from public.connect_push_subscriptions'),/permission denied/);
 await assert.rejects(db.query('select * from public.connect_push_events'),/permission denied/);
 await assert.rejects(db.query(`select public.connect_claim_push('00000000-0000-0000-0000-000000000001')`),/permission denied/);
 await assert.rejects(db.query(`insert into public.connect_checkins values('10000000-0000-0000-0000-000000000001',current_date,0,3,3,3,3,'')`),/row-level security/);
 await db.exec(`insert into public.connect_checkins values('10000000-0000-0000-0000-000000000001',current_date,2,3,3,3,3,'private note');
 update public.connect_checkins set mood=3 where person=2;
 update public.connect_checkins set mood=4 where person=2;
 insert into public.connect_messages(family_id,person,recipient,body) values('10000000-0000-0000-0000-000000000001',2,'0','private message');
 insert into public.connect_ideas(id,family_id,person,category,body) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',2,'🌳 Outings','Picnic');
 insert into public.connect_votes values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',2);
 delete from public.connect_votes where person=2; reset role;`);
 const {rows}=await db.query('select * from public.connect_push_events order by created_at');
 assert.equal(rows.length,6);assert.equal(rows.filter(r=>r.kind==='check-in').length,2);assert.equal(rows.filter(r=>r.kind==='vote').length,2);
 assert(!JSON.stringify(rows).includes('private'));
 await db.exec('set role service_role');
 const claim=()=>db.query('select public.connect_claim_push($1) as claimed',[rows[0].id]);
 assert.equal((await claim()).rows[0].claimed,true);assert.equal((await claim()).rows[0].claimed,false);
 await db.query("update public.connect_push_events set locked_until=now()-interval '1 minute' where id=$1",[rows[0].id]);assert.equal((await claim()).rows[0].claimed,true);
 await db.query('update public.connect_push_events set delivered_at=now(),locked_until=null where id=$1',[rows[0].id]);assert.equal((await claim()).rows[0].claimed,false);
 }finally{await db.close()}
});
