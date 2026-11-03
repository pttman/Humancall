const {test}=require('node:test'),assert=require('node:assert/strict');
const audio=require('../../frontend/speech-audio.js');
const mono=()=>({numberOfChannels:1,sampleRate:1000,length:3,getChannelData:()=>Float32Array.from([0.75,-0.5,0.25])});

test('首句前加1秒静音，第一帧到最后一帧语音完整保留，不裁剪或淡入首字',async()=>{
  const bytes=await audio.encodeWav(mono()).arrayBuffer(),view=new DataView(bytes);
  assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');assert.equal(view.getUint32(24,true),1000);assert.equal(view.getUint32(40,true),(1000+3)*2);
  for(let frame=0;frame<1000;frame++)assert.equal(view.getInt16(44+frame*2,true),0);
  assert.equal(view.getInt16(44+1000*2,true),Math.round(0.75*32767));assert.equal(view.getInt16(44+1001*2,true),-16384);assert.equal(view.getInt16(44+1002*2,true),Math.round(0.25*32767));
});

test('后续段同样预留1秒设备启动缓冲，双声道顺序与采样时长保持正确',async()=>{
  const source={numberOfChannels:2,sampleRate:1000,length:2,getChannelData:channel=>Float32Array.from(channel?[0.25,-0.75]:[0.5,-1])};
  const prepared=await audio.prepare(new Blob(['original']),{partIndex:1,createDecoder:()=>({decodeAudioData:async()=>source})});
  const view=new DataView(await prepared.arrayBuffer());assert.equal(view.getUint16(22,true),2);assert.equal(view.getUint32(40,true),(1000+2)*4);
  for(let frame=0;frame<1000;frame++)for(let channel=0;channel<2;channel++)assert.equal(view.getInt16(44+(frame*2+channel)*2,true),0);
  const start=44+1000*4;assert.equal(view.getInt16(start,true),Math.round(0.5*32767));assert.equal(view.getInt16(start+2,true),Math.round(0.25*32767));assert.equal(view.getInt16(start+4,true),-32768);assert.equal(view.getInt16(start+6,true),-24576);
});

test('解码使用完整音频，解码期间取消后不再准备迟到的音频',async()=>{
  const original=new Blob(['original-head-and-tail']);let resolve;
  const controller=new AbortController();const prepared=audio.prepare(original,{signal:controller.signal,createDecoder:()=>({decodeAudioData:async bytes=>{assert.equal(new TextDecoder().decode(bytes),'original-head-and-tail');return new Promise(r=>resolve=r);}})});
  while(!resolve)await new Promise(r=>setImmediate(r));controller.abort();resolve(mono());await assert.rejects(prepared,error=>error.name==='AbortError');
  const later=await audio.prepare(original,{partIndex:1,createDecoder:()=>({decodeAudioData:async()=>mono()})});assert.equal(new DataView(await later.arrayBuffer()).getUint32(40,true),1003*2);
});
