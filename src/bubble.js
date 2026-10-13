const $ = (selector) => document.querySelector(selector);
let alertSoundUrl;

function send(text) { if (!text?.trim()) return; window.humanDispatch.bubbleSubmit(text.trim()); }

async function resizeToContent() {
  const shell = $('.bubble-shell');
  if (!shell) return;
  const desiredHeight = Math.ceil(shell.scrollHeight + 16);
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

window.humanDispatch.onBubbleShow((payload) => {
  document.documentElement.dataset.theme = payload.theme || 'green-command';
  $('#bubbleTitle').textContent = payload.title || '该干活了';
  $('#bubbleBody').textContent = payload.body || '我在等你的汇报。';
  $('#bubbleInput').value = '';
  $('#bubbleInput').focus();
  playAlertSound();
  requestAnimationFrame(() => resizeToContent());
});

prepareAlertSound();

document.querySelectorAll('[data-message]').forEach((button) => button.addEventListener('click', () => send(button.dataset.message)));
$('#bubbleForm').addEventListener('submit', (event) => { event.preventDefault(); send($('#bubbleInput').value); });
$('#closeButton').addEventListener('click', () => window.humanDispatch.hideBubble());
$('#openMainButton').addEventListener('click', () => window.humanDispatch.openMain());
