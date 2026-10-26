(function(root){
 'use strict';
 const ZONE='Asia/Shanghai',OFFSET=8*3600000;
 const statuses={unsubmitted:'未提交',submitted:'已提交',completed:'已完成',pending_review:'待批阅',overdue:'已逾期',unknown:'未知'};
 const types={absolute_datetime:'完整日期时间',date_only:'仅日期',relative:'相对日期',duration:'剩余时长',activity:'活动开始',manual:'人工填写',unknown:'无法识别',none:'无截止时间'};
 const pad=n=>String(n).padStart(2,'0');
 function dateOnly(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const [y,m,d]=value.split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d));
  return y>=1900&&y<=2200&&dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?value:'';
 }
 function valid(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return '';
  const date=dateOnly(value.slice(0,10)),h=Number(value.slice(11,13)),m=Number(value.slice(14,16));
  return date&&h<24&&m<60?value:'';
 }
 function epoch(value){return valid(value)?Date.parse(value+':00+08:00'):NaN;}
 function local(ms){const d=new Date(ms+OFFSET);return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;}
 function today(ms=Date.now()){return local(Number(ms)).slice(0,10);}
 function status(value,legacy=''){
  if(Object.hasOwn(statuses,value))return value;
  const raw=String(value||'').trim();
  if(/待批阅|待批改|待评分|已交待改/.test(raw))return 'pending_review';
  if(/未提交|未交/.test(raw))return 'unsubmitted';
  if(/已完成|已批阅|已批改/.test(raw)||raw==='done')return 'completed';
  if(/已提交|已交/.test(raw))return 'submitted';
  if(/逾期|过期/.test(raw))return 'overdue';
  return legacy==='done'?'completed':legacy==='todo'?'unsubmitted':'unknown';
 }
 function actionable(t){return ['unsubmitted','overdue','unknown'].includes(status(t.executionStatus,t.status));}
 function completed(t){return status(t.executionStatus,t.status)==='completed';}
 function duration(raw){
  if(!/剩余|还剩|剩下|倒计时/.test(raw))return null;
  const read=re=>Number(raw.match(re)?.[1]||0);
  const days=read(/(\d+(?:\.\d+)?)\s*天/),hours=read(/(\d+(?:\.\d+)?)\s*(?:小时|时(?!间))/),minutes=read(/(\d+(?:\.\d+)?)\s*(?:分钟|分(?!钟?数))/);
  if(!/\d/.test(raw)||(!days&&!hours&&!minutes))return null;
  return {minutes:days*1440+hours*60+minutes,precision:/\d\s*(?:分钟|分)/.test(raw)?'分钟':'小时或天取整，误差可能更大',approximate:true};
 }
 function classify(raw,t={}){
  if(duration(raw))return 'duration';
  if(/明天|后天|今天|下周|本周|这周|月底/.test(raw))return 'relative';
  if(t.dueAt&&valid(t.dueAt))return 'absolute_datetime';
  if(t.startsAt&&!t.dueAt&&!t.dueDate)return 'activity';
  if(t.dueDate||/\d{1,2}月\d{1,2}[日号]|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(raw))return 'date_only';
  return raw?'unknown':'none';
 }
 function resolve(task,baseAt='',baseSource='用户手动核实的截图拍摄时间'){
  const raw=String(task.timeEvidence?.raw||task.dateText||'').trim(),type=classify(raw,task),d=duration(raw);
  const evidence={raw,type,timezone:ZONE,baseAt:'',baseSource:'未提供可靠截图时间',method:'未推算',inferred:false,precision:'未知',confirmed:false,verification:'pending',...task.timeEvidence,raw,type,timezone:ZONE};
  let dueAt=valid(task.dueAt)||'',dueDate=dateOnly(task.dueDate)||'',deadlineKind=task.deadlineKind|| (dueAt?'datetime':dueDate?'date':'pending');
  if(type==='duration'||type==='relative'){
   dueAt='';dueDate='';deadlineKind='pending';evidence.baseAt=valid(baseAt)||'';evidence.baseSource=evidence.baseAt?baseSource:'未提供可靠截图时间';evidence.confirmed=false;
   if(evidence.baseAt){
    const base=epoch(evidence.baseAt);evidence.inferred=true;evidence.verification='estimated';
    if(d){dueAt=local(base+d.minutes*60000);deadlineKind='datetime';evidence.method=`截图时间 + ${d.minutes}分钟（${ZONE}）`;evidence.precision=d.precision;}
    else {
     const day=new Date(base+OFFSET);let offset=null;
     if(/明天/.test(raw))offset=1;else if(/后天/.test(raw))offset=2;else if(/今天/.test(raw))offset=0;
     const week=raw.match(/(下周|本周|这周)([一二三四五六日天])/);
     if(week){const weekday=(day.getUTCDay()+6)%7,target='一二三四五六日'.indexOf(week[2]==='天'?'日':week[2]);offset=(week[1]==='下周'?7:0)-weekday+target;}
     if(/月底/.test(raw)){const end=new Date(Date.UTC(day.getUTCFullYear(),day.getUTCMonth()+1,0));dueDate=`${end.getUTCFullYear()}-${pad(end.getUTCMonth()+1)}-${pad(end.getUTCDate())}`;}
     else if(offset!==null)dueDate=local(base+offset*86400000).slice(0,10);
     if(dueDate){deadlineKind='date';evidence.method=`根据已确认截图日期解析“${raw}”；下周按下一自然周（周一开始）`;evidence.precision=/晚上|下午|上午|中午/.test(raw)?'时段不等于具体时刻，仍需核实':'仅日期，具体时刻未知';}
    }
   }else{evidence.method='缺少截图完整日期和时刻，禁止按系统当前时间推算';evidence.verification='pending';}
  }else if(type==='date_only'){
   if(!dueDate){const m=raw.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);if(m)dueDate=dateOnly(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);}
   if(!dueAt)deadlineKind=dueDate?'date':'pending';
   evidence.method='保留原文日期，不补23:59；缺少年份不补当前年';evidence.precision='仅日期';evidence.verification=evidence.confirmed?'date_only':'pending';
  }else if(type==='absolute_datetime'){evidence.method=evidence.method==='未推算'?'通知原文完整日期与时刻':evidence.method;evidence.precision='分钟';}
  else if(type==='activity'){deadlineKind=task.deadlineKind==='pending'?'pending':'none';evidence.method='活动开始时间与截止时间分开保存';}
  if(task.deadlineKind==='none'){dueAt='';dueDate='';deadlineKind='none';evidence.verification='none';}
  return {...task,dueAt,dueDate,deadlineKind,timeEvidence:evidence,dateConfirmed:evidence.confirmed===true};
 }
 function label(t){
  if(t.deadlineKind==='none')return '无截止时间';
  if(t.dueAt)return t.dueAt.replace('T',' ')+(t.timeEvidence?.inferred?'（推算值）':'')+(t.dateConfirmed?'':' · 待核实');
  if(t.dueDate)return t.dueDate+'（仅日期）'+(t.dateConfirmed?'':' · 待核实');
  return (t.dateText?`${t.dateText} · `:'')+'待核实';
 }
 const api={ZONE,statuses,types,dateOnly,valid,epoch,local,today,status,actionable,completed,duration,classify,resolve,label};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DHTime=api;
})(globalThis);
