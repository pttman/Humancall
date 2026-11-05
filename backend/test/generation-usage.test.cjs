const {test,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const core=require('../core.cjs');
const {generationFetch,settingsWithUsage,counts}=require('../generation-usage.cjs');
const rice=require('../../frontend/rice-book.js');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'humancall-rice-'));
let index=0;
beforeEach(()=>core.configureDataDirectory(path.join(directory,String(index++))));
after(()=>fs.rmSync(directory,{recursive:true,force:true}));
const settings=()=>settingsWithUsage({model:'test-model',apiKey:'secret',baseUrl:'https://example.test'},{kind:'chat',friendId:'luye'});
const request=async(s,usage,purpose='agent')=>{const res=await generationFetch('https://example.test',{}, {settings:s,purpose,fetchImpl:async()=>Response.json({usage})});return res.json();};

test('usage handles provider formats and never counts reasoning/cache details twice',()=>{
  assert.deepEqual(counts({prompt_tokens:100,completion_tokens:40,total_tokens:140,prompt_tokens_details:{cached_tokens:80},completion_tokens_details:{reasoning_tokens:20}}),{input:100,output:40,total:140});
  assert.deepEqual(counts({input_tokens:10,output_tokens:5}),{input:10,output:5,total:15});
  assert.equal(counts({total_tokens:-2}).total,null);assert.equal(counts({prompt_tokens:10}).total,null);
  assert.equal(counts({total_tokens:0}).total,0);
});
test('multi-round and auxiliary calls group by operation, survive stale saves and backups',async()=>{
  const stale=core.readState(),s=settings();
  await request(s,{prompt_tokens:100,completion_tokens:40});await request(s,{total_tokens:25},'sticker');
  await request(settings(),undefined);
  const saved=core.writeState(stale);assert.equal(saved.generationUsage.length,3);
  const groups=rice.groups(core.readState().generationUsage);assert.equal(groups.length,2);
  assert.equal(groups[0].total,165);assert.equal(groups[0].calls.length,2);assert.equal(groups[1].unknown,1);
  assert.match(rice.amount(groups[1].total,groups[1].unknown),/已知使用 0 token.*用量未返回/);
  assert.ok(!JSON.stringify(saved.generationUsage).includes('secret'));
  const imported=core.normalizeImportedState(JSON.parse(JSON.stringify(saved)),saved);
  core.writeState(imported);assert.equal(core.readState().generationUsage.length,3);
});
test('failed requests retain reported usage; network failure stays unknown',async()=>{
  const s=settings();
  const res=await generationFetch('https://example.test',{}, {settings:s,purpose:'agent',fetchImpl:async()=>Response.json({usage:{total_tokens:12}},{status:500})});await res.json();
  await assert.rejects(generationFetch('https://example.test',{}, {settings:s,purpose:'agent',fetchImpl:async()=>{throw Error('network');}}));
  const rows=core.readState().generationUsage;assert.equal(rows.length,2);assert.equal(rows[0].total,12);assert.equal(rows[1].total,null);assert.ok(rows.every(r=>r.status==='error'));
});
test('chat retries remain one operation including consumed tokens in invalid responses',async t=>{
  const original=global.fetch;t.after(()=>global.fetch=original);
  const initial=core.readState();initial.settings={...initial.settings,apiKey:'secret',baseUrl:'https://example.test',model:'test-model',stickersEnabled:false};core.writeState(initial);
  let calls=0;global.fetch=async()=>Response.json({usage:{total_tokens:10},choices:++calls===1?[]:[{message:{tool_calls:[{id:'finish',type:'function',function:{name:'finish',arguments:'{"reply":"你好"}'}}]}}]});
  const result=await require('../chat-service.cjs').chat({text:'你好'});assert.equal(result.reply,'你好');
  const groups=rice.groups(core.readState().generationUsage);assert.equal(groups.length,1);assert.equal(groups[0].calls.length,2);assert.equal(groups[0].total,20);
});
test('parallel operations keep friend and task attribution separate',async()=>{
  const a=settingsWithUsage({model:'a'},{kind:'check_in',friendId:'zhixu',taskId:'task-a'}),b=settings();
  await Promise.all([request(a,{total_tokens:7}),request(b,{total_tokens:9})]);
  const groups=rice.groups(core.readState().generationUsage);assert.equal(groups.length,2);assert.equal(groups.find(g=>g.taskId==='task-a').total,7);assert.equal(groups.find(g=>g.friendId==='luye').total,9);
});
