(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.createSpeechPlayer=api;})(globalThis,function(){
  return function createSpeechPlayer({request,prepareAudio=blob=>blob,createAudio=()=>new Audio(),createUrl=blob=>URL.createObjectURL(blob),revokeUrl=url=>URL.revokeObjectURL(url),onState=()=>{}}){
    let active=null,queue=[];const seen=new Set();let status={phase:'idle'};
    const emit=value=>{status=value;onState({...value,queued:queue.length});};
    function stop(){queue=[];const previous=active;active=null;if(previous){previous.controller.abort();previous.cancel?.();}emit({phase:'idle'});}
    function playAudio(blob,token){return new Promise((resolve,reject)=>{
      if(active!==token)return resolve();
      const audio=createAudio(),url=createUrl(blob);let settled=false,started=false,readyTimer;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(readyTimer);audio.oncanplaythrough=null;audio.onended=null;audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load();revokeUrl(url);token.cancel=null;error?reject(error):resolve();};
      const fail=error=>finish(Error(error.name==='NotAllowedError'?'请点击名字旁的声音图标开始播放':'音频播放失败，请重试'));
      const start=()=>{if(started||settled)return;started=true;clearTimeout(readyTimer);audio.oncanplaythrough=null;if(active!==token)return finish();try{audio.currentTime=0;emit({phase:'playing',...token.meta});Promise.resolve(audio.play()).catch(fail);}catch(error){fail(error);}};
      token.cancel=()=>finish();audio.volume=token.job.config.volume;audio.preload='auto';audio.onended=()=>finish();audio.onerror=()=>finish(Error('音频无法播放，请检查音色或重新试听'));audio.oncanplaythrough=start;audio.src=url;
      if(typeof audio.readyState!=='number'||audio.readyState>=4)start();
      else{readyTimer=setTimeout(()=>finish(Error('音频准备超时，请重新播放')),10000);audio.load();if(audio.readyState>=4)start();}
    });}
    async function run(token){
      try{
        for(let index=0;index<token.job.parts.length;index++){
          emit({phase:'loading',...token.meta});
          const blob=await request(token.job,index,token.controller.signal);
          if(active!==token)return;
          const prepared=await prepareAudio(blob,{signal:token.controller.signal,partIndex:index});
          if(active!==token)return;
          await playAudio(prepared,token);if(active!==token)return;
        }
      }catch(error){if(active!==token||token.controller.signal.aborted)return;queue=[];active=null;emit({phase:'error',...token.meta,error:error.message||'语音暂时不可用'});return;}
      if(active===token){active=null;if(queue.length)pump();else emit({phase:'idle'});}
    }
    function pump(){if(active||!queue.length)return;const job=queue.shift();const token={job,controller:new AbortController(),meta:{messageId:job.messageId,friendId:job.friendId,preview:job.preview===true,automatic:job.automatic===true}};active=token;void run(token);}
    function enqueue(job){
      if(!job.parts?.length)return false;
      const key=job.friendId+':'+job.messageId;
      if(job.automatic){if(seen.has(key))return false;seen.add(key);if(seen.size>500)seen.delete(seen.values().next().value);if(queue.length>=10)queue.shift();}
      else stop();
      queue.push(job);pump();return true;
    }
    return {enqueue,stop,getState:()=>({...status,queued:queue.length})};
  };
});
