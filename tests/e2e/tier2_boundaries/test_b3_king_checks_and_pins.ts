/**
 * Tier 2: Boundary & Corner Cases - Category B3: King Checks & Pins
 * Tests absolute pin enforcement, single check responses, double check handling,
 * king walking into check rejection, and en passant check resolution.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { ChessEngineHarness, Square } from '../harness/chessEngineHarness.ts';

describe('Tier 2 - B3: King Checks and Pins Enforcement', () => {
  it('TC-B3-01: Absolute pin violation attempt is strictly rejected', () => {
    // White king at e1, White bishop at e2, Black rook at e8 (Bishop is absolutely pinned to the King)
    const pinFen = '4r3/8/8/8/8/8/4B3/4K3 w - - 0 1';
    const engine = new ChessEngineHarness(pinFen);

    // Bishop e2 cannot move to d3, c4, b5, a6, f3, g4, h5 because e-file would open to White King!
    const bishopMoves = engine.getLegalMovesForSquare('e2');
    expect.equal(bishopMoves.length, 0, 'Pinned bishop has zero legal moves off the e-file');

    expect.throws(
      () => engine.makeMove('e2', 'd3'),
      /Illegal move/
    );
  });

  it('TC-B3-02: Responding to check: king escape, block, or capture attacker', () => {
    // White King e1 checked by Black Queen on e8. White has Bishop on d2 and Rook on f1.
    const checkFen = '4q3/8/8/8/8/8/3B4/4KR2 w - - 0 1';
    const engine = new ChessEngineHarness(checkFen);

    expect.equal(engine.isCheck('w'), true);

    // 1. King can move out of check to d1, f2
    const kingMoves = engine.getLegalMovesForSquare('e1');
    expect.includes(kingMoves, 'd1' as Square);
    expect.includes(kingMoves, 'f2' as Square);

    // 2. Bishop can block check at e3
    const bishopMoves = engine.getLegalMovesForSquare('d2');
    expect.includes(bishopMoves, 'e3' as Square);

    // 3. Move that does not resolve check is illegal
    expect.throws(
      () => engine.makeMove('f1', 'a1'),
      /Illegal move/
    );
  });

  it('TC-B3-03: Double check handling: King MUST move, blocking/capturing is illegal', () => {
    // Double check: White Queen on h5 (attacks King along h-file), White Knight on f7 (attacks King h8)
    // Black King on h8 is attacked simultaneously by Queen h5 and Knight f7!
    const doubleCheckFen = 'r4r1k/pbppqN1p/1pn5/7Q/3PN3/3B4/PPP2PPP/R3K2R b KQ - 0 12';
    const engine = new ChessEngineHarness(doubleCheckFen);

    expect.equal(engine.isCheck('b'), true);

    // In double check, ONLY king can move! Pawn on g7 is pinned and cannot resolve both checks.
    const pawnGMoves = engine.getLegalMovesForSquare('d7');
    expect.equal(pawnGMoves.length, 0, 'Pieces other than King have 0 legal moves during double check');

    const kingMoves = engine.getLegalMovesForSquare('h8');
    expect.greaterThan(kingMoves.length, 0, 'King must have escape square(s)');
    expect.includes(kingMoves, 'g8' as Square);
  });

  it('TC-B3-04: King walking into an attacked square is prohibited', () => {
    // White King at e1, Black Rook controlling e-file (on e8)
    const fen = '4r3/8/8/8/8/8/8/4K3 w - - 0 1';
    const engine = new ChessEngineHarness(fen);

    const kingMoves = engine.getLegalMovesForSquare('e1');
    // Cannot step to e2 (still on e-file)
    expect.equal(kingMoves.includes('e2' as Square), false);
    // Can step to d1, d2, f1, f2
    expect.includes(kingMoves, 'd1' as Square);
    expect.includes(kingMoves, 'f1' as Square);
  });

  it('TC-B3-05: En passant capture resolving or exposing a check', () => {
    // Position with en passant target on f6: 12...f5 13.exf6 e.p.
    // White pawn on e5, Black pawn on f5, White Queen on h5, Black King on g8
    const epFen = 'r1bqr1k1/pp1n2pp/3bp3/3pPp1Q/8/2PB1N2/PP3PPP/R1B1K2R w KQ f6 0 13';
    const engine = new ChessEngineHarness(epFen);

    expect.equal(engine.enPassantTarget, 'f6');
    const pawnMoves = engine.getLegalMovesForSquare('e5');
    expect.includes(pawnMoves, 'f6' as Square, 'White pawn on e5 can capture en passant on f6');

    // Make en passant capture
    const move = engine.makeMove('e5', 'f6');
    expect.equal(move.captured?.type, 'p');
    // Black pawn on f5 must be removed from the board!
    expect.equal(engine.getPiece('f5'), null, 'Captured pawn at f5 must be removed');
    expect.equal(engine.getPiece('f6')?.type, 'p', 'White pawn now sits on f6');
  });
});

runSuite();
