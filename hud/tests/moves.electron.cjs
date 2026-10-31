// Project-owned renderer fixtures use the actual Chess.com DOM shape inspected
// 2026-10-31. No Chess.com account, game, or screen permission is involved.
require('tsx/cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { buildSync } = require('esbuild');
const { Chess } = require('chess.js');
const { MoveHistory } = require('../core/moveHistory.ts');
const reader = buildSync({ entryPoints: [path.join(__dirname, '../extension/chesscom.ts')], bundle: true, platform: 'browser', format: 'iife', globalName: 'MoveReader', write: false }).outputFiles[0].text;
const content = fs.readFileSync(path.join(__dirname, '../dist/browser-extension/content.js'), 'utf8');
const sans = ['e4','e5','Nf3','Nf6','Nxe5','Nc6','Nxc6','dxc6','d3','Bc5','Bg5'];
const initial = new Chess().fen();
let win;
const timeout = setTimeout(() => { console.error('Text DOM fixture timed out'); app.exit(1); }, 35000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 800, height: 700, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  // Entirely local HTTPS fixture: no requests reach Chess.com.
  win.webContents.session.protocol.handle('https', () => new Response('<!doctype html><html><body></body></html>', { headers: { 'Content-Type': 'text/html' } }));
  await win.loadURL('https://www.chess.com/game/live/fixture-game');
  await win.webContents.executeJavaScript(reader);
  await win.webContents.executeJavaScript(`
    window.testVisible=true; Object.defineProperty(document,'visibilityState',{get:()=>window.testVisible?'visible':'hidden'});
    document.body.style.cssText='background:#22211d;color:#ddd;font:14px system-ui;margin:20px';
    window.samples=[];
    window.chrome={runtime:{onMessage:{addListener(fn){window.messageListener=fn}},sendMessage:async message=>{if(message.kind==='hello')return {enabled:true};window.samples.push(message);return {ok:true}}}};
    window.paint=(moves,from=0,selected=moves.length,figurines=false)=>{
      let html='<h3>nonchalant · Chess.com text move fixture</h3><div class="engine-lines"><span>Nonsense engine variation Qh9</span></div><wc-move-list board-id="board-live" class="move-list"><div>';
      for(let i=from;i<moves.length;i++){
        if(i===from||i%2===0)html+='<div class="main-line-row move-list-row" data-whole-move-number="'+(Math.floor(i/2)+1)+'">'+(Math.floor(i/2)+1)+'. ';
        let san=moves[i];if(figurines)san=san.replace(/^[NBRQK]/,p=>'<span data-figurine="'+p+'"></span>');
        html+='<div data-node="0-'+i+'" class="node '+(i%2?'black':'white')+'-move main-line-ply"><span class="node-highlight-content'+(selected===i+1?' selected':'')+'">'+san+'</span><span class="move-time">35.6s</span></div>';
        if(i%2||i===moves.length-1)html+='</div>';
      }
      html+='</div><div class="variation"><div class="node">Qh9</div></div></wc-move-list><button '+(selected===moves.length?'disabled':'')+'><svg data-glyph="arrow-chevron-end"></svg></button>';
      document.body.innerHTML=html;
    };
    window.read=()=>MoveReader.extractChesscom(document,'https://www.chess.com/game/live/fixture-game');
    window.paint(${JSON.stringify(sans)});
  `);
  const read = () => win.webContents.executeJavaScript('window.read()');
  const history = new MoveHistory(initial);
  let observation = await read();
  assert(observation.ready);
  assert.equal(observation.currentPly, 11);
  assert.deepEqual(observation.moves.map(m => m.san), sans, 'Read only played moves, never engine lines or clocks');
  assert.equal(history.ingest(observation.moves, observation.currentPly).fen, 'r1bqk2r/ppp2ppp/2p2n2/2b3B1/4P3/3P4/PPP2PPP/RN1QKB1R b KQkq - 2 6');
  await win.webContents.executeJavaScript(`document.body.innerHTML=document.body.innerHTML.replaceAll('wc-move-list','wc-simple-move-list')`);
  assert.deepEqual((await read()).moves, observation.moves, 'Actual bot-game wc-simple-move-list uses the same numbered main-line structure');
  await win.webContents.executeJavaScript(`window.paint(${JSON.stringify(sans)},6,11,true)`);
  observation = await read();
  assert.deepEqual(observation.moves.map(m => m.san), sans.slice(6), 'Read data-figurine icons when the text omits their piece letter');
  assert(history.ingest(observation.moves, observation.currentPly).fen, 'Virtualized-away earlier rows stay remembered');
  await win.webContents.executeJavaScript(`window.paint(${JSON.stringify(sans)},0,5)`);
  observation = await read();
  assert.equal(history.ingest(observation.moves, observation.currentPly).issue, 'replay');
  await win.webContents.executeJavaScript(`window.paint(${JSON.stringify(sans)}); document.querySelector('wc-move-list').insertAdjacentHTML('afterend',document.querySelector('wc-move-list').outerHTML)`);
  assert.equal((await read()).ready, false, 'Multiple move panels are ambiguous');
  await win.webContents.executeJavaScript(`window.paint(${JSON.stringify(sans)});document.querySelector('wc-move-list').style.visibility='hidden'`);
  assert.equal((await read()).ready, false, 'A CSS-hidden panel cannot assert a visible position');
  await win.webContents.executeJavaScript(`window.paint(${JSON.stringify(sans)}); document.querySelector('wc-move-list .node-highlight-content').textContent='35.6s'`);
  assert.equal((await read()).ready, false, 'Malformed SAN cannot become a trusted snapshot');
  await win.webContents.executeJavaScript(`window.paint(${JSON.stringify(sans)})`);
  await win.webContents.executeJavaScript(content);
  const wait = async predicate => {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) { const samples = await win.webContents.executeJavaScript('window.samples'); if (predicate(samples)) return samples; await new Promise(r => setTimeout(r, 40)); }
    throw Error('Timed out waiting for content-script state');
  };
  let samples = await wait(s => s.some(v => v.ready));
  assert(samples.some(s => !s.ready), 'Content script initially withdraws stale evidence');
  assert(samples.filter(s => s.ready).every(s => s.currentPly === 11 && s.moves.length === 11));
  const before = samples.length;
  await win.webContents.executeJavaScript(`window.paint(${JSON.stringify(sans.concat('O-O'))})`);
  samples = await wait(s => s.slice(before).some(v => v.ready && v.currentPly === 12));
  assert(samples.slice(before).some(s => !s.ready), 'First changed notation clears a previous verdict before settling');
  await win.webContents.executeJavaScript(`window.testVisible=false;document.dispatchEvent(new Event('visibilitychange'))`);
  samples = await wait(s => s.at(-1)?.visible === false);
  assert.equal(samples.at(-1).ready, false);
  const output = path.join(__dirname, '../test-results'); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'text-moves.png'), (await win.webContents.capturePage()).toPNG());
  console.log('Text DOM/content PASS: actual Chess.com markup, figurines, clocks/engine-line exclusion, virtualized scrolling, replay, ambiguous/malformed lists, settling, changed/hidden source withdrawal.');
  clearTimeout(timeout); app.exit(0);
}).catch(e => { console.error(e); clearTimeout(timeout); app.exit(1); });
