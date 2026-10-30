'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Square } from 'chess.js';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, RotateCcw, Square as StopIcon } from 'lucide-react';
import { ChessboardWrapper } from '@/components/chess/ChessboardWrapper';
import { VariationExplorer } from '@/components/course/VariationExplorer';
import type { EngineLinePreview } from '@/components/analysis/EngineLinePlayer';
import { EndgameEngineLines } from './EndgameEngineLines';
import { BrowserChessEngine } from '@/lib/browserEngine';
import { auditEndgameAttempt, chooseEndgameReply, replayEndgame, type EndgameAudit } from '@/lib/endgameTraining';
import { loadEndgameProgress, saveEndgameAttempt, type EndgameAttempt } from '@/lib/endgameProgress';
import { endgameLessons, type EndgameLesson } from '@/data/endgames';
import './endgames.css';

const OUTCOME: Record<EndgameAudit['outcome'], string> = {
  passed: 'Цель выполнена', 'needs-review': 'Есть что разобрать', incomplete: 'Позиция ещё не закончена', unverified: 'Результат не подтверждён',
};

export function EndgameTrainer({ lesson }: { lesson: EndgameLesson }) {
  const blind = useSearchParams().get('mode') === 'blind';
  const [attempt, setAttempt] = useState<EndgameAttempt | null>(null);
  const [plan, setPlan] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState<[number, number] | null>(null);
  const [paused, setPaused] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewPly, setReviewPly] = useState(0);
  const [boardVersion, setBoardVersion] = useState(0);
  const [explorationFen, setExplorationFen] = useState<string | null>(null);
  const [linePreview, setLinePreview] = useState<{ root: string; preview: EngineLinePreview } | null>(null);
  const [lineArrow, setLineArrow] = useState<{ root: string; uci: string } | null>(null);
  const [arrowsVisible, setArrowsVisible] = useState(true);
  const attemptRef = useRef<EndgameAttempt | null>(null);
  const engineRef = useRef<BrowserChessEngine | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const pendingSaveRef = useRef<EndgameAttempt | null>(null);
  const revealedAtRef = useRef(0);
  const drawMoves = lesson.targetHumanMoves || 16;
  const colorName = lesson.playerColor === 'w' ? 'белыми' : 'чёрными';
  const orientation = lesson.playerColor === 'w' ? 'white' : 'black';
  const lessonNumber = Math.max(1, endgameLessons.findIndex(item => item.id === lesson.id) + 1);

  const invalidate = useCallback(() => {
    generationRef.current += 1; abortRef.current?.abort(); abortRef.current = null;
    engineRef.current?.dispose(); engineRef.current = null; busyRef.current = false;
  }, []);
  const engine = () => engineRef.current || (engineRef.current = new BrowserChessEngine({ startupTimeoutMs: 90_000, searchIdleTimeoutMs: 90_000 }));
  const store = useCallback((next: EndgameAttempt) => {
    const result = saveEndgameAttempt(next);
    if (!result.saved) {
      pendingSaveRef.current = next;
      setStorageError(result.error || 'Не удалось сохранить попытку в браузере. Изменение пока не применено.');
      return false;
    }
    pendingSaveRef.current = null; setStorageError(null);
    attemptRef.current = next; setAttempt(next); return true;
  }, []);
  const fresh = useCallback((assisted = false): EndgameAttempt => {
    const now = Date.now();
    return { id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${lesson.id}-${now}-${Math.random().toString(36).slice(2)}`, lessonId: lesson.id,
      initialFen: lesson.initialFen, moves: [], plan: '', planLocked: false, phase: 'active', assisted, revealed: false, createdAt: now, updatedAt: now };
  }, [lesson.id, lesson.initialFen]);

  useEffect(() => {
    mountedRef.current = true;
    const saved = loadEndgameProgress().lessons[lesson.id];
    const current = saved?.activeAttempt || saved?.history[0];
    const next = current?.initialFen === lesson.initialFen ? current : fresh();
    attemptRef.current = next; setAttempt(next); setPlan(next.plan); setLoaded(true);
    setReviewPly(next.moves.length); setReviewVisible(next.revealed);
    if (!current) store(next);
    return () => { mountedRef.current = false; invalidate(); };
  }, [fresh, invalidate, lesson.id, lesson.initialFen, store]);

  const played = useMemo(() => {
    try { return attempt ? replayEndgame(lesson, attempt.moves) : null; } catch { return null; }
  }, [attempt, lesson]);
  const history = played?.history({ verbose: true }) || [];
  const fens = [lesson.initialFen, ...history.map(move => move.after)];
  const visiblePly = reviewVisible ? Math.min(reviewPly, history.length) : history.length;
  const reviewFen = fens[visiblePly] || lesson.initialFen;
  const reviewRoot = `${attempt?.id || lesson.id}:${visiblePly}:${reviewFen}`;
  const activePreview = reviewVisible && linePreview?.root === reviewRoot ? linePreview.preview : null;
  const displayedFen = activePreview?.fen || reviewFen;
  const ownMoves = history.filter(move => move.color === lesson.playerColor).length;
  const isActive = attempt?.phase === 'active';
  const terminal = played?.isGameOver() === true;
  const minimumCheckMoves = lesson.goal === 'draw' ? drawMoves : 8;
  const canCheck = terminal || ownMoves >= minimumCheckMoves;
  const myTurn = played?.turn() === lesson.playerColor;
  const selectedReview = attempt?.audit?.moves.find(move => move.ply === visiblePly);
  const displayedLast = attempt?.moves[visiblePly - 1];
  const lastMove = activePreview ? activePreview.move ? { from: activePreview.move.uci.slice(0, 2) as Square, to: activePreview.move.uci.slice(2, 4) as Square } : null
    : displayedLast ? { from: displayedLast.slice(0, 2) as Square, to: displayedLast.slice(2, 4) as Square } : null;
  const previewLine = useCallback((preview: EngineLinePreview | null) => {
    setExplorationFen(null);
    setLinePreview(preview ? { root: reviewRoot, preview } : null);
  }, [reviewRoot]);
  const showLineArrow = useCallback((uci: string | null) => {
    setLineArrow(uci ? { root: reviewRoot, uci } : null);
  }, [reviewRoot]);
  const reviewArrows: [Square, Square, string?][] = reviewVisible && arrowsVisible && !explorationFen && lineArrow?.root === reviewRoot
    ? [[lineArrow.uci.slice(0, 2) as Square, lineArrow.uci.slice(2, 4) as Square, 'rgba(212, 156, 64, 0.9)']] : [];
  function navigateReview(ply: number) {
    setLineArrow(null); setLinePreview(null); setExplorationFen(null); setReviewPly(ply);
  }

  useEffect(() => {
    if (!attempt || !played || !attempt.planLocked || attempt.phase !== 'active' || terminal || myTurn || paused || engineError || auditing || reviewVisible || storageError) return;
    let settled = false;
    const token = ++generationRef.current;
    const controller = new AbortController(); abortRef.current = controller;
    const id = attempt.id; const movesKey = attempt.moves.join(' ');
    const current = () => mountedRef.current && !controller.signal.aborted && generationRef.current === token && attemptRef.current?.id === id && attemptRef.current.phase === 'active' && attemptRef.current.moves.join(' ') === movesKey;
    busyRef.current = true; setBusy(true);
    (async () => {
      try {
        const reply = await chooseEndgameReply(lesson, attempt.moves, engine(), { signal: controller.signal, nodes: 1_000_000 });
        if (!current()) return;
        if (!reply.uci) throw new Error('Соперник не вернул ход. Позиция сохранена.');
        settled = true; busyRef.current = false; setBusy(false);
        store({ ...attemptRef.current!, moves: [...attempt.moves, reply.uci], updatedAt: Date.now() });
      } catch (caught) {
        if (!current()) return;
        settled = true; engineRef.current?.dispose(); engineRef.current = null;
        busyRef.current = false; setBusy(false);
        setEngineError(caught instanceof Error ? caught.message : 'Ответ соперника недоступен.');
      }
    })();
    return () => {
      controller.abort();
      if (!settled) { engineRef.current?.dispose(); engineRef.current = null; busyRef.current = false; }
    };
  }, [attempt, played, terminal, myTurn, lesson, paused, engineError, auditing, reviewVisible, retry, store, storageError]);

  function start() {
    if (!attempt || plan.trim().length < 8 || storageError) return;
    store({ ...attempt, plan: plan.trim(), planLocked: true, updatedAt: Date.now() });
    setPaused(false); setEngineError(null);
  }
  function makeMove(from: Square, to: Square, promotion?: string) {
    const current = attemptRef.current;
    if (!current || current.phase !== 'active' || !current.planLocked || busyRef.current || auditing || paused || reviewVisible || storageError) return false;
    try {
      const game = replayEndgame(lesson, current.moves);
      if (game.turn() !== lesson.playerColor || game.isGameOver()) return false;
      const move = game.move({ from, to, promotion });
      if (!move) return false;
      return store({ ...current, moves: [...current.moves, `${move.from}${move.to}${move.promotion || ''}`], updatedAt: Date.now() });
    } catch { return false; }
  }
  async function checkAttempt() {
    const current = attemptRef.current;
    if (!current || current.phase !== 'active' || !current.planLocked || busyRef.current || auditing || storageError) return;
    const board = replayEndgame(lesson, current.moves);
    if (!board.isGameOver() && board.history({ verbose: true }).filter(move => move.color === lesson.playerColor).length < minimumCheckMoves) return;
    invalidate(); setBusy(false); setAuditing(true); setEngineError(null); setAuditProgress([0, current.moves.length]);
    const controller = new AbortController(); abortRef.current = controller;
    const token = ++generationRef.current;
    const accepts = () => mountedRef.current && !controller.signal.aborted && generationRef.current === token && attemptRef.current?.id === current.id;
    try {
      const audit = await auditEndgameAttempt(lesson, current.moves, engine(), { signal: controller.signal, nodes: 1_000_000,
        onProgress: (done, total) => { if (accepts()) setAuditProgress([done, total]); },
      });
      if (!accepts()) return;
      store({ ...attemptRef.current!, phase: 'completed', audit, updatedAt: Date.now() });
      setReviewPly(current.moves.length); setPaused(false);
    } catch (caught) {
      if (accepts()) { engineRef.current?.dispose(); engineRef.current = null; setEngineError(caught instanceof Error ? caught.message : 'Не удалось проверить попытку.'); }
    } finally { if (accepts()) { setAuditing(false); setAuditProgress(null); } }
  }
  function stop() {
    invalidate(); setBusy(false); setAuditing(false); setAuditProgress(null); setPaused(true);
  }
  function restart() {
    invalidate(); setBusy(false); setAuditing(false); setAuditProgress(null); setPaused(false); setEngineError(null); setExplorationFen(null); setLinePreview(null); setLineArrow(null);
    const current = attemptRef.current;
    const recentlyAssisted = Boolean(current && (current.assisted || current.revealed || reviewVisible) && Date.now() - Math.max(current.updatedAt, revealedAtRef.current) < 86_400_000);
    const next = fresh(recentlyAssisted);
    if (store(next)) { setPlan(''); setReviewVisible(false); setReviewPly(0); setBoardVersion(value => value + 1); }
  }
  function reveal() {
    const current = attemptRef.current;
    if (!current) return;
    invalidate(); setBusy(false); setPaused(true);
    // Reviewing an already earned independent result does not revoke it.
    if (current.audit?.outcome !== 'passed' && !store({ ...current, assisted: true, revealed: true, updatedAt: Date.now() })) return;
    revealedAtRef.current = Date.now(); setLineArrow(null); setLinePreview(null); setReviewPly(current.moves.length); setReviewVisible(true);
  }
  function continueAttempt() {
    const current = attemptRef.current;
    if (!current || terminal) return;
    invalidate();
    const { audit: _audit, ...rest } = current;
    store({ ...rest, phase: 'active', assisted: current.assisted || reviewVisible, updatedAt: Date.now() });
    setLineArrow(null); setLinePreview(null); setExplorationFen(null); setReviewVisible(false); setPaused(false); setEngineError(null); setRetry(value => value + 1);
  }
  const goal = lesson.goal === 'win' ? 'Доведи позицию до победы.' : `Удержи ничью или сыграй ${drawMoves} своих ходов, сохранив точный ничейный исход.`;
  const hiddenTitle = blind && !reviewVisible;
  const status = !attempt?.planLocked ? 'Сначала запиши план.' : auditing ? `Проверяем попытку${auditProgress ? `: ${auditProgress[0]} / ${auditProgress[1]}` : '…'}`
    : reviewVisible ? activePreview ? 'Линия движка. Ходы попытки не меняются.' : 'Разбор открыт.' : attempt.phase === 'completed' ? 'Попытка проверена.' : terminal ? 'Позиция закончена. Проверь попытку.'
      : busy ? 'Соперник обдумывает ответ…' : paused ? 'Игра приостановлена.' : myTurn ? `Твой ход${played?.isCheck() ? '. Шах.' : '.'}` : 'Ход соперника.';

  if (!loaded || !attempt) return <div className="endgame-loading" role="status">Подготавливаем позицию…</div>;
  if (!played) return <div className="endgame-loading"><p>Сохранённую позицию не удалось восстановить.</p><button type="button" onClick={restart}>Расставить заново</button></div>;

  return <div className={`endgame-session${reviewVisible ? ' is-reviewing' : ''}`}>
    <header className="endgame-session-heading"><Link href="/endgames"><ArrowLeft size={15} />Эндшпили</Link><div><p className="endgame-eyebrow">{blind ? 'СМЕШАННАЯ ПРАКТИКА' : 'ДОИГРЫВАНИЕ'} · ПОЗИЦИЯ {String(lessonNumber).padStart(2, '0')}</p><h1>{hiddenTitle ? 'Найди план. Проведи его.' : lesson.title}</h1><p>{hiddenTitle ? `Ты играешь ${colorName}. ${goal}` : lesson.description}</p></div></header>
    <div className="endgame-workspace"><section className="endgame-board-column" aria-label="Доска эндшпиля">
      {explorationFen ? <VariationExplorer initialFen={explorationFen} orientation={orientation} onClose={() => setExplorationFen(null)} /> : <>
        <div className="endgame-playerbar"><span>{lesson.playerColor === 'w' ? '♚' : '♔'}</span>Соперник<span>Stockfish 19 Lite</span></div>
        <ChessboardWrapper key={boardVersion} position={displayedFen} hudGameOver={terminal && displayedFen === played.fen()} orientation={orientation} boardWidth={640} onMove={makeMove}
          isInteractive={isActive && attempt.planLocked && !busy && !auditing && !paused && !reviewVisible && !storageError && myTurn && !terminal} showLegalMoves={false} playSoundEffects={false} lastMove={lastMove} customArrows={reviewArrows} className="endgame-board" />
        <div className="endgame-playerbar"><span>{lesson.playerColor === 'w' ? '♔' : '♚'}</span>Ты играешь {colorName}<span>{ownMoves} своих ходов</span></div>
        {reviewVisible && <div className="endgame-review-navigation"><button type="button" aria-label="Предыдущий ход эндшпиля" disabled={visiblePly === 0} onClick={() => navigateReview(Math.max(0, visiblePly - 1))}><ChevronLeft size={18} /></button><span>{visiblePly} / {history.length}</span><button type="button" aria-label="Следующий ход эндшпиля" disabled={visiblePly >= history.length} onClick={() => navigateReview(Math.min(history.length, visiblePly + 1))}><ChevronRight size={18} /></button><button type="button" className="endgame-arrows-toggle" aria-pressed={arrowsVisible} onClick={() => setArrowsVisible(value => !value)}>Стрелки</button><button type="button" onClick={() => { setLineArrow(null); setLinePreview(null); setExplorationFen(displayedFen); }}>Разыграть отсюда</button></div>}
        <p className="endgame-board-status" role="status">{status}</p>
      </>}
    </section><aside className="endgame-side">
      <section className="endgame-objective"><span className="endgame-eyebrow">ЗАДАЧА</span><h2>{lesson.goal === 'win' ? 'Реализация' : 'Защита'}</h2><p>{goal}</p><small>Альтернативные ходы разрешены. Оценки и лучшие ходы скрыты до разбора.</small></section>
      {!attempt.planLocked ? <section className="endgame-preparation"><label htmlFor="endgame-plan">Твой план перед первым ходом</label><textarea id="endgame-plan" value={plan} onChange={event => setPlan(event.target.value)} onBlur={() => store({ ...attemptRef.current!, plan, updatedAt: Date.now() })} placeholder="Что улучшить? Где слабость? Какая контригра есть у соперника?" /><p>Назови улучшение, цель и контригру соперника. Сравнишь свой план с разбором после попытки.</p><button type="button" className="endgame-primary" disabled={plan.trim().length < 8 || Boolean(storageError)} onClick={start}>Зафиксировать и начать<ArrowRight size={14} /></button></section> : <>
        <details className="endgame-plan"><summary>Мой исходный план</summary><p>{attempt.plan}</p></details>
        {attempt.phase === 'completed' && attempt.audit && <section className="endgame-result" aria-label="Результат попытки"><span className="endgame-eyebrow">{attempt.assisted ? 'УЧЕБНАЯ ПОПЫТКА' : 'САМОСТОЯТЕЛЬНАЯ ПОПЫТКА'}</span><h2>{OUTCOME[attempt.audit.outcome]}</h2><p>{attempt.audit.summary}</p><small>{attempt.audit.limits}</small>{!reviewVisible && <p className="endgame-result-note">Лучшие ходы остаются скрыты. Можно сначала самому найти, что изменить.</p>}</section>}
        {isActive && !reviewVisible && !canCheck && <p className="endgame-check-note">Проверка после {minimumCheckMoves} своих ходов или завершения партии.</p>}
        <div className="endgame-actions">
          {busy || auditing ? <button type="button" className="endgame-secondary" onClick={stop}><StopIcon size={13} />Остановить</button> : isActive && !reviewVisible && <button type="button" className="endgame-primary" onClick={() => { void checkAttempt(); }} disabled={!canCheck || (!myTurn && !terminal) || Boolean(storageError)}>Проверить попытку</button>}
          {(paused || engineError) && isActive && !reviewVisible && !auditing && <button type="button" className="endgame-primary" disabled={Boolean(storageError)} onClick={() => { setPaused(false); setEngineError(null); setRetry(value => value + 1); }}>Продолжить игру</button>}
          {!reviewVisible && !busy && !auditing && <button type="button" className="endgame-secondary" disabled={Boolean(storageError)} onClick={reveal}>Показать разбор</button>}
          {(attempt.phase === 'completed' || reviewVisible) && attempt.audit?.outcome !== 'passed' && !terminal && <button type="button" className="endgame-secondary" disabled={Boolean(storageError)} onClick={continueAttempt}>Продолжить позицию</button>}
          <button type="button" className="endgame-text-button" disabled={auditing || Boolean(storageError)} onClick={restart}><RotateCcw size={13} />Начать заново</button>
        </div>
        {engineError && <div className="endgame-error" role="alert"><p>{engineError}</p><small>Позиция и ходы остаются на доске. Продолжение создаст новый движок.</small></div>}
        <div className="endgame-moves" aria-label="Ходы попытки">{history.length ? history.map((move, index) => <button type="button" key={`${index}-${move.san}`} disabled={!reviewVisible} aria-pressed={reviewVisible && visiblePly === index + 1} onClick={() => navigateReview(index + 1)}><small>{move.before.split(' ')[5]}{move.color === 'w' ? '.' : '…'}</small>{move.san}</button>) : <p>Доска готова к первому ходу.</p>}</div>
      </>}
      {reviewVisible && <section className="endgame-review" aria-label="Разбор эндшпиля"><span className="endgame-eyebrow">ПОСЛЕ ПОПЫТКИ</span><h2>{lesson.title}</h2>
        {!explorationFen && <EndgameEngineLines key={reviewRoot} fen={reviewFen} terminal={visiblePly === history.length && terminal} onPreview={previewLine} onArrow={showLineArrow} />}
        {selectedReview && <div className="endgame-move-explanation"><strong>{selectedReview.san}</strong><p>{selectedReview.explanation}</p>{selectedReview.bestSan && <p>До твоего хода движок предлагал <b>{selectedReview.bestSan}</b>. <button type="button" onClick={() => navigateReview(Math.max(0, selectedReview.ply - 1))}>Посмотреть продолжения</button></p>}</div>}
        {attempt.audit && <details className="endgame-turning-points"><summary>Важные моменты попытки</summary>{attempt.audit.moves.filter(move => ['mistake', 'inaccuracy', 'unverified'].includes(move.classification)).length ? attempt.audit.moves.filter(move => ['mistake', 'inaccuracy', 'unverified'].includes(move.classification)).map(move => <button type="button" key={move.ply} onClick={() => navigateReview(move.ply)}><strong>{move.san}</strong><span>{move.explanation}</span></button>) : <p>Подтверждённых критических ошибок в проверенном отрезке не найдено.</p>}</details>}
        {lesson.theory.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<h3>Проверь своё понимание</h3><ul>{lesson.reviewQuestions.map(question => <li key={question}>{question}</li>)}</ul><p className="endgame-source">{lesson.source.url ? <a href={lesson.source.url} target="_blank" rel="noreferrer">{lesson.source.label} ↗</a> : lesson.source.label}</p>
      </section>}
      {storageError && <div className="endgame-error" role="alert"><p>{storageError}</p><button type="button" onClick={() => store(pendingSaveRef.current || attemptRef.current!)}>Повторить сохранение</button></div>}
    </aside></div>
  </div>;
}
