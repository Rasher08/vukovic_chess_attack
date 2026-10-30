import React from 'react';
import Link from 'next/link';
import { StudySummary, VukovicStudy } from '@/types/chess';
import { Target, ArrowRight, Calendar, User, Shield } from 'lucide-react';

export interface StudyCardProps {
  study: StudySummary | VukovicStudy;
}

export function StudyCard({ study }: StudyCardProps) {
  // Вычисляем отображение уровня сложности
  const difficultyConfig = {
    1800: {
      label: 'Клубный (1800)',
      bg: 'bg-emerald-950/80',
      text: 'text-emerald-400',
      border: 'border-emerald-800/60',
    },
    2000: {
      label: 'Продвинутый (2000)',
      bg: 'bg-amber-950/80',
      text: 'text-amber-400',
      border: 'border-amber-800/60',
    },
    2200: {
      label: 'Мастерский (2200+)',
      bg: 'bg-rose-950/80',
      text: 'text-rose-400',
      border: 'border-rose-800/60',
    },
  }[study.difficulty];

  const fullMovesCount = Math.ceil(study.calculationTargetPlies / 2);

  return (
    <div className="group relative flex flex-col justify-between rounded-xl bg-slate-900/70 border border-slate-800 hover:border-amber-500/50 p-5 shadow-lg hover:shadow-amber-500/5 transition-all duration-200">
      <div>
        {/* Верхняя плашка: Метаданные (ECO, Год, Сложность) */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {study.eco && (
              <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                {study.eco}
              </span>
            )}
            {study.year && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                {study.year}
              </span>
            )}
          </div>

          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${difficultyConfig.bg} ${difficultyConfig.text} ${difficultyConfig.border}`}
          >
            {difficultyConfig.label}
          </span>
        </div>

        {/* Название партии / этюда */}
        <h3 className="text-base font-bold text-slate-100 group-hover:text-amber-300 transition-colors line-clamp-2 mb-2">
          {study.title}
        </h3>

        {/* Соперники */}
        <div className="text-xs text-slate-400 mb-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-200 border border-slate-400" />
            <span className="font-medium text-slate-300">{study.white}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-600" />
            <span className="font-medium text-slate-400">{study.black}</span>
          </div>
        </div>

        {/* Описание тактической идеи Вуковича */}
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 mb-4">
          {study.description}
        </p>

        {/* Теги мотивов */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {study.tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {/* Нижняя часть карточки: Счетчик полуходов и кнопка входа */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3">
        {/* Счетчик глубины расчета */}
        <div
          className="flex items-center gap-1.5 text-xs text-amber-400 font-medium"
          title={`Требуемый расчет: ${study.calculationTargetPlies} полуходов (${fullMovesCount} ходов)`}
        >
          <Target className="w-4 h-4 text-amber-400" />
          <span>
            {study.calculationTargetPlies} полуходов
            <span className="text-slate-500 font-normal ml-1">({fullMovesCount}х)</span>
          </span>
        </div>

        {/* Ссылка на этюд */}
        <Link
          href={`/study/${study.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 hover:border-amber-500 transition-all active:scale-95 shadow-sm"
        >
          <span>Изучить</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}

export default StudyCard;
