'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight, Search, X } from 'lucide-react';
import { courseChapters, courseExercises } from '@/data/course';
import { COURSE_PROGRESS_EVENT, loadCourseProgress } from '@/lib/courseProgress';
import trainingManifest from '@/data/trainingManifest.json';
import '@/components/catalog/course-home.css';

type ChapterFilter = 'all' | 'practice' | 'review';
const numberLabel = (value: number) => String(value).padStart(2, '0');
const exerciseLabel = (count: number) => {
  const remainder = count % 100;
  if (remainder >= 11 && remainder <= 14) return `${count} задач`;
  if (count % 10 === 1) return `${count} задача`;
  if (count % 10 >= 2 && count % 10 <= 4) return `${count} задачи`;
  return `${count} задач`;
};
const exampleLabel = (count: number) => `${count} ${count === 1 ? 'учебный пример' : count < 5 ? 'учебных примера' : 'учебных примеров'}`;

export default function HomePage() {
  const [progress, setProgress] = useState<ReturnType<typeof loadCourseProgress> | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChapterFilter>('all');
  useEffect(() => {
    const refresh = () => setProgress(loadCourseProgress());
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(COURSE_PROGRESS_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(COURSE_PROGRESS_EVENT, refresh);
    };
  }, []);

  const availableIds = new Set(courseExercises.map((exercise) => exercise.id));
  const chapterExercises = (ids: string[]) => ids.filter((id) => availableIds.has(id));
  const solvedIds = new Set(Object.entries(progress?.exercises ?? {}).filter(([, record]) => record.status === 'solved').map(([id]) => id));
  const reviewIds = new Set(Object.entries(progress?.exercises ?? {}).filter(([, record]) => record.status === 'review').map(([id]) => id));
  const solvedCount = courseExercises.filter((exercise) => solvedIds.has(exercise.id)).length;
  const reviewCount = courseExercises.filter((exercise) => reviewIds.has(exercise.id)).length;
  const lastChapter = courseChapters.find((chapter) => chapter.id === progress?.lastChapterId);
  const nextChapter = lastChapter ?? courseChapters[0];
  const lastExercise = courseExercises.find((exercise) => exercise.id === progress?.lastExerciseId && exercise.chapterId === nextChapter.id);
  const continueHref = `/course/${nextChapter.id}${lastExercise && progress?.lastStudyView !== 'theory' ? `?exercise=${encodeURIComponent(lastExercise.id)}` : ''}`;
  const search = query.trim().toLocaleLowerCase('ru');
  const visibleChapters = courseChapters.filter((chapter) => {
    const ids = chapterExercises(chapter.exercises);
    const matchesSearch = !search || `${chapter.title} ${chapter.summary} ${chapter.goals.join(' ')}`.toLocaleLowerCase('ru').includes(search);
    return matchesSearch && (filter === 'all' || (filter === 'practice' && ids.length > 0) || (filter === 'review' && ids.some((id) => reviewIds.has(id))));
  });

  return (
    <div className="home-page">
      <div className="home-shell">
        <aside className="home-sidebar" aria-label="Оглавление курса">
          <div className="home-sidebar-sticky">
            <div className="home-eyebrow">Оглавление</div>
            <nav className="home-outline">
              {courseChapters.map((chapter) => (
                <a key={chapter.id} href={`#chapter-${chapter.id}`} className="home-outline-link" onClick={() => { setFilter('all'); setQuery(''); }}>
                  <span>{numberLabel(chapter.number)}</span><span>{chapter.title}</span>
                </a>
              ))}
            </nav>
            <div className="home-profile">
              <span className="home-eyebrow">Ваш ориентир</span>
              <div className="home-profile-rating">2200 <span>Chess.com</span></div>
              <p>Работа над выбором плана, защитой и точностью расчёта.</p>
            </div>
          </div>
        </aside>

        <div className="home-main">
          <section className="home-introduction" aria-labelledby="course-title">
            <div className="home-intro-meta"><span className="home-eyebrow">Изучение · Расчёт · Закрепление</span><span className="home-edition">По темам В. Вуковича</span></div>
            <h1 id="course-title">Искусство атаки<br /><span>в шахматах.</span></h1>
            <p className="home-intro-description">Увидеть предпосылки. Выбрать план.<br className="home-desktop-break" /> Проверить его лучшей защитой соперника.</p>
            <div className="home-course-facts"><span>{courseChapters.length} глав</span><span>60 разделов</span><span>{trainingManifest.count} позиций для закрепления</span></div>
          </section>

          <section className="home-endgames-feature" aria-labelledby="endgames-feature-title">
            <div><span className="home-eyebrow">Новый раздел · Техника окончаний</span><h2 id="endgames-feature-title">Довести перевес<br />до результата.</h2><p>Выбери план и сыграй позицию против сильной защиты. Реализация, практические окончания и борьба за ничью. Разбор открывается после попытки.</p><div className="home-program-facts"><span>Свои планы и альтернативы</span><span>Доигрывание против движка</span><span>Отложенные повторы</span></div></div>
            <Link href="/endgames" className="home-button home-button-primary">Открыть эндшпили <ArrowRight size={17} /></Link>
          </section>

          <section className="home-training-program" aria-labelledby="training-program-title">
            <div className="home-eyebrow">Длительная программа · Ориентир 45–60 минут</div>
            <h2 id="training-program-title">Уметь решить новую позицию.<br />И вспомнить спустя время.</h2>
            <p>Изучение принципов и {exampleLabel(courseExercises.length)} — начало работы. Дальше — смешанные сессии без подсказки темы, ответы движка и отложенные повторы. Обычная сессия содержит до шести позиций.</p>
            <div className="home-program-facts"><span>{trainingManifest.practiceCount} позиций для практики</span><span>{trainingManifest.examCount} новых для контроля</span><span>Повторы: 1 · 3 · 7 · 21 день</span></div>
            <Link href="/train" className="home-button home-button-primary">Открыть длительный тренинг <ArrowRight size={17} /></Link>
          </section>

          <section className="home-resume" id="practice" aria-labelledby="resume-title">
            <div>
              <div className="home-eyebrow">{lastChapter ? 'Вернуться к изучению' : 'Начать с теории'}</div>
              <h2 id="resume-title"><span>{numberLabel(nextChapter.number)}.</span> {nextChapter.title}</h2>
              <p>{lastExercise ? lastExercise.title : nextChapter.summary}</p>
              <div className="home-progress-note" aria-live="polite">{progress ? `${solvedCount} из ${courseExercises.length} учебных примеров пройдено${reviewCount ? ` · ${reviewCount} к разбору` : ''}` : 'Загрузка сохранённого прогресса…'}</div>
            </div>
            <Link href={continueHref} className="home-button home-button-primary">{lastChapter ? 'Продолжить' : 'Начать учиться'} <ArrowRight size={17} /></Link>
          </section>

          <section id="chapters" className="home-chapters" aria-labelledby="chapters-title">
            <div className="home-section-heading"><div><span className="home-eyebrow">Программа курса</span><h2 id="chapters-title">От первого замысла<br />до атаки на рокировку</h2></div><a href="#learning" className="home-text-link">Как заниматься <ArrowDown size={14} /></a></div>
            <div className="home-catalog-tools">
              <div className="home-filters" aria-label="Фильтр глав">
                <button type="button" onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>Все главы</button>
                <button type="button" onClick={() => setFilter('practice')} aria-pressed={filter === 'practice'}>С практикой</button>
                <button type="button" onClick={() => setFilter('review')} aria-pressed={filter === 'review'}>К повторению{reviewCount > 0 && <span> {reviewCount}</span>}</button>
              </div>
              <div className="home-search"><Search size={15} aria-hidden="true" /><input aria-label="Найти тему курса" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти тему" />{query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={14} /></button>}</div>
            </div>
            <div className="home-chapter-list">
              {visibleChapters.map((chapter) => {
                const ids = chapterExercises(chapter.exercises);
                const solved = ids.filter((id) => solvedIds.has(id)).length;
                const review = ids.filter((id) => reviewIds.has(id)).length;
                return (
                  <article key={chapter.id} id={`chapter-${chapter.id}`} className="home-chapter">
                    <span className="home-chapter-number">{numberLabel(chapter.number)}</span>
                    <div className="home-chapter-content">
                      <div className="home-chapter-meta"><span>Глава {numberLabel(chapter.number)}</span><span className={review ? 'home-status-review' : ''}>{review ? 'Есть что разобрать' : solved > 0 ? `${solved} из ${ids.length} пройдено` : 'Изучение и учебные примеры'}</span></div>
                      <h3><Link href={`/course/${chapter.id}`}>{chapter.title}</Link></h3>
                      <p>{chapter.summary}</p>
                      <div className="home-chapter-bottom"><span>5 разделов · {exampleLabel(ids.length)}</span><Link href={`/course/${chapter.id}`} className="home-chapter-open">Открыть главу <ArrowRight size={15} /></Link></div>
                    </div>
                  </article>
                );
              })}
              {visibleChapters.length === 0 && <div className="home-empty"><h3>{filter === 'review' && !query ? 'Пока нечего повторять' : 'Тема не найдена'}</h3><p>{filter === 'review' && !query ? 'Здесь появятся главы с задачами, к которым стоит вернуться.' : 'Попробуйте другое название или откройте все главы.'}</p><button type="button" className="home-text-link" onClick={() => { setFilter('all'); setQuery(''); }}>Показать все главы <ArrowRight size={15} /></button></div>}
            </div>
          </section>

          <section id="learning" className="home-learning" aria-labelledby="learning-title">
            <span className="home-eyebrow">Как заниматься</span><h2 id="learning-title">Сначала своё решение.<br />Затем — разбор.</h2>
            <div className="home-learning-steps"><div><span>01</span><h3>Рассчитайте до хода</h3><p>Зафиксируйте кандидатов, сильнейший ответ и ожидаемую оценку. Тема смешанной задачи скрыта.</p></div><div><span>02</span><h3>Проверьте за доской</h3><p>Сыграйте против движка. Разбор открывается после попытки; раннее завершение не даёт полного зачёта.</p></div><div><span>03</span><h3>Вернитесь спустя время</h3><p>Четыре самостоятельных отложенных повтора проверяют удержание позиции. Контроль использует отдельный набор.</p></div></div>
            <p className="home-storage-note">Прогресс сохраняется в этом браузере. 2200 Chess.com — ориентир пользователя. Рейтинг задач Lichess в дополнительном банке относится к другой шкале и показывается после попытки.</p>
          </section>

          <section id="sources" className="home-sources" aria-labelledby="sources-title">
            <span className="home-eyebrow">Библиотека</span><h2 id="sources-title">О книге и материалах</h2>
            <p>Курс следует темам книги Владимира Вуковича «Искусство атаки в шахматах» (The Art of Attack in Chess). Объяснения и учебные задания подготовлены для этого проекта. Происхождение каждой позиции и объём проверки указаны в её разборе.</p>
            <p>Дополнительные {trainingManifest.count} позиций взяты из открытой базы Lichess CC0. Это отдельная практика, а не примеры, приписанные Вуковичу. Полный текст книги здесь не воспроизводится.</p>
            <p>В разделе «Эндшпиль» — отдельная авторская программа по технике реализации и защиты. Методические ориентиры: «Стратегия эндшпиля» Михаила Шерешевского и Mastering Endgame Strategy Йохана Хеллстена. Источники и границы проверки позиций указаны в разборах.</p>
            <div className="home-source-links">
              <a href="https://chesspro.ru/books/vukovich_iskusstvo_ataki_v_shahmatah" target="_blank" rel="noreferrer">Фрагмент книги · ChessPro <span aria-hidden="true">↗</span></a>
              <a href="https://chessm.ru/8734/" target="_blank" rel="noreferrer">Русское издание · Издатель <span aria-hidden="true">↗</span></a>
              <a href="https://www.newinchess.com/art-of-attack-in-chess" target="_blank" rel="noreferrer">Книга · New in Chess <span aria-hidden="true">↗</span></a>
              <a href="https://www.simonandschuster.com/books/The-Art-of-Attack-in-Chess/Vladimir-Vukovic/9781857447712" target="_blank" rel="noreferrer">Издание · Everyman Chess <span aria-hidden="true">↗</span></a>
              <a href="https://database.lichess.org/" target="_blank" rel="noreferrer">Дополнительная практика · Lichess CC0 <span aria-hidden="true">↗</span></a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
