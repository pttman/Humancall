(() => {
  const desktop=window.desktopDispatch;if(!desktop?.windowControl)return;
  document.body.dataset.desktopPlatform=desktop.platform;
  if(desktop.platform!=='win32')return;
  const controls=document.createElement('div');controls.className='window-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','窗口控制');
  controls.innerHTML='<button type="button" data-window-action="minimize" aria-label="最小化窗口" title="最小化"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10"/></svg></button><button type="button" data-window-action="toggle-maximize" aria-label="最大化窗口" title="最大化"><svg class="window-maximize-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx=".5"/></svg><svg class="window-restore-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 5.5v-3h8v8h-3"/><rect x="2.5" y="5.5" width="8" height="8" rx=".5"/></svg></button><button type="button" class="window-close" data-window-action="close" aria-label="关闭窗口" title="关闭窗口"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>';
  document.body.append(controls);
  function sync(value){const maximized=Boolean(value?.maximized),button=controls.querySelector('[data-window-action="toggle-maximize"]');controls.classList.toggle('is-maximized',maximized);button.setAttribute('aria-label',maximized?'还原窗口':'最大化窗口');button.title=maximized?'还原':'最大化';}
  controls.addEventListener('click',async event=>{const button=event.target.closest('[data-window-action]');if(!button)return;try{const value=await desktop.windowControl(button.dataset.windowAction);if(value&&typeof value==='object')sync(value);}catch{}});
  desktop.onWindowState(sync);desktop.windowControl('state').then(sync).catch(()=>{});
})();
