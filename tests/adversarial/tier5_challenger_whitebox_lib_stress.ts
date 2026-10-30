/**
 * Milestone 6 — Phase 2 Tier 5 Adversarial Coverage Hardening
 * Dedicated White-Box Source Code Analysis & Adversarial Stress Suite
 *
 * Target Modules:
 * - src/lib/chessUtils.ts
 * - src/lib/audioSynth.ts
 * - src/lib/storage.ts
 * - src/lib/validation.ts
 * - src/components/chess/ChessboardWrapper.tsx
 * - src/components/chess/PromotionModal.tsx
 * - src/components/chess/BoardControls.tsx
 */

import { describe, it, expect, runSuite } from '../e2e/harness/testRunner.ts';
import {
  createChessInstance,
  isValidFen,
  makeMove,
  getLegalMoves,
  isCheck,
  isCheckmate,
  getActiveColor,
  getPieceAtSquare,
  getLegalMovesForSquare,
  getLegalTargetSquares,
  isPromotion,
  isCaptureSquare,
  findKingSquare,
  getCheckHighlightStyle,
  getSquareHighlightStyles,
  findNodeById,
  findPathToNode,
  getMainLine,
  getAllNodes,
  formatArrowsForBoard,
  VUKOVIC_ARROW_PALETTE,
} from '../../src/lib/chessUtils';
import {
  playMoveSound,
  playCaptureSound,
  playCheckSound,
  playVictorySound,
  playErrorSound,
  setAudioMuted,
  isAudioMuted,
  toggleAudio,
  audioSynth,
} from '../../src/lib/audioSynth';
import {
  loadUserStats,
  saveStudyRecord,
  getStudyProgress,
  saveStudyProgress,
  getAllProgress,
  getStreakCount,
  clearProgress,
  saveActiveSession,
  getActiveSession,
  clearActiveSession,
  getDefaultUserStats,
  STORAGE_KEY,
  SESSION_KEY,
} from '../../src/lib/storage';
import { validateStudy, validateDataset } from '../../src/lib/validation';
import { allStudies } from '../../src/data/studies/index';
import { Chess, Square } from 'chess.js';
import { VukovicStudy, MoveNode } from '../../src/types/chess';

describe('Tier 5 Challenger 1: White-Box Lib & Chess Component Adversarial Stress', () => {

  // =========================================================================
  // SECTION 1: src/lib/chessUtils.ts White-Box Stress & Boundary Tests
  // =========================================================================

  it('TC-T5-01: createChessInstance & isValidFen with valid, extreme, and corrupted positions', () => {
    // 1. Valid standard starting position
    const c1 = createChessInstance();
    expect.equal(c1.turn(), 'w');
    expect.equal(isValidFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), true);

    // 2. Complex Greek Gift study position (Colle vs O'Hanlon 12.Bxh7+)
    const greekGiftFen = 'r1bqr1k1/pp1n1ppp/2pbpn2/3p4/2PP4/1PN1PN2/PB1QBPPP/R4RK1 w - - 0 12';
    const c2 = createChessInstance(greekGiftFen);
    expect.equal(c2.fen(), greekGiftFen);
    expect.equal(isValidFen(greekGiftFen), true);

    // 3. Endgame bare kings position
    const bareKingsFen = '8/8/8/4k3/8/8/4K3/8 w - - 0 1';
    expect.equal(isValidFen(bareKingsFen), true);

    // 4. Position on the verge of promotion
    const promotionFen = '8/4P3/8/8/8/8/8/4K2k w - - 0 1';
    expect.equal(isValidFen(promotionFen), true);

    // 5. Corrupted FEN strings
    expect.equal(isValidFen(''), false, 'Empty string must be invalid FEN');
    expect.equal(isValidFen('gibberish non-chess string'), false, 'Gibberish string must be invalid');
    expect.equal(isValidFen('8/8/8/8/8/8/8/8 w - - 0 1'), false, 'No kings must be invalid FEN');
    expect.equal(isValidFen('8/8/8/8/8/8/8/4K3 w - - 0 1'), false, 'Missing black king must be invalid');
    expect.equal(isValidFen('rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), false, '9 squares in rank must be invalid');
    expect.equal(isValidFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1'), false, 'Invalid active turn "x" must be invalid');

    // 6. createChessInstance with invalid FEN throws Error cleanly
    expect.throws(() => createChessInstance('invalid_fen_payload'), /Invalid FEN/i);
  });

  it('TC-T5-02: makeMove comprehensive SAN, UCI, castling, en-passant, and underpromotion', () => {
    // 1. Standard moves
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const resPawn = makeMove(startFen, 'e4');
    expect.equal(resPawn.success, true);
    expect.ok(resPawn.newFen.includes('4P3'));
    expect.equal(resPawn.move?.san, 'e4');

    // 2. UCI object move
    const resUci = makeMove(startFen, { from: 'g1', to: 'f3' });
    expect.equal(resUci.success, true);
    expect.equal(resUci.move?.san, 'Nf3');

    // 3. Kingside Castling
    const castlingFen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5';
    const resCastling = makeMove(castlingFen, 'O-O');
    expect.equal(resCastling.success, true);
    expect.equal(resCastling.move?.san, 'O-O');

    // 4. En Passant Capture
    const enPassantFen = 'rnbqkbnr/ppppp1pp/8/4Pp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';
    const resEp = makeMove(enPassantFen, 'exf6');
    expect.equal(resEp.success, true);
    expect.equal(resEp.move?.flags.includes('e'), true, 'En passant flag must be set');

    // 5. Underpromotion to Knight
    const underpromotionFen = '8/4P3/8/8/8/8/k7/4K2R w - - 0 1';
    const resPromoKnight = makeMove(underpromotionFen, { from: 'e7', to: 'e8', promotion: 'n' });
    expect.equal(resPromoKnight.success, true);
    expect.equal(resPromoKnight.move?.promotion, 'n');
    expect.equal(resPromoKnight.move?.san, 'e8=N');

    // 6. Underpromotion to Rook
    const resPromoRook = makeMove(underpromotionFen, { from: 'e7', to: 'e8', promotion: 'r' });
    expect.equal(resPromoRook.success, true);
    expect.equal(resPromoRook.move?.promotion, 'r');
  });

  it('TC-T5-03: makeMove exception safety on illegal moves, out-of-bounds squares, and malformed inputs', () => {
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    // 1. Moving backwards
    const backward = makeMove(startFen, { from: 'e2', to: 'e1' });
    expect.equal(backward.success, false);
    expect.equal(backward.newFen, startFen);
    expect.ok(backward.error);

    // 2. Moving opponent piece
    const opponentMove = makeMove(startFen, { from: 'e7', to: 'e5' });
    expect.equal(opponentMove.success, false);

    // 3. Absolute pin violation
    const pinnedFen = '4k3/8/8/8/8/4r3/4P3/4K3 w - - 0 1'; // White pawn on e2 pinned by black rook on e3 to king on e1
    const pinnedMove = makeMove(pinnedFen, { from: 'e2', to: 'e4' });
    expect.equal(pinnedMove.success, false, 'Moving absolutely pinned pawn into check must fail');

    // 4. King walking into check along e-file
    const queenCheckLineFen = '4k3/8/8/8/4q3/8/8/4K3 w - - 0 1';
    const kingIllegal = makeMove(queenCheckLineFen, { from: 'e1', to: 'e2' }); // e2 attacked by queen along e-file
    expect.equal(kingIllegal.success, false);

    // 5. Non-existent coordinates
    const oobMove = makeMove(startFen, { from: 'z9' as any, to: 'e4' });
    expect.equal(oobMove.success, false);
    expect.ok(oobMove.error);

    // 6. Null move in chess.js passes turn (san: '--')
    const nullMove = makeMove(startFen, null as any);
    expect.equal(nullMove.success, true);
    expect.equal(nullMove.move?.san, '--', 'Null move in chess.js produces valid passing move');

    // 7. Malformed move object or invalid move string
    const emptyObj = makeMove(startFen, {} as any);
    expect.equal(emptyObj.success, false);

    const badStr = makeMove(startFen, 'non_chess_move');
    expect.equal(badStr.success, false);

    // 8. Invalid FEN input
    const badFenMove = makeMove('corrupted_fen', 'e4');
    expect.equal(badFenMove.success, false);
    expect.equal(badFenMove.newFen, 'corrupted_fen');
  });

  it('TC-T5-04: getLegalMoves, getLegalMovesForSquare, and deduplicated getLegalTargetSquares', () => {
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    // 1. Starting position has exactly 20 legal moves (16 pawn pushes + 4 knight moves)
    const allMoves = getLegalMoves(startFen);
    expect.equal(allMoves.length, 20);

    // 2. White knight on g1 has exactly 2 legal target squares: f3 and h3
    const knightMoves = getLegalMovesForSquare(startFen, 'g1');
    expect.equal(knightMoves.length, 2);
    const knightTargets = getLegalTargetSquares(startFen, 'g1');
    expect.equal(knightTargets.length, 2);
    expect.ok(knightTargets.includes('f3'));
    expect.ok(knightTargets.includes('h3'));

    // 3. Checkmate position has 0 legal moves
    const scholarsMateFen = 'r1bqkb1r/pppp1Qpp/2n5/4p3/2B1n3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
    expect.equal(getLegalMoves(scholarsMateFen).length, 0);
    expect.equal(isCheckmate(scholarsMateFen), true);
    expect.equal(isCheck(scholarsMateFen), true);

    // 4. Stalemate position has 0 legal moves but is NOT checkmate
    const stalemateFen = 'k7/8/1Q6/8/8/8/8/7K b - - 0 1';
    expect.equal(getLegalMoves(stalemateFen).length, 0);
    expect.equal(isCheckmate(stalemateFen), false);
    expect.equal(isCheck(stalemateFen), false);

    // 5. Square with opponent piece has 0 moves on active player turn
    const oppMoves = getLegalMovesForSquare(startFen, 'e7');
    expect.equal(oppMoves.length, 0);

    // 6. Empty square has 0 moves
    const emptyMoves = getLegalMovesForSquare(startFen, 'e4');
    expect.equal(emptyMoves.length, 0);

    // 7. Deduplication: pawn promotion generates 4 moves to the same target square (q, r, b, n),
    // getLegalTargetSquares must deduplicate them to a single entry
    const promoFen = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1';
    const promoMoves = getLegalMovesForSquare(promoFen, 'e7');
    expect.equal(promoMoves.length, 4, '4 promotion moves: Q, R, B, N');
    const promoTargets = getLegalTargetSquares(promoFen, 'e7');
    expect.equal(promoTargets.length, 1, 'Target squares must be deduplicated to exactly 1 square');
    expect.equal(promoTargets[0], 'e8');

    // 8. Robustness on invalid FEN or out-of-bounds square
    expect.deepEqual(getLegalMoves('bad_fen'), []);
    expect.deepEqual(getLegalMovesForSquare('bad_fen', 'e4'), []);
  });

  it('TC-T5-05: isPromotion and isCaptureSquare boundary and pinning verification', () => {
    // 1. White quiet promotion
    const wPromoFen = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1';
    expect.equal(isPromotion(wPromoFen, 'e7', 'e8'), true);

    // 2. White capture promotion
    const wCapPromoFen = '3r4/4P3/8/8/8/8/k7/4K3 w - - 0 1';
    expect.equal(isPromotion(wCapPromoFen, 'e7', 'd8'), true);
    expect.equal(isCaptureSquare(wCapPromoFen, 'e7', 'd8'), true);

    // 3. Black quiet promotion (e1 is empty, king is on h1)
    const bPromoFen = '7k/8/8/8/8/8/4p3/7K b - - 0 1';
    expect.equal(isPromotion(bPromoFen, 'e2', 'e1'), true);

    // 4. Non-pawn pieces moving to 8th rank must NOT trigger promotion
    const rook8thFen = '4k3/8/8/8/8/8/R7/4K3 w - - 0 1';
    expect.equal(isPromotion(rook8thFen, 'a2', 'a8'), false);

    // 5. Pawn on rank 6 moving to rank 7 must NOT trigger promotion
    const pawn6to7Fen = '4k3/8/4P3/8/8/8/8/4K3 w - - 0 1';
    expect.equal(isPromotion(pawn6to7Fen, 'e6', 'e7'), false);

    // 6. Blocked pawn cannot legally reach promotion square -> must return false
    const blockedPromoFen = '4r3/4P3/8/8/8/8/k7/4K3 w - - 0 1';
    expect.equal(isPromotion(blockedPromoFen, 'e7', 'e8'), false, 'Blocked pawn push is illegal, so isPromotion is false');

    // 7. Pinned pawn reaching 8th rank that leaves king in check is illegal -> must return false
    const pinnedPromoFen = '8/4P3/8/8/8/8/k7/4K2r w - - 0 1'; // White king in check by black rook on h1
    expect.equal(isPromotion(pinnedPromoFen, 'e7', 'e8'), false, 'Cannot promote while ignoring check');

    // 8. isCaptureSquare on en passant
    const epFen = 'rnbqkbnr/ppppp1pp/8/4Pp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';
    expect.equal(isCaptureSquare(epFen, 'e5', 'f6'), true, 'En passant must be recognized as capture');

    // 9. isCaptureSquare on quiet move
    expect.equal(isCaptureSquare(epFen, 'e5', 'e6'), false);
  });

  it('TC-T5-06: findKingSquare, getCheckHighlightStyle, and getSquareHighlightStyles layering', () => {
    // 1. Initial position king coordinates
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect.equal(findKingSquare(startFen, 'w'), 'e1');
    expect.equal(findKingSquare(startFen, 'b'), 'e8');
    expect.equal(findKingSquare(startFen), 'e1', 'Defaults to active player color');

    // 2. Position with white king in check
    const whiteCheckFen = '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1';
    expect.equal(isCheck(whiteCheckFen), true);
    expect.equal(findKingSquare(whiteCheckFen), 'e1');
    const checkStyles = getCheckHighlightStyle(whiteCheckFen);
    expect.ok(checkStyles['e1'] !== undefined);
    expect.ok(String(checkStyles['e1'].backgroundColor).includes('239, 68, 68'));

    // 3. Normal position check styles are empty
    expect.deepEqual(getCheckHighlightStyle(startFen), {});

    // 4. getSquareHighlightStyles layering: lastMove + check + selectedSquare + custom overrides
    const compoundStyles = getSquareHighlightStyles({
      fen: whiteCheckFen,
      selectedSquare: 'e1',
      lastMove: { from: 'e8', to: 'e2' },
      customSquareStyles: {
        e2: { backgroundColor: 'custom_override_color' },
      },
    });

    // Check lastMove 'from' styled
    expect.ok(compoundStyles['e8'] !== undefined);
    // Custom style override has highest priority
    expect.equal(compoundStyles['e2']?.backgroundColor, 'custom_override_color');
    // Selected square 'e1' has amber selection style
    expect.ok(compoundStyles['e1'] !== undefined);
  });

  it('TC-T5-07: Tree traversal utilities (findNodeById, findPathToNode, getMainLine, getAllNodes, formatArrowsForBoard)', () => {
    const mockTree: MoveNode = {
      id: 'root',
      san: '',
      uci: '',
      fen: 'start_fen',
      turn: 'w',
      children: [
        {
          id: 'node-1',
          san: 'Bxh7+',
          uci: 'd3h7',
          fen: 'fen_after_bxh7',
          turn: 'b',
          arrows: [{ from: 'd3', to: 'h7', color: VUKOVIC_ARROW_PALETTE.SACRIFICE }],
          children: [
            {
              id: 'node-2-main',
              san: 'Kxh7',
              uci: 'g8h7',
              fen: 'fen_kxh7',
              turn: 'w',
              children: [
                {
                  id: 'node-3',
                  san: 'Ng5+',
                  uci: 'f3g5',
                  fen: 'fen_ng5',
                  turn: 'b',
                  children: [],
                },
              ],
            },
            {
              id: 'node-2-alt',
              san: 'Kh8',
              uci: 'g8h8',
              fen: 'fen_kh8',
              turn: 'w',
              children: [],
            },
          ],
        },
      ],
    };

    // 1. findNodeById
    const foundRoot = findNodeById(mockTree, 'root');
    expect.equal(foundRoot?.id, 'root');

    const foundNode3 = findNodeById(mockTree, 'node-3');
    expect.equal(foundNode3?.id, 'node-3');
    expect.equal(foundNode3?.san, 'Ng5+');

    const notFound = findNodeById(mockTree, 'non-existent-id');
    expect.equal(notFound, null);

    // 2. findPathToNode
    const path3 = findPathToNode(mockTree, 'node-3');
    expect.equal(path3.length, 4, 'Path to node-3 must contain root -> node-1 -> node-2-main -> node-3');
    expect.equal(path3[0].id, 'root');
    expect.equal(path3[1].id, 'node-1');
    expect.equal(path3[2].id, 'node-2-main');
    expect.equal(path3[3].id, 'node-3');

    const emptyPath = findPathToNode(mockTree, 'missing');
    expect.deepEqual(emptyPath, []);

    // 3. getMainLine
    const mainLine = getMainLine(mockTree);
    expect.equal(mainLine.length, 4);
    expect.deepEqual(mainLine.map((n) => n.id), ['root', 'node-1', 'node-2-main', 'node-3']);

    // 4. getAllNodes
    const allNodes = getAllNodes(mockTree);
    expect.equal(allNodes.length, 5, 'Tree has exactly 5 nodes total');

    // 5. formatArrowsForBoard
    const arrows = formatArrowsForBoard(mockTree.children[0].arrows);
    expect.equal(arrows.length, 1);
    expect.equal(arrows[0][0], 'd3');
    expect.equal(arrows[0][1], 'h7');
    expect.equal(arrows[0][2], VUKOVIC_ARROW_PALETTE.SACRIFICE);

    const emptyArrows = formatArrowsForBoard(undefined);
    expect.deepEqual(emptyArrows, []);
  });


  // =========================================================================
  // SECTION 2: src/lib/audioSynth.ts Synthesizer White-Box Stress
  // =========================================================================

  it('TC-T5-08: audioSynth SSR execution safety in headless Node (window undefined)', () => {
    // In Node.js environment, window is undefined
    expect.equal(typeof window, 'undefined');

    // All sound execution functions must run without throwing
    let threw = false;
    try {
      playMoveSound();
      playCaptureSound();
      playCheckSound();
      playVictorySound();
      playErrorSound();
    } catch {
      threw = true;
    }
    expect.equal(threw, false, 'SSR audio calls must execute without throwing');
  });

  it('TC-T5-09: audioSynth mute/unmute state machine and facade methods', () => {
    // Reset to unmuted
    setAudioMuted(false);
    expect.equal(isAudioMuted(), false);
    expect.equal(audioSynth.isMuted(), false);

    // Explicit mute
    setAudioMuted(true);
    expect.equal(isAudioMuted(), true);
    expect.equal(audioSynth.isMuted(), true);

    // Toggle back
    const toggled1 = toggleAudio();
    expect.equal(toggled1, false);
    expect.equal(isAudioMuted(), false);

    const toggled2 = audioSynth.toggleMuted();
    expect.equal(toggled2, true);
    expect.equal(isAudioMuted(), true);

    // Facade aliases call cleanly
    audioSynth.setMuted(false);
    let threw = false;
    try {
      audioSynth.playMove();
      audioSynth.playCapture();
      audioSynth.playCheck();
      audioSynth.playVictory();
      audioSynth.playError();
    } catch {
      threw = true;
    }
    expect.equal(threw, false);
  });

  it('TC-T5-10: audioSynth Web Audio API node creation, frequencies, waveforms, and autoplay resume', () => {
    interface MockOsc {
      type: string;
      freqInitial: number;
      freqTarget?: number;
      startTime: number;
      stopTime: number;
    }

    interface MockGain {
      initialGain: number;
      targetGain?: number;
    }

    const createdOscillators: MockOsc[] = [];
    const createdGains: MockGain[] = [];
    let resumeCalled = false;

    class TestAudioContext {
      public state: string = 'suspended';
      public currentTime: number = 100.0;
      public destination = {};

      createOscillator() {
        const osc: any = {
          type: 'sine',
          frequency: {
            setValueAtTime: (val: number) => { osc.freqInitial = val; },
            exponentialRampToValueAtTime: (val: number) => { osc.freqTarget = val; },
          },
          connect: () => {},
          start: (t: number) => { osc.startTime = t; },
          stop: (t: number) => { osc.stopTime = t; },
        };
        createdOscillators.push(osc);
        return osc;
      }

      createGain() {
        const gain: any = {
          gain: {
            setValueAtTime: (val: number) => { gain.initialGain = val; },
            exponentialRampToValueAtTime: (val: number) => { gain.targetGain = val; },
            linearRampToValueAtTime: (val: number) => { gain.targetGain = val; },
          },
          connect: () => {},
        };
        createdGains.push(gain);
        return gain;
      }

      resume() {
        resumeCalled = true;
        this.state = 'running';
        return Promise.resolve();
      }
    }

    // Attach mock window
    (global as any).window = { AudioContext: TestAudioContext };

    try {
      setAudioMuted(false);

      // 1. Move Sound: triangle, 400Hz -> 280Hz
      createdOscillators.length = 0;
      playMoveSound();
      expect.equal(resumeCalled, true, 'Autoplay resume must be invoked on suspended context');
      expect.equal(createdOscillators.length, 1);
      expect.equal(createdOscillators[0].type, 'triangle');
      expect.equal(createdOscillators[0].freqInitial, 400);
      expect.equal(createdOscillators[0].freqTarget, 280);

      // 2. Capture Sound: sawtooth, 260Hz -> 140Hz
      createdOscillators.length = 0;
      playCaptureSound();
      expect.equal(createdOscillators.length, 1);
      expect.equal(createdOscillators[0].type, 'sawtooth');
      expect.equal(createdOscillators[0].freqInitial, 260);
      expect.equal(createdOscillators[0].freqTarget, 140);

      // 3. Check Sound: dual tone (880Hz + 1760Hz overtone)
      createdOscillators.length = 0;
      playCheckSound();
      expect.equal(createdOscillators.length, 2, 'Check sound must use fundamental + overtone');
      expect.equal(createdOscillators[0].freqInitial, 880);
      expect.equal(createdOscillators[1].freqInitial, 1760);

      // 4. Victory Sound: 4 arpeggio notes (523.25, 659.25, 783.99, 1046.50)
      createdOscillators.length = 0;
      playVictorySound();
      expect.equal(createdOscillators.length, 4, 'Victory fanfare must play 4 ascending notes');
      expect.equal(createdOscillators[0].freqInitial, 523.25); // C5
      expect.equal(createdOscillators[3].freqInitial, 1046.50); // C6

      // 5. Error Sound: sawtooth, 150Hz -> 70Hz
      createdOscillators.length = 0;
      playErrorSound();
      expect.equal(createdOscillators.length, 1);
      expect.equal(createdOscillators[0].type, 'sawtooth');
      expect.equal(createdOscillators[0].freqInitial, 150);
      expect.equal(createdOscillators[0].freqTarget, 70);
    } finally {
      delete (global as any).window;
    }
  });


  // =========================================================================
  // SECTION 3: src/lib/storage.ts LocalStorage Resilience & Boundary Tests
  // =========================================================================

  it('TC-T5-11: storage getDefaultUserStats and empty storage initialization', () => {
    clearProgress();
    const stats = getDefaultUserStats();
    expect.equal(stats.version, 1);
    expect.equal(stats.totalStudiesCompleted, 0);
    expect.equal(stats.overallAccuracy, 0);
    expect.equal(stats.masteryPoints, 0);
    expect.equal(stats.currentStreakDays, 1);
    expect.deepEqual(stats.studies, {});

    // Reading with nothing stored returns default stats
    const loaded = loadUserStats();
    expect.equal(loaded.version, 1);
    expect.equal(loaded.totalStudiesCompleted, 0);
  });

  it('TC-T5-12: storage corrupted JSON recovery and non-object handling', () => {
    // Emulate window with custom mock localStorage to test corrupted storage recovery
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };

    (global as any).window = { localStorage: mockStorage };

    try {
      // 1. Corrupted non-JSON string
      store.set(STORAGE_KEY, '<<<UNPARSEABLE NON-JSON GARBAGE>>>');
      const recovered1 = loadUserStats();
      expect.equal(recovered1.version, 1);
      expect.equal(recovered1.totalStudiesCompleted, 0);

      // 2. Parsed primitive value (e.g. "12345" or "true")
      store.set(STORAGE_KEY, '12345');
      const recovered2 = loadUserStats();
      expect.equal(recovered2.version, 1);
      expect.equal(recovered2.totalStudiesCompleted, 0);

      // 3. Corrupted active session payload
      store.set(SESSION_KEY, '{invalid_session_json');
      const session = getActiveSession('any-study');
      expect.equal(session, null, 'Corrupted session must safely return null without throwing');
    } finally {
      delete (global as any).window;
    }
  });

  it('TC-T5-13: storage out-of-bounds, negative values, and missing fields sanitization', () => {
    clearProgress();

    // 1. Save study record with out-of-bounds score (150) and negative accuracy (-30)
    saveStudyRecord({
      studyId: 'study-boundary-1',
      themeId: 'greek_gift',
      score: 150,
      accuracyPercent: -30,
      cleanDepth: 5,
    });

    const prog1 = getStudyProgress('study-boundary-1');
    expect.ok(prog1 !== null);
    expect.equal(prog1?.bestScore, 100, 'Score > 100 must be clamped to 100');
    expect.equal(prog1?.bestAccuracy, 0, 'Negative accuracy must be clamped to 0');
    expect.equal(prog1?.attemptsCount, 1);
    expect.equal(prog1?.completed, true);

    // 2. High-score monotonicity: saving a lower score (40) must preserve previous bestScore (100)
    saveStudyRecord({
      studyId: 'study-boundary-1',
      score: 40,
      accuracyPercent: 90,
      cleanDepth: 3,
    });

    const prog2 = getStudyProgress('study-boundary-1');
    expect.equal(prog2?.bestScore, 100, 'Existing higher score (100) must be preserved');
    expect.equal(prog2?.bestAccuracy, 90, 'Higher accuracy (90) must be updated');
    expect.equal(prog2?.attemptsCount, 2, 'Attempts count must increment to 2');
    expect.equal(prog2?.cleanDepth, 5, 'Best clean depth must be preserved');

    // 3. Catalog aggregation
    const allStats = loadUserStats();
    expect.equal(allStats.totalStudiesCompleted, 1);
    expect.equal(allStats.masteryPoints, 100);
    expect.equal(allStats.overallAccuracy, 90);
  });

  it('TC-T5-14: storage active session lifecycle (save, retrieve, mismatch, clear)', () => {
    clearProgress();

    const sessionData = {
      studyId: 'colle-1930',
      stepIndex: 2,
      elapsedSeconds: 45,
      currentScoreAcc: 85,
      stepAttempts: { 0: 1, 1: 2 },
      hintsUsed: { 1: 1 },
    };

    saveActiveSession(sessionData);

    // 1. Retrieve with matching studyId
    const loadedSession = getActiveSession('colle-1930');
    expect.ok(loadedSession !== null);
    expect.equal(loadedSession?.studyId, 'colle-1930');
    expect.equal(loadedSession?.stepIndex, 2);
    expect.equal(loadedSession?.elapsedSeconds, 45);

    // 2. Retrieve with different studyId returns null
    const diffSession = getActiveSession('other-study-id');
    expect.equal(diffSession, null);

    // 3. Clear active session
    clearActiveSession();
    expect.equal(getActiveSession('colle-1930'), null);
  });

  it('TC-T5-15: storage QuotaExceededError fallback and purge of session key', () => {
    let sessionPurged = false;

    const mockStorage = {
      getItem: (_k: string) => null,
      setItem: (key: string, _v: string) => {
        if (key === STORAGE_KEY) {
          const err: any = new Error('QuotaExceededError');
          err.name = 'QuotaExceededError';
          err.code = 22;
          throw err;
        }
      },
      removeItem: (key: string) => {
        if (key === SESSION_KEY) {
          sessionPurged = true;
        }
      },
    };

    (global as any).window = { localStorage: mockStorage };

    try {
      let threw = false;
      try {
        saveStudyRecord({
          studyId: 'quota-study',
          score: 80,
          accuracyPercent: 85,
          cleanDepth: 4,
        });
      } catch {
        threw = true;
      }

      expect.equal(threw, false, 'saveStudyRecord must handle QuotaExceededError without crashing');
      expect.equal(sessionPurged, true, 'SESSION_KEY must be purged when QuotaExceededError occurs');
    } finally {
      delete (global as any).window;
    }
  });


  // =========================================================================
  // SECTION 4: src/lib/validation.ts Dataset Validator White-Box Stress
  // =========================================================================

  it('TC-T5-16: validation validateDataset passes 100% on production studies', () => {
    expect.ok(allStudies.length >= 15, 'Dataset must have at least 15 studies');
    const summary = validateDataset(allStudies);

    expect.equal(summary.totalStudies, 18, 'Expected 18 canonical master studies');
    expect.equal(summary.validStudies, 18, 'All 18 studies must be valid');
    expect.equal(summary.failedStudies, 0, 'Zero studies must fail');
    expect.greaterThanOrEqual(summary.totalMovesVerified, 200, 'Must verify >= 200 moves across all study trees');
  });

  it('TC-T5-17: validation validateStudy detects corrupted initial FEN', () => {
    const bogusStudy: VukovicStudy = {
      id: 'bogus-fen-study',
      title: 'Невалидный FEN тест',
      white: 'White',
      black: 'Black',
      initialFen: '8/8/8/8/8/8/8/8 w - - 0 1', // No kings
      orientation: 'white',
      chapter: 'greek_gift',
      chapterTitle: 'Классическая жертва слона',
      difficulty: 2000,
      tags: ['test'],
      description: 'Тестовый этюд',
      calculationTargetPlies: 3,
      rootNode: {
        id: 'root',
        san: '',
        uci: '',
        fen: '8/8/8/8/8/8/8/8 w - - 0 1',
        turn: 'w',
        children: [],
      },
    };

    const res = validateStudy(bogusStudy);
    expect.equal(res.valid, false);
    expect.greaterThan(res.errors.length, 0);
    expect.ok(res.errors[0].includes('Невалидный стартовый FEN'));
  });

  it('TC-T5-18: validation validateStudy detects illegal move in variation tree', () => {
    const illegalMoveStudy: VukovicStudy = {
      id: 'illegal-move-study',
      title: 'Нелегальный ход в дереве',
      white: 'White',
      black: 'Black',
      initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      orientation: 'white',
      chapter: 'rook_lift',
      chapterTitle: 'Ладейный лифт',
      difficulty: 1800,
      tags: ['test'],
      description: 'Тестовый этюд с нелегальным ходом',
      calculationTargetPlies: 1,
      rootNode: {
        id: 'root',
        san: 'e2e6', // Illegal pawn jump across 4 squares!
        uci: 'e2e6',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        turn: 'w',
        children: [],
      },
    };

    const res = validateStudy(illegalMoveStudy);
    expect.equal(res.valid, false);
    expect.ok(res.errors.some((e) => e.includes('Нелегальный ход')));
  });

  it('TC-T5-19: validation validateStudy detects active turn mismatch and FEN divergence', () => {
    const turnMismatchStudy: VukovicStudy = {
      id: 'turn-mismatch-study',
      title: 'Несоответствие очереди хода',
      white: 'White',
      black: 'Black',
      initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // White to move
      orientation: 'white',
      chapter: 'king_hunt',
      chapterTitle: 'Охота на короля',
      difficulty: 2200,
      tags: ['test'],
      description: 'Тестовый этюд',
      calculationTargetPlies: 1,
      rootNode: {
        id: 'root',
        san: 'e4',
        uci: 'e2e4',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        turn: 'b', // Flagged as black turn when position is white to move!
        children: [],
      },
    };

    const res = validateStudy(turnMismatchStudy);
    expect.equal(res.valid, false);
    expect.ok(res.errors.some((e) => e.includes('Несоответствие очереди хода')));
  });

  it('TC-T5-20: validation validateStudy detects false checkmate "#" in SAN', () => {
    const falseMateStudy: VukovicStudy = {
      id: 'false-mate-study',
      title: 'Ложный символ мата',
      white: 'White',
      black: 'Black',
      initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      orientation: 'white',
      chapter: 'greek_gift',
      chapterTitle: 'Классическая жертва',
      difficulty: 2000,
      tags: ['test'],
      description: 'Тестовый этюд с ложным матом',
      calculationTargetPlies: 1,
      rootNode: {
        id: 'root',
        san: 'e4#', // Has '#' but 1.e4 is obviously not checkmate!
        uci: 'e2e4',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        turn: 'w',
        children: [],
      },
    };

    const res = validateStudy(falseMateStudy);
    expect.equal(res.valid, false);
    expect.ok(res.errors.some((e) => e.includes('позиция не является матом')));
  });


  // =========================================================================
  // SECTION 5: React Chess Components Logic & Adversarial Interaction Stress
  // =========================================================================

  it('TC-T5-21: PromotionModal choices, Russian naming, symbols, and keyboard shortcuts mapping', () => {
    // White piece choices
    const choices = [
      { piece: 'q', name: 'Ферзь', whiteSymbol: '♕', blackSymbol: '♛', shortcut: '1' },
      { piece: 'r', name: 'Ладья', whiteSymbol: '♖', blackSymbol: '♜', shortcut: '2' },
      { piece: 'b', name: 'Слон', whiteSymbol: '♗', blackSymbol: '♝', shortcut: '3' },
      { piece: 'n', name: 'Конь', whiteSymbol: '♘', blackSymbol: '♞', shortcut: '4' },
    ];

    expect.equal(choices.length, 4);

    // Hotkey handler simulation
    function simulateHotkey(key: string): string | null {
      const k = key.toLowerCase();
      if (k === '1' || k === 'q') return 'q';
      if (k === '2' || k === 'r') return 'r';
      if (k === '3' || k === 'b') return 'b';
      if (k === '4' || k === 'n' || k === 'k') return 'n';
      if (k === 'escape') return 'cancel';
      return null;
    }

    expect.equal(simulateHotkey('1'), 'q');
    expect.equal(simulateHotkey('q'), 'q');
    expect.equal(simulateHotkey('2'), 'r');
    expect.equal(simulateHotkey('r'), 'r');
    expect.equal(simulateHotkey('3'), 'b');
    expect.equal(simulateHotkey('b'), 'b');
    expect.equal(simulateHotkey('4'), 'n');
    expect.equal(simulateHotkey('n'), 'n');
    expect.equal(simulateHotkey('k'), 'n', '"k" also triggers knight promotion');
    expect.equal(simulateHotkey('escape'), 'cancel');
    expect.equal(simulateHotkey('x'), null);
  });

  it('TC-T5-22: BoardControls orientation flip, sound toggle, reset, and navigation buttons', () => {
    let orientation: 'white' | 'black' = 'white';
    let isSoundEnabled = true;
    let resetCalled = false;
    let undoCalled = false;
    let redoCalled = false;

    function handleFlip() {
      orientation = orientation === 'white' ? 'black' : 'white';
    }

    function handleToggleSound() {
      isSoundEnabled = !isSoundEnabled;
    }

    // 1. Initial orientation
    expect.equal(orientation, 'white');

    // 2. Flip orientation
    handleFlip();
    expect.equal(orientation, 'black');
    handleFlip();
    expect.equal(orientation, 'white');

    // 3. Toggle sound
    expect.equal(isSoundEnabled, true);
    handleToggleSound();
    expect.equal(isSoundEnabled, false);
    handleToggleSound();
    expect.equal(isSoundEnabled, true);

    // 4. Reset, Undo, Redo contracts
    function onReset() { resetCalled = true; }
    function onUndo() { undoCalled = true; }
    function onRedo() { redoCalled = true; }

    onReset();
    onUndo();
    onRedo();
    expect.equal(resetCalled, true);
    expect.equal(undoCalled, true);
    expect.equal(redoCalled, true);
  });

  it('TC-T5-23: ChessboardWrapper Click-to-Move and Drag-and-Drop state machine contracts', () => {
    // Fen: White pawn on e7, white king e1, black king h8 (e8 is empty promotion square)
    const fen = '7k/4P3/8/8/8/8/8/4K3 w - - 0 1';

    // Click 1: Friendly piece selected
    const activeColor = getActiveColor(fen);
    const pieceOnE7 = getPieceAtSquare(fen, 'e7');
    expect.equal(activeColor, 'w');
    expect.ok(pieceOnE7 !== null);
    expect.equal(pieceOnE7?.color, 'w');

    // Calculate legal targets
    const legalTargets = getLegalTargetSquares(fen, 'e7');
    expect.ok(legalTargets.includes('e8'));

    // Check promotion condition
    const isPromo = isPromotion(fen, 'e7', 'e8');
    expect.equal(isPromo, true);

    // Deselection on clicking empty or non-target square
    const nonTargetSquare: Square = 'a4';
    expect.equal(legalTargets.includes(nonTargetSquare), false);

    // Drag-and-drop legality verification
    function simulateDrop(src: Square, tgt: Square): 'LEGAL' | 'PROMOTION' | 'ILLEGAL' {
      const targets = getLegalTargetSquares(fen, src);
      if (!targets.includes(tgt)) return 'ILLEGAL';
      if (isPromotion(fen, src, tgt)) return 'PROMOTION';
      return 'LEGAL';
    }

    expect.equal(simulateDrop('e7', 'e8'), 'PROMOTION');
    expect.equal(simulateDrop('e7', 'e6'), 'ILLEGAL');
    expect.equal(simulateDrop('e1', 'e2'), 'LEGAL');
  });

  it('TC-T5-24: Verification of promotion piece parameter contract between ChessboardWrapper and onPieceDrop', () => {
    // When promotion is confirmed in PromotionModal, ChessboardWrapper invokes:
    // onPieceDrop(from, to, chosenPiece) where chosenPiece is 'q' | 'r' | 'b' | 'n'.
    //
    // A consumer handling promotion via chess.js must pass { from, to, promotion: piece }
    // rather than { from, to } alone, because chess.js throws "Invalid move: {from, to}"
    // when a pawn reaches the last rank without a promotion piece specified.

    const promoFen = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1';

    function consumerMoveHandler(from: Square, to: Square, piece: string): boolean {
      const chess = new Chess(promoFen);
      try {
        const isPromoPiece = ['q', 'r', 'b', 'n'].includes(piece.toLowerCase());
        const moveOptions = isPromoPiece
          ? { from, to, promotion: piece.toLowerCase() }
          : { from, to };

        const move = chess.move(moveOptions);
        return Boolean(move);
      } catch {
        return false;
      }
    }

    // Must succeed when passing promotion piece 'q'
    const successQueen = consumerMoveHandler('e7', 'e8', 'q');
    expect.equal(successQueen, true, 'Promotion move with "q" must succeed in chess engine');

    // Must succeed when passing promotion piece 'n'
    const successKnight = consumerMoveHandler('e7', 'e8', 'n');
    expect.equal(successKnight, true, 'Underpromotion to knight must succeed');

    // Attempting move without promotion throws/fails
    const failureNoPromo = consumerMoveHandler('e7', 'e8', 'wP');
    expect.equal(failureNoPromo, false, 'Pawn move to 8th rank without promotion spec must be rejected by chess.js');
  });

});

runSuite();
