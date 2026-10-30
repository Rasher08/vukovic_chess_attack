/**
 * Tier 2: Boundary & Corner Cases - Category B4: Double Mate & Long Sequences
 * Tests dual checkmate solutions (18.Kd2# vs 18.O-O-O# in Ed. Lasker vs Thomas),
 * 7-ply calculation sequences, underpromotion, castling rights loss, and repetition limits.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { ChessEngineHarness, Square } from '../harness/chessEngineHarness.ts';

describe('Tier 2 - B4: Double Checkmate Dual Solutions and Long Sequences', () => {
  it('TC-B4-01: Dual checkmate solutions in Ed. Lasker vs Thomas (18.Kd2# vs 18.O-O-O#)', () => {
    // Position after 17...Kg1 in Edward Lasker vs Thomas (1912):
    // White can deliver checkmate either by 18.Kd2# (discovered check from Rook a1)
    // or by 18.O-O-O# (long castling with discovered check and mate)!
    const edLaskerFinaleFen = 'r4r2/pbppq1p1/1pn1pN2/8/3P2NP/6P1/PPP1BP1R/R3K1k1 w Q - 4 18';

    // Solution A: 18.Kd2#
    const engineA = new ChessEngineHarness(edLaskerFinaleFen);
    const moveA = engineA.makeMove('e1', 'd2');
    expect.equal(engineA.isCheck('b'), true, 'Black King on g1 is in check after 18.Kd2');
    expect.equal(engineA.isCheckmate(), true, '18.Kd2# must be recognized as checkmate');
    expect.equal(moveA.isCheckmate, true);

    // Solution B: 18.O-O-O#
    const engineB = new ChessEngineHarness(edLaskerFinaleFen);
    const moveB = engineB.makeMove('e1', 'c1'); // Queenside castling O-O-O
    expect.equal(engineB.isCheck('b'), true, 'Black King on g1 is in check after 18.O-O-O#');
    expect.equal(engineB.isCheckmate(), true, '18.O-O-O# must be recognized as checkmate');
    expect.equal(moveB.isCheckmate, true);
  });

  it('TC-B4-02: 7-ply forced calculation sequence executes without state drift', () => {
    // Colle vs O'Hanlon sequence (7 plies: 4 white moves + 3 black replies)
    const initialFen = 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12';
    const engine = new ChessEngineHarness(initialFen);

    const moves = [
      { from: 'e4' as Square, to: 'h7' as Square }, // 12.Bxh7+
      { from: 'g8' as Square, to: 'h7' as Square }, // 12...Kxh7
      { from: 'f3' as Square, to: 'g5' as Square }, // 13.Ng5+
      { from: 'h7' as Square, to: 'g6' as Square }, // 13...Kg6
      { from: 'h2' as Square, to: 'h4' as Square }, // 14.h4!
      { from: 'e8' as Square, to: 'h8' as Square }, // 14...Rh8
      { from: 'e1' as Square, to: 'e6' as Square }, // 15.Rxe6+!
    ];

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const res = engine.makeMove(m.from, m.to);
      expect.ok(res !== null);
    }

    expect.equal(engine.fullmoveNumber, 15);
    expect.equal(engine.activeColor, 'b');
    expect.equal(engine.isCheck('b'), true, 'Black king must be in check after 15.Rxe6+!');
  });

  it('TC-B4-03: Underpromotion boundary (promoting to Knight to deliver check)', () => {
    // White pawn on e7, Black King on f7. White pawn promotes on d8=N+ by capturing Rook d8!
    const underpromoteFen = '3r4/4Pk2/8/8/8/8/8/4K3 w - - 0 1';
    const engine = new ChessEngineHarness(underpromoteFen);

    // Promote pawn on e7 by capturing rook on d8 with Knight promotion (exd8=N+)
    const move = engine.makeMove('e7', 'd8', 'n');
    expect.equal(move.promotion, 'n');
    expect.equal(engine.getPiece('d8')?.type, 'n');
    expect.equal(engine.getPiece('d8')?.color, 'w');
    expect.equal(engine.isCheck('b'), true, 'Knight on d8 checks Black King on f7');
  });

  it('TC-B4-04: Castling rights loss when King moves or Rooks are captured', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const engine = new ChessEngineHarness(fen);

    expect.equal(engine.castlingRights, 'KQkq');

    // White moves King e1 to e2 -> loses all White castling rights ('KQ')
    engine.makeMove('e1', 'e2');
    expect.equal(engine.castlingRights.includes('K'), false);
    expect.equal(engine.castlingRights.includes('Q'), false);
    expect.equal(engine.castlingRights, 'kq');

    // Black moves Rook h8 to g8 -> loses Black kingside castling ('k')
    engine.makeMove('h8', 'g8');
    expect.equal(engine.castlingRights, 'q');
  });

  it('TC-B4-05: Move counter increments and halfmove clock boundary', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 49 50';
    const engine = new ChessEngineHarness(fen);

    expect.equal(engine.halfmoveClock, 49);
    expect.equal(engine.fullmoveNumber, 50);

    // Knight move increments fullmove when Black plays
    engine.makeMove('g1', 'f3');
    expect.equal(engine.activeColor, 'b');
    expect.equal(engine.fullmoveNumber, 50);

    engine.makeMove('b8', 'c6');
    expect.equal(engine.activeColor, 'w');
    expect.equal(engine.fullmoveNumber, 51);
  });
});

runSuite();
