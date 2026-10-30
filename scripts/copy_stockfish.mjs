import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageRoot = dirname(require.resolve('stockfish/package.json'));
const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
if (metadata.version !== '19.0.1') throw new Error('Review engine assets and source attribution before changing Stockfish 19.0.1');

const destination = join(root, 'public', 'engine');
await mkdir(destination, { recursive: true });
const assets = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];
const checksums = {};
let bytes = 0;
for (const asset of assets) {
  const source = join(packageRoot, 'bin', asset);
  const size = (await stat(source)).size;
  // Prevent an accidental switch to the ~94 MB engine in a static deployment.
  if (size > 3_000_000) throw new Error(`Unexpected engine asset size: ${asset}`);
  await copyFile(source, join(destination, asset));
  checksums[asset] = createHash('sha256').update(await readFile(source)).digest('hex');
  bytes += size;
}
await copyFile(join(packageRoot, 'Copying.txt'), join(destination, 'COPYING.txt'));

const commit = '0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6';
const sourceUrl = `https://github.com/nmrugg/stockfish.js/tree/${commit}`;
const archiveUrl = `https://github.com/nmrugg/stockfish.js/archive/${commit}.tar.gz`;
await writeFile(join(destination, 'SOURCE.md'), `# Stockfish.js 19 — npm stockfish 19.0.1

This site distributes the unmodified lite, single-threaded JavaScript and WASM engines by Nathan Rugg / Chess.com, based on Stockfish.

Engine license: GNU General Public License version 3. The complete original license is provided next to the engine in [COPYING.txt](COPYING.txt). Original copyright notices are retained in the JavaScript asset.

Corresponding source, exact npm release tag v19.0.1 / commit ${commit}:
- Browse source and build scripts: ${sourceUrl}
- Download complete corresponding source: ${archiveUrl}
- Upstream release: https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1
- Original npm distribution: https://registry.npmjs.org/stockfish/-/stockfish-19.0.1.tgz

Build instructions are in the source README and build.js. This flavor is built with the upstream --single-threaded --lite options. The lite network is nn-61e7af4bb97d by Chris Bao (sscg13), available from https://tests.stockfishchess.org/api/nn/nn-61e7af4bb97d.nnue (also referenced in the original JS header and upstream source).

Only the two lite-single runtime assets are served; the full 94 MB build is not deployed. Both files must remain adjacent. The worker requires JavaScript and WebAssembly MIME types and does not require cross-origin isolation headers.

Regenerate these unmodified assets and this notice with: node scripts/copy_stockfish.mjs
`);
await writeFile(join(destination, 'manifest.json'), JSON.stringify({
  package: 'stockfish', version: metadata.version, flavor: 'lite-single',
  sourceCommit: commit, sourceUrl, sourceArchive: archiveUrl,
  license: 'GPL-3.0', runtimeBytes: bytes, sha256: checksums,
}, null, 2) + '\n');
console.log(`Copied Stockfish ${metadata.version} lite-single: ${(bytes / 1_000_000).toFixed(2)} MB, with license and exact source links.`);
