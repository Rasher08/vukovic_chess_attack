'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { ArrowLeft, RotateCcw, Undo2 } from 'lucide-react';
import { ChessboardWrapper } from '@/components/chess/ChessboardWrapper';
import { BrowserChessEngine } from '@/lib/browserEngine';
import { appendVariationMove, replayVariation, undoVariation, type VariationMode } from '@/lib/variationExplorer';
import './variation-explorer.css';

interface VariationExplorerProps {
  initialFen: string;
  orientation: 'white' | 'black';
  onClose: () => void;
}

export function VariationExplorer(props: VariationExplorerProps) {
  // A different selected review node is a fresh branch, with a fresh private Worker.
  return <VariationExplorerSession key={props.initialFen} {...props} />;
}

export default VariationExplorer;

function VariationExplorerSession({ initialFen, orientation, onClose }: VariationExplorerProps) {
  const [moves, setMoves] = useState<string[]>([]);
  const [mode, setMode] = useState<VariationMode>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [boardVersion, setBoardVersion] = useState(0);
  const movesRef = useRef<string[]>([]);
  const modeRef = useRef<VariationMode>('auto');
  const busyRef = useRef(false);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const engineRef = useRef<BrowserChessEngine | null>(null);
  const learner = initialFen.split(' ')[1];

  const played = useMemo(() => {
    try { return replayVariation(initialFen, moves); } catch { return null; }
  }, [initialFen, moves]);

  const invalidateSearch = useCallback(() => {
    generationRef.current += 1;
    busyRef.current = false;
    engineRef.current?.dispose(); engineRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; invalidateSearch(); };
  }, [invalidateSearch]);

  useEffect(() => {
    if (!played || mode !== 'auto' || played.game.isGameOver() || played.game.turn() === learner || error) return;
    let cancelled = false;
    const generation = ++generationRef.current;
    const fen = played.fen;
    const movesKey = moves.join(' ');
    const accepts = () => !cancelled && mountedRef.current && generationRef.current === generation
      && modeRef.current === 'auto' && movesRef.current.join(' ') === movesKey
      && replayVariation(initialFen, movesRef.current).fen === fen;
    busyRef.current = true; setBusy(true);
    const engine = engineRef.current || (engineRef.current = new BrowserChessEngine());
    (async () => {
      try {
        const response = await engine.analyze(fen, { nodes: 500000 });
        if (!accepts()) return;
        if (!response.bestMove) throw new Error('Движок не вернул ответ.');
        const game = new Chess(fen);
        const move = game.move({ from: response.bestMove.slice(0, 2), to: response.bestMove.slice(2, 4), promotion: response.bestMove[4] });
        const next = [...movesRef.current, `${move.from}${move.to}${move.promotion || ''}`];
        movesRef.current = next; setMoves(next); busyRef.current = false; setBusy(false);
      } catch (caught) {
        if (!accepts()) return;
        busyRef.current = false; setBusy(false);
        setError(caught instanceof Error ? caught.message : 'Ответ движка недоступен.');
      }
    })();
    return () => { cancelled = true; };
  }, [played, mode, learner, error, moves, initialFen, retry]);

  function replaceLine(next: string[]) {
    invalidateSearch();
    movesRef.current = next; setMoves(next); setBusy(false); setError(null);
    setBoardVersion(value => value + 1);
  }

  function makeMove(from: Square, to: Square, promotion?: string): boolean {
    if (busyRef.current) return false;
    let current: ReturnType<typeof replayVariation>;
    try { current = replayVariation(initialFen, movesRef.current); } catch { return false; }
    if (modeRef.current === 'auto' && current.game.turn() !== learner) return false;
    const next = appendVariationMove(initialFen, movesRef.current, from, to, promotion);
    if (!next) return false;
    movesRef.current = next; setMoves(next); setError(null);
    return true;
  }

  function changeMode(next: VariationMode) {
    if (modeRef.current === next) return;
    invalidateSearch(); modeRef.current = next; setMode(next);
    setBusy(false); setError(null); setBoardVersion(value => value + 1);
  }

  if (!played) return <div className="variation-explorer" role="status"><p>Выбранная позиция недоступна для исследования.</p><button type="button" onClick={onClose}>Вернуться к разбору</button></div>;

  const { game } = played;
  const turn = game.turn() === 'w' ? 'белых' : 'чёрных';
  const terminal = game.isGameOver();
  const status = game.isCheckmate() ? `Мат ${game.turn() === 'w' ? 'белым' : 'чёрным'}. Ветка завершена.`
    : game.isStalemate() ? 'Пат. Ветка завершена.'
      : game.isDraw() ? 'Ничья. Ветка завершена.'
        : busy ? 'Соперник обдумывает ответ…'
          : error ? 'Ответ соперника пока недоступен.'
            : `${game.isCheck() ? 'Шах. ' : ''}${mode === 'auto' && game.turn() === learner ? 'Твой ход' : `Ход ${turn}`}`;
  const last = moves[moves.length - 1];
  const lastMove = last ? { from: last.slice(0, 2) as Square, to: last.slice(2, 4) as Square } : null;

  return <section className="variation-explorer" aria-label="Исследование варианта">
    <div className="variation-heading"><span>Своя ветка</span><button type="button" onClick={() => { invalidateSearch(); onClose(); }}><ArrowLeft size={14} aria-hidden="true" />Вернуться к разбору</button></div>
    <div className="variation-modes" role="group" aria-label="Режим исследования">
      <button type="button" aria-pressed={mode === 'auto'} onClick={() => changeMode('auto')}>Соперник отвечает</button>
      <button type="button" aria-pressed={mode === 'manual'} onClick={() => changeMode('manual')}>За обе стороны</button>
    </div>
    <ChessboardWrapper key={boardVersion} position={played.fen} hudGameOver={played.game.isGameOver()} orientation={orientation} boardWidth={640}
      onMove={makeMove} isInteractive={!terminal && !busy && (mode === 'manual' || game.turn() === learner)}
      showLegalMoves={false} playSoundEffects={false} lastMove={lastMove} className="course-board" />
    <div className="variation-status" role="status"><span>{status}</span><span>{mode === 'auto' ? `Ты играешь ${learner === 'w' ? 'белыми' : 'чёрными'}` : 'Можно ходить за оба цвета'}</span></div>
    <div className="variation-controls">
      <button type="button" disabled={!moves.length} onClick={() => replaceLine(undoVariation(initialFen, movesRef.current, modeRef.current))} aria-label="Отменить ход в ветке"><Undo2 size={14} aria-hidden="true" />Отменить ход</button>
      <button type="button" disabled={!moves.length && !busy} onClick={() => replaceLine([])}><RotateCcw size={14} aria-hidden="true" />В начало ветки</button>
    </div>
    <div className="variation-moves" aria-label="Ходы своей ветки">{played.san.length ? played.san.map((san, index) => <span key={index}><small>{played.labels[index]}</small>{san}</span>) : <p>Сыграй другой ход из выбранной позиции.</p>}</div>
    {error && <div className="variation-error" role="alert"><p>Движок недоступен: {error}</p><p>Ветка остаётся на доске. Можно отменить ход или продолжить за обе стороны.</p><button type="button" onClick={() => { invalidateSearch(); setBusy(false); setError(null); setRetry(value => value + 1); }}>Повторить ответ соперника</button></div>}
    <p className="variation-note">Это разбор: результат задачи и серия занятий не меняются.</p>
  </section>;
}
