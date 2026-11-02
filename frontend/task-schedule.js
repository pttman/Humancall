(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.taskSchedule=api;})(globalThis,function(){
 const deferredAt=task=>task.deferredUntil||(!task.dueAtIsDeadline?task.dueAt:'')||'';
 const available=(task,now=new Date())=>Boolean(task&&!task.isContainer&&!['inbox','completed','cancelled'].includes(task.status)&&(!task.startsAt||new Date(task.startsAt)<=now)&&(!['meeting','appointment'].includes(task.kind)||task.startsAt)&&(!deferredAt(task)||new Date(deferredAt(task))<=now));
 const postponement=(task,value)=>task?.dueAtIsDeadline?{deferredUntil:value}:{dueAt:value,deferredUntil:value};
 return {deferredAt,available,postponement};
});
