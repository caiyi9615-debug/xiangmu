'use strict';
window.DHExperience=(()=>{
 const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const highlighted=x=>String(x??'').split(/(\d+(?:\.\d+)?(?:分钟|小时|天|篇|份|支|个|章|%|点)?)/g).map((s,i)=>i%2?'<mark>'+e(s)+'</mark>':e(s)).join('');
 let api,showing=false;
 const get=(k,f='')=>{try{return localStorage.getItem(k)||f;}catch{return f;}};
 const set=(k,v)=>{try{localStorage.setItem(k,v);}catch{}};
 function welcome(){
  if(api.page!=='dashboard'||api.getState().tasks.length||get('dh-welcomed'))return;
  const box=document.createElement('section');box.id='welcomePanel';box.className='panel welcome-panel';box.innerHTML='<h2>先看一份通知，怎样变成行动计划</h2><p>体验通知识别、截止核实、变更对比与任务计划，也可以从自己的任务开始。</p><div class="actions"><button class="button primary" data-experience="demo">进入演示</button><button class="button" data-experience="start">开始使用</button></div><small>示例会明确标记，随时可以一键清除。演示无需调用AI。</small>';
  api.app.classList.add('first-run');api.app.querySelector('.page-head').after(box);
 }
 function today(){
  if(api.page!=='dashboard'||api.app.querySelector('.daily-home'))return;
  const items=api.getState().tasks.filter(DHTime.actionable).sort((a,b)=>(a.dueAt||a.dueDate||'9999').localeCompare(b.dueAt||b.dueDate||'9999')).slice(0,3);if(!items.length)return;
  const actions=items.map(t=>{const next=DHPlanner.summary(t)?.next,minutes=next?.minutes||Math.round(t.estimatedHours*60)||0;return {t,next,minutes};});
  const box=document.createElement('section');box.className='panel today-actions';box.innerHTML=`<div class="panel-head"><h2>今天先做什么</h2><small>${actions.reduce((n,x)=>n+x.minutes,0)} 分钟已知估时 · 未估时项另计</small></div>${actions.map(({t,next,minutes})=>`<div class="today-action"><div><button class="task-title" data-action="detail" data-id="${e(t.id)}">${e(t.title)}</button><p>${e(next?.title||t.checklist.find(c=>!c.done)?.text||'先核对要求并安排第一步')} · ${minutes?'估计'+minutes+'分钟':'耗时待填写'}</p><small>${e(DHTime.label(t))}</small></div></div>`).join('')}`;api.app.querySelector('.stats')?.after(box);
 }
 function evidence(){
  if(api.page!=='capture'||!api.capture.source?.text)return;
  const source=api.capture.source.text,parts=source.match(/[^。！？\n]+[。！？]?/g)||[source];
  for(const card of api.app.querySelectorAll('[data-draft]')){const task=api.capture.drafts.find(t=>t.id===card.dataset.draft);if(!task)continue;
   const indices=parts.map((s,i)=>({s,i})).filter(({s})=>s.includes(task.dateText)&&task.dateText||s.includes(task.title)||task.evidence?.includes(s.trim()));
   const details=document.createElement('details');details.className='source-proof';details.innerHTML=`<summary>原文证据${indices.length?'：第'+indices.map(x=>x.i+1).join('、')+'句':'：展开核对'} <span class="tag ${task.dateConfirmed?'done':'medium'}">${task.dateConfirmed?'已核实':task.timeEvidence?.inferred?'推断值待确认':'待核实'}</span></summary><p>${parts.map((s,i)=>`${indices.some(x=>x.i===i)?'<mark>':''}<span class="muted">${i+1}. </span>${e(s)}${indices.some(x=>x.i===i)?'</mark>':''}`).join('<br>')}</p>`;card.append(details);
  }
 }
 function radar(){
  if(api.page!=='radar')return;const tasks=api.getState().tasks.filter(DHTime.actionable),box=document.createElement('section');box.className='panel risk-visual';
  const groups=[[],[],[],[]];for(const t of tasks){const date=(t.dueAt||t.dueDate||'').slice(0,10),near=date&&date<=DHPlanner.add(DHTime.today(),3),missing=t.checklist.filter(x=>!x.done).length;groups[(near?0:2)+(missing>=2?0:1)].push(t);}
  box.innerHTML=`<div class="panel-head"><h2>截止紧迫度 × 剩余准备量</h2><small>按日期分组；待确认日期不计算小时倒计时</small></div><div class="risk-quadrants">${['近期截止 · 准备较多','近期截止 · 准备较少','较远或待核实 · 准备较多','较远或待核实 · 准备较少'].map((s,i)=>`<section><h3>${s}</h3>${groups[i].map(t=>`<button class="button text compact" data-action="detail" data-id="${e(t.id)}">${e(t.title)}${!t.dateConfirmed?' · 待确认':''}</button>`).join('')||'<p class="muted small">暂无任务</p>'}</section>`).join('')}</div>`;api.app.querySelector('.stats-mini')?.after(box);
 }
 function notify(message,title='Deadline Hunter',taskId=''){
  document.querySelector('#localReminder')?.remove();const box=document.createElement('aside');box.id='localReminder';box.setAttribute('role','alert');box.innerHTML=`<strong>${e(title)}</strong><p>${e(message)}</p><div class="actions">${taskId?`<button class="button compact" data-action="detail" data-id="${e(taskId)}">查看任务</button>`:''}<button class="button compact" data-experience="dismiss">知道了</button></div>`;document.body.append(box);
  if(get('dh-local-reminders')==='on'&&'Notification' in window&&Notification.permission==='granted')navigator.serviceWorker?.getRegistration('/').then(reg=>reg?reg.showNotification(title,{body:message,tag:'dh-local-'+taskId}):new Notification(title,{body:message})).catch(()=>{});
 }
 function tick(now=Date.now()){
  if(!api||get('dh-local-reminders')!=='on')return;
  for(const t of api.getState().tasks){if(t.demo||!t.dateConfirmed||!['unsubmitted','overdue'].includes(t.executionStatus)||!t.dueAt)continue;const minutes=(DHTime.epoch(t.dueAt)-now)/60000;if(minutes<=0||minutes>1440)continue;const stage=[30,60,180,720,1440].find(x=>minutes<=x),key='dh-reminder:'+t.id+':'+t.dueAt+':'+stage;if(get(key))continue;
   for(const passed of [1440,720,180,60,30].filter(x=>x>=stage))set('dh-reminder:'+t.id+':'+t.dueAt+':'+passed,'1');notify(`截止还有约${Math.ceil(minutes)}分钟，请核对准备与提交状态。`,t.title,t.id);break;
  }
 }
 function reminders(){
  if(api.page!=='settings')return;const box=document.createElement('section');box.className='panel';box.id='local-reminder-settings';box.innerHTML=`<h2>页面本地提醒</h2><p class="small muted">24小时、12小时、3小时、1小时、30分钟前提醒。仅限已确认准确截止、尚未提交的任务；演示数据不触发。</p><div class="notice">网页保持打开时可用。系统通知需授权；关闭网页后不会继续本地计时，后台标签页和休眠可能延迟。</div><div class="actions"><button class="button primary" data-experience="enable-reminders">${get('dh-local-reminders')==='on'?'本地提醒已开启':'开启本地提醒'}</button><button class="button" data-experience="test-reminder">测试弹窗</button><button class="button" data-experience="stop-reminders">关闭本地提醒</button></div>`;api.app.querySelector('.page-head').after(box);
 }
 function mount(ctx){api=ctx;ctx.app.classList.remove('first-run');welcome();today();radar();evidence();reminders();
  if(ctx.getState().tasks.some(t=>t.demo)){const banner=document.createElement('div');banner.className='demo-banner';banner.innerHTML='<span>当前包含演示数据，所有示例均已标记</span><div class="actions"><button class="button compact" data-experience="tour">60秒演示导览</button><button class="button compact" data-action="clear-demo">一键清除演示</button></div>';ctx.app.prepend(banner);}
 }
 let tourIndex=0;
 const tourSteps=[['dashboard','工作台：每条任务都有真实日期和状态；示例仅用于演示。','.today-actions'],['capture','通知→任务：这是预录示例回放，不消耗AI额度。可展开候选核对原文；真实识别需连接AI。','#dropzone'],['changes','变更对比：核对新旧证据，由你决定是否接受延期。','.change-card'],['tasks','任务中心：大任务有自己的执行计划与进度。','.simple-task-list'],['calendar','日历：确定日期与待确认的建议日期都可见。','.calendar-grid'],['radar','风险：按截止紧迫度和准备量确定优先顺序。','.risk-visual'],['tasks','计划：点击任务详情制定个性计划；完成由你勾选，绝不自动提交。','.simple-task-list']];
 function stopTour(){document.querySelector('#tourCoach')?.remove();document.querySelector('#tourSpotlight')?.remove();showing=false;}
 async function step(){const [route,text,selector]=tourSteps[tourIndex];location.hash=route;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(tourIndex===1)api.prepareDemoCapture();document.querySelector('#tourSpotlight')?.remove();const target=document.querySelector(selector);if(target){target.scrollIntoView({block:'center'});const rect=target.getBoundingClientRect(),spot=document.createElement('div');spot.id='tourSpotlight';Object.assign(spot.style,{top:Math.max(0,rect.top-5)+'px',left:Math.max(0,rect.left-5)+'px',width:Math.min(innerWidth,rect.width+10)+'px',height:Math.min(innerHeight-140,rect.height+10)+'px'});document.body.append(spot);}document.querySelector('#tourCoach')?.remove();const coach=document.createElement('aside');coach.id='tourCoach';coach.innerHTML=`<strong>演示导览 ${tourIndex+1}/${tourSteps.length} · 示例数据</strong><p>${text}</p><div class="actions"><button class="button primary" data-experience="tour-next">${tourIndex===tourSteps.length-1?'完成导览':'下一步'}</button><button class="button" data-experience="tour-close">退出</button></div>`;document.body.append(coach);}
 document.addEventListener('click',async ev=>{const button=ev.target.closest('[data-experience]');if(!button)return;switch(button.dataset.experience){
  case 'start':set('dh-welcomed','1');api.app.classList.remove('first-run');document.querySelector('#welcomePanel')?.remove();break;
  case 'demo':set('dh-welcomed','1');await api.loadDemo();break;
  case 'enable-reminders':set('dh-local-reminders','on');if('Notification' in window&&isSecureContext&&Notification.permission==='default')await Notification.requestPermission();api.toast('已开启页面内提醒；网页需要保持打开');remount();tick();break;
  case 'stop-reminders':set('dh-local-reminders','off');api.toast('本地提醒已关闭');remount();break;
  case 'test-reminder':notify('这是本地提醒测试，不需要云端配置。');break;
  case 'dismiss':document.querySelector('#localReminder')?.remove();break;
  case 'tour':stopTour();showing=true;tourIndex=0;await step();break;
  case 'tour-next':if(++tourIndex>=tourSteps.length)stopTour();else await step();break;
  case 'tour-close':stopTour();break;
 }});
 function remount(){const box=document.querySelector('#local-reminder-settings');box?.remove();reminders();}
 setInterval(()=>tick(),30000);window.addEventListener('resize',()=>{if(showing)step();});
 if('serviceWorker' in navigator&&isSecureContext)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
 return {mount,tick,highlighted};
})();
