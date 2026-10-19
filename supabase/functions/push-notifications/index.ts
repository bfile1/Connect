import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

// The browser never receives service-role, VAPID-private, or webhook keys.
export function createHandler({ env, admin, push, now = () => Date.now() }) {
 const allowedOrigin = env.get('CONNECT_SITE_URL') || 'https://connect-7t0.pages.dev';
 const cors = { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
 const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
 const check = result => { if(result.error) throw new Error(result.error.message); return result.data; };
 function validSubscription(s) {
  if(!s || typeof s.endpoint !== 'string' || s.endpoint.length>2048) return false;
  let u; try { u = new URL(s.endpoint); } catch { return false; }
  const host = u.hostname;
  const trusted = host==='fcm.googleapis.com' || host==='updates.push.services.mozilla.com' || host.endsWith('.push.apple.com') || host==='push.apple.com' || host.endsWith('.notify.windows.com');
  return trusted && u.protocol==='https:' && !u.username && !u.password && !u.port && !u.hash && /^[A-Za-z0-9_-]{87}=?$/.test(s.keys?.p256dh||'') && /^[A-Za-z0-9_-]{22}={0,2}$/.test(s.keys?.auth||'');
 }
 function configurePush() {
  const publicKey=env.get('VAPID_PUBLIC_KEY'), privateKey=env.get('VAPID_PRIVATE_KEY');
  if(!publicKey || !privateKey) throw new Error('Push keys have not been configured.');
  push.setVapidDetails(allowedOrigin, publicKey, privateKey);
 }
 async function deliver(event) {
  if(!check(await admin.rpc('connect_claim_push',{event:event.id}))) return;
  try {
   const members=check(await admin.from('connect_members').select('user_id,slots').eq('family_id',event.family_id));
   const parents=members.filter(m=>m.slots.length===1 && [0,1].includes(m.slots[0])).map(m=>m.user_id);
   const subscribers=parents.length?check(await admin.from('connect_push_subscriptions').select('*').eq('family_id',event.family_id).in('user_id',parents)):[];
   const sent=check(await admin.from('connect_push_deliveries').select('subscription_id').eq('event_id',event.id));
   let failed=false;
   // Generic lock-screen text: never include the child's name, scores, or message.
   const payload=JSON.stringify({title:'A little family update',body:'Someone shared a '+event.kind+' in Connect. Tap to have a look.',tag:'connect-'+event.id,url:allowedOrigin});
   for(const sub of subscribers) {
    if(sent.some(x=>x.subscription_id===sub.id)) continue;
    try {
     await push.sendNotification(sub.subscription,payload,{TTL:86400,timeout:10000});
     check(await admin.from('connect_push_deliveries').insert({event_id:event.id,subscription_id:sub.id}));
    } catch(error) {
     if([404,410].includes(error.statusCode)) check(await admin.from('connect_push_subscriptions').delete().eq('id',sub.id));
     else failed=true;
    }
   }
   check(await admin.from('connect_push_events').update({locked_until:null,...(!failed?{delivered_at:new Date(now()).toISOString()}:{})}).eq('id',event.id));
  } catch(error) {
   await admin.from('connect_push_events').update({locked_until:null}).eq('id',event.id);
   throw error;
  }
 }
 return async function handler(req) {
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST') return reply(405,{error:'Use POST.'});
  try {
   const raw=await req.text();if(raw.length>8192)return reply(413,{error:'Request too large.'});
   let body;try{body=JSON.parse(raw)}catch{return reply(400,{error:'Invalid JSON.'})}
   if(!body || typeof body!=='object')return reply(400,{error:'Invalid request.'});
   const isDispatch=body.action==='drain' || body.table==='connect_push_events';
   if(isDispatch) {
    const secret=env.get('CONNECT_WEBHOOK_SECRET');
    // Compare fixed-size digests to avoid leaking secret-prefix timing.
    const supplied=req.headers.get('x-connect-webhook-secret')||'';
    const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
    const a=await digest(secret||''),b=await digest(supplied);
    let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
    if(!secret || !supplied || difference) return reply(401,{error:'Unauthorized.'});
    configurePush();
    const pending=check(await admin.from('connect_push_events').select('*').is('delivered_at',null).order('created_at').limit(20));
    for(const event of pending) await deliver(event);
    return reply(200,{processed:pending.length});
   }
   const token=req.headers.get('authorization')?.replace(/^Bearer /i,'');
   if(!token)return reply(401,{error:'Sign in first.'});
   const {data:auth,error:authError}=await admin.auth.getUser(token);
   if(authError || !auth.user)return reply(401,{error:'Sign in again.'});
   const membership=check(await admin.from('connect_members').select('family_id,slots').eq('user_id',auth.user.id).maybeSingle());
   if(!membership || membership.slots.length!==1 || ![0,1].includes(membership.slots[0]))return reply(403,{error:'Notifications are available to Mum and Dad only.'});
   if(body.action==='config') {
    const key=env.get('VAPID_PUBLIC_KEY');if(!key)return reply(503,{error:'Phone notifications are not set up yet.'});
    return reply(200,{publicKey:key});
   }
   if(body.action==='unsubscribe') {
    if(typeof body.endpoint!=='string')return reply(400,{error:'A subscription endpoint is required.'});
    check(await admin.from('connect_push_subscriptions').delete().eq('endpoint',body.endpoint).eq('user_id',auth.user.id));
    return reply(200,{ok:true});
   }
   if(body.action!=='subscribe' || !validSubscription(body.subscription))return reply(400,{error:'Invalid push subscription.'});
   configurePush();
   const old=check(await admin.from('connect_push_subscriptions').select('user_id').eq('endpoint',body.subscription.endpoint).maybeSingle());
   if(old && old.user_id!==auth.user.id)return reply(409,{error:'This browser already has notifications for another account. Sign in to that account and turn them off first.'});
   check(await admin.from('connect_push_subscriptions').upsert({user_id:auth.user.id,family_id:membership.family_id,endpoint:body.subscription.endpoint,subscription:body.subscription},{onConflict:'endpoint'}));
   let testDelivered=true;
   try {await push.sendNotification(body.subscription,JSON.stringify({title:'You’re connected ♡',body:'Family updates will arrive here.',tag:'connect-enabled',url:allowedOrigin}),{TTL:300,timeout:10000})}catch{testDelivered=false}
   return reply(200,{ok:true,testDelivered});
  } catch(error) {
   // Never include database details, endpoints, tokens, or secret values in a response/log.
   return reply(503,{error:'Notifications could not connect. Please try again shortly.'});
  }
 };
}

// Edge runtime entrypoint
if (typeof Deno !== 'undefined') {
 const admin=createClient(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
 Deno.serve(createHandler({env:Deno.env,admin,push:webpush}));
}
