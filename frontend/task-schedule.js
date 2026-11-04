(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.taskSchedule=api;})(globalThis,function(){
 const deferredAt=task=>task.deferredUntil||(!task.dueAtIsDeadline?task.dueAt:'')||'';
 const available=(task,now=new Date())=>Boolean(task&&!task.isContainer&&!['inbox','completed','cancelled'].includes(task.status)&&(!task.scheduledDate||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(task.scheduledDate)||new Date(task.scheduledDate+'T00:00:00')<=now)&&(!task.startsAt||new Date(task.startsAt)<=now)&&(!['meeting','appointment'].includes(task.kind)||task.startsAt)&&(!deferredAt(task)||new Date(deferredAt(task))<=now));
 const postponement=(task,value)=>task?.dueAtIsDeadline?{deferredUntil:value}:{dueAt:value,deferredUntil:value};
 const explicitTomorrow=value=>/^(?:我(?:想|要)?|那就|那|就)?(?:把|将)?(?:(?:这个|这项|当前)(?:任务|工作)?|任务|工作)?(?:先)?(?:(?:推迟到|延期到|推到)明天(?:再做)?|明天(?:再)?做)(?:吧|好了)?[。.!！]?$/.test(String(value||'').trim());
 return {deferredAt,available,postponement,explicitTomorrow};
});
