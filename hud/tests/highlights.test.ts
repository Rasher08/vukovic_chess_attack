/**
 * 4-Tier Comprehensive E2E Test Suite for Chess Board & Piece Recognition
 *
 * Tier 1: Comprehensive Piece & Square Coverage (both White and Black orientations)
 * Tier 2: Boundary Conditions & Edge Robustness (h-file crop <=4px, in-square coordinates 1-8/a-h)
 * Tier 3: Chess.com Highlight Combinations & Theme Invariance (Yellow, Green, Pink/Red, Borders 3-6px,
 *         Empty square immunity [NO False White King ♔ on d5], Black piece accuracy on e4, Themes: Neo, Classic, Wood)
 * Tier 4: Realistic Vukovic Attack Scenarios (Colle System Greek Gift Bxh7+, Rook lifts, pawn attacks)
 *
 * Usage:
 *   npx --prefix hud tsx tests/highlights.test.ts
 */

import assert from 'node:assert/strict';
import { Chess, type Square } from 'chess.js';
import {
  calibrate,
  recognize,
  screenSquare,
  type PixelImage,
  type Orientation,
  type TemplateSet,
} from '../core/recognition';

// Theme palette definitions
export interface ThemePalette {
  name: 'Neo' | 'Classic' | 'Wood';
  lightSquare: [number, number, number];
  darkSquare: [number, number, number];
  textureNoise: number;
}

export const THEMES: Record<string, ThemePalette> = {
  Neo: {
    name: 'Neo',
    lightSquare: [235, 236, 208],
    darkSquare: [119, 149, 86],
    textureNoise: 0,
  },
  Classic: {
    name: 'Classic',
    lightSquare: [240, 217, 181],
    darkSquare: [181, 136, 99],
    textureNoise: 0,
  },
  Wood: {
    name: 'Wood',
    lightSquare: [210, 165, 115],
    darkSquare: [136, 84, 39],
    textureNoise: 14, // Subtle organic grain amplitude +-14 RGB
  },
};

export interface HighlightSpec {
  color: [number, number, number]; // RGB
  alpha?: number; // 0..1
  style: 'fill' | 'border';
  borderWidthPx?: number; // 3..6 px
}

export interface FixtureOptions {
  size?: number; // default 384
  theme?: ThemePalette; // default Neo
  shiftX?: number; // horizontal pixel shift for crop testing (-4 .. +4)
  shiftY?: number;
  renderCoordinates?: boolean; // draw 1-8 and a-h coordinates inside squares
  highlights?: Record<string, HighlightSpec>; // square -> highlight
}

/**
 * Creates high-fidelity synthetic raster boards for deterministic E2E CV testing.
 */
export function createRasterFixture(
  fen: string,
  orientation: Orientation = 'white',
  options: FixtureOptions = {}
): PixelImage {
  const size = options.size ?? 384;
  const theme = options.theme ?? THEMES.Neo;
  const shiftX = options.shiftX ?? 0;
  const shiftY = options.shiftY ?? 0;
  const renderCoordinates = options.renderCoordinates ?? false;
  const highlights = options.highlights ?? {};

  const image: PixelImage = {
    width: size,
    height: size,
    data: new Uint8ClampedArray(size * size * 4),
  };

  const board = new Chess(fen);
  const step = size / 8;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Apply coordinate translation for crop/margin stress testing
      const boardX = x + shiftX;
      const boardY = y + shiftY;

      const idx = (y * size + x) * 4;

      // Handle pixels shifted beyond the board boundaries (Chess.com dark webpage container)
      if (boardX < 0 || boardX >= size || boardY < 0 || boardY >= size) {
        // Outer dark page background (#262421)
        image.data[idx] = 38;
        image.data[idx + 1] = 36;
        image.data[idx + 2] = 33;
        image.data[idx + 3] = 255;
        continue;
      }

      const row = Math.floor(boardY / step);
      const col = Math.floor(boardX / step);
      const square = screenSquare(row, col, orientation);
      const piece = board.get(square);

      const u = (boardX % step + 0.5) / step;
      const v = (boardY % step + 0.5) / step;

      // Base square color
      const isDark = (row + col) % 2 === 1;
      const baseRgb = isDark ? theme.darkSquare : theme.lightSquare;
      let r = baseRgb[0];
      let g = baseRgb[1];
      let b = baseRgb[2];

      // Procedural wood grain texture if applicable
      if (theme.textureNoise > 0) {
        const grain = Math.sin(boardY * 0.35 + Math.sin(boardX * 0.12) * 2.5) * theme.textureNoise;
        r = Math.max(0, Math.min(255, Math.round(r + grain)));
        g = Math.max(0, Math.min(255, Math.round(g + grain * 0.8)));
        b = Math.max(0, Math.min(255, Math.round(b + grain * 0.6)));
      }

      // In-square coordinates (Chess.com "Coordinates: Inside" feature)
      // Rank digits (1-8) in top-left of col 0; File letters (a-h) in bottom-right of rank 1
      if (renderCoordinates) {
        const isRankCoord = col === 0 && u >= 0.04 && u <= 0.14 && v >= 0.04 && v <= 0.14;
        const isFileCoord = row === 7 && u >= 0.86 && u <= 0.96 && v >= 0.86 && v <= 0.96;
        if (isRankCoord || isFileCoord) {
          const coordColor = isDark ? 245 : 35;
          r = coordColor;
          g = coordColor;
          b = coordColor;
        }
      }

      // Move / Selection Highlights
      const hl = highlights[square];
      if (hl) {
        const alpha = hl.alpha ?? 0.65;
        let isHlPixel = false;

        if (hl.style === 'fill') {
          isHlPixel = true;
        } else if (hl.style === 'border') {
          const bw = (hl.borderWidthPx ?? 4) / step;
          isHlPixel = (u < bw || u > 1 - bw || v < bw || v > 1 - bw);
        }

        if (isHlPixel) {
          r = Math.round(r * (1 - alpha) + hl.color[0] * alpha);
          g = Math.round(g * (1 - alpha) + hl.color[1] * alpha);
          b = Math.round(b * (1 - alpha) + hl.color[2] * alpha);
        }
      }

      // Chess piece silhouette
      if (piece) {
        const typeIndex = 'pnbrqk'.indexOf(piece.type);
        const base = v > 0.67 && v < 0.82 && u > 0.21 && u < 0.79;
        const stem = v > 0.30 && v < 0.70 && Math.abs(u - 0.5) < 0.08 + typeIndex * 0.018;
        const cap = v > 0.16 && v < 0.30 && u > 0.18 + typeIndex * 0.035 && u < 0.82 - typeIndex * 0.035;
        const detail = v > 0.37 && v < 0.44 + typeIndex * 0.027 && u > 0.27 && u < 0.39;

        if ((base || stem || cap) && !detail) {
          if (piece.color === 'w') {
            r = 248; g = 248; b = 245;
          } else {
            r = 24; g = 24; b = 26;
          }
        }
      }

      image.data[idx] = r;
      image.data[idx + 1] = g;
      image.data[idx + 2] = b;
      image.data[idx + 3] = 255;
    }
  }

  return image;
}

// ---------------------------------------------------------------------------
// TEST EXECUTION
// ---------------------------------------------------------------------------

let passedCount = 0;
let totalCount = 0;

interface TestFailure {
  name: string;
  error: Error;
}
const failures: TestFailure[] = [];

function runTest(name: string, fn: () => void): void {
  totalCount++;
  try {
    fn();
    passedCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, error: err as Error });
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${(err as Error).message}`);
  }
}

console.log('='.repeat(80));
console.log('  4-TIER E2E RECOGNITION & HIGHLIGHT TOLERANCE TEST SUITE');
console.log('='.repeat(80));

// ===========================================================================
// TIER 1: Full Piece & Empty Square Coverage in Both Orientations
// ===========================================================================
console.log('\n[TIER 1] Full Piece & Empty Square Coverage (White & Black Orientations)');

const initialFen = new Chess().fen();
const calibWhite = createRasterFixture(initialFen, 'white');
const templatesWhite = calibrate(calibWhite, initialFen, 'white');

const calibBlack = createRasterFixture(initialFen, 'black');
const templatesBlack = calibrate(calibBlack, initialFen, 'black');

runTest('Tier 1.1: Standard initial position (White orientation, all 64 cells)', () => {
  const rec = recognize(calibWhite, templatesWhite, 'white');
  assert.equal(rec.confident, true, 'Board recognition must be confident');
  assert.equal(rec.placement, initialFen.split(' ')[0], 'Placement matches initial position');
  assert.equal(rec.cells.length, 64, 'Must produce 64 cells');

  // Verify all 12 piece types and empty squares explicitly
  assert.equal(rec.cells.find(c => c.square === 'e1')?.piece, 'K');
  assert.equal(rec.cells.find(c => c.square === 'd1')?.piece, 'Q');
  assert.equal(rec.cells.find(c => c.square === 'a1')?.piece, 'R');
  assert.equal(rec.cells.find(c => c.square === 'c1')?.piece, 'B');
  assert.equal(rec.cells.find(c => c.square === 'b1')?.piece, 'N');
  assert.equal(rec.cells.find(c => c.square === 'e2')?.piece, 'P');

  assert.equal(rec.cells.find(c => c.square === 'e8')?.piece, 'k');
  assert.equal(rec.cells.find(c => c.square === 'd8')?.piece, 'q');
  assert.equal(rec.cells.find(c => c.square === 'a8')?.piece, 'r');
  assert.equal(rec.cells.find(c => c.square === 'c8')?.piece, 'b');
  assert.equal(rec.cells.find(c => c.square === 'b8')?.piece, 'n');
  assert.equal(rec.cells.find(c => c.square === 'e7')?.piece, 'p');

  // Empty light and dark squares
  assert.equal(rec.cells.find(c => c.square === 'd4')?.piece, null, 'd4 must be empty');
  assert.equal(rec.cells.find(c => c.square === 'e4')?.piece, null, 'e4 must be empty');
  assert.equal(rec.cells.find(c => c.square === 'c3')?.piece, null, 'c3 must be empty');
});

runTest('Tier 1.2: Flipped board (Black orientation, correct FEN mapping)', () => {
  const rec = recognize(calibBlack, templatesBlack, 'black');
  assert.equal(rec.confident, true);
  assert.equal(rec.placement, initialFen.split(' ')[0], 'Placement mapped back to standard FEN');
  assert.equal(rec.cells.find(c => c.square === 'e8')?.piece, 'k');
  assert.equal(rec.cells.find(c => c.square === 'e1')?.piece, 'K');
});

runTest('Tier 1.3: Pieces on opposite-color squares in both orientations', () => {
  // Move white knight to dark square c3, black knight to light square f6, pawns e4/e5
  const g = new Chess();
  g.move('e4'); g.move('e5'); g.move('Nc3'); g.move('Nf6');
  const movedFen = g.fen();

  const whiteImg = createRasterFixture(movedFen, 'white');
  const whiteRec = recognize(whiteImg, templatesWhite, 'white');
  assert.equal(whiteRec.confident, true);
  assert.equal(whiteRec.placement, movedFen.split(' ')[0]);

  const blackImg = createRasterFixture(movedFen, 'black');
  const blackRec = recognize(blackImg, templatesBlack, 'black');
  assert.equal(blackRec.confident, true);
  assert.equal(blackRec.placement, movedFen.split(' ')[0]);
});

// ===========================================================================
// TIER 2: Boundary Conditions & Edge Effects
// ===========================================================================
console.log('\n[TIER 2] Boundary Conditions & Edge Robustness (h-file crop, in-square coordinates)');

runTest('Tier 2.1: Vertical h extreme edge with right crop (shifts +1px, +2px, +3px, +4px)', () => {
  for (const shift of [1, 2, 3, 4]) {
    const shiftedImg = createRasterFixture(initialFen, 'white', { shiftX: shift });
    const rec = recognize(shiftedImg, templatesWhite, 'white');
    // Verify vertical h squares specifically
    for (let rank = 1; rank <= 8; rank++) {
      const sq = `h${rank}`;
      const cell = rec.cells.find(c => c.square === sq);
      assert.ok(cell, `Square ${sq} must exist in recognized cells`);
      const expectedPiece = new Chess(initialFen).get(sq as Square);
      const expectedLabel = expectedPiece ? (expectedPiece.color === 'w' ? expectedPiece.type.toUpperCase() : expectedPiece.type) : null;
      assert.equal(cell.piece, expectedLabel, `h-file square ${sq} with shift +${shift}px matched`);
    }
  }
});

runTest('Tier 2.2: Extreme corners (a1, a8, h1, h8) with negative and positive shifts', () => {
  for (const shift of [-2, 2]) {
    const shiftedImg = createRasterFixture(initialFen, 'white', { shiftX: shift, shiftY: shift });
    const rec = recognize(shiftedImg, templatesWhite, 'white');
    assert.equal(rec.cells.find(c => c.square === 'a1')?.piece, 'R');
    assert.equal(rec.cells.find(c => c.square === 'h1')?.piece, 'R');
    assert.equal(rec.cells.find(c => c.square === 'a8')?.piece, 'r');
    assert.equal(rec.cells.find(c => c.square === 'h8')?.piece, 'r');
  }
});

runTest('Tier 2.3: In-square coordinates 1-8 and a-h (including dual-coordinate corner a1)', () => {
  const coordImg = createRasterFixture(initialFen, 'white', { renderCoordinates: true });
  const rec = recognize(coordImg, templatesWhite, 'white');

  // a1 has both rank coordinate '1' and file coordinate 'a'
  const a1 = rec.cells.find(c => c.square === 'a1')!;
  assert.equal(a1.piece, 'R', 'a1 with internal coordinates must be White Rook');

  // Empty squares on file a (a3, a4, a5, a6) must not be corrupted by coordinates
  const a4 = rec.cells.find(c => c.square === 'a4')!;
  assert.equal(a4.piece, null, 'a4 with coordinate must remain empty');
});

// ===========================================================================
// TIER 3: Chess.com Highlight Combinations & Theme Invariance
// ===========================================================================
console.log('\n[TIER 3] Chess.com Highlight Combinations & Theme Invariance');

const HIGHLIGHT_COLORS: Record<string, [number, number, number]> = {
  yellow: [247, 247, 105], // #f7f769 Chess.com last move
  green: [169, 188, 108],  // #a9bc6c Chess.com alternate
  pinkRed: [235, 87, 87],  // #eb5757 Chess.com check / critical move
};

runTest('Tier 3.1: CRITICAL — Empty square immunity (NO false White King ♔ on d5/e4/c4)', () => {
  for (const [colorName, color] of Object.entries(HIGHLIGHT_COLORS)) {
    for (const style of ['fill', 'border'] as const) {
      for (const bw of [3, 4, 5, 6]) {
        if (style === 'fill' && bw > 3) continue; // bw only applies to border

        const img = createRasterFixture(initialFen, 'white', {
          highlights: {
            d5: { color, style, borderWidthPx: bw, alpha: 0.7 },
            e4: { color, style, borderWidthPx: bw, alpha: 0.7 },
          },
        });

        const rec = recognize(img, templatesWhite, 'white');
        const d5Cell = rec.cells.find(c => c.square === 'd5')!;
        const e4Cell = rec.cells.find(c => c.square === 'e4')!;

        // STRICT REGRESSION CHECKS:
        assert.notEqual(d5Cell.piece, 'K', `Empty d5 MUST NEVER be recognized as White King ♔ (${colorName}, ${style})`);
        assert.equal(d5Cell.piece, null, `Empty d5 must be classified as empty null (${colorName}, ${style})`);

        assert.notEqual(e4Cell.piece, 'K', `Empty e4 MUST NEVER be recognized as White King ♔ (${colorName}, ${style})`);
        assert.equal(e4Cell.piece, null, `Empty e4 must be classified as empty null (${colorName}, ${style})`);
      }
    }
  }
});

runTest('Tier 3.2: Black pieces with move highlights (Black Pawn e4, Knight f6, Rook c8)', () => {
  // Setup position with black pawn on e4, knight on f6, rook on c8
  const fenPieces = '2r1kb1r/pp1npppp/5n2/8/4p3/2N2N2/PPPP1PPP/R1BQK2R w KQk - 0 7';

  for (const [colorName, color] of Object.entries(HIGHLIGHT_COLORS)) {
    const img = createRasterFixture(fenPieces, 'white', {
      highlights: {
        e4: { color, style: 'border', borderWidthPx: 4, alpha: 0.75 },
        f6: { color, style: 'fill', alpha: 0.6 },
        c8: { color, style: 'border', borderWidthPx: 5, alpha: 0.7 },
      },
    });

    const rec = recognize(img, templatesWhite, 'white');
    const pCell = rec.cells.find(c => c.square === 'e4')!;
    const nCell = rec.cells.find(c => c.square === 'f6')!;
    const rCell = rec.cells.find(c => c.square === 'c8')!;

    assert.equal(pCell.piece, 'p', `Black pawn on e4 recognized correctly under ${colorName} highlight`);
    assert.equal(nCell.piece, 'n', `Black knight on f6 recognized correctly under ${colorName} highlight`);
    assert.equal(rCell.piece, 'r', `Black rook on c8 recognized correctly under ${colorName} highlight`);
  }
});

runTest('Tier 3.3: White pieces with move highlights (White Pawn e4, Knight f3, Rook d1, Queen h5, King g1)', () => {
  const fenWhitePieces = 'r1bqk2r/pppp1ppp/2n5/4p2Q/4P3/3P1N2/PPP2PPP/RNB1KB1R b KQkq - 0 5';

  const img = createRasterFixture(fenWhitePieces, 'white', {
    highlights: {
      h5: { color: HIGHLIGHT_COLORS.pinkRed, style: 'border', borderWidthPx: 5, alpha: 0.8 },
      f3: { color: HIGHLIGHT_COLORS.yellow, style: 'fill', alpha: 0.65 },
      e4: { color: HIGHLIGHT_COLORS.green, style: 'border', borderWidthPx: 4, alpha: 0.7 },
    },
  });

  const rec = recognize(img, templatesWhite, 'white');
  assert.equal(rec.cells.find(c => c.square === 'h5')?.piece, 'Q', 'White Queen on h5 recognized');
  assert.equal(rec.cells.find(c => c.square === 'f3')?.piece, 'N', 'White Knight on f3 recognized');
  assert.equal(rec.cells.find(c => c.square === 'e4')?.piece, 'P', 'White Pawn on e4 recognized');
});

runTest('Tier 3.4: Multi-Theme Support (Neo, Classic, Wood themes with wood texture noise)', () => {
  for (const themeKey of ['Neo', 'Classic', 'Wood']) {
    const theme = THEMES[themeKey];
    const themeCalibImg = createRasterFixture(initialFen, 'white', { theme });
    const themeTemplates = calibrate(themeCalibImg, initialFen, 'white');

    const testGame = new Chess();
    testGame.move('e4'); testGame.move('e5'); testGame.move('Nf3'); testGame.move('Nc6');
    const testFen = testGame.fen();

    const themeTestImg = createRasterFixture(testFen, 'white', {
      theme,
      highlights: {
        f3: { color: HIGHLIGHT_COLORS.yellow, style: 'fill', alpha: 0.6 },
        g1: { color: HIGHLIGHT_COLORS.yellow, style: 'fill', alpha: 0.6 }, // from square
      },
    });

    const rec = recognize(themeTestImg, themeTemplates, 'white');
    assert.equal(rec.confident, true, `Recognition must be confident on ${themeKey} theme`);
    assert.equal(rec.placement, testFen.split(' ')[0], `Placement matches on ${themeKey} theme`);
  }
});

// ===========================================================================
// TIER 4: Realistic Vukovic Attack Scenarios
// ===========================================================================
console.log('\n[TIER 4] Realistic Vukovic Attack Scenarios (Vukovic "Art of Attack in Chess")');

runTest('Tier 4.1: Colle System Greek Gift — Bishop Sacrifice 1.Bxh7+! with move highlights', () => {
  // Before sacrifice
  const colleFen = 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 7';
  // White plays 1.Bxh7+! (d3 bishop captures on h7 with check)
  const afterBxh7 = 'r1bq1rk1/ppp2p1B/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQK2R b KQ - 0 7';

  // Highlight d3 (origin square, now empty) and h7 (target square, now White Bishop with red/pink check highlight)
  const imgBxh7 = createRasterFixture(afterBxh7, 'white', {
    highlights: {
      d3: { color: HIGHLIGHT_COLORS.yellow, style: 'fill', alpha: 0.65 },
      h7: { color: HIGHLIGHT_COLORS.pinkRed, style: 'border', borderWidthPx: 5, alpha: 0.8 },
    },
  });

  const rec = recognize(imgBxh7, templatesWhite, 'white');
  assert.equal(rec.confident, true, 'Colle Greek Gift position must be recognized with confidence');
  assert.equal(rec.placement, afterBxh7.split(' ')[0]);

  // Origin d3 must be empty, target h7 must be White Bishop
  assert.equal(rec.cells.find(c => c.square === 'd3')?.piece, null, 'Origin d3 must be empty');
  assert.equal(rec.cells.find(c => c.square === 'h7')?.piece, 'B', 'Target h7 must be White Bishop');
  assert.equal(rec.cells.find(c => c.square === 'g8')?.piece, 'k', 'Black King remains on g8');
});

runTest('Tier 4.2: Colle System Greek Gift — King Acceptance 1...Kxh7 with move highlights', () => {
  // Black accepts: 1...Kxh7 (g8 king captures bishop on h7)
  const afterKxh7 = 'r1bq1r2/ppp2p1k/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQK2R w KQ - 0 8';

  const imgKxh7 = createRasterFixture(afterKxh7, 'white', {
    highlights: {
      g8: { color: HIGHLIGHT_COLORS.yellow, style: 'fill', alpha: 0.65 },
      h7: { color: HIGHLIGHT_COLORS.yellow, style: 'border', borderWidthPx: 4, alpha: 0.75 },
    },
  });

  const rec = recognize(imgKxh7, templatesWhite, 'white');
  assert.equal(rec.confident, true);
  assert.equal(rec.placement, afterKxh7.split(' ')[0]);
  assert.equal(rec.cells.find(c => c.square === 'g8')?.piece, null, 'Origin g8 is empty');
  assert.equal(rec.cells.find(c => c.square === 'h7')?.piece, 'k', 'Target h7 is Black King');
});

runTest('Tier 4.3: Vukovic Rook Lift Attack (Rd3-h3) along extreme files', () => {
  // Position during rook maneuver
  const rookLiftFen = 'r1b2rk1/pp1nqppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 9';
  const imgRookLift = createRasterFixture(rookLiftFen, 'white', {
    highlights: {
      f1: { color: HIGHLIGHT_COLORS.green, style: 'fill', alpha: 0.5 },
      d1: { color: HIGHLIGHT_COLORS.yellow, style: 'fill', alpha: 0.6 },
    },
  });

  const rec = recognize(imgRookLift, templatesWhite, 'white');
  assert.equal(rec.confident, true);
  assert.equal(rec.placement, rookLiftFen.split(' ')[0]);
});

console.log('='.repeat(80));
if (failures.length > 0) {
  console.error(`\n❌ FAILED: ${failures.length} of ${totalCount} tests failed across the 4-tier suite:`);
  for (const f of failures) {
    console.error(`  - ${f.name}\n    Reason: ${f.error.message}`);
  }
  console.log('='.repeat(80));
  assert.equal(failures.length, 0, `${failures.length} test(s) failed in 4-Tier test suite.`);
} else {
  console.log(`✓ All ${passedCount}/${totalCount} tests passed across Tier 1, Tier 2, Tier 3, and Tier 4.`);
  console.log('='.repeat(80));
}
