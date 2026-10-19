// Only the publishable key belongs in this browser client. Database policies enforce access.
let session=null, membership=null;
try{session=JSON.parse(localStorage.getItem('connect-session'))}catch{}
async function request(path,{method='GET',body,headers={}}={}){
 const response=await fetch(CONNECT_CONFIG.url+path,{method,headers:{apikey:CONNECT_CONFIG.publishableKey,...(session?.access_token?{Authorization:'Bearer '+session.access_token}:{}),'Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const text=await response.text();let value;try{value=JSON.parse(text)}catch{value=text}
 if(!response.ok)throw new Error(value?.msg||value?.message||value?.error_description||'Unable to connect. Please try again.');return value;
}
async function refreshSession(){if(!session)return;if(session.expires_at*1000>Date.now()+60000)return;session=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});localStorage.setItem('connect-session',JSON.stringify(session))}
async function rest(table,options={}){await refreshSession();return request('/rest/v1/'+table,options)}
async function loadCloud(){
 const rows=await rest('connect_members?select=family_id,slots');membership=rows[0];if(!membership)throw new Error('This account has not been added to your family yet.');
 const family=encodeURIComponent(membership.family_id);
 const [checks,messages,ideas,votes]=await Promise.all(['connect_checkins','connect_messages','connect_ideas','connect_votes'].map(t=>rest(t+'?family_id=eq.'+family+'&select=*'+(t==='connect_messages'||t==='connect_ideas'?'&order=created_at.asc':''))));
 const next={checks:{},messages:messages.map(x=>({from:x.person,to:x.recipient,text:x.body})),ideas:ideas.map(x=>({id:x.id,from:x.person,category:x.category,text:x.body,votes:votes.filter(v=>v.idea_id===x.id).map(v=>v.person)}))};
 checks.forEach(x=>{next.checks[x.day]??={};next.checks[x.day][x.person]=x});data=next;
}
async function writeCloud(table,body,options={}){await rest(table,{method:'POST',body:{family_id:membership.family_id,...body},...options});await loadCloud()}
function showLogin(message=''){
 $('#picker').close();$('#people').innerHTML='';document.querySelector('nav').hidden=true;
 $('#content').innerHTML=`<section class="card login"><span class="tag">YOUR PRIVATE FAMILY SPACE</span><h2>Welcome home</h2><p>Sign in to share a little of your day.</p><form id="login"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="username"><label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password"><p id="loginerror" role="alert"></p><button class="primary">Sign in</button></form><p>The boys share a dedicated iPad account. Both parents have their own accounts.</p></section>`;
 $('#loginerror').textContent=message;$('#switch').textContent='Sign in';$('#switch').onclick=()=>$('#email').focus();$('#signout').hidden=true;$('#notifications').hidden=true;
 $('#login').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const f=new FormData(e.target);session=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:f.get('email'),password:f.get('password')}});localStorage.setItem('connect-session',JSON.stringify(session));await bootCloud()}catch(error){$('#loginerror').textContent=error.message}finally{b.disabled=false}};
}
async function bootCloud(){if(!session)return showLogin();try{await loadCloud();current=membership.slots.length===1?membership.slots[0]:null;document.querySelector('nav').hidden=false;$('#switch').textContent='Switch person';$('#switch').onclick=()=>{current=null;render();$('#picker').showModal()};$('#signout').hidden=false;render();if(typeof updatePushButton==='function')updatePushButton();if(current===null)$('#picker').showModal()}catch(error){showLogin(error.message)}}
async function cloudAction(action){try{await action();render();return true}catch(error){toast(error.message);return false}}
