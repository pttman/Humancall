const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('humanDispatch', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  getDefaultPrompt: () => ipcRenderer.invoke('settings:default-prompt'),
  getTonePrompts: () => ipcRenderer.invoke('settings:tone-prompts'),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  askAI: (payload) => ipcRenderer.invoke('ai:chat', payload),
  notify: (payload) => ipcRenderer.invoke('notification:show', payload),
  showBubble: (payload) => ipcRenderer.invoke('bubble:show', payload),
  hideBubble: () => ipcRenderer.invoke('bubble:hide'),
  openMain: () => ipcRenderer.invoke('bubble:open-main'),
  bubbleSubmit: (text) => ipcRenderer.invoke('bubble:submit', text),
  resizeBubble: (height) => ipcRenderer.invoke('bubble:resize', height),
  getAlertSoundUrl: () => ipcRenderer.invoke('audio:alert-url'),
  onBubbleShow: (callback) => ipcRenderer.on('bubble:show', (_, payload) => callback(payload)),
  onBubbleClear: (callback) => ipcRenderer.on('bubble:clear', () => callback()),
  onBubbleSubmit: (callback) => ipcRenderer.on('bubble:submit', (_, text) => callback(text))
});
