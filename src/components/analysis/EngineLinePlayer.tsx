'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CornerUpLeft, Pause, Play, SkipBack } from 'lucide-react';
import { buildEngineLine, type EngineLineStep } from '@/lib/engineLine';
import './engine-line-player.css';

export interface EngineLinePreview {
  fen: string;
  /** Zero is the position before the engine's first move. */
  index: number;
  move?: EngineLineStep;
}

interface EngineLinePlayerProps {
  fenBefore: string;
  moves: string[];
  /** Open the preview at its search root, with return-to-game enabled. */
  startAtRoot?: boolean;
  /** null restores the selected move of the actual game. */
  onPreview: (preview: EngineLinePreview | null) => void;
}

export function EngineLinePlayer({ fenBefore, moves, onPreview, startAtRoot = false }: EngineLinePlayerProps) {
  const line = useMemo(() => buildEngineLine(fenBefore, moves), [fenBefore, moves]);
  const identity = fenBefore + '|' + moves.join(' ') + '|' + startAtRoot;
  const previousIdentity = useRef<string | null>(null);
  const initialIndex = startAtRoot && line.steps.length ? 0 : null;
  const callbackRef = useRef(onPreview);
  callbackRef.current = onPreview;
  const timerRef = useRef<number | null>(null);
  const activeRef = useRef<number | null>(initialIndex);
  const [activeIndex, setActiveIndex] = useState<number | null>(initialIndex);
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setPlaying(false);
  }, []);

  const preview = useCallback((index: number | null, pause = true) => {
    if (pause) stop();
    if (index !== null && (index < 0 || index > line.steps.length)) return;
    activeRef.current = index;
    setActiveIndex(index);
    if (index === null) callbackRef.current(null);
    else if (index === 0) callbackRef.current({ fen: fenBefore, index });
    else {
      const move = line.steps[index - 1];
      if (move) callbackRef.current({ fen: move.fenAfter, index, move });
    }
  }, [fenBefore, line.steps, stop]);

  useEffect(() => {
    if (previousIdentity.current === identity) return;
    const firstMount = previousIdentity.current === null;
    previousIdentity.current = identity;
    stop();
    const index = startAtRoot && line.steps.length ? 0 : null;
    activeRef.current = index;
    setActiveIndex(index);
    // Ordinary players keep their existing board on mount; root previews opt in.
    if (!firstMount || startAtRoot) callbackRef.current(index === null ? null : { fen: fenBefore, index });
  }, [identity, startAtRoot, line.steps.length, fenBefore, stop]);

  useEffect(() => {
    if (!playing || !line.steps.length) return;
    const id = window.setInterval(() => {
      const nextIndex = (activeRef.current ?? 0) + 1;
      if (nextIndex > line.steps.length) { stop(); return; }
      preview(nextIndex, false);
      if (nextIndex === line.steps.length) stop();
    }, 900);
    timerRef.current = id;
    return () => {
      window.clearInterval(id);
      if (timerRef.current === id) timerRef.current = null;
    };
  }, [playing, line.steps.length, preview, stop]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
  }, []);

  function play() {
    if (!line.steps.length) return;
    if (playing) { stop(); return; }
    if (activeRef.current === null || activeRef.current >= line.steps.length) preview(0);
    setPlaying(true);
  }

  return <div className="engine-line-player" role="group" aria-label="Проигрывание линии движка" onKeyDown={event => {
    if (!line.steps.length || event.altKey || event.ctrlKey || event.metaKey) return;
    let index: number;
    if (event.key === 'ArrowLeft') index = Math.max(0, (activeRef.current ?? 0) - 1);
    else if (event.key === 'ArrowRight') index = Math.min(line.steps.length, (activeRef.current ?? 0) + 1);
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = line.steps.length;
    else return;
    event.preventDefault(); event.stopPropagation(); preview(index);
  }}>
    <div className="engine-line-controls">
      <button type="button" aria-label="Исходная позиция варианта" title="Исходная позиция варианта" disabled={!line.steps.length} onClick={() => preview(0)}><SkipBack size={13} aria-hidden="true" /></button>
      <button type="button" aria-label="Предыдущий ход варианта" title="Предыдущий ход варианта" disabled={activeIndex === null || activeIndex === 0} onClick={() => preview(Math.max(0, (activeRef.current ?? 0) - 1))}><ChevronLeft size={14} aria-hidden="true" /></button>
      <button type="button" className="engine-line-play" aria-label={playing ? 'Остановить проигрывание линии' : 'Проиграть линию движка'} aria-pressed={playing} disabled={!line.steps.length} onClick={play}>{playing ? <Pause size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />}{playing ? 'Пауза' : 'Проиграть'}</button>
      <button type="button" aria-label="Следующий ход варианта" title="Следующий ход варианта" disabled={!line.steps.length || activeIndex === line.steps.length} onClick={() => preview(Math.min(line.steps.length, (activeRef.current ?? 0) + 1))}><ChevronRight size={14} aria-hidden="true" /></button>
      <button type="button" className="engine-line-return" aria-label="Вернуться к позиции партии" disabled={activeIndex === null} onClick={() => preview(null)}><CornerUpLeft size={12} aria-hidden="true" />К партии</button>
    </div>
    <div className="engine-line-moves" aria-label="Ходы линии движка">{line.steps.map(move => <button type="button" key={move.index}
      aria-label={`${move.moveNumber}${move.color === 'w' ? '.' : '…'} ${move.san} в линии движка`}
      aria-current={activeIndex === move.index ? 'step' : undefined} onClick={() => preview(move.index)}><small>{move.moveNumber}{move.color === 'w' ? '.' : '…'}</small>{move.san}</button>)}</div>
    <p className="engine-line-status" aria-live="polite">{activeIndex === null ? 'Нажми на ход, чтобы увидеть позицию.' : activeIndex === 0 ? 'Начальная позиция варианта' : `Ход варианта ${activeIndex} / ${line.steps.length}`}</p>
    {line.error && <p className="engine-line-error" role="status">{line.steps.length ? 'Доступна только проверенная часть линии. ' : ''}{line.error}</p>}
  </div>;
}
