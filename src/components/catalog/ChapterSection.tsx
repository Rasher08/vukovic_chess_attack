import React from 'react';
import { ChapterInfo, StudySummary, VukovicStudy } from '@/types/chess';
import { Flame, Shield, Bomb, Crown, BookMarked, Sparkles } from 'lucide-react';
import StudyCard from './StudyCard';

export interface ChapterSectionProps {
  chapter: ChapterInfo;
  studies: (StudySummary | VukovicStudy)[];
}

export function ChapterSection({ chapter, studies }: ChapterSectionProps) {
  // Выбор иконки главы
  const getChapterIcon = (iconName: string) => {
    switch (iconName) {
      case 'Flame':
        return <Flame className="w-6 h-6 text-amber-400" />;
      case 'Shield':
        return <Shield className="w-6 h-6 text-blue-400" />;
      case 'Bomb':
        return <Bomb className="w-6 h-6 text-rose-400" />;
      case 'Crown':
        return <Crown className="w-6 h-6 text-amber-300" />;
      default:
        return <BookMarked className="w-6 h-6 text-amber-400" />;
    }
  };

  // Тематические бейджи для каждой главы
  const chapterThemeBadges: Record<string, string[]> = {
    greek_gift: ['Жертва 1.Bxh7+', 'Защита 2...Kg8', 'Рейд 2...Kg6', 'Маневр 3.Qd3!', 'Таран 3.h4!'],
    rook_lift: ['Ладейный подъем Rd3/Rf3', 'Линия «h»', 'Линия «g»', 'Батарея Ферзь + Ладья'],
    pawn_demolition: ['Прорыв f7', 'Жертва на g7', 'Пешечные клинья e6', 'Отрезание отступлений'],
    king_hunt: ['Бессмертные партии', 'Каскад двойных шахов', 'Марш через всю доску', 'Финал матом'],
  };

  const badges = chapterThemeBadges[chapter.id] || [];

  return (
    <section id={chapter.id} className="scroll-mt-24 mb-16">
      {/* Шапка раздела */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 rounded-2xl p-6 sm:p-8 mb-6 shadow-xl relative overflow-hidden">
        {/* Фоновые декоративные элементы */}
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shadow-md">
              {getChapterIcon(chapter.iconName)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 font-mono">
                  Тематический раздел
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {studies.length} {studies.length === 1 ? 'этюд' : studies.length < 5 ? 'этюда' : 'этюдов'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight mt-0.5">
                {chapter.title}
              </h2>
            </div>
          </div>

          {/* Тематические чипы */}
          <div className="flex flex-wrap gap-1.5 md:justify-end">
            {badges.map((b) => (
              <span
                key={b}
                className="text-xs px-2.5 py-1 rounded-md bg-slate-800/90 text-slate-300 border border-slate-700/80 flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3 text-amber-400/80" />
                {b}
              </span>
            ))}
          </div>
        </div>

        {/* Подзаголовок и методологическое описание Вуковича */}
        <p className="text-sm font-medium text-amber-300/90 mb-2">
          {chapter.subtitle}
        </p>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-4xl">
          {chapter.description}
        </p>
      </div>

      {/* Сетка карточек этюдов главы */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {studies.map((study) => (
          <StudyCard key={study.id} study={study} />
        ))}
      </div>
    </section>
  );
}

export default ChapterSection;
