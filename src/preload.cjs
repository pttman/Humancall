const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopDispatch', {
  platform:process.platform,
  windowControl:action=>ipcRenderer.invoke('window:control',action),
  onWindowState:callback=>ipcRenderer.on('window:state',(_,value)=>callback(value)),

  chooseDataDirectory: () => ipcRenderer.invoke('storage:choose'),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  notifyReply: payload => ipcRenderer.invoke('reply:completed',payload),
  notify: (payload) => ipcRenderer.invoke('notification:show', payload),
  showBubble: (payload) => ipcRenderer.invoke('bubble:show', payload),
  clearBubbles: () => ipcRenderer.invoke('bubble:clear-all'),
  onIdentityUpdate: callback => ipcRenderer.on('identity:update',(_,identity)=>callback(identity)),
  hideBubble: () => ipcRenderer.invoke('bubble:hide'),
  openMain: () => ipcRenderer.invoke('bubble:open-main'),
  bubbleSubmit: (text) => ipcRenderer.invoke('bubble:submit', text),
  resizeBubble: (height) => ipcRenderer.invoke('bubble:resize', height),
  getAlertSoundUrl: () => ipcRenderer.invoke('audio:alert-url'),
  onBubbleShow: (callback) => ipcRenderer.on('bubble:show', (_, payload) => callback(payload)),
  onBubblePrune: (callback) => ipcRenderer.on('bubble:prune', (_, current) => callback(current)),
  onBubbleClear: (callback) => ipcRenderer.on('bubble:clear', () => callback()),
  onSupervisionRequest: (callback) => ipcRenderer.on('supervision:request', (_, payload) => callback(payload)),
  onBubbleSubmit: (callback) => ipcRenderer.on('bubble:submit', (_, text) => callback(text))
});
