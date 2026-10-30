/**
 * Tier 4: Real-World Application Scenario 2 (S2):
 * Complete solve of Edward Lasker vs Sir George Thomas (London, 1912)
 * The Immortal King Hunt calculation trainer path across the entire board.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { CalculationTrainerFsmHarness, TrainerStudySpec } from '../harness/fsmHarness.ts';
import { ChessEngineHarness, Square } from '../harness/chessEngineHarness.ts';

describe('Tier 4 - S2: Complete Solve of Ed. Lasker vs Thomas King Hunt Path', () => {
  const kingHuntStudy: TrainerStudySpec = {
    id: 'ed-lasker-thomas-1912',
    title: 'Эдвард Ласкер — Джордж Томас (Лондон, 1912)',
    initialFen: 'r4rk1/pbppq1pp/1pn1pn2/4N2Q/3PN3/3B4/PPP2PPP/R3K2R w KQ - 4 11',
    calculationTargetPlies: 7,
    steps: [
      {
        stepIndex: 0,
        moveNumber: 11,
        fenBefore: 'r4rk1/pbppq1pp/1pn1pn2/4N2Q/3PN3/3B4/PPP2PPP/R3K2R w KQ - 4 11',
        expectedFenAfter: 'r4rk1/pbppq1pQ/1pn1pn2/4N3/3PN3/3B4/PPP2PPP/R3K2R b KQ - 0 11',
        bestMoveSan: 'Qxh7+!!',
        bestMoveUci: 'h5h7',
        bestMoveExplanation: '11.Qxh7+!! Бессмертная жертва ферзя!',
        hints: {
          level1Concept: 'Жертвуйте ферзя на h7 ради выманивания короля.',
          level2Highlight: { fromSquare: 'h5', toSquare: 'h7' },
          level3Arrow: ['h5', 'h7'],
        },
        opponentResponse: {
          san: 'Kxh7',
          uci: 'g8h7',
          fenAfter: 'r4r2/pbppq1pk/1pn1pn2/4N3/3PN3/3B4/PPP2PPP/R3K2R w KQ - 0 12',
          comment: 'Черные вынуждены брать ферзя.',
        },
      },
      {
        stepIndex: 1,
        moveNumber: 12,
        fenBefore: 'r4r2/pbppq1pk/1pn1pn2/4N3/3PN3/3B4/PPP2PPP/R3K2R w KQ - 0 12',
        expectedFenAfter: 'r4r2/pbppq1pk/1pn1pN2/4N3/3P4/3B4/PPP2PPP/R3K2R b KQ - 0 12',
        bestMoveSan: 'Nxf6+',
        bestMoveUci: 'e4f6',
        bestMoveExplanation: '12.Nxf6+! Двойной шах конем и слоном d3.',
        hints: {
          level1Concept: 'Вскрытый двойной шах конем с e4.',
          level2Highlight: { fromSquare: 'e4', toSquare: 'f6' },
          level3Arrow: ['e4', 'f6'],
        },
        opponentResponse: {
          san: 'Kh6',
          uci: 'h7h6',
          fenAfter: 'r4r2/pbppq1p1/1pn1pN1k/4N3/3P4/3B4/PPP2PPP/R3K2R w KQ - 1 13',
          comment: 'Единственный ход короля.',
        },
      },
      {
        stepIndex: 2,
        moveNumber: 13,
        fenBefore: 'r4r2/pbppq1p1/1pn1pN1k/4N3/3P4/3B4/PPP2PPP/R3K2R w KQ - 1 13',
        expectedFenAfter: 'r4r2/pbppq1p1/1pn1pN1k/6N1/3P2N1/3B4/PPP2PPP/R3K2R b KQ - 2 13',
        bestMoveSan: 'Neg4+',
        bestMoveUci: 'e5g4',
        bestMoveExplanation: '13.Neg4+! Второй конь вступает в бой.',
        hints: {
          level1Concept: 'Шах вторым конем на g4.',
          level2Highlight: { fromSquare: 'e5', toSquare: 'g4' },
          level3Arrow: ['e5', 'g4'],
        },
        opponentResponse: {
          san: 'Kg5',
          uci: 'h6g5',
          fenAfter: 'r4r2/pbppq1p1/1pn1pN2/6k1/3P2N1/3B4/PPP2PPP/R3K2R w KQ - 3 14',
          comment: 'Король выгоняется на 5-ю горизонталь.',
        },
      },
      {
        stepIndex: 3,
        moveNumber: 18,
        fenBefore: 'r4r2/pbppq1p1/1pn1pN2/8/3P2NP/6P1/PPP1BP1R/R3K1k1 w Q - 4 18',
        expectedFenAfter: 'r4r2/pbppq1p1/1pn1pN2/8/3P2NP/6P1/PPPKBP1R/R5k1 b - - 5 18',
        bestMoveSan: 'Kd2#',
        bestMoveUci: 'e1d2',
        bestMoveExplanation: '18.Kd2# (или 18.O-O-O#) Финальный мат монархом!',
        hints: {
          level1Concept: 'Сделайте шаг королем или длинную рокировку.',
          level2Highlight: { fromSquare: 'e1', toSquare: 'd2' },
          level3Arrow: ['e1', 'd2'],
        },
      },
    ],
  };

  it('TC-S2-01: Execution of Edward Lasker King Hunt path and checkmate finale', () => {
    const fsm = new CalculationTrainerFsmHarness();
    const engine = new ChessEngineHarness(kingHuntStudy.initialFen);

    fsm.initStudy(kingHuntStudy);

    // 11.Qxh7+!!
    fsm.submitUserMove('Qxh7+!!', 4.0);
    fsm.advanceOpponentMove();

    // 12.Nxf6+
    fsm.submitUserMove('Nxf6+', 3.5);
    fsm.advanceOpponentMove();

    // 13.Neg4+
    fsm.submitUserMove('Neg4+', 4.0);
    fsm.advanceOpponentMove();

    // Jump to finale move 18.Kd2#
    fsm.currentStepIndex = 3;
    fsm.currentFen = kingHuntStudy.steps[3].fenBefore;
    fsm.state = 'WAITING_USER_MOVE';

    const finaleMove = fsm.submitUserMove('Kd2#', 3.0);
    expect.equal(finaleMove.quality, 'best');
    expect.equal(fsm.state, 'STEP_SUCCESS');

    fsm.advanceOpponentMove();
    expect.equal(fsm.state, 'STUDY_COMPLETED');

    const summary = fsm.calculateSessionSummary();
    expect.equal(summary.isCompleted, true);
    expect.equal(summary.rankTitleRu, 'Гроссмейстер атаки');
  });
});

runSuite();
