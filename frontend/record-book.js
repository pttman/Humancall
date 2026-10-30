(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.recordBook=api;})(globalThis,function(){
  const actors=['user','zhixu','luye','unknown'];
  function actor(value){return actors.includes(value)?value:'unknown';}
  function start(now=new Date()){const d=new Date(now);d.setHours(0,0,0,0);return d.getTime();}
  function past(value,now=new Date()){const at=Date.parse(value);return Number.isFinite(at)&&at<start(now);}
  function today(value,now=new Date()){const at=Date.parse(value);return Number.isFinite(at)&&at>=start(now)&&at<start(new Date(now.getFullYear(),now.getMonth(),now.getDate()+1));}
  function taskDate(task){return task.status==='completed'?task.completedAt||task.updatedAt||task.createdAt:task.cancelledAt||task.updatedAt||task.createdAt;}
  function hiddenTask(task,now){return ['completed','cancelled'].includes(task.status)&&past(taskDate(task),now);}
  function hiddenReminder(item,now){return item.enabled===false&&past(item.lastTriggeredAt||item.updatedAt||item.nextAt||item.createdAt,now);}
  function normalize(state){for(const item of [...(state.tasks||[]),...(state.reminders||[])]){if(item.recordedBy!==undefined)item.recordedBy=actor(item.recordedBy);if(item.lastEditedBy!==undefined)item.lastEditedBy=actor(item.lastEditedBy);}return state;}
  function capture(state){return new Map([...(state.tasks||[]),...(state.reminders||[])].map(item=>[item.id,JSON.stringify(item)]));}
  function attribute(state,before,who){for(const item of [...(state.tasks||[]),...(state.reminders||[])]){if(!before.has(item.id)){item.recordedBy=actor(who);item.lastEditedBy=actor(who);}else if(before.get(item.id)!==JSON.stringify(item)){item.recordedBy=actor(item.recordedBy);item.lastEditedBy=actor(who);}}}
  return{actor,start,past,today,taskDate,hiddenTask,hiddenReminder,normalize,capture,attribute};
});
