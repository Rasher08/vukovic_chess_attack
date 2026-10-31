import { extractChesscom } from './chesscom';
declare const chrome: any;

let lastKey = '', changedAt = 0, timer: ReturnType<typeof setTimeout> | undefined;
let enabled = false;
async function scan(force = false) {
  if (!enabled) return;
  const sample = extractChesscom(document, location.href);
  const visible = document.visibilityState === 'visible';
  const key = JSON.stringify([sample, visible]);
  if (lastKey !== key) { lastKey = key; changedAt = Date.now(); }
  else if (!force) return;
  try {
    // Changed observations first clear the old signal; only a settled list is
    // replayed. Numbered moves remain in the native application's history.
    await chrome.runtime.sendMessage({ kind: 'moves', ...sample, observedAt: Date.now(), visible, ready: sample.ready && Date.now() - changedAt >= 220 });
  } catch { enabled = false; }
}
function changed() {
  if (timer) return;
  timer = setTimeout(() => { timer = undefined; void scan(); }, 60);
}
chrome.runtime.onMessage.addListener((message: any) => {
  if (message?.kind === 'start') { enabled = true; lastKey = ''; void scan(true); }
  if (message?.kind === 'stop') enabled = false;
});
void chrome.runtime.sendMessage({ kind: 'hello' }).then((r: any) => { enabled = r?.enabled === true; if (enabled) void scan(true); }).catch(() => {});
new MutationObserver(changed).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled', 'data-whole-move-number', 'aria-current', 'hidden'] });
setInterval(() => { void scan(true); }, 450);
document.addEventListener('visibilitychange', () => { lastKey = ''; void scan(true); });
window.addEventListener('pagehide', () => {
  if (enabled) void chrome.runtime.sendMessage({ kind: 'moves', game: location.origin + location.pathname, moves: [], currentPly: null, visible: false, ready: false }).catch(() => {});
});
