import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { endgameLessons, getEndgameLesson } from '@/data/endgames';
import { EndgameTrainer } from '@/components/endgames/EndgameTrainer';

export function generateStaticParams() { return endgameLessons.map(lesson => ({ id: lesson.id })); }
export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const lesson = getEndgameLesson(params.id);
  return { title: lesson ? 'Доигрывание эндшпиля' : 'Позиция не найдена' };
}
export default function EndgamePage({ params }: { params: { id: string } }) {
  const lesson = getEndgameLesson(params.id);
  if (!lesson) notFound();
  return <Suspense fallback={<div className="endgame-loading" role="status">Подготавливаем позицию…</div>}><EndgameTrainer key={lesson.id} lesson={lesson} /></Suspense>;
}
