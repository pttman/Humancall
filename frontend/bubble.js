const $ = (selector) => document.querySelector(selector);
let alertSoundUrl;
let bubbleItems = [];
let activeIndex = 0;
let switching = false;

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }

async function resizeToContent() {
  const shell = $('.bubble-shell');
  if (!shell) return;
  const style=getComputedStyle(shell);
  // offsetHeight excludes the scale/translation used by the card switching animation.
  const desiredHeight = Math.ceil(shell.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom));
  await window.humanDispatch.resizeBubble(desiredHeight);
}

async function prepareAlertSound() {
  alertSoundUrl = await window.humanDispatch.getAlertSoundUrl();
  if (alertSoundUrl) $('#alertSound').src = alertSoundUrl;
}

function playAlertSound() {
  if (!alertSoundUrl) return;
  const audio = $('#alertSound');
  audio.currentTime = 0;
  audio.volume = 0.72;
  audio.play().catch(() => {});
}

function currentBubble() { return bubbleItems[activeIndex] || null; }

function renderQuickActions(actions) {
  const container = $('#quickActions');
  const items = Array.isArray(actions) ? actions.filter(item=>item && typeof item.message==='string' && item.message.trim()).slice(0,3) : [];
  container.hidden = items.length === 0;
  container.innerHTML = items.map((item) => {
    const label = String(item.label || item.message);
    return `<button data-message="${escapeHtml(item.message || label)}">${escapeHtml(label)}</button>`;
  }).join('');
  container.querySelectorAll('[data-message]').forEach((button) => button.addEventListener('click', () => send(button.dataset.message)));
}

function renderCurrent(playSound = false, direction = 0) {
  const payload = currentBubble();
  if (!payload) return;
  const shell = $('.bubble-shell');
  shell.classList.remove('switch-next', 'switch-prev');
  if (direction) {
    void shell.offsetWidth;
    shell.classList.add(direction > 0 ? 'switch-next' : 'switch-prev');
    window.setTimeout(() => shell.classList.remove('switch-next', 'switch-prev'), 280);
  }
  if(payload.identity)applyIdentity(payload.identity);
  document.documentElement.dataset.theme = ['pastel-mix', 'midnight-blue', 'paper-focus'].includes(payload.theme) ? payload.theme : 'pastel-mix';
  document.documentElement.dataset.stack = bubbleItems.length > 1 ? 'stacked' : 'single';
  $('#bubbleTitle').textContent = payload.title || '该干活了';
  $('#bubbleBody').textContent = payload.body || '我在等你的汇报。';
  const sticker=window.stickerUI.create(payload.sticker);$('#bubbleSticker').replaceChildren(...(sticker?[sticker]:[]));
  $('#bubbleStackInfo').textContent = bubbleItems.length > 1 ? `${activeIndex + 1} / ${bubbleItems.length} · 滚轮切换` : '';
  renderQuickActions(payload.quickActions);
  $('#bubbleInput').value = '';
  $('#bubbleInput').focus();
  if (playSound) playAlertSound();
  requestAnimationFrame(() => resizeToContent());
}

function addBubble(payload) {
  const bubbleId = payload.bubbleId || `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const existingIndex = bubbleItems.findIndex((item) => item.bubbleId === bubbleId);
  if (existingIndex >= 0) {
    bubbleItems[existingIndex] = { ...bubbleItems[existingIndex], ...payload, bubbleId };
    activeIndex = existingIndex;
  } else {
    bubbleItems.push({ ...payload, bubbleId });
    activeIndex = bubbleItems.length - 1;
  }
  renderCurrent(true);
}

function dismissCurrent() {
  if (!bubbleItems.length) return window.humanDispatch.hideBubble();
  bubbleItems.splice(activeIndex, 1);
  if (!bubbleItems.length) return window.humanDispatch.hideBubble();
  activeIndex = Math.min(activeIndex, bubbleItems.length - 1);
  renderCurrent(false);
}

function switchBubble(direction) {
  if (bubbleItems.length < 2 || switching) return;
  switching = true;
  activeIndex = (activeIndex + direction + bubbleItems.length) % bubbleItems.length;
  renderCurrent(false, direction);
  window.setTimeout(() => { switching = false; }, 240);
}

async function send(text) {
  if (!text?.trim()) return;
  const current = currentBubble();
  if (current) bubbleItems.splice(activeIndex, 1);
  if (bubbleItems.length) activeIndex = Math.min(activeIndex, bubbleItems.length - 1);
  await window.humanDispatch.bubbleSubmit({text:text.trim(),context:current ? {friendId:current.friendId,messageId:current.messageId,reminderId:current.reminderId,taskId:current.taskId,questionId:current.questionId,body:current.body} : null});
  if (bubbleItems.length) window.humanDispatch.showBubble(bubbleItems[activeIndex]);
}

window.humanDispatch.onBubbleShow((payload) => addBubble(payload));
window.humanDispatch.onBubbleClear(() => { bubbleItems = []; activeIndex = 0; });
window.humanDispatch.onBubblePrune(current=>{
  const activeId=currentBubble()?.bubbleId;const kept=bubbleItems.filter(p=>window.conversationState.isBubbleLive(p,current));
  if(kept.length===bubbleItems.length)return;
  bubbleItems=kept;activeIndex=Math.max(0,bubbleItems.findIndex(p=>p.bubbleId===activeId));
  if(bubbleItems.length)renderCurrent(false);else window.humanDispatch.hideBubble();
});

prepareAlertSound();

$('#bubbleForm').addEventListener('submit', (event) => { event.preventDefault(); send($('#bubbleInput').value); });
$('#closeButton').addEventListener('click', dismissCurrent);
$('#openMainButton').addEventListener('click', () => { bubbleItems = []; window.humanDispatch.openMain(); });
$('.bubble-shell').addEventListener('wheel', (event) => {
  if (bubbleItems.length < 2) return;
  event.preventDefault();
  switchBubble(event.deltaY > 0 ? 1 : -1);
}, { passive: false });

// Image loads and font layout can change the reminder height after its first paint.
let resizeFrame;new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(resizeToContent);}).observe($('.bubble-shell'));

function applyIdentity(value){const identity=window.chatProfile.get(value);$('#bubbleAssistantName').textContent=identity.assistantName;$('#bubbleAvatarImage').src=identity.assistantAvatar;$('#bubbleInput').placeholder='回复'+identity.assistantName+'……';}
window.humanDispatch.onIdentityUpdate(value=>{for(const item of bubbleItems)if(!value.friendId||!item.friendId||item.friendId===value.friendId)item.identity=value;const current=currentBubble();if(!current||!value.friendId||!current.friendId||current.friendId===value.friendId)applyIdentity(value);});
