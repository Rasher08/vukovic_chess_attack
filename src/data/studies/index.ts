import { VukovicStudy, ChapterId, StudySummary } from '@/types/chess';
import { chapter1Studies } from './chapter1_greek_gift';
import { chapter2Studies } from './chapter2_rook_lift';
import { chapter3Studies } from './chapter3_pawn_demolition';
import { chapter4Studies } from './chapter4_king_hunt';

export { chapter1Studies } from './chapter1_greek_gift';
export { chapter2Studies } from './chapter2_rook_lift';
export { chapter3Studies } from './chapter3_pawn_demolition';
export { chapter4Studies } from './chapter4_king_hunt';

/**
 * Полный реестр всех 18 учебных этюдов курса по Вуковичу
 */
export const allStudies: VukovicStudy[] = [
  ...chapter1Studies,
  ...chapter2Studies,
  ...chapter3Studies,
  ...chapter4Studies,
];

/**
 * Находит этюд по уникальному идентификатору
 * @param id ID этюда
 */
export function getStudyById(id: string): VukovicStudy | undefined {
  return allStudies.find((study) => study.id === id);
}

/**
 * Возвращает все этюды указанной главы
 * @param chapter ID главы
 */
export function getStudiesByChapter(chapter: ChapterId): VukovicStudy[] {
  return allStudies.filter((study) => study.chapter === chapter);
}

/**
 * Возвращает массив идентификаторов всех этюдов (для generateStaticParams в Next.js)
 */
export function getAllStudyIds(): string[] {
  return allStudies.map((study) => study.id);
}

/**
 * Преобразует этюды в краткие карточки для каталога
 */
export function getAllStudySummaries(): StudySummary[] {
  return allStudies.map((study) => ({
    id: study.id,
    title: study.title,
    white: study.white,
    black: study.black,
    year: study.year,
    eco: study.eco,
    chapter: study.chapter,
    chapterTitle: study.chapterTitle,
    difficulty: study.difficulty,
    tags: study.tags,
    description: study.description,
    calculationTargetPlies: study.calculationTargetPlies,
  }));
}
