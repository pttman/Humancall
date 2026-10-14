(() => {
  const desktop = window.desktopDispatch;
  const listeners = { show: [], clear: [], submit: [] };
  const channel = !desktop && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('human-dispatch-bubble') : null;
  channel?.addEventListener('message', ({ data }) => listeners[data.type]?.forEach(fn => fn(data.payload)));
  async function request(route, method = 'GET', value) {
    const response = await fetch('/api/' + route, { method, headers: value === undefined ? {} : { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '服务请求失败'); return data;
  }
  const emit = (type, payload) => { listeners[type].forEach(fn => fn(payload)); channel?.postMessage({ type, payload }); return true; };
  window.humanDispatch = {
    ...(desktop || {}),
    loadState: () => request('state'), saveState: state => request('state', 'PUT', state),
    getDefaultPrompt: async () => (await request('settings/prompts')).defaultPrompt,
    getTonePrompts: async () => (await request('settings/prompts')).tonePrompts,
    askAI: payload => request('ai/chat', 'POST', payload),
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
