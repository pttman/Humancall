(() => {
  const small = matchMedia('(max-width:760px),(max-height:600px) and (pointer:coarse)');
  const $ = selector => document.querySelector(selector);
  const nav = document.createElement('nav'); nav.className = 'mobile-nav'; nav.setAttribute('aria-label', '手机主导航');
  const icon = id => (id && $(id)?.querySelector('svg')?.outerHTML) || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg>';
  nav.innerHTML = [['friends','聊天','#chatNavButton'],['tasks','清单','#tasksNavButton'],['calendar','日历','#calendarNavButton'],['moments','瞬笺','#momentsNavButton'],['me','我','']].map(([page,label,id]) => '<button type="button" data-mobile-nav="'+page+'">'+icon(id)+'<span>'+label+'</span></button>').join('');
  document.body.append(nav);
  function page(name) { document.body.dataset.mobilePage = name; nav.querySelectorAll('button').forEach(b => { const active = b.dataset.mobileNav === (name === 'chat' ? 'friends' : name); b.classList.toggle('is-active', active); b.setAttribute('aria-current', active ? 'page' : 'false'); }); }
  const back = document.createElement('button'); back.type = 'button'; back.className = 'mobile-back'; back.textContent = '‹'; back.setAttribute('aria-label', '返回聊天列表'); $('.chat-heading').prepend(back);
  back.addEventListener('click', () => { page('friends'); $('#chatInput').blur(); });
  nav.addEventListener('click', event => { const button = event.target.closest('[data-mobile-nav]'); if (!button) return; const target = button.dataset.mobileNav; if (target !== 'tasks') window.toggleTaskPanel?.(false); if (target === 'friends') { window.companionUI?.showChat(); page('friends'); } if (target === 'tasks') { window.companionUI?.showChat(); page('tasks'); $('#tasksNavButton').click(); window.toggleTaskPanel?.(true); } if (target === 'calendar') { page('calendar'); $('#calendarNavButton').click(); } if (target === 'moments') { page('moments'); $('#momentsNavButton').click(); } if (target === 'me') { $('.companion-user-rail').click(); } });
  for (const id of ['#activeConversation','#secondConversation']) $(id)?.addEventListener('click', event => { if (small.matches && !event.target.closest('.contact-avatar')) { page('chat'); $('#chatInput').blur(); } });
  for (const id of ['#taskPanelButton','#tasksNavButton']) $(id)?.addEventListener('click', () => { if (small.matches) page('tasks'); });
  new MutationObserver(() => { if (small.matches && !$('#momentsView').hidden) page('moments'); }).observe($('#momentsView'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(() => { if (small.matches && !$('#calendarView').hidden) page('calendar'); }).observe($('#calendarView'), { attributes:true, attributeFilter:['hidden'] });
  $('#closeTaskPanel')?.addEventListener('click', () => { if (small.matches) page('chat'); });
  $('#backToChatButton')?.addEventListener('click', () => { if (small.matches) page('friends'); });
  const settings = document.createElement('button'); settings.type = 'button'; settings.className = 'mobile-settings-entry'; settings.textContent = '设置与模型连接　›'; $('#selfProfileForm')?.prepend(settings); settings.addEventListener('click', () => { window.companionUI.closeSelf(); $('#settingsButton').click(); });
  $('#chatInput').setAttribute('enterkeyhint', 'enter');
  if (small.matches) $('#chatInput').placeholder = '发消息，或说说你的安排…';
  $('#chatInput').addEventListener('input', event => { if (!small.matches) return; event.target.style.height = '43px'; event.target.style.height = Math.min(112, event.target.scrollHeight) + 'px'; });
  function viewport() { if (!small.matches) { document.documentElement.style.removeProperty('--mobile-height'); document.body.classList.remove('mobile-keyboard'); return; } const height = window.visualViewport?.height || innerHeight; document.documentElement.style.setProperty('--mobile-height', Math.round(height) + 'px'); const typing = document.activeElement?.matches('input,textarea') && height < screen.height * .77; document.body.classList.toggle('mobile-keyboard', Boolean(typing)); }
  visualViewport?.addEventListener('resize', viewport); window.addEventListener('resize', viewport); document.addEventListener('focusin', viewport); document.addEventListener('focusout', () => setTimeout(viewport,100));
  window.mobileUI = { back() { const modal = [...document.querySelectorAll('.modal:not(.hidden)')].at(-1); if (modal) { modal.querySelector('.modal-header .icon-button,.companion-close,.moment-photo-close,#laterConfigButton,[data-close-self],[data-close-records]')?.click(); return true; } if (!$('#taskPanel').hidden) { window.toggleTaskPanel(false); page('chat'); return true; } if (document.body.dataset.mobilePage !== 'friends') { window.companionUI?.showChat(); page('friends'); return true; } return false; } };
  page('friends'); viewport();
})();
