/**
 * Challenger 2 Empirical Test Suite for Milestone 2 (M2)
 * 
 * Verifies:
 * 1. `formatArrowsForBoard` correctly translates `ArrowConfig` to `[Square, Square, string?][]`
 *    across empty, normal, edge-case, and all 18 Vukovic dataset studies.
 * 2. Semantic arrow colors for Vukovic attacks (threat, attack, sacrifice, concept, maneuver, defense)
 *    conform to valid CSS color specifications.
 * 3. `getSquareHighlightStyles` renders emerald radial-gradient dots for quiet moves,
 *    red radial-gradient rings for capture moves (including en passant and promotion captures),
 *    amber highlight for selected square, and red glow for king in check.
 * 4. Audio synthesizer exports (`playMoveSound`, `playCaptureSound`, `playCheckSound`,
 *    `playVictorySound`, `playErrorSound`, `isAudioMuted`, `setAudioMuted`)
 *    exist and execute without errors in both Node.js and simulated Browser environments.
 * 5. Adversarial stress & boundary tests: castling dots, promotion highlights, pinned pieces,
 *    checkmate vs stalemate distinction, immutability, and suspended audio resume rejection.
 */

import { describe, it, expect, runSuite } from './e2e/harness/testRunner.ts';
import { Square } from 'chess.js';
import { ArrowConfig, MoveNode } from '../src/types/chess.ts';
import {
  formatArrowsForBoard,
  VUKOVIC_ARROW_PALETTE,
  getSquareHighlightStyles,
  getLegalMovesForSquare,
  isCaptureSquare,
} from '../src/lib/chessUtils.ts';
import {
  playMoveSound,
  playCaptureSound,
  playCheckSound,
  playVictorySound,
  playErrorSound,
  isAudioMuted,
  setAudioMuted,
  toggleAudio,
  audioSynth,
} from '../src/lib/audioSynth.ts';
import { allStudies } from '../src/data/studies/index.ts';

// Helper: CSS Color validator
function isValidCssColor(color: string): boolean {
  if (!color || typeof color !== 'string') return false;
  const trimmed = color.trim();

  // Named colors
  const namedColors = new Set([
    'transparent', 'currentColor', 'inherit',
    'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'black', 'white',
    'gray', 'grey', 'cyan', 'magenta', 'gold', 'silver', 'lime',
  ]);
  if (namedColors.has(trimmed.toLowerCase())) return true;

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
  const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  if (hexRegex.test(trimmed)) return true;

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbaRegex = /^rgba?\(\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)(?:\s*,\s*(0|1|0?\.\d+|\d{1,3}%))?\s*\)$/;
  if (rgbaRegex.test(trimmed)) return true;

  // hsl(h, s, l) or hsla(h, s, l, a)
  const hslaRegex = /^hsla?\(\s*(\d{1,3}(?:deg)?)\s*,\s*(\d{1,3}%)\s*,\s*(\d{1,3}%)(?:\s*,\s*(0|1|0?\.\d+|\d{1,3}%))?\s*\)$/;
  if (hslaRegex.test(trimmed)) return true;

  return false;
}

// Helper: Recursively collect all arrows from study MoveNode tree
function collectAllArrows(node: MoveNode): ArrowConfig[] {
  const arrows: ArrowConfig[] = [];
  if (node.arrows && Array.isArray(node.arrows)) {
    arrows.push(...node.arrows);
  }
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      arrows.push(...collectAllArrows(child));
    }
  }
  return arrows;
}

describe('Challenger 2 Empirical Verification: M2 Chessboard & Audio Engine', () => {

  // =========================================================================
  // 1. `formatArrowsForBoard` Tests
  // =========================================================================
  describe('Requirement 1: formatArrowsForBoard Translation & Type Integrity', () => {
    it('TC-CH2-01: formatArrowsForBoard handles undefined, null, and empty array without crashing', () => {
      const resUndefined = formatArrowsForBoard(undefined);
      expect.ok(Array.isArray(resUndefined), 'Must return an array on undefined');
      expect.equal(resUndefined.length, 0, 'Must return empty array on undefined');

      const resNull = formatArrowsForBoard(null as any);
      expect.ok(Array.isArray(resNull), 'Must return an array on null');
      expect.equal(resNull.length, 0, 'Must return empty array on null');

      const resEmpty = formatArrowsForBoard([]);
      expect.ok(Array.isArray(resEmpty), 'Must return an array on []');
      expect.equal(resEmpty.length, 0, 'Must return empty array on []');
    });

    it('TC-CH2-02: Correctly translates standard ArrowConfig array to [Square, Square, string?][] tuple', () => {
      const inputArrows: ArrowConfig[] = [
        { from: 'e4', to: 'h7', color: 'rgba(239, 68, 68, 0.9)' },
        { from: 'f3', to: 'g5', color: 'rgba(59, 130, 246, 0.85)' },
        { from: 'd1', to: 'h5', color: 'rgba(245, 158, 11, 0.95)' },
      ];

      const formatted = formatArrowsForBoard(inputArrows);
      expect.equal(formatted.length, 3);

      expect.equal(formatted[0][0], 'e4');
      expect.equal(formatted[0][1], 'h7');
      expect.equal(formatted[0][2], 'rgba(239, 68, 68, 0.9)');

      expect.equal(formatted[1][0], 'f3');
      expect.equal(formatted[1][1], 'g5');
      expect.equal(formatted[1][2], 'rgba(59, 130, 246, 0.85)');

      expect.equal(formatted[2][0], 'd1');
      expect.equal(formatted[2][1], 'h5');
      expect.equal(formatted[2][2], 'rgba(245, 158, 11, 0.95)');
    });

    it('TC-CH2-03: Stress-test formatArrowsForBoard against all arrows across all 18 Vukovic studies', () => {
      let totalStudyArrows = 0;
      const validSquareRegex = /^[a-h][1-8]$/;

      for (const study of allStudies) {
        const studyArrows = collectAllArrows(study.rootNode);
        totalStudyArrows += studyArrows.length;

        const formatted = formatArrowsForBoard(studyArrows);
        expect.equal(formatted.length, studyArrows.length);

        for (let i = 0; i < formatted.length; i++) {
          const [from, to, color] = formatted[i];
          expect.match(from, validSquareRegex, `Source square ${from} in study ${study.id} must be valid`);
          expect.match(to, validSquareRegex, `Target square ${to} in study ${study.id} must be valid`);
          expect.ok(color && typeof color === 'string', `Arrow color must be a valid string in study ${study.id}`);
          expect.ok(isValidCssColor(color!), `Arrow color "${color}" in study ${study.id} must be valid CSS color`);
        }
      }

      expect.greaterThan(totalStudyArrows, 10, 'Platform dataset must contain arrows across studies');
    });

    it('TC-CH2-04: High-throughput stress test: formatArrowsForBoard with 10,000 arrows', () => {
      const largeBatch: ArrowConfig[] = [];
      const squares: Square[] = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8'];
      for (let i = 0; i < 10000; i++) {
        largeBatch.push({
          from: squares[i % squares.length],
          to: squares[(i + 1) % squares.length],
          color: 'rgba(34, 197, 94, 0.8)',
        });
      }

      const start = performance.now();
      const result = formatArrowsForBoard(largeBatch);
      const elapsed = performance.now() - start;

      expect.equal(result.length, 10000);
      expect.lessThanOrEqual(elapsed, 50, '10k arrow conversion must complete in under 50ms');
    });

    it('TC-CH2-21: formatArrowsForBoard does not mutate the input array', () => {
      const original: ArrowConfig[] = [
        { from: 'e2', to: 'e4', color: 'rgba(34, 197, 94, 0.8)' },
      ];
      const cloned = JSON.parse(JSON.stringify(original));
      formatArrowsForBoard(original);
      expect.deepEqual(original, cloned, 'Input array must remain unmodified');
    });
  });

  // =========================================================================
  // 2. Semantic Arrow Colors Verification
  // =========================================================================
  describe('Requirement 2: Semantic Arrow Colors for Vukovic Attacks', () => {
    it('TC-CH2-05: VUKOVIC_ARROW_PALETTE defines valid CSS colors for all tactical motifs', () => {
      const { THREAT, MANEUVER, KNIGHT_JUMP, SACRIFICE, DEFENSE } = VUKOVIC_ARROW_PALETTE;

      // 1. THREAT (Красный: Прямые угрозы, матовые конструкции)
      expect.ok(isValidCssColor(THREAT), `THREAT color "${THREAT}" must be valid CSS`);
      expect.match(THREAT, /rgba\(239,\s*68,\s*68/);

      // 2. MANEUVER (Зеленый: Позиционные маневры, пешечные прорывы)
      expect.ok(isValidCssColor(MANEUVER), `MANEUVER color "${MANEUVER}" must be valid CSS`);
      expect.match(MANEUVER, /rgba\(34,\s*197,\s*94/);

      // 3. KNIGHT_JUMP (Синий: Прыжки и форпосты коней)
      expect.ok(isValidCssColor(KNIGHT_JUMP), `KNIGHT_JUMP color "${KNIGHT_JUMP}" must be valid CSS`);
      expect.match(KNIGHT_JUMP, /rgba\(59,\s*130,\s*246/);

      // 4. SACRIFICE (Янтарный/Золотой: Классические жертвы на h7/g7)
      expect.ok(isValidCssColor(SACRIFICE), `SACRIFICE color "${SACRIFICE}" must be valid CSS`);
      expect.match(SACRIFICE, /rgba\(245,\s*158,\s*11/);

      // 5. DEFENSE (Фиолетовый: Защитные ресурсы черных)
      expect.ok(isValidCssColor(DEFENSE), `DEFENSE color "${DEFENSE}" must be valid CSS`);
      expect.match(DEFENSE, /rgba\(168,\s*85,\s*247/);
    });

    it('TC-CH2-06: Semantic arrow motifs (threat, attack, sacrifice, concept) match CSS color rules', () => {
      const semanticAttackPalette = {
        threat: VUKOVIC_ARROW_PALETTE.THREAT,
        attack: VUKOVIC_ARROW_PALETTE.MANEUVER,
        sacrifice: VUKOVIC_ARROW_PALETTE.SACRIFICE,
        concept: VUKOVIC_ARROW_PALETTE.KNIGHT_JUMP,
      };

      for (const [motif, color] of Object.entries(semanticAttackPalette)) {
        expect.ok(isValidCssColor(color), `Motif "${motif}" color "${color}" must be valid CSS`);
        // Verify opacity component exists in rgba
        expect.match(color, /^rgba\(\d+,\s*\d+,\s*\d+,\s*(0?\.\d+|1)\)$/);
      }
    });
  });

  // =========================================================================
  // 3. Custom Square Styles: Radial-Gradient Dots & Rings
  // =========================================================================
  describe('Requirement 3: Custom Square Styles (Radial Dots & Capture Rings)', () => {
    it('TC-CH2-07: Quiet moves render radial-gradient emerald dots and borderRadius 50%', () => {
      // Standard initial position: White pawn e2 has quiet moves to e3 and e4
      const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const styles = getSquareHighlightStyles({
        fen: initialFen,
        selectedSquare: 'e2',
        lastMove: null,
      });

      // Target e3: quiet empty square move
      expect.ok(styles['e3'] !== undefined, 'Target e3 must have computed style');
      expect.ok(typeof styles['e3'].background === 'string', 'e3 background must be a string');
      expect.match(styles['e3'].background as string, /radial-gradient/, 'e3 must use radial-gradient');
      expect.match(
        styles['e3'].background as string,
        /16,\s*185,\s*129/,
        'e3 dot must use emerald green rgba(16, 185, 129)'
      );
      expect.equal(styles['e3'].borderRadius, '50%', 'e3 must have 50% border radius for circular dot');
      expect.equal(styles['e3'].cursor, 'pointer', 'e3 must have pointer cursor');

      // Target e4: quiet 2-square pawn move
      expect.ok(styles['e4'] !== undefined, 'Target e4 must have computed style');
      expect.match(styles['e4'].background as string, /radial-gradient/);
      expect.match(styles['e4'].background as string, /16,\s*185,\s*129/);
      expect.equal(styles['e4'].borderRadius, '50%');
    });

    it('TC-CH2-08: Capture moves render red ring styles (transparent center + red border ring)', () => {
      // Colle Greek Gift position: White bishop at e4 attacks h7 (Black pawn on h7)
      const greekGiftFen = 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12';
      const styles = getSquareHighlightStyles({
        fen: greekGiftFen,
        selectedSquare: 'e4',
        lastMove: null,
      });

      // Target h7 is occupied by Black pawn -> capture move!
      expect.ok(styles['h7'] !== undefined, 'Capture target h7 must have computed style');
      const h7Bg = styles['h7'].background as string;
      expect.match(h7Bg, /radial-gradient/, 'Capture square h7 must use radial-gradient');
      expect.match(h7Bg, /transparent\s*58%/, 'Capture ring must have transparent inner circle (58%)');
      expect.match(h7Bg, /239,\s*68,\s*68/, 'Capture ring must use red hue rgba(239, 68, 68)');
      expect.equal(styles['h7'].borderRadius, '50%', 'Capture ring must have 50% border radius');

      // Meanwhile, non-capture quiet bishop targets (e.g. d3, f5, g6) must have emerald dots, NOT rings
      for (const quietSq of ['d3', 'f5', 'g6']) {
        if (styles[quietSq]) {
          const bg = styles[quietSq].background as string;
          expect.match(bg, /16,\s*185,\s*129/, `Quiet square ${quietSq} must use emerald dot`);
          expect.ok(!bg.includes('transparent 58%'), `Quiet square ${quietSq} must NOT use capture ring`);
        }
      }
    });

    it('TC-CH2-09: En Passant capture renders red ring style instead of quiet dot', () => {
      // Position where Black just played f7-f5, White pawn on e5 can capture en passant on f6
      const enPassantFen = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';
      const styles = getSquareHighlightStyles({
        fen: enPassantFen,
        selectedSquare: 'e5',
        lastMove: null,
      });

      // Target f6 is physically empty on board, but is an EN PASSANT capture!
      expect.ok(styles['f6'] !== undefined, 'En passant target f6 must have computed style');
      const f6Bg = styles['f6'].background as string;
      expect.match(
        f6Bg,
        /transparent\s*58%/,
        'En passant square f6 must render capture ring (transparent 58%)'
      );
      expect.match(f6Bg, /239,\s*68,\s*68/, 'En passant square f6 must render red ring');

      // Target e6 is a normal quiet pawn push
      expect.ok(styles['e6'] !== undefined, 'Pawn push e6 must have computed style');
      const e6Bg = styles['e6'].background as string;
      expect.match(e6Bg, /16,\s*185,\s*129/, 'Quiet push e6 must render emerald dot');
    });

    it('TC-CH2-10: Selected square and last move highlights render correct styles', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const styles = getSquareHighlightStyles({
        fen,
        selectedSquare: 'd2',
        lastMove: { from: 'g1', to: 'f3' },
      });

      // Selected square d2
      expect.ok(styles['d2'] !== undefined);
      expect.match(styles['d2'].backgroundColor as string, /245,\s*158,\s*11/);
      expect.match(styles['d2'].boxShadow as string, /inset 0 0 0 3px/);

      // Last move from (g1) and to (f3)
      expect.ok(styles['g1'] !== undefined);
      expect.match(styles['g1'].backgroundColor as string, /250,\s*204,\s*21/);
      expect.ok(styles['f3'] !== undefined);
      expect.match(styles['f3'].backgroundColor as string, /250,\s*204,\s*21/);
    });

    it('TC-CH2-11: King in check renders red warning glow style', () => {
      // Position after 12.Bxh7+: Black king on g8 is under check
      const checkFen = 'r1bqr1k1/pp1n1ppB/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 b - - 0 12';
      const styles = getSquareHighlightStyles({
        fen: checkFen,
        selectedSquare: null,
      });

      expect.ok(styles['g8'] !== undefined, 'King square g8 must be highlighted under check');
      expect.match(styles['g8'].backgroundColor as string, /239,\s*68,\s*68/);
      expect.match(styles['g8'].boxShadow as string, /0 0 16px\s*rgba\(239,\s*68,\s*68/);
    });

    it('TC-CH2-12: CustomSquareStyles override takes precedence over default computed styles', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const customStyles = {
        e4: { border: '3px solid purple', zIndex: 10 },
      };
      const styles = getSquareHighlightStyles({
        fen,
        selectedSquare: 'e2',
        customSquareStyles: customStyles,
      });

      expect.equal(styles['e4'].border, '3px solid purple');
      expect.equal(styles['e4'].zIndex, 10);
    });

    it('TC-CH2-17: Castling (O-O and O-O-O) squares render quiet emerald dots', () => {
      // Position with White king at e1 capable of kingside and queenside castling
      const castlingFen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
      const styles = getSquareHighlightStyles({
        fen: castlingFen,
        selectedSquare: 'e1',
        lastMove: null,
      });

      // Kingside castling target: g1 (empty square)
      expect.ok(styles['g1'] !== undefined, 'g1 must have style for O-O');
      expect.match(styles['g1'].background as string, /16,\s*185,\s*129/, 'g1 must have emerald dot');

      // Queenside castling target: c1 (empty square)
      expect.ok(styles['c1'] !== undefined, 'c1 must have style for O-O-O');
      expect.match(styles['c1'].background as string, /16,\s*185,\s*129/, 'c1 must have emerald dot');
    });

    it('TC-CH2-18: Pawn promotion: quiet promotion renders dot, capture promotion renders ring', () => {
      // White pawn on e7: empty on e8, black rook on d8 (can capture promotion), black knight on f8 (can capture promotion)
      const promoFen = '3r1n2/4P3/8/8/8/8/8/4K2k w - - 0 1';
      const styles = getSquareHighlightStyles({
        fen: promoFen,
        selectedSquare: 'e7',
        lastMove: null,
      });

      // Quiet push e7-e8 (empty square) -> emerald dot
      expect.ok(styles['e8'] !== undefined);
      const e8Bg = styles['e8'].background as string;
      expect.match(e8Bg, /16,\s*185,\s*129/, 'Quiet promotion to e8 must render emerald dot');

      // Capture promotion e7xd8 -> red ring
      expect.ok(styles['d8'] !== undefined);
      const d8Bg = styles['d8'].background as string;
      expect.match(d8Bg, /transparent\s*58%/, 'Capture promotion to d8 must render ring');
      expect.match(d8Bg, /239,\s*68,\s*68/, 'Capture promotion to d8 must render red ring');

      // Capture promotion e7xf8 -> red ring
      expect.ok(styles['f8'] !== undefined);
      const f8Bg = styles['f8'].background as string;
      expect.match(f8Bg, /transparent\s*58%/, 'Capture promotion to f8 must render ring');
    });

    it('TC-CH2-19: Checkmate vs Stalemate highlight: Checkmate highlights king, Stalemate does not', () => {
      // Checkmate: Fool's Mate (Black queen on h4 mates White king on e1)
      const mateFen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
      const mateStyles = getSquareHighlightStyles({
        fen: mateFen,
        selectedSquare: null,
      });
      expect.ok(mateStyles['e1'] !== undefined, 'Checkmated king on e1 must have check highlight');
      expect.match(mateStyles['e1'].backgroundColor as string, /239,\s*68,\s*68/);

      // Stalemate: White king on h1, Black queen on g3, Black king on f2 -> White has no legal moves but is NOT in check
      const staleFen = '7k/8/8/8/8/6q1/5k2/7K w - - 0 1';
      const staleStyles = getSquareHighlightStyles({
        fen: staleFen,
        selectedSquare: null,
      });
      expect.ok(staleStyles['h1'] === undefined, 'Stalemated king on h1 must NOT be highlighted with check glow');
    });

    it('TC-CH2-20: Fully pinned piece renders no legal dots without throwing errors', () => {
      // White knight on e2 is completely pinned to king e1 by Black rook on e8
      const pinnedFen = '4r3/8/8/8/8/8/4N3/4K3 w - - 0 1';
      const styles = getSquareHighlightStyles({
        fen: pinnedFen,
        selectedSquare: 'e2',
        lastMove: null,
      });

      // Knight at e2 has selected square style
      expect.ok(styles['e2'] !== undefined);
      expect.match(styles['e2'].backgroundColor as string, /245,\s*158,\s*11/);

      // Knight cannot move anywhere: no other squares should have move dots
      const squaresWithDots = Object.keys(styles).filter((sq) => sq !== 'e2');
      expect.equal(squaresWithDots.length, 0, 'Fully pinned piece must have 0 target move dots');
    });
  });

  // =========================================================================
  // 4. Audio Synthesizer Exports & Environment Safety
  // =========================================================================
  describe('Requirement 4: Web Audio Synthesizer Exports & Safe Execution', () => {
    it('TC-CH2-13: Verify all 7 required audio synthesizer functions exist and are callable', () => {
      expect.equal(typeof playMoveSound, 'function', 'playMoveSound must be exported as a function');
      expect.equal(typeof playCaptureSound, 'function', 'playCaptureSound must be exported as a function');
      expect.equal(typeof playCheckSound, 'function', 'playCheckSound must be exported as a function');
      expect.equal(typeof playVictorySound, 'function', 'playVictorySound must be exported as a function');
      expect.equal(typeof playErrorSound, 'function', 'playErrorSound must be exported as a function');
      expect.equal(typeof isAudioMuted, 'function', 'isAudioMuted must be exported as a function');
      expect.equal(typeof setAudioMuted, 'function', 'setAudioMuted must be exported as a function');

      // Additional facade check
      expect.equal(typeof audioSynth.playMove, 'function');
      expect.equal(typeof audioSynth.playCapture, 'function');
      expect.equal(typeof audioSynth.playCheck, 'function');
      expect.equal(typeof audioSynth.playVictory, 'function');
      expect.equal(typeof audioSynth.playError, 'function');
      expect.equal(typeof audioSynth.isMuted, 'function');
      expect.equal(typeof audioSynth.setMuted, 'function');
      expect.equal(typeof audioSynth.toggleMuted, 'function');
    });

    it('TC-CH2-14: Node.js environment safety (window === undefined): no errors or unhandled exceptions', () => {
      // In Node.js, window is undefined. Test calls must gracefully no-op.
      expect.equal(typeof window, 'undefined', 'Sanity check: running in Node environment');

      setAudioMuted(false);
      expect.equal(isAudioMuted(), false);

      // Execute all 5 audio functions without throwing
      let errorOccurred = false;
      try {
        playMoveSound();
        playCaptureSound();
        playCheckSound();
        playVictorySound();
        playErrorSound();
      } catch {
        errorOccurred = true;
      }
      expect.equal(errorOccurred, false, 'Audio functions must not throw in Node');

      // Test mute state transitions
      setAudioMuted(true);
      expect.equal(isAudioMuted(), true);

      try {
        playMoveSound();
        playCaptureSound();
      } catch {
        errorOccurred = true;
      }
      expect.equal(errorOccurred, false, 'Audio functions must not throw when muted');

      toggleAudio();
      expect.equal(isAudioMuted(), false);
      toggleAudio();
      expect.equal(isAudioMuted(), true);
      setAudioMuted(false);
      expect.equal(isAudioMuted(), false);
    });

    it('TC-CH2-15: Simulated Browser environment with Mock AudioContext: oscillator frequencies & waveforms', () => {
      // Setup mock browser Web Audio environment
      const scheduledOscillators: Array<{
        type: OscillatorType;
        frequencyValues: number[];
        startTime?: number;
        stopTime?: number;
      }> = [];

      class MockOscillator {
        type: OscillatorType = 'sine';
        frequency: {
          value: number;
          setValueAtTime: (val: number, time?: number) => void;
          exponentialRampToValueAtTime: (val: number, time?: number) => void;
          linearRampToValueAtTime: (val: number, time?: number) => void;
        };
        private oscRecord: any;

        constructor(record: any) {
          this.oscRecord = record;
          this.frequency = {
            value: 440,
            setValueAtTime: (val: number) => {
              this.frequency.value = val;
              this.oscRecord.frequencyValues.push(val);
            },
            exponentialRampToValueAtTime: (val: number) => {
              this.oscRecord.frequencyValues.push(val);
            },
            linearRampToValueAtTime: (val: number) => {
              this.oscRecord.frequencyValues.push(val);
            },
          };
        }
        connect(_dest: any) {}
        start(time: number) {
          this.oscRecord.startTime = time;
        }
        stop(time: number) {
          this.oscRecord.stopTime = time;
        }
      }

      class MockGain {
        gain = {
          value: 1,
          setValueAtTime: (_val: number) => {},
          exponentialRampToValueAtTime: (_val: number) => {},
          linearRampToValueAtTime: (_val: number) => {},
        };
        connect(_dest: any) {}
      }

      class MockAudioContext {
        state: AudioContextState = 'suspended';
        currentTime = 100.0;
        destination = {};
        async resume(): Promise<void> {
          this.state = 'running';
        }
        createOscillator() {
          const oscRecord = {
            type: 'sine' as OscillatorType,
            frequencyValues: [] as number[],
          };
          scheduledOscillators.push(oscRecord);
          const osc = new MockOscillator(oscRecord);
          return new Proxy(osc, {
            set: (target: any, prop: string, value: any) => {
              if (prop === 'type') oscRecord.type = value;
              target[prop] = value;
              return true;
            },
          });
        }
        createGain() {
          return new MockGain();
        }
      }

      // Inject mock window
      (globalThis as any).window = {
        AudioContext: MockAudioContext,
      };

      try {
        setAudioMuted(false);

        // 1. playMoveSound: triangle wave, 400 Hz
        scheduledOscillators.length = 0;
        playMoveSound();
        expect.greaterThanOrEqual(scheduledOscillators.length, 1, 'playMoveSound must schedule oscillator');
        expect.equal(scheduledOscillators[0].type, 'triangle');
        expect.equal(scheduledOscillators[0].frequencyValues[0], 400);

        // 2. playCaptureSound: sawtooth wave, 260 Hz
        scheduledOscillators.length = 0;
        playCaptureSound();
        expect.greaterThanOrEqual(scheduledOscillators.length, 1, 'playCaptureSound must schedule oscillator');
        expect.equal(scheduledOscillators[0].type, 'sawtooth');
        expect.equal(scheduledOscillators[0].frequencyValues[0], 260);

        // 3. playCheckSound: sine waves, 880 Hz + 1760 Hz overtone
        scheduledOscillators.length = 0;
        playCheckSound();
        expect.equal(scheduledOscillators.length, 2, 'playCheckSound must schedule 2 oscillators (fundamental + overtone)');
        expect.equal(scheduledOscillators[0].type, 'sine');
        expect.equal(scheduledOscillators[0].frequencyValues[0], 880);
        expect.equal(scheduledOscillators[1].frequencyValues[0], 1760);

        // 4. playVictorySound: C5-E5-G5-C6 arpeggio (4 oscillators)
        scheduledOscillators.length = 0;
        playVictorySound();
        expect.equal(scheduledOscillators.length, 4, 'playVictorySound must schedule 4 arpeggio notes');
        expect.equal(scheduledOscillators[0].frequencyValues[0], 523.25); // C5
        expect.equal(scheduledOscillators[1].frequencyValues[0], 659.25); // E5
        expect.equal(scheduledOscillators[2].frequencyValues[0], 783.99); // G5
        expect.equal(scheduledOscillators[3].frequencyValues[0], 1046.50); // C6

        // 5. playErrorSound: low warning pitch (150 Hz -> 70 Hz, sawtooth)
        scheduledOscillators.length = 0;
        playErrorSound();
        expect.greaterThanOrEqual(scheduledOscillators.length, 1, 'playErrorSound must schedule oscillator');
        expect.equal(scheduledOscillators[0].type, 'sawtooth');
        expect.equal(scheduledOscillators[0].frequencyValues[0], 150);

        // 6. Test mute in browser environment: no oscillators should be created when muted
        setAudioMuted(true);
        scheduledOscillators.length = 0;
        playMoveSound();
        playCaptureSound();
        playCheckSound();
        playVictorySound();
        playErrorSound();
        expect.equal(scheduledOscillators.length, 0, 'No sound must play when muted');
        setAudioMuted(false);

      } finally {
        // Clean up mock window to restore Node environment
        delete (globalThis as any).window;
      }
    });

    it('TC-CH2-16: Rapid burst of 1,000 audio calls completes without memory leak or crashes', () => {
      setAudioMuted(false);
      const start = performance.now();
      for (let i = 0; i < 200; i++) {
        playMoveSound();
        playCaptureSound();
        playCheckSound();
        playVictorySound();
        playErrorSound();
      }
      const elapsed = performance.now() - start;
      expect.lessThanOrEqual(elapsed, 100, '1000 audio function calls must execute in under 100ms');
    });

    it('TC-CH2-22: Audio synthesizer handles resume() promise rejection without throwing', () => {
      class RejectingAudioContext {
        state: AudioContextState = 'suspended';
        currentTime = 1.0;
        destination = {};
        async resume(): Promise<void> {
          throw new Error('Autoplay policy prevented audio resumption');
        }
        createOscillator() {
          return {
            type: 'sine',
            frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
            connect: () => {},
            start: () => {},
            stop: () => {},
          };
        }
        createGain() {
          return {
            gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
            connect: () => {},
          };
        }
      }

      (globalThis as any).window = {
        AudioContext: RejectingAudioContext,
      };

      try {
        setAudioMuted(false);
        let errorThrown = false;
        try {
          playMoveSound();
        } catch {
          errorThrown = true;
        }
        expect.equal(errorThrown, false, 'Rejected resume() must not bubble unhandled error');
      } finally {
        delete (globalThis as any).window;
      }
    });
  });
});

runSuite();
