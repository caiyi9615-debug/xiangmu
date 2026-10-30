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
  if(t.timeEvidence?.type==='activity')return 'activity';
  if(t.dueAt&&valid(t.dueAt))return 'absolute_datetime';
  if(t.startsAt&&!t.dueAt&&!t.dueDate)return 'activity';
  if(t.dueDate||/\d{1,2}月\d{1,2}[日号]|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(raw))return 'date_only';
  return raw?'unknown':'none';
 }
 function partialDate(raw,reference=today()){
  const m=raw.match(/(?:(\d{4})\s*[年\-/.]\s*)?(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*[日号]?/);
  if(!m)return null;
  let year=Number(m[1]),inferred=!year;
  if(inferred){const y=Number(reference.slice(0,4)),month=Number(reference.slice(5,7));year=Number(m[2])>=8?(month>=8?y:y-1):(month>=8?y+1:y);const candidate=Date.parse(`${year}-${pad(m[2])}-${pad(m[3])}T00:00Z`);if(candidate<Date.parse(reference+'T00:00Z')-90*86400000)year++;}
  const date=dateOnly(`${year}-${pad(m[2])}-${pad(m[3])}`);if(!date)return null;
  const clock=raw.match(/(?:[日号]|\s|截止|提交|前|至)?\s*([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/)||raw.match(/([01]?\d|2[0-3])\s*[点时](?:\s*([0-5]?\d)\s*分?)?/);
  let hour=clock?Number(clock[1]):null;if(clock&&/下午|晚上/.test(raw)&&hour<12)hour+=12;
  return {date,clock:clock?`${pad(hour)}:${pad(clock[2]||0)}`:'',inferred,reference};
 }
 function resolve(task,baseAt='',baseSource='用户手动核实的截图拍摄时间',reference=today()){
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
  }else if(type==='date_only'||type==='absolute_datetime'){
   const parsed=partialDate(raw,reference);
   if(parsed&&(!task.dateConfirmed||!dueAt&&!dueDate)){
    if(parsed.clock){dueAt=parsed.date+'T'+parsed.clock;dueDate='';deadlineKind='datetime';}else{dueDate=parsed.date;dueAt='';deadlineKind='date';}
    evidence.yearInferred=parsed.inferred;evidence.yearReference=parsed.inferred?reference:'';
    evidence.inferred=parsed.inferred;evidence.precision=parsed.clock?'分钟':'仅日期';
    evidence.method=parsed.inferred?`缺少年份：按当前学年与参考日期${reference}建议年份，超过90天的历史候选顺延一年；原文月日和时刻保留，须确认年份`:'保留通知原文日期与时刻，不补23:59';
    evidence.verification=evidence.confirmed?(parsed.clock?'confirmed':'date_only'):'pending';
   }
   if(!parsed){
   if(!dueDate){const m=raw.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);if(m)dueDate=dateOnly(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);}
   if(!dueAt)deadlineKind=dueDate?'date':'pending';
   evidence.method=dueAt?'通知原文完整日期与时刻':'保留原文日期，不补23:59';evidence.precision=dueAt?'分钟':'仅日期';evidence.verification=evidence.confirmed?'date_only':'pending';
   }
  }
  else if(type==='activity'){deadlineKind=task.deadlineKind==='pending'?'pending':'none';evidence.method='活动开始时间与截止时间分开保存';}
  if(task.deadlineKind==='none'){dueAt='';dueDate='';deadlineKind='none';evidence.verification='none';}
  return {...task,dueAt,dueDate,deadlineKind,timeEvidence:evidence,dateConfirmed:evidence.confirmed===true};
 }
 function label(t){
  if(t.deadlineKind==='none')return '无截止时间';
  const mark=t.timeEvidence?.yearInferred?'（年份推断）':t.timeEvidence?.inferred?'（推算值）':'';
  if(t.dueAt)return t.dueAt.replace('T',' ')+mark+(t.dateConfirmed?'':' · 待核实');
  if(t.dueDate)return t.dueDate+'（仅日期）'+mark+(t.dateConfirmed?'':' · 待核实');
  return (t.dateText?`${t.dateText} · `:'')+'待核实';
 }
 const api={ZONE,statuses,types,dateOnly,valid,epoch,local,today,status,actionable,completed,duration,classify,resolve,label,partialDate};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DHTime=api;
})(globalThis);
