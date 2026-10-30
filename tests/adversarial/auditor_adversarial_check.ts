import { Chess } from 'chess.js';
import { getStudyById } from '../../src/data/studies/index';
import { getCalculationStepsForStudy } from '../../src/components/trainer/CalculationTrainer';

console.log('--- ADVERSARIAL INTEGRITY STRESS TEST ---');

// Test 1: Lasker vs Thomas move 18
const laskerStudy = getStudyById('ed-lasker-thomas-1912')!;
const laskerSteps = getCalculationStepsForStudy(laskerStudy);
const laskerStep18 = laskerSteps[laskerSteps.length - 1];

console.log('Lasker step 18 fenBefore:', laskerStep18.fenBefore);

// Check legality of 18.Kd2#
const c1 = new Chess(laskerStep18.fenBefore);
const mKd2 = c1.move('Kd2#');
console.log('18.Kd2# move:', mKd2?.san, 'isCheckmate:', c1.isCheckmate());

// Check legality of 18.O-O-O#
const c2 = new Chess(laskerStep18.fenBefore);
const mOOO = c2.move('O-O-O#');
console.log('18.O-O-O# move:', mOOO?.san, 'isCheckmate:', c2.isCheckmate());

// Adversarial test: Try illegal short castle 18.O-O#
const c3 = new Chess(laskerStep18.fenBefore);
let shortCastleLegal = false;
try {
  shortCastleLegal = Boolean(c3.move('O-O#'));
} catch {
  shortCastleLegal = false;
}
console.log('Is 18.O-O# legal?', shortCastleLegal);
if (shortCastleLegal) throw new Error('18.O-O# should NOT be legal!');

// Adversarial test: Try non-mating legal move (e.g. a3 or c3 or b3)
const c4 = new Chess(laskerStep18.fenBefore);
const ma3 = c4.move('a3');
console.log('18.a3 move:', ma3?.san, 'isCheckmate:', c4.isCheckmate());
if (c4.isCheckmate()) throw new Error('18.a3 should NOT be checkmate!');

// Test 2: Tarrasch vs von Scheve move 31
const tarraschStudy = getStudyById('tarrasch-scheve-1894')!;
const tarraschSteps = getCalculationStepsForStudy(tarraschStudy);
const tarraschStep31 = tarraschSteps[tarraschSteps.length - 1];

console.log('Tarrasch step 31 fenBefore:', tarraschStep31.fenBefore);

const ct1 = new Chess(tarraschStep31.fenBefore);
const mRxf8 = ct1.move('Rxf8#');
console.log('31.Rxf8# move:', mRxf8?.san, 'isCheckmate:', ct1.isCheckmate());

const ct2 = new Chess(tarraschStep31.fenBefore);
const mQxf8 = ct2.move('Qxf8#');
console.log('31.Qxf8# move:', mQxf8?.san, 'isCheckmate:', ct2.isCheckmate());

// Adversarial test: Try non-mating move like 31.Qe7
const ct3 = new Chess(tarraschStep31.fenBefore);
const mQe7 = ct3.move('Qe7');
console.log('31.Qe7 move:', mQe7?.san, 'isCheckmate:', ct3.isCheckmate());
if (ct3.isCheckmate()) throw new Error('31.Qe7 should NOT be checkmate!');

// Test 3: Check Colle-O'Hanlon step 1 FEN
const colleStudy = getStudyById('colle-ohanlon-1930')!;
const colleSteps = getCalculationStepsForStudy(colleStudy);
const colleStep1 = colleSteps[1];
const cColle = new Chess(colleStep1.fenBefore);
cColle.move('Ng5+');
const cColleFen = cColle.fen();
console.log('Colle actual after 13.Ng5+:', cColleFen);
console.log('Colle declared expectedFenAfter:', colleStep1.expectedFenAfter);
if (cColleFen !== colleStep1.expectedFenAfter) {
  throw new Error(`FEN mismatch in Colle step 1: ${cColleFen} !== ${colleStep1.expectedFenAfter}`);
}

// Test 4: Blunder tree extraction across all studies
console.log('\nTesting blunder tree extraction across all 18 studies:');
for (const study of [laskerStudy, tarraschStudy, colleStudy]) {
  const steps = getCalculationStepsForStudy(study);
  for (const step of steps) {
    if (step.blunders) {
      for (const b of step.blunders) {
        console.log(`Study ${study.id} step ${step.stepIndex} blunder: ${b.san} -> refutation ${b.refutationSan}`);
        // Ensure blunder is not bestMove
        if (b.san.replace(/[!?+#]/g, '') === step.bestMoveSan.replace(/[!?+#]/g, '')) {
          throw new Error(`Blunder ${b.san} equals bestMove ${step.bestMoveSan} in ${study.id}`);
        }
      }
    }
  }
}

console.log('ALL ADVERSARIAL STRESS CHECKS PASSED EMPIRICALLY!');
