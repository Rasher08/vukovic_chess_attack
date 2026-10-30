import { Chess } from 'chess.js';
import { getStudyById } from '../../src/data/studies/index';

// Let's test dynamic detection directly on Lasker and Tarrasch positions
const laskerStudy = getStudyById('ed-lasker-thomas-1912')!;
// Last step fenBefore
const laskerFen = 'r4r2/pbppq1p1/1pn1pN2/8/3P2NP/6P1/PPP1BP1R/R3K1k1 w Q - 5 18';
const cEngine = new Chess(laskerFen);
const legals = cEngine.moves({ verbose: true });
const matingMoves: string[] = [];
for (const lm of legals) {
  const testC = new Chess(laskerFen);
  testC.move(lm.san);
  if (testC.isCheckmate()) {
    matingMoves.push(lm.san);
  }
}
console.log('Dynamic mating moves in Lasker pos:', matingMoves);
if (!matingMoves.includes('Kd2#') || !matingMoves.includes('O-O-O#')) {
  throw new Error('Dynamic engine failed to discover both mates!');
}

const tarraschFen = '4kqR1/r2b3p/2p1pQ2/pp3p2/2PP4/P3PP1P/1P6/2K2B2 w - - 3 31';
const cEngineT = new Chess(tarraschFen);
const legalsT = cEngineT.moves({ verbose: true });
const matingMovesT: string[] = [];
for (const lm of legalsT) {
  const testC = new Chess(tarraschFen);
  testC.move(lm.san);
  if (testC.isCheckmate()) {
    matingMovesT.push(lm.san);
  }
}
console.log('Dynamic mating moves in Tarrasch pos:', matingMovesT);
if (!matingMovesT.includes('Rxf8#') || !matingMovesT.includes('Qxf8#')) {
  throw new Error('Dynamic engine failed to discover both mates in Tarrasch!');
}

console.log('DYNAMIC CHECKMATE GENERATION VERIFIED!');
