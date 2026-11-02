import { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, session, shell, systemPreferences, Tray } from 'electron';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { Chess } from 'chess.js';
import { NodeEngine } from './core/nodeEngine';
import { detectSacrifice } from './core/detector';
import { AnalysisSettingsStore } from './core/analysisSettings';
import { HudController } from './core/controller';
import { BridgeReceiver, localOrigin } from './core/bridgeReceiver';
import { SCREEN_STATUS, type ScreenIssue } from './core/screenStatus';
import { MoveReceiver, extensionOrigin } from './core/moveReceiver';
import { MOVE_STATUS } from './core/moveHistory';
import { SoundStore } from './core/soundStore';
import type { AppState, SourceMode } from './types';

app.setName('Tal HUD Mentality');
const soundSmoke = process.argv.includes('--hud-sound-smoke');
const smoke = process.argv.includes('--hud-smoke') || soundSmoke;
// Keep music/settings and the single-instance lock compatible with older HUDs.
const profilePath = smoke ? path.join(app.getPath('temp'), `nonchalant-hud-smoke-${process.pid}`)
  : path.join(app.getPath('appData'), 'nonchalant HUD');
fs.mkdirSync(profilePath, { recursive: true });
app.setPath('userData', profilePath);
if (!app.requestSingleInstanceLock()) app.quit();
let controls: BrowserWindow;
let overlay: BrowserWindow;
let tray: Tray;
let mode: SourceMode = smoke ? 'direct' : 'moves';
let collapsed = false, movable = false, paused = false;
let soundStore: SoundStore;
let analysisSettings: AnalysisSettingsStore;
let captureSource = '', screenSeen = 0;
let screenIssue: ScreenIssue | null = 'no-capture';
let bridgeStatus: AppState['bridge'] = 'waiting';
let serverFailed = false;
const token = randomBytes(32).toString('hex');
const engineScript = app.isPackaged
  ? path.join(process.resourcesPath, 'stockfish', 'stockfish-19-lite-single.js')
  : (fs.existsSync(path.join(__dirname, 'stockfish', 'stockfish-19-lite-single.js'))
      ? path.join(__dirname, 'stockfish', 'stockfish-19-lite-single.js')
      : path.resolve(__dirname, '../../node_modules/stockfish/bin/stockfish-19-lite-single.js'));
const controller = new HudController(
  () => new NodeEngine({ enginePath: engineScript }),
  (fen, engine, signal) => detectSacrifice(fen, engine, signal, { mode: analysisSettings?.mode ?? 'fast' }),
  (_, notify) => { broadcast(); if (notify && soundStore?.settings.enabled && controls && !controls.isDestroyed()) controls.webContents.send('hud:sound'); },
);
const bridge = new BridgeReceiver(token, fen => { if (mode === 'direct') controller.accept(fen); });
const moveReceiver = new MoveReceiver(token, fen => { if (mode === 'moves') controller.accept(fen); });
function state(): AppState {
  return { ...controller.state, mode, analysisMode: analysisSettings?.mode ?? 'fast', analysisSide: analysisSettings?.side ?? 'white', sound: soundStore?.settings.enabled ?? false, soundSettings: soundStore?.settings ?? { enabled: false, volume: 35, duration: 5, stopOnMove: true, selection: 'selected', selectedId: null, tracks: [], activeIds: [], includeTone: true, name: null, revision: '' }, collapsed, movable, bridge: bridgeStatus,
    version: app.getVersion(), screenIssue, moveIssue: moveReceiver.issue, movesCount: moveReceiver.count, capturePermission: process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'not-required' };
}
function broadcast() {
  for (const win of [controls, overlay]) if (win && !win.isDestroyed()) win.webContents.send('hud:state', state());
}
function settings() { controls.show(); controls.focus(); }
function layoutOverlay() {
  overlay.setSize(collapsed ? 74 : 292, 66);
  overlay.setIgnoreMouseEvents(!movable, { forward: true });
  overlay.setFocusable(movable);
  broadcast(); updateMenu();
}
function setPause(value: boolean) { paused = value; controller.setPaused(value); bridge.reset(); screenSeen = 0; updateMenu(); broadcast(); }
function updateMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '🟢 Новая партия (с 1-го хода)', click: () => { if (controls && !controls.isDestroyed()) controls.webContents.send('hud:new-game'); } },
    { label: 'Настройки и распознавание…', click: settings },
    { label: paused ? 'Включить' : 'Пауза', click: () => setPause(!paused) },
    { label: collapsed ? 'Развернуть HUD' : 'Свернуть HUD', click: () => { collapsed = !collapsed; layoutOverlay(); } },
    { label: movable ? 'Закрепить • пропускать клики' : 'Переместить HUD', click: () => { movable = !movable; layoutOverlay(); } },
    { type: 'separator' }, { role: 'quit', label: 'Завершить HUD' },
  ]));
}
function isControls(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) { return event.sender === controls?.webContents && event.senderFrame === controls.webContents.mainFrame; }
function isApp(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) { return isControls(event) || event.sender === overlay?.webContents && event.senderFrame === overlay.webContents.mainFrame; }

const server = createServer((req, res) => {
  const origin = req.headers.origin || '';
  const extensionId = req.headers['x-nonchalant-extension'];
  const textSource = req.url === '/moves' && (extensionOrigin(origin) || !origin && typeof extensionId === 'string' && /^[a-p]{32}$/.test(extensionId));
  if (!(req.url === '/position' && localOrigin(origin) || textSource)) { res.writeHead(403).end(); return; }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Nonchalant-Extension');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(415).end(); return; }
  let body = '', tooLarge = false;
  req.setTimeout(2000, () => req.destroy());
  req.on('data', chunk => { body += chunk; if (body.length > (textSource ? 131072 : 4096)) { tooLarge = true; res.writeHead(413).end(); req.destroy(); } });
  req.on('end', () => {
    if (tooLarge) return;
    try {
      const accepted = textSource ? moveReceiver.receive(JSON.parse(body)) : bridge.receive(JSON.parse(body));
      bridgeStatus = bridge.status; broadcast();
      if (textSource) res.writeHead(accepted ? 200 : 400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: accepted,
        detail: !accepted ? 'Неверный ключ или сообщение.' : mode !== 'moves' ? 'Выберите «Ходы Chess.com» в приложении HUD.' : `${MOVE_STATUS[moveReceiver.issue]} · Запомнено полуходов: ${moveReceiver.count}` }));
      else res.writeHead(accepted ? 204 : 400).end();
    } catch { res.writeHead(400).end(); }
  });
});
server.on('error', () => { serverFailed = true; bridgeStatus = 'conflict'; controller.invalidate(); broadcast(); });

void app.whenReady().then(async () => {
  soundStore = new SoundStore(app.getPath('userData'));
  analysisSettings = new AnalysisSettingsStore(app.getPath('userData'));
  controller.setSide(analysisSettings.side);
  const webPreferences: Electron.WebPreferences = { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' };
  controls = new BrowserWindow({ width: 960, height: 880, minWidth: 780, minHeight: 660, title: 'Tal HUD Mentality', backgroundColor: '#17181b', webPreferences, show: false });
  const area = screen.getPrimaryDisplay().workArea;
  overlay = new BrowserWindow({ width: 292, height: 66, x: area.x + area.width - 316, y: area.y + 24, frame: false, transparent: true, resizable: false, hasShadow: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, webPreferences, show: false });
  if (process.platform === 'darwin') overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setAlwaysOnTop(true, 'floating'); overlay.setIgnoreMouseEvents(true, { forward: true });
  for (const win of [controls, overlay]) {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
  }
  const settingsPath = path.join(app.getPath('userData'), 'hud-window.json');
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (Number.isInteger(saved.x) && Number.isInteger(saved.y) && screen.getAllDisplays().some(d => saved.x >= d.workArea.x && saved.y >= d.workArea.y && saved.x + 74 <= d.workArea.x + d.workArea.width && saved.y + 66 <= d.workArea.y + d.workArea.height)) overlay.setPosition(saved.x, saved.y);
  } catch { /* first run */ }
  overlay.on('moved', () => { const [x, y] = overlay.getPosition(); fs.writeFile(settingsPath, JSON.stringify({ x, y }), () => {}); });
  controls.on('close', event => { if (!quitting) { event.preventDefault(); controls.hide(); } });
  overlay.on('closed', () => app.quit());
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANklEQVQ4T2NkoBAwUqifYdQABhYGBv5v3rz5z8jIyAhSg2kA0wBmG0CKQXzUMGDEBSM0DJUAAAFJMBHFh6VWAAAAAElFTkSuQmCC');
  tray = new Tray(icon); if (process.platform === 'darwin') tray.setTitle('♞'); tray.setToolTip('Tal HUD Mentality'); updateMenu();
  ipcMain.handle('hud:state', event => { if (!isApp(event)) throw Error('Unauthorized'); return state(); });
  ipcMain.handle('hud:token', event => { if (!isControls(event)) throw Error('Unauthorized'); return token; });
  ipcMain.handle('hud:copy-token', event => { if (!isControls(event)) throw Error('Unauthorized'); clipboard.writeText(token); });
  ipcMain.handle('hud:choose-sound', async event => {
    if (!isControls(event)) throw Error('Unauthorized');
    const result = await dialog.showOpenDialog(controls, { title: 'Звук сильной жертвы', properties: ['openFile'],
      filters: [{ name: 'Аудио', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }] });
    return result.canceled || !result.filePaths[0] ? null : soundStore.stage(result.filePaths[0]);
  });
  ipcMain.handle('hud:choose-sounds', async event => {
    if (!isControls(event)) throw Error('Unauthorized');
    const result = await dialog.showOpenDialog(controls, { title: 'Добавить музыку', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Аудио', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }] });
    if (result.canceled) return [];
    if (result.filePaths.length > 20) throw Error('За один раз можно добавить не больше 20 треков.');
    const choices = [];
    try {
      for (const file of result.filePaths) choices.push(soundStore.stage(file));
      return choices;
    } catch (error) {
      for (const choice of choices) soundStore.discard(choice.id);
      throw error;
    }
  });
  ipcMain.handle('hud:confirm-sound', (event, id) => {
    if (!isControls(event) || typeof id !== 'string') throw Error('Unauthorized');
    soundStore.confirm(id); broadcast();
  });
  ipcMain.handle('hud:discard-sound', (event, id) => {
    if (!isControls(event) || typeof id !== 'string') throw Error('Unauthorized');
    soundStore.discard(id);
  });
  ipcMain.handle('hud:reset-sound', event => { if (!isControls(event)) throw Error('Unauthorized'); soundStore.reset(); broadcast(); });
  ipcMain.handle('hud:remove-sound', (event, id) => {
    if (!isControls(event) || typeof id !== 'string') throw Error('Unauthorized');
    soundStore.remove(id); broadcast();
  });
  ipcMain.handle('hud:read-sound', (event, id) => { if (!isControls(event) || id !== undefined && typeof id !== 'string') throw Error('Unauthorized'); return soundStore.read(id); });
  ipcMain.handle('hud:copy-diagnostics', event => {
    if (!isControls(event)) throw Error('Unauthorized');
    clipboard.writeText(JSON.stringify({ version: app.getVersion(), source: mode, status: controller.state.status,
      analysisMode: analysisSettings.mode, analysisSide: analysisSettings.side, recordedPlies: moveReceiver.count, notices: controller.notificationHistory }, null, 2));
  });
  ipcMain.handle('hud:open-extension', async event => {
    if (!isControls(event)) throw Error('Unauthorized');
    const source = app.isPackaged ? path.join(process.resourcesPath, 'browser-extension') : path.join(__dirname, 'browser-extension');
    // Portable executables unpack into a temporary folder. Chrome needs a
    // stable unpacked-extension path that survives closing the application.
    const destination = path.join(app.getPath('userData'), 'browser-extension');
    fs.cpSync(source, destination, { recursive: true });
    const error = await shell.openPath(destination);
    if (error) throw Error('Не удалось открыть папку расширения.');
  });
  ipcMain.on('hud:settings', event => { if (isApp(event)) settings(); });
  ipcMain.handle('hud:configure', (event, value) => {
    if (!isControls(event) || !value || typeof value !== 'object') throw Error('Unauthorized');
    if (['screen', 'direct', 'moves'].includes(value.mode) && value.mode !== mode) { mode = value.mode; bridge.reset(); screenSeen = 0; controller.invalidate(); }
    if (value.analysisMode !== undefined) {
      const changed = analysisSettings.mode !== value.analysisMode;
      analysisSettings.setMode(value.analysisMode);
      if (changed) controller.resetAnalysis();
    }
    if (value.analysisSide !== undefined) {
      analysisSettings.setSide(value.analysisSide);
      controller.setSide(analysisSettings.side);
    }
    if (typeof value.paused === 'boolean') setPause(value.paused);
    if (typeof value.sound === 'boolean' || typeof value.volume === 'number' || typeof value.duration === 'number' ||
      typeof value.stopOnMove === 'boolean' || value.selection !== undefined || value.selectedId !== undefined || value.activeIds !== undefined || value.includeTone !== undefined) {
      soundStore.configure({ enabled: value.sound, volume: value.volume, duration: value.duration, stopOnMove: value.stopOnMove,
        selection: value.selection, selectedId: value.selectedId, activeIds: value.activeIds, includeTone: value.includeTone });
    }
    if (typeof value.collapsed === 'boolean') collapsed = value.collapsed;
    if (typeof value.movable === 'boolean') movable = value.movable;
    layoutOverlay();
  });
  ipcMain.handle('hud:sources', async event => {
    if (!isControls(event)) throw Error('Unauthorized');
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 400, height: 260 } });
    broadcast(); return sources.map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
  });
  ipcMain.handle('hud:select-source', async (event, id) => {
    if (!isControls(event) || typeof id !== 'string') throw Error('Unauthorized');
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
    if (!sources.some(s => s.id === id)) throw Error('Экран больше недоступен.');
    captureSource = id; controller.invalidate();
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission) => contents === controls.webContents && ['display-capture'].includes(permission));
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(contents === controls.webContents && permission === 'display-capture'));
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (request.frame !== controls.webContents.mainFrame || !captureSource) { callback({}); return; }
    try { const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }); callback({ video: sources.find(s => s.id === captureSource) }); }
    catch { callback({}); }
  });
  ipcMain.on('hud:screen-position', (event, fen, issue) => {
    if (!isControls(event) || mode !== 'screen' || !(fen === null || typeof fen === 'string' && fen.length < 200)) return;
    const nextIssue = fen ? null : typeof issue === 'string' && Object.hasOwn(SCREEN_STATUS, issue) ? issue as ScreenIssue : 'metadata';
    const changed = screenIssue !== nextIssue;
    screenIssue = nextIssue;
    screenSeen = Date.now(); controller.accept(fen);
    if (changed) broadcast();
  });
  globalShortcut.register('CommandOrControl+Shift+P', () => setPause(!paused));
  globalShortcut.register('CommandOrControl+Shift+H', () => { collapsed = !collapsed; layoutOverlay(); });
  globalShortcut.register('CommandOrControl+Shift+M', () => { movable = !movable; layoutOverlay(); });
  globalShortcut.register('CommandOrControl+Shift+N', () => { if (controls && !controls.isDestroyed()) controls.webContents.send('hud:new-game'); });
  await controls.loadFile(path.join(__dirname, 'index.html'));
  await overlay.loadFile(path.join(__dirname, 'index.html'), { query: { overlay: '1' } });
  await new Promise<void>(resolve => {
    const unavailable = () => resolve();
    server.once('error', unavailable);
    server.listen(smoke ? 0 : 18319, '127.0.0.1', () => { server.removeListener('error', unavailable); resolve(); });
  });
  // Audio-only smoke supplies state transitions without a connected board.
  if (!soundSmoke) setInterval(() => {
    if (mode === 'direct' && !serverFailed) { bridge.tick(); if (bridgeStatus !== bridge.status) { bridgeStatus = bridge.status; broadcast(); } }
    else if (mode === 'moves' && !serverFailed) { const before = moveReceiver.issue; moveReceiver.tick(); if (before !== moveReceiver.issue) broadcast(); }
    else if (mode === 'screen' && Date.now() - screenSeen > 1800) controller.accept(null);
  }, 250).unref();
  broadcast();
  if (smoke) { try { if (soundSmoke) await runSoundSmoke(); else await runSmoke(); app.quit(); } catch (error) { console.error(error); app.exit(1); } return; }
  controls.show(); overlay.showInactive();
});
let quitting = false;
app.on('before-quit', () => { quitting = true; controller.dispose(); server.close(); globalShortcut.unregisterAll(); });
app.on('second-instance', () => controls && settings());
app.on('activate', () => controls && settings());
app.on('window-all-closed', () => app.quit());

async function runSoundSmoke() {
  // Test-only WAVs live in the isolated temporary profile, never in the app.
  // The picker is stubbed; Chromium decoding, preload IPC and audio are real.
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const js = (source: string) => controls.webContents.executeJavaScript(source);
  const configure = async (value: object) => { await js(`window.hud.configure(${JSON.stringify(value)})`); await wait(100); };
  const position = async (status: AppState['status'], idea = false) => {
    controller.state = { status, idea, revision: controller.state.revision + 1 }; broadcast(); await wait(100);
  };
  const notify = async () => { await position('checked', true); controls.webContents.send('hud:sound'); await wait(450); };
  const audible = async (expected: boolean, message: string) => {
    await wait(250);
    if (controls.webContents.isCurrentlyAudible() !== expected) throw Error(message);
  };
  const samples = 44100 * 4, wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 44100) * 500), 44 + i * 2);
  const sources = ['fixture-one.wav', 'fixture-two.wav'].map(name => path.join(app.getPath('userData'), name));
  sources.forEach(file => fs.writeFileSync(file, wav));
  const broken = path.join(app.getPath('userData'), 'broken.mp3'); fs.writeFileSync(broken, 'not audio');
  const choose = async (files: string[] | null) => {
    const original = dialog.showOpenDialog;
    dialog.showOpenDialog = (async (_window: unknown, options: Electron.OpenDialogOptions) => {
      if (!options.properties?.includes('multiSelections')) throw Error('Music picker does not allow multiple files');
      return { canceled: !files, filePaths: files ?? [] };
    }) as typeof dialog.showOpenDialog;
    try {
      await controls.webContents.executeJavaScript(`document.getElementById('choose-sound').click()`);
      const deadline = Date.now() + 12000;
      while (await controls.webContents.executeJavaScript(`document.getElementById('choose-sound').disabled`)) {
        if (Date.now() > deadline) throw Error('Sound picker did not finish');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } finally { dialog.showOpenDialog = original; }
  };
  await choose([...sources, broken]);
  if (soundStore.settings.tracks.length !== 2 || soundStore.settings.name !== 'fixture-two.wav') throw Error('Multi-file import did not retain both valid files');
  const invalidMessage = await js(`document.getElementById('sound-message').textContent`);
  if (!invalidMessage.includes('не воспроизводится') || !invalidMessage.includes('Добавлено: 2')) throw Error('Mixed import did not report the invalid media clearly');
  const beforeCancel = JSON.stringify(soundStore.settings);
  await choose(null);
  if (JSON.stringify(soundStore.settings) !== beforeCancel) throw Error('Cancel changed the library');
  sources.forEach(file => fs.rmSync(file));
  const [first, second] = soundStore.settings.tracks;
  if (soundStore.settings.includeTone || soundStore.settings.activeIds.length !== 2) throw Error('Imported music did not replace the default tone selection');
  await configure({ sound: true, volume: 12, duration: 1, selectedId: first.id });
  const saved = new SoundStore(app.getPath('userData'));
  if (saved.settings.tracks.length !== 2 || saved.settings.volume !== 12 || saved.read()?.name !== first.name) throw Error('Managed library did not persist independently of source files');
  const rendered = await js(`document.getElementById('sound-name').textContent`);
  if (rendered !== first.name) throw Error('Selected track name did not render');
  await js(`
    window.__hudAudio = { plays: 0, tones: 0, last: null };
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(...args) { super(...args); window.__hudAudio.tones++; }
    };
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__hudAudio.plays++; window.__hudAudio.last = this;
      return originalPlay.call(this);
    };
    void 0;
  `);
  await js(`document.getElementById('preview-sound').click()`);
  await wait(250); await audible(true, 'Preview did not play in hidden controls');
  await wait(850); await audible(false, 'Numeric clip duration did not stop the audio');
  await configure({ duration: 0, stopOnMove: false });
  await notify(); await audible(true, 'Full-track notification did not play');
  const plays = await js('window.__hudAudio.plays');
  await position('checking');
  await wait(650); await audible(true, 'Music stopped after a move with stopOnMove disabled');
  await position('checked', true); controls.webContents.send('hud:sound');
  await wait(250);
  if (await js('window.__hudAudio.plays') !== plays) throw Error('New notification restarted or overlapped an unfinished track');
  if (await js('window.__hudAudio.last.currentTime') < 1) throw Error('Track progress was reset');
  await wait(3000); await audible(false, 'Full track did not stop naturally');
  await configure({ stopOnMove: true });
  await notify(); await audible(true, 'Move-stop notification did not start');
  await position('checking'); await audible(false, 'New position did not stop music with stopOnMove enabled');
  await configure({ stopOnMove: false, selection: 'random' });
  await notify(); await audible(true, 'Random notification did not start');
  await configure({ sound: false }); await audible(false, 'Mute did not stop playback');
  await configure({ sound: true });
  await notify(); await position('paused'); await audible(false, 'Pause did not stop playback');
  await notify(); await position('unknown'); await audible(false, 'Unavailable source did not stop playback');
  await notify(); await configure({ mode: 'moves' }); await audible(false, 'Source switch did not stop playback');
  await js(`document.getElementById('preview-sound').click()`);
  await wait(400); await audible(true, 'Manual preview failed without a board source');
  await js(`document.getElementById('stop-sound').click()`); await audible(false, 'Manual stop failed');
  const randomSaved = new SoundStore(app.getPath('userData')).settings;
  if (randomSaved.selection !== 'random' || randomSaved.duration !== 0 || randomSaved.stopOnMove) throw Error('New playback settings did not persist');
  await js('window.hud.resetSound()'); await wait(100);
  if (soundStore.read() !== null || soundStore.settings.tracks.length !== 2) throw Error('Standard tone reset removed the library');
  await js(`document.getElementById('preview-sound').click()`); await wait(450);
  if ((await js(`document.getElementById('sound-message').textContent`)).includes('Не удалось')) throw Error('Built-in tone failed');
  const waitPlaylist = async (ids: string[], tone: boolean) => {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const settings = soundStore.settings;
      const busy = await js(`document.getElementById('choose-sound').disabled`);
      if (!busy && settings.includeTone === tone && settings.activeIds.length === ids.length && ids.every(id => settings.activeIds.includes(id))) return;
      await wait(25);
    }
    throw Error('Checkbox playlist did not finish saving');
  };
  await js(`document.getElementById('sound-tone').click()`);
  await waitPlaylist([], false);
  const beforeSilent = await js('window.__hudAudio.plays');
  const beforeSilentTones = await js('window.__hudAudio.tones');
  await notify(); await audible(false, 'An empty playlist played a fallback tone');
  if (await js('window.__hudAudio.plays') !== beforeSilent || await js('window.__hudAudio.tones') !== beforeSilentTones) throw Error('Empty playlist attempted audio playback');
  // Consecutive synchronous clicks must not lose the latest checkbox snapshot.
  await js(`
    const boxes = [...document.querySelectorAll('input[data-sound-track]')];
    boxes[0].click(); boxes[1].click(); boxes[0].click();
  `);
  await waitPlaylist([second.id], false);
  for (let i = 0; i < 8; i++) if (soundStore.read()?.name !== second.name) throw Error('An unchecked track or tone entered the playlist');
  await configure({ selectedId: first.id });
  await js(`document.querySelector('button[data-remove-sound="${first.id}"]').click()`); await wait(200);
  const afterRemoval = new SoundStore(app.getPath('userData')).settings;
  if (afterRemoval.tracks.length !== 1 || afterRemoval.activeIds.length || afterRemoval.includeTone) throw Error('Removing the selected track enabled an unchecked sound');
  await configure({ duration: 0, stopOnMove: false, activeIds: [second.id], includeTone: false });
  await new Promise<void>(resolve => { controls.webContents.once('did-finish-load', () => resolve()); controls.webContents.reload(); });
  await wait(100);
  const restored = await js(`({tone:document.getElementById('sound-tone').checked, checked:[...document.querySelectorAll('input[data-sound-track]:checked')].map(el=>el.value)})`);
  if (restored.tone || restored.checked.length !== 1 || restored.checked[0] !== second.id) throw Error('Checkbox selection did not survive renderer reload');
  const out = path.resolve(__dirname, '../test-results'); fs.mkdirSync(out, { recursive: true });
  await js(`document.getElementById('sound-panel').open=true; document.getElementById('sound-message').textContent=''; window.scrollTo(0,0)`);
  fs.writeFileSync(path.join(out, 'sound-settings.png'), (await controls.webContents.capturePage()).toPNG());
  console.log('HUD sound smoke PASS: multi-import, real playback and duration/move policies, checked subset only, deselected tone, empty playlist silence, rapid checkbox saves, removal without fallback, and persistent selection after reload.');
}

async function runSmoke() {
  const out = path.resolve(__dirname, '../test-results'); fs.mkdirSync(out, { recursive: true });
  const text = await controls.webContents.executeJavaScript('document.body.innerText');
  if (!text.includes('Доска на экране') || !text.includes('Tal HUD Mentality') || app.getName() !== 'Tal HUD Mentality') throw Error('Settings did not render with the new app name');
  if (state().analysisMode !== 'fast' || await controls.webContents.executeJavaScript(`document.getElementById('analysis-mode').value`) !== 'fast') throw Error('Fresh profile did not use fast analysis');
  if (state().analysisSide !== 'white' || await controls.webContents.executeJavaScript(`document.getElementById('analysis-side').value`) !== 'white') throw Error('Fresh profile did not select white');
  fs.writeFileSync(path.join(out, 'settings.png'), (await controls.webContents.capturePage()).toPNG());
  for (const status of ['unknown', 'checking', 'checked', 'paused', 'error', 'opponent'] as const) {
    overlay.webContents.send('hud:state', { ...state(), status, idea: false });
    await overlay.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const rendered = await overlay.webContents.executeJavaScript('document.body.innerText');
    if (rendered.includes('Есть сильная жертва')) throw Error('Unexpected hint');
  }
  // Exercise the real authenticated local HTTP -> controller -> Stockfish -> HUD path.
  const fixture = 'r2q1b1r/pp1np1pk/2p2n1p/8/2BP2N1/8/PPP2PPP/R1BQK2R w KQ - 3 11';
  let sequence = 0;
  const post = async (fen: string | null) => {
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Smoke bridge did not start');
    const response = await fetch(`http://127.0.0.1:${address.port}/position`, {
      method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, session: 'hud-smoke-session', sequence: ++sequence, fen, orientation: 'white', sentAt: Date.now() }),
    });
    if (response.status !== 204) throw Error('Bridge rejected smoke fixture');
  };
  await post(fixture);
  const pulse = setInterval(() => { void post(fixture).catch(() => {}); }, 450);
  try {
    const deadline = Date.now() + 95_000;
    while (!controller.state.idea && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    if (!controller.state.idea) throw Error('Real Stockfish did not reach positive HUD verdict');
    await controls.webContents.executeJavaScript(`
      const choice = document.getElementById('analysis-mode'); choice.value = 'verified'; choice.dispatchEvent(new Event('change', {bubbles:true}));
    `);
    const modeDeadline = Date.now() + 3000;
    while (state().analysisMode !== 'verified' && Date.now() < modeDeadline) await new Promise(resolve => setTimeout(resolve, 20));
    if (state().analysisMode !== 'verified' || controller.state.idea) throw Error('Mode switch did not invalidate the fast verdict');
    const verifiedDeadline = Date.now() + 95000;
    while (!controller.state.idea && Date.now() < verifiedDeadline) await new Promise(resolve => setTimeout(resolve, 100));
    if (!controller.state.idea) throw Error('Verified mode did not complete independent replies on the same position');

  } finally { clearInterval(pulse); }
  const waitForSignal = async () => {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const rendered = await overlay.webContents.executeJavaScript(`({signal:document.getElementById('signal').textContent,text:document.getElementById('overlay').textContent,settingsHidden:document.getElementById('settings').hidden})`);
      if (rendered.signal === 'Есть сильная жертва' && rendered.settingsHidden && !/Bxh|e5h7|[+-]\d/.test(rendered.text)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error('HUD display contract failed');
  };
  await waitForSignal();
  fs.writeFileSync(path.join(out, 'overlay.png'), (await overlay.webContents.capturePage()).toPNG());
  await post(null);
  if (controller.state.idea || controller.state.status !== 'unknown') throw Error('Changed source did not immediately clear signal');
  await controls.webContents.executeJavaScript(`window.hud.configure({analysisMode:'fast'})`);
  const opponent = new Chess(fixture); opponent.move('Nxh6');
  await post(opponent.fen());
  const opponentPulse = setInterval(() => { void post(opponent.fen()).catch(() => {}); }, 450);
  try {
    const deadline = Date.now() + 5000;
    while (state().status !== 'opponent' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    if (state().status !== 'opponent' || state().idea) throw Error('Opponent turn was analysed instead of waiting');
  } finally { clearInterval(opponentPulse); }
  await post(null);

  // A real move-list HTTP request is replayed locally before reaching Stockfish.
  await controls.webContents.executeJavaScript("document.getElementById('moves-tab').click()");
  const modeDeadline = Date.now() + 3000;
  while (mode !== 'moves' && Date.now() < modeDeadline) await new Promise(resolve => setTimeout(resolve, 20));
  if (mode !== 'moves') throw Error('Text source did not activate');
  const sans = ['d4','c6','e4','d5','Nc3','dxe4','Nxe4','Nf6','Ng5','h6','Nxf7','Kxf7','Nf3','Bg4','Ne5+','Kg8','Nxg4','Nbd7','Bc4+','Kh7','Qd3+','g6'];
  const board = new Chess(); sans.forEach(san => board.move(san));
  if (board.fen() !== 'r2q1b1r/pp1np2k/2p2npp/8/2BP2N1/3Q4/PPP2PPP/R1B1K2R w KQ - 0 12') throw Error('Text fixture does not reconstruct the expected FEN');
  let textSequence = 0;
  const textPost = async (ready = true) => {
    const address = server.address(); if (!address || typeof address === 'string') throw Error('Text server missing');
    const response = await fetch(`http://127.0.0.1:${address.port}/moves`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'chrome-extension://' + 'a'.repeat(32) },
      body: JSON.stringify({ token, session: 'text-smoke-session', sequence: ++textSequence, sentAt: Date.now(),
        game: 'https://www.chess.com/game/live/smoke-fixture', startFen: new Chess().fen(),
        moves: sans.map((san, i) => ({ ply: i + 1, san })), currentPly: sans.length, visible: true, ready }),
    });
    if (response.status !== 200 || !(await response.json()).ok) throw Error('Text bridge rejected fixture');
  };
  // A distinct positive position forces the text route through a fresh engine
  // search, rather than serving the direct-source verdict from cache.
  await textPost();
  const textPulse = setInterval(() => { void textPost().catch(() => {}); }, 450);
  try {
    const deadline = Date.now() + 95_000;
    while (!controller.state.idea && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    if (!controller.state.idea || moveReceiver.count !== sans.length || moveReceiver.issue !== 'connected') throw Error('Text replay did not reach positive HUD');
  } finally { clearInterval(textPulse); }
  await waitForSignal();
  fs.writeFileSync(path.join(out, 'text-settings.png'), (await controls.webContents.capturePage()).toPNG());
  await textPost(false);
  if (controller.state.idea || controller.state.status !== 'unknown') throw Error('Changed text did not immediately withdraw signal');
  await controls.webContents.executeJavaScript("document.getElementById('screen-tab').click()");
  await controls.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  fs.writeFileSync(path.join(out, 'screen-settings.png'), (await controls.webContents.capturePage()).toPNG());
  await controls.webContents.executeJavaScript(`window.hud.configure({analysisMode:'verified'})`);
  await controls.webContents.executeJavaScript(`
    const side = document.getElementById('analysis-side'); side.value = 'black'; side.dispatchEvent(new Event('change', {bubbles:true}));
  `);
  const sideDeadline = Date.now() + 3000;
  while (state().analysisSide !== 'black' && Date.now() < sideDeadline) await new Promise(resolve => setTimeout(resolve, 20));
  if (state().analysisSide !== 'black') throw Error('Side selector did not save');
  // Regression: persisted settings must survive a real renderer reload. Old
  // initialization invoked the loader before its let bindings existed.
  await controls.webContents.executeJavaScript(`
    localStorage.setItem('nonchalant:hud:rect', JSON.stringify({x:10,y:20,size:512}));
    localStorage.setItem('nonchalant:hud:orientation','black');
  `);
  await new Promise<void>(resolve => { controls.webContents.once('did-finish-load', () => resolve()); controls.webContents.reload(); });
  const restored = await controls.webContents.executeJavaScript(`({orientation:document.getElementById('orientation').value, ready:!document.getElementById('region').disabled, known:document.getElementById('confirmed').checked, analysis:document.getElementById('analysis-mode').value,side:document.getElementById('analysis-side').value})`);
  if (restored.orientation !== 'black' || !restored.ready || restored.known || restored.analysis !== 'verified' || restored.side !== 'black') throw Error('Persisted screen setup lost or unconfirmed FEN trusted');
  console.log('HUD smoke PASS: native windows, all statuses, reported Nxh6 via authenticated HTTP/FEN and Bf7 via22-ply text replay, real Stockfish, fast/verified switch with cache invalidation, own-side filter and saved side/mode, boolean-only HUD, immediate withdrawal. Screen permission: ' + state().capturePermission);
}
