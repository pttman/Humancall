(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.conversationState=api;})(globalThis,function(){
 const isOpenTask=task=>Boolean(task&&!task.isContainer&&!['completed','cancelled'].includes(task.status));
 const isOpenReminder=reminder=>Boolean(reminder&&reminder.enabled!==false);
 const userTurns=state=>(state.messages||[]).filter(m=>m.role==='user').length;
 function isQuestionLive(state,q){
  if(!q)return false;
  if(q.taskId)return isOpenTask((state.tasks||[]).find(t=>t.id===q.taskId));
  if(q.reminderId)return isOpenReminder((state.reminders||[]).find(r=>r.id===q.reminderId));
  return q.scope==='new_request'&&Number.isInteger(q.originUserTurn)&&userTurns(state)<=q.originUserTurn+1;
 }
 function reconcile(state){
  let changed=false;const q=state.agentContext?.pendingQuestion;
  if(q&&!isQuestionLive(state,q)){state.agentContext.pendingQuestion=null;changed=true;}
  if(Array.isArray(state.supervisionEvents)){
   const events=state.supervisionEvents.filter(e=>e.sent||(!e.taskId?e.type==='rest_end':isOpenTask((state.tasks||[]).find(t=>t.id===e.taskId))));
   if(events.length!==state.supervisionEvents.length){state.supervisionEvents=events;changed=true;}
  }
  if(state.pendingConfirmation?.type==='delete_task'&&!(state.tasks||[]).some(t=>t.id===state.pendingConfirmation.taskId)){state.pendingConfirmation=null;changed=true;}
  if(state.pendingConfirmation?.type==='clear_all_tasks'&&!(state.tasks||[]).length){state.pendingConfirmation=null;changed=true;}
  return changed;
 }
 function bubbleState(state){return {taskIds:(state.tasks||[]).filter(isOpenTask).map(t=>t.id),reminderIds:(state.reminders||[]).filter(isOpenReminder).map(r=>r.id),questionId:isQuestionLive(state,state.agentContext?.pendingQuestion)?state.agentContext.pendingQuestion.id:null};}
 function isBubbleLive(payload,current){if(payload.questionId&&payload.questionId!==current.questionId)return false;if(payload.kind==='check_in'&&!current.taskIds.includes(payload.taskId))return false;return true;}
 return {isOpenTask,isOpenReminder,userTurns,isQuestionLive,reconcile,bubbleState,isBubbleLive};
});
