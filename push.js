let pushBusy=false;
const isParent=()=>membership?.slots.length===1 && [0,1].includes(membership.slots[0]);
async function pushAPI(body){await refreshSession();return request('/functions/v1/push-notifications',{method:'POST',body})}
function updatePushButton(){const button=$('#notifications');button.hidden=!session||!isParent();button.disabled=pushBusy}
async function pushRegistration(){return navigator.serviceWorker.register('/sw.js',{scope:'/'})}
async function openPushSettings(){
 if(!isParent())return;
 const panel=$('#pushsettings'),body=$('#pushbody');
 panel.showModal();body.replaceChildren();
 const text=document.createElement('p');text.textContent='Get a gentle heads-up when anyone shares a check-in, message, idea, or vote. Both Mum and Dad can enable this on their own phones.';body.append(text);
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 if(ios&&!standalone){text.textContent='On your iPhone, open Connect in Safari. Tap Share → Add to Home Screen. Open Connect using its new Home Screen icon, sign in, and tap Notifications again.';return}
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){text.textContent='This browser does not support phone notifications. Try an up-to-date browser; on iPhone, add Connect to your Home Screen first.';return}
 if(Notification.permission==='denied'){text.textContent='Notifications are blocked. Allow notifications for Connect in your phone or browser settings, then reopen this screen.';return}
 const status=document.createElement('p');status.setAttribute('role','status');body.append(status);
 const enable=document.createElement('button');enable.className='primary';enable.textContent='Enable notifications';body.append(enable);
 const disable=document.createElement('button');disable.className='quiet';disable.textContent='Turn off on this device';disable.style.marginTop='12px';body.append(disable);
 enable.onclick=async()=>{
  if(pushBusy)return;pushBusy=true;enable.disabled=disable.disabled=true;status.textContent='Connecting…';
  // Request permission directly in the tap handler, before a network round trip.
  try{
   const permission=await Notification.requestPermission();
   if(permission!=='granted')throw new Error('Notifications were not allowed. You can change this in your phone settings.');
   const config=await pushAPI({action:'config'}),registration=await pushRegistration();
   await navigator.serviceWorker.ready;
   const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
   let subscription=await registration.pushManager.getSubscription();
   if(subscription?.options.applicationServerKey){const existing=new Uint8Array(subscription.options.applicationServerKey);if(existing.length!==key.length||existing.some((v,i)=>v!==key[i])){await subscription.unsubscribe();subscription=null}}
   subscription??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
   const result=await pushAPI({action:'subscribe',subscription:subscription.toJSON()});
   status.textContent=result.testDelivered?'You’re connected! A test notification is on its way.':'Notifications are enabled, but the test could not be delivered. Please check again shortly.';
  }catch(error){status.textContent=error.message}
  finally{pushBusy=false;enable.disabled=disable.disabled=false}
 };
 disable.onclick=async()=>{
  if(pushBusy)return;pushBusy=true;enable.disabled=disable.disabled=true;
  try{const registration=await navigator.serviceWorker.getRegistration('/');const subscription=await registration?.pushManager.getSubscription();if(subscription){await pushAPI({action:'unsubscribe',endpoint:subscription.endpoint});await subscription.unsubscribe()}status.textContent='Notifications are off on this device.'}catch(error){status.textContent=error.message}finally{pushBusy=false;enable.disabled=disable.disabled=false}
 };
}
$('#notifications').onclick=openPushSettings;
$('#closepush').onclick=()=>$('#pushsettings').close();
