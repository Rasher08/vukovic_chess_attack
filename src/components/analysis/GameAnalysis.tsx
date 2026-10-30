'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Square as ChessSquare } from 'chess.js';
import { ArrowLeft, ArrowRight, ChevronsLeft, ChevronsRight, FileUp, FlipVertical2, Gem, Play, Square, Upload } from 'lucide-react';
import { ReviewBoard } from './ReviewBoard';
import { VariationExplorer } from '@/components/course/VariationExplorer';
import { parseReviewPgn, summarizeReview } from '@/lib/gameReview';
import { runReviewWithRecovery, type ReviewRecoveryState } from '@/lib/reviewRecovery';
import { estimateGameQuality, parsePgnRating, GAME_QUALITY_MODEL_INFO, type GameQualityRating, type GameRatingBaselines } from '@/lib/gameQualityRating';
import { loadSavedReviews, saveReview } from '@/lib/gameReviewStorage';
import type { ReviewGame, ReviewMoveResult, ReviewPlayerSummary, ReviewReport } from '@/types/gameReview';
import { EvalChart } from './EvalChart';
import { EngineLinePlayer, type EngineLinePreview } from './EngineLinePlayer';
import { recognizeOpening, OPENING_THEORY_SOURCE, type OpeningReview } from '@/lib/openingTheory';
import { buildEngineLine } from '@/lib/engineLine';
import { ReviewGradeSymbol } from './ReviewGradeSymbol';
import { reviewPresentation, reviewExplanation, hasVerifiedAdventure, REVIEW_ADVENTURE_LABEL, REVIEW_ADVENTURE_DESCRIPTION, REVIEW_DISPLAY_LABELS, type ReviewDisplayKind } from '@/lib/reviewPresentation';
import './game-analysis.css';

const DEMO_PGN = `[Event "Демонстрация · Оперная партия"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]
[Date "1858.??.??"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

const BRILLIANT_DEMO_PGN = `[Event "Учебный фрагмент · Две жертвы слонов"]
[White "Emanuel Lasker"]
[Black "Johann Bauer"]
[Date "1889.??.??"]
[Result "*"]
[SetUp "1"]
[FEN "r4rk1/1b2bppp/ppq1p3/2ppB2n/5P2/1P1BP3/P1PPQ1PP/R4RK1 w - - 0 15"]

15. Bxh7+ Kxh7 16. Qxh5+ Kg8 17. Bxg7 Kxg7 18. Qg4+ Kh7 19. Rf3 e5 20. Rh3+ Qh6 21. Rxh6+ Kxh6 22. Qd7 *`;

const COUNTS: ReviewDisplayKind[] = ['trilliant', 'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced', 'unverified'];

function playerName(game: ReviewGame, color: 'w' | 'b') { return game.headers[color === 'w' ? 'White' : 'Black'] || (color === 'w' ? 'Белые' : 'Чёрные'); }
type RatingDraft = { white: string; black: string };
function ratingDraftFor(game: ReviewGame, overrides: GameRatingBaselines = {}): RatingDraft {
  return Object.fromEntries((['white', 'black'] as const).map(color => [color, String((Object.prototype.hasOwnProperty.call(overrides, color) ? overrides[color] : parsePgnRating(game.headers[color === 'white' ? 'WhiteElo' : 'BlackElo'])) ?? '')])) as RatingDraft;
}
function readRatingDraft(game: ReviewGame, draft: RatingDraft): GameRatingBaselines | null {
  const overrides: GameRatingBaselines = {};
  for (const color of ['white', 'black'] as const) {
    const value = draft[color].trim();
    const parsed = parsePgnRating(value);
    if (value && parsed === null) return null;
    const original = parsePgnRating(game.headers[color === 'white' ? 'WhiteElo' : 'BlackElo']);
    if (parsed !== original) overrides[color] = parsed;
  }
  return overrides;
}
function withRatingOverrides(report: ReviewReport, overrides: GameRatingBaselines): ReviewReport {
  return { ...report, performanceRatings: Object.keys(overrides).length ? { version: 1, ...overrides } : undefined };
}
function moveName(move: { moveNumber: number; color: 'w' | 'b'; san: string }) { return `${move.moveNumber}${move.color === 'w' ? '.' : '…'} ${move.san}`; }
function quality(accuracy: number | null) {
  return accuracy === null ? 'Нет оценки' : accuracy >= 95 ? 'Очень точная игра' : accuracy >= 85 ? 'Уверенная игра' : accuracy >= 70 ? 'Есть упущения' : 'Много упущений';
}
function scoreLabel(move: ReviewMoveResult | undefined, initial = false) {
  if (!move || move.classification === 'unverified') return '—';
  const score = initial ? move.beforeScore : move.playedScore;
  if (score?.kind === 'mate') {
    const sign = Math.sign(score.value || -1) * (move.color === 'w' ? 1 : -1);
    return `${sign > 0 ? '+' : '−'}M${Math.abs(score.value)}`;
  }
  const cp = initial ? move.beforeCpWhite : move.afterCpWhite;
  return cp === null ? '—' : `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}`;
}
function whitePercent(move: ReviewMoveResult | undefined, initial = false) {
  if (!move || move.classification === 'unverified') return null;
  const score = initial ? move.beforeScore : move.playedScore;
  if (score?.kind === 'mate') return (Math.sign(score.value || -1) * (move.color === 'w' ? 1 : -1)) > 0 ? 100 : 0;
  const cp = initial ? move.beforeCpWhite : move.afterCpWhite;
  return cp === null ? null : 100 / (1 + Math.exp(-0.00368208 * cp));
}

export function GameAnalysis() {
  const [draft, setDraft] = useState('');
  const [view, setView] = useState<'overview' | 'review'>('overview');
  const [showLine, setShowLine] = useState(false);
  const [showArrows, setShowArrows] = useState(true);
  const [lineSession, setLineSession] = useState(0);
  const [engineLinePreview, setEngineLinePreview] = useState<{ gameId: string; sourcePly: number; position: EngineLinePreview } | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [game, setGame] = useState<ReviewGame | null>(null);
  const [results, setResults] = useState<ReviewMoveResult[]>([]);
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [selectedPly, setSelectedPly] = useState(0);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [explorationFen, setExplorationFen] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'stopped' | 'incomplete'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [nodes, setNodes] = useState(200000);
  const [history, setHistory] = useState<ReviewReport[]>([]);
  const [importOpen, setImportOpen] = useState(true);
  const [readingFile, setReadingFile] = useState(false);
  const [recovery, setRecovery] = useState<ReviewRecoveryState | null>(null);
  const [ratingDraft, setRatingDraft] = useState<RatingDraft>({ white: '', black: '' });
  const [ratingOverrides, setRatingOverrides] = useState<GameRatingBaselines>({});
  const [ratingError, setRatingError] = useState<string | null>(null);
  const analysisNodesRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);
  const fileRef = useRef(0);
  const mountedRef = useRef(true);
  const busy = status === 'running';

  useEffect(() => {
    mountedRef.current = true;
    try { setHistory(loadSavedReviews()); } catch { /* A new import remains available if history cannot be read. */ }
    return () => { mountedRef.current = false; runRef.current += 1; fileRef.current += 1; abortRef.current?.abort(); };
  }, []);

  function stopEngine() {
    runRef.current += 1;
    abortRef.current?.abort(); abortRef.current = null;
    setRecovery(null);
  }
  function selectPly(ply: number) { setSelectedPly(ply); setExplorationFen(null); setEngineLinePreview(null); setLineSession(value => value + 1); }
  function openReview(ply?: number) { if (ply !== undefined) selectPly(ply); setImportOpen(false); setView('review'); }
  function loadPgn(text: string) {
    try {
      const next = parseReviewPgn(text);
      setRatingDraft(ratingDraftFor(next)); setRatingOverrides({}); setRatingError(null);
      fileRef.current += 1; setReadingFile(false);
      stopEngine(); analysisNodesRef.current = null; setEngineLinePreview(null); setGame(next); setDraft(text); setResults([]); setReport(null); setSelectedPly(0);
      setExplorationFen(null); setStatus('idle'); setError(null); setSaveError(null); setImportOpen(false); setView('overview');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось прочитать PGN.'); }
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    const token = ++fileRef.current;
    if (file.size > 100000) { setReadingFile(false); setError('Выбери PGN до 100 КБ с одной партией.'); return; }
    setReadingFile(true); setError(null);
    try {
      const text = await file.text();
      if (mountedRef.current && fileRef.current === token) loadPgn(text);
    } catch { if (mountedRef.current && fileRef.current === token) setError('Не удалось прочитать файл. Можно вставить PGN текстом.'); }
    finally { if (mountedRef.current && fileRef.current === token) setReadingFile(false); }
  }
  function remember(next: ReviewReport) {
    if (!next.completed) return;
    const saved = saveReview(next);
    setSaveError(saved.saved ? null : saved.error || 'Не удалось сохранить разбор в браузере.');
    if (saved.saved) setHistory(loadSavedReviews());
  }
  function applyRatings() {
    if (!game || busy) return;
    const overrides = readRatingDraft(game, ratingDraft);
    if (!overrides) { setRatingError('Укажи целый рейтинг от 100 до 4000 или оставь поле пустым.'); return; }
    setRatingOverrides(overrides); setRatingError(null);
    if (report?.completed) {
      const next = withRatingOverrides(report, overrides);
      setReport(next); remember(next);
    }
  }
  async function startAnalysis() {
    if (!game || busy) return;
    const overrides = readRatingDraft(game, ratingDraft);
    if (!overrides) { setRatingError('Укажи целый рейтинг от 100 до 4000 или оставь поле пустым.'); return; }
    setRatingOverrides(overrides); setRatingError(null);
    const resume = status !== 'completed' && analysisNodesRef.current === nodes ? results.filter(move => move.classification !== 'unverified') : [];
    stopEngine();
    const generation = ++runRef.current;
    const controller = new AbortController(); abortRef.current = controller;
    analysisNodesRef.current = nodes;
    const snapshot = game;
    setEngineLinePreview(null); setView('overview'); setStatus('running'); setResults(resume); setReport(null); setError(null); setSaveError(null); setExplorationFen(null); setRecovery(null);
    const current = () => mountedRef.current && runRef.current === generation && !controller.signal.aborted;
    try {
      const analyzed = await runReviewWithRecovery(snapshot, { nodes, signal: controller.signal, resumeResults: resume,
        onProgress: verified => { if (current()) setResults(verified); },
        onRecovery: state => { if (current()) setRecovery(state); },
      });
      if (!current()) return;
      const next = withRatingOverrides(analyzed, overrides);
      setResults(next.results); setReport(next); setStatus(next.completed ? 'completed' : 'incomplete'); setRecovery(null);
      if (next.completed) {
        remember(next);
        const highlight = next.results.find(move => ['trilliant', 'brilliant', 'great'].includes(reviewPresentation(move).kind)) || next.results.find(move => ['blunder', 'mistake', 'miss'].includes(reviewPresentation(move).kind));
        setSelectedPly(previous => previous || highlight?.ply || 1);
      } else setError('Часть ходов ещё не проверена. Можно продолжить с сохранённого места.');
    } catch (caught) {
      if (!current()) return;
      setStatus('incomplete'); setRecovery(null); setError(caught instanceof Error ? caught.message : 'Не удалось продолжить проверку этой записи партии.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }
  function openSaved(next: ReviewReport) {
    const { version: _version, ...overrides } = next.performanceRatings || { version: 1 as const };
    setRatingOverrides(overrides); setRatingDraft(ratingDraftFor(next.game, overrides)); setRatingError(null);
    fileRef.current += 1; setReadingFile(false);
    stopEngine(); analysisNodesRef.current = next.nodes; setEngineLinePreview(null); setGame(next.game); setDraft(next.game.pgn); setResults(next.results); setReport(next);
    setSelectedPly(0); setExplorationFen(null); setStatus('completed'); setError(null); setSaveError(null); setNodes(next.nodes); setImportOpen(false); setView('overview');
  }

  const opening = useMemo(() => game ? recognizeOpening(game) : null, [game]);
  const independent = useMemo(() => game && opening ? summarizeReview(game, results.filter(move => !opening.bookByPly[move.ply])) : null, [game, results, opening]);
  const independentCount = (color: 'w' | 'b') => results.filter(move => move.color === color && !opening?.bookByPly[move.ply] && !['forced', 'unverified'].includes(move.classification)).length;
  const displayCounts = useMemo(() => {
    const counts = { w: {} as Record<ReviewDisplayKind, number>, b: {} as Record<ReviewDisplayKind, number> };
    for (const move of results) { const kind = reviewPresentation(move, opening?.bookByPly[move.ply]).kind; counts[move.color][kind] = (counts[move.color][kind] || 0) + 1; }
    return counts;
  }, [results, opening]);
  const selectedMove = game?.moves[selectedPly - 1];
  const resultsByPly = useMemo(() => new Map(results.map(move => [move.ply, move])), [results]);
  const selectedResult = resultsByPly.get(selectedPly);
  const selectedBook = opening?.bookByPly[selectedPly];
  const selectedAdventure = selectedResult ? hasVerifiedAdventure(selectedResult) : false;
  const selectedPresentation = selectedResult ? reviewPresentation(selectedResult, selectedBook) : null;
  const fen = selectedMove?.fenAfter || game?.initialFen || '';
  const linePreview = showLine && selectedResult && engineLinePreview?.gameId === game?.id && engineLinePreview?.sourcePly === selectedPly ? engineLinePreview.position : null;
  const boardFen = linePreview?.fen || fen;
  const engineLine = useMemo(() => selectedResult ? buildEngineLine(selectedResult.fenBefore, selectedResult.pvSan.length ? selectedResult.pvSan : selectedResult.bestSan ? [selectedResult.bestSan] : []).steps : [], [selectedResult]);
  const nextLineMove = showLine && !explorationFen ? engineLine.find(step => step.fenBefore === boardFen) : undefined;
  const engineArrows: [ChessSquare, ChessSquare, string?][] = showArrows && nextLineMove ? [[nextLineMove.uci.slice(0, 2) as ChessSquare, nextLineMove.uci.slice(2, 4) as ChessSquare, 'rgba(212, 156, 64, 0.9)']] : [];
  const adventureCounts = useMemo(() => ({ w: results.filter(move => move.color === 'w' && hasVerifiedAdventure(move)).length, b: results.filter(move => move.color === 'b' && hasVerifiedAdventure(move)).length }), [results]);
  const boardMove = linePreview ? linePreview.move ? { ...linePreview.move, ply: linePreview.move.index } : undefined : selectedMove;
  const cpResult = selectedPly ? selectedResult : results[0];
  const evaluation = scoreLabel(cpResult, selectedPly === 0);
  const percentage = whitePercent(cpResult, selectedPly === 0);
  const progress = game ? Math.round(results.length / game.moves.length * 100) : 0;
  const final = report?.completed === true && status === 'completed';
  const gameQuality = useMemo(() => report?.completed && opening ? estimateGameQuality(report, opening, ratingOverrides) : null, [report, opening, ratingOverrides]);

  useEffect(() => {
    if (view !== 'review' || !game || explorationFen) return;
    const lastPly = game.moves.length;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || target?.closest('input,textarea,select,[contenteditable=true],[role=slider],[data-engine-line-player]')) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      setSelectedPly(ply => event.key === 'Home' ? 0 : event.key === 'End' ? lastPly : Math.max(0, Math.min(lastPly, ply + (event.key === 'ArrowRight' ? 1 : -1))));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, game, explorationFen]);

  useEffect(() => { window.scrollTo(0, 0); }, [view, game?.id]);
  useEffect(() => {
    setEngineLinePreview(current => view === 'review' && current?.gameId === game?.id && current?.sourcePly === selectedPly ? current : null);
  }, [view, game?.id, selectedPly]);

  function jumpToCategory(classification: ReviewDisplayKind) {
    const next = results.find(move => reviewPresentation(move, opening?.bookByPly[move.ply]).kind === classification && move.ply > selectedPly) || results.find(move => reviewPresentation(move, opening?.bookByPly[move.ply]).kind === classification);
    if (next) openReview(next.ply);
  }

  function jumpToAdventure() {
    const next = results.find(move => move.ply > selectedPly && hasVerifiedAdventure(move)) || results.find(hasVerifiedAdventure);
    if (next) openReview(next.ply);
  }

  const runControls = <>
    <div className="analysis-run-controls"><label>Глубина проверки<select aria-label="Глубина анализа" value={nodes} disabled={busy} onChange={event => setNodes(Number(event.target.value))}><option value={50000}>Быстрая · 50 тыс. узлов</option><option value={200000}>Обычная · 200 тыс. узлов</option><option value={1000000}>Глубокая · 1 млн узлов</option></select></label>{busy ? <button type="button" className="analysis-primary" onClick={() => { stopEngine(); setStatus('stopped'); }}><Square size={13} />Остановить</button> : <button type="button" className="analysis-primary" disabled={readingFile} onClick={() => { void startAnalysis(); }}><Play size={14} />{results.length ? !final && analysisNodesRef.current === nodes ? 'Продолжить анализ' : 'Пересчитать' : 'Начать анализ'}</button>}</div>
    {busy && <div className="analysis-progress" role="status"><div><span style={{ width: `${progress}%` }} /></div><p>Проверено {results.length} / {game?.moves.length} полуходов · {progress}%</p><p className="analysis-recovery-note">{recovery ? `Повторяем проверку хода ${results.length + 1}. Движок перезапустится автоматически; готовые результаты остаются.` : game?.moves[results.length] ? `Проверяем ${moveName(game.moves[results.length])}…` : 'Завершаем разбор…'}</p></div>}
    {!final && results.length > 0 && !busy && <p className="analysis-note">Проверено {results.filter(move => move.classification !== 'unverified').length} / {game?.moves.length}. Неполный разбор не сохраняется как готовый.</p>}
  </>;
  const method = <details className="analysis-method"><summary>Как считается оценка</summary>
    <p>Разбор nonchalant по Stockfish 19 Lite. Метки и точность могут отличаться от Chess.com и других сервисов.</p>
    <p>Основная точность считается по потерям расчётных шансов на ходах вне дебютной базы. Теория и вынужденные ходы исключены. Если таких ходов нет, показывается «—».</p>
    <p>Рейтинг партии берёт исходный рейтинг игрока из PGN или поля «Рейтинги игроков» и добавляет поправку за качество ходов. Один итог округляется до {GAME_QUALITY_MODEL_INFO.ratingStep}. Сильная партия повышает оценку, слабая снижает; поправка ограничена {GAME_QUALITY_MODEL_INFO.maxAdjustment} пунктами в каждую сторону. Общего потолка 2550 нет.</p>
    <p>Качество сравнивается с ожидаемыми потерями для исходного уровня. Опора для этой кривой — <a href={GAME_QUALITY_MODEL_INFO.sourceUrl} target="_blank" rel="noreferrer">партии CSSLab / Lichess</a>. Для числа нужна партия с обычной начальной позиции длиной от 40 полуходов и {GAME_QUALITY_MODEL_INFO.minDecisions} самостоятельных решений за цвет в позициях с оценкой до четырёх пешек. Теория, вынужденные ходы и уже решённые позиции исключены. Матовый зевок учитывается как потеря шансов. Имена и результат партии на поправку не влияют.</p>
    <p>Принцип соответствует <a href={GAME_QUALITY_MODEL_INFO.principleSourceUrl} target="_blank" rel="noreferrer">описанию Game Rating у Chess.com</a>; формула поправки у nonchalant своя. Ограничение в 800 — наша настройка, а не подтверждённая формула Chess.com. Это приблизительная оценка одной партии; перенос кривой Lichess на другие рейтинговые шкалы отдельно не калиброван. Она не определяет твой устойчивый игровой рейтинг.</p>
    <p>📖 «Теория» означает совпадение позиции и хода с открытой <a href={OPENING_THEORY_SOURCE.url} target="_blank" rel="noreferrer">базой Lichess</a>. {OPENING_THEORY_SOURCE.openingCount} вариантов, включая перестановки ходов; отсутствие в базе не означает новинку. Известные ошибки сохраняют движковую отметку.</p>
    <p>Метки сильных ходов и упущенных шансов проверяются отдельно. «Авантюрный» — дополнительная пометка ошибочной жертвы с единственным сильным ответом по анализу движка; ошибка остаётся ошибкой. <Link href="/analysis/guide">Все обозначения и критерии →</Link></p>
    <p>Расчёт шансов использует <a href="https://lichess.org/page/accuracy" target="_blank" rel="noreferrer">открытую формулу Lichess</a>; итоговая агрегация здесь своя. Для спорных позиций выбери большую глубину проверки. При сбое движка анализ продолжится автоматически с первого непроверенного хода; его можно остановить в любой момент.</p>
  </details>;

  return <div className={`analysis-shell is-${view}`}>
    {view === 'review' && game ? <header className="analysis-review-toolbar">
      <button type="button" className="analysis-back" onClick={() => { setExplorationFen(null); setView('overview'); }}><ArrowLeft size={16} />К сводке</button>
      <div><h1>{playerName(game, 'w')} <span>—</span> {playerName(game, 'b')}</h1><p>{[game.headers.Event, game.result !== '*' ? game.result : ''].filter(Boolean).join(' · ')}</p></div>
      <Link className="analysis-guide-link" href="/analysis/guide">Как читать разбор</Link><span className="analysis-key-hint">← → ходы</span>
    </header> : <header className="analysis-heading"><div><p className="analysis-eyebrow">ТВОИ ПАРТИИ · NONCHALANT</p><h1>{game ? 'Итоги партии' : 'Разбор игры'}</h1><p>{game ? 'Сначала общая картина. Затем — каждый важный момент.' : 'Найди упущенный момент. Сохрани сильное решение.'}</p></div>{game && <button type="button" className="analysis-secondary" disabled={busy} onClick={() => setImportOpen(value => !value)}><FileUp size={15} />Другая партия</button>}</header>}

    {view === 'overview' && <Link className="analysis-guide-link analysis-overview-guide" href="/analysis/guide">Как читать разбор: значки, точность и рейтинг →</Link>}
    {importOpen && view === 'overview' && <section className="analysis-import" aria-label="Загрузка партии">
      <div><label htmlFor="review-pgn">PGN партии</label><textarea id="review-pgn" spellCheck={false} disabled={busy || readingFile} value={draft} onChange={event => setDraft(event.target.value)} placeholder={'[White "Ты"]\n[Black "Соперник"]\n\n1. e4 e5 2. Nf3 Nc6 ...'} /><button type="button" className="analysis-primary" disabled={!draft.trim() || busy || readingFile} onClick={() => loadPgn(draft)}><Upload size={15} />Загрузить партию</button></div>
      <div className="analysis-file-panel"><span className="analysis-eyebrow">ИЛИ ИЗ ФАЙЛА</span><label className="analysis-file-button"><FileUp size={20} /><span>{readingFile ? 'Читаем файл…' : 'Выбрать файл PGN'}</span><input aria-label="Выбрать файл PGN" type="file" accept=".pgn,text/plain,application/x-chess-pgn" disabled={busy || readingFile} onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ''; }} /></label><p>Одна партия, до 100 КБ. Можно экспортировать из Chess.com или Lichess.</p><button type="button" className="analysis-text-button" disabled={busy || readingFile} onClick={() => loadPgn(DEMO_PGN)}>Попробовать на Оперной партии →</button><button type="button" className="analysis-text-button" disabled={busy || readingFile} onClick={() => loadPgn(BRILLIANT_DEMO_PGN)}>Пример с жертвой →</button><small>Ласкер — Бауэр, 1889: учебный фрагмент с 15-го хода. <a href="https://www.pgnmentor.com/players/Lasker/" target="_blank" rel="noreferrer">Источник позиции</a>.</small><small>Анализ выполняется на твоём устройстве. Готовые разборы сохраняются в этом браузере.</small></div>
    </section>}
    {error && <p className="analysis-error" role="alert">{error}</p>}
    {saveError && <div className="analysis-error" role="alert"><p>{saveError}</p><button type="button" onClick={() => report && remember(report)}>Повторить сохранение</button></div>}

    {!game ? <div className="analysis-empty"><Gem size={23} /><h2>У каждой партии есть свои моменты</h2><p>Точность за оба цвета, ошибки и сильные ходы, график оценки и свободный разбор вариантов.</p><span>«!!» — отметка проверенной жертвы по критерию nonchalant.</span></div> : view === 'overview' ? <div className="analysis-overview">
      <section className="analysis-summary" aria-label="Сводка анализа">
        <div className="analysis-panel-title"><h2>{final ? 'Точность и ключевые моменты' : busy ? 'Разбираем партию' : status === 'idle' ? 'Партия загружена' : 'Анализ не завершён'}</h2>{final && <span>{saveError ? 'Разбор готов' : 'Сохранено локально'}</span>}</div>
        <div className="analysis-accuracy"><AccuracyCard game={game} color="w" summary={independent?.white} moves={independentCount('w')} complete={final} /><AccuracyCard game={game} color="b" summary={independent?.black} moves={independentCount('b')} complete={final} /></div>
        {final && gameQuality && <section className="analysis-game-ratings" aria-label="Рейтинг партии"><div className="analysis-game-ratings-heading"><h3>Рейтинг партии</h3><span>Оценка качества игры</span></div><div className="analysis-game-ratings-values"><GameRating value={gameQuality.white} color="w" /><GameRating value={gameQuality.black} color="b" /></div></section>}
        <div className="analysis-counts-head"><span>Ходы</span><span>Белые</span><span aria-hidden="true" /><span>Чёрные</span></div>
        <div className="analysis-counts" aria-label="Классификация ходов">{COUNTS.filter(kind => !['forced', 'unverified'].includes(kind) || displayCounts.w[kind] || displayCounts.b[kind]).map(classification => <button type="button" key={classification} className={`is-${classification}`} disabled={!results.some(move => reviewPresentation(move, opening?.bookByPly[move.ply]).kind === classification)} onClick={() => jumpToCategory(classification)}><span>{REVIEW_DISPLAY_LABELS[classification]}</span><strong>{displayCounts.w[classification] || 0}</strong><i className={`analysis-badge is-${classification}`} aria-hidden="true"><ReviewGradeSymbol kind={classification} /></i><strong>{displayCounts.b[classification] || 0}</strong></button>)}</div>
        {(adventureCounts.w > 0 || adventureCounts.b > 0) && <div className="analysis-adventure-summary"><button type="button" onClick={jumpToAdventure}><span>Авантюрные</span><strong>{adventureCounts.w}</strong><i className="analysis-adventure-mark" aria-hidden="true">!??</i><strong>{adventureCounts.b}</strong></button><p>Дополнительная метка. Эти ходы уже учтены в основных категориях ошибок.</p></div>}
      </section>
      <aside className="analysis-overview-side" aria-label="Информация о партии">
        <div className="analysis-game-info"><span className="analysis-eyebrow">ПАРТИЯ</span><h2>{game.headers.Event || 'Своя партия'}</h2><p>{[game.headers.Date, game.result !== '*' ? game.result : 'Результат не указан', `${game.moves.length} полуходов`].filter(Boolean).join(' · ')}</p></div>
        {opening && <section className="analysis-opening" aria-label="Дебютная теория"><span className="analysis-eyebrow">ДЕБЮТ</span><h3>{opening.opening ? `${opening.opening.name}${opening.opening.eco ? ` · ${opening.opening.eco}` : ''}` : opening.hasOpeningStart ? 'Дебют пока не распознан' : 'Фрагмент партии'}</h3><p>{opening.hasOpeningStart ? `${Object.keys(opening.bookByPly).length} полуходов найдены в базе теории.` : 'Для определения дебюта нужна партия с начальной позиции.'}</p>{opening.hasOpeningStart && opening.firstIndependentPly && <button type="button" onClick={() => openReview(opening.firstIndependentPly!)}>Первый ход вне базы: {moveName(game.moves[opening.firstIndependentPly - 1])}<ArrowRight size={13} /></button>}{opening.hasOpeningStart && !opening.firstIndependentPly && <p>Весь загруженный отрезок — известные продолжения.</p>}</section>}
        <details className="analysis-rating-settings"><summary>Рейтинги игроков</summary><p>Берём из PGN. Если рейтинг отсутствует или нужен другой контроль времени, укажи его здесь.</p><form onSubmit={event => { event.preventDefault(); applyRatings(); }}><div>{(['white', 'black'] as const).map(color => <label key={color} htmlFor={`analysis-rating-${color}`}>{color === 'white' ? 'Белые' : 'Чёрные'}<input id={`analysis-rating-${color}`} type="number" inputMode="numeric" min="100" max="4000" step="1" placeholder="Рейтинг" disabled={busy} value={ratingDraft[color]} onChange={event => { setRatingDraft(value => ({ ...value, [color]: event.target.value })); setRatingError(null); }} /></label>)}</div><button className="analysis-secondary" type="submit" disabled={busy}>Применить рейтинги</button></form>{ratingError && <p className="analysis-error" role="alert">{ratingError}</p>}<small>Оценка обновится сразу, без повторного анализа ходов.</small></details>
        <EvalChart game={game} results={results} selectedPly={selectedPly} onSelect={ply => openReview(ply)} />
        <div className="analysis-overview-actions">{runControls}<button type="button" className="analysis-report-button" disabled={busy} onClick={() => openReview()}>{final ? 'Смотреть отчёт' : results.length ? 'Смотреть проверенные ходы' : 'Открыть доску'}<ArrowRight size={18} /></button></div>
        {method}
      </aside>
    </div> : <div className={`analysis-workspace${explorationFen ? ' is-exploring' : ''}`}>
      <div className={`analysis-board-column${linePreview ? ' is-line-preview' : ''}`}>
        {explorationFen ? <VariationExplorer key={explorationFen} initialFen={explorationFen} orientation={orientation} onClose={() => setExplorationFen(null)} /> : <>
          <PlayerBar game={game} color={orientation === 'white' ? 'b' : 'w'} />
          {linePreview && <div className="analysis-line-preview" role="status"><span>Линия движка</span><strong>{linePreview.move ? moveName(linePreview.move) : 'Исходная позиция варианта'}</strong></div>}
          <ReviewBoard position={boardFen} orientation={orientation} move={boardMove} result={linePreview ? undefined : selectedResult} book={linePreview ? undefined : selectedBook} evaluation={linePreview ? '—' : evaluation} percentage={linePreview ? null : percentage} customArrows={engineArrows} />
          <PlayerBar game={game} color={orientation === 'white' ? 'w' : 'b'} />
          <div className="analysis-board-controls"><button type="button" aria-label="Начало партии" onClick={() => selectPly(0)} disabled={!selectedPly}><ChevronsLeft size={18} /></button><button type="button" aria-label="Предыдущий ход" onClick={() => selectPly(Math.max(0, selectedPly - 1))} disabled={!selectedPly}><ArrowLeft size={18} /></button><span>{selectedPly} / {game.moves.length}</span><button type="button" aria-label="Следующий ход" onClick={() => selectPly(Math.min(game.moves.length, selectedPly + 1))} disabled={selectedPly >= game.moves.length}><ArrowRight size={18} /></button><button type="button" aria-label="Конец партии" onClick={() => selectPly(game.moves.length)} disabled={selectedPly >= game.moves.length}><ChevronsRight size={18} /></button><button type="button" className="analysis-mobile-control" aria-label="Разыграть отсюда" disabled={busy} onClick={() => { setExplorationFen(boardFen); setEngineLinePreview(null); setLineSession(value => value + 1); }}><Play size={15} /></button><button type="button" className="analysis-mobile-control" aria-label="Перевернуть доску" onClick={() => setOrientation(value => value === 'white' ? 'black' : 'white')}><FlipVertical2 size={16} /></button></div>
          <div className="analysis-board-actions"><button type="button" className="analysis-secondary" onClick={() => { setExplorationFen(boardFen); setEngineLinePreview(null); setLineSession(value => value + 1); }} disabled={busy}>Разыграть отсюда</button><button type="button" className="analysis-icon-button" aria-label="Перевернуть доску" onClick={() => setOrientation(value => value === 'white' ? 'black' : 'white')}><FlipVertical2 size={17} /></button></div>
        </>}
      </div>
      <div className="analysis-review-panel">
        <section className={`analysis-selected${showExplanation ? ' is-explanation-open' : ''}`} aria-label="Разбор выбранного хода">
          <div className="analysis-selected-heading"><div>{selectedResult && <span className={`analysis-badge is-${selectedPresentation!.kind}`} aria-hidden="true"><ReviewGradeSymbol kind={selectedPresentation!.kind} /></span>}<strong>{selectedMove ? moveName(selectedMove) : 'Исходная позиция'}</strong><span>{selectedPresentation?.label || ''}</span>{selectedAdventure && <span className="analysis-adventure-mark" title={REVIEW_ADVENTURE_DESCRIPTION}>!?? {REVIEW_ADVENTURE_LABEL}</span>}</div>{selectedResult?.bestSan && <button type="button" className="analysis-line-toggle" aria-expanded={showLine} onClick={() => { setEngineLinePreview(!showLine && selectedResult ? { gameId: game.id, sourcePly: selectedPly, position: { fen: selectedResult.fenBefore, index: 0 } } : null); setShowLine(value => !value); }}>{showLine ? 'Скрыть линию' : 'Линия движка'}</button>}</div>
          <button type="button" className="analysis-explanation-toggle" aria-expanded={showExplanation} onClick={() => setShowExplanation(value => !value)}>{showExplanation ? 'Скрыть объяснение' : 'Почему такой ход?'}</button><p className="analysis-feedback">{selectedResult ? selectedBook ? `Теория: ${selectedBook.name}${selectedBook.eco ? ` (${selectedBook.eco})` : ''}. ${selectedPresentation?.kind === 'book' ? 'Известное дебютное продолжение; оно не включено в показатель точности.' : reviewExplanation(selectedResult)}` : reviewExplanation(selectedResult) : selectedMove ? 'Ход ещё не проверен. Запусти анализ из сводки.' : 'Выбери ход в записи, на графике или нажми →.'}</p>
          {selectedAdventure && <p className="analysis-adventure-explanation">{REVIEW_ADVENTURE_DESCRIPTION}</p>}
          {showLine && selectedResult?.bestSan && !explorationFen && <div data-engine-line-player><div className="analysis-line-legend"><span>↗ Следующий ход линии</span><button type="button" className="analysis-arrows-toggle" aria-pressed={showArrows} onClick={() => setShowArrows(value => !value)}>Стрелки</button></div><EngineLinePlayer key={`${game.id}:${selectedPly}:${lineSession}`} startAtRoot fenBefore={selectedResult.fenBefore} moves={selectedResult.pvSan.length ? selectedResult.pvSan : [selectedResult.bestSan]} onPreview={position => setEngineLinePreview(position ? { gameId: game.id, sourcePly: selectedPly, position } : null)} /></div>}
        </section>
        <ReviewMoves game={game} resultsByPly={resultsByPly} bookByPly={opening?.bookByPly || {}} selectedPly={selectedPly} onSelect={selectPly} />
        <EvalChart game={game} results={results} selectedPly={selectedPly} onSelect={selectPly} />
      </div>
    </div>}

    {view === 'overview' && history.length > 0 && <details className="analysis-history"><summary>Недавние разборы <span>Последние 8 · в этом браузере</span></summary>{history.map(item => <button type="button" key={item.game.id} onClick={() => openSaved(item)} disabled={busy}><span>{playerName(item.game, 'w')} — {playerName(item.game, 'b')}</span><small>{[item.game.headers.Date, item.game.result, `${item.game.moves.length} полуходов`].filter(Boolean).join(' · ')}</small><ArrowRight size={15} /></button>)}</details>}
  </div>;
}

function ReviewMoves({ game, resultsByPly, bookByPly, selectedPly, onSelect }: { game: ReviewGame; resultsByPly: Map<number, ReviewMoveResult>; bookByPly: OpeningReview['bookByPly']; selectedPly: number; onSelect: (ply: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const grouped = new Map<number, { number: number; w?: ReviewGame['moves'][number]; b?: ReviewGame['moves'][number] }>();
    for (const move of game.moves) { const row = grouped.get(move.moveNumber) || { number: move.moveNumber }; row[move.color] = move; grouped.set(move.moveNumber, row); }
    return Array.from(grouped.values());
  }, [game]);
  useEffect(() => {
    const list = listRef.current;
    if (list && selectedPly === 0) { list.scrollTop = 0; return; }
    const active = list?.querySelector<HTMLElement>(`[data-review-ply="${selectedPly}"]`);
    if (!list || !active) return;
    const bounds = list.getBoundingClientRect(); const item = active.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
  }, [selectedPly]);
  return <div ref={listRef} className="analysis-move-list custom-scrollbar" aria-label="Ходы партии">{rows.map(row => <div className="analysis-move-row" role="group" aria-label={`Ход ${row.number}`} key={row.number}><small>{row.number}.</small>{(['w', 'b'] as const).map(color => {
    const move = row[color]; if (!move) return <span key={color} aria-hidden="true" />;
    const result = resultsByPly.get(move.ply);
    const presentation = result ? reviewPresentation(result, bookByPly[move.ply]) : null;
    return <button type="button" key={color} data-review-ply={move.ply} className={presentation ? `is-${presentation.kind}` : ''} aria-label={`${moveName(move)}${presentation ? `, ${presentation.label}` : ''}`} aria-current={selectedPly === move.ply ? 'step' : undefined} onClick={() => onSelect(move.ply)}>{result && <span className={`analysis-badge is-${presentation!.kind}`} aria-hidden="true"><ReviewGradeSymbol kind={presentation!.kind} /></span>}<strong><MoveSan san={move.san} /></strong>{result && hasVerifiedAdventure(result) && <span className="analysis-adventure-mark" title={REVIEW_ADVENTURE_LABEL} aria-label={REVIEW_ADVENTURE_LABEL}>!??</span>}</button>;
  })}</div>)}</div>;
}
function MoveSan({ san }: { san: string }) {
  const pieces: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };
  return pieces[san[0]] ? <><span className="analysis-san-piece" aria-hidden="true">{pieces[san[0]]}</span>{san.slice(1)}</> : <>{san}</>;
}

function PlayerBar({ game, color }: { game: ReviewGame; color: 'w' | 'b' }) {
  const rating = game.headers[color === 'w' ? 'WhiteElo' : 'BlackElo'];
  return <div className="analysis-playerbar"><span className={`analysis-player-piece is-${color}`} aria-hidden="true">{color === 'w' ? '♔' : '♚'}</span><strong>{playerName(game, color)}</strong>{rating && /^\d+$/.test(rating) && <small>{rating}</small>}</div>;
}
function AccuracyCard({ game, color, summary, moves, complete }: { game: ReviewGame; color: 'w' | 'b'; summary?: ReviewPlayerSummary; moves: number; complete: boolean }) {
  const accuracy = complete ? summary?.accuracy ?? null : null;
  const name = playerName(game, color);
  return <div><span>{color === 'w' ? 'Белые' : 'Чёрные'}</span><strong title={name}><i aria-hidden="true">{color === 'w' ? '♔' : '♚'}</i>{name}</strong><span className="analysis-accuracy-label">Точность без теории</span><b>{accuracy === null ? '—' : accuracy.toFixed(1)}<small>{accuracy === null ? '' : '%'}</small></b><p>{!complete ? 'Точность после полной проверки' : accuracy === null ? 'Нет ходов вне теории для оценки' : quality(accuracy)}</p>{complete && <small className="analysis-accuracy-sample">{moves} ходов вне базы · вынужденные исключены</small>}</div>;
}

function GameRating({ value, color }: { value: GameQualityRating; color: 'w' | 'b' }) {
  return <div aria-label={`Рейтинг партии за ${color === 'w' ? 'белых' : 'чёрных'}`}>{value.rating === null ? <p>{value.reason}</p> : <><strong>{value.rating}</strong><small>{value.decisions} учтённых ходов</small></>}</div>;
}

