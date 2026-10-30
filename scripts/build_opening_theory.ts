import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Chess } from 'chess.js';

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'content/openings');
const source = JSON.parse(fs.readFileSync(path.join(sourceDir, 'source.json'), 'utf8')) as { commit: string; repository: string };
const files = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'];
const names: [string, string][] = [];
const nameIds = new Map<string, number>();
const named = new Map<string, number>();
const transitions = new Map<string, Set<string>>();
let count = 0; let maxPly = 0;
const normalize = (board: Chess) => board.fen().split(' ').slice(0, 4).join(' ');

for (const filename of files) {
  const rows = fs.readFileSync(path.join(sourceDir, filename), 'utf8').trim().split(/\r?\n/);
  if (rows.shift() !== 'eco\tname\tpgn') throw new Error(`Unexpected header: ${filename}`);
  for (const row of rows) {
    const [eco, name, pgn, extra] = row.split('\t');
    if (extra !== undefined || !/^[A-E][0-9]{2}$/.test(eco) || !name || !pgn) throw new Error(`Malformed row in ${filename}`);
    const key = `${eco}\t${name}`;
    let nameId = nameIds.get(key);
    if (nameId === undefined) { nameId = names.length; names.push([eco, name]); nameIds.set(key, nameId); }
    const game = new Chess();
    game.loadPgn(pgn, { strict: false });
    const moves = game.history({ verbose: true });
    if (!moves.length) throw new Error(`Opening without moves: ${name}`);
    const replay = new Chess();
    for (const move of moves) {
      const before = normalize(replay);
      const uci = move.from + move.to + (move.promotion || '');
      const choices = transitions.get(before) || new Set<string>();
      choices.add(uci); transitions.set(before, choices);
      replay.move(uci);
    }
    // Multiple names can share a position. The source's first row is the stable
    // primary label; every alias's legal continuation is still retained.
    const position = normalize(replay);
    if (!named.has(position)) named.set(position, nameId);
    maxPly = Math.max(maxPly, moves.length); count += 1;
  }
}
const output = {
  version: 1, sourceCommit: source.commit, maxPly, openingCount: count,
  names,
  positions: Array.from(named).sort(([a], [b]) => a.localeCompare(b)),
  transitions: Array.from(transitions, ([fen, choices]) => [fen, Array.from(choices).sort().join(' ')]).sort(([a], [b]) => a.localeCompare(b)),
};
const destination = path.join(root, 'src/data/openingTheory.json');
fs.writeFileSync(destination, JSON.stringify(output) + '\n');
const hashes = Object.fromEntries([...files, 'COPYING.txt', 'README.md'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(sourceDir, file))).digest('hex')]));
fs.writeFileSync(path.join(sourceDir, 'build-report.json'), JSON.stringify({
  sourceCommit: source.commit, openingCount: count, maxPly, namedPositions: named.size,
  indexedPositions: transitions.size, legalTransitions: Array.from(transitions.values()).reduce((sum, choices) => sum + choices.size, 0),
  dataBytes: fs.statSync(destination).size, sha256: hashes,
}, null, 2) + '\n');
console.log(`Opening theory: ${count} source lines, ${named.size} named positions, ${transitions.size} positions, max ${maxPly} plies; ${fs.statSync(destination).size} bytes.`);
