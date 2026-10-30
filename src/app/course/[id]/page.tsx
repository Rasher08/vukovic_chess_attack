import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { courseChapters, courseExercises } from '@/data/course';
import { CourseLesson } from '@/components/course/CourseLesson';

export function generateStaticParams() {
  return courseChapters.map((chapter) => ({ id: chapter.id }));
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const chapter = courseChapters.find((item) => item.id === params.id);
  return { title: chapter ? `${chapter.title} — Практикум Вуковича` : 'Глава не найдена', description: chapter?.summary };
}

export default function CoursePage({ params }: { params: { id: string } }) {
  const chapter = courseChapters.find((item) => item.id === params.id);
  if (!chapter) notFound();
  const exercises = chapter.exercises.map((id) => courseExercises.find((item) => item.id === id)).filter((item): item is (typeof courseExercises)[number] => Boolean(item));
  return <CourseLesson chapter={chapter} exercises={exercises} chapters={courseChapters} />;
}
