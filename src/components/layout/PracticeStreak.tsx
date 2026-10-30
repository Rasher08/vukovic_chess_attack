'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Flame } from 'lucide-react';
import { COURSE_PROGRESS_EVENT, COURSE_PROGRESS_KEY, loadCourseProgress } from '@/lib/courseProgress';
import { getPracticeStreak, type PracticeStreak as Streak } from '@/lib/practiceStreak';
import { ENDGAME_PROGRESS_EVENT, ENDGAME_PROGRESS_KEY, getEndgameSolvedTimestamps, loadEndgameProgress } from '@/lib/endgameProgress';
import './practice-streak.css';

function dayWord(days: number) {
  const lastTwo = days % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'дней';
  return days % 10 === 1 ? 'день' : days % 10 >= 2 && days % 10 <= 4 ? 'дня' : 'дней';
}

function usePracticeStreak() {
  const [streak, setStreak] = useState<Streak>({ currentDays: 0, longestDays: 0, todayComplete: false });
  useEffect(() => {
    const refresh = () => setStreak(getPracticeStreak(loadCourseProgress(), Date.now(), getEndgameSolvedTimestamps(loadEndgameProgress())));
    const storageChanged = (event: StorageEvent) => {
      if (event.key === COURSE_PROGRESS_KEY || event.key === ENDGAME_PROGRESS_KEY || event.key === null) refresh();
    };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    window.addEventListener(COURSE_PROGRESS_EVENT, refresh);
    window.addEventListener(ENDGAME_PROGRESS_EVENT, refresh);
    window.addEventListener('storage', storageChanged);
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener(COURSE_PROGRESS_EVENT, refresh);
      window.removeEventListener(ENDGAME_PROGRESS_EVENT, refresh);
      window.removeEventListener('storage', storageChanged);
      document.removeEventListener('visibilitychange', visible);
      window.clearInterval(timer);
    };
  }, []);
  return streak;
}

export function PracticeStreak() {
  const streak = usePracticeStreak();
  const goal = streak.todayComplete ? 'Сегодня задача решена — дневная цель выполнена.' : 'Реши хотя бы одну задачу сегодня, чтобы продолжить серию.';
  const description = `Серия: ${streak.currentDays} ${dayWord(streak.currentDays)}. ${goal} Дни считаются по Москве.`;
  return <Link href="/train" className="home-streak" data-complete={streak.todayComplete} title={description} aria-label={description}>
    <Flame size={17} aria-hidden="true" />
    <span className="home-streak-count">{streak.currentDays}</span>
    <span className="home-streak-word">{dayWord(streak.currentDays)}</span>
    {streak.todayComplete && <Check size={12} className="home-streak-check" aria-hidden="true" />}
  </Link>;
}

export function DailyPracticeGoal() {
  const streak = usePracticeStreak();
  return <section className="practice-daily-goal" aria-label="Дневная практика" data-complete={streak.todayComplete}>
    <div className="practice-daily-series">
      <Flame size={22} aria-hidden="true" />
      <div><p>Серия занятий</p><strong>{streak.currentDays} {dayWord(streak.currentDays)}</strong></div>
    </div>
    <div className="practice-daily-target">
      <strong>Сегодня {streak.todayComplete ? '1' : '0'} / 1{streak.todayComplete && <Check size={14} aria-hidden="true" />}</strong>
      <p>{streak.todayComplete ? 'Дневная цель выполнена.' : 'Реши одну задачу, чтобы продлить серию.'}</p>
      <small>День считается по Москве. Серия сохраняется в этом браузере.</small>
    </div>
  </section>;
}
