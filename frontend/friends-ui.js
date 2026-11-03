(() => {
  const primary=$('#activeConversation');primary.dataset.friendId='zhixu';
  const second=document.createElement('button');second.id='secondConversation';second.type='button';second.className='conversation-item';second.dataset.friendId='luye';
  second.innerHTML='<span class="contact-avatar"><img id="secondContactAvatarImage" data-avatar-role="assistant" data-avatar-fallback="/avatars/luye.png" src="/avatars/luye.png" alt="" /><span class="online-dot"></span></span><span class="conversation-content"><span class="conversation-line"><strong id="secondConversationName">枫言</strong><time id="secondSessionTime"></time></span><span id="secondSessionPreview" class="conversation-preview">没事也能聊两句。</span></span>';primary.after(second);
  $('#contactAvatarImage').dataset.avatarFallback='/avatars/zhixu.png';$('#contactAvatarImage').dataset.avatarRole='assistant';
  function render(){
    for(const [id,button,prefix] of [['zhixu',primary,''],['luye',second,'second']]){
      const identity=window.friends.identity(state,id),active=(state.activeFriendId||'zhixu')===id;
      const messages=active?state.messages:(state.friends?.[id]?.messages||[]),latest=messages.at(-1);
      const avatar=$(prefix?'#secondContactAvatarImage':'#contactAvatarImage'),name=$(prefix?'#secondConversationName':'#conversationDisplayName'),time=$(prefix?'#secondSessionTime':'#sessionTime'),preview=$(prefix?'#secondSessionPreview':'#sessionPreview');
      avatar.src=identity.assistantAvatar;avatar.parentElement.title='查看'+identity.assistantName+'的资料';name.textContent=identity.assistantName;
      preview.textContent=latest?.kind==='sticker'?'[表情包]':latest?.kind==='moment'?'[瞬笺] '+latest.content:latest?.content||(id==='luye'?'没事也能聊两句。':'今天有什么安排？');
      time.textContent=latest?.createdAt?formatChatTimestamp(latest.createdAt).split(' ').at(-1):'';
      button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label','与'+identity.assistantName+'聊天');
    }
    if(!chatSearchQuery&&state.activeFriendId==='luye')$('#chatContactStatus').textContent='随便聊聊 · 灵感与日常';
  }
  async function select(id){
    if(!window.friends.ids.includes(id))return false;
    if(agentBusy||supervisionBusy||chatClearing||friendSwitching||window.companionUI?.isSaving()){showToast('请等待当前操作完成，再切换朋友');return false;}
    if((state.activeFriendId||'zhixu')===id){window.companionUI?.showChat();return true;}
    const previous=structuredClone(state);friendSwitching=true;syncComposer();
    try{
      window.voiceUI?.stop();window.friends.select(state,id);window.conversationState.reconcile(state);chatSearchQuery='';$('#chatSearchInput').value='';$('#chatInput').value='';
      if(!state.messages.length){const name=window.chatProfile.get(state.settings).assistantName;appendMessage('assistant',id==='luye'?'我叫'+name+'。想聊什么都行，今天的离谱事也归我收。':'我是'+name+'，今天有什么想聊的，或需要我帮你安排的事？');}
      await save();bubbleReplyQueue.length=0;await window.humanDispatch.clearBubbles().catch(()=>{});window.companionUI?.showChat();renderAll();return true;
    }catch(error){Object.assign(state,previous);try{Object.assign(state,await window.humanDispatch.loadState());}catch{}renderAll();showToast('切换未完成：'+error.message);return false;}
    finally{friendSwitching=false;syncComposer();$('#chatInput').focus();}
  }
  for(const button of [primary,second])button.addEventListener('click',event=>{if(event.target.closest('.contact-avatar'))return;select(button.dataset.friendId);});
  window.friendsUI={render,select};render();
})();
