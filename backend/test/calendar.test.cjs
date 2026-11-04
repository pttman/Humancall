const {test}=require('node:test'),assert=require('node:assert/strict');
const calendar=require('../../frontend/calendar-data.js'),schedule=require('../../frontend/task-schedule.js'),temporal=require('../temporal-context.cjs'),{createSupervisor}=require('../supervisor.cjs');
const at=(y,m,d,h=10,min=0)=>new Date(y,m-1,d,h,min).toISOString();
const base=()=>({tasks:[],reminders:[],messages:[],friends:{},settings:{}});

test('日历按本地自然日构建周一开头的42格，跨月年和闰日不偏移',()=>{
 assert.equal(calendar.parseDay('2026-02-29'),null);assert.equal(calendar.parseDay('2028-02-29').getDate(),29);assert.equal(calendar.parseDay('2026-11-31'),null);
 const days=calendar.monthDays(2026,10);assert.equal(days.length,42);assert.equal(days[0].key,'2026-10-26');assert.equal(days[6].key,'2026-11-01');assert.equal(days.filter(d=>d.inMonth).length,30);
 assert.equal(calendar.shift('2026-12-31',1),'2027-01-01');assert.equal(calendar.shift('2028-03-01',-1),'2028-02-29');
 assert.equal(calendar.dayKey(at(2026,11,4,0,2)),'2026-11-04');assert.equal(calendar.dayKey(at(2026,11,4,23,59)),'2026-11-04');
});

test('任务按安排、开始截止及跨午夜会议归日，创建时间不等于安排时间',()=>{
 const state=base();state.tasks=[{id:'all-day',title:'全天任务',scheduledDate:'2026-11-04',status:'planned'}, {id:'span',title:'跨天工作',startsAt:at(2026,11,3),dueAt:at(2026,11,5,18),dueAtIsDeadline:true}, {id:'meeting',title:'午夜结束',kind:'meeting',startsAt:at(2026,11,4,23),durationMinutes:60}, {id:'overnight',title:'跨夜会议',kind:'meeting',startsAt:at(2026,11,4,23,30),durationMinutes:60}, {id:'inbox',title:'时间待定',createdAt:at(2026,11,4),status:'inbox'}, {id:'parent',title:'总任务',isContainer:true,scheduledDate:'2026-11-04'}];
 const ids=key=>calendar.dayEntries(state,key).map(e=>e.id);
 assert.deepEqual(new Set(ids('2026-11-04')),new Set(['all-day','span','meeting','overnight']));assert.ok(ids('2026-11-05').includes('overnight'));assert.ok(!ids('2026-11-05').includes('meeting'));assert.ok(!ids('2026-11-06').includes('span'));
 assert.equal(calendar.dayEntries(state,'2026-11-04').find(e=>e.id==='all-day').at,'');assert.deepEqual(calendar.unscheduled(state).map(e=>e.id),['inbox']);
});

test('延期归新的安排日；只有完成日期的旧任务仍能查到历史，未排期不混入今天',()=>{
 const state=base();state.tasks=[{id:'later',title:'延期事项',startsAt:at(2026,11,3),deferredUntil:at(2026,11,6),status:'planned'}, {id:'done',title:'已经结束',status:'completed',completedAt:at(2026,11,2)}, {id:'unknown',title:'无日期',status:'inbox'}];
 assert.equal(calendar.dayEntries(state,'2026-11-03').length,0);assert.equal(calendar.dayEntries(state,'2026-11-06')[0].id,'later');assert.equal(calendar.dayEntries(state,'2026-11-02')[0].id,'done');assert.deepEqual(calendar.unscheduled(state).map(e=>e.id),['unknown']);
});

test('每天每周提醒向未来展开，过去仅展示真实触发记录，不臆造历史',()=>{
 const state=base();state.reminders=[{id:'daily',title:'喝水',nextAt:at(2026,11,4,14),repeat:'daily',enabled:true},{id:'weekly',title:'周会',nextAt:at(2026,11,4,9),repeat:'weekly',enabled:true},{id:'off',title:'停用',nextAt:at(2026,11,4,16),repeat:'daily',enabled:false}];
 const ids=key=>calendar.dayEntries(state,key).map(e=>e.id);
 assert.equal(ids('2026-11-03').length,0);assert.deepEqual(new Set(ids('2026-11-04')),new Set(['daily','weekly','off']));assert.deepEqual(ids('2026-11-05'),['daily']);assert.deepEqual(new Set(ids('2026-11-11')),new Set(['weekly','daily']));
 state.friends.luye={messages:[{id:'notice',context:{reminderId:'daily',scheduledAt:at(2026,11,3,14)}}]};assert.equal(calendar.dayEntries(state,'2026-11-03')[0].occurred,true);
 state.reminders[0].lastTriggeredAt=at(2026,11,3,14);assert.equal(calendar.dayEntries(state,'2026-11-03').length,1,'同一发生日不因多处记录重复');
});

test('未来的全天事项不会提前自动执行或被后台督促，Agent 不会凭空补时刻',async()=>{
 const now=new Date(2026,10,4,10),task={id:'future',title:'明天的事',scheduledDate:'2026-11-05',status:'planned'};
 assert.equal(schedule.available(task,now),false);assert.equal(schedule.available(task,new Date(2026,10,5,0,1)),true);
 const state={...base(),tasks:[task],settings:{apiKey:'synthetic',notifications:true,workStart:'09:00',workEnd:'18:00'}};let calls=0;
 const supervisor=createSupervisor({readState:()=>state,clock:()=>now,agent:async()=>{calls++;throw Error('不应调用');}});assert.equal((await supervisor()).suppressed,true);assert.equal(calls,0);
 const info=temporal.schedule(state,now)[0].scheduledDate;assert.equal(info.date,'2026-11-05');assert.equal(info.day,'今天以后');assert.equal(info.time,'未指定具体时刻');
});

test('跨午夜延迟触发的提醒按原定日期记录，不在实际触发日重复一条',()=>{
 const state=base();state.reminders=[{id:'late',title:'昨晚提醒',enabled:false,lastTriggeredAt:at(2026,11,5,0)}];state.messages=[{context:{reminderId:'late',scheduledAt:at(2026,11,4,23,59)}}];
 assert.equal(calendar.dayEntries(state,'2026-11-04').length,1);assert.equal(calendar.dayEntries(state,'2026-11-05').length,0);
});
