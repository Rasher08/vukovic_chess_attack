// Fixture-only Chromium QA: intercept HTTPS to avoid a real scored Puzzle Rush.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { app, BrowserWindow, session } = require('electron');
const { build } = require('esbuild');
const { Chess } = require('chess.js');
const extension = path.join(__dirname, '../extension');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function transport() {
  const id = 'a'.repeat(32), base = `chrome-extension://${id}/`, store = {}, requests = [], controls = [];
  let listener, activeUrl = 'https://www.chess.com/puzzles/rush';
  const chrome = {
    runtime: { id, getURL: file => base + file, onMessage: { addListener: fn => { listener = fn; } } },
    storage: { session: {
      get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in store).map(key => [key, structuredClone(store[key])])),
      set: async values => Object.assign(store, structuredClone(values)), remove: async key => { delete store[key]; },
    } },
    tabs: { query: async () => [{ id: 7, active: true, url: activeUrl }], sendMessage: async (tab, message) => { controls.push({ tab, message }); } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(extension, 'background.js'), 'utf8'), {
    chrome, URL, AbortController, setTimeout, clearTimeout, crypto: { randomUUID },
    fetch: (url, options) => new Promise((resolve, reject) => { requests.push({ url, options, body: JSON.parse(options.body), resolve }); options.signal.addEventListener('abort', () => reject(Error('Aborted')), { once: true }); }),
  });
  const popup = { id, url: base + 'popup.html' }, tab = { id, url: activeUrl, frameId: 0, tab: { id: 7, active: true } };
  const send = (message, sender = popup) => new Promise(resolve => listener(message, sender, resolve));
  activeUrl = 'https://www.chess.com/play/online';
  assert.equal((await send({ kind: 'connect', token: 'b'.repeat(64) })).ok, false, 'No real-game pages');
  activeUrl = tab.url;
  assert.equal((await send({ kind: 'connect', token: 'short' })).ok, false);
  assert((await send({ kind: 'connect', token: 'b'.repeat(64), side: 'auto' })).ok);
  assert.equal(controls[0].message.kind, 'start');
  const hello = await send({ kind: 'hello' }, tab);
  assert.equal(hello.enabled, true); assert.equal(hello.side, 'auto'); assert(!JSON.stringify(hello).includes('bbbb'));
  const fen = new Chess().fen(), sample = { kind: 'position', fen, positionId: 'position:1', visible: true, observedAt: Date.now() };
  await send(sample, tab);
  assert.equal(requests.length, 1); assert.equal(requests[0].url, 'http://127.0.0.1:18329/analyze');
  assert.equal(requests[0].options.headers['X-Nonchalant-Extension'], id);
  await send({ ...sample, fen: null, positionId: 'withdraw:2', visible: false, observedAt: Date.now() }, tab);
  assert.equal(requests.length, 2); assert(requests[0].options.signal.aborted, 'New sample cancels pending search transport');
  assert(requests[1].body.sequence > requests[0].body.sequence);
  const response = request => ({ ok: true, json: async () => ({ ok: true, positionId: request.body.positionId, sequence: request.body.sequence, move: null, depth: 0, elapsedMs: 0, final: true }) });
  requests[1].resolve(response(requests[1])); await tick(); await tick();
  assert.equal(controls.at(-1).message.positionId, 'withdraw:2');
  await send({ ...sample, observedAt: 0 }, tab);
  await send(sample, { ...tab, url: 'https://www.chess.com/game/live/12345' });
  await send(sample, { ...tab, frameId: 1 });
  await send(sample, { ...tab, tab: { id: 8, active: true } });
  assert.equal(requests.length, 2, 'Stale samples, games, frames and unpaired tabs rejected');
  await send({ ...sample, observedAt: Date.now() }, { ...tab, tab: { id: 7, active: false } });
  assert.equal(requests.at(-1).body.visible, false);
  await send({ kind: 'disconnect' });
  assert.equal(store.connection, undefined); assert.equal(controls.at(-1).message.kind, 'stop');
  requests.at(-1).resolve(response(requests.at(-1))); await tick(); await tick();
  assert.equal(store.status.detail, 'Отключено.');
  // Abort all unresolved simulated requests so timers cannot hold test open.
  for (const request of requests) request.resolve(response(request));
  await tick();
}

let win;
const timeout = setTimeout(() => { console.error('Rush extension test timed out'); app.exit(1); }, 25000);
app.whenReady().then(async () => {
  await transport();
  const boardBundle = await build({ entryPoints: [path.join(extension, 'board.ts')], bundle: true, platform: 'browser', format: 'iife', globalName: 'RushBoard', write: false });
  const contentBundle = await build({ entryPoints: [path.join(extension, 'content.ts')], bundle: true, platform: 'browser', format: 'iife', write: false });
  const partition = session.fromPartition(`rush-extension-test-${process.pid}`);
  partition.protocol.handle('https', () => new Response('<!doctype html><html><body style="margin:0"><wc-chess-board id="board-primary" class="board" style="display:block;position:relative;width:512px;height:512px;background:conic-gradient(#ebecd0 25%,#779556 0 50%,#ebecd0 0 75%,#779556 0);background-size:25% 25%;--move-animation-duration: 180ms"></wc-chess-board></body></html>', { headers: { 'Content-Type': 'text/html' } }));
  win = new BrowserWindow({ width: 700, height: 700, show: false, webPreferences: { session: partition, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
  win.webContents.on('console-message', event => { if (event.level === 'error') console.error('fixture renderer:', event.message); });
  await win.loadURL('https://www.chess.com/puzzles/rush');
  const run = code => win.webContents.executeJavaScript(code);
  await run(`window.fixtureVisible='visible'; Object.defineProperty(document,'visibilityState',{get:()=>window.fixtureVisible}); window.requests=[]; window.listeners=[]; window.chrome={runtime:{sendMessage:async message=>{requests.push(message);return message.kind==='hello'?{enabled:true,side:'auto'}:{ok:true}},onMessage:{addListener:fn=>listeners.push(fn)}}}; window.renderPieces=(placement,flipped=false)=>{const board=document.querySelector('wc-chess-board');board.className=flipped?'board flipped':'board';board.innerHTML='';placement.split('/').forEach((rank,row)=>{let file=1;for(const p of rank){if(/[0-9]/.test(p)){file+=Number(p);continue;}const piece=document.createElement('div');piece.className='piece '+(p===p.toUpperCase()?'w':'b')+p.toLowerCase()+' square-'+file+(8-row);piece.style.cssText='position:absolute;width:12.5%;height:12.5%;display:grid;place-items:center;font-size:52px;font-family:serif;color:'+(p===p.toUpperCase()?'#fff':'#202020')+';text-shadow:0 1px 2px #111;left:'+((flipped?8-file:file-1)*12.5)+'%;top:'+((flipped?7-row:row)*12.5)+'%';piece.textContent=({k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'})[p.toLowerCase()];board.appendChild(piece);file++;}});}; void 0;`);
  await run(boardBundle.outputFiles[0].text);
  const fixture1 = '1r4k1/r4pp1/7p/2R1p3/4b3/P3P3/2N2PPP/1R4K1';
  const fixture2 = 'rnb1k1nr/pppp1ppq/4p3/b3N1pQ/4P2P/2PP4/PP3PP1/RN2KB1R';
  await run(`renderPieces(${JSON.stringify(fixture1)},true)`);
  assert.deepEqual(await run(`(()=>{const s=RushBoard.readBoard(document,location.href);return [s.placement,s.orientation,s.animationMs]})()`), [fixture1, 'black', 180]);
  await run(`renderPieces(${JSON.stringify(fixture2)})`);
  assert.deepEqual(await run(`(()=>{const s=RushBoard.readBoard(document,location.href);return [s.placement,s.orientation]})()`), [fixture2, 'white']);
  assert.equal(await run(`RushBoard.readBoard(document,'https://www.chess.com/game/live/123')`), null);
  assert.deepEqual(await run(`RushBoard.squarePoint('a1','white')`), [50, 750]);
  assert.deepEqual(await run(`RushBoard.squarePoint('a1','black')`), [750, 50]);
  const start = new Chess(), ownFen = start.fen(); start.move('e4'); const opponentPlacement = start.fen().split(' ')[0]; start.move('e5'); const returnPlacement = start.fen().split(' ')[0];
  await run(`window.tracker=new RushBoard.PuzzleTracker();renderPieces(${JSON.stringify(ownFen.split(' ')[0])});window.initial=tracker.observe(RushBoard.readBoard(document,location.href));void 0`);
  assert.equal((await run('initial')).ownTurn, true);
  await run(`renderPieces(${JSON.stringify(opponentPlacement)});window.next=tracker.observe(RushBoard.readBoard(document,location.href));void 0`);
  assert.equal((await run('next')).ownTurn, false);
  await run(`renderPieces(${JSON.stringify(returnPlacement)});window.next=tracker.observe(RushBoard.readBoard(document,location.href));void 0`);
  assert.equal((await run('next')).ownTurn, true);
  assert((await run('next')).fen.includes(' w - '), 'No castling rights guessed');
  await run(`renderPieces(${JSON.stringify(ownFen.split(' ')[0])});requests=[];void 0`);
  await run(contentBundle.outputFiles[0].text);
  await new Promise(resolve => setTimeout(resolve, 300));
  const request = await run(`requests.filter(r=>r.visible&&r.fen).at(-1)`);
  assert(request?.positionId, 'A settled board generates a position');
  assert.equal(request.fen.split(' ')[0], ownFen.split(' ')[0]);
  await run(`listeners.forEach(fn=>fn({kind:'result',ok:true,positionId:${JSON.stringify(request.positionId)},move:'e2e4'}));void 0`);
  assert.equal(await run(`document.querySelectorAll('[data-rush-hud="arrow"]').length`), 1);
  assert.equal(await run(`getComputedStyle(document.querySelector('[data-rush-hud="arrow"]')).pointerEvents`), 'none');
  await run(`window.animation=document.querySelector('.piece').animate([{transform:'translateX(0px)'},{transform:'translateX(10px)'}],{duration:200});void 0`);
  assert.equal(await run(`RushBoard.readBoard(document,location.href)`), null, 'Moving pieces are not sampled');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(await run(`document.querySelectorAll('[data-rush-hud="arrow"]').length`), 0, 'Arrow disappears while CSS animation is active');
  await run(`animation.cancel();void 0`);
  await new Promise(resolve => setTimeout(resolve, 300));
  await run(`renderPieces(${JSON.stringify(opponentPlacement)});void 0`);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await run(`document.querySelectorAll('[data-rush-hud="arrow"]').length`), 0, 'Old arrow removed before another stable snapshot');
  await run(`listeners.forEach(fn=>fn({kind:'result',ok:true,positionId:${JSON.stringify(request.positionId)},move:'e2e4'}));void 0`);
  assert.equal(await run(`document.querySelectorAll('[data-rush-hud="arrow"]').length`), 0, 'Late result cannot redraw stale arrow');
  await new Promise(resolve => setTimeout(resolve, 280));
  assert.equal(await run(`requests.filter(r=>r.visible&&r.fen&&r.fen.split(' ')[0]===${JSON.stringify(opponentPlacement)}).length`), 0, 'No arrow search for opponent response');
  await run(`renderPieces(${JSON.stringify(returnPlacement)});void 0`);
  await new Promise(resolve => setTimeout(resolve, 300));
  const nextRequest = await run(`requests.filter(r=>r.visible&&r.fen).at(-1)`);
  assert.equal(nextRequest.fen.split(' ')[0], returnPlacement);
  await run(`listeners.forEach(fn=>fn({kind:'result',ok:true,positionId:${JSON.stringify(nextRequest.positionId)},move:'g1f3'}));void 0`);
  assert.equal(await run(`document.querySelectorAll('[data-rush-hud="arrow"]').length`), 1);
  await run(`fixtureVisible='hidden';document.dispatchEvent(new Event('visibilitychange'));void 0`);
  assert.equal(await run(`document.querySelectorAll('[data-rush-hud="arrow"]').length`), 0, 'Tab hide immediately removes arrow');
  const output = path.join(__dirname, '../test-results'); fs.mkdirSync(output, { recursive: true });
  await run(`fixtureVisible='visible';listeners.forEach(fn=>fn({kind:'start',side:'auto'}));renderPieces(${JSON.stringify(fixture1)},true);void 0`);
  await new Promise(resolve => setTimeout(resolve, 300));
  const finalRequest = await run(`requests.filter(r=>r.visible&&r.fen).at(-1)`);
  const bestFixture = 'b8b1';
  assert.equal(await run(`RushBoard.legalArrow(${JSON.stringify(finalRequest.fen)},${JSON.stringify(bestFixture)})`), true);
  await run(`listeners.forEach(fn=>fn({kind:'result',ok:true,positionId:${JSON.stringify(finalRequest.positionId)},move:${JSON.stringify(bestFixture)}}));void 0`);
  assert.equal(await run(`document.querySelectorAll('[data-rush-hud="arrow"]').length`), 1);
  await new Promise(resolve => setTimeout(resolve, 60));
  fs.writeFileSync(path.join(output, 'extension-arrow.png'), (await win.webContents.capturePage()).toPNG());
  console.log('Rush extension PASS: fixture boards both orientations, puzzle-only routes, king validation, legal turn replay, no guessed castling, clickthrough arrow, stale-result rejection, opponent-turn suppression, source withdrawal, token isolation, superseding network cancellation.');
  clearTimeout(timeout); app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
