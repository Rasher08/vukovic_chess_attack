/**
 * Tier 2: Boundary & Corner Cases - Category B1: Empty & Illegal Moves
 * Tests rejection of empty inputs, moving opponent pieces, obstructed rays,
 * self-captures, and out-of-board coordinates.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { ChessEngineHarness, Square } from '../harness/chessEngineHarness.ts';
import { BrowserDomHarness } from '../harness/browserDomHarness.ts';

describe('Tier 2 - B1: Empty and Illegal Moves Handling', () => {
  it('TC-B1-01: Rejection of null, undefined, or empty move inputs', () => {
    const engine = new ChessEngineHarness();
    expect.throws(
      () => (engine as any).makeMove(null, null),
      /Invalid square coordinate/
    );
    expect.throws(
      () => engine.makeSanMove(''),
      /Unrecognized/
    );
  });

  it('TC-B1-02: Moving opponent piece on player turn is rejected', () => {
    // White to move in Colle position
    const fen = 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12';
    const dom = new BrowserDomHarness(fen);

    // Try to click/move black knight on d7
    const clickRes = dom.clickSquare('d7');
    expect.equal(clickRes.action, 'deselected');
    expect.equal(dom.selectedSquare, null);
    expect.equal(dom.legalMoveTargets.length, 0);

    // Try to drag black knight on d7 to f6
    const dragRes = dom.dragAndDrop('d7', 'f6');
    expect.equal(dragRes, false);
    expect.equal(dom.engine.getPiece('d7')?.type, 'n');
    expect.equal(dom.engine.getPiece('d7')?.color, 'b');
  });

  it('TC-B1-03: Moving piece through blocking pieces is prohibited', () => {
    const engine = new ChessEngineHarness(); // Standard start
    // Queen at d1 blocked by pawns at c2, d2, e2 and pieces at c1, e1
    const queenMoves = engine.getLegalMovesForSquare('d1');
    expect.equal(queenMoves.length, 0, 'Queen cannot jump over pawns');

    // Rook at a1 blocked by pawn a2 and knight b1
    const rookMoves = engine.getLegalMovesForSquare('a1');
    expect.equal(rookMoves.length, 0, 'Rook cannot jump over pieces');
  });

  it('TC-B1-04: Self-capture attempts of friendly pieces are rejected', () => {
    const engine = new ChessEngineHarness();
    // Knight b1 cannot capture pawn c3 (if empty) or pawn d2
    const knightMoves = engine.getLegalMovesForSquare('b1');
    expect.includes(knightMoves, 'a3' as Square);
    expect.includes(knightMoves, 'c3' as Square);
    expect.equal(knightMoves.includes('d2' as Square), false, 'Knight cannot capture friendly pawn on d2');
  });

  it('TC-B1-05: Non-existent coordinates throw out-of-board error', () => {
    expect.throws(() => ChessEngineHarness.squareToCoords('i9' as any));
    expect.throws(() => ChessEngineHarness.squareToCoords('z0' as any));
    expect.throws(() => ChessEngineHarness.squareToCoords('e9' as any));
  });
});

runSuite();
