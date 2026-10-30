'use client';

import { useEffect, useRef, useState } from 'react';
import type { Square } from 'chess.js';
import { ChessboardWrapper } from '@/components/chess/ChessboardWrapper';
import { REVIEW_DISPLAY_LABELS, hasVerifiedAdventure, type ReviewBookMove } from '@/lib/reviewPresentation';
import { ReviewGradeSymbol } from './ReviewGradeSymbol';
import { reviewMoveBadge, reviewSquareCoordinates } from '@/lib/reviewBoard';
import type { ReviewMoveResult, ReviewPly } from '@/types/gameReview';
import './review-board.css';

interface Geometry { left: number; top: number; cell: number; orientation: 'white' | 'black' }

export function ReviewBoard({ position, orientation, move, result, evaluation, percentage, book, customArrows = [] }: {
  position: string;
  orientation: 'white' | 'black';
  move?: ReviewPly;
  result?: ReviewMoveResult;
  evaluation: string;
  percentage: number | null;
  book?: ReviewBookMove;
  customArrows?: [Square, Square, string?][];
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const badge = reviewMoveBadge(position, move, result, book);
  const coordinate = badge ? reviewSquareCoordinates(badge.square, orientation) : null;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // The shared board centers a board eight pixels narrower than its wrapper.
    // Read a real square rather than guessing that inset or the final board size.
    const measure = () => {
      const anchor = stage.querySelector<HTMLElement>('[data-square="a1"]');
      if (!anchor) return;
      const cell = anchor.getBoundingClientRect();
      const parent = stage.getBoundingClientRect();
      if (cell.width <= 0) return;
      const origin = reviewSquareCoordinates('a1', orientation)!;
      const next = {
        left: cell.left - parent.left - origin.column * cell.width,
        top: cell.top - parent.top - origin.row * cell.height,
        cell: cell.width, orientation,
      };
      setGeometry(previous => previous && previous.orientation === orientation &&
        Math.abs(previous.left - next.left) < .1 && Math.abs(previous.top - next.top) < .1 &&
        Math.abs(previous.cell - next.cell) < .1 ? previous : next);
    };
    measure();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resize?.observe(stage);
    // The board is mounted after hydration, so its squares may appear after this effect.
    const mount = new MutationObserver(measure);
    mount.observe(stage, { childList: true, subtree: true });
    return () => { resize?.disconnect(); mount.disconnect(); };
  }, [orientation, position]);

  const showBadge = badge && coordinate && geometry?.orientation === orientation;
  const adventurous = result && hasVerifiedAdventure(result);
  const size = geometry ? Math.max(16, Math.min(34, geometry.cell * .42)) : 0;
  const label = badge && move ? `Оценка хода ${move.san}: ${REVIEW_DISPLAY_LABELS[badge.classification]}` : '';

  return <div className="analysis-board-wrap review-board">
    <div className="analysis-eval review-board-eval" aria-label={`Оценка за белых: ${evaluation}`}>
      {percentage !== null && <div className="analysis-eval-white" style={{ height: `${percentage}%`, ...(orientation === 'black' ? { top: 0, bottom: 'auto' } : {}) }} />}
      <span>{evaluation}</span>
    </div>
    <div ref={stageRef} className="review-board-stage">
      <ChessboardWrapper position={position} orientation={orientation} boardWidth={640}
        isInteractive={false} showLegalMoves={false} playSoundEffects={false} customArrows={customArrows}
        lastMove={move ? { from: move.uci.slice(0, 2) as Square, to: move.uci.slice(2, 4) as Square } : null} />
      {showBadge && <span className={`review-piece-badge analysis-badge is-${badge.classification}`}
        role="img" aria-label={label} title={label} data-review-square={badge.square}
        style={{ left: geometry.left + (coordinate.column + .79) * geometry.cell,
          top: geometry.top + (coordinate.row + .21) * geometry.cell,
          width: size, height: size, fontSize: Math.max(11, size * .55) }}><ReviewGradeSymbol kind={badge.classification} /></span>}
      {showBadge && adventurous && <span className="review-piece-adventure analysis-adventure-mark" role="img" aria-label="Авантюрная жертва: основная оценка ошибки сохраняется" style={{ left: geometry.left + (coordinate.column + .78) * geometry.cell, top: geometry.top + (coordinate.row + .8) * geometry.cell, fontSize: Math.max(8, geometry.cell * .16) }}>!??</span>}
    </div>
  </div>;
}
