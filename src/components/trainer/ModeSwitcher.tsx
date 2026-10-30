'use client';

import React from 'react';
import { BookOpen, Target, Sparkles } from 'lucide-react';

export type StudyMode = 'study' | 'trainer';

export interface ModeSwitcherProps {
  mode: StudyMode;
  onModeChange: (newMode: StudyMode) => void;
  calculationTargetPlies?: number;
  className?: string;
}

/**
 * Переключатель режимов: «Режим изучения» (дерево вариантов) vs «Тренажер расчета» (глубокий расчет)
 */
export function ModeSwitcher({
  mode,
  onModeChange,
  calculationTargetPlies,
  className = '',
}: ModeSwitcherProps) {
  const handleKeyDown = (e: React.KeyboardEvent, targetMode: StudyMode) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onModeChange(targetMode);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onModeChange(mode === 'study' ? 'trainer' : 'study');
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Режим работы с этюдом"
      className={`bg-slate-900/90 border border-slate-800 rounded-2xl p-1.5 flex flex-col sm:flex-row gap-1.5 shadow-lg backdrop-blur ${className}`}
    >
      {/* 1. Режим изучения */}
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'study'}
        tabIndex={mode === 'study' ? 0 : -1}
        onClick={() => onModeChange('study')}
        onKeyDown={(e) => handleKeyDown(e, 'study')}
        className={`flex-1 flex items-center justify-center sm:justify-start gap-3 px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
          mode === 'study'
            ? 'bg-slate-800 text-amber-400 shadow-md border border-amber-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
        }`}
      >
        <div
          className={`p-1.5 rounded-lg ${
            mode === 'study' ? 'bg-amber-500/10 text-amber-400' : 'text-slate-500'
          }`}
        >
          <BookOpen className="w-4 h-4" />
        </div>
        <div className="text-left">
          <div className="font-semibold leading-tight">Режим изучения</div>
          <div className="text-[11px] text-slate-400 hidden sm:block">
            Анализ дерева вариантов
          </div>
        </div>
      </button>

      {/* 2. Тренажер расчета */}
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'trainer'}
        tabIndex={mode === 'trainer' ? 0 : -1}
        onClick={() => onModeChange('trainer')}
        onKeyDown={(e) => handleKeyDown(e, 'trainer')}
        className={`flex-1 flex items-center justify-center sm:justify-start gap-3 px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
          mode === 'trainer'
            ? 'bg-emerald-950/80 text-emerald-300 shadow-md border border-emerald-500/40'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
        }`}
      >
        <div
          className={`p-1.5 rounded-lg ${
            mode === 'trainer' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500'
          }`}
        >
          <Target className="w-4 h-4" />
        </div>
        <div className="text-left flex-1 flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold leading-tight flex items-center gap-1.5">
              <span>Тренажер расчета</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            </div>
            <div className="text-[11px] text-slate-400 hidden sm:block">
              Глубокий форсированный расчет
            </div>
          </div>
          {calculationTargetPlies && (
            <span className="hidden md:inline-flex px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">
              {calculationTargetPlies} plies
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

export default ModeSwitcher;
