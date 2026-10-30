import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(here, 'dist'), { recursive: true });
for (const name of ['main', 'preload']) {
  await build({ absWorkingDir: here, entryPoints: [name + '.ts'], outfile: 'dist/' + name + '.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] });
}
await build({ absWorkingDir: here, entryPoints: ['ui/renderer.ts'], outfile: 'dist/renderer.js', bundle: true, platform: 'browser', format: 'iife', target: 'chrome140' });
for (const file of ['index.html', 'style.css']) await cp(path.join(here, 'ui', file), path.join(here, 'dist', file));
const stockfishBin = path.resolve(here, '../node_modules/stockfish/bin');
const distStockfish = path.join(here, 'dist', 'stockfish');
await mkdir(distStockfish, { recursive: true });
for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  await cp(path.join(stockfishBin, file), path.join(distStockfish, file));
}
