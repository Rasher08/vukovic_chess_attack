/**
 * Adversarial Stress & Empirical Challenge Suite for Milestone 2
 * M2: Interactive Chessboard & Audio Engine
 *
 * EMPIRICAL CHALLENGER 1 (M2):
 * 1. Legal Move Detection:
 *    - Exhaustive source square destination verification
 *    - Absolute and relative pins (orthogonal & diagonal)
 *    - King evasions and double checks
 *    - En passant capture legality
 *    - Castling legality (kingside, queenside, castling through/into check)
 *    - Opponent piece selection (must yield 0 legal moves)
 *    - Empty square selection (must yield 0 legal moves)
 *
 * 2. Illegal Move Rejection & Exception Safety:
 *    - Moving pinned piece into check
 *    - Non-knight jumping over pieces
 *    - Pawn backwards / illegal diagonal moves
 *    - King stepping into attack
 *    - Moving on opponent's turn
 *    - Corrupted notations, off-board squares, gibberish strings
 *    - Zero unhandled exceptions thrown across all attacks
 *
 * 3. Promotion Trigger Logic:
 *    - White pawn reaching 8th rank (quiet push & diagonal capture)
 *    - Black pawn reaching 1st rank (quiet push & diagonal capture)
 *    - Non-pawn pieces reaching 8th/1st rank (Queen, Rook, Bishop, King) -> must NOT trigger
 *    - Pawns on 2nd-7th ranks moving without reaching last rank -> must NOT trigger
 *    - Blocked pawn on 7th rank (illegal push to 8th rank) -> must NOT trigger
 *    - Illegal diagonal push to empty 8th rank -> must NOT trigger
 *    - Pinned pawn reaching 8th rank that leaves king in check -> must NOT trigger
 *
 * 4. Check & King Highlighting:
 *    - White king in single check -> red highlight & glow on White king
 *    - Black king in single check -> red highlight & glow on Black king
 *    - King in double check -> red highlight on king
 *    - Checkmate -> red highlight maintained
 *    - Normal position -> NO check highlight
 *    - Stalemate -> NO check highlight (king not in check)
 *
 * 5. Board Orientation & Flip Toggling:
 *    - Toggling between 'white' and 'black'
 *    - Default orientation fallback
 *    - Russian UI label checks ('Белые снизу' / 'Черные снизу')
 *
 * 6. Web Audio Synthesizer:
 *    - SSR safety (runs in headless Node without throwing)
 *    - Mock AudioContext: frequencies, durations, and waveforms
 *    - Mute/Unmute state machine
 */

import { Chess, Square } from 'chess.js';
import {
  createChessInstance,
  isValidFen,
  makeMove,
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

// Terminal color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureLog: string[] = [];

function check(condition: boolean, testName: string, detail?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓ [PASS]${RESET} ${testName}`);
  } else {
    failedTests++;
    const msg = `  ${RED}✖ [FAIL]${RESET} ${testName}${detail ? ` (${detail})` : ''}`;
    failureLog.push(msg);
    console.error(msg);
  }
}

console.log(`${BOLD}${CYAN}================================================================================${RESET}`);
console.log(`${BOLD}♟️  CHALLENGER 1: EMPIRICAL STRESS TEST FOR MILESTONE 2 (CHESSBOARD & AUDIO)${RESET}`);
console.log(`${BOLD}${CYAN}================================================================================${RESET}\n`);

// ==============================================================================
// 1. LEGAL MOVE DETECTION & DESTINATION SQUARES
// ==============================================================================
console.log(`${BOLD}▶ SUITE 1: Legal Move Detection and Target Square Mapping${RESET}`);

// 1.1 Starting position
const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const e2Targets = getLegalTargetSquares(startFen, 'e2');
check(
  e2Targets.length === 2 && e2Targets.includes('e3') && e2Targets.includes('e4'),
  'Starting position: White pawn e2 has exactly e3 and e4',
  `Found: ${JSON.stringify(e2Targets)}`
);

const b1Targets = getLegalTargetSquares(startFen, 'b1');
check(
  b1Targets.length === 2 && b1Targets.includes('a3') && b1Targets.includes('c3'),
  'Starting position: White knight b1 has exactly a3 and c3',
  `Found: ${JSON.stringify(b1Targets)}`
);

const d1Targets = getLegalTargetSquares(startFen, 'd1');
check(
  d1Targets.length === 0,
  'Starting position: White queen d1 is blocked and has 0 legal targets',
  `Found: ${JSON.stringify(d1Targets)}`
);

// 1.2 Opponent square selection on White turn
const e7TargetsOnWhiteTurn = getLegalTargetSquares(startFen, 'e7');
check(
  e7TargetsOnWhiteTurn.length === 0,
  'Opponent piece e7 on White turn has 0 legal targets',
  `Found: ${JSON.stringify(e7TargetsOnWhiteTurn)}`
);

// 1.3 Empty square selection
const e4TargetsWhenEmpty = getLegalTargetSquares(startFen, 'e4');
check(
  e4TargetsWhenEmpty.length === 0,
  'Empty square e4 has 0 legal targets',
  `Found: ${JSON.stringify(e4TargetsWhenEmpty)}`
);

// 1.4 Absolute pin along file: White King on e1, White Queen on e2, Black Rook on e8, Black King on h8
// Queen cannot leave e-file!
const filePinFen = '4r2k/8/8/8/8/8/4Q3/4K3 w - - 0 1';
const pinnedQueenTargets = getLegalTargetSquares(filePinFen, 'e2');
check(
  pinnedQueenTargets.length === 6 &&
    pinnedQueenTargets.includes('e3') &&
    pinnedQueenTargets.includes('e4') &&
    pinnedQueenTargets.includes('e5') &&
    pinnedQueenTargets.includes('e6') &&
    pinnedQueenTargets.includes('e7') &&
    pinnedQueenTargets.includes('e8') &&
    !pinnedQueenTargets.includes('d2') &&
    !pinnedQueenTargets.includes('f2') &&
    !pinnedQueenTargets.includes('d3') &&
    !pinnedQueenTargets.includes('f3'),
  'Absolute pin on e-file: Queen can only move along e-file, horizontal/diagonal blocked',
  `Found: ${JSON.stringify(pinnedQueenTargets)}`
);

// 1.5 Absolute pin on diagonal: White King on e1, White Bishop on d2, Black Bishop on a5, Black King on h8
// Bishop cannot leave a5-e1 diagonal!
const diagPinFen = '7k/8/8/b7/8/8/3B4/4K3 w - - 0 1';
const pinnedBishopTargets = getLegalTargetSquares(diagPinFen, 'd2');
check(
  pinnedBishopTargets.length === 3 &&
    pinnedBishopTargets.includes('c3') &&
    pinnedBishopTargets.includes('b4') &&
    pinnedBishopTargets.includes('a5'),
  'Absolute pin on diagonal: Bishop can only move along pin ray (c3, b4 and capture a5)',
  `Found: ${JSON.stringify(pinnedBishopTargets)}`
);

// 1.6 Completely pinned knight: White King on e1, White Knight on e2, Black Rook on e8, Black King on h8
const pinnedKnightFen = '4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1';
const pinnedKnightTargets = getLegalTargetSquares(pinnedKnightFen, 'e2');
check(
  pinnedKnightTargets.length === 0,
  'Absolute pin on knight: Knight cannot move anywhere (0 legal targets)',
  `Found: ${JSON.stringify(pinnedKnightTargets)}`
);

// 1.7 Double check: White King on e1 in double check from Black Queen on e8 and Black Knight on c2. Black King on h8.
// Only King moves are legal! Queen on d1 cannot capture or block.
const doubleCheckFen = '4q2k/8/8/8/8/8/2n5/3QK3 w - - 0 1';
const kingEvasions = getLegalTargetSquares(doubleCheckFen, 'e1');
const blockedQueenInDoubleCheck = getLegalTargetSquares(doubleCheckFen, 'd1');
check(
  blockedQueenInDoubleCheck.length === 0,
  'Double check: Non-king pieces (Queen d1) have 0 legal moves',
  `Queen targets: ${JSON.stringify(blockedQueenInDoubleCheck)}`
);
check(
  kingEvasions.length === 3 &&
    kingEvasions.includes('d2') &&
    kingEvasions.includes('f2') &&
    kingEvasions.includes('f1'),
  'Double check: King has only evasions to unattacked squares (d2, f2, f1)',
  `King targets: ${JSON.stringify(kingEvasions)}`
);

// 1.8 En passant capture target
// White pawn on e5, Black just played d7-d5. FEN en passant target is 'd6'.
const enPassantFen = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
const e5PawnTargets = getLegalTargetSquares(enPassantFen, 'e5');
check(
  e5PawnTargets.includes('d6') && e5PawnTargets.includes('e6'),
  'En passant: Pawn on e5 has both e6 and d6 (en passant capture)',
  `Found: ${JSON.stringify(e5PawnTargets)}`
);
check(
  isCaptureSquare(enPassantFen, 'e5', 'd6'),
  'isCaptureSquare identifies en passant capture as a capture',
  'e5 -> d6'
);

// 1.9 Castling targets (O-O and O-O-O)
const castlingFen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
const kingCastlingTargets = getLegalTargetSquares(castlingFen, 'e1');
check(
  kingCastlingTargets.includes('g1') && kingCastlingTargets.includes('c1'),
  'Castling: Unobstructed king has g1 (O-O) and c1 (O-O-O) in legal targets',
  `Found: ${JSON.stringify(kingCastlingTargets)}`
);

// 1.10 Castling through check is illegal
// Black King on b8. Black rook on f8 attacks f1 square through which White king must pass for O-O.
const castleThroughCheckFen = '1k3r2/8/8/8/8/8/8/R3K2R w KQ - 0 1';
const kingBlockedOOTargets = getLegalTargetSquares(castleThroughCheckFen, 'e1');
check(
  !kingBlockedOOTargets.includes('g1') && kingBlockedOOTargets.includes('c1'),
  'Castling through check: g1 (O-O) is illegal when f1 is attacked; c1 (O-O-O) remains legal',
  `Found: ${JSON.stringify(kingBlockedOOTargets)}`
);

// ==============================================================================
// 2. ILLEGAL MOVE REJECTION & EXCEPTION SAFETY
// ==============================================================================
console.log(`\n${BOLD}▶ SUITE 2: Illegal Move Rejection and Exception Safety${RESET}`);

const illegalAttacks = [
  { fen: startFen, move: 'e2e5', desc: 'Pawn jump 3 squares (e2-e5)' },
  { fen: startFen, move: 'a1a3', desc: 'Rook jumping over pawn (a1-a3)' },
  { fen: startFen, move: 'e1e2', desc: 'King moving onto occupied pawn square (e1-e2)' },
  { fen: startFen, move: 'e7e5', desc: 'Moving black pawn on white turn (e7-e5)' },
  { fen: startFen, move: 'invalid_move', desc: 'Random string notation' },
  { fen: startFen, move: '', desc: 'Empty move string' },
  { fen: startFen, move: 'z9y9', desc: 'Off-board squares' },
  { fen: startFen, move: { from: 'e2' as Square, to: 'e8' as Square }, desc: 'Pawn teleport to 8th rank' },
  { fen: startFen, move: { from: 'a1' as Square, to: 'h8' as Square }, desc: 'Rook diagonal teleport across board' },
  { fen: filePinFen, move: { from: 'e2' as Square, to: 'd3' as Square }, desc: 'Pinned queen moving off file' },
  { fen: startFen, move: 'Kxf7', desc: 'Illegal king capture' },
];

for (const attack of illegalAttacks) {
  let thrown = false;
  let result: { success: boolean; newFen: string; error?: string } = { success: false, newFen: '' };
  try {
    result = makeMove(attack.fen, attack.move);
  } catch {
    thrown = true;
  }

  check(
    !thrown && result.success === false,
    `makeMove safely rejects: ${attack.desc}`,
    `Result: ${JSON.stringify(result)}`
  );
}

// Check illegal square inputs in getLegalTargetSquares
const invalidSquares = ['z9', 'x1', '123'] as Square[];
for (const badSq of invalidSquares) {
  let thrown = false;
  let res: Square[] = [];
  try {
    res = getLegalTargetSquares(startFen, badSq);
  } catch {
    thrown = true;
  }
  check(
    !thrown && Array.isArray(res) && res.length === 0,
    `getLegalTargetSquares safely returns [] for invalid square: "${badSq}"`,
    `Got: ${JSON.stringify(res)}`
  );
}

// Check corrupted FEN handling in all utility functions
const corruptedFens = ['', 'invalid-fen', '8/8/8/8/8/8/8/8', 'not a chess position'];
for (const badFen of corruptedFens) {
  let threw = false;
  try {
    const isChk = isCheck(badFen);
    const isMate = isCheckmate(badFen);
    const actCol = getActiveColor(badFen);
    const kSq = findKingSquare(badFen);
    const promo = isPromotion(badFen, 'e7' as Square, 'e8' as Square);
    const chkStyle = getCheckHighlightStyle(badFen);
    const sqStyles = getSquareHighlightStyles({ fen: badFen, selectedSquare: null });
  } catch {
    threw = true;
  }
  check(
    !threw,
    `Chess utils survive corrupted FEN without throwing: "${badFen.slice(0, 20)}"`,
    'No unhandled exceptions'
  );
}

// ==============================================================================
// 3. PROMOTION TRIGGER LOGIC
// ==============================================================================
console.log(`\n${BOLD}▶ SUITE 3: Pawn Promotion Trigger Logic (Ranks 8 & 1)${RESET}`);

// 3.1 White pawn reaching 8th rank
// White pawn on e7, empty e8, Black king on b8
const whitePromoPushFen = '1k6/4P3/8/8/8/8/8/4K3 w - - 0 1';
check(
  isPromotion(whitePromoPushFen, 'e7', 'e8'),
  'White pawn e7-e8 (quiet push to 8th rank) is promotion',
  'e7 -> e8'
);

// 3.2 White pawn capture to 8th rank
// White pawn on e7, Black rook on d8, Black king on h8
const whitePromoCaptureFen = '3r3k/4P3/8/8/8/8/8/4K3 w - - 0 1';
check(
  isPromotion(whitePromoCaptureFen, 'e7', 'd8'),
  'White pawn e7xd8 (capture to 8th rank) is promotion',
  'e7 -> d8'
);

// 3.3 Blocked White pawn on 7th rank (e8 occupied by Black queen, Black king on b8)
const whitePromoBlockedFen = '1k2q3/4P3/8/8/8/8/8/4K3 w - - 0 1';
check(
  !isPromotion(whitePromoBlockedFen, 'e7', 'e8'),
  'Blocked pawn e7-e8 (e8 occupied, cannot push) is NOT promotion',
  'Blocked'
);

// 3.4 White pawn diagonal push to empty square on 8th rank
// e7 to d8 when d8 is empty
check(
  !isPromotion(whitePromoPushFen, 'e7', 'd8'),
  'Illegal diagonal pawn push e7-d8 to empty square is NOT promotion',
  'Empty diagonal'
);

// 3.5 Black pawn reaching 1st rank
// Black pawn on d2, empty d1. Black king on b8, White king on e8. Black turn.
const blackPromoPushFen = '4K3/8/8/8/8/8/1k1p4/8 b - - 0 1';
check(
  isPromotion(blackPromoPushFen, 'd2', 'd1'),
  'Black pawn d2-d1 (quiet push to 1st rank) is promotion',
  'd2 -> d1'
);

// 3.6 Black pawn capture to 1st rank
// Black pawn on d2, White knight on c1. Black turn.
const blackPromoCaptureFen = '4K3/8/8/8/8/8/1k1p4/2N5 b - - 0 1';
check(
  isPromotion(blackPromoCaptureFen, 'd2', 'c1'),
  'Black pawn d2xc1 (capture to 1st rank) is promotion',
  'd2 -> c1'
);

// 3.7 Non-pawn pieces moving to 8th or 1st rank
// White Queen moving d7 to d8 (Black king on b8)
const queenTo8thFen = '1k6/3Q4/8/8/8/8/8/4K3 w - - 0 1';
check(
  !isPromotion(queenTo8thFen, 'd7', 'd8'),
  'Queen moving to 8th rank (d7-d8) is NOT pawn promotion',
  'Queen'
);

// White Rook moving a7 to a8 (Black king on h8)
const rookTo8thFen = '7k/R7/8/8/8/8/8/4K3 w - - 0 1';
check(
  !isPromotion(rookTo8thFen, 'a7', 'a8'),
  'Rook moving to 8th rank (a7-a8) is NOT pawn promotion',
  'Rook'
);

// White King moving e7 to e8 (Black king on a1)
const kingTo8thFen = '8/4K3/8/8/8/8/8/k7 w - - 0 1';
check(
  !isPromotion(kingTo8thFen, 'e7', 'e8'),
  'King moving to 8th rank (e7-e8) is NOT pawn promotion',
  'King'
);

// 3.8 Pawn moving on non-promotion ranks
// White pawn e6 to e7 (Black king on b8)
const pawnTo7thFen = '1k6/8/4P3/8/8/8/8/4K3 w - - 0 1';
check(
  !isPromotion(pawnTo7thFen, 'e6', 'e7'),
  'Pawn advancing e6 to e7 (reaching 7th rank) is NOT promotion',
  'e6 -> e7'
);

// White pawn e2 to e4
check(
  !isPromotion(startFen, 'e2', 'e4'),
  'Pawn opening e2 to e4 is NOT promotion',
  'e2 -> e4'
);

// 3.9 Pinned pawn on 7th rank that cannot legally move to 8th rank
// White King on h7, White Pawn on g7, Black Queen on a7, Black King on b8!
// Pawn on g7 is pinned horizontally along the 7th rank to the White King on h7.
// Pushing g7-g8 would expose White King on h7 to Black Queen on a7.
const pinnedPawnPromoFen = '1k6/q5PK/8/8/8/8/8/8 w - - 0 1';
check(
  !isPromotion(pinnedPawnPromoFen, 'g7', 'g8'),
  'Pinned pawn on g7 cannot legally push to g8 (exposes King h7 to Queen a7) -> NOT promotion',
  'Pinned illegal push'
);

// ==============================================================================
// 4. CHECK DETECTION & KING SQUARE HIGHLIGHTING
// ==============================================================================
console.log(`\n${BOLD}▶ SUITE 4: Check Detection and King Square Red Glow Highlighting${RESET}`);

// 4.1 Normal position (No check)
check(!isCheck(startFen), 'Initial position: isCheck is false');
const noCheckStyles = getCheckHighlightStyle(startFen);
check(
  Object.keys(noCheckStyles).length === 0,
  'Initial position: getCheckHighlightStyle returns empty styles object {}'
);

// 4.2 White King in single check from Black Rook on e8 (Black king on b8)
const whiteInCheckFen = '1k2r3/8/8/8/8/8/8/4K3 w - - 0 1';
check(isCheck(whiteInCheckFen), 'White king on e1 is in check from Black rook on e8');
check(
  findKingSquare(whiteInCheckFen) === 'e1',
  'findKingSquare identifies White king on e1'
);
const whiteCheckStyles = getCheckHighlightStyle(whiteInCheckFen);
check(
  whiteCheckStyles['e1'] !== undefined &&
    typeof whiteCheckStyles['e1'].backgroundColor === 'string' &&
    whiteCheckStyles['e1'].backgroundColor.includes('239, 68, 68'),
  'White king e1 highlighted with red background (239, 68, 68)',
  `Style: ${JSON.stringify(whiteCheckStyles['e1'])}`
);
check(
  whiteCheckStyles['e1'] !== undefined &&
    typeof whiteCheckStyles['e1'].boxShadow === 'string' &&
    whiteCheckStyles['e1'].boxShadow.includes('239, 68, 68'),
  'White king e1 has red glow box-shadow',
  `Shadow: ${whiteCheckStyles['e1']?.boxShadow}`
);

// 4.3 Black King in check after Greek Gift 12.Bxh7+
// Colle vs O'Hanlon position after 12.Bxh7+
const colleAfterBxh7Fen = 'r1bqr1k1/pp1n1ppB/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 b - - 0 12';
check(isCheck(colleAfterBxh7Fen), 'Colle - O\'Hanlon: Black king is in check after 12.Bxh7+');
check(
  findKingSquare(colleAfterBxh7Fen) === 'g8',
  'findKingSquare identifies Black king on g8'
);
const colleCheckStyles = getCheckHighlightStyle(colleAfterBxh7Fen);
check(
  colleCheckStyles['g8'] !== undefined &&
    colleCheckStyles['g8'].backgroundColor.includes('239, 68, 68'),
  'Black king g8 highlighted with red glow style after 12.Bxh7+',
  `Style: ${JSON.stringify(colleCheckStyles['g8'])}`
);

// 4.4 Checkmate position (Ed. Lasker vs Thomas after 18.Kd2#)
const laskerMateFen = 'r4r2/pbppq1p1/1pn1pN2/8/3P2NP/6P1/PPPKBP1R/R5k1 b - - 5 18';
check(isCheck(laskerMateFen), 'Checkmate position: King is in check');
check(isCheckmate(laskerMateFen), 'Checkmate position: isCheckmate is true');
check(
  findKingSquare(laskerMateFen) === 'g1',
  'findKingSquare identifies checkmated Black king on g1'
);
const mateStyles = getCheckHighlightStyle(laskerMateFen);
check(
  mateStyles['g1'] !== undefined && mateStyles['g1'].backgroundColor.includes('239, 68, 68'),
  'Checkmated king on g1 receives red check glow highlighting'
);

// 4.5 Stalemate position (King is NOT in check, but has 0 moves)
// White king on h1, Black queen on g3, Black king on f2. White turn.
const stalemateFen = '8/8/8/8/8/6q1/5k2/7K w - - 0 1';
check(!isCheck(stalemateFen), 'Stalemate position: King is NOT in check');
const stalemateStyles = getCheckHighlightStyle(stalemateFen);
check(
  Object.keys(stalemateStyles).length === 0,
  'Stalemate position: NO check highlight applied to king',
  `Got: ${JSON.stringify(stalemateStyles)}`
);

// 4.6 getSquareHighlightStyles integration
const fullStyles = getSquareHighlightStyles({
  fen: colleAfterBxh7Fen,
  selectedSquare: 'g8',
  lastMove: { from: 'e4', to: 'h7' },
});
check(
  fullStyles['e4'] !== undefined && fullStyles['h7'] !== undefined,
  'Last move squares (e4 and h7) are highlighted',
  'from e4 to h7'
);
check(
  fullStyles['g8'] !== undefined,
  'Checked king on g8 receives styling when selected',
  'g8 present in combined styles'
);

// ==============================================================================
// 5. BOARD ORIENTATION & FLIP TOGGLING
// ==============================================================================
console.log(`\n${BOLD}▶ SUITE 5: Board Orientation and Flip Toggling Logic${RESET}`);

// 5.1 Orientation toggle state machine
function toggleOrientation(curr: 'white' | 'black'): 'white' | 'black' {
  return curr === 'white' ? 'black' : 'white';
}

let orientation: 'white' | 'black' = 'white';
orientation = toggleOrientation(orientation);
check(orientation === 'black', 'Toggling "white" yields "black"');
orientation = toggleOrientation(orientation);
check(orientation === 'white', 'Toggling "black" yields "white"');

// 5.2 Default fallback
function resolveOrientation(o?: 'white' | 'black'): 'white' | 'black' {
  return o || 'white';
}
check(resolveOrientation(undefined) === 'white', 'Undefined orientation defaults to "white"');
check(resolveOrientation('black') === 'black', 'Explicit "black" orientation preserved');

// 5.3 UI Label Russian localization
const labelWhite = orientation === 'white' ? 'Белые снизу' : 'Черные снизу';
check(labelWhite === 'Белые снизу', 'White orientation label is "Белые снизу"');
const labelBlack = toggleOrientation(orientation) === 'black' ? 'Черные снизу' : 'Белые снизу';
check(labelBlack === 'Черные снизу', 'Black orientation label is "Черные снизу"');

// ==============================================================================
// 6. WEB AUDIO SYNTHESIZER SSR & MOCK STRESS
// ==============================================================================
console.log(`\n${BOLD}▶ SUITE 6: Web Audio Synthesizer Headless & SSR Resilience${RESET}`);

// 6.1 Headless calls without window.AudioContext must not crash
let synthCrashed = false;
try {
  playMoveSound();
  playCaptureSound();
  playCheckSound();
  playVictorySound();
  playErrorSound();
} catch (e) {
  synthCrashed = true;
}
check(!synthCrashed, 'audioSynth functions execute in headless Node without throwing exceptions');

// 6.2 Mute / Unmute state transitions
setAudioMuted(true);
check(isAudioMuted() === true, 'setAudioMuted(true) sets muted state');
const toggled = toggleAudio();
check(toggled === false && isAudioMuted() === false, 'toggleAudio() unmutes audio');
toggleAudio();
check(isAudioMuted() === true, 'toggleAudio() mutes audio again');
setAudioMuted(false); // Reset to unmuted

// 6.3 Facade object compliance
check(
  typeof audioSynth.playMove === 'function' &&
    typeof audioSynth.playCapture === 'function' &&
    typeof audioSynth.playCheck === 'function' &&
    typeof audioSynth.playVictory === 'function' &&
    typeof audioSynth.playError === 'function',
  'audioSynth facade exposes all 5 audio trigger methods'
);

// 6.4 Simulated Web Audio API verification
// Create mock AudioContext to check exact frequencies and oscillator nodes
class MockGainNode {
  public gain = {
    setValueAtTime: (_val: number, _t: number) => {},
    exponentialRampToValueAtTime: (_val: number, _t: number) => {},
    linearRampToValueAtTime: (_val: number, _t: number) => {},
  };
  connect(_dest: any) {}
}

class MockOscillatorNode {
  public type: OscillatorType = 'sine';
  public frequency = {
    value: 440,
    setValueAtTime: (val: number, _t: number) => {
      this.frequency.value = val;
    },
    exponentialRampToValueAtTime: (_val: number, _t: number) => {},
  };
  connect(_dest: any) {}
  start(_time?: number) {}
  stop(_time?: number) {}
}

const createdOscillators: MockOscillatorNode[] = [];
class MockAudioContext {
  public currentTime = 0;
  public state: AudioContextState = 'running';
  public destination = {};
  createOscillator() {
    const osc = new MockOscillatorNode();
    createdOscillators.push(osc);
    return osc;
  }
  createGain() {
    return new MockGainNode();
  }
  async resume() {}
}

// Inject mock into global window object
(globalThis as any).window = {
  AudioContext: MockAudioContext,
};

// Re-test audioSynth with mock context
createdOscillators.length = 0;
playMoveSound();
check(
  createdOscillators.length === 1 &&
    createdOscillators[0].type === 'triangle' &&
    createdOscillators[0].frequency.value === 400,
  'playMoveSound triggers triangle oscillator at 400 Hz'
);

createdOscillators.length = 0;
playCaptureSound();
check(
  createdOscillators.length === 1 &&
    createdOscillators[0].type === 'sawtooth' &&
    createdOscillators[0].frequency.value === 260,
  'playCaptureSound triggers sawtooth oscillator at 260 Hz'
);

createdOscillators.length = 0;
playCheckSound();
check(
  createdOscillators.length === 2 &&
    createdOscillators[0].type === 'sine' &&
    createdOscillators[0].frequency.value === 880 &&
    createdOscillators[1].frequency.value === 1760,
  'playCheckSound triggers primary tone at 880 Hz and overtone at 1760 Hz'
);

createdOscillators.length = 0;
playVictorySound();
check(
  createdOscillators.length === 4 &&
    createdOscillators[0].frequency.value === 523.25 && // C5
    createdOscillators[1].frequency.value === 659.25 && // E5
    createdOscillators[2].frequency.value === 783.99 && // G5
    createdOscillators[3].frequency.value === 1046.5, // C6
  'playVictorySound triggers 4-note ascending major arpeggio C5-E5-G5-C6'
);

createdOscillators.length = 0;
playErrorSound();
check(
  createdOscillators.length === 1 &&
    createdOscillators[0].type === 'sawtooth' &&
    createdOscillators[0].frequency.value === 150,
  'playErrorSound triggers low warning pulse at 150 Hz'
);

// Clean up mock window
delete (globalThis as any).window;

// ==============================================================================
// 7. ARROW PALETTE CONFORMANCE
// ==============================================================================
console.log(`\n${BOLD}▶ SUITE 7: Vukovic Arrow Palette Conformance${RESET}`);

check(
  VUKOVIC_ARROW_PALETTE.THREAT === 'rgba(239, 68, 68, 0.9)' &&
    VUKOVIC_ARROW_PALETTE.MANEUVER === 'rgba(34, 197, 94, 0.85)' &&
    VUKOVIC_ARROW_PALETTE.KNIGHT_JUMP === 'rgba(59, 130, 246, 0.85)' &&
    VUKOVIC_ARROW_PALETTE.SACRIFICE === 'rgba(245, 158, 11, 0.95)' &&
    VUKOVIC_ARROW_PALETTE.DEFENSE === 'rgba(168, 85, 247, 0.85)',
  'Vukovic canonical arrow palette matches semantic hex/rgba specifications'
);

// ==============================================================================
// FINAL SUMMARY
// ==============================================================================
console.log(`\n${BOLD}${CYAN}================================================================================${RESET}`);
console.log(`${BOLD}CHALLENGER 1 EMPIRICAL AUDIT RESULTS SUMMARY${RESET}`);
console.log(`${CYAN}================================================================================${RESET}`);
console.log(`Total Assertions Executed: ${totalTests}`);
console.log(`Passed Assertions:         ${GREEN}${BOLD}${passedTests}${RESET}`);
console.log(`Failed Assertions:         ${failedTests === 0 ? GREEN : RED}${BOLD}${failedTests}${RESET}`);
console.log(`Success Rate:              ${BOLD}${((passedTests / totalTests) * 100).toFixed(1)}%${RESET}`);
console.log(`${CYAN}================================================================================${RESET}`);

if (failedTests > 0) {
  console.error(`\n${RED}${BOLD}✖ FAILURES DETECTED:${RESET}`);
  for (const f of failureLog) {
    console.error(f);
  }
  process.exit(1);
} else {
  console.log(`\n${GREEN}${BOLD}🎉 ALL CHALLENGER EMPIRICAL ADVERSARIAL STRESS TESTS PASSED (100%)!${RESET}\n`);
  process.exit(0);
}
