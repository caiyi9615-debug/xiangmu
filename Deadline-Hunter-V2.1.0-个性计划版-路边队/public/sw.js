'use strict';
// 只处理推送，不缓存页面/API，不接管原有任务保存与AI上传。
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
async function localTaskAllowed(message){
 if(!message.taskId)return true;
 return new Promise(resolve=>{
  const r=indexedDB.open('deadline-hunter-campus-v2');
  r.onupgradeneeded=()=>{r.transaction.abort();resolve(false);};
  r.onerror=()=>resolve(false);
  r.onsuccess=()=>{
   const db=r.result;if(!db.objectStoreNames.contains('state')){db.close();resolve(false);return;}
   const tx=db.transaction('state','readonly'),get=tx.objectStore('state').get('main');
   get.onsuccess=()=>{const t=get.result?.tasks?.find(t=>t.id===message.taskId);resolve(!!t&&t.dueAt===message.dueAt&&t.dateConfirmed===true&&['unsubmitted','overdue'].includes(t.executionStatus));};
   get.onerror=()=>resolve(false);tx.oncomplete=()=>db.close();
  };
 });
}
self.addEventListener('push',e=>e.waitUntil((async()=>{
 let m;try{m=e.data.json();}catch{return;}
 if(!m||m.expires<Date.now()||!await localTaskAllowed(m))return;
 await self.registration.showNotification(m.title||'Deadline Hunter',{body:m.body,tag:m.tag,icon:'/push-icon.svg',data:{url:m.url||'/#tasks'}});
})()));
self.addEventListener('notificationclick',e=>{
 e.notification.close();
 e.waitUntil((async()=>{
  const url=new URL(e.notification.data?.url||'/#tasks',self.location.origin);
  if(url.origin!==self.location.origin)return;
  for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))if(new URL(client.url).origin===url.origin){await client.navigate(url.href);await client.focus();return;}
  await self.clients.openWindow(url.href);
 })());
});
