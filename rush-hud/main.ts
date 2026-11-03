import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { RushEngine } from './core/engine';
import { RushController } from './core/controller';
import { createRushServer } from './core/server';
import type { AppState } from './types';

app.setName('Nonchalant Rush HUD');
const smoke = process.argv.includes('--rush-smoke');
const profile = smoke ? path.join(app.getPath('temp'), `nonchalant-rush-smoke-${process.pid}`) : path.join(app.getPath('appData'), 'Nonchalant Rush HUD');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
if (!app.requestSingleInstanceLock()) app.exit(0);
const token = randomBytes(32).toString('hex');
const enginePath = app.isPackaged ? path.join(process.resourcesPath, 'stockfish', 'stockfish-19-lite-single.js') : path.join(__dirname, 'stockfish', 'stockfish-19-lite-single.js');
const nativePath = path.join(app.isPackaged ? process.resourcesPath : __dirname, 'stockfish-native', 'stockfish-windows-x86-64-universal.exe');
const useNative = process.platform === 'win32';
const engine = new RushEngine({ enginePath: useNative ? nativePath : enginePath, native: useNative });
let window: BrowserWindow;
let tray: Tray;
let connected = false, quitting = false;
const controller = new RushController(engine, broadcast);
const settingsPath = path.join(profile, 'settings.json');
try {
  const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  if ([100, 250, 600].includes(saved.budget)) controller.budget = saved.budget;
} catch { /* first launch */ }
const server = createRushServer(controller, token, value => { connected = value; broadcast(); });
function state(): AppState { return { ...controller.state, budget: controller.budget, version: app.getVersion(), connected, engineLabel: useNative ? 'Stockfish 19 · Native' : 'Stockfish 19 Lite · WASM' }; }
function broadcast() { if (window && !window.isDestroyed()) window.webContents.send('rush:state', state()); }
function authorized(event: Electron.IpcMainInvokeEvent) { return event.sender === window?.webContents && event.senderFrame === window.webContents.mainFrame; }
function show() { window.show(); window.focus(); }
app.on('second-instance', () => { if (window) show(); });

void app.whenReady().then(async () => {
  window = new BrowserWindow({ width: 990, height: 850, minWidth: 800, minHeight: 700, title: 'Nonchalant Rush HUD', backgroundColor: '#151519', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANklEQVQ4T2NkoBAwUqifYdQABhYGBv5v3rz5z8jIyAhSg2kA0wBmG0CKQXzUMGDEBSM0DJUAAAFJMBHFh6VWAAAAAElFTkSuQmCC');
  tray = new Tray(icon); tray.setToolTip('Nonchalant Rush HUD');
  if (process.platform === 'darwin') tray.setTitle('↗');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть Rush HUD', click: show },
    { label: 'Пауза / продолжить', click: () => controller.configure({ paused: controller.state.status !== 'paused' }) },
    { type: 'separator' }, { role: 'quit', label: 'Завершить Rush HUD' },
  ]));
  ipcMain.handle('rush:state', event => { if (!authorized(event)) throw Error('Unauthorized'); return state(); });
  ipcMain.handle('rush:token', event => { if (!authorized(event)) throw Error('Unauthorized'); return token; });
  ipcMain.handle('rush:copy-token', event => { if (!authorized(event)) throw Error('Unauthorized'); clipboard.writeText(token); });
  ipcMain.handle('rush:configure', (event, value) => {
    if (!authorized(event) || !value || typeof value !== 'object') throw Error('Unauthorized');
    if (value.budget !== undefined && ![100, 250, 600].includes(value.budget) || value.paused !== undefined && typeof value.paused !== 'boolean') throw Error('Неверные настройки.');
    // Save first so a failed write cannot silently change the running setting.
    const temp = settingsPath + '.tmp';
    fs.writeFileSync(temp, JSON.stringify({ version: 1, budget: value.budget ?? controller.budget })); fs.renameSync(temp, settingsPath);
    controller.configure(value); broadcast();
  });
  ipcMain.handle('rush:open-extension', async event => {
    if (!authorized(event)) throw Error('Unauthorized');
    const source = app.isPackaged ? path.join(process.resourcesPath, 'browser-extension') : path.join(__dirname, 'browser-extension');
    const destination = path.join(profile, 'browser-extension');
    fs.cpSync(source, destination, { recursive: true });
    const error = await shell.openPath(destination); if (error) throw Error('Не удалось открыть папку расширения.');
  });
  ipcMain.handle('rush:analyze', async (event, fen) => {
    if (!authorized(event) || typeof fen !== 'string' || fen.length > 200) throw Error('Неверный FEN.');
    await controller.analyze(fen);
  });
  await window.loadFile(path.join(__dirname, 'index.html'));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(smoke ? 0 : 18329, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  server.on('error', () => { controller.invalidate(); window.webContents.send('rush:notice', 'Порт занят. Завершите другую копию Rush HUD.'); });
  await controller.warm();
  broadcast();
  if (smoke) await runSmoke(); else show();
}).catch(error => {
  const message = error instanceof Error ? error.message : 'Rush HUD failed';
  console.error(message);
  if (app.isReady() && !smoke) dialog.showErrorBox('Nonchalant Rush HUD', message);
  app.exit(1);
});

async function runSmoke() {
  const address = server.address(); assert(address && typeof address === 'object');
  const endpoint = `http://127.0.0.1:${address.port}/analyze`;
  let sequence = 0;
  const sample = async (fen: string | null) => {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nonchalant-Extension': 'a'.repeat(32) },
      body: JSON.stringify({ token, session: 'electron-smoke', sequence: ++sequence, fen, positionId: `smoke-${sequence}`, visible: fen !== null, sentAt: Date.now() }) });
    const answer = await response.json(); assert(response.ok, answer.detail); return answer;
  };
  const fen = 'rnb1k1nr/pppp1ppq/4p3/b3N1pQ/4P2P/2PP4/PP3PP1/RN2KB1R w - - 0 1';
  const mate = await sample(fen); assert.equal(mate.move, 'h5f7');
  await window.webContents.executeJavaScript('window.rush.configure({budget:100})');
  assert.equal(controller.budget, 100);
  const black = await sample('1r4k1/r4pp1/7p/2R1p3/4b3/P3P3/2N2PPP/1R4K1 b - - 0 1');
  assert.equal(black.move, 'b8b1');
  await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const rendered = await window.webContents.executeJavaScript('({status:document.querySelector("#status").textContent,arrow:document.querySelector("#board-arrow").getAttribute("data-move"),cells:document.querySelectorAll(".square").length})');
  assert.equal(rendered.arrow, black.move); assert.equal(rendered.cells, 64);
  const output = path.resolve(__dirname, '../test-results'); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'rush-hud.png'), (await window.webContents.capturePage()).toPNG());
  await sample(null); assert.equal(controller.state.fen, null);
  await window.webContents.executeJavaScript('window.rush.configure({paused:true})');
  assert.equal(controller.state.status, 'paused');
  console.log('Rush Electron smoke PASS: warm real engine, both screenshot positions, localhost pairing, IPC settings, board+arrow, withdrawal, pause.');
  app.quit();
}
app.on('window-all-closed', () => { /* tray keeps engine ready */ });
app.on('before-quit', () => { quitting = true; controller.dispose(); server.close(); tray?.destroy(); });
