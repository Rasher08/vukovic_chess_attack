import { Chess, type Square } from 'chess.js';
import { calibrate, recognize, FrameStabilityGate, screenSquare, type Orientation, type PixelImage, type TemplateSet, type RecognizedCell } from '../core/recognition';
import { PositionTracker, validateTrustedFen } from '../core/position';
import type { AppState } from '../types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const overlayMode = new URLSearchParams(location.search).has('overlay');
const labels = { unknown: 'Позиция не распознана', checking: 'Проверяется', checked: 'Проверено', paused: 'Пауза', error: 'Проверка не завершена' };
let state: AppState;
function renderState(value: AppState) {
  const switched = state && state.mode !== value.mode;
  const wasPaused = state?.status === 'paused'; state = value;
  if (overlayMode) {
    document.body.classList.toggle('collapsed', state.collapsed);
    document.body.classList.toggle('movable', state.movable);
    $('overlay').className = `${state.status}${state.idea ? ' idea' : ''}`;
    $('signal').textContent = state.idea ? 'Есть блестящая идея' : 'nonchalant';
    $('status').textContent = state.movable ? 'Переместите · ⌘⇧M закрепить' : labels[state.status];
    $('mark').textContent = state.collapsed && state.status === 'checking' ? '··' : state.collapsed && state.status === 'unknown' ? '?' : state.collapsed && state.status === 'paused' ? 'Ⅱ' : '!!';
    return;
  }
  $('settings-status').textContent = labels[state.status];
  $('pause').textContent = state.status === 'paused' ? 'Включить' : 'Пауза';
  $('collapse').textContent = state.collapsed ? 'Развернуть HUD' : 'Свернуть HUD';
  $('move').textContent = state.movable ? 'Закрепить HUD' : 'Переместить HUD';
  input('sound').checked = state.sound;
  $('direct-panel').hidden = state.mode !== 'direct'; $('screen-panel').hidden = state.mode !== 'screen';
  $('direct-tab').classList.toggle('active', state.mode === 'direct'); $('screen-tab').classList.toggle('active', state.mode === 'screen');
  $('bridge-status').textContent = { waiting: 'Ожидаем подключение…', connected: 'Подключено. Ожидаем устойчивую видимую позицию.', conflict: 'Несколько источников или порт занят. Оставьте подключённой одну вкладку.' }[state.bridge];
  if (switched || state.status === 'paused' && !wasPaused) resetTracking('Подтвердите позицию после смены источника или паузы.');
  if (switched && state.mode === 'direct') stopCapture();
}

if (overlayMode) {
  document.body.classList.add('hud-mode'); $('overlay').hidden = false; $('settings').hidden = true;
} else initializeControls();
window.hud.onState(renderState);
void window.hud.getState().then(renderState);

const symbols: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟', '.': '·' };
let orientation: Orientation = 'white';
let templates: TemplateSet | null = null;
let tracker = new PositionTracker(), gate = new FrameStabilityGate();
let stream: MediaStream | null = null;
type BoardRect = { x: number; y: number; size: number };
let rect: BoardRect | null = null;
let proposed: BoardRect | null = null;
let currentImage: PixelImage | null = null;
let manual: { fingerprint: string; fen: string } | null = null;
let stable = false, picking = false, editing = false;
let lastFingerprint = '';
let videoTime = -1, videoAdvancedAt = 0;
const cells = new Map<string, string>();
let selectedPiece = '.';
let selectionStart: { x: number; y: number } | null = null;
let screenSnapshot: ImageData | null = null;
const boardCanvas = document.createElement('canvas');

function message(text: string) { $('message').textContent = text; }
function resetTracking(reason: string) {
  tracker.invalidate(); gate.reset(); manual = null; stable = false; lastFingerprint = ''; editing = false;
  input('confirmed').checked = false;
  for (const id of ['turn', 'castling', 'ep', 'halfmove', 'fullmove']) input(id).value = '';
  window.hud.screenPosition(null); $('recognition-status').textContent = reason;
}
function stopCapture() {
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  $('capture-status').textContent = 'Захват выключен';
}
function frame(): PixelImage | null {
  const video = $<HTMLVideoElement>('capture-video');
  if (!stream?.active || stream.getVideoTracks()[0]?.muted || video.paused || !rect || video.readyState < 2 || rect.x + rect.size > video.videoWidth || rect.y + rect.size > video.videoHeight) return null;
  if (video.currentTime !== videoTime) { videoTime = video.currentTime; videoAdvancedAt = Date.now(); }
  if (Date.now() - videoAdvancedAt > 1500) return null;
  boardCanvas.width = Math.round(rect.size); boardCanvas.height = Math.round(rect.size);
  const ctx = boardCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(video, rect.x, rect.y, rect.size, rect.size, 0, 0, boardCanvas.width, boardCanvas.height);
  const preview = $<HTMLCanvasElement>('board-preview').getContext('2d')!;
  preview.drawImage(boardCanvas, 0, 0, 256, 256);
  return ctx.getImageData(0, 0, boardCanvas.width, boardCanvas.height);
}
function scan() {
  if (overlayMode || state?.mode !== 'screen' || state.status === 'paused' || picking) return;
  try {
    const image = frame(); currentImage = image;
    if (!image) { window.hud.screenPosition(null); if (tracker.currentFen) resetTracking('Захват приостановлен. Подтвердите позицию после восстановления.'); return; }
    const observed = gate.observe(image);
    stable = observed.stable;
    if (observed.changed) { manual = null; window.hud.screenPosition(null); }
    if (!stable) { $('recognition-status').textContent = 'Ожидаем устойчивый кадр…'; window.hud.screenPosition(null); return; }
    if (editing) { window.hud.screenPosition(null); return; }
    if (manual?.fingerprint === observed.fingerprint) { window.hud.screenPosition(tracker.isGameOver ? null : manual.fen); return; }
    if (!templates) { $('recognition-status').textContent = 'Кадр устойчив. Сначала обучите фигуры.'; window.hud.screenPosition(null); return; }
    if (lastFingerprint !== observed.fingerprint) {
      lastFingerprint = observed.fingerprint;
      const result = recognize(image, templates, orientation);
      cells.clear(); result.cells.forEach(cell => cells.set(cell.square, cell.piece ?? '.')); drawEditor(result.cells);
      if (!result.confident) {
        tracker.invalidate(); $('recognition-status').textContent = 'Есть неоднозначные клетки. Проверьте и исправьте позицию.';
        window.hud.screenPosition(null); return;
      }
      const next = tracker.observe(result.placement);
      $('recognition-status').textContent = next.fen ? 'Фигуры распознаны. Метаданные отслеживаются.' : next.reason || 'Подтвердите полный FEN.';
      if (next.fen) updateMetadata(next.fen);
    }
    const known = tracker.currentFen;
    window.hud.screenPosition(known && !tracker.isGameOver ? known : null);
  } catch (error) { resetTracking('Распознавание остановлено. Проверьте область и положение окна.'); message(error instanceof Error ? error.message : 'Не удалось прочитать кадр.'); }
}
function drawEditor(recognized: RecognizedCell[] = []) {
  const container = $('editor'); container.replaceChildren();
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const square = screenSquare(row, col, orientation); const piece = cells.get(square) ?? '.';
    const button = document.createElement('button'); button.className = `cell ${(row + col) % 2 ? 'dark' : 'light'}${piece !== '.' && piece === piece.toUpperCase() ? ' white-piece' : ''}`;
    if (recognized.find(cell => cell.square === square)?.confident === false) button.classList.add('uncertain');
    button.textContent = piece === '.' ? '' : symbols[piece]; button.setAttribute('aria-label', `${square}: ${piece}`);
    const label = document.createElement('small'); label.textContent = square; button.append(label);
    button.onclick = () => { beginEdit(); cells.set(square, selectedPiece); drawEditor(); };
    container.append(button);
  }
}
function drawPalette() {
  $('palette').replaceChildren();
  for (const piece of '.KQRBNPkqrbnp') {
    const button = document.createElement('button'); button.textContent = symbols[piece]; button.title = piece === '.' ? 'Пустая клетка' : piece;
    button.classList.toggle('selected', selectedPiece === piece); button.onclick = () => { selectedPiece = piece; drawPalette(); };
    $('palette').append(button);
  }
}
function beginEdit() { editing = true; manual = null; input('confirmed').checked = false; window.hud.screenPosition(null); }
function placement() {
  return Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, col) => cells.get(screenSquare(row, col, 'white')) ?? '.').join('').replace(/\.+/g, v => String(v.length))).join('/');
}
function updateMetadata(fen: string) {
  const p = fen.split(' '); input('fen').value = fen;
  ['turn', 'castling', 'ep', 'halfmove', 'fullmove'].forEach((id, i) => { input(id).value = p[i + 1]; });
}
function loadFen(raw: string) {
  const fen = validateTrustedFen(raw); beginEdit(); cells.clear();
  new Chess(fen).board().flat().forEach(p => { if (p) cells.set(p.square, p.color === 'w' ? p.type.toUpperCase() : p.type); });
  updateMetadata(fen); drawEditor();
}
function confirmedFen(): string {
  if (!input('confirmed').checked) throw Error('Сначала проверьте позицию и подтвердите все данные галочкой.');
  return validateTrustedFen([placement(), ...['turn', 'castling', 'ep', 'halfmove', 'fullmove'].map(id => input(id).value.trim())].join(' '));
}
function confirmPosition(training: boolean) {
  try {
    const image = frame(); if (!image || !stable) throw Error('Дождитесь устойчивого кадра выбранной доски.');
    const observation = gate.observe(image); if (!observation.stable || observation.changed) throw Error('Кадр изменился. Проверьте новую позицию.');
    const fen = confirmedFen();
    if (training) templates = calibrate(image, fen, orientation);
    else if (!templates) throw Error('Сначала обучите фигуры на начальной позиции этой темы.');
    tracker.seed(fen); manual = { fingerprint: observation.fingerprint, fen }; editing = false; lastFingerprint = observation.fingerprint;
    updateMetadata(fen); message(training ? 'Фигуры обучены. Текущая позиция подтверждена.' : 'Позиция подтверждена. Отслеживание включено.');
    $('recognition-status').textContent = 'Позиция подтверждена вручную.';
    window.hud.screenPosition(tracker.isGameOver ? null : fen);
  } catch (error) { message(error instanceof Error ? error.message : 'Не удалось подтвердить позицию.'); window.hud.screenPosition(null); }
}
async function chooseScreens() {
  try {
    const sources = await window.hud.sources(); $('sources').replaceChildren();
    for (const source of sources) {
      const button = document.createElement('button'); const image = document.createElement('img'); image.src = source.thumbnail; image.alt = source.name;
      button.append(image, document.createTextNode(source.name)); button.onclick = () => { void capture(source.id); }; $('sources').append(button);
    }
    if (!sources.length) throw Error('Экраны недоступны. Проверьте разрешение записи экрана в macOS.');
  } catch (error) { message('Захват недоступен. Разрешите запись экрана в настройках macOS и перезапустите HUD.'); }
}
async function capture(id: string) {
  try {
    stopCapture(); resetTracking('Выберите область доски.'); templates = null; rect = null;
    await window.hud.selectSource(id);
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 5, max: 5 } }, audio: false });
    const video = $<HTMLVideoElement>('capture-video'); video.srcObject = stream; await video.play();
    stream.getVideoTracks()[0].addEventListener('ended', () => { stopCapture(); resetTracking('Захват экрана завершён.'); });
    $('sources').replaceChildren(); $('capture-status').textContent = 'Захват включён · 5 кадров/с'; ($('region') as HTMLButtonElement).disabled = false;
    showPicker();
  } catch { message('Не удалось начать захват. Проверьте разрешение записи экрана и перезапустите HUD.'); }
}
function showPicker() {
  const video = $<HTMLVideoElement>('capture-video'); if (!video.videoWidth) return;
  picking = true; proposed = null; resetTracking('Выберите точный квадрат доски.'); templates = null;
  const canvas = $<HTMLCanvasElement>('screen-preview'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(video, 0, 0);
  screenSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height); $('picker').hidden = false;
}
function initializeControls() {
  // Setup runs before state arrives. Event closures use initialized module state.
  $('direct-tab').onclick = () => { void window.hud.configure({ mode: 'direct' }); };
  $('screen-tab').onclick = () => { void window.hud.configure({ mode: 'screen' }); };
  $('pause').onclick = () => { void window.hud.configure({ paused: state.status !== 'paused' }); };
  $('collapse').onclick = () => { void window.hud.configure({ collapsed: !state.collapsed }); };
  $('move').onclick = () => { void window.hud.configure({ movable: !state.movable }); };
  input('sound').onchange = () => { void window.hud.configure({ sound: input('sound').checked }); };
  $('copy').onclick = () => { void window.hud.copyToken().then(() => message('Ключ скопирован. Вставьте его в меню HUD на сайте.')); };
  void window.hud.getToken().then(token => { input('token').value = token; });
  $('choose').onclick = () => { void chooseScreens(); };
  $('region').onclick = showPicker;
  input('orientation').onchange = () => { orientation = input('orientation').value as Orientation; resetTracking('Ориентация изменена. Подтвердите FEN.'); drawEditor(); };
  $('load-fen').onclick = () => { try { loadFen(input('fen').value); message('Сравните редактор с кадром и подтвердите данные.'); } catch (e) { message((e as Error).message); } };
  $('initial').onclick = () => { loadFen(new Chess().fen()); message('Начальная позиция выбрана явно. Проверьте, что на экране она же.'); };
  $('edit').onclick = () => { beginEdit(); message('Исправьте фигуры и метаданные, затем подтвердите позицию.'); };
  $('calibrate').onclick = () => confirmPosition(true); $('seed').onclick = () => confirmPosition(false);
  for (const id of ['fen', 'turn', 'castling', 'ep', 'halfmove', 'fullmove']) input(id).addEventListener('input', beginEdit);
  const canvas = $<HTMLCanvasElement>('screen-preview');
  const point = (event: PointerEvent) => { const box = canvas.getBoundingClientRect(); return { x: Math.round(Math.max(0, Math.min(canvas.width, (event.clientX - box.left) * canvas.width / box.width))), y: Math.round(Math.max(0, Math.min(canvas.height, (event.clientY - box.top) * canvas.height / box.height))) }; };
  canvas.onpointerdown = event => { selectionStart = point(event); canvas.setPointerCapture(event.pointerId); };
  canvas.onpointermove = event => {
    if (!selectionStart || !screenSnapshot) return;
    const end = point(event); const size = Math.min(Math.abs(end.x - selectionStart.x), Math.abs(end.y - selectionStart.y));
    proposed = { x: end.x < selectionStart.x ? selectionStart.x - size : selectionStart.x, y: end.y < selectionStart.y ? selectionStart.y - size : selectionStart.y, size };
    const ctx = canvas.getContext('2d')!; ctx.putImageData(screenSnapshot, 0, 0); ctx.strokeStyle = '#74e0c9'; ctx.lineWidth = Math.max(2, canvas.width / 500); ctx.strokeRect(proposed.x, proposed.y, size, size);
    $('selection-size').textContent = `${size} × ${size} px`;
  };
  canvas.onpointerup = () => { selectionStart = null; };
  $('use-region').onclick = () => {
    if (!proposed || proposed.size < 256) { message('Выделите доску размером не менее 256 × 256 пикселей.'); return; }
    rect = proposed; picking = false; $('picker').hidden = true; gate.reset(); message('Поставьте начальную позицию, проверьте её FEN и обучите фигуры.');
  };
  window.hud.onSound(() => {
    const audio = new AudioContext(); const tone = audio.createOscillator(); const gain = audio.createGain(); tone.connect(gain); gain.connect(audio.destination); tone.frequency.value = 660; gain.gain.setValueAtTime(.03, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .15); tone.start(); tone.stop(audio.currentTime + .16); tone.onended = () => { void audio.close(); };
  });
  // Defer initial drawing until const/let declarations above have initialized.
  queueMicrotask(() => { drawEditor(); drawPalette(); });
  setInterval(scan, 250);
  window.addEventListener('beforeunload', () => { stopCapture(); window.hud.screenPosition(null); });
}
