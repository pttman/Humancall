(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.taskRecovery=api;})(globalThis,function(){
  const at=value=>Date.parse(value)||0;
  const signature=task=>JSON.stringify([task.startsAt,task.scheduledDate,task.dueAt,task.dueAtIsDeadline,task.deferredUntil,task.status]);
  function nextAllowed(settings,value){
    const date=new Date(Math.max(+value,at(settings.quietUntil)));
    const minutes=(text,fallback)=>{const match=/^(\d{2}):(\d{2})$/.exec(text||fallback);return match&&+match[1]<24&&+match[2]<60?+match[1]*60+ +match[2]:minutes(fallback,fallback);};
    const start=minutes(settings.workStart,'09:00'),end=minutes(settings.workEnd,'18:00'),now=date.getHours()*60+date.getMinutes();
    if(start<=end){if(now<start)date.setHours(0,start,0,0);else if(now>end){date.setDate(date.getDate()+1);date.setHours(0,start,0,0);}}
    else if(now>end&&now<start)date.setHours(0,start,0,0);
    return date;
  }
  function recover(state,now=new Date(),id=()=>globalThis.crypto.randomUUID()){
    const settings=state.settings||{},interval=Math.max(5,Number(settings.passiveNudgeMinutes)||30)*60000;
    const today=new Date(now);today.setHours(0,0,0,0);
    const events=state.supervisionEvents||[],old=state.startupRecovery,previous=old?.tasks||{};
    const recovered=[];
    for(const task of state.tasks||[]){
      if(task.isContainer||['completed','cancelled'].includes(task.status))continue;
      const deferred=at(task.deferredUntil||(!task.dueAtIsDeadline?task.dueAt:''));
      if(deferred>now||at(task.startsAt)>now||(task.scheduledDate&&at(task.scheduledDate+'T00:00:00')>now))continue;
      const duration=Number(task.durationMinutes||task.estimatedMinutes)||0;
      const start=at(task.startsAt),inProgress=start&&duration>0&&start+duration*60000>now;
      const missed=events.filter(e=>e.taskId===task.id&&!e.sent&&at(e.scheduledAt)&&at(e.scheduledAt)<=now);
      const overdue=(!inProgress&&start&&start<now)||(deferred&&deferred<=now)||(task.dueAtIsDeadline&&at(task.dueAt)&&at(task.dueAt)<now)||(task.scheduledDate&&at(task.scheduledDate+'T00:00:00')<today);
      if(inProgress||(!overdue&&!missed.length))continue;
      const key=signature(task),elapsed=now-at(previous[task.id]?.at);
      if(previous[task.id]?.signature===key&&elapsed>=0&&elapsed<interval)continue;
      recovered.push({task,signature:key});
    }
    if(!recovered.length)return false;
    const ids=new Set(recovered.map(r=>r.task.id));
    state.supervisionEvents=events.filter(e=>e.sent||!ids.has(e.taskId)||at(e.scheduledAt)>now);
    let next=nextAllowed(settings,now);
    for(const {task} of recovered){
      const future=state.supervisionEvents.filter(e=>e.taskId===task.id&&!e.sent&&at(e.scheduledAt)>now).sort((a,b)=>at(a.scheduledAt)-at(b.scheduledAt));
      if(future.length){state.supervisionEvents=state.supervisionEvents.filter(e=>e.sent||e.taskId!==task.id||e.id===future[0].id);continue;}
      next=nextAllowed(settings,new Date(+next+interval));
      state.supervisionEvents.push({id:id(),taskId:task.id,type:'check_in',reason:'startup_recovery',scheduledAt:next.toISOString(),sent:false,createdAt:now.toISOString()});
    }
    const pending=(old&&!old.notifiedAt?old.taskIds||[]:[]);
    state.startupRecovery={id:id(),createdAt:now.toISOString(),scheduledAt:nextAllowed(settings,now).toISOString(),taskIds:[...new Set([...pending,...ids])],notifiedAt:null,tasks:{...previous,...Object.fromEntries(recovered.map(({task,signature})=>[task.id,{signature,at:now.toISOString()}]))}};
    return true;
  }
  return {recover,nextAllowed,signature};
});
