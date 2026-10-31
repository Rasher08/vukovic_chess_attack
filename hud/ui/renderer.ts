import { Chess, type Square } from 'chess.js';
import { calibrate, recognize, FrameStabilityGate, screenSquare, type Orientation, type PixelImage, type TemplateSet, type RecognizedCell } from '../core/recognition';
import { ScreenPositionTracker, validateTrustedFen } from '../core/position';
import { SCREEN_STATUS, type ScreenIssue } from '../core/screenStatus';
import { MOVE_STATUS } from '../core/moveHistory';
import type { AppState } from '../types';
import type { SoundAsset } from '../core/soundStore';
import { NotificationSoundPlayer, validateSound } from './sound';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const overlayMode = new URLSearchParams(location.search).has('overlay');
const isMac = navigator.platform.toLowerCase().includes('mac');
const shortcut = (key: string) => isMac ? `⌘⇧${key}` : `Ctrl+Shift+${key}`;
const labels = { unknown: 'Позиция не распознана', checking: 'Проверяется', checked: 'Проверено', paused: 'Пауза', error: 'Проверка не завершена' };
let state: AppState;
const soundPlayer = new NotificationSoundPlayer(() => {
  if (previewingSound) { previewingSound = false; $('sound-message').textContent = 'Прослушивание завершено.'; }
});
let soundRequest = 0, previewingSound = false;
let cachedSound: { revision: string; asset: SoundAsset | null } | null = null;
function stopSound() { ++soundRequest; soundPlayer.stop(); previewingSound = false; }
async function playSound(preview: boolean) {
  stopSound(); previewingSound = preview; const request = soundRequest;
  const settings = state.soundSettings;
  try {
    let asset = cachedSound?.revision === settings.revision ? cachedSound.asset : undefined;
    if (asset === undefined) {
      asset = await window.hud.readSound();
      if (request !== soundRequest) return;
      cachedSound = { revision: settings.revision, asset };
    }
    if (request !== soundRequest || !preview && (!state.sound || !state.idea)) return;
    await soundPlayer.play(asset, settings);
    if (preview) $('sound-message').textContent = settings.volume === 0 ? 'Громкость — 0%. Поднимите ползунок, чтобы услышать звук.' : 'Прослушивание. «Стоп» остановит звук.';
  } catch { if (request === soundRequest) $('sound-message').textContent = 'Не удалось воспроизвести звук. Выберите другой файл или стандартный сигнал.'; }
}
function renderState(value: AppState) {
  // The initial invoke response can arrive after a newer state broadcast.
  if (state && value.revision < state.revision) return;
  const switched = state && state.mode !== value.mode;
  const soundChanged = state && state.soundSettings.revision !== value.soundSettings.revision;
  const wasPaused = state?.status === 'paused'; state = value;
  if (overlayMode) {
    document.body.classList.toggle('collapsed', state.collapsed);
    document.body.classList.toggle('movable', state.movable);
    $('overlay').className = `${state.status}${state.idea ? ' idea' : ''}`;
    $('signal').textContent = state.idea ? 'Есть блестящая идея' : 'nonchalant';
    $('status').textContent = state.movable ? `Переместите · ${shortcut('M')} закрепить`
      : state.status === 'unknown' && state.mode === 'moves' ? MOVE_STATUS[state.moveIssue]
      : state.status === 'unknown' && state.mode === 'screen' && state.screenIssue ? SCREEN_STATUS[state.screenIssue] : labels[state.status];
    $('mark').textContent = state.collapsed && state.status === 'checking' ? '··' : state.collapsed && state.status === 'unknown' ? '?' : state.collapsed && state.status === 'paused' ? 'Ⅱ' : '!!';
    return;
  }
  $('settings-status').textContent = labels[state.status];
  $('version').textContent = state.version;
  $('pause').textContent = state.status === 'paused' ? 'Включить' : 'Пауза';
  $('collapse').textContent = state.collapsed ? 'Развернуть HUD' : 'Свернуть HUD';
  $('move').textContent = state.movable ? 'Закрепить HUD' : 'Переместить HUD';
  input('sound').checked = state.sound;
  if (soundChanged) { stopSound(); cachedSound = null; }
  if (!previewingSound && (!state.idea || !state.sound)) stopSound();
  $('sound-name').textContent = state.soundSettings.name ?? 'Стандартный сигнал';
  input('sound-volume').value = String(state.soundSettings.volume);
  $('sound-volume-value').textContent = `${state.soundSettings.volume}%`;
  input('sound-duration').value = String(state.soundSettings.duration);
  ($('reset-sound') as HTMLButtonElement).disabled = !state.soundSettings.name;
  $('direct-panel').hidden = state.mode !== 'direct'; $('screen-panel').hidden = state.mode !== 'screen';
  $('moves-panel').hidden = state.mode !== 'moves';
  $('direct-tab').classList.toggle('active', state.mode === 'direct'); $('screen-tab').classList.toggle('active', state.mode === 'screen');
  $('moves-tab').classList.toggle('active', state.mode === 'moves');
  $('moves-status').textContent = `${MOVE_STATUS[state.moveIssue]} · Запомнено полуходов: ${state.movesCount}`;
  $('bridge-status').textContent = { waiting: 'Ожидаем подключение…', connected: 'Подключено. Ожидаем устойчивую видимую позицию.', conflict: 'Несколько источников или порт занят. Оставьте подключённой одну вкладку.' }[state.bridge];
  if (switched || state.status === 'paused' && !wasPaused) resetTracking('Подтвердите позицию после смены источника или паузы.');
  if (switched && state.mode !== 'screen') stopCapture();
}

const symbols: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟', '.': '·' };
let orientation: Orientation = 'white';
let templates: TemplateSet | null = null;
let tracker = new ScreenPositionTracker(), gate = new FrameStabilityGate();
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
function unknown(issue: ScreenIssue, detail?: string) {
  tracker.suspend();
  if (detail) $('recognition-status').textContent = detail;
  window.hud.screenPosition(null, issue);
}
function saveSettings() {
  try {
    if (rect) localStorage.setItem('nonchalant:hud:rect', JSON.stringify(rect));
    if (templates) localStorage.setItem('nonchalant:hud:templates', JSON.stringify(templates));
    localStorage.setItem('nonchalant:hud:orientation', orientation);
  } catch {}
}
function loadSavedSettings() {
  try {
    const savedRect = localStorage.getItem('nonchalant:hud:rect');
    if (savedRect) {
      rect = JSON.parse(savedRect);
      $('inspection').hidden = false;
      ($('region') as HTMLButtonElement).disabled = false;
      $('recognition-status').textContent = 'Область доски загружена. Выберите экран для запуска.';
    }
    const savedTemplates = localStorage.getItem('nonchalant:hud:templates');
    if (savedTemplates) templates = JSON.parse(savedTemplates);
    const savedOri = localStorage.getItem('nonchalant:hud:orientation');
    if (savedOri === 'white' || savedOri === 'black') {
      orientation = savedOri as Orientation;
      input('orientation').value = savedOri;
    }
  } catch {}
}
function startNewGame() {
  // Clicking this control explicitly confirms a standard new game. A familiar
  // arrangement alone never authorizes resetting turn, rights or move counters.
  tracker.invalidate(); manual = null; window.hud.screenPosition(null);
  try {
    const initialFen = new Chess().fen();
    const image = frame();
    if (!image || !stable || !gate.observe(image).stable) throw Error('Дождитесь устойчивого кадра начальной позиции.');
    if (!templates) {
      loadFen(initialFen);
      $('calibration-review').hidden = false;
      ($('advanced-fen') as HTMLDetailsElement).open = false;
      message('Сравните фигуры справа с кадром слева и нажмите «Всё совпадает — запомнить».');
      return;
    }
    const recognized = recognize(image, templates, orientation);
    if (!recognized.confident || recognized.placement !== initialFen.split(' ')[0]) throw Error('На кадре не подтверждена начальная позиция. Используйте ручной FEN или обновите калибровку.');
    tracker.seed(initialFen);
    manual = null;
    editing = false;
    lastFingerprint = ''; // Revalidate even when the board pixels did not change.
    input('confirmed').checked = true;
    updateMetadata(initialFen);
    saveSettings();
    $('recognition-status').textContent = 'Партия начата: следим за ходами с 1-го хода.';
    message('Готово. Можете играть и закрыть окно настроек.');
    window.hud.screenPosition(initialFen);
  } catch (error) {
    message(error instanceof Error ? error.message : 'Не удалось начать партию.');
  }
}
function resetTracking(reason: string) {
  tracker.invalidate(); gate.reset(); manual = null; stable = false; lastFingerprint = ''; editing = false;
  input('confirmed').checked = false;
  $('calibration-review').hidden = true;
  for (const id of ['turn', 'castling', 'ep', 'halfmove', 'fullmove']) input(id).value = '';
  window.hud.screenPosition(null, 'metadata'); $('recognition-status').textContent = reason;
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
    if (!image) {
      if (tracker.hasAnchor) resetTracking('Захват приостановлен. Подтвердите текущую позицию после восстановления.');
      unknown('capture-lost', 'Нет свежего кадра. Проверьте захват экрана и выбранную область.'); return;
    }
    const observed = gate.observe(image);
    stable = observed.stable;
    if (observed.changed) { manual = null; lastFingerprint = ''; unknown('settling'); }
    if (!stable) { unknown('settling', 'Ожидаем устойчивый кадр… Уберите курсор с доски; окно настроек должно быть за её пределами.'); return; }
    if (editing) { unknown('editing', 'Редактор открыт. Проверьте фигуры и данные ниже, отметьте «Я проверил…» и нажмите «Подтвердить текущую позицию».'); return; }
    if (manual?.fingerprint === observed.fingerprint) { window.hud.screenPosition(tracker.isGameOver ? null : manual.fen); return; }
    if (!templates) { unknown('calibration', 'Кадр устойчив. В начальной позиции нажмите «Начать новую партию». Для текущей позиции загрузите FEN и обучите фигуры ниже.'); return; }
    if (lastFingerprint !== observed.fingerprint) {
      lastFingerprint = observed.fingerprint;
      const result = recognize(image, templates, orientation);
      cells.clear(); result.cells.forEach(cell => cells.set(cell.square, cell.piece ?? '.')); drawEditor(result.cells);
      if (!result.confident) {
        unknown('ambiguous', 'Есть неоднозначные клетки. Уберите курсор и посторонние окна с доски. После помехи отслеживание восстановится, если переход однозначен.'); return;
      }

      const next = tracker.observe(result.placement);
      $('recognition-status').textContent = next.fen ? 'Фигуры распознаны. Метаданные отслеживаются.' : next.reason || 'Подтвердите FEN или нажмите «🟢 Новая партия».';
      if (next.fen) updateMetadata(next.fen);
      else { unknown(tracker.hasAnchor ? 'metadata' : 'tracking-lost'); return; }
    }
    const known = tracker.currentFen;
    if (known && !tracker.isGameOver) window.hud.screenPosition(known);
    else if (tracker.isGameOver) unknown('game-over');
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
function beginEdit() { editing = true; manual = null; input('confirmed').checked = false; unknown('editing'); }
function placement() {
  return Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, col) => cells.get(screenSquare(row, col, 'white')) ?? '.').join('').replace(/\.+/g, v => String(v.length))).join('/');
}
function updateMetadata(fen: string) {
  const p = fen.split(' '); input('fen').value = fen;
  ['turn', 'castling', 'ep', 'halfmove', 'fullmove'].forEach((id, i) => { input(id).value = p[i + 1]; });
}
function loadFen(raw: string) {
  const fen = validateTrustedFen(raw); beginEdit(); cells.clear();
  $('inspection').hidden = false;
  $('position-check').hidden = false;
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
    if (training) { templates = calibrate(image, fen, orientation); saveSettings(); }
    else if (!templates) throw Error('Сначала обучите фигуры на начальной позиции этой темы.');
    tracker.seed(fen); manual = { fingerprint: observation.fingerprint, fen }; editing = false; lastFingerprint = observation.fingerprint;
    updateMetadata(fen); message(training ? 'Фигуры обучены. Текущая позиция подтверждена.' : 'Позиция подтверждена. Отслеживание включено.');
    $('recognition-status').textContent = 'Позиция подтверждена вручную.';
    $('calibration-review').hidden = true;
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
    stopCapture(); resetTracking('Источник экрана изменён. Подтвердите текущую позицию.');
    await window.hud.selectSource(id);
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 } }, audio: false });
    const video = $<HTMLVideoElement>('capture-video'); video.srcObject = stream; await video.play();
    stream.getVideoTracks()[0].addEventListener('ended', () => { stopCapture(); resetTracking('Захват экрана завершён.'); });
    $('sources').replaceChildren(); $('capture-status').textContent = 'Захват включён · 30 кадров/с'; ($('region') as HTMLButtonElement).disabled = false;
    if (!rect) showPicker();
    else message('Захват активен с сохранённой областью. Нажмите «🟢 Начать новую партию».');
  } catch { message('Не удалось начать захват. Проверьте разрешение записи экрана и перезапустите HUD.'); }
}
function showPicker() {
  const video = $<HTMLVideoElement>('capture-video'); if (!video.videoWidth) return;
  picking = true; proposed = null; resetTracking('Выберите точный квадрат доски.');
  templates = null; localStorage.removeItem('nonchalant:hud:templates');
  const canvas = $<HTMLCanvasElement>('screen-preview'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(video, 0, 0);
  screenSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height); $('picker').hidden = false;
}
function initializeControls() {
  // Setup runs before state arrives. Event closures use initialized module state.
  $('direct-tab').onclick = () => { void window.hud.configure({ mode: 'direct' }); };
  $('moves-tab').onclick = () => { void window.hud.configure({ mode: 'moves' }); };
  $('screen-tab').onclick = () => { void window.hud.configure({ mode: 'screen' }); };
  $('pause').onclick = () => { void window.hud.configure({ paused: state.status !== 'paused' }); };
  $('collapse').onclick = () => { void window.hud.configure({ collapsed: !state.collapsed }); };
  $('move').onclick = () => { void window.hud.configure({ movable: !state.movable }); };
  input('sound').onchange = () => { stopSound(); void window.hud.configure({ sound: input('sound').checked }); };
  input('sound-volume').oninput = () => { $('sound-volume-value').textContent = `${input('sound-volume').value}%`; };
  input('sound-volume').onchange = () => { stopSound(); void window.hud.configure({ volume: Number(input('sound-volume').value) }); };
  input('sound-duration').onchange = () => { stopSound(); void window.hud.configure({ duration: Number(input('sound-duration').value) }); };
  $('choose-sound').onclick = async () => {
    const button = $('choose-sound') as HTMLButtonElement; button.disabled = true; stopSound();
    $('sound-message').textContent = '';
    try {
      const choice = await window.hud.chooseSound();
      if (choice) {
        $('sound-message').textContent = 'Проверяем аудиофайл…';
        await validateSound(choice); await window.hud.confirmSound(choice.id);
        $('sound-message').textContent = 'Файл сохранён. Нажмите «Прослушать», затем включите «Звук» выше.';
      }
    } catch (error) { $('sound-message').textContent = (error as Error).message; }
    finally { button.disabled = false; }
  };
  $('reset-sound').onclick = () => { stopSound(); void window.hud.resetSound().then(() => { $('sound-message').textContent = 'Выбран стандартный сигнал.'; }).catch(() => { $('sound-message').textContent = 'Не удалось сохранить настройку.'; }); };
  $('preview-sound').onclick = () => { void playSound(true); };
  $('stop-sound').onclick = () => { stopSound(); $('sound-message').textContent = 'Остановлено.'; };
  $('copy').onclick = () => { void window.hud.copyToken().then(() => message('Ключ скопирован. Вставьте его в меню HUD на сайте.')); };
  $('copy-diagnostics').onclick = () => { void window.hud.copyDiagnostics().then(() => message('Диагностика скопирована. Её можно вставить в сообщение для проверки сигнала.')); };
  $('copy-moves').onclick = () => { void window.hud.copyToken().then(() => message('Ключ скопирован. Вставьте его в расширение на вкладке Chess.com.')); };
  $('open-extension').onclick = () => { void window.hud.openExtension().catch(() => message('Не удалось открыть папку расширения.')); };
  void window.hud.getToken().then(token => { input('token').value = token; input('moves-token').value = token; });
  $('choose').onclick = () => { void chooseScreens(); };
  $('region').onclick = showPicker;
  $('new-game').onclick = startNewGame;
  $('confirm-start').onclick = () => { input('confirmed').checked = true; confirmPosition(true); };
  $('correct-start').onclick = () => { ($('advanced-fen') as HTMLDetailsElement).open = true; message('Выберите фигуру в палитре и нажмите клетку для исправления.'); };
  $('advanced-fen').addEventListener('toggle', () => {
    if (($('advanced-fen') as HTMLDetailsElement).open) $('position-check').hidden = false;
  });
  $('shortcuts').textContent = `${shortcut('P')} — пауза · ${shortcut('H')} — свернуть · ${shortcut('M')} — переместить · ${shortcut('N')} — новая партия`;
  $('capture-help').textContent = isMac
    ? 'Если захват недоступен: Системные настройки → Конфиденциальность и безопасность → Запись экрана и системного аудио. Разрешите Electron и перезапустите HUD.'
    : 'Выделяйте только доску. Окно HUD и настройки держите за её пределами. При смене размера доски заново выберите область и обучите фигуры.';
  window.hud.onNewGame?.(startNewGame);
  loadSavedSettings();
  input('orientation').onchange = () => { orientation = input('orientation').value as Orientation; resetTracking('Ориентация изменена. Нажмите «🟢 Новая партия».'); saveSettings(); drawEditor(); };
  $('load-fen').onclick = () => { try { loadFen(input('fen').value); message('Сравните редактор с кадром. Ниже отметьте «Я проверил…», затем нажмите «Подтвердить текущую позицию»; при первом запуске — «Обучить фигуры по этому кадру».'); } catch (e) { message((e as Error).message); } };
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
    rect = proposed; picking = false; $('picker').hidden = true; gate.reset();
    $('inspection').hidden = false;
    saveSettings();
    message('Область доски сохранена! Откройте стартовую позицию и нажмите «🟢 Начать новую партию».');
  };
  window.hud.onSound(() => { void playSound(false); });
  // Defer initial drawing until const/let declarations above have initialized.
  queueMicrotask(() => { drawEditor(); drawPalette(); });
  setInterval(scan, 70);
  window.addEventListener('beforeunload', () => { stopSound(); stopCapture(); window.hud.screenPosition(null); });
}

// Initialize only after all persisted state bindings have been initialized.
// Calling loadSavedSettings earlier hit the temporal dead zone and silently
// discarded saved calibration and board coordinates.
if (overlayMode) {
  document.body.classList.add('hud-mode'); $('overlay').hidden = false; $('settings').hidden = true;
} else initializeControls();
window.hud.onState(renderState);
void window.hud.getState().then(renderState);
