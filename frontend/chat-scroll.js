/* Keep reading position independent of rerenders and delayed media layout. */
window.createChatScroll = function({container, button, onJump}) {
  let following=true, scope=null, known=new Set(), unread=new Set(), anchor=null;
  let frame=0, adjusting=false, observedFlow=null;
  const nearBottom=()=>container.scrollHeight-container.clientHeight-container.scrollTop<=48;
  const visible=()=>container.clientHeight>0;
  function rememberAnchor(){
    const edge=container.getBoundingClientRect().top;
    const row=Array.from(container.querySelectorAll('[data-message-id]')).find(el=>el.getBoundingClientRect().bottom>edge);
    return row?{id:row.dataset.messageId,offset:row.getBoundingClientRect().top-edge,top:container.scrollTop}:{top:container.scrollTop};
  }
  function updateButton(){
    button.hidden=unread.size===0||following;
    button.textContent=unread.size>1?'有 '+unread.size+' 条新回复 ↓':'有新回复 ↓';
    button.style.bottom=Math.max(12,container.parentElement.getBoundingClientRect().bottom-container.getBoundingClientRect().bottom+12)+'px';
  }
  function applyPosition(){
    if(!visible())return;
    adjusting=true;
    if(following){container.scrollTop=container.scrollHeight;unread.clear();}
    else if(anchor){
      const row=Array.from(container.querySelectorAll('[data-message-id]')).find(el=>el.dataset.messageId===anchor.id);
      if(row)container.scrollTop+=row.getBoundingClientRect().top-container.getBoundingClientRect().top-anchor.offset;
      else container.scrollTop=anchor.top;
    }
    updateButton();
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{adjusting=false;if(!following)anchor=rememberAnchor();});
  }
  const resize=new ResizeObserver(applyPosition);
  resize.observe(container);
  container.addEventListener('scroll',()=>{
    if(adjusting||!visible())return;
    following=nearBottom();
    if(following)unread.clear();
    anchor=following?null:rememberAnchor();
    updateButton();
  },{passive:true});
  // A wheel/keyboard gesture interrupts following immediately, even between layout frames.
  container.addEventListener('wheel',event=>{
    if(event.deltaY<0){adjusting=false;cancelAnimationFrame(frame);following=false;anchor=rememberAnchor();}
  },{passive:true});
  container.addEventListener('keydown',event=>{
    if(['PageUp','Home','ArrowUp'].includes(event.key)){adjusting=false;cancelAnimationFrame(frame);following=false;anchor=rememberAnchor();}
  });
  button.addEventListener('click',()=>{following=true;unread.clear();anchor=null;onJump();applyPosition();});
  return {
    beforeRender(nextScope,searching=false){
      if(scope!==nextScope){scope=nextScope;following=!searching;known=new Set();unread.clear();anchor=searching?{top:0}:null;}
      else if(!following)anchor=rememberAnchor();
    },
    afterRender(messages){
      const added=messages.filter(m=>!known.has(m.id));
      if(known.size&&added.some(m=>m.role==='user'))following=true;
      if(known.size&&!following)added.filter(m=>m.role==='assistant').forEach(m=>unread.add(m.id));
      known=new Set(messages.map(m=>m.id));
      for(const id of unread)if(!known.has(id))unread.delete(id);
      const flow=container.querySelector('.chat-flow');
      if(observedFlow!==flow){if(observedFlow)resize.unobserve(observedFlow);observedFlow=flow;if(flow)resize.observe(flow);}
      applyPosition();
      requestAnimationFrame(applyPosition);
    },
    toLatest(){following=true;unread.clear();anchor=null;applyPosition();},
  };
};
