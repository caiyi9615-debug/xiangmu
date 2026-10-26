'use strict';
window.DHAdvisor=(()=>{
 const P=window.DHPlanner,T=window.DHTime,D=window.DH;
 const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let api,current=null,project=null,questions=[],report=null,controller=null,generation=0,baseStamp='';
 const dialog=()=>document.getElementById('advisorDialog');
 function title(text){return `<div class="dialog-head"><div><h2>${e(text)}</h2><p class="small muted">项目 → 针对性追问 → 回答与时间预算 → 执行方案 → 预览确认</p></div><button type="button" class="icon-button" data-advisor-action="close" aria-label="关闭项目问答">×</button></div>`;}
 function error(text){const box=dialog().querySelector('#advisorError');if(box)box.textContent=text;}
 function busy(value,message=''){dialog().querySelectorAll('[data-advisor-request]').forEach(b=>b.disabled=value);const status=dialog().querySelector('#advisorStatus');if(status)status.textContent=message;}
 async function request(stage,data){
  controller?.abort();controller=new AbortController();const version=++generation,timer=setTimeout(()=>controller.abort(),95000);
  try{const response=await fetch('/api/advisor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stage,...data}),signal:controller.signal});let payload;try{payload=await response.json();}catch{throw new Error('规划服务未返回有效JSON，请确认部署了新版后端。');}if(version!==generation||!dialog().open)throw new Error('已取消');if(!response.ok)throw new Error(payload.error||'AI规划失败');return payload.result;}
  catch(err){if(version!==generation||!dialog().open)err.stale=true;throw err;}
  finally{clearTimeout(timer);}
 }
 function open(id=null){
  generation++;controller?.abort();
  current=id?api.getState().tasks.find(t=>t.id===id):null;
  if(id&&!current){api.toast('任务不存在，请先保存项目',true);return;}
  if(current?.plan){api.toast('该任务已有计划，请从“查看计划”修改剩余日程，避免覆盖已完成内容。',true);return;}
  baseStamp=current?.updatedAt||'';project=null;questions=[];report=null;
  dialog().innerHTML=title('先聊聊你要完成的项目')+`<form id="advisorProject"><div class="dialog-body"><div class="notice">无需先列完整子任务。告诉我想做什么，AI会根据项目提出问题，再结合你的回答拆解怎么做。内容会发送给DeepSeek，请勿填写密钥或隐私资料。</div><label class="field"><span>项目名称</span><input name="title" maxlength="150" value="${e(current?.title||'')}" placeholder="例如你真实要完成的作品、学习目标或项目" required></label><label class="field"><span>你想达成什么结果？已有的要求也可以粘贴</span><textarea name="description" rows="6" maxlength="4000" placeholder="不需要先想好所有步骤，可以只描述目标。" required>${e(current?.description||current?.evidence||'')}</textarea></label>${current?`<p class="small muted">现有截止信息：${e(T.label(current))}；本次不会改写原截止信息。</p>`:`<label class="field"><span>明确截止日期（未知可留空）</span><input name="dueDate" type="date"></label><label class="check-label"><input name="dateConfirmed" type="checkbox">这是我已确认的项目截止日期，不是推测日期</label>`}<p id="advisorError" class="error" role="alert"></p><p id="advisorStatus" class="small muted"></p><div class="actions"><button type="submit" class="button primary" data-advisor-request>让AI先问我几个问题</button><button type="button" class="button" data-advisor-action="manual">${current?'改用手动DIY':'保存项目并转手动DIY'}</button></div></div></form>`;
  dialog().querySelector('form').onsubmit=async ev=>{ev.preventDefault();if(!ev.target.reportValidity())return;project=readProject(ev.target);error('');busy(true,'正在理解项目并准备追问，尚未保存任务…');try{const result=await request('questions',{project});questions=result.questions;answerPage(result.summary);}catch(err){if(dialog().open&&!err.stale){error(err.name==='AbortError'?'问答请求已取消或超时，请重试。':err.message);busy(false);}}};
  if(!dialog().open)dialog().showModal();dialog().scrollTop=0;
 }
 function readProject(form){const f=new FormData(form);return {title:String(f.get('title')||'').trim(),description:String(f.get('description')||'').trim(),dueAt:current?.dueAt||'',dueDate:current?.dueDate||String(f.get('dueDate')||''),dateConfirmed:current?current.dateConfirmed:f.has('dateConfirmed')};}
 function answerPage(summary){
  const pref=P.rules(api.getState().plannerPreferences||{}),known=(project.dueAt||project.dueDate||'').slice(0,10);
  dialog().innerHTML=title('回答这些问题，我再帮你安排')+`<form id="advisorAnswers"><div class="dialog-body"><div class="notice"><strong>我对项目的理解（AI建议，待你核对）</strong><p>${e(summary||project.description)}</p></div><div class="advisor-questions">${questions.map((q,i)=>`<label class="field"><span>${i+1}. ${e(q.question)}</span><small class="muted">${e(q.why)}</small><textarea data-advisor-answer="${i}" rows="3" maxlength="2000" placeholder="按你的实际情况回答；不确定可以写“请给建议”"></textarea></label>`).join('')}</div><h3 class="section-title">再确认你的可用时间与硬限制</h3><p class="small muted">下面的限制不会被AI擅自放宽；回答中的其他休息要求会显示为待核对的排期建议。</p><div class="form-grid"><label class="field"><span>从哪天开始</span><input name="startDate" type="date" value="${T.today()}" required></label><label class="field"><span>${known?'希望哪天完成（不晚于已记录截止）':'计划目标日期（不当成确定截止时间）'}</span><input name="endDate" type="date" value="${e(known)}" required></label><label class="field"><span>每天可用多少分钟</span><input name="dailyMinutes" type="number" min="15" max="720" value="90" required></label><label class="field"><span>每段最多专注多少分钟</span><select name="focusMinutes">${[15,25,30,45,60,90,120].map(n=>`<option value="${n}" ${n===30?'selected':''}>${n}分钟</option>`).join('')}</select></label><label class="field"><span>执行节奏</span><select name="style"><option value="auto">根据我的回答建议</option>${Object.entries(P.styles).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label class="field"><span>留几天检查与交付</span><input name="bufferDays" type="number" min="0" max="90" value="${pref.bufferDays}" required></label><label class="field full"><span>允许安排哪些星期</span><div class="plan-weekdays">${['日','一','二','三','四','五','六'].map((name,i)=>`<label><input type="checkbox" name="workday" value="${i}" ${!pref.excludedWeekdays.includes(i)?'checked':''}>周${name}</label>`).join('')}</div></label><label class="field full"><span>额外不安排的日期（每行YYYY-MM-DD）</span><textarea name="excludedDates" rows="2">${e(pref.excludedDates.join('\n'))}</textarea></label></div><p id="advisorError" class="error" role="alert"></p><p id="advisorStatus" class="small muted"></p><div class="actions"><button type="submit" class="button primary" data-advisor-request>根据回答生成执行方案</button><button type="button" class="button" data-advisor-action="restart">修改项目描述</button><button type="button" class="button" data-advisor-action="manual">改用手动DIY</button></div><section id="advisorReport"></section></div></form>`;
  const form=dialog().querySelector('form');form.onsubmit=async ev=>{ev.preventDefault();if(!form.reportValidity())return;const f=new FormData(form),days=f.getAll('workday').map(Number),excludedDates=String(f.get('excludedDates')||'').split(/\s+/).filter(Boolean);if(excludedDates.some(d=>!T.dateOnly(d))){error('额外休息日请填写完整有效日期，每行一个。');return;}
   const responseAnswers=questions.map((q,i)=>({question:q.question,answer:form.querySelector(`[data-advisor-answer="${i}"]`).value.trim()}));
   const constraints={...Object.fromEntries(f),excludedWeekdays:[0,1,2,3,4,5,6].filter(n=>!days.includes(n)),excludedDates};
   const operation=generation+1;report=null;dialog().querySelector('#advisorReport').innerHTML='';error('');busy(true,'正在根据你的回答拆解执行步骤并检查时间容量，最长等待90秒…');
   try{report=await request('draft',{project,answers:responseAnswers,constraints});showReport();}catch(err){if(dialog().open&&!err.stale)error(err.name==='AbortError'?'规划请求已取消或超时，回答仍保留，可以重试。':err.message);}finally{if(dialog().open&&generation===operation)busy(false);}
  };
  // 回答或硬限制改变后，旧建议不能被误当作已按新条件生成。
  form.addEventListener('input',ev=>{if(ev.target.closest('#advisorReport'))return;if(report){const operation=generation+1;report=null;dialog().querySelector('#advisorReport').innerHTML='<p class="notice warn">回答或限制已改变，请重新生成方案。</p>';}});
  dialog().scrollTop=0;
 }
 function showReport(){
  const r=report,plan=r.plan,root=dialog().querySelector('#advisorReport');
  root.innerHTML=`<h3 class="section-title">给你的执行方案 · 尚未保存计划</h3><div class="notice"><strong>${e(r.summary)}</strong><p>${e(plan.guidance.reasoning)}</p><p>AI估计剩余工作量约${r.estimatedMinutes}分钟；拆成${plan.items.length}个执行步骤。已完成部分不应重做，请核对是否遗漏或误判。</p></div><p class="small muted">排期建议：${e(P.styles[plan.rules.style])}；休息星期：${plan.rules.excludedWeekdays.map(n=>'周'+'日一二三四五六'[n]).join('、')||'无'}；每日最多${plan.rules.maxPerDay}段，每段预留${plan.guidance.focusMinutes}分钟。</p>${r.errors.length?`<div class="notice warn">当前排不下或约束有冲突：${r.errors.slice(0,5).map(e).join('；')}。请修改上方回答/可用时间重新生成，或进入预览明确调整，不会自动占用休息日。</div>`:''}<details open><summary>需要核对的估计和假设</summary>${r.assumptions.map(x=>`<p class="small">${e(x)}</p>`).join('')||'<p class="small">所有AI时长都只是估计，请核对。</p>'}</details><ol class="advisor-step-list">${plan.items.map(x=>`<li><strong>${e(x.title)}</strong><small>${e(x.phase)} · 估计${x.minutes}分钟 · ${e(x.date||'待安排')}</small><p>${e(x.description)}</p></li>`).join('')}</ol><div class="actions"><button type="button" class="button primary" data-advisor-action="adopt">${current?'采用建议并编辑排期':'创建项目并编辑排期'}</button></div><p class="small muted">${current?'不会在此步覆盖原任务；':'这一步会创建普通主任务；'}执行计划仍须在下一步预览中点击确认保存。工作量进度按步骤计算，不等于工时精度或平台提交状态。</p>`;
  root.scrollIntoView({block:'start'});
 }
 async function ensureTask(){
  if(current){const live=api.getState().tasks.find(t=>t.id===current.id);if(!live||live.updatedAt!==baseStamp||live.plan)throw new Error('任务已改变或已有计划，请重新打开问答，避免覆盖。');return live.id;}
  const task=D.cleanTask({title:project.title,description:project.description,dueDate:project.dueDate,deadlineKind:project.dueDate?'date':'pending',dateConfirmed:project.dateConfirmed,executionStatus:'unsubmitted',timeEvidence:{confirmed:project.dateConfirmed,verification:project.dateConfirmed?'date_only':'pending',method:'用户在项目问答中填写的截止信息'}});
  const ok=await api.mutate(next=>next.tasks.push(task),'项目已创建；执行计划还需确认保存');if(!ok)throw new Error('项目保存未完成，请重试。');current=task;baseStamp=task.updatedAt;return task.id;
 }
 function mount(ctx){api=ctx;if(!['dashboard','tasks'].includes(ctx.page))return;const actions=ctx.app.querySelector('.page-head>.actions');if(actions&&!actions.querySelector('[data-advisor-new]'))actions.insertAdjacentHTML('afterbegin','<button type="button" class="button primary" data-advisor-new>问答规划一个项目</button>');}
 document.addEventListener('click',async ev=>{
  if(ev.target.closest('[data-advisor-new]')){open();return;}
  const opener=ev.target.closest('[data-advisor-open]');if(opener){ev.stopImmediatePropagation();open(opener.dataset.advisorOpen);return;}
  const button=ev.target.closest('[data-advisor-action]');if(!button||button.disabled)return;const action=button.dataset.advisorAction;
  if(action==='close'){dialog().close();return;}
  if(action==='restart'){const previous=project;open(current?.id||null);if(previous){const form=dialog().querySelector('#advisorProject');form.elements.title.value=previous.title;form.elements.description.value=previous.description;if(form.elements.dueDate)form.elements.dueDate.value=previous.dueDate;if(form.elements.dateConfirmed)form.elements.dateConfirmed.checked=previous.dateConfirmed;}return;}
  if(action==='adopt'){
   if(!report){error('条件已改变，请重新生成方案。');return;}button.disabled=true;const operation=generation;
   try{const id=await ensureTask();if(operation!==generation||!dialog().open)return;const plan=report.plan;dialog().close();window.DHPlannerUI.loadAdvice(id,plan);}catch(err){if(operation===generation){error(err.message);button.disabled=false;}}return;
  }
  if(action==='manual'){
   const form=dialog().querySelector('#advisorProject');if(form){if(!form.reportValidity())return;project=readProject(form);}if(!project){error('请先描述项目。');return;}
   const operation=generation;try{const id=await ensureTask();if(operation!==generation||!dialog().open)return;dialog().close();window.DHPlannerUI.open(id);}catch(err){if(operation===generation)error(err.message);}
  }
 });
 document.addEventListener('DOMContentLoaded',()=>dialog().addEventListener('close',()=>{generation++;controller?.abort();}));
 return {mount,open};
})();
