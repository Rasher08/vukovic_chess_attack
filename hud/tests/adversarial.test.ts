/**
 * EMPIRICAL ADVERSARIAL STRESS TEST HARNESS (Challenger 2)
 *
 * Exhaustive adversarial stress-testing of nonchalant HUD Computer Vision pipeline:
 * - Suite 1: Empty Squares Under Aggressive Highlight Fills (Alphas 0.25..0.95 across 11 colors)
 * - Suite 2: Empty Squares Under Thick Borders (2..8px at 512..1024px, 2..6px at 384px)
 * - Suite 3: Black Pieces & Pawns Under Highlights (e4, d5, c4, g7, f6, e8, d8, c8, a8)
 * - Suite 4: Multi-Theme Stress & Wood Grain Noise Floor (Neo, Classic, Wood)
 * - Suite 5: Boundary & Edge Robustness (h-file crop +1..+4px, in-square coordinates a-h / 1-8)
 * - Suite 6: Drag Protection & Frame Stability Gate Responsiveness
 */

import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  calibrate,
  recognize,
  FrameStabilityGate,
  type PixelImage,
  type Orientation,
  type TemplateSet,
} from '../core/recognition';
import {
  createRasterFixture,
  THEMES,
  type ThemePalette,
  type HighlightSpec,
} from './highlights.test';

let totalTests = 0;
let passedTests = 0;
const failures: { name: string; error: string }[] = [];

function runCase(name: string, fn: () => void): void {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    failures.push({ name, error: errorMsg });
    console.error(`  [FAIL] ${name}`);
    console.error(`         Reason: ${errorMsg}`);
  }
}

console.log('='.repeat(80));
console.log('  CHALLENGER 2: ADVERSARIAL CV STRESS TEST HARNESS');
console.log('='.repeat(80));

const initialFen = new Chess().fen();
const calibWhite = createRasterFixture(initialFen, 'white');
const templatesWhite = calibrate(calibWhite, initialFen, 'white');

const ADVERSARIAL_COLORS: Record<string, [number, number, number]> = {
  yellow: [247, 247, 105],
  pureYellow: [255, 255, 0],
  green: [169, 188, 108],
  pureGreen: [0, 255, 0],
  pinkRed: [235, 87, 87],
  pureRed: [255, 0, 0],
  deepRed: [180, 0, 0],
  hotPink: [255, 105, 180],
  orange: [255, 140, 0],
  cyan: [0, 255, 255],
  skyBlue: [30, 144, 255],
};

// Ground-truth position where d5, e4, c4, g7, a4, h5 are guaranteed empty
const fenCleanEmpty = 'r1bqk2r/pppp1p1p/2n2n2/8/8/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 5';

// ===========================================================================
// SUITE 1: Empty Squares Under Aggressive Highlight Fills (Strict 0 False Positives)
// ===========================================================================
console.log('\n--- SUITE 1: Empty Squares Under Aggressive Highlight Fills ---');

runCase('Suite 1.1: Multi-Color Fills on Empty Squares (d5, e4, c4, g7) Across Alphas 0.25..0.95', () => {
  for (const [colorName, rgb] of Object.entries(ADVERSARIAL_COLORS)) {
    for (const alpha of [0.25, 0.40, 0.65, 0.80, 0.95]) {
      const hlMap: Record<string, HighlightSpec> = {};
      for (const sq of ['d5', 'e4', 'c4', 'g7']) {
        hlMap[sq] = { color: rgb, style: 'fill', alpha };
      }

      const img = createRasterFixture(fenCleanEmpty, 'white', { highlights: hlMap });
      const rec = recognize(img, templatesWhite, 'white');

      for (const sq of ['d5', 'e4', 'c4', 'g7']) {
        const cell = rec.cells.find(c => c.square === sq)!;
        assert.notEqual(cell.piece, 'K', `Square ${sq} MUST NEVER be White King (${colorName}, alpha ${alpha})`);
        assert.equal(cell.piece, null, `Square ${sq} MUST be empty null (${colorName}, alpha ${alpha})`);
      }
    }
  }
});

// ===========================================================================
// SUITE 2: Empty Squares Under Thick Borders Across Board Sizes
// ===========================================================================
console.log('\n--- SUITE 2: Empty Squares Under Thick Borders Across Board Sizes ---');

runCase('Suite 2.1: Borders 2..8px on Standard Resolutions (512x512 and 1024x1024)', () => {
  for (const size of [512, 1024]) {
    const calib = createRasterFixture(initialFen, 'white', { size });
    const tmpl = calibrate(calib, initialFen, 'white');

    for (let bw = 2; bw <= 8; bw++) {
      for (const [colorName, rgb] of Object.entries({
        yellow: ADVERSARIAL_COLORS.yellow,
        pinkRed: ADVERSARIAL_COLORS.pinkRed,
        green: ADVERSARIAL_COLORS.green,
        pureRed: ADVERSARIAL_COLORS.pureRed,
      })) {
        const hlMap: Record<string, HighlightSpec> = {};
        for (const sq of ['d5', 'e4', 'c4', 'g7']) {
          hlMap[sq] = { color: rgb, style: 'border', borderWidthPx: bw, alpha: 0.85 };
        }

        const img = createRasterFixture(fenCleanEmpty, 'white', { size, highlights: hlMap });
        const rec = recognize(img, tmpl, 'white');

        for (const sq of ['d5', 'e4', 'c4', 'g7']) {
          const cell = rec.cells.find(c => c.square === sq)!;
          assert.equal(cell.piece, null, `Size ${size}x${size}, bw ${bw}px: ${sq} must be null (${colorName})`);
        }
      }
    }
  }
});

runCase('Suite 2.2: Borders 2..6px on Compact Resolution (384x384)', () => {
  for (let bw = 2; bw <= 6; bw++) {
    for (const [colorName, rgb] of Object.entries({
      yellow: ADVERSARIAL_COLORS.yellow,
      pinkRed: ADVERSARIAL_COLORS.pinkRed,
      green: ADVERSARIAL_COLORS.green,
      pureRed: ADVERSARIAL_COLORS.pureRed,
    })) {
      const hlMap: Record<string, HighlightSpec> = {};
      for (const sq of ['d5', 'e4', 'c4', 'g7']) {
        hlMap[sq] = { color: rgb, style: 'border', borderWidthPx: bw, alpha: 0.85 };
      }

      const img = createRasterFixture(fenCleanEmpty, 'white', { highlights: hlMap });
      const rec = recognize(img, templatesWhite, 'white');

      for (const sq of ['d5', 'e4', 'c4', 'g7']) {
        const cell = rec.cells.find(c => c.square === sq)!;
        assert.equal(cell.piece, null, `384x384 bw ${bw}px: ${sq} must be null (${colorName})`);
      }
    }
  }
});

// ===========================================================================
// SUITE 3: Black Pieces & Pawns Under Highlights
// ===========================================================================
console.log('\n--- SUITE 3: Black Pieces & Pawns Under Highlights ---');

runCase('Suite 3.1: Black Pawns on Dark and Light Squares Under Highlights (Fills & Safe Borders)', () => {
  // e4 (dark), d5 (light), c4 (light), g7 (light)
  const fenBlackPawns = 'rnbqkbnr/pppp1pp1/8/3p4/2p1p3/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  for (const [colorName, rgb] of Object.entries(ADVERSARIAL_COLORS)) {
    const img = createRasterFixture(fenBlackPawns, 'white', {
      highlights: {
        e4: { color: rgb, style: 'border', borderWidthPx: 4, alpha: 0.75 },
        d5: { color: rgb, style: 'fill', alpha: 0.65 },
        c4: { color: rgb, style: 'border', borderWidthPx: 4, alpha: 0.8 },
        g7: { color: rgb, style: 'fill', alpha: 0.55 },
      },
    });

    const rec = recognize(img, templatesWhite, 'white');
    assert.equal(rec.cells.find(c => c.square === 'e4')?.piece, 'p', `e4 Black pawn under ${colorName}`);
    assert.equal(rec.cells.find(c => c.square === 'd5')?.piece, 'p', `d5 Black pawn under ${colorName}`);
    assert.equal(rec.cells.find(c => c.square === 'c4')?.piece, 'p', `c4 Black pawn under ${colorName}`);
    assert.equal(rec.cells.find(c => c.square === 'g7')?.piece, 'p', `g7 Black pawn under ${colorName}`);
  }
});

runCase('Suite 3.2: All Black Major & Minor Pieces Under Highlights (King, Queen, Rook, Bishop, Knight)', () => {
  const fenPieces = 'r1bqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

  const img = createRasterFixture(fenPieces, 'white', {
    highlights: {
      e8: { color: ADVERSARIAL_COLORS.deepRed, style: 'border', borderWidthPx: 4, alpha: 0.8 },
      d8: { color: ADVERSARIAL_COLORS.yellow, style: 'fill', alpha: 0.65 },
      a8: { color: ADVERSARIAL_COLORS.green, style: 'border', borderWidthPx: 4, alpha: 0.7 },
      c8: { color: ADVERSARIAL_COLORS.pinkRed, style: 'fill', alpha: 0.6 },
      f6: { color: ADVERSARIAL_COLORS.hotPink, style: 'border', borderWidthPx: 4, alpha: 0.8 },
    },
  });

  const rec = recognize(img, templatesWhite, 'white');
  assert.equal(rec.cells.find(c => c.square === 'e8')?.piece, 'k', 'Black King on e8');
  assert.equal(rec.cells.find(c => c.square === 'd8')?.piece, 'q', 'Black Queen on d8');
  assert.equal(rec.cells.find(c => c.square === 'a8')?.piece, 'r', 'Black Rook on a8');
  assert.equal(rec.cells.find(c => c.square === 'c8')?.piece, 'b', 'Black Bishop on c8');
  assert.equal(rec.cells.find(c => c.square === 'f6')?.piece, 'n', 'Black Knight on f6');
});

runCase('Suite 3.3: Black Pieces Under 2..8px Borders on 640x640 Board', () => {
  const fenPieces = 'r1bqk2r/pppp1p1p/5n2/3p4/2p1p3/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const calib640 = createRasterFixture(initialFen, 'white', { size: 640 });
  const tmpl640 = calibrate(calib640, initialFen, 'white');

  for (let bw = 2; bw <= 8; bw++) {
    const img = createRasterFixture(fenPieces, 'white', {
      size: 640,
      highlights: {
        e4: { color: ADVERSARIAL_COLORS.yellow, style: 'border', borderWidthPx: bw, alpha: 0.8 },
        d5: { color: ADVERSARIAL_COLORS.pinkRed, style: 'border', borderWidthPx: bw, alpha: 0.8 },
        c4: { color: ADVERSARIAL_COLORS.green, style: 'border', borderWidthPx: bw, alpha: 0.8 },
        f6: { color: ADVERSARIAL_COLORS.deepRed, style: 'border', borderWidthPx: bw, alpha: 0.8 },
      },
    });

    const rec = recognize(img, tmpl640, 'white');
    assert.equal(rec.cells.find(c => c.square === 'e4')?.piece, 'p', `640x640 bw=${bw}: e4 is p`);
    assert.equal(rec.cells.find(c => c.square === 'd5')?.piece, 'p', `640x640 bw=${bw}: d5 is p`);
    assert.equal(rec.cells.find(c => c.square === 'c4')?.piece, 'p', `640x640 bw=${bw}: c4 is p`);
    assert.equal(rec.cells.find(c => c.square === 'f6')?.piece, 'n', `640x640 bw=${bw}: f6 is n`);
  }
});

runCase('Suite 3.4: Polarity Gate Strict Verification — No Black Piece Classified as White', () => {
  const fenAllBlack = 'rnbqkbnr/pppppppp/8/8/8/8/8/RNBQKBNR w KQkq - 0 1';
  const img = createRasterFixture(fenAllBlack, 'white');
  const rec = recognize(img, templatesWhite, 'white');

  for (let r = 7; r <= 8; r++) {
    for (const f of 'abcdefgh') {
      const sq = `${f}${r}` as any;
      const cell = rec.cells.find(c => c.square === sq)!;
      assert.ok(cell.piece, `Piece on ${sq} must be detected`);
      assert.equal(cell.piece, cell.piece.toLowerCase(), `Piece on ${sq} must be Black lowercase`);
    }
  }
});

// ===========================================================================
// SUITE 4: Multi-Theme Stress & Wood Grain Noise Floor
// ===========================================================================
console.log('\n--- SUITE 4: Multi-Theme Stress & Wood Grain Noise Floor ---');

runCase('Suite 4.1: Theme Invariance on Neo, Classic, and Wood (Greek Gift Colle Attack)', () => {
  const colleMiddlegame = 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 7';

  for (const themeName of ['Neo', 'Classic', 'Wood'] as const) {
    const theme = THEMES[themeName];
    const calib = createRasterFixture(initialFen, 'white', { theme });
    const tmpl = calibrate(calib, initialFen, 'white');

    const testImg = createRasterFixture(colleMiddlegame, 'white', {
      theme,
      highlights: {
        d3: { color: ADVERSARIAL_COLORS.yellow, style: 'fill', alpha: 0.65 },
        h7: { color: ADVERSARIAL_COLORS.deepRed, style: 'border', borderWidthPx: 4, alpha: 0.8 },
      },
    });

    const rec = recognize(testImg, tmpl, 'white');
    assert.equal(rec.confident, true, `Recognition must be confident on ${themeName} theme`);
    assert.equal(rec.placement, colleMiddlegame.split(' ')[0], `Placement matches on ${themeName}`);
  }
});

runCase('Suite 4.2: Wood Theme Headroom Verification (Texture Noise Amplitudes 12, 14, 16, 18)', () => {
  const colleFen = 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 7';

  for (const noise of [12, 14, 16, 18]) {
    const woodCustom: ThemePalette = {
      name: 'Wood',
      lightSquare: [210, 165, 115],
      darkSquare: [136, 84, 39],
      textureNoise: noise,
    };

    const calib = createRasterFixture(initialFen, 'white', { theme: woodCustom });
    const tmpl = calibrate(calib, initialFen, 'white');

    const testImg = createRasterFixture(colleFen, 'white', {
      theme: woodCustom,
      highlights: {
        d5: { color: ADVERSARIAL_COLORS.yellow, style: 'fill', alpha: 0.65 },
      },
    });

    const rec = recognize(testImg, tmpl, 'white');
    assert.equal(rec.confident, true, `Wood with noise amplitude ${noise} must remain confident`);
    assert.equal(rec.placement, colleFen.split(' ')[0]);
  }
});

// ===========================================================================
// SUITE 5: Boundary & Edge Stress (h-file right crop and internal coordinates)
// ===========================================================================
console.log('\n--- SUITE 5: Boundary & Edge Robustness ---');

runCase('Suite 5.1: Vertical h Edge Right Crop (+1px to +4px) Individual Piece Accuracy', () => {
  for (const shift of [1, 2, 3, 4]) {
    const img = createRasterFixture(initialFen, 'white', { shiftX: shift });
    const rec = recognize(img, templatesWhite, 'white');

    // Verify all 8 squares of file h
    assert.equal(rec.cells.find(c => c.square === 'h1')?.piece, 'R');
    assert.equal(rec.cells.find(c => c.square === 'h2')?.piece, 'P');
    assert.equal(rec.cells.find(c => c.square === 'h3')?.piece, null);
    assert.equal(rec.cells.find(c => c.square === 'h4')?.piece, null);
    assert.equal(rec.cells.find(c => c.square === 'h5')?.piece, null);
    assert.equal(rec.cells.find(c => c.square === 'h6')?.piece, null);
    assert.equal(rec.cells.find(c => c.square === 'h7')?.piece, 'p');
    assert.equal(rec.cells.find(c => c.square === 'h8')?.piece, 'r');
  }
});

runCase('Suite 5.2: In-Square Coordinates Combined with Highlights Across Edge Squares', () => {
  const img = createRasterFixture(initialFen, 'white', {
    renderCoordinates: true,
    highlights: {
      a1: { color: ADVERSARIAL_COLORS.yellow, style: 'border', borderWidthPx: 4, alpha: 0.7 },
      h8: { color: ADVERSARIAL_COLORS.pinkRed, style: 'fill', alpha: 0.65 },
      a4: { color: ADVERSARIAL_COLORS.green, style: 'fill', alpha: 0.6 }, // empty square with '4' coord
      h1: { color: ADVERSARIAL_COLORS.yellow, style: 'fill', alpha: 0.6 }, // corner with 'h' and '1'
    },
  });

  const rec = recognize(img, templatesWhite, 'white');
  assert.equal(rec.cells.find(c => c.square === 'a1')?.piece, 'R', 'a1 Rook with coordinates and border');
  assert.equal(rec.cells.find(c => c.square === 'h8')?.piece, 'r', 'h8 Rook with fill');
  assert.equal(rec.cells.find(c => c.square === 'a4')?.piece, null, 'a4 empty with coordinate "4" must be null');
  assert.equal(rec.cells.find(c => c.square === 'h1')?.piece, 'R', 'h1 Rook with "h" coordinate and fill');
});

// ===========================================================================
// SUITE 6: Drag Protection & Frame Stability Gate Responsiveness
// ===========================================================================
console.log('\n--- SUITE 6: Drag Protection & Frame Stability Gate Responsiveness ---');

runCase('Suite 6.1: FrameStabilityGate Timing — Exactly 200ms Threshold (3 Matches)', () => {
  const gate = new FrameStabilityGate();
  const img1 = createRasterFixture(initialFen, 'white');

  // t = 0ms: First frame observed
  const r0 = gate.observe(img1, 0);
  assert.equal(r0.changed, true, 't=0: first frame is changed');
  assert.equal(r0.stable, false, 't=0: not yet stable');

  // t = 70ms: 2nd observation (70ms < 200ms)
  const r70 = gate.observe(img1, 70);
  assert.equal(r70.changed, false, 't=70: frame identical');
  assert.equal(r70.stable, false, 't=70: stable must be false (now - since = 70 < 200)');

  // t = 140ms: 3rd observation (140ms < 200ms)
  const r140 = gate.observe(img1, 140);
  assert.equal(r140.changed, false, 't=140: frame identical');
  assert.equal(r140.stable, false, 't=140: stable must be false (now - since = 140 < 200)');

  // t = 210ms: 4th observation (210ms >= 200ms, count >= 3)
  const r210 = gate.observe(img1, 210);
  assert.equal(r210.changed, false, 't=210: frame identical');
  assert.equal(r210.stable, true, 't=210: stable MUST be true (now - since = 210 >= 200 and count >= 3)');
});

runCase('Suite 6.2: Instant Signal Revocation on Drag Inception', () => {
  const gate = new FrameStabilityGate();
  const imgStart = createRasterFixture(initialFen, 'white');

  // Establish stable state at t=250ms
  gate.observe(imgStart, 0);
  gate.observe(imgStart, 100);
  const stableState = gate.observe(imgStart, 250);
  assert.equal(stableState.stable, true, 'Gate established stable board');

  // User begins dragging e2 pawn: e2 square changes
  const fenDrag = 'rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1';
  const imgDrag = createRasterFixture(fenDrag, 'white');

  const dragResult = gate.observe(imgDrag, 300);
  assert.equal(dragResult.changed, true, 'Drag frame must immediately report changed=true');
  assert.equal(dragResult.stable, false, 'Drag frame must immediately revoke stable=false');
});

runCase('Suite 6.3: Drag in Motion — Zero Stability Leaks During Continuous Movement', () => {
  const gate = new FrameStabilityGate();
  const imgStart = createRasterFixture(initialFen, 'white');
  gate.observe(imgStart, 0);
  gate.observe(imgStart, 250);

  const intermediateFens = [
    'rnbqkbnr/pppppppp/8/8/8/4P3/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
  ];

  let t = 300;
  for (const fen of intermediateFens) {
    const frame = createRasterFixture(fen, 'white');
    const res = gate.observe(frame, t);
    assert.equal(res.stable, false, `During drag at t=${t}ms, gate MUST NEVER be stable`);
    t += 70;
  }
});

runCase('Suite 6.4: Settling After Move Completion (e2-e4 Landed, Responsiveness <= 300ms)', () => {
  const gate = new FrameStabilityGate();
  const movedFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  const imgMoved = createRasterFixture(movedFen, 'white');

  // Move lands at t = 500ms
  const r0 = gate.observe(imgMoved, 500);
  assert.equal(r0.changed, true, 'Arrival of move triggers changed=true');
  assert.equal(r0.stable, false);

  assert.equal(gate.observe(imgMoved, 570).stable, false, 't=570: still settling');
  assert.equal(gate.observe(imgMoved, 640).stable, false, 't=640: still settling');

  const rFinal = gate.observe(imgMoved, 710);
  assert.equal(rFinal.stable, true, 't=710ms (210ms elapsed): move successfully stabilized!');
  assert.equal(rFinal.changed, false);
});

runCase('Suite 6.5: Sensor Jitter & Compression Noise Tolerance Without Drag Trigger', () => {
  const gate = new FrameStabilityGate();
  const baseImg = createRasterFixture(initialFen, 'white');
  gate.observe(baseImg, 0);
  gate.observe(baseImg, 100);
  gate.observe(baseImg, 250);

  // Add subtle sensor noise (delta < 0.5 per pixel)
  const noisyImg: PixelImage = {
    width: baseImg.width,
    height: baseImg.height,
    data: new Uint8ClampedArray(baseImg.data),
  };
  for (let i = 0; i < noisyImg.data.length; i += 4) {
    if ((i / 4) % 17 === 0) {
      noisyImg.data[i] = Math.min(255, noisyImg.data[i] + 1);
      noisyImg.data[i + 1] = Math.max(0, noisyImg.data[i + 1] - 1);
    }
  }

  const noiseResult = gate.observe(noisyImg, 320);
  assert.equal(noiseResult.changed, false, 'Subtle capture noise must not trigger changed=true');
  assert.equal(noiseResult.stable, true, 'Subtle capture noise must remain stable');
});

console.log('='.repeat(80));
console.log(`\nADVERSARIAL STRESS TEST SUMMARY:`);
console.log(`Passed: ${passedTests} / ${totalTests}`);
if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} test(s) failed:`);
  for (const f of failures) {
    console.error(`- ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log(`ALL ${passedTests} ADVERSARIAL STRESS TESTS PASSED WITH 100% SUCCESS.`);
}
console.log('='.repeat(80));
