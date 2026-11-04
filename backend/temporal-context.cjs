// Relative dates belong to the message that introduced them, not to the day
// on which a later reply happens. Keep provider messages limited to role/content.
function dateKey(value) {
  const d=new Date(value);
  return Number.isFinite(d.getTime())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:null;
}
function stamp(value) {
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))return {recordedAt:null,note:'未记录发送时间，不得猜测其中相对日期的具体日期'};
  const next=new Date(d);next.setDate(next.getDate()+1);
  const previous=new Date(d);previous.setDate(previous.getDate()-1);
  return {recordedAt:d.toISOString(),local:d.toLocaleString('zh-CN',{hour12:false}),relativeDates:{昨天:dateKey(previous),今天:dateKey(d),明天:dateKey(next)}};
}
const rules='历史消息中的今天、明天、明早、昨天，必须以该条消息的发送日期为基准，不得重新套用当前日期。昨天说的“明天／明早”就是今天，不是再往后顺延一天；旧回复中的“明早 9:30”也要还原到原来的具体日期。涉及已有安排时先查询任务，以已保存的绝对时间和实际状态为准；已过点说明原定时间已过，不继续说“先留着明早”。没有约定具体时刻时不能凭空补 9:30。普通进度汇报（例如仍在调试环境）不等于用户同意延期、重新设截止或暂停提醒，不擅自改期或声称已静默。仅在确实需要用户决定时问一个具体问题，不复读旧承诺。';
function history(messages,text,now=new Date()) {
  const list=(messages||[]).filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string'&&!['moment','sticker'].includes(m.kind)).slice(-16);
  const last=list.at(-1),at=Date.parse(last?.createdAt);
  if(last?.role==='user'&&last.content===text&&(!Number.isFinite(at)||(now-at<=300000&&now-at>=-30000)))list.pop();
  return [...list.map(m=>({role:m.role,content:'【历史消息时间依据】'+JSON.stringify({...stamp(m.createdAt),...(m.kind==='reminder'?{kind:'主动提醒'}:{}),...(m.context?{context:Object.fromEntries(['taskId','reminderId','questionId','scheduledAt'].filter(k=>typeof m.context[k]==='string').map(k=>[k,m.context[k].slice(0,150)]))}:{})})+'\n'+m.content.slice(0,12000)})),{role:'user',content:text}];
}
function schedule(state,now=new Date()) {
  const today=dateKey(now);
  return (state.tasks||[]).filter(t=>!['completed','cancelled'].includes(t.status)&&!t.isContainer).slice(0,40).map(t=>({taskId:t.id,title:t.title,status:t.status,...(t.scheduledDate?{scheduledDate:{date:t.scheduledDate,day:t.scheduledDate===today?'今天':t.scheduledDate<today?'今天以前':'今天以后',time:'未指定具体时刻'}}:{}),...Object.fromEntries(['startsAt','dueAt','deferredUntil'].filter(key=>Number.isFinite(Date.parse(t[key]))).map(key=>[key,{...stamp(t[key]),date:dateKey(t[key]),day:dateKey(t[key])===today?'今天':dateKey(t[key])<today?'今天以前':'今天以后',elapsed:Date.parse(t[key])<now.getTime()}]))}));
}
module.exports={dateKey,stamp,rules,history,schedule};
