import { legalArrow, PuzzleTracker, readBoard, squarePoint, type BoardSnapshot, type PuzzleSide } from './board';
declare const chrome: any;

let enabled = false, generation = 0, currentKey = '', stableAt = 0, positionId = '', lastSent = 0;
let active: { snapshot: BoardSnapshot; fen: string; id: string } | null = null;
let arrow: SVGSVGElement | null = null, arrowExpires = 0;
const tracker = new PuzzleTracker();

function clearArrow() { arrow?.remove(); arrow = null; arrowExpires = 0; }
function withdraw() {
  clearArrow(); active = null; generation++; positionId = `withdraw:${generation}`;
  if (enabled) void chrome.runtime.sendMessage({ kind: 'position', fen: null, positionId, visible: false, observedAt: Date.now() }).catch(disable);
}
function disable() { enabled = false; currentKey = ''; tracker.reset(); clearArrow(); active = null; }
function draw(move: string, snapshot: BoardSnapshot) {
  clearArrow();
  const [x1, y1] = squarePoint(move.slice(0, 2), snapshot.orientation), [x2, y2] = squarePoint(move.slice(2, 4), snapshot.orientation);
  const dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length;
  const endX = x2 - ux * 17, endY = y2 - uy * 17, headX = x2 - ux * 47, headY = y2 - uy * 47;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.dataset.rushHud = 'arrow'; svg.setAttribute('viewBox', '0 0 800 800');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:fixed;pointer-events:none!important;z-index:2147483646;overflow:visible;opacity:.86;';
  const polygon = document.createElementNS(svg.namespaceURI, 'polygon');
  polygon.setAttribute('points', `${x1 + uy * 11},${y1 - ux * 11} ${headX + uy * 11},${headY - ux * 11} ${headX + uy * 30},${headY - ux * 30} ${endX},${endY} ${headX - uy * 30},${headY + ux * 30} ${headX - uy * 11},${headY + ux * 11} ${x1 - uy * 11},${y1 + ux * 11}`);
  polygon.setAttribute('fill', '#fbab36'); polygon.setAttribute('stroke', '#20180b'); polygon.setAttribute('stroke-width', '3'); polygon.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(polygon);
  if (move[4]) {
    const badge = document.createElementNS(svg.namespaceURI, 'text');
    badge.setAttribute('x', String(x2)); badge.setAttribute('y', String(y2 + 10));
    badge.setAttribute('text-anchor', 'middle'); badge.setAttribute('fill', '#fff');
    badge.setAttribute('stroke', '#21180a'); badge.setAttribute('stroke-width', '5');
    badge.setAttribute('paint-order', 'stroke'); badge.setAttribute('font-size', '34');
    badge.setAttribute('font-family', 'system-ui'); badge.setAttribute('font-weight', '800');
    badge.textContent = move[4].toUpperCase(); svg.appendChild(badge);
  }
  document.documentElement.appendChild(svg); arrow = svg; arrowExpires = Date.now() + 2000; layout();
}
function layout() {
  if (!arrow || !active) return;
  const rect = active.snapshot.board.getBoundingClientRect();
  arrow.style.left = rect.left + 'px'; arrow.style.top = rect.top + 'px'; arrow.style.width = rect.width + 'px'; arrow.style.height = rect.height + 'px';
}
async function send(fen: string | null, id: string, visible: boolean) {
  lastSent = Date.now();
  try { const result = await chrome.runtime.sendMessage({ kind: 'position', fen, positionId: id, visible, observedAt: Date.now() }); if (!result?.ok && id === positionId) clearArrow(); }
  catch { disable(); }
}
function scan() {
  if (!enabled) return;
  const snapshot = readBoard(document, location.href);
  if (!snapshot) { if (currentKey || active || arrow) { currentKey = ''; withdraw(); } return; }
  const changed = snapshot.key !== currentKey || active && active.snapshot.board !== snapshot.board;
  if (changed) {
    currentKey = snapshot.key; stableAt = Date.now(); withdraw();
    return;
  }
  if (Date.now() - stableAt < Math.max(90, snapshot.animationMs + 20)) return;
  if (!active) {
    const tracked = tracker.observe(snapshot);
    if (!tracked.fen || !tracked.ownTurn) return;
    positionId = `position:${++generation}:${snapshot.key}`;
    active = { snapshot, fen: tracked.fen, id: positionId };
    void send(active.fen, positionId, true);
  } else if (Date.now() - lastSent > 1000) void send(active.fen, active.id, true);
  if (arrow && Date.now() > arrowExpires) clearArrow();
  layout();
}
function setEnabled(value: any) {
  tracker.setSide(['white', 'black'].includes(value?.side) ? value.side as PuzzleSide : 'auto');
  enabled = true; currentKey = ''; stableAt = 0; tracker.reset(); clearArrow(); active = null; scan();
}
chrome.runtime.onMessage.addListener((message: any) => {
  if (message?.kind === 'start') setEnabled(message);
  if (message?.kind === 'stop') disable();
  if (message?.kind === 'result') {
    if (!enabled || !active || message.positionId !== active.id || document.visibilityState === 'hidden') return;
    const live = readBoard(document, location.href);
    if (!live || live.board !== active.snapshot.board || live.key !== active.snapshot.key) { withdraw(); return; }
    if (!message.ok || !legalArrow(active.fen, message.move)) { clearArrow(); return; }
    draw(message.move, live);
  }
});
void chrome.runtime.sendMessage({ kind: 'hello' }).then((result: any) => { if (result?.enabled) setEnabled(result); }).catch(() => {});
new MutationObserver(records => {
  if (!enabled || records.every(record => record.target instanceof Element && (record.target.closest('[data-rush-hud]') || Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).every(node => node instanceof Element && node.hasAttribute('data-rush-hud')) && record.type === 'childList'))) return;
  const pieceChanged = records.some(record => record.target instanceof Element && (record.target.matches('.piece,wc-chess-board,chess-board') || record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && node.matches('.piece'))));
  if (pieceChanged) { currentKey = ''; clearArrow(); }
  // Mutation observers run before the next frame. Never leave the previous
  // position's arrow visible while waiting for a changed board to settle.
  scan();
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'orientation', 'data-orientation', 'hidden', 'aria-hidden'] });
setInterval(scan, 40);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { currentKey = ''; tracker.reset(); withdraw(); } else scan(); });
window.addEventListener('pagehide', withdraw);
window.addEventListener('resize', () => { clearArrow(); scan(); });
window.addEventListener('scroll', layout, { passive: true, capture: true });
