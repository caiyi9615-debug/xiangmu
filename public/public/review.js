'use strict';
window.TimeReview={
  needs(task){return task.deadlineKind!=='none'&&(!task.dateConfirmed||['pending','date'].includes(task.deadlineKind));},
  open(tasks,context={}){
    const T=DHTime,D=DH,dialog=document.querySelector('#timeDialog');
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const original=structuredClone(tasks);let working=structuredClone(tasks);
    const previousBase=context.baseAt||tasks.find(t=>t.timeEvidence?.baseAt)?.timeEvidence.baseAt||'';
    return new Promise(resolve=>{
      dialog.innerHTML=`<div class="dialog-head"><div><h2>统一核实时间与任务状态</h2><p class="small muted">${tasks.length} 项 · 默认时区 Asia/Shanghai（UTC+8）</p></div></div><div class="dialog-body"><div class="notice warn">剩余时长必须基于完整截图时间。手机状态栏时刻、上传时间和文件修改时间不能作为拍摄时间。没有时间也可以保存为待核实。</div><div class="base-time"><label class="field"><span>本张截图拍摄日期与时刻（一次填写，整批共用）</span><input id="screenshotAt" type="datetime-local" value="${esc(previousBase)}"></label><label class="field"><span>基准时间来源（均需你核实）</span><select id="baseSource"><option>用户手动核实的截图拍摄时间</option><option>用户已核实的截图完整时间文字</option><option>用户已核实的EXIF辅助信息</option></select></label><button class="button" id="calculateBatch" type="button">应用截图时间并统一推算</button><p id="baseError" class="error" role="alert"></p></div><div id="timeRows"></div></div><div class="dialog-foot"><button type="button" class="button" id="skipTime">暂时跳过，待核实也可保存</button><button type="button" class="button primary" id="applyTime">应用核实信息</button></div>`;
      function rows(){dialog.querySelector('#timeRows').innerHTML=working.map((t,i)=>`<article class="time-review-row" data-row="${i}"><h3>${esc(t.title)}</h3><p class="small muted">${esc(t.course||'课程未识别')} · 原文：${esc(t.dateText||'未识别时间')}</p><p class="calculation-preview">${esc(T.label(t))}</p><p class="small muted">${esc(t.timeEvidence?.method||'待人工核实')} ${esc(t.timeEvidence?.precision||'')}</p><div class="form-grid"><label class="field"><span>截止信息方式</span><select name="deadlineKind">${[['datetime','填写准确截止日期和时刻'],['date','保留仅有日期'],['pending','标记待核实'],['none','暂时不设置截止时间']].map(([v,l])=>`<option value="${v}" ${t.deadlineKind===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field"><span>任务状态</span><select name="executionStatus">${Object.entries(T.statuses).map(([v,l])=>`<option value="${v}" ${t.executionStatus===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field"><span>准确截止时间（不填不推测）</span><input type="datetime-local" name="dueAt" value="${esc(t.dueAt)}"></label><label class="field"><span>仅日期（包含年份，不含具体时刻）</span><input type="date" name="dueDate" value="${esc(t.dueDate)}"></label></div><label class="check-label"><input type="checkbox" name="confirmed" ${t.dateConfirmed?'checked':''}>已核对本项时间依据（推算结果仍保留“推算值”标记）</label></article>`).join('');}
      function collect(){
        for(const row of dialog.querySelectorAll('[data-row]')){
          const i=Number(row.dataset.row),t=working[i],kind=row.querySelector('[name="deadlineKind"]').value;
          const dueAt=T.valid(row.querySelector('[name="dueAt"]').value)||'',dueDate=T.dateOnly(row.querySelector('[name="dueDate"]').value)||'';
          const manualChanged=dueAt!==t.dueAt||dueDate!==t.dueDate;
          t.executionStatus=row.querySelector('[name="executionStatus"]').value;t.status=t.executionStatus==='completed'?'done':'todo';
          t.deadlineKind=kind==='datetime'&&!dueAt||kind==='date'&&!dueDate?'pending':kind;
          t.dueAt=t.deadlineKind==='datetime'?dueAt:'';t.dueDate=t.deadlineKind==='date'?dueDate:'';
          const confirmed=row.querySelector('[name="confirmed"]').checked&&['datetime','date'].includes(t.deadlineKind);
          t.dateConfirmed=confirmed;t.timeEvidence={...t.timeEvidence,timezone:T.ZONE,confirmed,
            verification:t.deadlineKind==='none'?'none':confirmed?(t.deadlineKind==='date'?'date_only':'confirmed'):t.timeEvidence?.inferred&&t.dueAt?'estimated':'pending',
            ...(manualChanged?{method:'用户直接填写/核对截止信息',inferred:false,precision:t.deadlineKind==='date'?'仅日期':'分钟'}:{})};
        }
      }
      rows();
      dialog.querySelector('#timeRows').addEventListener('input',e=>{
        const row=e.target.closest('[data-row]');if(!row)return;
        if(e.target.name==='dueAt'&&e.target.value)row.querySelector('[name="deadlineKind"]').value='datetime';
        if(e.target.name==='dueDate'&&e.target.value)row.querySelector('[name="deadlineKind"]').value='date';
      });
      dialog.querySelector('#calculateBatch').onclick=()=>{
        collect();const base=T.valid(dialog.querySelector('#screenshotAt').value),source=dialog.querySelector('#baseSource').value;
        if(!base){dialog.querySelector('#baseError').textContent='请填写包含年份的完整拍摄日期和时刻；也可以跳过，或直接填写准确截止时间。';return;}
        working=working.map(t=>['duration','relative'].includes(T.classify(t.dateText,t))?D.cleanTask(T.resolve(t,base,source)):t);
        dialog.querySelector('#baseError').textContent='';rows();
      };
      dialog.querySelector('#applyTime').onclick=()=>{collect();dialog.close();resolve({tasks:working,baseAt:T.valid(dialog.querySelector('#screenshotAt').value)||''});};
      dialog.querySelector('#skipTime').onclick=()=>{collect();const kept=original.map((t,i)=>({...t,executionStatus:working[i].executionStatus,status:working[i].executionStatus==='completed'?'done':'todo'}));dialog.close();resolve({tasks:kept,baseAt:context.baseAt||'',skipped:true});};
      dialog.oncancel=()=>resolve({tasks:original,baseAt:context.baseAt||'',skipped:true});
      dialog.showModal();
    });
  }
};
