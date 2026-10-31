/**
 * Automated Performance Benchmark for Computer Vision Board Recognition
 *
 * Requirements:
 * - Measure min, max, average, and P95 execution time of recognize()
 * - Run 50 iterations per resolution
 * - Test across multiple board resolutions: 384x384, 512x512, 1024x1024
 * - Strict assertion: avgTime < 25ms per 8x8 board
 *
 * Usage:
 *   npx --prefix hud tsx tests/benchmark.ts
 */

import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  calibrate,
  recognize,
  screenSquare,
  type PixelImage,
  type Orientation,
  type TemplateSet,
} from '../core/recognition';

// Synthetic raster fixture generator matching realistic board layout & piece silhouettes
function createBenchmarkFixture(
  fen: string,
  size: number,
  orientation: Orientation = 'white',
  options: { highlight?: string; highlightColor?: [number, number, number] } = {}
): PixelImage {
  const image: PixelImage = {
    width: size,
    height: size,
    data: new Uint8ClampedArray(size * size * 4),
  };
  const board = new Chess(fen);
  const step = size / 8;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / step);
      const col = Math.floor(x / step);
      const square = screenSquare(row, col, orientation);
      const piece = board.get(square);
      const u = (x % step + 0.5) / step;
      const v = (y % step + 0.5) / step;

      // Neo/Standard theme square colors
      let rgb = (row + col) % 2 ? [119, 149, 86] : [235, 236, 208];

      // Move highlight if applicable
      if (options.highlight === square && options.highlightColor) {
        const hc = options.highlightColor;
        rgb = [
          Math.round(rgb[0] * 0.4 + hc[0] * 0.6),
          Math.round(rgb[1] * 0.4 + hc[1] * 0.6),
          Math.round(rgb[2] * 0.4 + hc[2] * 0.6),
        ];
      }

      // Piece glyph silhouettes (Cburnett-like geometry)
      if (piece) {
        const typeIndex = 'pnbrqk'.indexOf(piece.type);
        const base = v > 0.67 && v < 0.82 && u > 0.21 && u < 0.79;
        const stem = v > 0.30 && v < 0.70 && Math.abs(u - 0.5) < 0.08 + typeIndex * 0.018;
        const cap = v > 0.16 && v < 0.30 && u > 0.18 + typeIndex * 0.035 && u < 0.82 - typeIndex * 0.035;
        const detail = v > 0.37 && v < 0.44 + typeIndex * 0.027 && u > 0.27 && u < 0.39;
        if ((base || stem || cap) && !detail) {
          rgb = piece.color === 'w' ? [248, 248, 245] : [24, 24, 26];
        }
      }

      const idx = (y * size + x) * 4;
      image.data[idx] = rgb[0];
      image.data[idx + 1] = rgb[1];
      image.data[idx + 2] = rgb[2];
      image.data[idx + 3] = 255;
    }
  }

  return image;
}

interface BenchmarkResult {
  resolution: string;
  iterations: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p95Ms: number;
  passed: boolean;
}

function runBenchmarkForResolution(
  size: number,
  iterations = 50,
  warmupIterations = 10
): BenchmarkResult {
  const initialFen = new Chess().fen();
  // Vukovic Attack Position: Greek Gift sacrifice setup
  const middleGameFen = 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 7';

  const calibImage = createBenchmarkFixture(initialFen, size, 'white');
  const templates: TemplateSet = calibrate(calibImage, initialFen, 'white');

  const testImage = createBenchmarkFixture(middleGameFen, size, 'white', {
    highlight: 'd4',
    highlightColor: [247, 247, 105], // yellow move highlight
  });

  // Verify correctness before profiling
  const testRec = recognize(testImage, templates, 'white');
  assert.equal(
    testRec.placement,
    middleGameFen.split(' ')[0],
    `Placement mismatch during benchmark pre-check at ${size}x${size}`
  );

  // Warmup JIT compiler
  for (let i = 0; i < warmupIterations; i++) {
    recognize(testImage, templates, 'white');
  }

  // 50 measured iterations
  const times: number[] = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    recognize(testImage, templates, 'white');
    times[i] = performance.now() - start;
  }

  times.sort((a, b) => a - b);
  const minMs = times[0];
  const maxMs = times[times.length - 1];
  const sumMs = times.reduce((acc, t) => acc + t, 0);
  const avgMs = sumMs / iterations;
  const p95Index = Math.min(times.length - 1, Math.floor(iterations * 0.95));
  const p95Ms = times[p95Index];
  const passed = avgMs < 25.0;

  return {
    resolution: `${size}x${size}`,
    iterations,
    minMs,
    maxMs,
    avgMs,
    p95Ms,
    passed,
  };
}

function main(): void {
  console.log('='.repeat(80));
  console.log('  NONCHALANT HUD COMPUTER VISION ENGINE — PERFORMANCE BENCHMARK');
  console.log('  Target: recognize() full 8x8 board < 25.0 ms (Strict AC R1)');
  console.log('  Methodology: 50 iterations after 10 warmup runs per resolution');
  console.log('='.repeat(80));

  const resolutions = [384, 512, 1024];
  const results: BenchmarkResult[] = [];

  for (const res of resolutions) {
    const resResult = runBenchmarkForResolution(res, 50, 10);
    results.push(resResult);

    console.log(
      `[BENCHMARK] Resolution: ${resResult.resolution.padEnd(9)} | ` +
      `Avg: ${resResult.avgMs.toFixed(2).padStart(5)} ms | ` +
      `Min: ${resResult.minMs.toFixed(2).padStart(5)} ms | ` +
      `Max: ${resResult.maxMs.toFixed(2).padStart(5)} ms | ` +
      `P95: ${resResult.p95Ms.toFixed(2).padStart(5)} ms | ` +
      `Status: ${resResult.passed ? '✓ PASS (<25ms)' : '✗ FAIL (>=25ms)'}`
    );

    // Strict assertion
    assert(
      resResult.passed,
      `PERFORMANCE REGRESSION: Resolution ${resResult.resolution} took ${resResult.avgMs.toFixed(2)} ms (threshold: 25.0 ms)`
    );
  }

  // Also verify Black orientation benchmark at 512x512
  console.log('-'.repeat(80));
  console.log('  Flipped Board (Black orientation) Benchmark:');
  const blackFen = 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R b KQ - 0 7';
  const blackCalib = createBenchmarkFixture(new Chess().fen(), 512, 'black');
  const blackTemplates = calibrate(blackCalib, new Chess().fen(), 'black');
  const blackTestImg = createBenchmarkFixture(blackFen, 512, 'black', {
    highlight: 'e8',
    highlightColor: [247, 247, 105],
  });

  for (let i = 0; i < 10; i++) recognize(blackTestImg, blackTemplates, 'black');
  const blackTimes: number[] = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    recognize(blackTestImg, blackTemplates, 'black');
    blackTimes.push(performance.now() - t0);
  }
  const blackAvg = blackTimes.reduce((a, b) => a + b, 0) / blackTimes.length;
  console.log(
    `[BENCHMARK] Flipped Black: 512x512 | ` +
    `Avg: ${blackAvg.toFixed(2).padStart(5)} ms | ` +
    `Status: ${blackAvg < 25 ? '✓ PASS (<25ms)' : '✗ FAIL (>=25ms)'}`
  );
  assert(blackAvg < 25.0, `Black orientation benchmark failed: ${blackAvg.toFixed(2)} ms`);

  console.log('='.repeat(80));
  console.log('✓ All CV recognition performance benchmarks PASSED (<25 ms SLA satisfied).');
  console.log('='.repeat(80));
}

main();
