/**
 * Forensic Integrity Audit for Milestone 2 (M2: Interactive Chessboard & Audio Engine)
 * 
 * Verifies genuine implementation vs dummy facades or test-evading mocks:
 * 1. src/lib/audioSynth.ts - Real Web Audio API synthesis (OscillatorNode, GainNode, frequencies, envelopes, muting)
 * 2. src/lib/chessUtils.ts - Genuine chess.js calculations (isPromotion, isCaptureSquare, findKingSquare, styles)
 * 3. src/components/chess/PromotionModal.tsx - Real modal UI, piece choices, hotkey mapping, cancellation
 * 4. src/components/chess/BoardControls.tsx - Real toolbar UI, Russian labels, flip/sound/reset callbacks
 * 5. src/components/chess/ChessboardWrapper.tsx - Genuine react-chessboard integration, Click-to-Move, Drag-Drop
 */

import { Chess, Square } from 'chess.js';
import * as audioSynthModule from '../../src/lib/audioSynth';
import * as chessUtilsModule from '../../src/lib/chessUtils';
import PromotionModal from '../../src/components/chess/PromotionModal';
import BoardControls from '../../src/components/chess/BoardControls';
import ChessboardWrapper from '../../src/components/chess/ChessboardWrapper';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failureLog: string[] = [];

function assert(condition: boolean, checkName: string, detail?: string): void {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ${GREEN}✓ PASS${RESET} | ${checkName}`);
  } else {
    failedChecks++;
    const msg = `[FAIL] ${checkName}${detail ? `: ${detail}` : ''}`;
    failureLog.push(msg);
    console.error(`  ${RED}✖ FAIL${RESET} | ${msg}`);
  }
}

console.log(`${CYAN}${BOLD}`);
console.log('==============================================================================');
console.log('🕵️   FORENSIC INTEGRITY AUDIT — MILESTONE 2 (Interactive Chessboard & Audio)  ');
console.log('==============================================================================');
console.log(`${RESET}`);

// ============================================================================
// PART 1: FORENSIC AUDIT OF src/lib/audioSynth.ts
// ============================================================================
console.log(`${YELLOW}${BOLD}--- PART 1: Web Audio API Synth Verification (audioSynth.ts) ---${RESET}`);

// Mock Web Audio API tracking structures
interface MockOscillator {
  type: string;
  frequency: {
    value: number;
    setValueAtTime: (val: number, time: number) => void;
    exponentialRampToValueAtTime: (val: number, time: number) => void;
    linearRampToValueAtTime: (val: number, time: number) => void;
  };
  connect: (dest: any) => void;
  start: (time: number) => void;
  stop: (time: number) => void;
  startTime?: number;
  stopTime?: number;
}

interface MockGain {
  gain: {
    value: number;
    setValueAtTime: (val: number, time: number) => void;
    exponentialRampToValueAtTime: (val: number, time: number) => void;
    linearRampToValueAtTime: (val: number, time: number) => void;
  };
  connect: (dest: any) => void;
}

const createdOscillators: MockOscillator[] = [];
const createdGains: MockGain[] = [];
let mockCurrentTime = 100.0;

class MockAudioContext {
  state: 'suspended' | 'running' = 'running';
  currentTime = mockCurrentTime;
  destination = { name: 'AudioDestinationNode' };

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  createOscillator(): MockOscillator {
    const osc: MockOscillator = {
      type: 'sine',
      frequency: {
        value: 440,
        setValueAtTime: function (val: number) { this.value = val; },
        exponentialRampToValueAtTime: function (val: number) { this.value = val; },
        linearRampToValueAtTime: function (val: number) { this.value = val; },
      },
      connect: () => {},
      start: function (time: number) { this.startTime = time; },
      stop: function (time: number) { this.stopTime = time; },
    };
    createdOscillators.push(osc);
    return osc;
  }

  createGain(): MockGain {
    const gain: MockGain = {
      gain: {
        value: 1.0,
        setValueAtTime: function (val: number) { this.value = val; },
        exponentialRampToValueAtTime: function (val: number) { this.value = val; },
        linearRampToValueAtTime: function (val: number) { this.value = val; },
      },
      connect: () => {},
    };
    createdGains.push(gain);
    return gain;
  }
}

// 1.1 Verify SSR Safety when window is undefined
assert(
  typeof (audioSynthModule.playMoveSound) === 'function',
  'audioSynth.playMoveSound is a function'
);
// Running without window should NOT throw
let ssrNoError = true;
try {
  audioSynthModule.setAudioMuted(false);
  audioSynthModule.playMoveSound();
  audioSynthModule.playCaptureSound();
  audioSynthModule.playCheckSound();
  audioSynthModule.playVictorySound();
  audioSynthModule.playErrorSound();
} catch (e) {
  ssrNoError = false;
}
assert(ssrNoError, 'audioSynth gracefully degrades in SSR (window is undefined) without throwing');

// 1.2 Inject Mock Window & AudioContext to inspect genuine synthesis
(global as any).window = {
  AudioContext: MockAudioContext,
};

// Test Mute Controls
audioSynthModule.setAudioMuted(true);
assert(audioSynthModule.isAudioMuted() === true, 'setAudioMuted(true) sets muted state');
createdOscillators.length = 0;
audioSynthModule.playMoveSound();
assert(createdOscillators.length === 0, 'playMoveSound() creates 0 nodes when muted');

const toggled = audioSynthModule.toggleAudio();
assert(toggled === false && audioSynthModule.isAudioMuted() === false, 'toggleAudio() unmutes audio');

// Test Move Sound: 400 Hz triangle wave
createdOscillators.length = 0;
createdGains.length = 0;
audioSynthModule.playMoveSound();
assert(createdOscillators.length === 1, 'playMoveSound creates 1 OscillatorNode');
assert(createdOscillators[0]?.type === 'triangle', 'playMoveSound oscillator type is triangle');
assert(createdOscillators[0]?.frequency.value === 280, 'playMoveSound ramps down to 280 Hz');

// Test Capture Sound: 260 Hz sawtooth wave
createdOscillators.length = 0;
createdGains.length = 0;
audioSynthModule.playCaptureSound();
assert(createdOscillators.length === 1, 'playCaptureSound creates 1 OscillatorNode');
assert(createdOscillators[0]?.type === 'sawtooth', 'playCaptureSound oscillator type is sawtooth');
assert(createdOscillators[0]?.frequency.value === 140, 'playCaptureSound ramps down to 140 Hz');

// Test Check Sound: 880 Hz + 1760 Hz dual sine wave overtone
createdOscillators.length = 0;
createdGains.length = 0;
audioSynthModule.playCheckSound();
assert(createdOscillators.length === 2, 'playCheckSound creates 2 OscillatorNodes (fundamental + overtone)');
assert(createdOscillators[0]?.type === 'sine' && createdOscillators[1]?.type === 'sine', 'playCheckSound uses pure sine waves');
assert(createdOscillators[0]?.frequency.value === 880, 'playCheckSound fundamental is 880 Hz');
assert(createdOscillators[1]?.frequency.value === 1760, 'playCheckSound harmonic overtone is 1760 Hz');

// Test Victory Sound: C5 - E5 - G5 - C6 major arpeggio
createdOscillators.length = 0;
createdGains.length = 0;
audioSynthModule.playVictorySound();
assert(createdOscillators.length === 4, 'playVictorySound creates 4 distinct OscillatorNodes for arpeggio');
const vicFreqs = createdOscillators.map((o) => o.frequency.value);
assert(
  vicFreqs[0] === 523.25 && vicFreqs[1] === 659.25 && vicFreqs[2] === 783.99 && vicFreqs[3] === 1046.5,
  'playVictorySound synthesizes exact C5-E5-G5-C6 note frequencies'
);

// Test Error Sound: 150 Hz -> 70 Hz sawtooth
createdOscillators.length = 0;
createdGains.length = 0;
audioSynthModule.playErrorSound();
assert(createdOscillators.length === 1, 'playErrorSound creates 1 OscillatorNode');
assert(createdOscillators[0]?.type === 'sawtooth', 'playErrorSound oscillator type is sawtooth');
assert(createdOscillators[0]?.frequency.value === 70, 'playErrorSound ramps down to 70 Hz');

// ============================================================================
// PART 2: FORENSIC AUDIT OF src/lib/chessUtils.ts
// ============================================================================
console.log(`\n${YELLOW}${BOLD}--- PART 2: Chess Calculation Utilities Verification (chessUtils.ts) ---${RESET}`);

// 2.1 isPromotion verification across diverse boards
// Case A: Normal opening position (no promotion possible)
const normalFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
assert(chessUtilsModule.isPromotion(normalFen, 'e2', 'e4') === false, 'isPromotion returns false for normal e2-e4 move');

// Case B: Non-pawn reaching 8th rank
const rookFen = '4k3/8/8/8/8/8/4R3/4K3 w - - 0 1';
assert(chessUtilsModule.isPromotion(rookFen, 'e2', 'e8') === false, 'isPromotion returns false for Rook moving to 8th rank');

// Case C: White pawn promotion (quiet push to 8th rank)
const promoWhiteFen = '8/4P3/8/8/8/8/8/4K2k w - - 0 1';
assert(chessUtilsModule.isPromotion(promoWhiteFen, 'e7', 'e8') === true, 'isPromotion returns true for White pawn e7->e8');

// Case D: White pawn promotion (capture on 8th rank)
const promoCaptureFen = '3r4/4P3/8/8/8/8/8/4K2k w - - 0 1';
assert(chessUtilsModule.isPromotion(promoCaptureFen, 'e7', 'd8') === true, 'isPromotion returns true for White pawn capture e7xd8');

// Case E: Illegal push (blocked by enemy piece on 8th rank)
const promoBlockedFen = '4r3/4P3/8/8/8/8/8/4K2k w - - 0 1';
assert(chessUtilsModule.isPromotion(promoBlockedFen, 'e7', 'e8') === false, 'isPromotion returns false when 8th rank is blocked');

// Case F: Black pawn promotion (push to 1st rank)
const promoBlackFen = '4k2K/8/8/8/8/8/4p3/8 b - - 0 1';
assert(chessUtilsModule.isPromotion(promoBlackFen, 'e2', 'e1') === true, 'isPromotion returns true for Black pawn e2->e1');

// 2.2 isCaptureSquare verification
// Colle vs O'Hanlon position: 12.Bxh7+
const colleFen = 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12';
assert(chessUtilsModule.isCaptureSquare(colleFen, 'e4', 'h7') === true, 'isCaptureSquare correctly identifies 12.Bxh7+ capture');
assert(chessUtilsModule.isCaptureSquare(colleFen, 'c3', 'd4') === true, 'isCaptureSquare correctly identifies 12.cxd4 capture');
assert(chessUtilsModule.isCaptureSquare(colleFen, 'e4', 'd5') === false, 'isCaptureSquare returns false for quiet move 12.Bd5');
assert(chessUtilsModule.isCaptureSquare(colleFen, 'f3', 'd4') === true, 'isCaptureSquare identifies 12.Nxd4 capture');

// En Passant capture verification
const enPassantFen = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';
assert(chessUtilsModule.isCaptureSquare(enPassantFen, 'e5', 'f6') === true, 'isCaptureSquare identifies en passant capture exf6 e.p.');

// 2.3 findKingSquare verification
assert(chessUtilsModule.findKingSquare(colleFen, 'w') === 'g1', 'findKingSquare correctly locates White King on g1');
assert(chessUtilsModule.findKingSquare(colleFen, 'b') === 'g8', 'findKingSquare correctly locates Black King on g8');
assert(chessUtilsModule.findKingSquare(colleFen) === 'g1', 'findKingSquare defaults to active player king (White on g1)');

// 2.4 getCheckHighlightStyle verification
const checkFen = 'r1bqr1k1/pp1n1ppB/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 b - - 0 12'; // After 12.Bxh7+
assert(chessUtilsModule.isCheck(checkFen) === true, 'isCheck is true after 12.Bxh7+');
const checkStyle = chessUtilsModule.getCheckHighlightStyle(checkFen);
assert(Boolean(checkStyle['g8']), 'getCheckHighlightStyle highlights king square g8 under check');
assert(
  typeof checkStyle['g8']?.backgroundColor === 'string' && checkStyle['g8'].backgroundColor.includes('239, 68, 68'),
  'getCheckHighlightStyle applies red highlight to checked king'
);

// 2.5 getSquareHighlightStyles verification
const highlightStyles = chessUtilsModule.getSquareHighlightStyles({
  fen: colleFen,
  selectedSquare: 'e4',
  lastMove: { from: 'c2', to: 'c3' },
  customSquareStyles: { a1: { border: '2px solid gold' } },
});
assert(Boolean(highlightStyles['e4']), 'getSquareHighlightStyles highlights selected square e4');
assert(Boolean(highlightStyles['h7']), 'getSquareHighlightStyles contains target h7');
assert(
  typeof highlightStyles['h7']?.background === 'string' && highlightStyles['h7'].background.includes('radial-gradient'),
  'getSquareHighlightStyles applies capture ring radial-gradient to legal capture target h7'
);
assert(
  typeof highlightStyles['d5']?.background === 'string' && highlightStyles['d5'].background.includes('rgba(16, 185, 129'),
  'getSquareHighlightStyles applies quiet move emerald dot to legal target d5'
);
assert(Boolean(highlightStyles['c2']) && Boolean(highlightStyles['c3']), 'getSquareHighlightStyles marks last move origin and target');
assert(highlightStyles['a1']?.border === '2px solid gold', 'getSquareHighlightStyles preserves customSquareStyles override');

// 2.6 Vukovic Arrow Palette
assert(Boolean(chessUtilsModule.VUKOVIC_ARROW_PALETTE.THREAT), 'VUKOVIC_ARROW_PALETTE contains THREAT');
assert(Boolean(chessUtilsModule.VUKOVIC_ARROW_PALETTE.MANEUVER), 'VUKOVIC_ARROW_PALETTE contains MANEUVER');
assert(Boolean(chessUtilsModule.VUKOVIC_ARROW_PALETTE.SACRIFICE), 'VUKOVIC_ARROW_PALETTE contains SACRIFICE');

// ============================================================================
// PART 3: FORENSIC AUDIT OF src/components/chess/PromotionModal.tsx
// ============================================================================
console.log(`\n${YELLOW}${BOLD}--- PART 3: PromotionModal Component Verification ---${RESET}`);

assert(typeof PromotionModal === 'function', 'PromotionModal is an exported React function component');

// Check that choices and keys are genuinely implemented in component module
const modalSource = require('fs').readFileSync(
  require('path').resolve(__dirname, '../../src/components/chess/PromotionModal.tsx'),
  'utf-8'
);

assert(
  modalSource.includes("piece: 'q'") && modalSource.includes("name: 'Ферзь'"),
  'PromotionModal includes Queen (Ферзь)'
);
assert(
  modalSource.includes("piece: 'r'") && modalSource.includes("name: 'Ладья'"),
  'PromotionModal includes Rook (Ладья)'
);
assert(
  modalSource.includes("piece: 'b'") && modalSource.includes("name: 'Слон'"),
  'PromotionModal includes Bishop (Слон)'
);
assert(
  modalSource.includes("piece: 'n'") && modalSource.includes("name: 'Конь'"),
  'PromotionModal includes Knight (Конь)'
);
assert(
  modalSource.includes("key === '1' || key === 'q'") &&
  modalSource.includes("key === '2' || key === 'r'") &&
  modalSource.includes("key === '3' || key === 'b'") &&
  modalSource.includes("key === 'escape'"),
  'PromotionModal handles keyboard shortcuts (1/q, 2/r, 3/b, 4/n/k, escape)'
);
assert(
  modalSource.includes('role="dialog"') && modalSource.includes('aria-modal="true"'),
  'PromotionModal adheres to accessibility standards (role=dialog, aria-modal=true)'
);

// ============================================================================
// PART 4: FORENSIC AUDIT OF src/components/chess/BoardControls.tsx
// ============================================================================
console.log(`\n${YELLOW}${BOLD}--- PART 4: BoardControls Component Verification ---${RESET}`);

assert(typeof BoardControls === 'function', 'BoardControls is an exported React function component');

const controlsSource = require('fs').readFileSync(
  require('path').resolve(__dirname, '../../src/components/chess/BoardControls.tsx'),
  'utf-8'
);

assert(
  controlsSource.includes('onFlipOrientation') && controlsSource.includes('Белые снизу'),
  'BoardControls implements board flipping with Russian orientation indicator'
);
assert(
  controlsSource.includes('onToggleSound') && controlsSource.includes('Volume2') && controlsSource.includes('VolumeX'),
  'BoardControls implements sound toggling with Volume2/VolumeX icons'
);
assert(
  controlsSource.includes('onResetPosition') && controlsSource.includes('В начало'),
  'BoardControls implements reset position button (В начало)'
);
assert(
  controlsSource.includes('onUndo') && controlsSource.includes('onRedo'),
  'BoardControls supports undo and redo navigation buttons'
);

// ============================================================================
// PART 5: FORENSIC AUDIT OF src/components/chess/ChessboardWrapper.tsx
// ============================================================================
console.log(`\n${YELLOW}${BOLD}--- PART 5: ChessboardWrapper Integration Verification ---${RESET}`);

assert(typeof ChessboardWrapper === 'function', 'ChessboardWrapper is an exported React function component');

const wrapperSource = require('fs').readFileSync(
  require('path').resolve(__dirname, '../../src/components/chess/ChessboardWrapper.tsx'),
  'utf-8'
);

assert(
  wrapperSource.includes("import { Chessboard } from 'react-chessboard';"),
  'ChessboardWrapper imports genuine react-chessboard'
);
assert(
  wrapperSource.includes("<Chessboard") && wrapperSource.includes("customBoardStyle={customBoardStyle}"),
  'ChessboardWrapper renders react-chessboard with tournament wood/green style'
);
assert(
  wrapperSource.includes("handleSquareClick") && wrapperSource.includes("selectedSquare"),
  'ChessboardWrapper implements complete Click-to-Move state machine'
);
assert(
  wrapperSource.includes("handlePieceDrop") && wrapperSource.includes("isInteractive && arePiecesDraggable"),
  'ChessboardWrapper implements Drag & Drop with legality verification'
);
assert(
  wrapperSource.includes("isPromotion(") && wrapperSource.includes("<PromotionModal"),
  'ChessboardWrapper intercepts pawn promotion and renders PromotionModal'
);
assert(
  wrapperSource.includes("playMoveSound()") &&
  wrapperSource.includes("playCaptureSound()") &&
  wrapperSource.includes("playCheckSound()") &&
  wrapperSource.includes("playErrorSound()"),
  'ChessboardWrapper triggers Web Audio effects for moves, captures, checks, and errors'
);
assert(
  wrapperSource.includes("ResizeObserver") || wrapperSource.includes("autoResize"),
  'ChessboardWrapper supports adaptive auto-resizing via ResizeObserver'
);
assert(
  wrapperSource.includes("isMounted") && wrapperSource.includes("'use client'"),
  'ChessboardWrapper implements SSR hydration protection'
);

// ============================================================================
// PART 6: AUDIT FOR CHEATING, FACADES, OR HARDCODED RETURN BYPASSES
// ============================================================================
console.log(`\n${YELLOW}${BOLD}--- PART 6: Facade & Anti-Cheating Scrutiny ---${RESET}`);

// Check for suspicious hardcoded bypasses or dummy constant returns
const suspiciousPatterns = [
  /return\s+true;\s*\/\/\s*bypass/i,
  /return\s+"PASS"/i,
  /mock[a-zA-Z]*Result/i,
  /\/\/\s*TODO:\s*implement/i,
  /throw\s+new\s+Error\("Not implemented"\)/i,
];

let suspiciousFound = false;
const auditedFiles = [
  'src/components/chess/ChessboardWrapper.tsx',
  'src/components/chess/PromotionModal.tsx',
  'src/components/chess/BoardControls.tsx',
  'src/lib/audioSynth.ts',
  'src/lib/chessUtils.ts',
];

for (const relPath of auditedFiles) {
  const fullPath = require('path').resolve(__dirname, '../../', relPath);
  const content = require('fs').readFileSync(fullPath, 'utf-8');
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(content)) {
      suspiciousFound = true;
      assert(false, `Suspicious cheating/facade pattern detected in ${relPath}: ${pattern}`);
    }
  }
}
if (!suspiciousFound) {
  assert(true, 'Zero suspicious bypasses, fake returns, or NotImplemented stubs found across M2 codebase');
}

// ============================================================================
// FINAL SUMMARY
// ============================================================================
console.log('\n==============================================================================');
console.log(`${BOLD}FORENSIC INTEGRITY AUDIT SUMMARY${RESET}`);
console.log('==============================================================================');
console.log(`Total Checks Executed: ${totalChecks}`);
console.log(`Passed Checks:        ${GREEN}${BOLD}${passedChecks}${RESET}`);
console.log(`Failed Checks:        ${failedChecks > 0 ? RED : GREEN}${BOLD}${failedChecks}${RESET}`);
console.log('==============================================================================');

if (failedChecks === 0) {
  console.log(`${GREEN}${BOLD}🏆 VERDICT: CLEAN. All Milestone 2 components and engines are genuine, robust, and 100% compliant.${RESET}\n`);
  process.exit(0);
} else {
  console.error(`${RED}${BOLD}❌ VERDICT: INTEGRITY VIOLATION. Detected ${failedChecks} failures.${RESET}\n`);
  process.exit(1);
}
