# Stockfish.js 19 — npm stockfish 19.0.1

This site distributes the unmodified lite, single-threaded JavaScript and WASM engines by Nathan Rugg / Chess.com, based on Stockfish.

Engine license: GNU General Public License version 3. The complete original license is provided next to the engine in [COPYING.txt](COPYING.txt). Original copyright notices are retained in the JavaScript asset.

Corresponding source, exact npm release tag v19.0.1 / commit 0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6:
- Browse source and build scripts: https://github.com/nmrugg/stockfish.js/tree/0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6
- Download complete corresponding source: https://github.com/nmrugg/stockfish.js/archive/0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6.tar.gz
- Upstream release: https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1
- Original npm distribution: https://registry.npmjs.org/stockfish/-/stockfish-19.0.1.tgz

Build instructions are in the source README and build.js. This flavor is built with the upstream --single-threaded --lite options. The lite network is nn-61e7af4bb97d by Chris Bao (sscg13), available from https://tests.stockfishchess.org/api/nn/nn-61e7af4bb97d.nnue (also referenced in the original JS header and upstream source).

Only the two lite-single runtime assets are served; the full 94 MB build is not deployed. Both files must remain adjacent. The worker requires JavaScript and WebAssembly MIME types and does not require cross-origin isolation headers.

Regenerate these unmodified assets and this notice with: node scripts/copy_stockfish.mjs
