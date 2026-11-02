(() => {
  const create=(tag,className,html)=>{const el=document.createElement(tag);el.className=className;el.innerHTML=html;return el;};
  let profileReturnFocus=null,profileSaving=false,momentBusy=false,momentTimer,lastLocalAttempt=0,feedOpen=false;
  const profileModal=create('div','modal hidden',`<div class="modal-backdrop" data-close-companion></div><section class="modal-card companion-card" role="dialog" aria-modal="true" aria-labelledby="companionName" tabindex="-1"><button type="button" class="icon-button companion-close" aria-label="关闭人物资料" data-close-companion>×</button><div class="companion-cover"></div><div class="companion-profile"><img id="companionFace" data-avatar-role="assistant" alt="助手头像" /><div><h2 id="companionName"></h2><span class="companion-ai-label">AI 伙伴</span><span id="companionTone" class="companion-tone"></span></div></div><p id="companionSignature" class="companion-signature"></p><div class="companion-about"><h3>关于我</h3><p id="companionBio"></p></div><button type="button" id="companionMomentLink" class="companion-moment-link"><span>瞬笺<small id="companionLatestMoment">还没有动态，陪伴慢慢发生。</small></span><span aria-hidden="true">›</span></button><div class="companion-profile-actions"><button type="button" id="editCompanionButton" class="secondary">编辑人物资料</button><button type="button" id="companionChatButton" class="primary">发消息</button></div><form id="companionForm" class="settings-form" hidden><div id="companionIdentityEditor"></div><label>人物介绍<textarea id="companionBioInput" rows="4" maxlength="1200" placeholder="介绍性格、表达习惯，以及希望如何相处"></textarea></label><label>个性签名<input id="companionSignatureInput" maxlength="100" /></label><div id="companionToneEditor"></div><details id="companionPromptDetails"><summary>角色提示词 · 进阶编辑</summary><div id="companionPromptEditor"></div></details><label class="checkbox-label"><input type="checkbox" id="companionMomentsInput" /> 偶尔发瞬笺</label><p class="settings-section-copy">聊得多，就多发一点。把对话里的情绪和梗，变成随手发的碎碎念；仅你可见，聊天活跃时每天最多八条。</p><div class="modal-actions"><button type="button" id="cancelCompanionEdit" class="secondary">取消编辑</button><button type="submit" id="saveCompanionButton" class="primary">保存资料</button></div></form><div id="companionStatus" class="form-status" role="status"></div></section>`);
  profileModal.id='companionModal';document.body.append(profileModal);
  let selfReturnFocus=null,selfSaving=false;
  const selfModal=create('div','modal hidden',`<div class="modal-backdrop" data-close-self></div><section class="modal-card self-profile-card" role="dialog" aria-modal="true" aria-labelledby="selfProfileTitle"><div class="modal-header"><div><h2 id="selfProfileTitle">我的资料</h2><p>换个头像，也换个好心情。</p></div><button type="button" class="icon-button" data-close-self aria-label="关闭我的资料">×</button></div><form id="selfProfileForm" class="settings-form"><div id="selfIdentityEditor"></div><p class="settings-section-copy">昵称与头像会显示在聊天中。</p><div class="modal-actions"><button type="button" class="secondary" data-close-self>关闭</button><button type="submit" id="saveSelfProfileButton" class="primary">保存资料</button></div><div id="selfProfileStatus" class="form-status" role="status"></div></form></section>`);selfModal.id='selfProfileModal';document.body.append(selfModal);
  const assistantCard=$('#assistantNameInput').closest('.identity-card');$('#companionIdentityEditor').append(assistantCard);
  $('#selfIdentityEditor').append($('#userNameInput').closest('.identity-card'));
  $('#userNameInput').closest('label').firstChild.textContent='我的昵称';
  $('#companionToneEditor').append($('#toneInput').closest('label'));
  $('#companionPromptEditor').append($('#systemPromptInput').closest('label'));
  $('#systemPromptInput').closest('label').firstChild.textContent='当前语气的角色提示词';
  identitySection.innerHTML='<div class="settings-section-title">个人资料</div><p class="settings-section-copy">点击聊天头像，也可以查看和编辑双方资料。</p>';
  const selfEntry=create('button','companion-settings-link','<span>我的昵称与头像</span><span>查看我的资料 ›</span>');selfEntry.type='button';identitySection.append(selfEntry);selfEntry.addEventListener('click',()=>{closeSettings();openSelf();});
  const personEntry=create('button','companion-settings-link','<span>AI 伙伴的介绍、语气与头像</span><span>查看人物资料 ›</span>');personEntry.type='button';identitySection.append(personEntry);
  personEntry.addEventListener('click',()=>{closeSettings();openProfile();});
  const selfRail=create('button','rail-brand companion-user-rail','<img data-avatar-role="user" alt="" />');selfRail.type='button';selfRail.dataset.openUser='';selfRail.title='我的资料';selfRail.setAttribute('aria-label','查看我的资料');$('.rail-brand').replaceWith(selfRail);
  const headerAvatar=create('button','companion-header-avatar companion-avatar-button','<img data-avatar-role="assistant" alt="" />');headerAvatar.type='button';headerAvatar.dataset.openCompanion='';headerAvatar.setAttribute('aria-label','查看人物资料');$('.chat-heading').prepend(headerAvatar);
  $('#contactAvatarImage').parentElement.title='点击查看人物资料';
  const momentNav=create('button','rail-button','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m12 4 4 8-4 8-4-8Z"/></svg><i id="momentUnread" class="moment-unread" hidden></i>');momentNav.id='momentsNavButton';momentNav.type='button';momentNav.title='瞬笺';momentNav.setAttribute('aria-label','瞬笺');$('#tasksNavButton').after(momentNav);
  const feed=create('section','moments-view',`<header class="moments-heading"><div><h2>瞬笺</h2><p>- 日常碎记</p></div><button type="button" id="backToChatButton" class="secondary">返回聊天</button></header><div class="moments-scroll"><div class="moments-cover"><span id="momentsCoverSignature"></span></div><button type="button" class="moments-owner" data-open-companion><strong id="momentsOwnerName"></strong><img id="momentsOwnerAvatar" data-avatar-role="assistant" alt="查看人物资料" /></button><div id="momentFeed" class="moment-feed"></div><p class="moments-footnote">有路可奔赴，有片刻可栖</p></div>`);feed.id='momentsView';feed.hidden=true;$('.main-column').append(feed);
  function render(){
    const identity=window.chatProfile.get(state.settings),person=window.companion.get(state.settings);
    selfRail.querySelector('img').src=identity.userAvatar;
    $('#companionName').textContent=identity.assistantName;$('#companionFace').src=identity.assistantAvatar;$('#companionSignature').textContent=person.assistantSignature;$('#companionBio').textContent=person.assistantBio;$('#companionTone').textContent=state.settings.tone||'老板模式';headerAvatar.querySelector('img').src=identity.assistantAvatar;
    $('#momentsOwnerName').textContent=identity.assistantName;$('#momentsOwnerAvatar').src=identity.assistantAvatar;$('#momentsCoverSignature').textContent='奔赴既定的安排，也接住偶然的瞬间';
    const moments=[...(state.moments||[])].reverse(),latest=moments[0],visibleMoments=moments.filter(m=>!window.recordBook.past(m.createdAt)),ownLatest=visibleMoments.find(m=>(m.friendId||'zhixu')===(state.activeFriendId||'zhixu'));
    $('#companionLatestMoment').textContent=ownLatest?.content||'还没有动态，陪伴慢慢发生。';
    $('#momentUnread').hidden=!latest||feedOpen||Date.parse(latest.createdAt)<=Date.parse(state.momentsSeenAt||0);
    window.momentUI?.render();
  }
  function showChat(){feedOpen=false;feed.hidden=true;$('.chat-card').hidden=false;momentNav.classList.remove('is-active');momentNav.removeAttribute('aria-current');$('#chatNavButton').classList.add('is-active');$('#chatNavButton').setAttribute('aria-current','page');render();}
  function openFeed(id,friendId=null){
    window.momentUI?.prepare(id,friendId);
    if(!profileModal.classList.contains('hidden'))closeProfile();
    toggleTaskPanel(false);feedOpen=true;feed.hidden=false;$('.chat-card').hidden=true;momentNav.classList.add('is-active');momentNav.setAttribute('aria-current','page');$('#chatNavButton').classList.remove('is-active');$('#chatNavButton').removeAttribute('aria-current');state.momentsSeenAt=now();render();save().catch(error=>showToast(error.message));
    requestAnimationFrame(()=>{const target=id?document.getElementById('moment-'+id):null;if(target)target.scrollIntoView({block:'center'});else $('.moments-scroll').scrollTop=0;$('#backToChatButton').focus();});
  }
  async function loadDraft(){
    openProfileSettings(state.settings);const person=window.companion.get(state.settings);$('#companionBioInput').value=person.assistantBio;$('#companionSignatureInput').value=person.assistantSignature;$('#companionMomentsInput').checked=person.momentsEnabled;
    defaultTonePrompts=await window.humanDispatch.getTonePrompts();promptDrafts={...defaultTonePrompts,...state.settings.tonePrompts};activePromptTone=state.settings.tone||'老板模式';if(!state.settings.tonePrompts&&state.settings.systemPrompt)promptDrafts[activePromptTone]=state.settings.systemPrompt;$('#toneInput').value=activePromptTone;$('#systemPromptInput').value=promptDrafts[activePromptTone]||'';
  }
  function openProfile(){
    if(chatClearing||selfSaving)return;if(!selfModal.classList.contains('hidden'))closeSelf();profileReturnFocus=document.activeElement;render();$('#companionForm').hidden=true;$('#companionStatus').textContent='';profileModal.classList.remove('hidden');$('.app-shell').inert=true;profileModal.querySelector('[data-close-companion].icon-button').focus();
  }
  function closeProfile(){if(profileSaving)return;profileModal.classList.add('hidden');$('#companionForm').hidden=true;$('.app-shell').inert=false;if(profileReturnFocus?.isConnected)profileReturnFocus.focus({preventScroll:true});}
  function openSelf(){
    if(chatClearing||profileSaving)return;if(!profileModal.classList.contains('hidden'))closeProfile();selfReturnFocus=document.activeElement;openProfileSettings(state.settings);$('#selfProfileStatus').textContent='';selfModal.classList.remove('hidden');$('.app-shell').inert=true;selfModal.querySelector('[data-close-self].icon-button').focus();
  }
  function closeSelf(){if(selfSaving)return;selfModal.classList.add('hidden');$('.app-shell').inert=false;if(selfReturnFocus?.isConnected)selfReturnFocus.focus({preventScroll:true});else selfRail.focus({preventScroll:true});}
  $('#selfProfileForm').addEventListener('submit',async event=>{
    event.preventDefault();if(selfSaving)return;if(avatarLoads||agentBusy){$('#selfProfileStatus').textContent=avatarLoads?'头像正在处理，请稍候。':'请等待当前消息处理完毕。';return;}
    const previous={userName:state.settings.userName,userAvatar:state.settings.userAvatar};selfSaving=true;$('#saveSelfProfileButton').disabled=true;
    try{const identity=window.chatProfile.get({...state.settings,userName:$('#userNameInput').value,userAvatar:profileDraft.userAvatar});Object.assign(state.settings,{userName:identity.userName,userAvatar:identity.userAvatar});await save();renderAll();$('#selfProfileStatus').textContent='资料已保存。';selfModal.querySelector('[data-close-self].icon-button').focus();}catch(error){Object.assign(state.settings,previous);$('#selfProfileStatus').textContent='保存失败：'+error.message;}finally{selfSaving=false;$('#saveSelfProfileButton').disabled=false;}
  });
  selfModal.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSelf();}
    if(event.key==='Tab'){const nodes=[...selfModal.querySelectorAll('button,input')].filter(el=>!el.disabled&&el.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  });
  $('#editCompanionButton').addEventListener('click',async()=>{if(agentBusy){$('#companionStatus').textContent='等这条消息处理完，就可以编辑资料了。';return;}try{await loadDraft();$('#companionForm').hidden=false;$('#companionStatus').textContent='';$('#assistantNameInput').focus();}catch(error){$('#companionStatus').textContent='暂时无法打开编辑：'+error.message;}});
  $('#cancelCompanionEdit').addEventListener('click',()=>{$('#companionForm').hidden=true;$('#companionStatus').textContent='';$('#editCompanionButton').focus();});
  $('#companionForm').addEventListener('submit',async event=>{
    event.preventDefault();if(profileSaving)return;if(agentBusy||avatarLoads){$('#companionStatus').textContent=avatarLoads?'头像正在处理，请稍候。':'请等待当前消息处理完毕。';return;}
    const previous=structuredClone(state.settings);profileSaving=true;$('#saveCompanionButton').disabled=true;
    try{
      promptDrafts[activePromptTone]=$('#systemPromptInput').value.trim()||defaultTonePrompts[activePromptTone]||'';const tone=$('#toneInput').value;
      const identity=window.chatProfile.get({...state.settings,assistantName:$('#assistantNameInput').value,assistantAvatar:profileDraft.assistantAvatar});
      Object.assign(state.settings,{assistantName:identity.assistantName,assistantAvatar:identity.assistantAvatar,...window.companion.get({assistantBio:$('#companionBioInput').value,assistantSignature:$('#companionSignatureInput').value,momentsEnabled:$('#companionMomentsInput').checked}),tone,tonePrompts:{...defaultTonePrompts,...promptDrafts},systemPrompt:promptDrafts[tone]||defaultTonePrompts[tone]});
      await save();$('#companionForm').hidden=true;renderAll();$('#companionStatus').textContent='资料已保存，接下来会按新的性格和语气与你相处。';$('#editCompanionButton').focus();
    }catch(error){state.settings=previous;$('#companionStatus').textContent='保存失败：'+error.message;}finally{profileSaving=false;$('#saveCompanionButton').disabled=false;}
  });
  $('#companionChatButton').addEventListener('click',()=>{closeProfile();showChat();$('#chatInput').focus();});
  $('#companionMomentLink').addEventListener('click',()=>openFeed(undefined,state.activeFriendId||'zhixu'));momentNav.addEventListener('click',()=>openFeed());$('#backToChatButton').addEventListener('click',()=>{showChat();$('#chatInput').focus();});
  for(const button of [$('#chatNavButton'),$('#activeConversation')])button.addEventListener('click',event=>{if(event.target.closest('#contactAvatarImage,.contact-avatar'))return;showChat();});
  document.addEventListener('click',async event=>{
    if(event.target.closest('[data-close-self]'))closeSelf();
    if(event.target.closest('[data-open-user]')){event.preventDefault();openSelf();}
    if(event.target.closest('[data-close-companion]'))closeProfile();
    const avatar=event.target.closest('[data-open-companion],#contactAvatarImage,.contact-avatar');if(avatar){event.preventDefault();event.stopPropagation();const friendId=avatar.dataset.friendId||avatar.closest('[data-friend-id]')?.dataset.friendId||state.activeFriendId||'zhixu';if(friendId!==(state.activeFriendId||'zhixu')&&!await window.friendsUI.select(friendId))return;openProfile();}
    const moment=event.target.closest('[data-open-moments]');if(moment)openFeed(moment.dataset.openMoments);
  });
  profileModal.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeProfile();}
    if(event.key==='Tab'){const focusable=[...profileModal.querySelectorAll('button,input,textarea,select,summary')].filter(el=>!el.disabled&&el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  });
  for(const id of ['restorePromptButton','restoreAllPromptsButton','assistantAvatarReset'])$('#'+id).addEventListener('click',()=>{$('#companionStatus').textContent='已恢复默认，保存资料后生效。';});
  $('#toneInput').addEventListener('change',()=>{$('#companionStatus').textContent='已切换语气，保存资料后生效。';});
  new MutationObserver(()=>{if(!profileModal.classList.contains('hidden')&&!$('#companionForm').hidden)$('#companionStatus').textContent=$('#settingsStatus').textContent;if(!selfModal.classList.contains('hidden'))$('#selfProfileStatus').textContent=$('#settingsStatus').textContent;}).observe($('#settingsStatus'),{childList:true,characterData:true,subtree:true});
  function stableState(){return JSON.stringify([state.activeFriendId,state.settings,state.tasks,state.moments,state.momentActivity]);}
  async function considerMoment(){
    if(momentBusy||agentBusy||friendSwitching||supervisionBusy||chatClearing||profileSaving||selfSaving||!state.settings.momentsEnabled||!state.settings.apiKey||Date.now()-lastLocalAttempt<20*60000||document.querySelector('.modal:not(.hidden)'))return;
    const lastUser=[...state.messages].reverse().find(m=>m.role==='user');if(lastUser&&Date.now()-Date.parse(lastUser.createdAt)<90000)return;
    momentBusy=true;const before=stableState(),sourceIds=new Set(state.messages.map(m=>m.id));
    try{
      const result=await window.humanDispatch.considerMoment();if(result.activity)lastLocalAttempt=Date.now();for(let n=0;agentBusy&&n<1200&&!chatClearing&&before===stableState();n++)await new Promise(resolve=>setTimeout(resolve,250));if(agentBusy||chatClearing||before!==stableState()||(sourceIds.size&&!state.messages.some(m=>sourceIds.has(m.id))))return;
      if(!result.activity)return;
      const previous={moments:state.moments,momentActivity:state.momentActivity,messages:[...state.messages]};
      state.momentActivity=result.activity;
      if(result.moment){state.moments=[...(state.moments||[]),result.moment].slice(-100);appendMessage('assistant',result.moment.content,'瞬笺',null,{kind:'moment',momentId:result.moment.id});}
      try{await save();renderMessages();render();}catch(error){Object.assign(state,previous);throw error;}
    }catch{/* A failed background reflection stays quiet; it never blocks chatting. */}
    finally{momentBusy=false;}
  }
  function schedule(){clearTimeout(momentTimer);momentTimer=setTimeout(considerMoment,95000);}
  window.companionUI={render,schedule,showChat,openProfile,closeProfile,closeSelf,isSaving:()=>profileSaving||selfSaving};render();schedule();setInterval(considerMoment,60000);
})();
