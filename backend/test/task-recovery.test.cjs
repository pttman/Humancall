const {test}=require('node:test'),assert=require('node:assert/strict');
const {recover,nextAllowed}=require('../../frontend/task-recovery.js');
const now=new Date(2026,10,9,10),ago=new Date(2026,10,3,9).toISOString(),future=new Date(2026,10,10,9).toISOString();
const initial=()=>({settings:{notifications:true,workStart:'09:00',workEnd:'18:00',passiveNudgeMinutes:30},tasks:[],supervisionEvents:[]});
let index=0;const id=()=>String(index++);

test('startup restores missed checks including tasks with no events; preserves original task dates',()=>{
 const state=initial();state.tasks=[{id:'a',title:'旧任务',status:'planned',startsAt:ago,estimatedMinutes:60},{id:'b',title:'旧全天工作',status:'planned',scheduledDate:'2026-11-03'},{id:'c',title:'旧截止任务',status:'blocked',dueAt:ago,dueAtIsDeadline:true}];
 state.supervisionEvents=[{id:'old',taskId:'a',sent:false,scheduledAt:ago},{id:'old2',taskId:'a',sent:false,scheduledAt:ago},{id:'history',taskId:'a',sent:true,scheduledAt:ago}];
 const before=structuredClone(state.tasks);assert.equal(recover(state,now,id),true);assert.deepEqual(state.tasks,before);
 assert.deepEqual(state.startupRecovery.taskIds,['a','b','c']);assert.equal(state.startupRecovery.notifiedAt,null);
 const pending=state.supervisionEvents.filter(e=>!e.sent);assert.equal(pending.length,3);assert.ok(state.supervisionEvents.some(e=>e.id==='history'));
 assert.deepEqual(pending.map(e=>new Date(e.scheduledAt).getHours()*60+new Date(e.scheduledAt).getMinutes()),[630,660,690]);
 assert.ok(pending.every(e=>e.reason==='startup_recovery'));
});
test('completed, cancelled, containers, future dates, snoozes and in-progress meetings stay untouched',()=>{
 const state=initial();state.tasks=[{id:'done',status:'completed',startsAt:ago},{id:'cancel',status:'cancelled',dueAt:ago},{id:'parent',isContainer:true,startsAt:ago},{id:'date',status:'planned',scheduledDate:'2026-11-10'},{id:'start',status:'planned',startsAt:future},{id:'snooze',status:'planned',startsAt:ago,deferredUntil:future},{id:'meeting',kind:'meeting',status:'planned',startsAt:new Date(+now-10*60000).toISOString(),durationMinutes:60}];
 const before=structuredClone(state);assert.equal(recover(state,now,id),false);assert.deepEqual(state,before);
});
test('rapid restarts do not duplicate summary or checks; a later startup rechecks remaining tasks',()=>{
 const state=initial();state.tasks=[{id:'a',status:'planned',startsAt:ago}];recover(state,now,id);const before=structuredClone(state);
 assert.equal(recover(state,new Date(+now+60000),id),false);assert.deepEqual(state,before);
 state.startupRecovery.notifiedAt=now.toISOString();assert.equal(recover(state,new Date(+now+86400000),id),true);
 assert.notEqual(state.startupRecovery.id,before.startupRecovery.id);assert.equal(state.supervisionEvents.filter(e=>!e.sent).length,1);
});
test('existing future check is retained and duplicates are collapsed',()=>{
 const state=initial();state.tasks=[{id:'a',status:'active',startsAt:ago}];state.supervisionEvents=[{id:'keep',taskId:'a',sent:false,scheduledAt:new Date(+now+600000).toISOString()},{id:'duplicate',taskId:'a',sent:false,scheduledAt:future}];
 recover(state,now,id);assert.deepEqual(state.supervisionEvents.map(e=>e.id),['keep']);
});
test('quiet time and work hours defer both summary and recovered checks, including overnight work',()=>{
 const state=initial();state.tasks=[{id:'a',status:'planned',startsAt:ago}];state.settings.quietUntil=new Date(2026,10,9,20).toISOString();recover(state,now,id);
 assert.equal(state.startupRecovery.scheduledAt,new Date(2026,10,10,9).toISOString());assert.equal(state.supervisionEvents[0].scheduledAt,new Date(2026,10,10,9,30).toISOString());
 assert.equal(+nextAllowed({workStart:'22:00',workEnd:'06:00'},now),+new Date(2026,10,9,22));
 assert.equal(+nextAllowed({workStart:'22:00',workEnd:'06:00'},new Date(2026,10,9,2)),+new Date(2026,10,9,2));
});
test('a date-less task with an expired check is recovered, and legacy dueAt snooze stays supported',()=>{
 const state=initial();state.tasks=[{id:'a',status:'inbox'},{id:'legacy',status:'planned',dueAt:ago}];state.supervisionEvents=[{id:'lost',taskId:'a',sent:false,scheduledAt:ago}];
 recover(state,now,id);assert.deepEqual(state.startupRecovery.taskIds,['a','legacy']);
});
