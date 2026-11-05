const temporal=require('./temporal-context.cjs');
const pick=(value,fields)=>Object.fromEntries(fields.filter(key=>value[key]!==undefined&&value[key]!=='').map(key=>[key,value[key]]));
const taskFields=['id','title','description','status','priority','projectName','parentId','isContainer','kind','startsAt','durationMinutes','dueAt','dueAtIsDeadline','deferredUntil','scheduledDate','estimatedMinutes','completedAt'];
const reminderFields=['id','title','note','nextAt','enabled','repeat','weekday','taskId','lastTriggeredAt'];
const task=value=>pick(value,taskFields),reminder=value=>pick(value,reminderFields);
function changed(before,after,view){
  const original=new Map(before.map(row=>[row.id,JSON.stringify(view(row))]));
  return after.filter(row=>original.get(row.id)!==JSON.stringify(view(row))).map(view);
}
function schedule(state,now){
  return temporal.schedule(state,now).filter(row=>Object.keys(row).length>3).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value&&typeof value==='object'&&value.recordedAt?{at:value.recordedAt,day:value.day,elapsed:value.elapsed}:value])));
}
function history(messages,text,now){
  // Keep recent turns and their date anchors; never silently clip the current request.
  const rows=temporal.history(messages,text,now),current=rows.pop(),selected=[];
  let remaining=16000;
  for(let i=rows.length-1;i>=0;i--){
    const row=rows[i],newline=row.content.indexOf('\n');
    const anchor=row.content.slice(0,newline+1),body=row.content.slice(newline+1);
    const budget=Math.min(4000,remaining-anchor.length);
    if(budget<200)break;
    const content=anchor+(body.length>budget?body.slice(0,budget-16)+'\n[历史内容已截短]':body);
    selected.unshift({...row,content});remaining-=content.length;
  }
  return [...selected,current];
}
module.exports={task,reminder,changed,schedule,history};
