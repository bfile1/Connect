self.addEventListener('push',event=>{
 let payload;try{payload=event.data?.json()}catch{}
 event.waitUntil(self.registration.showNotification(payload?.title||'Connect',{
  body:payload?.body||'There’s a new family update. Open Connect to see it.',
  icon:'/family-icon.png?v=2',badge:'/icon.svg',tag:payload?.tag||'connect-update',
  data:{url:self.location.origin+'/'},
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const target=windows.find(w=>new URL(w.url).origin===self.location.origin);
  if(target)return target.focus();return self.clients.openWindow(self.location.origin+'/');
 })());
});
