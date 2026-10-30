'use client';

import { useEffect, useState } from 'react';
import { Chess } from 'chess.js';
import { BrowserChessEngine, type BrowserEngineAnalysis } from '@/lib/browserEngine';
import { playUci } from '@/lib/autoTraining';
import { EngineLinePlayer, type EngineLinePreview } from '@/components/analysis/EngineLinePlayer';

interface EndgameEngineLinesProps {
  fen: string;
  terminal?: boolean;
  onPreview: (preview: EngineLinePreview | null) => void;
  onArrow: (uci: string | null) => void;
}
interface ReviewLine {
  bestMove: string;
  sans: string[];
  moves: string[];
  depth: number;
  score: NonNullable<BrowserEngineAnalysis['score']>;
}

function scoreLabel(score: ReviewLine['score'], whiteToMove: boolean): string {
  const value = score.value * (whiteToMove ? 1 : -1);
  if (score.kind === 'mate') return `${value < 0 ? '−' : '+'}M${Math.abs(value)}`;
  return `${value > 0 ? '+' : ''}${(value / 100).toFixed(2)}`;
}

/** Mounted only after the learner explicitly opens the review. */
export function EndgameEngineLines({ fen, terminal = false, onPreview, onArrow }: EndgameEngineLinesProps) {
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const board = new Chess(fen);
  const finished = terminal || board.isGameOver();

  useEffect(() => {
    let cancelled = false;
    setLines([]); setSelected(0); setError(null); setLoading(!finished);
    if (finished) return;
    const engine = new BrowserChessEngine({ startupTimeoutMs: 90_000, searchIdleTimeoutMs: 90_000 });
    (async () => {
      try {
        const result = await engine.analyze(fen, { nodes: 1_000_000, multiPv: 3 });
        if (cancelled) return;
        const candidates = result.lines?.length ? result.lines : result.bestMove && result.score ? [{ ...result, bestMove: result.bestMove, score: result.score }] : [];
        const next: ReviewLine[] = [];
        for (const candidate of candidates) {
          const replay = new Chess(fen); const sans: string[] = []; const moves: string[] = [];
          if (!candidate.score || !Number.isFinite(candidate.score.value) || candidate.depth < 1) continue;
          for (const uci of candidate.pv.slice(0, 12)) {
            try { sans.push(playUci(replay, uci).san); moves.push(uci); } catch { break; }
          }
          if (!sans.length || next.some(line => line.bestMove === candidate.bestMove)) continue;
          next.push({ bestMove: candidate.bestMove, sans, moves, depth: candidate.depth, score: candidate.score });
        }
        if (!next.length) throw new Error('Не удалось получить проверенные продолжения.');
        setLines(next.slice(0, 3)); setLoading(false);
      } catch (caught) {
        if (!cancelled) { setError(caught instanceof Error ? caught.message : 'Не удалось посчитать продолжения.'); setLoading(false); }
      } finally { engine.dispose(); }
    })();
    return () => { cancelled = true; engine.dispose(); };
  }, [fen, finished, retry]);

  const line = lines[selected];
  useEffect(() => { onArrow(line?.moves[0] || null); }, [line, onArrow]);
  function showPreview(preview: EngineLinePreview | null) {
    onPreview(preview);
    onArrow(line?.moves[preview?.index || 0] || null);
  }
  return <section className="endgame-engine-lines" aria-label="Лучшие продолжения движка">
    <div className="endgame-lines-heading"><h3>Лучшие продолжения</h3><small>{fen.split(' ')[1] === 'w' ? 'Ход белых' : 'Ход чёрных'}</small></div>
    {finished ? <p role="status">Позиция завершена. Продолжения нет.</p> : loading ? <p role="status">Stockfish сравнивает до трёх вариантов…</p> : error ? <div className="endgame-error" role="alert"><p>{error}</p><button type="button" onClick={() => { onPreview(null); onArrow(null); setRetry(value => value + 1); }}>Повторить анализ позиции</button></div> : <>
      <div className="endgame-lines-options" role="group" aria-label="Выбор лучшего продолжения">{lines.map((item, index) => <button type="button" key={item.bestMove} aria-pressed={selected === index} onClick={() => { onPreview(null); onArrow(item.moves[0] || null); setSelected(index); }}><small>{index + 1}</small><strong>{item.sans[0]}</strong><span>{scoreLabel(item.score, board.turn() === 'w')}</span></button>)}</div>
      {line && <EngineLinePlayer key={`${fen}:${selected}:${retry}`} fenBefore={fen} moves={line.sans} onPreview={showPreview} />}
      <p className="endgame-lines-note">Оценка за белых · глубина {line?.depth || '—'} · 1 млн узлов на поиск. Стрелка показывает следующий ход выбранной линии. Оценка движка приблизительна.</p>
    </>}
  </section>;
}
