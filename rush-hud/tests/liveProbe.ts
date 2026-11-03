// Manual browser QA companion: reads one public board FEN per stdin line.
// No browser access, page internals, clicks, account data or puzzle solutions.
import path from 'node:path';
import { createInterface } from 'node:readline';
import { RushEngine } from '../core/engine';
const engine = new RushEngine({ enginePath: path.resolve(import.meta.dirname, '../../node_modules/stockfish/bin/stockfish-19-lite-single.js') });
const input = createInterface({ input: process.stdin });
void engine.ready().then(() => console.log('READY'));
input.on('line', fen => {
  void engine.search(fen, { moveTimeMs: 250 }).then(result => console.log(JSON.stringify(result)), error => console.log(JSON.stringify({ error: error.message })));
});
input.on('close', () => engine.dispose());
