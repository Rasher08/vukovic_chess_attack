// Run: cd hud && node_modules/.bin/electron tests/recognition.electron.cjs
// Actual Cburnett SVGs shipped with react-chessboard, rasterized by Chromium.
require('tsx/cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { renderToStaticMarkup } = require('react-dom/server');
const { cloneElement } = require('react');
const { Chess } = require('chess.js');
const { calibrate, recognize, screenSquare } = require('../core/recognition.ts');

const source = fs.readFileSync(require.resolve('react-chessboard'), 'utf8');
const start = source.indexOf('const defaultPieces = {');
const end = source.indexOf('\n};', start) + 3;
assert(start > 0 && end > start, 'Locate installed react-chessboard SVG definitions');
const defaultPieces = new Function('jsxRuntime', source.slice(start, end) + '; return defaultPieces;')(require('react/jsx-runtime'));
const svgs = Object.fromEntries(Object.entries(defaultPieces).map(([name, element]) => [name,
  renderToStaticMarkup(cloneElement(element, { width: 96, height: 96, viewBox: '0 0 45 45' }))]));

let win;
const timeout = setTimeout(() => { console.error('Raster test timed out'); app.exit(1); }, 40000);
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 700, height: 750, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await win.loadURL('about:blank');
  await win.webContents.executeJavaScript(`
    document.body.style.cssText='margin:0;background:#191d22;color:#cbd4d4;font:14px system-ui';
    const header=document.createElement('p'); header.textContent='nonchalant · actual SVG raster recognition fixture'; header.style.margin='20px'; document.body.appendChild(header);
    const canvas=document.createElement('canvas'); canvas.id='board'; canvas.style.margin='20px'; document.body.appendChild(canvas);
    window.renderBoard=async (cells,svgs,options)=>{
      const size=options.size||512, step=size/8;
      canvas.width=size;canvas.height=size;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      const sprites={};
      for(const [key,svg] of Object.entries(svgs)){
        const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
        await image.decode(); sprites[key]=image;
      }
      for(let row=0;row<8;row++)for(let col=0;col<8;col++){
        const cell=cells[row*8+col],x=col*step,y=row*step;
        context.fillStyle=(row+col)%2?'#849780':'#ecebdf';
        if(options.highlight===cell.square)context.fillStyle='#a9bc6c';
        context.fillRect(x,y,step,step);
        if(cell.piece)context.drawImage(sprites[cell.piece],x,y,step,step);
        context.fillStyle=(row+col)%2?'#ecebdf':'#849780'; context.font=(size/48)+'px Arial';
        if(col===0)context.fillText(cell.square[1],x+1,y+size/48);
        if(row===7)context.fillText(cell.square[0],x+step-size/48,y+step-1);
        if(options.broken===cell.square){context.fillStyle='#e76ac7';context.fillRect(x+step*.34,y+step*.22,step*.35,step*.5);}
      }
      return {width:size,height:size,data:Array.from(context.getImageData(0,0,size,size).data)};
    }; void 0;`);

  async function raster(fen, orientation = 'white', options = {}) {
    const board = new Chess(fen);
    const cells = Array.from({ length: 64 }, (_, i) => {
      const square = screenSquare(Math.floor(i / 8), i % 8, orientation);
      const piece = board.get(square);
      return { square, piece: piece ? piece.color + piece.type.toUpperCase() : null };
    });
    const result = await win.webContents.executeJavaScript(`window.renderBoard(${JSON.stringify(cells)},${JSON.stringify(svgs)},${JSON.stringify(options)})`);
    return { width: result.width, height: result.height, data: new Uint8ClampedArray(result.data) };
  }
  function check(image, templates, fen, orientation, description) {
    const result = recognize(image, templates, orientation);
    assert.equal(result.placement, fen.split(' ')[0], `${description}; unrecognized squares: ${result.cells.filter(c => !c.confident).map(c => c.square).join(',')}`);
  }
  const game = new Chess(); const initial = game.fen();
  const templates = calibrate(await raster(initial), initial, 'white');
  check(await raster(initial), templates, initial, 'white', 'Actual initial Cburnett SVG pieces with notation');
  check(await raster(initial, 'black'), templates, initial, 'black', 'Flipped board with upright piece glyphs');
  for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O', 'Be7', 'Re1', 'O-O']) game.move(san);
  check(await raster(game.fen()), templates, game.fen(), 'white', 'All moving glyphs remain recognizable');
  check(await raster(game.fen(), 'black'), templates, game.fen(), 'black', 'Moved position flipped');
  check(await raster(game.fen(), 'white', { highlight: 'g1' }), templates, game.fen(), 'white', 'King on colored square highlight');
  const scaled = await raster(game.fen(), 'white', { size: 640 });
  const debugOutput = path.join(__dirname, '..', 'test-results'); fs.mkdirSync(debugOutput, { recursive: true });
  fs.writeFileSync(path.join(debugOutput, 'recognition.png'), (await win.webContents.capturePage()).toPNG());
  assert.throws(() => recognize(scaled, templates, 'white'), /Масштаб/, 'Changed raster scale needs fresh calibration');
  const scaledTemplates = calibrate(await raster(initial, 'white', { size: 640 }), initial, 'white');
  check(scaled, scaledTemplates, game.fen(), 'white', 'Fresh calibration at scale 640');
  const broken = recognize(await raster(game.fen(), 'white', { broken: 'g1' }), templates, 'white');
  assert.equal(broken.confident, false, 'An overlay over a piece fails closed');
  assert.equal(broken.placement, null);
  await raster(game.fen(), 'black');
  const output = path.join(__dirname, '..', 'test-results'); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'recognition.png'), (await win.webContents.capturePage()).toPNG());
  console.log('Actual SVG raster checks passed: both orientations, notation, moves, highlights, scale invalidation/recalibration, occlusion.');
  clearTimeout(timeout); app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
