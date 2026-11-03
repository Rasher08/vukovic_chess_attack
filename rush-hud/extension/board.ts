import { Chess, type Square } from 'chess.js';

export type PuzzleSide = 'auto' | 'white' | 'black';
export interface BoardSnapshot {
  board: HTMLElement;
  placement: string;
  orientation: 'white' | 'black';
  animationMs: number;
  key: string;
}

export function puzzleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^(www\.)?chess\.com$/.test(url.hostname) && /^\/puzzles(?:\/|$)/.test(url.pathname);
  } catch { return false; }
}

function visible(node: Element, win: Window): boolean {
  const rect = node.getBoundingClientRect(), style = win.getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && style.display !== 'none' && style.opacity !== '0' && !node.closest('[hidden],[aria-hidden="true"]');
}

/** Board DOM only: no puzzle solution, page app state or network payload access. */
export function readBoard(doc: Document, href: string): BoardSnapshot | null {
  const win = doc.defaultView;
  if (!win || !puzzleUrl(href) || doc.visibilityState === 'hidden') return null;
  const boards = Array.from(doc.querySelectorAll<HTMLElement>('wc-chess-board, chess-board')).filter(node => visible(node, win));
  if (boards.length !== 1) return null;
  const board = boards[0], rect = board.getBoundingClientRect();
  if (Math.abs(rect.width - rect.height) > 4 || rect.width < 160 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= win.innerHeight || rect.left >= win.innerWidth) return null;
  if (board.querySelector('.dragging,.drag-piece,.piece.drag,.piece.animating') || board.matches('.dragging,.animating')) return null;
  if (typeof board.getAnimations === 'function' && board.getAnimations({ subtree: true }).some(animation => animation.playState === 'running' && !(animation.effect instanceof KeyframeEffect && animation.effect.target instanceof Element && animation.effect.target.closest('[data-rush-hud]')))) return null;
  const squares = new Map<string, string>();
  for (const piece of Array.from(board.querySelectorAll<HTMLElement>('.piece'))) {
    if (!visible(piece, win) || piece.matches('.ghost,.dragging,.drag-piece')) return null;
    const codes = Array.from(piece.classList).filter(name => /^[wb][kqrbnp]$/.test(name));
    const coords = Array.from(piece.classList).filter(name => /^square-[1-8][1-8]$/.test(name));
    if (codes.length !== 1 || coords.length !== 1) return null;
    const square = coords[0].slice(-2);
    if (squares.has(square)) return null;
    squares.set(square, codes[0][0] === 'w' ? codes[0][1].toUpperCase() : codes[0][1]);
  }
  let placement = '';
  for (let rank = 8; rank >= 1; rank--) {
    let gap = 0;
    for (let file = 1; file <= 8; file++) {
      const piece = squares.get(`${file}${rank}`);
      if (!piece) gap++;
      else { if (gap) placement += gap; gap = 0; placement += piece; }
    }
    if (gap) placement += gap;
    if (rank > 1) placement += '/';
  }
  if ([...squares.values()].filter(p => p === 'K').length !== 1 || [...squares.values()].filter(p => p === 'k').length !== 1) return null;
  const orientation = board.classList.contains('flipped') || board.getAttribute('orientation') === 'black' || board.getAttribute('data-orientation') === 'black' ? 'black' : 'white';
  const value = win.getComputedStyle(board).getPropertyValue('--move-animation-duration').trim();
  const duration = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(value);
  const animationMs = duration ? Math.min(2000, Number(duration[1]) * (duration[2] === 's' ? 1000 : 1)) : 180;
  return { board, placement, orientation, animationMs, key: orientation + ':' + placement };
}

/** Starts without guessed castling/EP rights. Known moves preserve exact state. */
export class PuzzleTracker {
  private chess: Chess | null = null;
  private previousKey = '';
  private orientation: BoardSnapshot['orientation'] | null = null;
  private side: PuzzleSide = 'auto';
  reset() { this.chess = null; this.previousKey = ''; this.orientation = null; }
  setSide(side: PuzzleSide) { if (side !== this.side) { this.side = side; this.reset(); } }
  observe(snapshot: BoardSnapshot): { fen: string | null; ownTurn: boolean; newPuzzle: boolean } {
    const player = (this.side === 'auto' ? snapshot.orientation : this.side) === 'white' ? 'w' : 'b';
    if (this.chess && snapshot.key === this.previousKey) return { fen: this.chess.fen(), ownTurn: this.chess.turn() === player, newPuzzle: false };
    if (this.chess && this.orientation === snapshot.orientation) {
      const candidates: string[] = [];
      for (const move of this.chess.moves({ verbose: true })) {
        this.chess.move(move);
        if (this.chess.fen().split(' ')[0] === snapshot.placement) candidates.push(this.chess.fen());
        this.chess.undo();
      }
      if (candidates.length === 1) {
        this.chess = new Chess(candidates[0]); this.previousKey = snapshot.key;
        return { fen: this.chess.fen(), ownTurn: this.chess.turn() === player, newPuzzle: false };
      }
    }
    try {
      this.chess = new Chess(`${snapshot.placement} ${player} - - 0 1`);
      this.previousKey = snapshot.key; this.orientation = snapshot.orientation;
      return { fen: this.chess.fen(), ownTurn: true, newPuzzle: true };
    } catch { this.reset(); return { fen: null, ownTurn: false, newPuzzle: false }; }
  }
}

export function squarePoint(square: string, orientation: 'white' | 'black'): [number, number] {
  const file = square.charCodeAt(0) - 97, rank = Number(square[1]) - 1;
  return orientation === 'white' ? [(file + .5) * 100, (7 - rank + .5) * 100] : [(7 - file + .5) * 100, (rank + .5) * 100];
}

export function legalArrow(fen: string, move: unknown): move is string {
  if (typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) return false;
  try { return !!new Chess(fen).move({ from: move.slice(0, 2) as Square, to: move.slice(2, 4) as Square, ...(move[4] ? { promotion: move[4] } : {}) }); }
  catch { return false; }
}
