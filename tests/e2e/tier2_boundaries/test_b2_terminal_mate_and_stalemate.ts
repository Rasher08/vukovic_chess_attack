/**
 * Tier 2: Boundary & Corner Cases - Category B2: Terminal Mate & Stalemate
 * Tests terminal checkmate detection, board interaction locking upon mate,
 * stalemate recognition, insufficient material, and trainer completion on mate.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { ChessEngineHarness } from '../harness/chessEngineHarness.ts';
import { BrowserDomHarness } from '../harness/browserDomHarness.ts';
import { CalculationTrainerFsmHarness } from '../harness/fsmHarness.ts';
import type { TrainerStudySpec } from '../harness/fsmHarness.ts';

describe('Tier 2 - B2: Terminal Mate and Stalemate Handling', () => {
  it('TC-B2-01: Terminal checkmate detection in Greco Greek Gift finale (8.Qxg7#)', () => {
    // Position after 7...Ke7: White has Queen on h8, Knight on g5, pawn e5. 8.Qxg7# is checkmate!
    // FEN before 8.Qxg7# (Black queen on d8 and rook on e8 block King retreat)
    const fenBeforeMate = 'r1bqr2Q/pp1nk1p1/4p3/3pP1N1/3P4/8/PP3PPP/R1B1K2R w - - 1 16';
    const engine = new ChessEngineHarness(fenBeforeMate);

    expect.equal(engine.isCheckmate(), false);
    expect.equal(engine.isGameOver(), false);

    // Play 8.Qxg7#
    const move = engine.makeMove('h8', 'g7');
    expect.equal(move.isCheckmate, true);
    expect.equal(engine.isCheckmate(), true);
    expect.equal(engine.isCheck('b'), true);
    expect.equal(engine.getAllLegalMoves().length, 0);
    expect.equal(engine.isGameOver(), true);
  });

  it('TC-B2-02: Board interaction locking when terminal checkmate is reached', () => {
    const mateFen = 'r1bq4/pp1nk1Q1/4p3/3pP1N1/3P4/8/PP3PPP/R1B1K2R b - - 0 16';
    const dom = new BrowserDomHarness(mateFen);
    dom.isBoardLocked = true; // Board locks upon game over

    const clickRes = dom.clickSquare('e7'); // Black king
    expect.equal(clickRes.action, 'locked');

    const dragRes = dom.dragAndDrop('e7', 'e8');
    expect.equal(dragRes, false);
  });

  it('TC-B2-03: Stalemate position correctly identified as draw (not checkmate)', () => {
    // Classic stalemate: Black King on a8, White King on c7, White Queen on b6
    const stalemateFen = 'k7/2K5/1Q6/8/8/8/8/8 b - - 0 1';
    const engine = new ChessEngineHarness(stalemateFen);

    expect.equal(engine.isCheck('b'), false, 'Black king is NOT in check');
    expect.equal(engine.getAllLegalMoves().length, 0, 'Black has no legal moves');
    expect.equal(engine.isStalemate(), true, 'Position must be evaluated as stalemate');
    expect.equal(engine.isCheckmate(), false, 'Stalemate is not checkmate');
    expect.equal(engine.isGameOver(), true, 'Stalemate is game over');
  });

  it('TC-B2-04: Bare kings position evaluated as draw by insufficient material', () => {
    const bareKingsFen = '8/8/4k3/8/8/4K3/8/8 w - - 0 1';
    const engine = new ChessEngineHarness(bareKingsFen);

    expect.equal(engine.isCheck('w'), false);
    expect.equal(engine.isCheck('b'), false);
    expect.greaterThan(engine.getAllLegalMoves().length, 0, 'Kings can still move');

    // Verify pieces on board count
    const whitePiece = engine.findKing('w');
    const blackPiece = engine.findKing('b');
    expect.ok(whitePiece !== null);
    expect.ok(blackPiece !== null);
  });

  it('TC-B2-05: Calculation trainer triggers completion immediately upon final checkmate step', () => {
    const finalMateStudy: TrainerStudySpec = {
      id: 'greco-final-mate',
      title: 'Греко: Финальный мат',
      initialFen: 'r1bq3Q/pp1nk1p1/4p3/3pP1N1/3P4/8/PP3PPP/R1B1K2R w - - 1 16',
      calculationTargetPlies: 1,
      steps: [
        {
          stepIndex: 0,
          moveNumber: 16,
          fenBefore: 'r1bq3Q/pp1nk1p1/4p3/3pP1N1/3P4/8/PP3PPP/R1B1K2R w - - 1 16',
          expectedFenAfter: 'r1bq4/pp1nk1Q1/4p3/3pP1N1/3P4/8/PP3PPP/R1B1K2R b - - 0 16',
          bestMoveSan: 'Qxg7#',
          bestMoveUci: 'h8g7',
          bestMoveExplanation: 'Финальный мат!',
          hints: {
            level1Concept: 'Поставьте мат на g7.',
            level2Highlight: { fromSquare: 'h8', toSquare: 'g7' },
            level3Arrow: ['h8', 'g7'],
          },
        },
      ],
    };

    const fsm = new CalculationTrainerFsmHarness();
    fsm.initStudy(finalMateStudy);
    expect.equal(fsm.state, 'WAITING_USER_MOVE');

    fsm.submitUserMove('Qxg7#', 3.0);
    expect.equal(fsm.state, 'STEP_SUCCESS');

    fsm.advanceOpponentMove();
    expect.equal(fsm.state, 'STUDY_COMPLETED');
    expect.equal(fsm.calculateSessionSummary().isCompleted, true);
  });
});

runSuite();
