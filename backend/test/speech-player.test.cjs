const {test}=require('node:test'),assert=require('node:assert/strict');
const createPlayer=require('../../frontend/speech-player.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const job=(id,automatic=true)=>({messageId:id,friendId:'zhixu',parts:['第一段','第二段'],config:{volume:0.6},automatic});
function harness(request=async()=>new Blob(['audio'])){
  const audios=[],revoked=[],phases=[];
  const player=createPlayer({request,createAudio:()=>{const audio={pause(){this.paused=true;},removeAttribute(){},load(){},play(){return Promise.resolve();}};audios.push(audio);return audio;},createUrl:()=>`blob:${audios.length}`,revokeUrl:url=>revoked.push(url),onState:s=>phases.push(s)});
  return {player,audios,revoked,phases};
}
test('自动语音按消息及分段排队、不重叠、不重复，音频资源及时释放',async()=>{
  const {player,audios,revoked}=harness();assert.equal(player.enqueue(job('a')),true);assert.equal(player.enqueue(job('a')),false);player.enqueue({...job('b'),parts:['另一条']});await tick();assert.equal(audios.length,1);assert.equal(audios[0].volume,0.6);
  audios[0].onended();await tick();assert.equal(audios.length,2);audios[1].onended();await tick();assert.equal(audios.length,3);audios[2].onended();await tick();assert.equal(player.getState().phase,'idle');assert.equal(revoked.length,3);
});
test('停止会取消生成、清空队列，迟到音频不会播放；手动朗读可重新播放同一条',async()=>{
  let resolve,signal;const first=harness(async(_job,_index,s)=>{signal=s;return new Promise(r=>resolve=r);});first.player.enqueue(job('a'));first.player.enqueue(job('b'));first.player.stop();assert.equal(signal.aborted,true);resolve(new Blob(['late']));await tick();assert.equal(first.audios.length,0);assert.equal(first.player.getState().queued,0);
  const next=harness();next.player.enqueue(job('a'));await tick();next.player.enqueue({...job('a',false),parts:['重播']});await tick();assert.equal(next.audios[0].paused,true);assert.equal(next.audios.length,2);next.player.stop();assert.equal(next.revoked.length,2);
});
test('语音接口失败结束本轮播报，不产生未处理异常，也不继续请求排队音频',async()=>{
  let calls=0;const {player}=harness(async()=>{calls++;throw Error('语音服务离线');});player.enqueue(job('a'));player.enqueue(job('b'));await tick();assert.equal(calls,1);assert.equal(player.getState().phase,'error');assert.equal(player.getState().error,'语音服务离线');assert.equal(player.getState().queued,0);player.stop();assert.equal(player.getState().phase,'idle');
});

test('实际缓冲完成后才从零开始播放，准备阶段点击停止不会漏播',async()=>{
  const audios=[],revoked=[];let plays=0;
  const player=createPlayer({request:async()=>new Blob(['original']),createAudio:()=>{const audio={readyState:0,currentTime:99,pause(){},removeAttribute(){},load(){},play(){plays++;return Promise.resolve();}};audios.push(audio);return audio;},createUrl:()=> 'blob:test',revokeUrl:url=>revoked.push(url)});
  player.enqueue({...job('waiting'),parts:['一句话']});await tick();assert.equal(plays,0);assert.equal(player.getState().phase,'loading');audios[0].readyState=4;audios[0].oncanplaythrough();assert.equal(plays,1);assert.equal(audios[0].currentTime,0);audios[0].onended();await tick();
  player.enqueue({...job('cancel-wait'),parts:['另一句']});await tick();const late=audios[1].oncanplaythrough;player.stop();late();assert.equal(plays,1);assert.equal(revoked.length,2);
});

test('新增的解码准备阶段可被取消，迟到结果不会创建播放器',async()=>{
  let finish,signal,created=0;const player=createPlayer({request:async()=>new Blob(['audio']),prepareAudio:async(_blob,options)=>{signal=options.signal;return new Promise(resolve=>finish=resolve);},createAudio:()=>{created++;throw Error('Must not start');}});
  player.enqueue(job('decode'));await tick();player.stop();assert.equal(signal.aborted,true);finish(new Blob(['prepared']));await tick();assert.equal(created,0);assert.equal(player.getState().phase,'idle');
});
