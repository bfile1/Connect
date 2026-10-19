import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../supabase/functions/push-notifications/index.ts',import.meta.url),'utf8')).split('// Edge runtime entrypoint')[0].replace(/^import .*;\n/gm,'');
const {createHandler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const valid={endpoint:'https://fcm.googleapis.com/fcm/send/test-device',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}};
function harness({failing=false}={}){
 const rows={connect_members:[{user_id:'dad',family_id:'family',slots:[0]},{user_id:'mum',family_id:'family',slots:[1]},{user_id:'ipad',family_id:'family',slots:[2,3,4]},{user_id:'outsider',family_id:'other',slots:[0]}],connect_push_subscriptions:[],connect_push_events:[],connect_push_deliveries:[]},sent=[];
 const admin={auth:{getUser:async token=>({data:{user:['dad','mum','ipad','outsider'].includes(token)?{id:token}:null},error:null})},rpc:async(_,args)=>{const event=rows.connect_push_events.find(x=>x.id===args.event);if(!event||event.delivered_at||event.locked_until)return {data:false};event.locked_until='leased';return {data:true}},from(table){let predicates=[],op='select',value,single=false,max=Infinity;const q={select(){return q},eq(k,v){predicates.push(x=>x[k]===v);return q},in(k,v){predicates.push(x=>v.includes(x[k]));return q},is(k,v){predicates.push(x=>(x[k]??null)===v);return q},order(){return q},limit(n){max=n;return q},maybeSingle(){single=true;return q},insert(v){op='insert';value=v;return q},upsert(v){op='upsert';value=v;return q},update(v){op='update';value=v;return q},delete(){op='delete';return q},then(resolve,reject){try{let selected=rows[table].filter(x=>predicates.every(p=>p(x))).slice(0,max);if(op==='insert')rows[table].push({...value});if(op==='upsert'){const old=rows[table].find(x=>x.endpoint===value.endpoint);if(old)Object.assign(old,value);else rows[table].push({id:'sub-'+rows[table].length,...value})}if(op==='update')selected.forEach(x=>Object.assign(x,value));if(op==='delete')rows[table]=rows[table].filter(x=>!selected.includes(x));return Promise.resolve({data:single?selected[0]??null:selected,error:null}).then(resolve,reject)}catch(e){return Promise.reject(e).then(resolve,reject)}}};return q}};
 const push={setVapidDetails(){},async sendNotification(sub,payload){if(failing)throw {statusCode:503};if(sub.endpoint.endsWith('/gone'))throw {statusCode:410};sent.push({endpoint:sub.endpoint,payload:JSON.parse(payload)})}};
 const env={get:n=>({CONNECT_WEBHOOK_SECRET:'test-only-secret',VAPID_PUBLIC_KEY:'public',VAPID_PRIVATE_KEY:'private',CONNECT_SITE_URL:'https://family.example'}[n])};
 const handler=createHandler({admin,push,env});
 const call=(body,token,secret)=>handler(new Request('https://edge.example',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(secret?{'x-connect-webhook-secret':secret}:{})},body:JSON.stringify(body)}));
 return {rows,sent,call};
}
test('only authenticated parents can configure or subscribe; endpoints cannot target arbitrary hosts',async()=>{
 const {call,rows}=harness();assert.equal((await call({action:'config'})).status,401);assert.equal((await call({action:'subscribe',subscription:valid},'ipad')).status,403);assert.equal((await call({action:'config'},'dad')).status,200);
 for(const endpoint of ['http://fcm.googleapis.com/a','https://localhost/test','https://fcm.googleapis.com.attacker.example/a','https://fcm.googleapis.com:8443/a','https://user@fcm.googleapis.com/a'])assert.equal((await call({action:'subscribe',subscription:{...valid,endpoint}},'dad')).status,400);
 assert.equal((await call({action:'subscribe',subscription:valid},'dad')).status,200);assert.equal(rows.connect_push_subscriptions[0].family_id,'family');assert.equal((await call({action:'subscribe',subscription:valid},'outsider')).status,409);
 await call({action:'unsubscribe',endpoint:valid.endpoint},'mum');assert.equal(rows.connect_push_subscriptions.length,1);await call({action:'unsubscribe',endpoint:valid.endpoint},'dad');assert.equal(rows.connect_push_subscriptions.length,0);
});
test('webhooks require their secret; dispatches both parents, excludes children and other families, and deduplicates',async()=>{
 const {call,rows,sent}=harness();rows.connect_push_events.push({id:'event',family_id:'family',kind:'check-in',person:2});
 for(const user of ['dad','mum','ipad','outsider'])rows.connect_push_subscriptions.push({id:user,user_id:user,family_id:user==='outsider'?'other':'family',subscription:{endpoint:'https://fcm.googleapis.com/'+user}});
 assert.equal((await call({action:'drain'},'dad')).status,401);assert.equal((await call({table:'connect_push_events'},null,'wrong')).status,401);
 assert.equal((await call({action:'drain'},null,'test-only-secret')).status,200);assert.equal(sent.length,2);assert(sent.some(s=>s.endpoint.endsWith('/dad')));assert(sent.some(s=>s.endpoint.endsWith('/mum')));assert(!JSON.stringify(sent).includes('Buddy'));assert.equal(rows.connect_push_deliveries.length,2);assert(rows.connect_push_events[0].delivered_at);
 await call({action:'drain'},null,'test-only-secret');assert.equal(sent.length,2);
});
test('transient failures remain pending and release the lease; expired devices are removed',async()=>{
 const h=harness({failing:true});h.rows.connect_push_events.push({id:'event',family_id:'family',kind:'idea'});h.rows.connect_push_subscriptions.push({id:'dad',user_id:'dad',family_id:'family',subscription:valid});await h.call({action:'drain'},null,'test-only-secret');assert(!h.rows.connect_push_events[0].delivered_at);assert.equal(h.rows.connect_push_events[0].locked_until,null);
 const g=harness();g.rows.connect_push_events.push({id:'event',family_id:'family',kind:'vote'});g.rows.connect_push_subscriptions.push({id:'old',user_id:'mum',family_id:'family',subscription:{endpoint:'https://fcm.googleapis.com/gone'}});await g.call({action:'drain'},null,'test-only-secret');assert.equal(g.rows.connect_push_subscriptions.length,0);assert(g.rows.connect_push_events[0].delivered_at);
});
