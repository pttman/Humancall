(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.speechAudio=api;})(globalThis,function(){
  const LEAD_MS=1000,PART_LEAD_MS=1000;
  // Padding is added before the original samples, never by skipping, fading,
  // duplicating text, or trimming the first spoken syllable.
  function encodeWav(audio,{leadMs=LEAD_MS}={}){
    const channels=audio.numberOfChannels,rate=audio.sampleRate,length=audio.length;
    if(![1,2].includes(channels)||!Number.isFinite(rate)||rate<=0||!Number.isInteger(length)||length<=0||length>rate*180)throw Error('语音音频格式或长度无效');
    const padding=Math.round(rate*Math.max(0,leadMs)/1000),frames=padding+length,dataBytes=frames*channels*2;
    const buffer=new ArrayBuffer(44+dataBytes),view=new DataView(buffer),write=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
    write(0,'RIFF');view.setUint32(4,36+dataBytes,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,rate,true);view.setUint32(28,rate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,dataBytes,true);
    const samples=Array.from({length:channels},(_,index)=>audio.getChannelData(index));
    let offset=44+padding*channels*2;
    for(let frame=0;frame<length;frame++)for(let channel=0;channel<channels;channel++){
      const value=Math.max(-1,Math.min(1,samples[channel][frame]));view.setInt16(offset,Math.round(value*(value<0?32768:32767)),true);offset+=2;
    }
    return new Blob([buffer],{type:'audio/wav'});
  }
  function aborted(signal){if(signal?.aborted)throw new DOMException('语音播放已取消','AbortError');}
  async function prepare(blob,{signal,partIndex=0,createDecoder}={}){
    aborted(signal);
    const factory=createDecoder||(()=>{const Decoder=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;if(!Decoder)throw Error('当前环境不支持语音解码');return new Decoder(1,1,24000);});
    const decoder=factory();
    const bytes=await blob.arrayBuffer();aborted(signal);
    let audio;try{audio=await decoder.decodeAudioData(bytes);}catch{throw Error('语音音频解码失败，请重新试听');}
    aborted(signal);
    return encodeWav(audio,{leadMs:partIndex===0?LEAD_MS:PART_LEAD_MS});
  }
  return {LEAD_MS,PART_LEAD_MS,encodeWav,prepare};
});
