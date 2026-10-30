import { Chess, type Square } from 'chess.js';
import { validateTrustedFen } from './position';

export interface PixelImage { width: number; height: number; data: Uint8ClampedArray }
export type Orientation = 'white' | 'black';
export type PieceLabel = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type Label = PieceLabel | '.';
export interface TemplateSet {
  version: 1;
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
const STABILITY_SIZE = 256;

function validImage(image: PixelImage): void {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 128 || image.height < 128 ||
      image.width > 8192 || image.height > 8192 || Math.abs(image.width / image.height - 1) > 0.015 ||
      image.data.length !== image.width * image.height * 4) throw new Error('Выберите точный квадрат доски, без рамки и подписей снаружи.');
}

export function screenSquare(row: number, col: number, orientation: Orientation): Square {
  return (orientation === 'white' ? String.fromCharCode(97 + col) + (8 - row)
    : String.fromCharCode(104 - col) + (row + 1)) as Square;
}

function pixel(image: PixelImage, x: number, y: number): number[] {
  const index = (Math.max(0, Math.min(image.height - 1, Math.floor(y))) * image.width +
    Math.max(0, Math.min(image.width - 1, Math.floor(x)))) * 4;
  return [image.data[index], image.data[index + 1], image.data[index + 2]];
}

function median(values: number[]): number { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; }

function feature(image: PixelImage, row: number, col: number): number[] {
  const width = image.width / 8; const height = image.height / 8;
  const corners: number[][] = [];
  // The median ignores coordinate glyphs in one corner. Colored move-square
  // highlights become background, while arrows/drag ghosts remain outliers.
  for (const y of [0.055, 0.10, 0.90, 0.945]) for (const x of [0.055, 0.10, 0.90, 0.945]) {
    corners.push(pixel(image, (col + x) * width, (row + y) * height));
  }
  const bg = [0, 1, 2].map(c => median(corners.map(p => p[c])));
  const vector: number[] = [];
  for (let y = 0; y < FEATURE_SIZE; y++) for (let x = 0; x < FEATURE_SIZE; x++) {
    let shape = 0; let tone = 0;
    // Integrate a feature cell rather than choosing one nearest pixel. This
    // avoids changing a bishop into an unknown shape at a new Retina scale.
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const absoluteX = 0.06 + (x + (dx + 0.5) / 4) / FEATURE_SIZE * 0.88;
      const absoluteY = 0.06 + (y + (dy + 0.5) / 4) / FEATURE_SIZE * 0.88;
      const p = pixel(image, (col + absoluteX) * width, (row + absoluteY) * height);
      const delta = Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]);
      // Ignore react-chessboard's rank/file notation in corner boxes.
      const notationCorner = (absoluteX < 0.21 && absoluteY < 0.23) || (absoluteX > 0.79 && absoluteY > 0.77);
      const mask = notationCorner ? 0 : Math.min(1, Math.max(0, (delta - 12) / 24));
      // Absolute luminance preserves the difference between white and black.
      const luma = (p[0] * 0.2126 + p[1] * 0.7152 + p[2] * 0.0722) / 255;
      shape += mask; tone += luma * mask;
    }
    vector.push(shape / 16, tone / 16);
  }
  return vector;
}

function distance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0; for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / a.length);
}

/** Local theme-specific calibration; the user must check the labels before
 * calling. An initial chess position contains all twelve required templates. */
export function calibrate(image: PixelImage, fen: string, orientation: Orientation): TemplateSet {
  validImage(image);
  const board = new Chess(validateTrustedFen(fen));
  const templates: TemplateSet['templates'] = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const piece = board.get(screenSquare(row, col, orientation));
    const label = piece ? (piece.color === 'w' ? piece.type.toUpperCase() : piece.type) as PieceLabel : '.';
    templates.push({ label, vector: feature(image, row, col) });
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
    limits[label] = Math.min(0.11, nearestOther * 0.46);
  }
  return { version: 1, templates, limits };
}

function compactPlacement(cells: RecognizedCell[]): string {
  const bySquare = new Map(cells.map(cell => [cell.square, cell.piece]));
  return Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, col) =>
    bySquare.get(screenSquare(row, col, 'white')) ?? '.').join('').replace(/\.+/g, v => String(v.length))).join('/');
}

export function recognize(image: PixelImage, set: TemplateSet, orientation: Orientation): Recognition {
  validImage(image);
  if (!set || set.version !== 1 || !LABELS.every(label => set.templates.some(t => t.label === label) &&
      Number.isFinite(set.limits[label]) && set.limits[label] > 0)) throw new Error('Сначала откалибруйте распознавание.');
  const cells: RecognizedCell[] = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const vector = feature(image, row, col);
    const ranks = LABELS.map(label => ({ label, error: Math.min(...set.templates.filter(t => t.label === label).map(t => distance(vector, t.vector))) }))
      .sort((a, b) => a.error - b.error);
    const [best, runner] = ranks;
    const limit = set.limits[best.label];
    const confident = best.error <= limit && best.error < runner.error * 0.65;
    cells.push({ square: screenSquare(row, col, orientation), piece: best.label === '.' ? null : best.label,
      confident, confidence: confident ? Math.max(0, 1 - best.error / (limit * 2)) : 0 });
  }
  const confident = cells.every(cell => cell.confident);
  return { placement: confident ? compactPlacement(cells) : null, cells, confident, fingerprint: imageFingerprint(image) };
}

function sampleImage(image: PixelImage): Uint8Array {
  const sample = new Uint8Array(STABILITY_SIZE * STABILITY_SIZE * 3);
  let i = 0;
  for (let y = 0; y < STABILITY_SIZE; y++) for (let x = 0; x < STABILITY_SIZE; x++) {
    const p = pixel(image, (x + 0.5) * image.width / STABILITY_SIZE, (y + 0.5) * image.height / STABILITY_SIZE);
    sample[i++] = p[0]; sample[i++] = p[1]; sample[i++] = p[2];
  }
  return sample;
}

function fingerprint(data: Uint8Array, width: number, height: number): string {
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data[i], 16777619);
  return `${width}x${height}:${(hash >>> 0).toString(16)}`;
}

export function imageFingerprint(image: PixelImage): string { validImage(image); return fingerprint(sampleImage(image), image.width, image.height); }

export interface StabilityResult { stable: boolean; changed: boolean; fingerprint: string }

/** Pixel-level gate, deliberately independent of the recognizer's labels.
 * The first changed frame withdraws a signal; only three matching observations
 * spanning at least 800ms release a new board for recognition/analysis. */
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
      this.anchor = current; this.width = image.width; this.height = image.height;
      this.since = now; this.count = 1; this.key = fingerprint(current, image.width, image.height);
    } else if (now > this.lastNow) this.count++;
    this.lastNow = now;
    return { changed, stable: this.count >= 3 && now - this.since >= 800, fingerprint: this.key };
  }
}
