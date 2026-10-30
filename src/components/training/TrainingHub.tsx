'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AutoReplyTrainer } from '@/components/course/AutoReplyTrainer';
import { DailyPracticeGoal } from '@/components/layout/PracticeStreak';
import { trainingExercises, trainingSkills, TRAINING_BANK_META } from '@/data/trainingBank';
import { COURSE_PROGRESS_EVENT, loadCourseProgress, type CourseProgress } from '@/lib/courseProgress';
import { deriveTrainingState, selectSession, TRAINING_DAY_MS, type TrainingAttemptRecord, type TrainingExerciseState } from '@/lib/trainingSchedule';
import type { CourseExercise } from '@/types/course';
import '@/components/course/course.css';
import './training.css';

const SESSION_KEY = 'vukovic-training-session:v1';
type SessionKind = TrainingAttemptRecord['sessionKind'];
interface QueueItem { exerciseId: string; kind: SessionKind }
interface TrainingSession {
  version: 1;
  id: string;
  kind: 'diagnostic' | 'practice' | 'exam';
  queue: QueueItem[];
  index: number;
  status: 'active' | 'completed';
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}
interface HistoryItem {
  id: string; exerciseId: string; updatedAt: number; completedAt?: number;
  assisted: boolean; sessionId?: string; sessionKind?: SessionKind;
  audit?: { outcome: TrainingAttemptRecord['outcome'] };
}

function loadSession(): TrainingSession | null {
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw) as TrainingSession;
  if (!value || value.version !== 1 || typeof value.id !== 'string' || !['diagnostic', 'practice', 'exam'].includes(value.kind) || !Array.isArray(value.queue) || !value.queue.length || !value.queue.every((item) => item && typeof item.exerciseId === 'string' && ['diagnostic', 'practice', 'review', 'exam'].includes(item.kind)) || !Number.isInteger(value.index) || value.index < 0 || value.index > value.queue.length || !['active', 'completed'].includes(value.status) || (value.status === 'active' && value.index >= value.queue.length)) {
    throw new Error('Сохранённая сессия имеет неизвестный формат. Она не была заменена.');
  }
  return value;
}

function persistSession(session: TrainingSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/** History is immutable; the complete current attempt is only a legacy fallback. */
function exerciseHistory(progress: CourseProgress, exerciseId: string): HistoryItem[] {
  const saved = progress.exercises[exerciseId];
  if (!saved) return [];
  const history: HistoryItem[] = [...(saved.autoHistory || [])];
  if (saved.autoAttempt?.phase === 'completed' && saved.autoAttempt.audit) history.push(saved.autoAttempt);
  const seen = new Set<string>();
  return history.filter((item) => {
    if (!item.audit || seen.has(item.id)) return false;
    seen.add(item.id); return true;
  }).sort((left, right) => (left.completedAt ?? left.updatedAt) - (right.completedAt ?? right.updatedAt));
}

function toRecord(item: HistoryItem): TrainingAttemptRecord {
  return {
    id: item.id, exerciseId: item.exerciseId, completedAt: item.completedAt ?? item.updatedAt,
    outcome: item.audit!.outcome, assisted: item.assisted, sessionKind: item.sessionKind || 'practice',
  };
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/** Round robin prevents a mixed queue from being filled by one source theme. */
function mixedOrder(exercises: CourseExercise[], randomize = false): string[] {
  const groups = trainingSkills.map((skill) => {
    const items = exercises.filter((exercise) => exercise.trainingMeta?.skillId === skill.id).map((exercise) => exercise.id);
    return randomize ? shuffled(items) : items;
  });
  const buckets = randomize ? shuffled(groups) : groups;
  const result: string[] = [];
  for (let index = 0; buckets.some((items) => index < items.length); index += 1) {
    buckets.forEach((items) => { if (items[index]) result.push(items[index]); });
  }
  return result;
}

/** A long recall requires a real gap from every intervening attempt or reopened audit. */
function countLongReviews(history: TrainingAttemptRecord[], exposures: number[] = []): number {
  const prefix: TrainingAttemptRecord[] = [];
  const prefixExposures: number[] = [];
  let lastExposureAt: number | null = null;
  let count = 0;
  const events = [
    ...history.map((attempt) => ({ timestamp: attempt.completedAt, attempt: attempt as TrainingAttemptRecord | null })),
    ...exposures.filter(Number.isFinite).map((timestamp) => ({ timestamp, attempt: null as TrainingAttemptRecord | null })),
  ].sort((left, right) => left.timestamp - right.timestamp || Number(left.attempt === null) - Number(right.attempt === null));
  for (const event of events) {
    const attempt = event.attempt;
    if (!attempt) { prefixExposures.push(event.timestamp); lastExposureAt = event.timestamp; continue; }
    const before = deriveTrainingState(prefix, attempt.completedAt, prefixExposures);
    prefix.push(attempt);
    const after = deriveTrainingState(prefix, attempt.completedAt, prefixExposures);
    if (attempt.outcome === 'passed' && !attempt.assisted && after.successfulReviews > before.successfulReviews && lastExposureAt !== null && attempt.completedAt - lastExposureAt >= 7 * TRAINING_DAY_MS) count += 1;
    lastExposureAt = attempt.completedAt;
  }
  return count;
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(timestamp);
}

export function TrainingHub() {
  const [progress, setProgress] = useState<CourseProgress>({ version: 1, exercises: {} });
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [view, setView] = useState<'dashboard' | 'session' | 'summary'>('dashboard');
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [invalidStorage, setInvalidStorage] = useState(false);
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(() => { setProgress(loadCourseProgress()); setNow(Date.now()); }, []);
  useEffect(() => {
    refresh();
    try {
      const saved = loadSession(); setSession(saved);
      if (saved?.status === 'active') setView('session');
    } catch (caught) { setInvalidStorage(true); setError(caught instanceof Error ? caught.message : 'Не удалось прочитать сохранённую сессию.'); }
    setReady(true);
    window.addEventListener(COURSE_PROGRESS_EVENT, refresh);
    const syncStorage = (event: StorageEvent) => {
      refresh();
      if (event.key !== SESSION_KEY) return;
      try {
        const saved = loadSession(); setSession(saved);
        if (saved?.status === 'active') setView('session');
        else if (saved?.status === 'completed') setView((current) => current === 'session' ? 'summary' : current);
        else setView('dashboard');
      }
      catch { setInvalidStorage(true); setError('Не удалось прочитать сохранённую сессию.'); }
    };
    window.addEventListener('storage', syncStorage);
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => { window.removeEventListener(COURSE_PROGRESS_EVENT, refresh); window.removeEventListener('storage', syncStorage); window.clearInterval(timer); };
  }, [refresh]);

  const practice = useMemo(() => trainingExercises.filter((exercise) => exercise.trainingMeta?.split === 'practice'), []);
  const exam = useMemo(() => trainingExercises.filter((exercise) => exercise.trainingMeta?.split === 'exam'), []);
  const histories = useMemo(() => Object.fromEntries(trainingExercises.map((exercise) => [exercise.id, exerciseHistory(progress, exercise.id)])) as Record<string, HistoryItem[]>, [progress]);
  const states = useMemo(() => Object.fromEntries(trainingExercises.map((exercise) => [exercise.id, deriveTrainingState((histories[exercise.id] || []).map(toRecord), now, progress.exercises[exercise.id]?.revealedAt || [])])) as Record<string, TrainingExerciseState>, [histories, now, progress]);
  const selection = useMemo(() => selectSession(mixedOrder(practice), states, now, practice.length), [practice, states, now]);
  const dueCount = selection.filter((item) => item.reason !== 'new').length;
  const newCount = practice.filter((exercise) => !states[exercise.id]?.history.length && states[exercise.id]?.lastExposureAt == null && !progress.exercises[exercise.id]?.autoAttempt).length;
  const masteredCount = practice.filter((exercise) => states[exercise.id]?.mastered).length;
  const completedPractice = practice.filter((exercise) => states[exercise.id].history.some((item) => item.outcome !== 'unverified' && item.completedAt <= now)).length;
  const independentPassed = practice.filter((exercise) => states[exercise.id].history.some((item) => item.outcome === 'passed' && !item.assisted && item.completedAt <= now)).length;
  const longReviews = practice.reduce((count, exercise) => count + countLongReviews(states[exercise.id].history.filter((item) => item.completedAt <= now), (progress.exercises[exercise.id]?.revealedAt || []).filter((timestamp) => timestamp <= now)), 0);
  const examUnlocked = completedPractice >= 24 && independentPassed >= 12 && longReviews >= 2;
  const unseenExam = exam.filter((exercise) => !histories[exercise.id].length && !progress.exercises[exercise.id]?.autoAttempt && !progress.exercises[exercise.id]?.revealedAt?.length);
  const enoughUnseenExam = unseenExam.length >= 12;
  const hasDiagnostic = practice.some((exercise) => states[exercise.id].history.some((item) => item.sessionKind === 'diagnostic'));
  const pending = session?.status === 'active';
  const nextDue = practice.reduce<number | null>((earliest, exercise) => {
    const state = states[exercise.id];
    if (state.mastered || state.nextReviewAt === null) return earliest;
    const latest = state.lastExposureAt ?? state.history.reduce((last, item) => item.completedAt <= now ? Math.max(last, item.completedAt) : last, 0);
    const due = Math.max(state.nextReviewAt || 0, latest + TRAINING_DAY_MS);
    return due > now && (earliest === null || due < earliest) ? due : earliest;
  }, null);

  async function start(kind: TrainingSession['kind']) {
    setError(null);
    setStarting(true);
    const createSavedSession = () => {
      const saved = loadSession();
      if (saved?.status === 'active') { setSession(saved); setView('session'); return; }
      if (invalidStorage) return;
      const freshNow = Date.now();
      const freshProgress = loadCourseProgress();
      const freshStates = Object.fromEntries(trainingExercises.map((exercise) => [exercise.id, deriveTrainingState(exerciseHistory(freshProgress, exercise.id).map(toRecord), freshNow, freshProgress.exercises[exercise.id]?.revealedAt || [])])) as Record<string, TrainingExerciseState>;
      let queue: QueueItem[];
      if (kind === 'exam') {
        if (!examUnlocked) return;
        const eligibleExam = exam.filter((exercise) => !exerciseHistory(freshProgress, exercise.id).length && !freshProgress.exercises[exercise.id]?.autoAttempt && !freshProgress.exercises[exercise.id]?.revealedAt?.length);
        queue = shuffled(mixedOrder(eligibleExam, true).slice(0, 12)).map((exerciseId) => ({ exerciseId, kind: 'exam' }));
      } else if (kind === 'diagnostic') {
        const eligible = new Set(selectSession(mixedOrder(practice), freshStates, freshNow, practice.length).map((item) => item.exerciseId));
        queue = shuffled(mixedOrder(practice.filter((exercise) => eligible.has(exercise.id)), true).slice(0, 12)).map((exerciseId) => ({ exerciseId, kind: 'diagnostic' }));
      } else {
        queue = selectSession(mixedOrder(practice, true), freshStates, freshNow, 6).map((item) => ({ exerciseId: item.exerciseId, kind: item.reason === 'review' ? 'review' : 'practice' }));
      }
      if (!queue.length || (kind !== 'practice' && queue.length < 12)) { setError(kind === 'exam' ? 'Для контрольной нужно 12 ещё незнакомых позиций. Доступный резерв исчерпан или уже начат.' : 'Пока недостаточно доступных позиций для этой сессии. Завершённые сегодня позиции появятся позже.'); return; }
      const timestamp = Date.now();
      const next: TrainingSession = {
        version: 1, id: crypto.randomUUID(), kind, queue, index: 0, status: 'active', createdAt: timestamp, updatedAt: timestamp,
      };
      persistSession(next);
      // Also guard older browsers without Web Locks against a competing write.
      const stored = loadSession();
      if (!stored) throw new Error('Не удалось подтвердить сохранение очереди.');
      if (stored.id !== next.id) { setSession(stored); setView('session'); return; }
      setSession(next); setView('session');
    };
    try {
      if (navigator.locks?.request) await navigator.locks.request('vukovic-training-session', createSavedSession);
      else createSavedSession();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось сохранить сессию.'); }
    finally { setStarting(false); }
  }

  function advance() {
    if (!session || session.status !== 'active') return;
    try {
      const stored = loadSession();
      if (!stored || stored.id !== session.id || stored.index !== session.index) {
        setError('Сессия изменилась в другой вкладке. Открой сохранённую очередь снова.');
        if (stored) setSession(stored);
        return;
      }
      const currentItem = stored.queue[stored.index];
      const latestHistory = exerciseHistory(loadCourseProgress(), currentItem.exerciseId);
      const result = latestHistory.find((item) => item.sessionId === stored.id && item.sessionKind === currentItem.kind);
      if (!result?.audit || result.audit.outcome === 'unverified') { setError('Сначала нужен подтверждённый разбор этой попытки. Технически непроверенная позиция остаётся текущей.'); return; }
      const timestamp = Date.now();
      const finished = stored.index + 1 === stored.queue.length;
      const next: TrainingSession = { ...stored, index: stored.index + 1, status: finished ? 'completed' : 'active', updatedAt: timestamp, completedAt: finished ? timestamp : undefined };
      persistSession(next); setError(null); setSession(next); refresh();
      if (finished) setView('summary');
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось сохранить переход.'); }
  }

  const currentItem = session?.queue[session.index];
  const currentExercise = trainingExercises.find((exercise) => exercise.id === currentItem?.exerciseId);
  const sessionResults = session?.queue.map((item) => (histories[item.exerciseId] || []).find((attempt) => attempt.sessionId === session.id && attempt.sessionKind === item.kind)).filter((item): item is HistoryItem => Boolean(item)) || [];

  if (!ready) return <div className="training-shell"><p className="training-muted" role="status">Восстанавливаем расписание…</p></div>;

  if (view === 'session' && session?.status === 'active') return <div className="course-shell training-session">
    <nav className="training-session-nav"><button type="button" onClick={() => setView('dashboard')}>← Приостановить и сохранить</button><span>Позиция {session.index + 1} / {session.queue.length}</span></nav>
    <header className="training-session-heading"><p className="training-eyebrow">Самостоятельный расчёт</p><h1>Смешанная практика</h1><p>Тема скрыта. Соперник отвечает за себя; ответ откроется только по твоей команде.</p><p>{session.kind === 'diagnostic' ? `Диагностика — два подхода по шесть позиций. Сейчас ${session.index < 6 ? 'первый' : 'второй'} подход. Можно сделать паузу и позже продолжить эту же очередь.` : session.kind === 'practice' ? 'Ориентир для шести позиций — 45–60 минут. Таймера нет; можно сделать паузу и продолжить с сохранённой позиции.' : 'Можно сделать паузу: контрольная продолжится с этой же позиции.'}</p></header>
    {error && <p className="training-error" role="status">{error}</p>}
    {currentExercise && currentItem ? <AutoReplyTrainer key={`${session.id}-${session.index}`} exercise={currentExercise} index={session.index} onNext={advance} trainingContext={{ sessionId: session.id, kind: currentItem.kind, conceal: true }} /> : <div className="training-empty"><h2>Сохранённая позиция недоступна</h2><p>Очередь сохранена. Она не была заменена другой сессией.</p></div>}
  </div>;

  if (view === 'summary' && session?.status === 'completed') return <div className="training-shell">
    <p className="training-eyebrow">Сессия завершена</p><h1>Результат практики</h1><p className="training-lead">Все {session.queue.length} позиций зафиксированы. В итогах — первая попытка каждой позиции; перезапуски её не заменяют. {session.kind === 'diagnostic' ? 'Разборы и история всех двенадцати диагностических попыток сохранены. ' : ''}Освоение учитывается после отложенных самостоятельных повторов.</p>
    <div className="training-stats training-summary-stats">{(['passed', 'needs-review', 'incomplete'] as const).map((outcome) => <div key={outcome}><strong>{sessionResults.filter((item) => item.audit?.outcome === outcome).length}</strong><span>{outcome === 'passed' ? 'план проведён' : outcome === 'needs-review' ? 'нужен разбор' : 'не завершено'}</span></div>)}</div>
    <ol className="training-result-list">{session.queue.map((item, index) => {
      const result = sessionResults.find((attempt) => attempt.exerciseId === item.exerciseId);
      const exercise = trainingExercises.find((candidate) => candidate.id === item.exerciseId);
      const skill = trainingSkills.find((candidate) => candidate.id === exercise?.trainingMeta?.skillId);
      return <li key={item.exerciseId}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{skill?.title || 'Практика'}</strong><small>{result?.assisted ? 'С помощью материалов' : 'Без помощи материалов'}</small></div><span>{result?.audit?.outcome === 'passed' ? 'План проведён' : result?.audit?.outcome === 'needs-review' ? 'Нужен разбор' : 'Не завершено'}</span></li>;
    })}</ol>
    <button type="button" className="training-primary" onClick={() => setView('dashboard')}>К расписанию →</button>
  </div>;

  return <div className="training-shell">
    <nav className="training-breadcrumb"><Link href="/">Курс по Вуковичу</Link><span>/</span><span>Длительная практика</span></nav>
    <header className="training-heading"><div><p className="training-eyebrow">Расчёт · Выбор плана · Защита</p><h1>Атака как навык</h1><p className="training-lead">Смешанные позиции без названия темы. Новые задачи и отложенные повторы в одном расписании.</p></div><p className="training-bank-count">{TRAINING_BANK_META.count}<span>позиций в банке</span></p></header>
    {error && <p className="training-error" role="status">{error}</p>}
    <DailyPracticeGoal />
    <div className="training-stats"><div><strong>{newCount}</strong><span>новых для практики</span></div><div><strong>{dueCount}</strong><span>доступно к повтору</span></div><div><strong>{masteredCount}</strong><span>позиций освоено</span></div></div>

    {pending && <section className="training-resume"><div><p className="training-eyebrow">Сохранённая очередь</p><h2>Продолжить с позиции {session.index + 1} из {session.queue.length}</h2><p>Можно вернуться после перерыва: очередь, текущая позиция и ответы соперника сохранены. Новая сессия станет доступна после этой.</p></div><button type="button" className="training-primary" onClick={() => { setError(null); setView('session'); }}>Продолжить →</button></section>}

    <div className="training-dashboard-grid">
      <section className="training-start"><p className="training-eyebrow">{hasDiagnostic ? 'Следующая сессия' : 'Начало тренинга'}</p><h2>{hasDiagnostic ? 'Смешанная практика' : 'Диагностика без подсказок'}</h2><p>{hasDiagnostic ? 'До шести позиций: сначала назначенные повторы, затем новые задачи разных типов. Ориентир — 45–60 минут, без таймера.' : 'Двенадцать позиций из разных областей атаки — два подхода по шесть. Каждый подход рассчитан примерно на 45–60 минут; можно остановиться и позже продолжить ту же очередь.'}</p>
        <button type="button" className={pending ? 'training-secondary' : 'training-primary'} disabled={pending || starting || invalidStorage || !selection.length || (!hasDiagnostic && selection.length < 12)} onClick={() => start(hasDiagnostic ? 'practice' : 'diagnostic')}>{hasDiagnostic ? `Начать · ${Math.min(6, selection.length)} позиций` : 'Начать диагностику · 12 позиций'} →</button>
        {!hasDiagnostic && <button type="button" className="training-text-button" disabled={pending || starting || invalidStorage || !selection.length} onClick={() => start('practice')}>Смешанная практика · до 6 позиций · 45–60 минут</button>}
        {!selection.length && <p className="training-note">На сегодня доступные позиции закончились.{nextDue ? ` Следующий повтор — ${formatTime(nextDue)} (Москва).` : ''}</p>}
      </section>
      <section className="training-schedule"><p className="training-eyebrow">Чтобы удержать навык</p><h2>Возвращаться с интервалом</h2><p>После первого самостоятельного решения — четыре успешных повторения. Интервал отсчитывается от последней попытки или просмотра разбора.</p><ol className="training-intervals"><li><strong>1</strong><span>день</span></li><li><strong>3</strong><span>дня</span></li><li><strong>7</strong><span>дней</span></li><li><strong>21</strong><span>день</span></li></ol><p className="training-note">Ранний повтор, подсказка или повторное чтение разбора запускают текущий интервал заново, сохраняя ступень. Неудачная попытка возвращает позицию к повторному изучению. В тот же день задача снова не предлагается.</p></section>
    </div>

    <section className="training-skills"><div className="training-section-heading"><h2>Области практики</h2><span>В сессии тема скрыта</span></div><div className="training-skill-grid">{trainingSkills.map((skill, index) => {
      const positions = practice.filter((exercise) => exercise.trainingMeta?.skillId === skill.id);
      return <article key={skill.id}><span className="training-skill-number">{String(index + 1).padStart(2, '0')}</span><h3>{skill.title}</h3><p>{skill.description}</p><small>{positions.filter((exercise) => states[exercise.id].mastered).length} / {positions.length} позиций освоено</small></article>;
    })}</div></section>

    <section className="training-exam"><div><p className="training-eyebrow">Отложенная проверка переноса</p><h2>Контрольная на новых позициях</h2><p>Двенадцать незнакомых задач из отдельного резерва. Осталось {unseenExam.length} из {exam.length} позиций; они не входят в обычную практику.</p><ul className="training-exam-requirements"><li data-done={completedPractice >= 24}>{Math.min(completedPractice, 24)} / 24 разных позиций с подтверждённой попыткой</li><li data-done={independentPassed >= 12}>{Math.min(independentPassed, 12)} / 12 самостоятельных успешных решений</li><li data-done={longReviews >= 2}>{Math.min(longReviews, 2)} / 2 успешных повтора с интервалом от 7 дней</li></ul></div><div className="training-exam-action"><button type="button" className="training-secondary" disabled={!examUnlocked || !enoughUnseenExam || pending || starting || invalidStorage} onClick={() => start('exam')}>{!enoughUnseenExam ? unseenExam.length === 0 ? 'Резерв контрольных исчерпан' : 'Недостаточно новых позиций' : examUnlocked ? 'Начать контрольную →' : 'Пока недоступна'}</button><p>{!enoughUnseenExam ? 'Для новой контрольной нужны двенадцать ещё не начатых позиций. Уже знакомые задачи повторно в контрольную не попадают.' : examUnlocked ? 'Обратная связь — после фиксации каждой попытки.' : 'Продолжай новую практику и возвращайся к назначенным повторам.'}</p></div></section>
    <p className="training-storage-note">История и очередь сохраняются в этом браузере. Сложность источника: {TRAINING_BANK_META.minRating}–{TRAINING_BANK_META.maxRating} по рейтингу задач Lichess. Расписание показывает устойчивость решения этих позиций; результат тренинга не является прогнозом игрового рейтинга.</p>
  </div>;
}
