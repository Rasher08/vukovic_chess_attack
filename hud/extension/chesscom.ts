import type { RecordedMove } from '../core/moveHistory';
import { normalizeSan } from '../core/moveHistory';

export interface MoveObservation { game: string; moves: RecordedMove[]; currentPly: number | null; ready: boolean }

function notation(node: Element): string {
  function read(n: Node): string {
    if (n.nodeType === 3) return n.textContent || '';
    if (!(n instanceof Element)) return '';
    if (n.matches('.annotation, .move-time, .timestamp, .cc-tooltip-component, [data-glyph]')) return '';
    const figurine = n.getAttribute('data-figurine');
    if (figurine && /^[kqrbnp]$/i.test(figurine)) return figurine.toUpperCase() === 'P' ? '' : figurine.toUpperCase();
    return Array.from(n.childNodes).map(read).join('');
  }
  return normalizeSan(read(node.querySelector('.node-highlight-content') || node));
}

/** Reads only the numbered main-line list. Never read engine variations, chess
 * app internals, network traffic, board pixels, evaluations or recommendations.
 * Selectors verified on Chess.com's wc-move-list on 2026-10-31. */
export function extractChesscom(doc: Document, href: string): MoveObservation {
  const url = new URL(href);
  const empty: MoveObservation = { game: url.origin + url.pathname, moves: [], currentPly: null, ready: false };
  if (url.protocol !== 'https:' || !/^(www\.)?chess\.com$/.test(url.hostname)) return empty;
  const lists = Array.from(doc.querySelectorAll('wc-move-list, wc-simple-move-list, wc-vertical-move-list, .vertical-move-list-component'))
    .filter(e => e.getClientRects().length && !e.closest('[hidden], [aria-hidden="true"]') &&
      doc.defaultView?.getComputedStyle(e).visibility === 'visible');
  // Nested wrapper matches must not count the same panel twice.
  const roots = lists.filter(e => !lists.some(other => other !== e && other.contains(e)));
  if (roots.length !== 1) return empty;
  const root = roots[0];
  const entries: { move: RecordedMove; node: Element }[] = [];
  try {
    const rows = Array.from(root.querySelectorAll('.main-line-row[data-whole-move-number]'));
    for (const row of rows) {
      const number = Number(row.getAttribute('data-whole-move-number'));
      if (!Number.isSafeInteger(number) || number < 1 || number > 1200) return empty;
      const nodes = Array.from(row.querySelectorAll('.main-line-ply'));
      if (!nodes.length) return empty;
      for (const node of nodes) {
        if (node.closest('.main-line-row') !== row) continue;
        const white = node.classList.contains('white-move'), black = node.classList.contains('black-move');
        if (white === black) return empty;
        entries.push({ move: { ply: number * 2 - (white ? 1 : 0), san: notation(node) }, node });
      }
    }
    if (!rows.length && root.querySelector('[data-node], .node, .move-list-row')) return empty;
  } catch { return empty; }
  const selected = entries.filter(({ node }) => node.matches('.selected, [aria-current="true"]') || node.querySelector('.selected, [aria-current="true"]'));
  if (selected.length > 1) return empty;
  let currentPly = selected[0]?.move.ply ?? null;
  if (currentPly === null) {
    // A language-independent navigation icon was observed on the actual site.
    const endButtons = Array.from(doc.querySelectorAll('[data-glyph="arrow-chevron-end"]')).map(e => e.closest('button'));
    const atEnd = endButtons.length === 1 && endButtons[0]?.disabled;
    if (atEnd) currentPly = Math.max(0, ...entries.map(e => e.move.ply));
  }
  return { ...empty, moves: entries.map(e => e.move).sort((a, b) => a.ply - b.ply), currentPly, ready: true };
}
