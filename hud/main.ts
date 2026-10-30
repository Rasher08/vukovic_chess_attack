import { app, BrowserWindow, clipboard, desktopCapturer, globalShortcut, ipcMain, Menu, nativeImage, screen, session, systemPreferences, Tray } from 'electron';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { NodeEngine } from './core/nodeEngine';
import { detectBrilliant } from './core/detector';
import { HudController } from './core/controller';
import { BridgeReceiver, localOrigin } from './core/bridgeReceiver';
import type { AppState, SourceMode } from './types';

app.setName('nonchalant HUD');
const smoke = process.argv.includes('--hud-smoke');
if (!app.requestSingleInstanceLock()) app.quit();
let controls: BrowserWindow;
let overlay: BrowserWindow;
let tray: Tray;
let mode: SourceMode = 'direct';
let sound = false, collapsed = false, movable = false, paused = false;
let captureSource = '', screenSeen = 0;
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
  detectBrilliant,
  (_, notify) => { broadcast(); if (notify && sound && controls && !controls.isDestroyed()) controls.webContents.send('hud:sound'); },
);
const bridge = new BridgeReceiver(token, fen => { if (mode === 'direct') controller.accept(fen); });
function state(): AppState {
  return { ...controller.state, mode, sound, collapsed, movable, bridge: bridgeStatus,
    capturePermission: systemPreferences.getMediaAccessStatus('screen') };
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
  if (req.url !== '/position' || !localOrigin(origin)) { res.writeHead(403).end(); return; }
  res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(415).end(); return; }
  let body = '', tooLarge = false;
  req.setTimeout(2000, () => req.destroy());
  req.on('data', chunk => { body += chunk; if (body.length > 4096) { tooLarge = true; res.writeHead(413).end(); req.destroy(); } });
  req.on('end', () => {
    if (tooLarge) return;
    try {
      const accepted = bridge.receive(JSON.parse(body));
      bridgeStatus = bridge.status; broadcast();
      res.writeHead(accepted ? 204 : 400).end();
    } catch { res.writeHead(400).end(); }
  });
});
server.on('error', () => { serverFailed = true; bridgeStatus = 'conflict'; controller.invalidate(); broadcast(); });

void app.whenReady().then(async () => {
  const webPreferences = { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false };
  controls = new BrowserWindow({ width: 960, height: 880, minWidth: 780, minHeight: 660, title: 'nonchalant · HUD', backgroundColor: '#17181b', webPreferences, show: false });
  const area = screen.getPrimaryDisplay().workArea;
  overlay = new BrowserWindow({ width: 292, height: 66, x: area.x + area.width - 316, y: area.y + 24, frame: false, transparent: true, resizable: false, hasShadow: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, webPreferences, show: false });
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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
  tray = new Tray(icon); tray.setTitle('!!'); tray.setToolTip('nonchalant HUD'); updateMenu();
  ipcMain.handle('hud:state', event => { if (!isApp(event)) throw Error('Unauthorized'); return state(); });
  ipcMain.handle('hud:token', event => { if (!isControls(event)) throw Error('Unauthorized'); return token; });
  ipcMain.handle('hud:copy-token', event => { if (!isControls(event)) throw Error('Unauthorized'); clipboard.writeText(token); });
  ipcMain.on('hud:settings', event => { if (isApp(event)) settings(); });
  ipcMain.handle('hud:configure', (event, value) => {
    if (!isControls(event) || !value || typeof value !== 'object') throw Error('Unauthorized');
    if (['screen', 'direct'].includes(value.mode) && value.mode !== mode) { mode = value.mode; bridge.reset(); screenSeen = 0; controller.invalidate(); }
    if (typeof value.paused === 'boolean') setPause(value.paused);
    if (typeof value.sound === 'boolean') sound = value.sound;
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
  ipcMain.on('hud:screen-position', (event, fen) => {
    if (!isControls(event) || mode !== 'screen' || !(fen === null || typeof fen === 'string' && fen.length < 200)) return;
    screenSeen = Date.now(); controller.accept(fen);
  });
  globalShortcut.register('CommandOrControl+Shift+P', () => setPause(!paused));
  globalShortcut.register('CommandOrControl+Shift+H', () => { collapsed = !collapsed; layoutOverlay(); });
  globalShortcut.register('CommandOrControl+Shift+M', () => { movable = !movable; layoutOverlay(); });
  await controls.loadFile(path.join(__dirname, 'index.html'));
  await overlay.loadFile(path.join(__dirname, 'index.html'), { query: { overlay: '1' } });
  server.listen(18319, '127.0.0.1');
  setInterval(() => {
    if (mode === 'direct' && !serverFailed) { bridge.tick(); if (bridgeStatus !== bridge.status) { bridgeStatus = bridge.status; broadcast(); } }
    else if (Date.now() - screenSeen > 1800) controller.accept(null);
  }, 250).unref();
  broadcast();
  if (smoke) { try { await runSmoke(); app.quit(); } catch (error) { console.error(error); app.exit(1); } return; }
  controls.show(); overlay.showInactive();
});
let quitting = false;
app.on('before-quit', () => { quitting = true; controller.dispose(); server.close(); globalShortcut.unregisterAll(); });
app.on('second-instance', () => controls && settings());
app.on('activate', () => controls && settings());
app.on('window-all-closed', () => app.quit());

async function runSmoke() {
  const out = path.resolve(__dirname, '../test-results'); fs.mkdirSync(out, { recursive: true });
  const text = await controls.webContents.executeJavaScript('document.body.innerText');
  if (!text.includes('Распознавание') || !text.includes('nonchalant')) throw Error('Settings did not render');
  fs.writeFileSync(path.join(out, 'settings.png'), (await controls.webContents.capturePage()).toPNG());
  for (const status of ['unknown', 'checking', 'checked', 'paused', 'error'] as const) {
    overlay.webContents.send('hud:state', { ...state(), status, idea: false });
    await overlay.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const rendered = await overlay.webContents.executeJavaScript('document.body.innerText');
    if (rendered.includes('Есть блестящая идея')) throw Error('Unexpected hint');
  }
  // Exercise the real authenticated local HTTP -> controller -> Stockfish -> HUD path.
  const fixture = 'r4rk1/1b2bppp/ppq1p3/2ppB2n/5P2/1P1BP3/P1PPQ1PP/R4RK1 w - - 0 15';
  let sequence = 0;
  const post = async (fen: string | null) => {
    const response = await fetch('http://127.0.0.1:18319/position', {
      method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, session: 'hud-smoke-session', sequence: ++sequence, fen, orientation: 'white', sentAt: Date.now() }),
    });
    if (response.status !== 204) throw Error('Bridge rejected smoke fixture');
  };
  await post(fixture);
  const pulse = setInterval(() => { void post(fixture).catch(() => {}); }, 450);
  try {
    const deadline = Date.now() + 45_000;
    while (!controller.state.idea && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    if (!controller.state.idea) throw Error('Real Stockfish did not reach positive HUD verdict');
  } finally { clearInterval(pulse); }
  await overlay.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  fs.writeFileSync(path.join(out, 'overlay.png'), (await overlay.webContents.capturePage()).toPNG());
  const rendered = await overlay.webContents.executeJavaScript('document.body.innerText');
  if (!rendered.includes('Есть блестящая идея') || /Bxh|e5h7|[+-]\d/.test(rendered)) throw Error('HUD display contract failed');
  await post(null);
  if (controller.state.idea || controller.state.status !== 'unknown') throw Error('Changed source did not immediately clear signal');
  await controls.webContents.executeJavaScript("document.getElementById('screen-tab').click()");
  await controls.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  fs.writeFileSync(path.join(out, 'screen-settings.png'), (await controls.webContents.capturePage()).toPNG());
  console.log('HUD smoke PASS: native windows, all statuses, authenticated HTTP, real Stockfish, boolean-only HUD, immediate withdrawal. Screen permission: ' + systemPreferences.getMediaAccessStatus('screen'));
}
