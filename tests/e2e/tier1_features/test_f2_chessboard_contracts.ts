/**
 * Tier 1: Feature 2 (F2) - Interactive Chessboard & Audio Engine Contracts
 * Tests ChessboardWrapper contracts, click/drag interactions, legal move dots,
 * SVG arrows, square highlighting, and Web Audio synthesizer.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { BrowserDomHarness } from '../harness/browserDomHarness.ts';
import { SynthHarness } from '../harness/synthHarness.ts';
import { ChessEngineHarness, Square } from '../harness/chessEngineHarness.ts';

describe('Tier 1 - F2: Interactive Chessboard & Audio Engine Contracts', () => {
  it('TC-F2-01: ChessboardWrapper contract and initial state setup', () => {
    // Initial Colle position before 12.Bxh7+
    const initialFen = 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12';
    const dom = new BrowserDomHarness(initialFen);

    expect.equal(dom.engine.getFen(), initialFen);
    expect.equal(dom.arePiecesDraggable, true);
    expect.equal(dom.isBoardLocked, false);
    expect.equal(dom.selectedSquare, null);
    expect.equal(dom.legalMoveTargets.length, 0);
  });

  it('TC-F2-02: Piece selection calculates legal move dots and capture rings', () => {
    const initialFen = 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12';
    const dom = new BrowserDomHarness(initialFen);

    // Click on white Bishop at e4
    const res = dom.clickSquare('e4');
    expect.equal(res.action, 'selected');
    expect.equal(dom.selectedSquare, 'e4');
    expect.greaterThan(dom.legalMoveTargets.length, 0, 'Bishop must have legal targets');

    // Bishop at e4 can move along diagonals: h7 (Greek Gift!), f5, g6, d5, d3
    expect.includes(dom.legalMoveTargets, 'h7' as Square, 'Bishop must have h7 as legal target (Bxh7+)');
    expect.includes(dom.legalMoveTargets, 'd5' as Square, 'Bishop can move to d5');
    expect.includes(dom.legalMoveTargets, 'd3' as Square, 'Bishop can retreat to d3');
  });

  it('TC-F2-03: Click-to-Move executes legal move on 2nd click and deselects', () => {
    const initialFen = 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12';
    const dom = new BrowserDomHarness(initialFen);

    // 1st click: select bishop e4
    dom.clickSquare('e4');
    expect.equal(dom.selectedSquare, 'e4');

    // 2nd click: click target h7 (sacrifice!)
    const moveRes = dom.clickSquare('h7');
    expect.equal(moveRes.action, 'moved');
    expect.equal(dom.selectedSquare, null, 'Selected square must reset after move');
    expect.equal(dom.legalMoveTargets.length, 0, 'Legal targets must clear');

    // Verify bishop is now on h7 and Black king is in check
    const pieceOnH7 = dom.engine.getPiece('h7');
    expect.ok(pieceOnH7 !== null);
    expect.equal(pieceOnH7!.type, 'b');
    expect.equal(pieceOnH7!.color, 'w');
    expect.equal(dom.engine.activeColor, 'b', 'Turn must pass to Black');
    expect.ok(dom.engine.isCheck('b'), 'Black king must be in check after 12.Bxh7+');
  });

  it('TC-F2-04: Drag-and-drop validates move legality and rejects illegal drops', () => {
    const initialFen = 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12';
    const dom = new BrowserDomHarness(initialFen);

    // Try illegal drop: Bishop e4 to e8 (occupied by black rook, illegal diagonal)
    const illegalDrop = dom.dragAndDrop('e4', 'e8');
    expect.equal(illegalDrop, false, 'Illegal drag-and-drop must be rejected');
    expect.equal(dom.engine.getPiece('e4')?.type, 'b', 'Bishop must remain on e4');

    // Legal drop: Bishop e4 to h7
    const legalDrop = dom.dragAndDrop('e4', 'h7');
    expect.equal(legalDrop, true, 'Legal drag-and-drop must succeed');
    expect.equal(dom.engine.getPiece('h7')?.type, 'b');
  });

  it('TC-F2-05: SVG arrow palette configuration for threats, moves, and jumps', () => {
    const dom = new BrowserDomHarness();

    // Define standard Vukovic arrow palette
    dom.arrows = [
      ['e4', 'h7', 'rgba(239, 68, 68, 0.9)'], // Red threat arrow
      ['h2', 'h4', 'rgba(34, 197, 94, 0.85)'], // Green quiet/pawn move arrow
      ['f3', 'g5', 'rgba(59, 130, 246, 0.85)'], // Blue knight leap arrow
      ['e4', 'h7', 'rgba(245, 158, 11, 0.95)'], // Gold sacrifice target arrow
    ];

    expect.equal(dom.arrows.length, 4);
    expect.equal(dom.arrows[0][2], 'rgba(239, 68, 68, 0.9)');
    expect.equal(dom.arrows[1][0], 'h2');
    expect.equal(dom.arrows[1][1], 'h4');
    expect.equal(dom.arrows[2][0], 'f3');
    expect.equal(dom.arrows[2][1], 'g5');
  });

  it('TC-F2-06: Square highlighting styles mark move origin, target, and king in check', () => {
    const initialFen = 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12';
    const dom = new BrowserDomHarness(initialFen);

    dom.dragAndDrop('e4', 'h7');

    // Square styles must contain e4 (origin) and h7 (target)
    expect.ok(dom.squareStyles['e4'] !== undefined, 'Origin square e4 must be highlighted');
    expect.ok(dom.squareStyles['h7'] !== undefined, 'Target square h7 must be highlighted');

    // Since Black is in check, King on g8 must have check glow
    expect.ok(dom.squareStyles['g8'] !== undefined, 'King square g8 must have check highlight');
    expect.match(
      dom.squareStyles['g8'].backgroundColor,
      /239,\s*68,\s*68/,
      'Check highlight must use red hue'
    );
  });

  it('TC-F2-07: Web Audio API synth triggers precise frequencies for move, capture, check, and victory', () => {
    const synth = new SynthHarness();

    // 1. Regular quiet move
    synth.playMove();
    expect.equal(synth.getLastEvent()?.type, 'move');
    expect.equal(synth.getLastEvent()?.frequencies[0], 400);

    // 2. Capture move
    synth.playCapture();
    expect.equal(synth.getLastEvent()?.type, 'capture');
    expect.equal(synth.getLastEvent()?.frequencies[0], 260);

    // 3. Check warning
    synth.playCheck();
    expect.equal(synth.getLastEvent()?.type, 'check');
    expect.equal(synth.getLastEvent()?.frequencies[0], 880);

    // 4. Victory fanfare
    synth.playVictory();
    expect.equal(synth.getLastEvent()?.type, 'victory');
    expect.equal(synth.getLastEvent()?.frequencies.length, 4); // C-E-G-C chord
    expect.equal(synth.getLastEvent()?.frequencies[0], 523.25); // C5
  });
});

runSuite();
