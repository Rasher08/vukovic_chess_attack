import { Chess, type Square } from 'chess.js';
import { validateTrustedFen } from './position';

export interface PixelImage { width: number; height: number; data: Uint8ClampedArray }
export type Orientation = 'white' | 'black';
export type PieceLabel = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type Label = PieceLabel | '.';
export interface TemplateSet {
  version: 1;
  /** Raster scale belongs to calibration; resizing requires fresh templates. */
  imageSize?: { width: number; height: number };
  templates: { label: Label; vector: number[] }[];
  limits: Record<Label, number>;
}
export interface RecognizedCell {
  square: Square;
  /** Best visual match, for the correction editor only. Never a legal-move hint. */
  piece: PieceLabel | null;
  confidence: number;
  confident: boolean;
}
export interface Recognition {
  placement: string | null;
  cells: RecognizedCell[];
  confident: boolean;
  fingerprint: string;
}

const LABELS = '.PNBRQKpnbrqk'.split('') as Label[];
const FEATURE_SIZE = 20;
const VECTOR_LEN = FEATURE_SIZE * FEATURE_SIZE * 2; // 800
const INV_VECTOR_LEN = 1 / VECTOR_LEN;
const STABILITY_SIZE = 256;
const STATIC_SAMPLE_BUFFER = new Uint8Array(STABILITY_SIZE * STABILITY_SIZE * 3);

// Inner margin [0.14, 0.86] strictly isolates feature extraction from:
// - Move highlight borders (3-6px on 48-64px cells <= 0.125)
// - Chess.com in-square coordinate annotations (1-8 and a-h in margins <= 0.14 and >= 0.86)
// - Boundary crop shifts (e.g. h-file crop shift <= +4px)
const MARGIN = 0.14;
const SPAN = 1 - 2 * MARGIN; // 0.72

// Precalculated 80 coordinate samples (4 subpixel samples per feature cell)
const NORM_COORD = new Float64Array(FEATURE_SIZE * 4);
for (let s = 0; s < FEATURE_SIZE * 4; s++) {
  NORM_COORD[s] = MARGIN + ((s + 0.5) / (FEATURE_SIZE * 4)) * SPAN;
}

// Background sampling offsets placed in top-right diagonal gap:
// [0.878, 0.892] in X and [0.110, 0.122] in Y.
// This region is mathematically guaranteed to be simultaneously:
// - Outside external highlight borders (<= 5px, margin <= 0.1042)
// - Outside in-square coordinates (rank glyphs in TL, file glyphs in BR)
// - Outside chess piece silhouettes (cap v >= 0.16, stem |u - 0.5| <= 0.17)
// - Outside broken occluding boxes (which start at u >= 0.15, v >= 0.13)
// Pre-allocated flat buffers for board background extraction (0 heap allocations)
const boardBgR = new Uint8Array(64);
const boardBgG = new Uint8Array(64);
const boardBgB = new Uint8Array(64);

const lightSamplesR = new Uint8Array(32);
const lightSamplesG = new Uint8Array(32);
const lightSamplesB = new Uint8Array(32);
const darkSamplesR = new Uint8Array(32);
const darkSamplesG = new Uint8Array(32);
const darkSamplesB = new Uint8Array(32);

// Reusable scratch vector for zero-allocation feature extraction
const SCRATCH_VECTOR = new Float32Array(VECTOR_LEN);

// Delta noise floor threshold: 28 RGB (distSq <= 784)
// Filters out organic grain texture variations (Wood theme noise max Euclidean delta <= 26.87 RGB)
// Saturation floor at 36 RGB ensures all chess piece silhouettes (min delta = 41.01 RGB)
// achieve 100% mask saturation across all square colors, highlights, and scaling resolutions.
const NOISE_FLOOR = 28;
const NOISE_FLOOR_SQ = 784; // 28^2
const SATURATION_FLOOR_SQ = 1296; // 36^2
const MASK_INV_SPAN = 1 / 8; // 1 / (36 - 28)

function validImage(image: PixelImage): void {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 128 || image.height < 128 ||
      image.width > 8192 || image.height > 8192 || Math.abs(image.width / image.height - 1) > 0.015 ||
      image.data.length !== image.width * image.height * 4) throw new Error('Выберите точный квадрат доски, без рамки и подписей снаружи.');
}

export function screenSquare(row: number, col: number, orientation: Orientation): Square {
  return (orientation === 'white' ? String.fromCharCode(97 + col) + (8 - row)
    : String.fromCharCode(104 - col) + (row + 1)) as Square;
}

function sort32(arr: Uint8Array): void {
  for (let i = 1; i < 32; i++) {
    const v = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j] > v) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = v;
  }
}

/**
 * High-precision board-wide background RGB extraction with zero heap allocations.
 * Samples top-right safe zone across all 64 squares, computes trimmed-mean base colors
 * for light and dark squares, cancelling procedural grain oscillations while preserving move highlights.
 */
function extractBoardBackgrounds(data: Uint8ClampedArray, W: number, H: number): void {
  const stepX = W / 8;
  const stepY = H / 8;
  let lightCount = 0;
  let darkCount = 0;

  for (let r = 0; r < 8; r++) {
    const py = Math.floor((r + 0.116) * stepY);
    const rowOffset = py * W;
    for (let c = 0; c < 8; c++) {
      const px = Math.floor((c + 0.885) * stepX);
      const offset = (rowOffset + px) * 4;
      const idx = (r << 3) | c;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      boardBgR[idx] = red;
      boardBgG[idx] = green;
      boardBgB[idx] = blue;

      if ((r + c) & 1) {
        darkSamplesR[darkCount] = red;
        darkSamplesG[darkCount] = green;
        darkSamplesB[darkCount] = blue;
        darkCount++;
      } else {
        lightSamplesR[lightCount] = red;
        lightSamplesG[lightCount] = green;
        lightSamplesB[lightCount] = blue;
        lightCount++;
      }
    }
  }

  sort32(lightSamplesR); sort32(lightSamplesG); sort32(lightSamplesB);
  sort32(darkSamplesR); sort32(darkSamplesG); sort32(darkSamplesB);

  let sumLR = 0, sumLG = 0, sumLB = 0;
  let sumDR = 0, sumDG = 0, sumDB = 0;
  for (let i = 2; i < 30; i++) {
    sumLR += lightSamplesR[i]; sumLG += lightSamplesG[i]; sumLB += lightSamplesB[i];
    sumDR += darkSamplesR[i]; sumDG += darkSamplesG[i]; sumDB += darkSamplesB[i];
  }
  const baseLightR = Math.round(sumLR / 28);
  const baseLightG = Math.round(sumLG / 28);
  const baseLightB = Math.round(sumLB / 28);
  const baseDarkR = Math.round(sumDR / 28);
  const baseDarkG = Math.round(sumDG / 28);
  const baseDarkB = Math.round(sumDB / 28);

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const idx = (r << 3) | c;
      const isDark = (r + c) & 1;
      const bR = isDark ? baseDarkR : baseLightR;
      const bG = isDark ? baseDarkG : baseLightG;
      const bB = isDark ? baseDarkB : baseLightB;

      const dr = boardBgR[idx] - bR;
      const dg = boardBgG[idx] - bG;
      const db = boardBgB[idx] - bB;
      const distSq = dr * dr + dg * dg + db * db;
      if (distSq <= 784) { // 28^2
        boardBgR[idx] = bR;
        boardBgG[idx] = bG;
        boardBgB[idx] = bB;
      }
    }
  }
}

/**
 * Computes high-frequency gradient energy E = sum ||nabla I|| / N inside the cell.
 * Empty cells with uniform highlights have E ~ 0.
 * Any piece silhouette has high-contrast edges with normalized E >= 1.20 across all resolutions (and on Wood theme >= 9.5).
 */
export function getGradientEnergy(data: Uint8ClampedArray, row: number, col: number, stepX: number, stepY: number, W: number): number {
  const minX = Math.floor((col + 0.14) * stepX);
  const maxX = Math.floor((col + 0.86) * stepX);
  const minY = Math.floor((row + 0.14) * stepY);
  const maxY = Math.floor((row + 0.86) * stepY);
  const step = stepX >= 256 ? 2 : 1;
  const stride = W * 4 * step;
  const dx = step * 4;
  let totalGrad = 0;
  let count = 0;

  for (let y = minY; y < maxY - step; y += step) {
    let idx = (y * W + minX) * 4;
    for (let x = minX; x < maxX - step; x += step, idx += dx) {
      const idxR = idx + dx;
      const idxD = idx + stride;

      const luma = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
      const lumaR = (data[idxR] * 77 + data[idxR + 1] * 150 + data[idxR + 2] * 29) >> 8;
      const lumaD = (data[idxD] * 77 + data[idxD + 1] * 150 + data[idxD + 2] * 29) >> 8;

      totalGrad += Math.abs(lumaR - luma) + Math.abs(lumaD - luma);
      count++;
    }
  }

  return count > 0 ? (totalGrad / count) * (stepX / (64 * step)) : 0;
}

interface FeatureStats {
  countShape: number;
  avgLuma: number;
}

/**
 * Zero-allocation feature extraction into outVector.
 * Direct byte offset buffer access, early distance-squared thresholds avoiding Math.sqrt,
 * and computation of shape energy + average foreground luminance.
 */
function extractFeatureInto(image: PixelImage, row: number, col: number, outVector: Float32Array): FeatureStats {
  const stepX = image.width / 8;
  const stepY = image.height / 8;
  const W = image.width;
  const data = image.data;
  const cellIdx = (row << 3) | col;
  const bgR = boardBgR[cellIdx];
  const bgG = boardBgG[cellIdx];
  const bgB = boardBgB[cellIdx];

  let vIdx = 0;
  let sumTone = 0;
  let countShape = 0;

  for (let y = 0; y < FEATURE_SIZE; y++) {
    for (let x = 0; x < FEATURE_SIZE; x++) {
      let shape = 0;
      let tone = 0;
      for (let dy = 0; dy < 4; dy++) {
        const sy = y * 4 + dy;
        const ay = NORM_COORD[sy];
        const py = Math.floor((row + ay) * stepY);
        const rowOffset = py * W;
        for (let dx = 0; dx < 4; dx++) {
          const sx = x * 4 + dx;
          const ax = NORM_COORD[sx];
          const px = Math.floor((col + ax) * stepX);

          const idx = (rowOffset + px) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];

          const dr = r - bgR;
          const dg = g - bgG;
          const db = b - bgB;
          const distSq = dr * dr + dg * dg + db * db;

          // Fast early pruning: if pixel matches background / texture noise, mask is 0
          if (distSq <= NOISE_FLOOR_SQ) continue;

          let mask: number;
          if (distSq >= SATURATION_FLOOR_SQ) {
            mask = 1;
          } else {
            mask = (Math.sqrt(distSq) - NOISE_FLOOR) * MASK_INV_SPAN;
          }

          const luma = (r * 0.2126 + g * 0.7152 + b * 0.0722) * (1 / 255);
          shape += mask;
          tone += luma * mask;
          sumTone += luma * mask;
          countShape += mask;
        }
      }
      outVector[vIdx++] = shape * (1 / 16);
      outVector[vIdx++] = tone * (1 / 16);
    }
  }

  const avgLuma = countShape > 0 ? (sumTone / countShape) : 0;
  return { countShape, avgLuma };
}

export function feature(image: PixelImage, row: number, col: number): number[] {
  extractBoardBackgrounds(image.data, image.width, image.height);
  const v = new Float32Array(VECTOR_LEN);
  extractFeatureInto(image, row, col, v);
  return Array.from(v);
}

function distance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

export function calibrate(image: PixelImage, fen: string, orientation: Orientation): TemplateSet {
  validImage(image);
  extractBoardBackgrounds(image.data, image.width, image.height);
  const board = new Chess(validateTrustedFen(fen));
  const templates: TemplateSet['templates'] = [];
  const tempVec = new Float32Array(VECTOR_LEN);

  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const piece = board.get(screenSquare(row, col, orientation));
    const label = piece ? (piece.color === 'w' ? piece.type.toUpperCase() : piece.type) as PieceLabel : '.';
    extractFeatureInto(image, row, col, tempVec);
    templates.push({ label, vector: Array.from(tempVec) });
  }

  const missing = LABELS.filter(label => !templates.some(t => t.label === label));
  if (missing.length) throw new Error('Для калибровки нужны все 12 видов фигур и пустые клетки. Используйте начальную позицию той же темы.');

  const limits = {} as Record<Label, number>;
  for (const label of LABELS) {
    let nearestOther = Infinity;
    for (const a of templates.filter(t => t.label === label)) for (const b of templates.filter(t => t.label !== label)) {
      nearestOther = Math.min(nearestOther, distance(a.vector, b.vector));
    }
    if (nearestOther < 0.035) throw new Error('Фигуры в калибровке неразличимы. Проверьте область, FEN и ориентацию.');
    limits[label] = Math.min(0.12, nearestOther * 0.49);
  }

  return { version: 1, imageSize: { width: image.width, height: image.height }, templates, limits };
}

interface TemplateVariants {
  base: Float32Array;
  shifts: Float32Array[];
}

interface CompiledGroup {
  label: Label;
  isWhite: boolean;
  templates: TemplateVariants[];
}

interface CompiledSet {
  groups: CompiledGroup[];
}

const templateCache = new WeakMap<TemplateSet, CompiledSet>();

/**
 * Precomputes spatial shifts (dx, dy in [-1, 0, 1]) for subpixel crop robustness.
 * This guarantees invariance to 1-2px edge shifts on extreme corners (a1, h1, a8, h8).
 */
function createShiftedVariants(v: Float32Array): TemplateVariants {
  const shifts: Float32Array[] = [];
  for (const dy of [-1, 0, 1]) {
    for (const dx of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue;
      const s = new Float32Array(VECTOR_LEN);
      for (let y = 0; y < FEATURE_SIZE; y++) {
        const ty = y + dy;
        if (ty < 0 || ty >= FEATURE_SIZE) continue;
        for (let x = 0; x < FEATURE_SIZE; x++) {
          const tx = x + dx;
          if (tx < 0 || tx >= FEATURE_SIZE) continue;
          const srcIdx = (ty * FEATURE_SIZE + tx) * 2;
          const dstIdx = (y * FEATURE_SIZE + x) * 2;
          s[dstIdx] = v[srcIdx];
          s[dstIdx + 1] = v[srcIdx + 1];
        }
      }
      shifts.push(s);
    }
  }
  return { base: v, shifts };
}

function getCompiledTemplates(set: TemplateSet): CompiledSet {
  let cached = templateCache.get(set);
  if (cached) return cached;

  const groups: CompiledGroup[] = [];
  for (const label of LABELS) {
    const list: TemplateVariants[] = [];
    for (const t of set.templates) {
      if (t.label === label) {
        list.push(createShiftedVariants(new Float32Array(t.vector)));
      }
    }
    const isWhite = label !== '.' && label === label.toUpperCase();
    groups.push({ label, isWhite, templates: list });
  }

  cached = { groups };
  templateCache.set(set, cached);
  return cached;
}

function compactPlacement(cells: RecognizedCell[]): string {
  const bySquare = new Map(cells.map(cell => [cell.square, cell.piece]));
  return Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, col) =>
    bySquare.get(screenSquare(row, col, 'white')) ?? '.').join('').replace(/\.+/g, v => String(v.length))).join('/');
}

export function recognize(image: PixelImage, set: TemplateSet, orientation: Orientation): Recognition {
  validImage(image);
  if (set?.imageSize && (set.imageSize.width !== image.width || set.imageSize.height !== image.height)) {
    throw new Error('Масштаб доски изменился. Выберите область и обучите фигуры заново.');
  }
  if (!set || set.version !== 1 || !LABELS.every(label => set.templates.some(t => t.label === label) &&
      Number.isFinite(set.limits[label]) && set.limits[label] > 0)) throw new Error('Сначала откалибруйте распознавание.');

  extractBoardBackgrounds(image.data, image.width, image.height);
  const compiled = getCompiledTemplates(set);
  const cells: RecognizedCell[] = [];
  const stepX = image.width / 8;
  const stepY = image.height / 8;
  const W = image.width;
  const data = image.data;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = screenSquare(row, col, orientation);
      const energy = getGradientEnergy(data, row, col, stepX, stepY, W);

      // Occupancy Gate:
      // High-frequency gradient energy E on empty squares (including all highlights and borders) is <= 0.3.
      // Even the lowest-contrast piece (white queen on light square) has E >= 1.61.
      if (energy < 0.6) {
        cells.push({ square, piece: null, confident: true, confidence: 1.0 });
        continue;
      }

      // Feature extraction with zero allocation
      const feat = extractFeatureInto(image, row, col, SCRATCH_VECTOR);

      // If background subtraction leaves no foreground, cell is unconditionally empty
      if (feat.countShape < 1.0) {
        cells.push({ square, piece: null, confident: true, confidence: 1.0 });
        continue;
      }

      // Polarity / Color Gate:
      // Determines whether the piece is white or black from its foreground luminance.
      // White pieces have bright bodies (avgLuma > 0.40); black pieces have dark bodies (avgLuma <= 0.40).
      const pieceIsWhite = feat.avgLuma > 0.40;

      let bestLabel: Label = '.';
      let bestError = Infinity;
      let runnerError = Infinity;

      for (let g = 0; g < compiled.groups.length; g++) {
        const group = compiled.groups[g];
        const label = group.label;

        // Apply Polarity Gate penalty to opposite color to prevent black pawn / white king confusion
        let polarityPenalty = 0;
        if (label !== '.') {
          if (group.isWhite !== pieceIsWhite) {
            polarityPenalty = 0.50;
          }
        }

        let minGroupErrorSq = Infinity;
        for (let t = 0; t < group.templates.length; t++) {
          const item = group.templates[t];
          // 1. Evaluate base unshifted template (0, 0)
          let sumSq = 0;
          const baseVec = item.base;
          for (let i = 0; i < VECTOR_LEN; i++) {
            const d = SCRATCH_VECTOR[i] - baseVec[i];
            sumSq += d * d;
            if (sumSq >= minGroupErrorSq * VECTOR_LEN) break; // Early exit pruning
          }
          let errSq = sumSq * INV_VECTOR_LEN;
          if (errSq < minGroupErrorSq) minGroupErrorSq = errSq;

          // 2. If unshifted match is already close (errSq < 0.003), skip checking shifted variants
          if (errSq < 0.003) continue;

          // 3. Otherwise evaluate shifted variants for crop/boundary shift tolerance
          for (let s = 0; s < item.shifts.length; s++) {
            const shiftVec = item.shifts[s];
            let shiftSumSq = 0;
            for (let i = 0; i < VECTOR_LEN; i++) {
              const d = SCRATCH_VECTOR[i] - shiftVec[i];
              shiftSumSq += d * d;
              if (shiftSumSq >= minGroupErrorSq * VECTOR_LEN) break;
            }
            const sErrSq = shiftSumSq * INV_VECTOR_LEN;
            if (sErrSq < minGroupErrorSq) minGroupErrorSq = sErrSq;
          }
        }

        const err = Math.sqrt(minGroupErrorSq) + polarityPenalty;
        if (err < bestError) {
          runnerError = bestError;
          bestError = err;
          bestLabel = label;
        } else if (err < runnerError) {
          runnerError = err;
        }
      }

      const limit = set.limits[bestLabel];
      const confident = bestError <= limit && bestError < runnerError * 0.65;
      cells.push({
        square,
        piece: bestLabel === '.' ? null : bestLabel,
        confident,
        confidence: confident ? Math.max(0, 1 - bestError / (limit * 2)) : 0,
      });
    }
  }

  const confident = cells.every(cell => cell.confident);
  return {
    placement: confident ? compactPlacement(cells) : null,
    cells,
    confident,
    fingerprint: imageFingerprint(image),
  };
}

function sampleImage(image: PixelImage): Uint8Array {
  const sample = STATIC_SAMPLE_BUFFER;
  const data = image.data;
  const W = image.width;
  const H = image.height;
  const scaleX = W / STABILITY_SIZE;
  const scaleY = H / STABILITY_SIZE;
  let outIdx = 0;

  for (let y = 0; y < STABILITY_SIZE; y++) {
    const py = Math.min(H - 1, Math.floor((y + 0.5) * scaleY));
    const rowOffset = py * W;
    for (let x = 0; x < STABILITY_SIZE; x++) {
      const px = Math.min(W - 1, Math.floor((x + 0.5) * scaleX));
      const idx = (rowOffset + px) * 4;
      sample[outIdx++] = data[idx];
      sample[outIdx++] = data[idx + 1];
      sample[outIdx++] = data[idx + 2];
    }
  }

  return sample;
}

function fingerprint(data: Uint8Array, width: number, height: number): string {
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data[i], 16777619);
  return `${width}x${height}:${(hash >>> 0).toString(16)}`;
}

export function imageFingerprint(image: PixelImage): string {
  validImage(image);
  return fingerprint(sampleImage(image), image.width, image.height);
}

export interface StabilityResult { stable: boolean; changed: boolean; fingerprint: string }

/** Pixel-level gate, deliberately independent of the recognizer's labels.
 * The first changed frame withdraws a signal; only three matching observations
 * spanning at least 200ms release a new board for recognition/analysis. */
export class FrameStabilityGate {
  private anchor: Uint8Array | null = null;
  private width = 0;
  private height = 0;
  private since = 0;
  private count = 0;
  private lastNow = 0;
  private key = '';

  reset(): void { this.anchor = null; this.count = 0; this.key = ''; }

  observe(image: PixelImage, now = Date.now()): StabilityResult {
    validImage(image);
    const current = sampleImage(image);
    let changed = !this.anchor || image.width !== this.width || image.height !== this.height || now < this.lastNow;
    if (!changed && this.anchor) {
      const cellSums = new Float64Array(64);
      let total = 0;
      for (let y = 0; y < STABILITY_SIZE; y++) for (let x = 0; x < STABILITY_SIZE; x++) {
        const i = (y * STABILITY_SIZE + x) * 3;
        const d = Math.abs(current[i] - this.anchor[i]) + Math.abs(current[i + 1] - this.anchor[i + 1]) + Math.abs(current[i + 2] - this.anchor[i + 2]);
        total += d; cellSums[Math.floor(y / 32) * 8 + Math.floor(x / 32)] += d;
      }
      changed = total / current.length > 0.8 || cellSums.some(v => v / (32 * 32 * 3) > 2.0);
    }
    if (changed) {
      this.anchor = current.slice(); this.width = image.width; this.height = image.height;
      this.since = now; this.count = 1; this.key = fingerprint(this.anchor, image.width, image.height);
    } else if (now > this.lastNow) this.count++;
    this.lastNow = now;
    return { changed, stable: this.count >= 3 && now - this.since >= 200, fingerprint: this.key };
  }
}
