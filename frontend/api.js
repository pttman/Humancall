(() => {
  const desktop = window.desktopDispatch;
  let stateBaseline=null;
  const listeners = { show: [], clear: [], submit: [], prune: [], identity: [] };
  const channel = !desktop && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('human-dispatch-bubble') : null;
  channel?.addEventListener('message', ({ data }) => listeners[data.type]?.forEach(fn => fn(data.payload)));
  async function request(route, method = 'GET', value,signal) {
    const response = await fetch('/api/' + route, { method,signal, headers: value === undefined ? {} : { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) });
    const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error || '服务请求失败'),{status:response.status}); return data;
  }
  const emit = (type, payload) => { listeners[type].forEach(fn => fn(payload)); channel?.postMessage({ type, payload }); return true; };
  window.humanDispatch = {
    ...(desktop || {}),
    getDataDirectory: () => request('storage'),
    setDataDirectory: directory => request('storage', 'PUT', { directory }),
    chooseDataDirectory: desktop?.chooseDataDirectory || (async () => window.prompt('输入本机数据保存文件夹的绝对路径')),
    stateBase:()=>structuredClone(stateBaseline),
    acceptState:state=>{stateBaseline=window.stateMerge.baseOf(state);},
    loadState:()=>request('state'), saveState: async (state,base=structuredClone(stateBaseline)) => {const saved=await request('state','PUT',{...state,...(base?{_clientBase:base}:{})});if(!desktop){emit('prune',window.conversationState.bubbleState(saved));emit('identity',window.chatProfile.get(saved.settings));}return saved;},
    getDefaultPrompt: async () => (await request('settings/prompts')).defaultPrompt,
    getTonePrompts: async () => (await request('settings/prompts')).tonePrompts,
    searchOnlineStickers: query=>request('stickers/search','POST',{query}),
    testChatModel:(settings,signal)=>request('models/test','POST',{settings},signal),
    checkIn: payload => request('ai/check-in', 'POST', payload),
    considerMoment: () => request('ai/moments','POST',{}),
    onSupervisionRequest: desktop?.onSupervisionRequest || (()=>{}),
    onBubblePrune: desktop?.onBubblePrune || (fn=>listeners.prune.push(fn)),
    onIdentityUpdate: desktop?.onIdentityUpdate || (fn=>listeners.identity.push(fn)),
    clearBubbles: desktop?.clearBubbles || (async()=>emit('clear')),
    notifyReply: desktop?.notifyReply || (async payload=>{if(!document.hidden)return false;return window.humanDispatch.notify(payload);}),
    synthesizeSpeech: async (payload,signal)=>{
      const {preview,...input}=payload;
      const response=await fetch('/api/speech/'+(preview?'preview':'synthesize'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});
      if(!response.ok){const error=await response.json();throw Error(error.error||'语音暂时不可用');}
      return response.blob();
    },
    askAI: (payload,signal) => request('ai/chat', 'POST', payload,signal),
    exportData: async () => { const state = await request('backup'); const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = '人类调度-备份.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return { canceled: false, filePath: a.download }; },
    importData: () => new Promise((resolve, reject) => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'; input.oncancel = () => resolve({ canceled: true }); input.onchange = async () => { try { if (!input.files.length) return resolve({ canceled: true }); resolve(await request('backup', 'POST', JSON.parse(await input.files[0].text()))); } catch (error) { reject(error); } }; input.click(); }),
    ...(!desktop ? {
      openExternal: async value => { const url = new URL(value); if (url.protocol !== 'https:') throw new Error('只允许 HTTPS 链接'); window.open(url.href, '_blank', 'noopener'); return true; },
      notify: async payload => { emit('show', payload); if ('Notification' in window) { if (Notification.permission === 'default') await Notification.requestPermission(); if (Notification.permission === 'granted') new Notification(payload.title, { body: payload.body }); } return true; },
      showBubble: payload => emit('show', payload), hideBubble: () => { if (location.pathname.endsWith('bubble.html')) window.close(); return true; },
      openMain: () => { window.open('/'); return true; }, bubbleSubmit: text => emit('submit', text), resizeBubble: () => true,
      getAlertSoundUrl: async () => '/assets/notification.mp3',
      onBubbleShow: fn => listeners.show.push(fn), onBubbleClear: fn => listeners.clear.push(fn), onBubbleSubmit: fn => listeners.submit.push(fn)
    } : {})
  };
})();
