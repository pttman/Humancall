const conversationState=require('../frontend/conversation-state.js');
const {deferredAt}=require('../frontend/task-schedule.js');
const { randomUUID } = require('node:crypto');
const { runAgent, fingerprint } = require('./agent.cjs');
function settingsFor(state) { return { ...state.settings, apiKey:state.settings.apiKey || process.env.MODEL_API_KEY || '', baseUrl:process.env.MODEL_BASE_URL || state.settings.baseUrl, model:process.env.MODEL_NAME || state.settings.model }; }
function snapshot(state) { const normalized=structuredClone(state);conversationState.reconcile(normalized);return fingerprint(normalized) + JSON.stringify(normalized.messages?.at(-1) || null); }
function withinWorkHours(settings, now) {
  const minutes = now.getHours()*60+now.getMinutes();
  const parse = (value, fallback) => { const m=String(value || fallback).match(/^(\d{1,2}):(\d{2})$/); return m?Number(m[1])*60+Number(m[2]):0; };
  const start=parse(settings.workStart,'09:00'), end=parse(settings.workEnd,'18:00');
  return start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;
}
function createSupervisor({ readState, agent = runAgent, clock = () => new Date() }) {
  const lastAt = new Map(); let busy=false;
  return async ({taskId, force=false, reason='passive'}={}) => {
    if (busy) return {suppressed:true,retry:true};
    const state=structuredClone(readState());conversationState.reconcile(state);const now=clock(), settings=settingsFor(state);
    if (!settings.notifications || (!force && (state.pendingConfirmation || new Date(settings.quietUntil || 0)>now || !withinWorkHours(settings,now) || (reason==='passive' && settings.passiveNudgesEnabled===false)))) return {suppressed:true,retry:true};
    const pending=state.agentContext?.pendingQuestion;
    const inProgress=t=>!force && ['meeting','appointment'].includes(t.kind) && t.startsAt && t.durationMinutes && now>=new Date(t.startsAt) && now.getTime()<Date.parse(t.startsAt)+t.durationMinutes*60000;
    const eligible=t=>(force||!t.scheduledDate||new Date(t.scheduledDate+'T00:00:00')<=now)&&!inProgress(t) &&!t.isContainer && !['completed','cancelled'].includes(t.status) && (!deferredAt(t) || new Date(deferredAt(t))<=now) && (!t.startsAt || force || new Date(t.startsAt).getTime()-now.getTime()<=15*60000);
    const task=taskId ? state.tasks.find(t=>t.id===taskId && eligible(t)) : state.tasks.find(t=>t.id===pending?.taskId && eligible(t)) || state.tasks.filter(t=>t.startsAt && eligible(t)).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))[0] || state.tasks.find(t=>t.status==='active' && eligible(t)) || state.tasks.find(eligible);
    if (!task) return {suppressed:true};
    // A confirmed appointment in progress needs no repeated progress interrogation.
    const interval=Math.max(5,Number(settings.passiveNudgeMinutes)||30)*60000;
    if (!force && (now.getTime()-(lastAt.get(task.id) || 0)<interval || (pending?.askedAt && now-new Date(pending.askedAt)<interval))) return {suppressed:true,retry:true};
    busy=true; lastAt.set(task.id,now.getTime()); const before=snapshot(state);
    try {
      let result;
      if (settings.apiKey) {
        try {
          result=await agent({settings,state,messages:state.messages || [],text:'这是一次后台检查，请结合目标事项、最近对话及待回答问题，决定安静等待还是提出一个具体有用的问题。',mode:'check_in',context:{taskId:task.id,reason,task},maxSteps:5});
        } catch { return {suppressed:true,unavailable:true,retry:true}; }
      } else result={reply:`关于“${task.title}”，现在有什么需要补充或调整的安排吗？`,source:'local'};
      if (snapshot(readState())!==before) return {suppressed:true,retry:true};
      if (result.silent) return {suppressed:true};
      const question=result.question;
      if(question&&question.taskId!==task.id)return {suppressed:true};
      return {suppressed:false,kind:'check_in',bubbleId:randomUUID(),title:question?'想确认一下':'关于你的安排',body:question?.question || result.reply,taskId:task.id,taskTitle:task.title,questionId:question?.id,question,sticker:result.sticker,source:result.source,quickActions:(result.quickReplies || question?.quickReplies || []).map(message=>({label:message,message})),generatedAt:now.toISOString()};
    } finally {busy=false;}
  };
}
module.exports={createSupervisor,settingsFor,snapshot,withinWorkHours};
