(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.calendarData=api;})(globalThis,function(){
  const pad=n=>String(n).padStart(2,'0');
  function parseDay(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d,12);return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?date:null;}
  function dayKey(value){if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return parseDay(value)?value:'';if(!value)return '';const d=new Date(value);return Number.isFinite(d.getTime())?`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`:'';}
  function shift(value,days){const d=parseDay(value);if(!d)return '';d.setDate(d.getDate()+days);return dayKey(d);}
  function monthDays(year,month){const first=new Date(year,month,1,12),start=new Date(first);start.setDate(1-(first.getDay()+6)%7);return Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return {key:dayKey(d),day:d.getDate(),inMonth:d.getMonth()===first.getMonth()&&d.getFullYear()===first.getFullYear()};});}
  function taskRange(task){
    const startAt=dayKey(task.startsAt),planned=dayKey(task.scheduledDate),deferred=dayKey(task.deferredUntil||(!task.dueAtIsDeadline?task.dueAt:'')),deadline=task.dueAtIsDeadline===true?dayKey(task.dueAt):'';
    let start=startAt||planned||deferred||deadline;
    if(deferred&&(!start||deferred>start)&&!['completed','cancelled'].includes(task.status))start=deferred;
    if(!start)start=task.status==='completed'?dayKey(task.completedAt||task.updatedAt):task.status==='cancelled'?dayKey(task.cancelledAt||task.updatedAt):'';
    if(!start)return null;
    let end=deadline&&deadline>=start?deadline:start;
    if(startAt===start&&['meeting','appointment'].includes(task.kind)&&Number(task.durationMinutes)>0){const meetingEnd=dayKey(new Date(Date.parse(task.startsAt)+Number(task.durationMinutes)*60000-1));if(meetingEnd>end)end=meetingEnd;}
    return {start,end};
  }
  function historyFor(state){
    const map=new Map(),messages=[...(state.messages||[]),...Object.values(state.friends||{}).flatMap(friend=>friend.messages||[])];
    for(const message of messages){const id=message.context?.reminderId,at=message.context?.scheduledAt;if(!id||!dayKey(at))continue;if(!map.has(id))map.set(id,new Map());map.get(id).set(dayKey(at),at);}
    for(const reminder of state.reminders||[]){if(!dayKey(reminder.lastTriggeredAt)||map.get(reminder.id)?.size)continue;if(!map.has(reminder.id))map.set(reminder.id,new Map());map.get(reminder.id).set(dayKey(reminder.lastTriggeredAt),reminder.lastTriggeredAt);}
    return map;
  }
  function reminderOccurrence(reminder,key,history){
    const recorded=history.get(reminder.id)?.get(key);if(recorded)return {at:recorded,occurred:true};
    const anchor=reminder.nextAt,base=dayKey(anchor);if(!base)return null;
    if(key===base)return {at:anchor,occurred:false};
    if(reminder.enabled===false||key<base||!['daily','weekly'].includes(reminder.repeat))return null;
    const date=parseDay(key),original=new Date(anchor);if(reminder.repeat==='weekly'&&date.getDay()!==original.getDay())return null;
    date.setHours(original.getHours(),original.getMinutes(),original.getSeconds(),original.getMilliseconds());return {at:date.toISOString(),occurred:false};
  }
  function dayEntries(state,key,history=historyFor(state)){
    if(!parseDay(key))return [];
    const tasks=(state.tasks||[]).filter(t=>!t.isContainer).flatMap(item=>{const range=taskRange(item);if(!range||key<range.start||key>range.end)return [];const at=dayKey(item.startsAt)===key?item.startsAt:range.end===key&&item.dueAtIsDeadline&&dayKey(item.dueAt)===key?item.dueAt:'';return [{type:'task',id:item.id,item,at,continued:key>range.start,deadline:Boolean(item.dueAtIsDeadline&&dayKey(item.dueAt)===key)}];});
    const reminders=(state.reminders||[]).flatMap(item=>{const occurrence=reminderOccurrence(item,key,history);return occurrence?[{type:'reminder',id:item.id,item,...occurrence}]:[];});
    return [...tasks,...reminders].sort((a,b)=>(a.at?Date.parse(a.at):0)-(b.at?Date.parse(b.at):0)||String(a.item.title).localeCompare(String(b.item.title),'zh-CN'));
  }
  function unscheduled(state){return (state.tasks||[]).filter(item=>!item.isContainer&&!['completed','cancelled'].includes(item.status)&&!taskRange(item)).map(item=>({type:'task',id:item.id,item,at:''}));}
  return {parseDay,dayKey,shift,monthDays,taskRange,historyFor,dayEntries,unscheduled};
});
