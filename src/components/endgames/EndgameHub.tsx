'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { endgameLessons, endgameTracks } from '@/data/endgames';
import { ENDGAME_PROGRESS_EVENT, loadEndgameProgress, type EndgameProgress } from '@/lib/endgameProgress';
import './endgames.css';

const LEVELS = { foundation: 'Точная техника', club: 'Практика', advanced: 'Сложная позиция' };

export function EndgameHub() {
  const [progress, setProgress] = useState<EndgameProgress | null>(null);
  useEffect(() => {
    const sync = () => setProgress(loadEndgameProgress());
    sync(); window.addEventListener(ENDGAME_PROGRESS_EVENT, sync); window.addEventListener('storage', sync);
    return () => { window.removeEventListener(ENDGAME_PROGRESS_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const passed = endgameLessons.filter(lesson => progress?.lessons[lesson.id]?.lastPassedAt).length;
  const active = [...endgameLessons].sort((left, right) => (progress?.lessons[right.id]?.activeAttempt?.updatedAt || 0) - (progress?.lessons[left.id]?.activeAttempt?.updatedAt || 0)).find(lesson => progress?.lessons[lesson.id]?.activeAttempt);
  const due = endgameLessons.filter(lesson => {
    const date = progress?.lessons[lesson.id]?.nextReviewAt;
    return date && date <= Date.now();
  });
  const untried = [...endgameLessons].sort((left, right) => Number(right.track === 'practical') - Number(left.track === 'practical')).find(lesson => !progress?.lessons[lesson.id]?.history.length && !progress?.lessons[lesson.id]?.activeAttempt);
  const mixed = progress ? active || due[0] || untried || [...endgameLessons].sort((left, right) => (progress.lessons[left.id]?.lastPassedAt || 0) - (progress.lessons[right.id]?.lastPassedAt || 0))[0] : null;
  return <div className="endgame-hub">
    <header className="endgame-hub-heading"><div><p className="endgame-eyebrow">ПРАКТИКУМ · NONCHALANT</p><h1>Доведи до результата.</h1><p className="endgame-lead">Активный король. Вторая слабость. Точная защита.<br />Длинные позиции против сильной защиты.</p></div><div className="endgame-hub-count"><strong>{endgameLessons.length}</strong><span>позиций для доигрывания</span></div></header>
    <div className="endgame-hub-stats"><span><strong>{passed}</strong> позиций с выполненной целью</span><span><strong>{due.length}</strong> пора повторить</span><span><strong>45–60</strong> минут · 1–2 позиции</span></div>
    {active && <section className="endgame-resume"><div><span className="endgame-eyebrow">ПРОДОЛЖИТЬ</span><h2>Текущая позиция</h2><p>Твоя позиция и сыгранные ходы сохранены в этом браузере.</p></div><Link href={`/endgames/${active.id}?mode=blind`} className="endgame-primary">Вернуться на доску<ArrowRight size={15} /></Link></section>}
    {mixed && <section className="endgame-mixed-start"><div><span className="endgame-eyebrow">БЕЗ ПОДСКАЗКИ ТЕМЫ</span><h2>Смешанная практика</h2><p>Одна длинная позиция: сначала незаконченная попытка, затем отложенные повторы и новые окончания. Название и разбор откроются по запросу.</p></div><Link href={`/endgames/${mixed.id}?mode=blind`} className="endgame-primary">{active ? 'Продолжить попытку' : 'Получить позицию'}<ArrowRight size={15} /></Link></section>}
    <section className="endgame-how"><div><span className="endgame-eyebrow">КАК ЗАНИМАТЬСЯ</span><h2>План → игра → разбор → повтор.</h2></div><p>Запиши план и играй своей стороной против движка. Во время попытки оценки и подсказки скрыты. В выигранной позиции цель — настоящая победа. В защите — ничья или заданный отрезок с подтверждённым удержанием. Хорошие альтернативы допустимы.</p></section>
    <div className="endgame-tracks">{endgameTracks.map((track, index) => <section key={track.id} className="endgame-track"><header><span className="endgame-eyebrow">0{index + 1}</span><div><h2>{track.title}</h2><p>{track.description}</p></div></header><div className="endgame-lesson-list">{endgameLessons.filter(lesson => lesson.track === track.id).map((lesson, position) => {
      const record = progress?.lessons[lesson.id];
      const status = record?.activeAttempt?.planLocked ? 'Продолжить' : record?.masteredAt ? 'Закреплено повторами' : record?.nextReviewAt && record.nextReviewAt <= Date.now() ? 'Пора повторить' : record?.lastPassedAt ? 'Цель выполнена' : LEVELS[lesson.level];
      return <Link key={lesson.id} href={`/endgames/${lesson.id}`}><span className="endgame-lesson-number">{String(position + 1).padStart(2, '0')}</span><div><h3>{lesson.title}</h3><p>{lesson.description}</p></div><small>{status}</small><ArrowRight size={16} /></Link>;
    })}</div></section>)}</div>
    <section className="endgame-method"><h2>Техника требует повторения.</h2><p>Первая подборка объединяет теоретические окончания и практические позиции для уровня около 2200 Chess.com. Ориентиры программы — эндшпильная стратегия Шерешевского и Хеллстена; объяснения написаны для nonchalant. Источники указаны в разборах.</p><p>Stockfish отвечает из фактической позиции. Для доступных окончаний до семи фигур используется точная таблица исходов; при её недоступности игра продолжается с движком. Один успешно сыгранный эндшпиль ещё не означает, что навык закреплён: возвращайся к позиции после перерыва.</p><small>Результаты сохраняются в этом браузере отдельно от курса атаки.</small></section>
  </div>;
}
