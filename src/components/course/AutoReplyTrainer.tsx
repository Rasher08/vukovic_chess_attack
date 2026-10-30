'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Chess, type Square } from 'chess.js';
import { RotateCcw } from 'lucide-react';
import { ChessboardWrapper } from '@/components/chess/ChessboardWrapper';
import type { CourseExercise } from '@/types/course';
import { BrowserChessEngine } from '@/lib/browserEngine';
import { auditAutoAttempt, preparedPuzzleReply, type AutoAudit } from '@/lib/autoTraining';
import { appendAutoHistory, COURSE_PROGRESS_EVENT, loadCourseProgress, noteAutoAuditViewed, restartAutoAttempt, saveCourseProgress, type AutoAttempt } from '@/lib/courseProgress';
import type { TrainingAttemptRecord } from '@/lib/trainingSchedule';
import { VariationExplorer } from './VariationExplorer';

const OUTCOME_LABELS: Record<AutoAudit['outcome'], string> = {
  passed: 'План проведён', 'needs-review': 'Есть что разобрать', incomplete: 'Попытка не завершена', unverified: 'Оценка не подтверждена',
};

function replay(initialFen: string, moves: string[]) {
  const game = new Chess(initialFen);
  const san: string[] = [];
  const fens = [game.fen()];
  for (const uci of moves) {
    const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    san.push(move.san); fens.push(game.fen());
  }
  return { game, san, fens };
}

export function AutoReplyTrainer({ exercise, index, onNext, trainingContext }: {
  exercise: CourseExercise; index: number; onNext?: () => void;
  trainingContext?: { sessionId: string; kind: TrainingAttemptRecord['sessionKind']; conceal: boolean };
}) {
  const [attempt, setAttempt] = useState<AutoAttempt | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [engineBusy, setEngineBusy] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [auditProgress, setAuditProgress] = useState<[number, number] | null>(null);
  const [reviewPly, setReviewPly] = useState(0);
  const [referencePly, setReferencePly] = useState<number | null>(null);
  const [referenceLine, setReferenceLine] = useState(0);
  const [explorationFen, setExplorationFen] = useState<string | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [preparation, setPreparation] = useState({ candidates: '', defense: '', evaluation: '' });
  const [attemptConflict, setAttemptConflict] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const engineRef = useRef<BrowserChessEngine | null>(null);
  const attemptRef = useRef<AutoAttempt | null>(null);
  const mountedRef = useRef(true);
  const humanSide = exercise.initialFen.split(' ')[1];
  const requiredOwnMoves = Math.ceil(exercise.solutionSan.length / 2);
  const trainingSessionId = trainingContext?.sessionId;
  const trainingKind = trainingContext?.kind;
  const conceal = trainingContext?.conceal === true;

  const getEngine = useCallback(() => {
    if (!engineRef.current) engineRef.current = new BrowserChessEngine();
    return engineRef.current;
  }, []);

  const storeAttempt = useCallback((next: AutoAttempt) => {
    const progress = loadCourseProgress();
    const previous = progress.exercises[exercise.id];
    if (attemptRef.current && previous?.autoAttempt && previous.autoAttempt.id !== attemptRef.current.id) {
      setAttemptConflict(true); setEngineBusy(false); return;
    }
    // A reveal from another mode must survive later engine replies.
    const revealedDuringAttempt = previous?.autoAttempt?.id === next.id && previous.autoAttempt.assisted;
    const safeNext = next.phase === 'active' && (revealedDuringAttempt || (!next.sessionId && previous?.everRevealed)) ? { ...next, assisted: true } : next;
    attemptRef.current = safeNext;
    setAttempt(safeNext);
    setStorageAvailable(saveCourseProgress({
      ...progress, ...(!next.sessionId ? { lastChapterId: exercise.chapterId, lastExerciseId: exercise.id } : {}),
      exercises: { ...progress.exercises, [exercise.id]: {
        ...previous, status: previous?.status || 'review', updatedAt: Date.now(), autoAttempt: safeNext,
        autoHistory: previous?.autoAttempt ? appendAutoHistory(previous.autoHistory, previous.autoAttempt) : previous?.autoHistory,
      } },
    }));
  }, [exercise.chapterId, exercise.id]);

  const createAttempt = useCallback(() => {
    const saved = loadCourseProgress().exercises[exercise.id];
    const now = Date.now();
    const next: AutoAttempt = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${exercise.id}-${now}-${Math.random().toString(36).slice(2)}`,
      exerciseId: exercise.id, chapterId: exercise.chapterId, initialFen: exercise.initialFen,
      moves: [], planLocked: !exercise.decision && !trainingSessionId, phase: 'active', createdAt: now, updatedAt: now,
      assisted: !trainingSessionId && saved?.everRevealed === true, isFirstAttempt: !saved?.firstAttemptResult && !saved?.autoAttempt,
      sessionId: trainingSessionId, sessionKind: trainingKind,
    };
    setPreparation({ candidates: '', defense: '', evaluation: '' });
    setChoice(null); setEngineError(null); setReviewPly(0); setReferencePly(null); setReferenceLine(0); setExplorationFen(null);
    storeAttempt(next);
  }, [exercise, storeAttempt, trainingSessionId, trainingKind]);

  useEffect(() => {
    mountedRef.current = true;
    const saved = loadCourseProgress().exercises[exercise.id]?.autoAttempt;
    if (saved && saved.sessionId !== trainingSessionId && (saved.phase === 'active' || !saved.audit || saved.audit.outcome === 'unverified')) {
      setAttemptConflict(true); setLoaded(true);
      return () => { mountedRef.current = false; };
    }
    if (saved && saved.sessionId === trainingSessionId) {
      attemptRef.current = saved; setAttempt(saved); setChoice(saved.choiceId || null); setReviewPly(saved.moves.length);
      setPreparation(saved.preparation || { candidates: '', defense: '', evaluation: '' });
      setReferencePly(saved.answerRevealed ? 0 : null);
      if (saved.phase === 'completed' && saved.answerRevealed && saved.audit?.outcome !== 'unverified') noteAutoAuditViewed(exercise.id, saved.id);
    } else createAttempt();
    setLoaded(true);
    const sync = () => {
      const latest = loadCourseProgress().exercises[exercise.id]?.autoAttempt;
      if (latest && attemptRef.current && latest.id !== attemptRef.current.id) {
        setAttemptConflict(true); setEngineBusy(false); return;
      }
      if (latest && latest.id === attemptRef.current?.id && (latest.updatedAt > attemptRef.current.updatedAt || latest.assisted !== attemptRef.current.assisted || latest.moves.join(' ') !== attemptRef.current.moves.join(' '))) {
        attemptRef.current = latest; setAttempt(latest);
      }
    };
    window.addEventListener(COURSE_PROGRESS_EVENT, sync); window.addEventListener('storage', sync);
    return () => {
      mountedRef.current = false;
      window.removeEventListener(COURSE_PROGRESS_EVENT, sync); window.removeEventListener('storage', sync);
      engineRef.current?.dispose(); engineRef.current = null;
    };
  }, [exercise.id, createAttempt, trainingSessionId]);

  const played = useMemo(() => {
    try { return attempt ? replay(attempt.initialFen, attempt.moves) : null; } catch { return null; }
  }, [attempt]);
  const finishAttempt = useCallback(() => {
    const current = attemptRef.current;
    if (!current || current.phase !== 'active') return;
    const saved = loadCourseProgress().exercises[exercise.id];
    setEngineError(null);
    setReviewPly(current.moves.length);
    storeAttempt({ ...current, phase: 'completed', assisted: current.assisted || (saved?.autoAttempt?.id === current.id && saved.autoAttempt.assisted) || (!current.sessionId && saved?.everRevealed === true), updatedAt: Date.now() });
  }, [exercise.id, storeAttempt]);

  const persistCompletedAttempt = useCallback((completed: AutoAttempt) => {
    if (!completed.audit) return false;
    const progress = loadCourseProgress();
    const previous = progress.exercises[exercise.id];
    if (previous?.autoAttempt?.id !== completed.id) { setAttemptConflict(true); setEngineBusy(false); return false; }
    const independent = completed.audit.outcome === 'passed' && (Boolean(completed.sessionId) || completed.isFirstAttempt) && !completed.assisted;
    const firstAttemptResult = previous?.firstAttemptResult || (completed.isFirstAttempt && completed.audit.outcome !== 'unverified' ? {
      attemptId: completed.id, outcome: completed.audit.outcome, independent, completedAt: completed.updatedAt,
    } : undefined);
    const saved = saveCourseProgress({ ...progress, exercises: { ...progress.exercises, [exercise.id]: {
      ...previous, status: previous?.status === 'solved' || independent ? 'solved' : 'review', updatedAt: completed.updatedAt,
      autoAttempt: completed, autoHistory: appendAutoHistory(previous?.autoHistory, completed), firstAttemptResult,
      ...(completed.answerRevealed ? { everRevealed: true, reviewed: true, reviewedAt: completed.updatedAt } : {}),
    } } });
    setStorageAvailable(saved);
    return saved;
  }, [exercise.id]);

  // At exact Lichess puzzle nodes use its deeply analysed defence. Every deviation
  // is answered from its actual FEN, never by continuing a mismatched source line.
  useEffect(() => {
    if (!attempt || attempt.phase !== 'active' || !attempt.planLocked || !played) return;
    if (played.game.isGameOver() || (played.game.turn() === humanSide && Math.ceil(attempt.moves.length / 2) >= requiredOwnMoves)) {
      finishAttempt(); return;
    }
    if (played.game.turn() === humanSide) { setEngineBusy(false); return; }
    let cancelled = false;
    const id = attempt.id;
    const movesKey = attempt.moves.join(' ');
    const fen = played.game.fen();
    setEngineBusy(true); setEngineError(null);
    (async () => {
      try {
        const prepared = preparedPuzzleReply(exercise, fen);
        const engine = getEngine();
        const response = prepared ? { bestMove: prepared } : await engine.analyze(fen, { nodes: trainingSessionId ? 1500000 : 200000 });
        if (cancelled || !mountedRef.current) return;
        const latest = attemptRef.current;
        if (!latest || latest.id !== id || latest.phase !== 'active' || latest.moves.join(' ') !== movesKey) return;
        if (!response.bestMove || response.bestMove === '(none)' || response.bestMove === '0000') throw new Error('Движок не вернул легальный ответ.');
        const game = new Chess(fen);
        const move = game.move({ from: response.bestMove.slice(0, 2), to: response.bestMove.slice(2, 4), promotion: response.bestMove[4] });
        const uci = `${move.from}${move.to}${move.promotion || ''}`;
        storeAttempt({ ...latest, moves: [...latest.moves, uci], updatedAt: Date.now() });
        setEngineBusy(false);
      } catch (error) {
        if (!cancelled && mountedRef.current && attemptRef.current?.id === id && attemptRef.current.phase === 'active') { setEngineBusy(false); setEngineError(error instanceof Error ? error.message : 'Не удалось получить ответ движка.'); }
      }
    })();
    return () => { cancelled = true; };
  }, [attempt, retry, played, humanSide, requiredOwnMoves, getEngine, storeAttempt, finishAttempt, trainingSessionId, exercise]);

  // A completed attempt is saved before analysis, so reload resumes this same audit.
  useEffect(() => {
    if (!attempt || attempt.phase !== 'completed' || attempt.audit || !played) return;
    let cancelled = false;
    const snapshot = attempt;
    setEngineBusy(true); setEngineError(null); setAuditProgress([0, Math.ceil(attempt.moves.length / 2)]);
    (async () => {
      try {
        const engine = getEngine();
        await engine.ready();
        const audit = await auditAutoAttempt(exercise, snapshot.moves, engine, {
          decisionCorrect: !exercise.decision || snapshot.choiceId === exercise.decision.correctOptionId,
          assisted: snapshot.assisted, isFirstAttempt: snapshot.isFirstAttempt,
          nodes: trainingSessionId ? 1000000 : 300000,
          onProgress: (done, total) => { if (!cancelled && attemptRef.current?.id === snapshot.id) setAuditProgress([done, total]); },
        });
        if (cancelled || !mountedRef.current || attemptRef.current?.id !== snapshot.id) return;
        const completed = { ...snapshot, audit, updatedAt: Date.now() };
        attemptRef.current = completed; setAttempt(completed); setEngineBusy(false);
        persistCompletedAttempt(completed);
      } catch (error) {
        if (!cancelled && mountedRef.current && attemptRef.current?.id === snapshot.id) { setEngineBusy(false); setEngineError(error instanceof Error ? error.message : 'Анализ недоступен. Попытка сохранена.'); }
      }
    })();
    return () => { cancelled = true; };
  }, [attempt, retry, exercise, played, getEngine, persistCompletedAttempt, trainingSessionId]);

  function restartPosition() {
    const current = attemptRef.current;
    if (!current || !storageAvailable || (current.phase === 'active' && !current.moves.length)) return;
    const progress = restartAutoAttempt(loadCourseProgress(), {
      exerciseId: exercise.id, attemptId: current.id, requiredOwnMoves,
      nextAttemptId: crypto.randomUUID(), now: Date.now(),
    });
    if (!progress) { setRestartError('Попытка изменилась в другой вкладке. Обнови страницу, чтобы продолжить сохранённую позицию.'); return; }
    const next = progress.exercises[exercise.id].autoAttempt!;
    attemptRef.current = next;
    if (!saveCourseProgress(progress)) { attemptRef.current = current; setRestartError('Не удалось сохранить перезапуск. Текущая позиция сохранена на доске; попробуй начать заново ещё раз.'); return; }
    engineRef.current?.dispose(); engineRef.current = null;
    setAttempt(next); setEngineBusy(false); setEngineError(null); setRestartError(null);
    setAuditProgress(null); setReviewPly(0); setReferencePly(null); setReferenceLine(0); setExplorationFen(null); setStorageAvailable(true);
    setPreparation(next.preparation || { candidates: '', defense: '', evaluation: '' });
    setChoice(next.choiceId || null);
  }

  function showAnswer() {
    const current = attemptRef.current;
    if (!current || current.phase !== 'completed') return;
    // Opening an old solution must not move its completion into today's streak.
    const next = { ...current, answerRevealed: true };
    attemptRef.current = next; setAttempt(next);
    setReferenceLine(0); setReferencePly(0); setExplorationFen(null);
    if (next.audit) { persistCompletedAttempt(next); noteAutoAuditViewed(exercise.id, next.id); }
    else storeAttempt(next);
  }

  function surrender() {
    const current = attemptRef.current;
    if (!current || current.phase !== 'active') return;
    const next: AutoAttempt = { ...current, phase: 'completed', assisted: true, answerRevealed: true, updatedAt: Date.now(), audit: {
      outcome: 'incomplete', moves: [], playedOwnMoves: Math.ceil(current.moves.length / 2), requiredOwnMoves,
      maxLossCp: null, terminalResult: null,
      summary: 'Попытка завершена сдачей. Ответ открыт для изучения; самостоятельное решение не засчитано.',
      limits: 'При сдаче движковая проверка не выполнялась. Качество сыгранных ходов не оценивалось.',
    } };
    attemptRef.current = next; setAttempt(next);
    engineRef.current?.dispose(); engineRef.current = null;
    setEngineBusy(false); setEngineError(null); setAuditProgress(null); setReviewPly(current.moves.length);
    setReferenceLine(0); setReferencePly(0); setExplorationFen(null);
    persistCompletedAttempt(next);
  }

  function makeMove(from: Square, to: Square, promotion?: string): boolean {
    const current = attemptRef.current;
    if (!current || current.phase !== 'active' || !current.planLocked || !played || engineBusy || played.game.turn() !== humanSide) return false;
    try {
      const game = replay(current.initialFen, current.moves).game;
      if (game.turn() !== humanSide) return false;
      const move = game.move({ from, to, promotion: promotion?.slice(-1).toLowerCase() || 'q' });
      storeAttempt({ ...current, moves: [...current.moves, `${move.from}${move.to}${move.promotion || ''}`], updatedAt: Date.now() });
      return true;
    } catch { return false; }
  }

  if (attemptConflict) return <div className="course-empty"><h2>Попытка изменилась в другой вкладке</h2><p>Сохранённая попытка не была заменена. Обнови страницу, чтобы продолжить её; при работе в нескольких вкладках играй в одной из них.</p><button type="button" className="course-primary" onClick={() => window.location.reload()}>Обновить позицию</button><Link href="/train">К сохранённой очереди →</Link></div>;
  if (!loaded || !attempt) return <div className="course-loading" role="status">Подготовка попытки…</div>;
  if (!played || attempt.initialFen !== exercise.initialFen) return <div className="course-empty"><h2>Сохранённая позиция недоступна</h2><p>Запись попытки не совпадает с текущим упражнением. Она сохранена; автоматическая оценка не выставлена.</p></div>;

  const completed = attempt.phase === 'completed';
  const answerRevealed = completed && attempt.answerRevealed === true;
  const audit = attempt.audit;
  const referenceLines = [{ title: 'Учебный вариант', san: exercise.solutionSan, explanation: exercise.explanation }, ...(exercise.alternativeLines || [])];
  const selectedReference = referenceLines[referenceLine] || referenceLines[0];
  function chooseReference(line: number, ply: number) {
    setReferenceLine(line); setReferencePly(ply); setExplorationFen(null);
  }
  function chooseAttemptPly(ply: number) {
    setReferencePly(null); setReviewPly(ply); setExplorationFen(null);
  }
  let reference: ReturnType<typeof replay> | null = null;
  if (answerRevealed && referencePly !== null) {
    try {
      const game = new Chess(exercise.initialFen); const uci = selectedReference.san.map((san) => { const move = game.move(san); return `${move.from}${move.to}${move.promotion || ''}`; });
      reference = replay(exercise.initialFen, uci);
    } catch { reference = null; }
  }
  const displayedPly = reference ? referencePly || 0 : completed && audit ? reviewPly : attempt.moves.length;
  const displayedFens = reference?.fens || played.fens;
  const fen = displayedFens[Math.min(displayedPly, displayedFens.length - 1)] || exercise.initialFen;
  const currentTurn = fen.split(' ')[1] === 'w' ? 'Белые' : 'Чёрные';
  const firstBlack = exercise.initialFen.split(' ')[1] === 'b';
  const startMoveNumber = Number(exercise.initialFen.split(' ')[5]) || 1;
  const moveLabel = (ply: number) => `${startMoveNumber + Math.floor((ply + (firstBlack ? 1 : 0)) / 2)}${(ply + (firstBlack ? 1 : 0)) % 2 ? '…' : '.'}`;
  const selectedOption = exercise.decision?.options.find((option) => option.id === attempt.choiceId);
  const ownMoves = Math.ceil(attempt.moves.length / 2);
  const analysisUrl = `https://lichess.org/analysis/standard/${encodeURIComponent(played.game.fen())}`;

  return <section className="course-workspace course-auto-workspace" aria-label="Практика с ответами соперника">
    <div className="course-board-column">
      {answerRevealed && explorationFen ? <VariationExplorer key={explorationFen} initialFen={explorationFen} orientation={exercise.orientation} onClose={() => setExplorationFen(null)} /> : <>
      <div className="course-board-meta"><span>{completed ? reference ? selectedReference.title : 'Твоя попытка' : !attempt.planLocked ? 'Исходная позиция' : 'Соперник отвечает'}</span><span className="course-turn"><span className={fen.split(' ')[1] === 'w' ? 'course-piece-indicator course-piece-white' : 'course-piece-indicator'} />{currentTurn}: ход</span></div>
      <ChessboardWrapper key={attempt.id} position={fen} hudGameOver={!reference && displayedPly === attempt.moves.length && played.game.isGameOver()} orientation={exercise.orientation} boardWidth={640} onMove={makeMove} isInteractive={!completed && attempt.planLocked && !engineBusy && played.game.turn() === humanSide} showLegalMoves={false} playSoundEffects={false} lastMove={null} className="course-board" />
      <div className="course-board-caption"><span>{conceal && !answerRevealed ? 'Тема и источник скрыты до показа ответа' : exercise.provenance.game || 'Учебная позиция'}</span><span>Ты играешь {humanSide === 'w' ? 'белыми' : 'чёрными'}</span></div>
      <div className="course-board-actions">{answerRevealed && <button type="button" className="course-restart" onClick={() => setExplorationFen(fen)}>Разыграть отсюда</button>}<button type="button" className="course-restart" onClick={restartPosition} disabled={!storageAvailable || (!completed && !attempt.moves.length)}><RotateCcw size={15} aria-hidden="true" />Начать заново</button></div>
      {restartError && <p className="course-engine-error" role="alert">{restartError}</p>}
      <p className="course-local-note">{storageAvailable ? 'Эта попытка сохранена. После перезагрузки продолжишь с той же позиции.' : 'Сохранение в браузере недоступно. Не закрывай страницу, пока попытка не завершена.'}</p>
      </>}
    </div>
    <div className="course-work-panel">
      <div className="course-panel-top"><span className="course-eyebrow">Задание {String(index + 1).padStart(2, '0')} / {completed ? 'Разбор попытки' : 'Практика'}</span></div>
      <h2>{answerRevealed ? exercise.title : conceal ? 'Оцени позицию и выбери продолжение.' : exercise.task}</h2><p className="course-prompt">{conceal && !answerRevealed ? 'Сравни кандидатов, найди сильнейший ответ соперника и оцени конец варианта. Здесь смешаны атака, защита и спокойные решения; мотив заранее не указан.' : exercise.prompt}</p>

      {!completed && !attempt.planLocked && trainingSessionId ? <div className="course-preparation">
        <p className="course-step-label">01 — Рассчитай до первого хода</p>
        <label>Какие ходы сравниваешь?<textarea value={preparation.candidates} maxLength={240} placeholder="Минимум два кандидата и короткое сравнение" onChange={event => { const next = { ...preparation, candidates: event.target.value }; setPreparation(next); storeAttempt({ ...attempt, preparation: next, updatedAt: Date.now() }); }} /></label>
        <label>Какой ответ соперника самый неприятный?<textarea value={preparation.defense} maxLength={320} placeholder="Основная ветка и критическое ответвление" onChange={event => { const next = { ...preparation, defense: event.target.value }; setPreparation(next); storeAttempt({ ...attempt, preparation: next, updatedAt: Date.now() }); }} /></label>
        <label>Как оцениваешь конечную позицию?<textarea value={preparation.evaluation} maxLength={240} placeholder="Материал, короли, активность; что получено" onChange={event => { const next = { ...preparation, evaluation: event.target.value }; setPreparation(next); storeAttempt({ ...attempt, preparation: next, updatedAt: Date.now() }); }} /></label>
        <p className="course-instruction">Запись сохранится для сравнения с разбором. Текст оцениваешь ты сам; движок проверит сыгранные ходы.</p>
        <button type="button" className="course-primary" disabled={!preparation.candidates.trim() || !preparation.defense.trim() || !preparation.evaluation.trim()} onClick={() => storeAttempt({ ...attempt, preparation, planLocked: true, updatedAt: Date.now() })}>Зафиксировать расчёт и играть →</button>
        <button type="button" className="course-text-button" onClick={finishAttempt}>Не смог рассчитать — завершить попытку</button>
        <button type="button" className="course-text-button" onClick={surrender}>Сдаться и показать ответ</button>
      </div> : !completed && !attempt.planLocked && exercise.decision ? <div className="course-decision">
        <p className="course-step-label">01 — Зафиксируй план</p>
        <fieldset><legend className="course-sr-only">Выбери план до первого хода</legend>{exercise.decision.options.map((option, optionIndex) => <label key={option.id} className={`course-option ${choice === option.id ? 'course-option-selected' : ''}`}><input type="radio" name={`auto-decision-${exercise.id}`} checked={choice === option.id} onChange={() => setChoice(option.id)} /><span className="course-option-letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option.label}</span></label>)}</fieldset>
        <p className="course-instruction">Разберём оценку после попытки. Сейчас ответ не показывается.</p>
        <button type="button" className="course-primary" disabled={!choice} onClick={() => storeAttempt({ ...attempt, choiceId: choice || undefined, planLocked: true, updatedAt: Date.now() })}>Зафиксировать и играть →</button>
        <button type="button" className="course-text-button" onClick={surrender}>Сдаться и показать ответ</button>
      </div> : !completed ? <div>
        <p className="course-step-label">02 — Проведи план</p>
        <p className="course-instruction">Делай свои ходы. Соперник отвечает на текущую позицию, в том числе на ходы за пределами учебной линии. Оценка появится после завершения.</p>
        <div className={`course-move-list ${!played.san.length ? 'course-move-list-empty' : ''}`} aria-label="Ходы попытки">{played.san.length ? played.san.map((san, ply) => <span className="course-written-move" key={ply}><span>{moveLabel(ply)}</span>{san}</span>) : <span>Сделай первый ход на доске</span>}</div>
        <p className="course-auto-turn" role="status">{engineBusy ? 'Соперник обдумывает ответ…' : engineError ? 'Ответ соперника пока недоступен.' : played.game.turn() === humanSide ? 'Твой ход' : 'Ожидаем ответ соперника…'}<span>{ownMoves} / {requiredOwnMoves} своих ходов</span></p>
        {attempt.assisted && <p className="course-instruction">Это повторная или учебная попытка. Первоначальный результат сохранён отдельно.</p>}
        <button type="button" className="course-primary" onClick={finishAttempt}>Проверить результат →</button>
        <button type="button" className="course-text-button" onClick={surrender}>Сдаться и показать ответ</button>
      </div> : !audit ? <div className="course-auto-pending"><p className="course-step-label">03 — Проверка попытки</p><p role="status">{engineBusy ? `Проверяем твои ходы${auditProgress ? `: ${auditProgress[0]} / ${auditProgress[1]}` : '…'}` : 'Попытка сохранена. Анализ можно продолжить.'}</p><p className="course-instruction">Движок сравнивает оценку до и после каждого твоего хода. Ответ останется скрытым, пока ты сам его не откроешь.</p>{!answerRevealed && <button type="button" className="course-text-button" onClick={showAnswer}>Показать ответ</button>}</div> : <div className="course-auto-audit">
        <p className="course-step-label">03 — Результат</p><div className="course-feedback"><strong>{OUTCOME_LABELS[audit.outcome]}</strong><p>{audit.summary}</p><p>{trainingSessionId ? 'Результат этой попытки сохранён в журнале. Знакомство с разбором не равно освоению: закрепление проверяется отдельно спустя время.' : attempt.isFirstAttempt && !attempt.assisted && audit.outcome === 'passed' ? 'Первая попытка зачтена самостоятельно.' : attempt.isFirstAttempt && !attempt.assisted ? 'Результат первой попытки зафиксирован. Следующие попытки идут в повторение.' : 'Повторение: результат первой попытки сохранён отдельно.'}</p></div>
        {!answerRevealed && <div className="course-answer-hidden"><p>Ответ скрыт. Можно начать эту позицию заново и проверить другую идею.</p><button type="button" className="course-primary" onClick={showAnswer}>Показать ответ</button></div>}
        {answerRevealed && <>
        {attempt.preparation && <details className="course-auto-reference"><summary>Твой расчёт до первого хода</summary><p><strong>Кандидаты:</strong> {attempt.preparation.candidates}</p><p><strong>Сильный ответ:</strong> {attempt.preparation.defense}</p><p><strong>Конечная оценка:</strong> {attempt.preparation.evaluation}</p></details>}
        {selectedOption && <div className="course-auto-plan"><strong>{attempt.choiceId === exercise.decision?.correctOptionId ? 'Исходный план обоснован' : 'Исходную оценку стоит пересмотреть'}</strong><p>{selectedOption.explanation}</p></div>}
        <div className="course-audit-moves" aria-label="Анализ своих ходов">{audit.moves.map((move) => <div key={move.ply} className="course-audit-move"><button type="button" onClick={() => chooseAttemptPly(move.ply)}><span>{moveLabel(move.ply - 1)} {move.san}</span><span>{move.classification === 'sound' ? 'Без существенной потери' : move.classification === 'inaccuracy' ? 'Есть неточность' : move.classification === 'mistake' ? 'Существенная потеря' : 'Не подтверждено'}{move.lossCp !== null ? ` · −${(move.lossCp / 100).toFixed(2)}` : ''}</span></button>{move.classification !== 'sound' && move.bestSan && <p>Сравни с {move.bestSan}{move.bestLineSan.length ? `: ${move.bestLineSan.join(' ')}` : ''}</p>}</div>)}</div>
        <div className="course-review-controls"><button type="button" onClick={() => reference ? chooseReference(referenceLine, 0) : chooseAttemptPly(0)} aria-label="Исходная позиция">|←</button><button type="button" onClick={() => reference ? chooseReference(referenceLine, Math.max(0, (referencePly || 0) - 1)) : chooseAttemptPly(Math.max(0, reviewPly - 1))} disabled={displayedPly === 0} aria-label="Предыдущий ход">←</button><span>{displayedPly} / {displayedFens.length - 1}</span><button type="button" onClick={() => reference ? chooseReference(referenceLine, Math.min(reference.fens.length - 1, (referencePly || 0) + 1)) : chooseAttemptPly(Math.min(played.san.length, reviewPly + 1))} disabled={displayedPly >= displayedFens.length - 1} aria-label="Следующий ход">→</button><button type="button" onClick={() => reference ? chooseReference(referenceLine, reference.fens.length - 1) : chooseAttemptPly(played.san.length)} aria-label={reference ? 'Конец учебного варианта' : 'Конец своей попытки'}>→|</button></div>
        <p className="course-audit-limits">{audit.limits}</p><a className="course-analysis-link" href={analysisUrl} target="_blank" rel="noreferrer">Проверить свою позицию в анализаторе ↗</a>
        </>}
        {audit.outcome === 'unverified' && <button type="button" className="course-text-button" onClick={() => { engineRef.current?.dispose(); engineRef.current = null; storeAttempt({ ...attempt, audit: undefined, updatedAt: Date.now() }); setRetry(value => value + 1); }}>Повторить проверку сохранённой попытки</button>}
        {audit.outcome !== 'unverified' && (onNext ? <button type="button" className="course-primary" disabled={!storageAvailable} onClick={onNext}>Следующее задание →</button> : <Link className="course-primary" href="/">Вернуться к главам →</Link>)}
      </div>}
      {answerRevealed && <div className="course-answer" aria-label="Ответ и объяснение">
        <h3>Варианты для изучения</h3>
        {referenceLines.length > 1 && <label className="course-line-select">Вариант<select value={referenceLine} onChange={event => chooseReference(Number(event.target.value), 0)}>{referenceLines.map((line, lineIndex) => <option key={lineIndex} value={lineIndex}>{line.title}</option>)}</select></label>}
        <p className="course-explanation">{selectedReference.explanation}</p>
        <div className="course-move-list" aria-label="Учебный вариант">{selectedReference.san.map((san, ply) => <button key={ply} type="button" className={referencePly === ply + 1 ? 'course-move-active' : ''} onClick={() => chooseReference(referenceLine, ply + 1)}><span>{moveLabel(ply)}</span>{san}</button>)}</div>
        <p className="course-instruction">Выбери ход в любом варианте, затем нажми «Разыграть отсюда» под доской, чтобы проверить своё продолжение.</p>
        {exercise.trainingMeta && <div className="course-training-source"><p>Рейтинг задачи в исходной базе: {exercise.trainingMeta.sourceRating} Lichess Puzzle. Это другая шкала, не рейтинг игры Chess.com.</p>{exercise.sources.map(source => <a key={source.url} className="course-analysis-link" href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</div>}
      </div>}
      {engineError && <div className="course-engine-error" role="status"><p>Движок недоступен: {engineError}</p><p>Ходы сохранены. Оценка не выставлена.</p><button type="button" className="course-text-button" onClick={() => { engineRef.current?.dispose(); engineRef.current = null; setRetry((value) => value + 1); }}>Повторить подключение</button></div>}
      {!storageAvailable && <div className="course-engine-error" role="alert"><p>Не удалось сохранить текущие изменения. Не закрывай страницу: переход к следующей позиции заблокирован до сохранения.</p><button type="button" className="course-text-button" onClick={() => attempt.audit ? persistCompletedAttempt(attempt) : storeAttempt(attempt)}>Повторить сохранение</button></div>}
    </div>
  </section>;
}
