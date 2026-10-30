'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Chess, type Square } from 'chess.js';
import { ChessboardWrapper } from '@/components/chess/ChessboardWrapper';
import type { CourseChapter, CourseExercise } from '@/types/course';
import { COURSE_PROGRESS_EVENT, loadCourseProgress, markCourseRevealed, saveCourseProgress, type CourseProgress } from '@/lib/courseProgress';
import { assessCourseLines, canonicalizeLine, tokenizeSan, type LineAssessment } from '@/lib/courseSession';
import { AutoReplyTrainer } from './AutoReplyTrainer';
import { VariationExplorer } from './VariationExplorer';
import { deepTheory, type DeepTheoryChapterId } from '@/data/deepTheory';
import { practiceDayNumber } from '@/lib/practiceStreak';
import './course.css';

const KIND_LABELS: Record<CourseExercise['kind'], string> = {
  calculation: 'Расчёт', decision: 'Выбор плана', defense: 'Защита', evaluation: 'Оценка позиции',
};

export function CourseLesson({ chapter, exercises, chapters }: {
  chapter: CourseChapter;
  exercises: CourseExercise[];
  chapters: CourseChapter[];
}) {
  const [selectedId, setSelectedId] = useState(exercises[0]?.id);
  const [progress, setProgress] = useState<CourseProgress>({ version: 1, exercises: {} });
  const [ready, setReady] = useState(false);
  const [trainingMode, setTrainingMode] = useState<'auto' | 'manual'>('auto');
  const [lessonView, setLessonView] = useState<'theory' | 'examples'>('theory');
  const updateProgress = useCallback(() => setProgress(loadCourseProgress()), []);

  useEffect(() => {
    const saved = loadCourseProgress();
    setProgress(saved);
    const requested = new URLSearchParams(window.location.search).get('exercise');
    const requestedValid = requested && exercises.some((exercise) => exercise.id === requested);
    if (requestedValid) { setSelectedId(requested); setLessonView('examples'); }
    else if (saved.lastChapterId === chapter.id && saved.lastExerciseId && exercises.some((exercise) => exercise.id === saved.lastExerciseId)) setSelectedId(saved.lastExerciseId);
    if (!requestedValid && saved.lastChapterId === chapter.id && saved.lastStudyView === 'examples') setLessonView('examples');
    saveCourseProgress({ ...saved, lastChapterId: chapter.id, lastStudyView: requestedValid || (saved.lastChapterId === chapter.id && saved.lastStudyView === 'examples') ? 'examples' : 'theory' });
    setReady(true);
    window.addEventListener(COURSE_PROGRESS_EVENT, updateProgress);
    window.addEventListener('storage', updateProgress);
    return () => {
      window.removeEventListener(COURSE_PROGRESS_EVENT, updateProgress);
      window.removeEventListener('storage', updateProgress);
    };
  }, [chapter.id, exercises, updateProgress]);

  const exercise = exercises.find((item) => item.id === selectedId) || exercises[0];
  const chapterIndex = chapters.findIndex((item) => item.id === chapter.id);
  const solvedCount = exercises.filter((item) => progress.exercises[item.id]?.status === 'solved').length;
  const reading = deepTheory[chapter.id as DeepTheoryChapterId];
  function chooseView(view: 'theory' | 'examples') {
    setLessonView(view);
    const saved = loadCourseProgress();
    saveCourseProgress({ ...saved, lastChapterId: chapter.id, lastStudyView: view });
  }
  function selectExercise(id: string) {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('exercise', id);
    window.history.replaceState(null, '', url);
    const saved = loadCourseProgress();
    saveCourseProgress({ ...saved, lastChapterId: chapter.id, lastExerciseId: id, lastStudyView: 'examples' });
  }

  return (
    <div className="course-shell">
      <nav className="course-breadcrumb" aria-label="Навигация">
        <Link href="/">Все главы</Link><span aria-hidden="true">/</span><span>Глава {String(chapter.number).padStart(2, '0')}</span>
      </nav>
      <header className="course-heading">
        <div><p className="course-eyebrow">Искусство атаки · Практикум</p><h1>{chapter.title}</h1><p className="course-intro">{chapter.summary}</p></div>
        <p className="course-chapter-count">{solvedCount}<span> / {exercises.length}</span><small>учебных примеров пройдено</small></p>
      </header>

      <div className="course-training-switch" role="group" aria-label="Этап изучения"><button type="button" aria-pressed={lessonView === 'theory'} onClick={() => chooseView('theory')}>Изучение</button><button type="button" aria-pressed={lessonView === 'examples'} onClick={() => chooseView('examples')}>Учебные примеры · {exercises.length}</button><Link href="/train">Смешанное закрепление ↗</Link></div>
      <div className="course-study-route"><p>{lessonView === 'theory' ? 'Здесь разбираются принципы и способ расчёта. В смешанном тренинге название темы, источник и мотив скрыты до нажатия «Показать ответ».' : 'Это учебные примеры с известной темой. Для проверки навыка на незнакомой позиции переходи в смешанный тренинг.'}</p><Link href="/train" className="course-analysis-link">Практика без подсказки темы →</Link></div>

      {lessonView === 'examples' && <>
      <div className="course-exercise-nav" aria-label="Задания главы">
        <span className="course-nav-label">Практика</span>
        {exercises.map((item, index) => {
          const status = progress.exercises[item.id]?.status;
          return <button key={item.id} type="button" aria-current={exercise?.id === item.id ? 'step' : undefined} onClick={() => selectExercise(item.id)} className={exercise?.id === item.id ? 'course-exercise-tab course-exercise-tab-active' : 'course-exercise-tab'} aria-label={`Задание ${index + 1}: ${KIND_LABELS[item.kind]}${status === 'solved' ? ', решено самостоятельно' : status === 'review' ? ', в работе' : ''}`}>
            <span>{String(index + 1).padStart(2, '0')}</span><span>{KIND_LABELS[item.kind]}</span>{status === 'solved' && <span className="course-status-dot" aria-hidden="true">✓</span>}
          </button>;
        })}
      </div>

      <div className="course-training-switch" role="group" aria-label="Режим практики"><button type="button" aria-pressed={trainingMode === 'auto'} onClick={() => setTrainingMode('auto')}>Соперник отвечает</button><button type="button" aria-pressed={trainingMode === 'manual'} onClick={() => setTrainingMode('manual')}>За обе стороны</button></div>

      {!ready ? <div className="course-loading" role="status">Подготовка позиции…</div> : exercise ? trainingMode === 'auto' ? <AutoReplyTrainer key={`auto-${exercise.id}`} exercise={exercise} index={exercises.indexOf(exercise)} onNext={exercises.indexOf(exercise) < exercises.length - 1 ? () => selectExercise(exercises[exercises.indexOf(exercise) + 1].id) : undefined} /> : <ExerciseWorkspace key={exercise.id} exercise={exercise} chapter={chapter} index={exercises.indexOf(exercise)} onNext={exercises.indexOf(exercise) < exercises.length - 1 ? () => selectExercise(exercises[exercises.indexOf(exercise) + 1].id) : undefined} /> : <div className="course-empty"><h2>Теория главы</h2><p>В этой главе пока нет упражнений. Принципы и вопросы для самостоятельного анализа доступны ниже.</p></div>}
      </>}

      {lessonView === 'theory' && <article className="course-deep-theory" id="theory">
        <p className="course-eyebrow">Авторский методический материал по теме</p>
        <h2>От предпосылок к конечной оценке</h2>
        {chapter.theory.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {reading && <>
          <p>{reading.introduction}</p>
          {reading.sections.map((section, index) => <section key={section.id}><p className="course-eyebrow">{String(index + 1).padStart(2, '0')}</p><h3>{section.title}</h3>{section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}{section.questions.map(question => <p key={question} className="course-theory-question">{question}</p>)}</section>)}
          <section><h3>Проверь понимание</h3><ol>{reading.synthesisQuestions.map(question => <li key={question}>{question}</li>)}</ol></section>
          <section><h3>Как закрепить тему</h3><ol>{reading.practiceProtocol.map(step => <li key={step}>{step}</li>)}</ol><p>После учебных примеров решай смешанные позиции. Знакомый мотив должен работать и без названия главы над доской.</p></section>
        </>}
        <button type="button" className="course-primary" onClick={() => { chooseView('examples'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Перейти к учебным примерам →</button>
      </article>}

      <details className="course-theory">
        <summary><span>Вопросы и источники главы</span><span className="course-muted">Для самостоятельной проверки</span></summary>
        <div className="course-theory-grid">
          <div><h3>Что проверяем</h3><ul>{chapter.goals.map((goal) => <li key={goal}>{goal}</li>)}</ul></div>
          <div><h3>Перед первым ходом</h3><ol>{chapter.assessmentQuestions.map((question) => <li key={question}>{question}</li>)}</ol><h3>Источники главы</h3><ul className="course-sources">{chapter.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></li>)}</ul></div>
        </div>
      </details>

      <nav className="course-chapter-navigation" aria-label="Переходы между главами">
        {chapters[chapterIndex - 1] ? <Link href={`/course/${chapters[chapterIndex - 1].id}`}><span>← Предыдущая глава</span><strong>{chapters[chapterIndex - 1].title}</strong></Link> : <Link href="/">← Вернуться к содержанию</Link>}
        {chapters[chapterIndex + 1] ? <Link href={`/course/${chapters[chapterIndex + 1].id}`}><span>Следующая глава →</span><strong>{chapters[chapterIndex + 1].title}</strong></Link> : <Link href="/">К содержанию →</Link>}
      </nav>
    </div>
  );
}

function ExerciseWorkspace({ exercise, chapter, index, onNext }: {
  exercise: CourseExercise; chapter: CourseChapter; index: number; onNext?: () => void;
}) {
  const [moves, setMoves] = useState<string[]>([]);
  const [choice, setChoice] = useState<string | null>(null);
  const [decisionConfirmed, setDecisionConfirmed] = useState(false);
  const [phase, setPhase] = useState<'decision' | 'calculation'>(exercise.decision ? 'decision' : 'calculation');
  const [result, setResult] = useState<LineAssessment | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [reviewPly, setReviewPly] = useState(0);
  const [reviewLine, setReviewLine] = useState(0);
  const [explorationFen, setExplorationFen] = useState<string | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [priorSolved, setPriorSolved] = useState(false);
  const [mode, setMode] = useState<'board' | 'mental'>('board');
  const [mentalText, setMentalText] = useState('');

  useEffect(() => {
    const progress = loadCourseProgress();
    const saved = progress.exercises[exercise.id];
    setPriorSolved(saved?.status === 'solved');
    setReviewed(saved?.reviewed === true);
    setMode(saved?.mode === 'mental' ? 'mental' : 'board');
    if (saved?.draftSan) {
      const parsed = canonicalizeLine(exercise.initialFen, saved.draftSan);
      if (parsed.invalidPly === undefined || saved.mode === 'mental') setMoves(saved.draftSan);
      setMentalText(saved.draftSan.join(' '));
    }
    if (saved?.decisionId && exercise.decision?.options.some((option) => option.id === saved.decisionId)) {
      setChoice(saved.decisionId);
      setDecisionConfirmed(true);
    }
    setStorageAvailable(saveCourseProgress({ ...progress, lastChapterId: chapter.id, lastExerciseId: exercise.id }));
  }, [exercise, chapter.id]);

  const persist = (nextMoves: string[], options: { choice?: string | null; solved?: boolean; practiced?: boolean; reviewed?: boolean; attempted?: boolean; mode?: 'board' | 'mental' } = {}) => {
    const saved = loadCourseProgress();
    const previous = saved.exercises[exercise.id];
    const nextReviewed = options.reviewed ?? reviewed;
    const isSolved = previous?.status === 'solved' || options.solved === true;
    const now = Date.now();
    const manualSolvedAt = previous?.manualSolvedAt || [];
    const next = {
      ...saved, lastChapterId: chapter.id, lastExerciseId: exercise.id,
      exercises: { ...saved.exercises, [exercise.id]: {
        ...previous, status: isSolved ? 'solved' as const : 'review' as const,
        updatedAt: Date.now(), attempts: (previous?.attempts || 0) + (options.attempted ? 1 : 0),
        draftSan: nextMoves, decisionId: options.choice !== undefined ? options.choice ?? undefined : choice ?? undefined, reviewed: nextReviewed, reviewedAt: nextReviewed && !previous?.reviewed ? Date.now() : previous?.reviewedAt, everRevealed: previous?.everRevealed || nextReviewed, mode: options.mode ?? mode,
        manualSolvedAt: options.practiced && !manualSolvedAt.some(timestamp => practiceDayNumber(timestamp) === practiceDayNumber(now)) ? [...manualSolvedAt, now] : manualSolvedAt,
      } },
    };
    setStorageAvailable(saveCourseProgress(next));
    if (isSolved) setPriorSolved(true);
  };

  const candidate = useMemo(() => canonicalizeLine(exercise.initialFen, moves), [exercise.initialFen, moves]);
  const lines = [{ title: 'Основной вариант', san: exercise.solutionSan, explanation: exercise.explanation }, ...(exercise.alternativeLines || [])];
  const selectedLine = lines[reviewLine] || lines[0];
  const reference = useMemo(() => canonicalizeLine(exercise.initialFen, selectedLine.san), [exercise.initialFen, selectedLine.san]);
  const currentFen = reviewing ? reference.fens[Math.min(reviewPly, reference.fens.length - 1)] || exercise.initialFen : phase === 'decision' || mode === 'mental' ? exercise.initialFen : candidate.fens[candidate.fens.length - 1] || exercise.initialFen;
  const analysisUrl = `https://lichess.org/analysis/standard/${encodeURIComponent(candidate.fens[candidate.fens.length - 1] || exercise.initialFen)}`;
  const sideToMove = currentFen.split(' ')[1] === 'w' ? 'Белые' : 'Чёрные';
  const initialMoveNumber = Number(exercise.initialFen.split(' ')[5]) || 1;
  const firstIsBlack = exercise.initialFen.split(' ')[1] === 'b';
  const moveLabel = (ply: number) => `${initialMoveNumber + Math.floor((ply + (firstIsBlack ? 1 : 0)) / 2)}${(ply + (firstIsBlack ? 1 : 0)) % 2 === 0 ? '.' : '…'}`;

  function makeMove(from: Square, to: Square, promotion?: string) {
    if (phase !== 'calculation' || reviewing || mode === 'mental') return false;
    try {
      const game = new Chess(currentFen);
      const move = game.move({ from, to, promotion: promotion?.slice(-1).toLowerCase() || 'q' });
      const next = [...moves, move.san];
      setMoves(next); setResult(null); persist(next);
      return true;
    } catch { return false; }
  }

  function checkLine() {
    const assessment = assessCourseLines(exercise.initialFen, moves, [exercise.solutionSan, ...(exercise.alternativeLines || []).filter((line) => line.accepted === true).map((line) => line.san)]);
    setResult(assessment);
    const decisionCorrect = !exercise.decision || choice === exercise.decision.correctOptionId;
    persist(moves, { attempted: true, solved: assessment.kind === 'correct' && decisionCorrect && !reviewed, practiced: assessment.kind === 'correct' && decisionCorrect });
  }

  function openReview() {
    setReviewed(true); setReviewing(true); setReviewPly(0); setReviewLine(0); setExplorationFen(null);
    persist(moves, { reviewed: true });
    markCourseRevealed(exercise.id);
  }

  function startNewAttempt() {
    setMoves([]); setMentalText(''); setChoice(null); setDecisionConfirmed(false);
    setPhase(exercise.decision ? 'decision' : 'calculation');
    setResult(null); setReviewing(false); setReviewed(false); setReviewPly(0); setReviewLine(0);
    setExplorationFen(null);
    persist([], { choice: null, reviewed: false });
  }

  const selectedOption = exercise.decision?.options.find((option) => option.id === choice);
  function chooseReviewPly(ply: number) {
    setReviewPly(ply); setExplorationFen(null);
  }
  const resultMessage = result?.kind === 'correct'
    ? reviewed ? priorSolved ? 'Вариант воспроизведён после подсказки или разбора. Прежнее самостоятельное решение сохранено.' : 'Вариант воспроизведён после подсказки или разбора. Задание остаётся в повторении.' : exercise.decision && choice !== exercise.decision.correctOptionId ? 'Вариант совпал с учебным. Вернись к оценке позиции: исходный план требует пересмотра.' : `Учебный вариант рассчитан полностью.${result.extraPlies ? ' Продолжение после него не проверялось.' : ''}`
    : result?.kind === 'incomplete' ? 'Записанное начало совпало с учебной линией. Продолжи расчёт до устойчивой оценки позиции.'
      : result?.kind === 'divergence' ? `С ${moveLabel(result.divergencePly - 1)} хода твоя линия отличается от записанного варианта. Она не оценена: это само по себе не означает ошибку. Можно уточнить расчёт или сравнить идеи в разборе.`
        : result?.kind === 'invalid' ? result.source === 'input' ? `Ход в записи № ${result.invalidPly} не распознан или нелегален в этой позиции. Проверь SAN и очередность ходов. Качество варианта пока не оценивалось.` : 'Учебный вариант недоступен для проверки. Эта попытка не оценена.' : '';

  return <section className="course-workspace" aria-label={`Задание ${index + 1}`}>
    <div className="course-board-column">
      {reviewing && explorationFen ? <VariationExplorer key={explorationFen} initialFen={explorationFen} orientation={exercise.orientation} onClose={() => setExplorationFen(null)} /> : <>
      <div className="course-board-meta"><span>{reviewing ? 'Разбор варианта' : phase === 'decision' || mode === 'mental' ? 'Исходная позиция' : 'Твой расчёт'}</span><span className="course-turn"><span className={currentFen.split(' ')[1] === 'w' ? 'course-piece-indicator course-piece-white' : 'course-piece-indicator'} />{sideToMove}: ход</span></div>
      <ChessboardWrapper position={currentFen} orientation={exercise.orientation} boardWidth={640} onMove={makeMove} isInteractive={phase === 'calculation' && !reviewing && mode === 'board'} showLegalMoves={false} playSoundEffects={false} lastMove={null} className="course-board" />
      <div className="course-board-caption"><span>{exercise.provenance.game || (exercise.provenance.type === 'composed' ? 'Учебная позиция' : 'Историческая позиция')}</span><span>{exercise.orientation === 'white' ? 'Белые снизу' : 'Чёрные снизу'}</span></div>
      {reviewing && <div className="course-board-actions"><button type="button" className="course-restart" onClick={() => setExplorationFen(currentFen)}>Разыграть отсюда</button></div>}
      <p className="course-local-note">{storageAvailable ? 'Прогресс сохраняется в этом браузере.' : 'Сохранение недоступно. Текущий расчёт останется до закрытия страницы.'}{priorSolved ? ' Задание ранее решено самостоятельно.' : ''}</p>
      </>}
    </div>

    <div className="course-work-panel">
      <div className="course-panel-top"><span className="course-eyebrow">Задание {String(index + 1).padStart(2, '0')} / {KIND_LABELS[exercise.kind]}</span></div>
      <h2>{reviewing ? exercise.title : exercise.task}</h2>
      <p className="course-prompt">{exercise.prompt}</p>

      {phase === 'decision' && !reviewing ? <div className="course-decision">
        <p className="course-step-label">01 — Оценка и план</p>
        <fieldset disabled={decisionConfirmed}><legend className="course-sr-only">Выбери оценку позиции</legend>{exercise.decision?.options.map((option, optionIndex) => <label key={option.id} className={`course-option ${choice === option.id ? 'course-option-selected' : ''}`}><input type="radio" name={`decision-${exercise.id}`} value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} /><span className="course-option-letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option.label}</span></label>)}</fieldset>
        {decisionConfirmed && selectedOption && <div className="course-feedback" role="status"><strong>План зафиксирован</strong><p>Проверим его вместе с твоим вариантом. Объяснение откроется по кнопке показа ответа.</p></div>}
        {!decisionConfirmed ? <button className="course-primary" disabled={!choice} onClick={() => { setDecisionConfirmed(true); persist(moves, { choice }); }}>Зафиксировать оценку →</button> : <button className="course-primary" onClick={() => setPhase('calculation')}>Перейти к расчёту →</button>}
      </div> : reviewing ? <div className="course-review">
        <p className="course-step-label">03 — Разбор</p>
        {selectedOption && <p className="course-explanation">{selectedOption.explanation}</p>}
        {lines.length > 1 && <label className="course-line-select">Вариант<select value={reviewLine} onChange={(event) => { setReviewLine(Number(event.target.value)); chooseReviewPly(0); }}>{lines.map((line, lineIndex) => <option key={lineIndex} value={lineIndex}>{line.title}</option>)}</select></label>}
        <div className="course-move-list" aria-label="Учебный вариант">{selectedLine.san.map((move, ply) => <button type="button" key={ply} className={reviewPly === ply + 1 ? 'course-move-active' : ''} onClick={() => chooseReviewPly(ply + 1)}><span>{moveLabel(ply)}</span>{move}</button>)}</div>
        <div className="course-review-controls"><button type="button" onClick={() => chooseReviewPly(0)} disabled={!reviewPly} aria-label="Исходная позиция">|←</button><button type="button" onClick={() => chooseReviewPly(Math.max(0, reviewPly - 1))} disabled={!reviewPly} aria-label="Предыдущий ход">←</button><span>{reviewPly} / {selectedLine.san.length}</span><button type="button" onClick={() => chooseReviewPly(Math.min(selectedLine.san.length, reviewPly + 1))} disabled={reviewPly >= selectedLine.san.length} aria-label="Следующий ход">→</button><button type="button" onClick={() => chooseReviewPly(selectedLine.san.length)} disabled={reviewPly >= selectedLine.san.length} aria-label="Конечная позиция">→|</button></div>
        <p className="course-instruction">Выбери позицию в учебной линии или в партии и нажми «Разыграть отсюда» под доской.</p>
        <p className="course-explanation">{selectedLine.explanation}</p>
        <a className="course-analysis-link" href={analysisUrl} target="_blank" rel="noreferrer">Проверить свой вариант в анализаторе ↗</a>
        <details className="course-verification"><summary>Проверка позиции и источники</summary><p>{exercise.verification.note}</p><p>{exercise.verification.engine === 'verified' ? 'Проверено движком. ' : 'Движковая оценка этой линии не подтверждена. '}{exercise.verification.engineDetails}</p><p>{exercise.provenance.bookAttribution === 'not-claimed' ? 'Самостоятельное упражнение по теме главы; точное происхождение из книги не заявляется.' : 'Источник позиции указан в материалах упражнения.'}</p>{exercise.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</details>
        {onNext ? <button type="button" className="course-primary" onClick={onNext}>Следующее задание →</button> : <Link className="course-primary" href="/">Вернуться к главам →</Link>}
        <button className="course-text-button" type="button" onClick={() => setReviewing(false)}>Вернуться к своему расчёту</button>
      </div> : <div className="course-calculation">
        <p className="course-step-label">02 — Расчёт за обе стороны</p>
        <div className="course-mode-switch" role="group" aria-label="Способ расчёта"><button type="button" aria-pressed={mode === 'board'} disabled={mode === 'mental' && candidate.invalidPly !== undefined} onClick={() => { setMode('board'); setResult(null); persist(moves, { mode: 'board' }); }}>На доске</button><button type="button" aria-pressed={mode === 'mental'} onClick={() => { setMentalText(moves.join(' ')); setMode('mental'); setResult(null); persist(moves, { mode: 'mental' }); }}>В уме</button></div>
        <p className="course-instruction">{mode === 'mental' ? 'Рассчитай вариант без перемещения фигур. Запиши ходы обеих сторон в SAN; исходная позиция останется на доске.' : 'Введи на доске весь вариант, включая защиту соперника. До проверки подсказок о качестве ходов нет.'}</p>
        {mode === 'mental' ? <label className="course-san-label">Твой вариант в SAN<textarea className="course-san-input" value={mentalText} onChange={(event) => { const value = event.target.value; const next = tokenizeSan(value); setMentalText(value); setMoves(next); setResult(null); persist(next); }} placeholder="1. e4 e5 2. Nf3 Nc6" spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-describedby="course-san-help" /><span id="course-san-help" className="course-muted">Латинские обозначения: K Q R B N. Номера ходов необязательны.</span></label> : <div className={`course-move-list ${!moves.length ? 'course-move-list-empty' : ''}`} aria-live="polite" aria-label="Твой вариант">{moves.length ? moves.map((move, ply) => <span key={ply} className="course-written-move"><span>{moveLabel(ply)}</span>{move}</span>) : <span>Вариант пока не записан</span>}</div>}
        <div className="course-edit-controls"><button type="button" disabled={!moves.length} onClick={() => { const next = moves.slice(0, -1); setMoves(next); setMentalText(next.join(' ')); setResult(null); persist(next); }}>← Отменить ход</button><button type="button" disabled={!moves.length} onClick={() => { setMoves([]); setMentalText(''); setResult(null); persist([]); }}>Сбросить</button></div>
        {result && <div className={`course-feedback ${result.kind === 'correct' ? 'course-feedback-success' : ''}`} role="status"><strong>{result.kind === 'correct' ? 'Проверка завершена' : result.kind === 'incomplete' ? 'Расчёт не завершён' : 'Нужен разбор'}</strong><p>{resultMessage}</p>{result.kind === 'divergence' && <a className="course-analysis-link" href={analysisUrl} target="_blank" rel="noreferrer">Проверить свой вариант в анализаторе ↗</a>}</div>}
        {result?.kind === 'correct' ? <button type="button" className="course-primary" onClick={openReview}>Разобрать вариант →</button> : <button type="button" className="course-primary" onClick={checkLine} disabled={!moves.length}>Проверить вариант →</button>}
        {result?.kind !== 'correct' && <button type="button" className="course-text-button" onClick={openReview}>Показать ответ · сохранить в повторение</button>}
        {exercise.decision && <button type="button" className="course-text-button" onClick={() => { setPhase('decision'); setDecisionConfirmed(false); setResult(null); }}>Пересмотреть оценку позиции</button>}
      </div>}
      {reviewed && <button type="button" className="course-text-button" onClick={startNewAttempt}>Новая попытка без подсказок</button>}
    </div>
  </section>;
}
