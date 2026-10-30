'use client';

import { useId } from 'react';
import { reviewPresentation, hasVerifiedAdventure } from '@/lib/reviewPresentation';
import type { ReviewGame, ReviewMoveResult } from '@/types/gameReview';
import './eval-chart.css';

function whiteValue(move: ReviewMoveResult, initial = false): number | null {
  if (move.classification === 'unverified') return null;
  const cp = initial ? move.beforeCpWhite : move.afterCpWhite;
  if (cp !== null && Number.isFinite(cp)) return Math.max(-8, Math.min(8, cp / 100));
  const score = initial ? move.beforeScore : move.playedScore;
  if (score?.kind === 'mate' && Number.isFinite(score.value) && score.value !== 0) return Math.sign(score.value) * (move.color === 'w' ? 8 : -8);
  return null;
}

export function EvalChart({ game, results, selectedPly, onSelect }: {
  game: ReviewGame; results: ReviewMoveResult[]; selectedPly: number; onSelect: (ply: number) => void;
}) {
  const titleId = useId();
  const width = 600; const height = 128; const pad = 10;
  const x = (ply: number) => pad + (ply / Math.max(1, game.moves.length)) * (width - pad * 2);
  const y = (value: number) => height / 2 - value / 8 * (height / 2 - pad);
  const selected = game.moves[selectedPly - 1];
  const selectionLabel = selected ? `${selected.moveNumber}${selected.color === 'w' ? '.' : '…'} ${selected.san}` : 'Исходная позиция';
  const segments: { ply: number; value: number }[][] = [];
  let segment: { ply: number; value: number }[] = [];
  const initialValue = results[0]?.ply === 1 ? whiteValue(results[0], true) : null;
  if (initialValue !== null) segment.push({ ply: 0, value: initialValue });
  for (const move of results) {
    const value = whiteValue(move);
    if (value === null || (segment.length && segment[segment.length - 1].ply !== move.ply - 1)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (value !== null) segment.push({ ply: move.ply, value });
  }
  if (segment.length) segments.push(segment);
  const line = (points: typeof segment) => points.map((point, index) => `${index ? 'L' : 'M'}${x(point.ply).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
  const selectedResult = results.find(move => move.ply === selectedPly);
  const selectedValue = selectedPly === 0 ? initialValue : selectedResult ? whiteValue(selectedResult) : null;
  return <div className="analysis-chart" aria-label="График оценки за белых">
    <div className="analysis-chart-label"><span>Оценка за белых</span><span>+8 / −8</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="slider" tabIndex={0} aria-labelledby={titleId} aria-valuemin={0} aria-valuemax={game.moves.length} aria-valuenow={selectedPly} aria-valuetext={selectionLabel} aria-orientation="horizontal" onKeyDown={event => {
      let next: number;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, selectedPly - 1);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(game.moves.length, selectedPly + 1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = game.moves.length;
      else return;
      event.preventDefault(); event.stopPropagation(); onSelect(next);
    }} onClick={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (!bounds.width) return;
      const localX = (event.clientX - bounds.left) / bounds.width * width;
      onSelect(Math.max(0, Math.min(game.moves.length, Math.round((localX - pad) / (width - pad * 2) * game.moves.length))));
    }}>
      <title id={titleId}>Оценка позиции. Выбери ход на графике или стрелками клавиатуры.</title>
      <rect width={width} height={height} className="analysis-chart-dark" />
      {segments.filter(points => points.length > 1).map((points, index) => <path key={index} d={`${line(points)} L${x(points[points.length - 1].ply).toFixed(2)},${height} L${x(points[0].ply).toFixed(2)},${height} Z`} className="analysis-chart-area" />)}
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} className="analysis-chart-zero" />
      {segments.map((points, index) => <path key={index} d={line(points)} fill="none" className="analysis-chart-line" strokeWidth="2" strokeLinejoin="round" />)}
      {results.filter(move => ['trilliant', 'brilliant', 'great', 'excellent', 'inaccuracy', 'mistake', 'miss', 'blunder'].includes(reviewPresentation(move).kind)).map(move => {
        const value = whiteValue(move); if (value === null) return null;
        return <circle key={move.ply} cx={x(move.ply)} cy={y(value)} r="4.5" className={`analysis-chart-dot is-${reviewPresentation(move).kind}`}><title>{move.moveNumber}{move.color === 'w' ? '.' : '…'} {move.san} · {reviewPresentation(move).label}{hasVerifiedAdventure(move) ? ' · Авантюрный' : ''}</title></circle>;
      })}
      <line x1={x(selectedPly)} y1="0" x2={x(selectedPly)} y2={height} className="analysis-chart-cursor" strokeWidth="2" />
      {selectedValue !== null && <circle cx={x(selectedPly)} cy={y(selectedValue)} r="5" className="analysis-chart-current" />}
    </svg>
    <div className="analysis-chart-label"><span>{selectionLabel}</span><span>{game.moves.length} полуходов</span></div>
  </div>;
}
