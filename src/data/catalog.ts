import { ChapterInfo, ChapterId, StudySummary } from '@/types/chess';
import { allStudies, getAllStudySummaries, getStudiesByChapter } from './studies';

/**
 * Каталог 4 тематических глав курса Владимира Вуковича «Искусство атаки в шахматах»
 */
export const CHAPTERS: ChapterInfo[] = [
  {
    id: 'greek_gift',
    title: 'Классическая жертва слона (Greek Gift)',
    subtitle: 'Жертва 1.Bxh7+ Kxh7 2.Ng5+ и дихотомия защит 2...Kg8 vs 2...Kg6',
    description:
      'Фундаментальное исследование классической жертвы на h7: точный расчет против отходов 2...Kg8 (маневры Qh5 vs Qd3!), королевского рейда 2...Kg6 (пешечные тараны h4! и вскрытие короля) и 6-пунктовый чек-лист предпосылок.',
    iconName: 'Flame',
    studiesCount: 5,
  },
  {
    id: 'rook_lift',
    title: 'Ладейные лифты и вертикальные батареи',
    subtitle: 'Подключение ладей по 3-й горизонтали и сдвоение по линиям h и g',
    description:
      'Искусство ввода резервов в атаку: маневры ладей Rd1-d3-h3 и Rf1-f3-h3, концентрация ферзя и ладей по вскрытым вертикалям «h» и «g», тактические отвлечения и связки.',
    iconName: 'Shield',
    studiesCount: 5,
  },
  {
    id: 'pawn_demolition',
    title: 'Разрушение пешечного прикрытия короля',
    subtitle: 'Жертвы на пунктах f7, g7, h7 и отрезание путей отступления',
    description:
      'Методы уничтожения пешечного забора рокировки: сокрушительные удары на f7 (Алехин), пешечные клинья e6 (Шпильман), устранение ключевых защитников и вскрытие диагоналей.',
    iconName: 'Bomb',
    studiesCount: 4,
  },
  {
    id: 'king_hunt',
    title: 'Бессмертная охота на короля (King Hunts)',
    subtitle: 'Преследование монарха через всю доску форсированными шахами',
    description:
      'Драматические образцы выманивания короля из укреплений: жертвы ферзя, каскад двойных шахов конями и слонами (Эд. Ласкер, Рети, Греко) и форсированный марш через всю доску до мата.',
    iconName: 'Crown',
    studiesCount: 4,
  },
];

/**
 * Возвращает метаданные главы по ее идентификатору
 * @param chapterId ID главы
 */
export function getChapterInfo(chapterId: ChapterId): ChapterInfo | undefined {
  return CHAPTERS.find((ch) => ch.id === chapterId);
}

/**
 * Возвращает краткие карточки этюдов для конкретной главы
 * @param chapterId ID главы
 */
export function getStudySummariesByChapter(chapterId: ChapterId): StudySummary[] {
  return getStudiesByChapter(chapterId).map((study) => ({
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

/**
 * Фильтрация карточек этюдов по сложности
 * @param difficulty 1800 | 2000 | 2200
 */
export function getStudiesByDifficulty(difficulty: 1800 | 2000 | 2200): StudySummary[] {
  return getAllStudySummaries().filter((s) => s.difficulty === difficulty);
}

/**
 * Общая статистика каталога курса
 */
export function getCatalogStats(): {
  totalStudies: number;
  totalChapters: number;
  byDifficulty: Record<string, number>;
} {
  return {
    totalStudies: allStudies.length,
    totalChapters: CHAPTERS.length,
    byDifficulty: {
      '1800': allStudies.filter((s) => s.difficulty === 1800).length,
      '2000': allStudies.filter((s) => s.difficulty === 2000).length,
      '2200': allStudies.filter((s) => s.difficulty === 2200).length,
    },
  };
}
