'use client';

import React, { useEffect } from 'react';
import {
  Trophy,
  RotateCcw,
  ArrowRight,
  BookOpen,
  Clock,
  Target,
  Zap,
  Award,
  Star,
  CheckCircle2,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export interface StepScoreItem {
  stepIndex: number;
  baseScore: number;
  qualityMultiplier: number;
  hintMultiplier: number;
  attemptsMultiplier: number;
  timeMultiplier: number;
  finalStepScore: number;
  elapsedSeconds: number;
}

export interface CalculationSessionSummary {
  totalScore: number;
  accuracyPercent: number;
  cleanDepthPlies: number;
  rankTitleRu: string;
  stars: number;
  elapsedSeconds: number;
  stepScores?: StepScoreItem[];
}

export interface CalculationScoreCardProps {
  summary: CalculationSessionSummary;
  studyTitle?: string;
  onRetry: () => void;
  onNextStudy?: () => void;
  onAnalysisMode: () => void;
  className?: string;
}

/**
 * Итоговая карточка расчета и мастерства атаки Вуковича с расчетом ранга и метрик
 */
export function CalculationScoreCard({
  summary,
  studyTitle,
  onRetry,
  onNextStudy,
  onAnalysisMode,
  className = '',
}: CalculationScoreCardProps) {
  // Запуск праздничного салюта конфетти при успешном завершении
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && summary.totalScore >= 70) {
        confetti({
          particleCount: summary.stars === 3 ? 90 : 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#10b981', '#3b82f6', '#ec4899'],
        });
      }
    } catch {
      // Graceful fallback if canvas is unavailable
    }
  }, [summary.totalScore, summary.stars]);

  // Определение значка времени размышления
  const timeBadge = (() => {
    if (summary.elapsedSeconds < 8) {
      return {
        label: 'Импульсивный расчет',
        style: 'bg-amber-950/60 text-amber-300 border-amber-800/50',
      };
    }
    if (summary.elapsedSeconds <= 45) {
      return {
        label: 'Вдумчивый расчет',
        style: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
      };
    }
    return {
      label: 'Глубокое погружение',
      style: 'bg-blue-950/80 text-blue-300 border-blue-700/60',
    };
  })();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins} мин ${secs} сек` : `${secs} сек`;
  };

  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-slate-100 relative overflow-hidden ${className}`}
    >
      {/* Фоновый градиент победы */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Верхний заголовок и звезды */}
      <div className="text-center space-y-2 relative">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 mb-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Этюд успешно решен</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-100">
          {summary.rankTitleRu}
        </h2>
        {studyTitle && (
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto truncate">
            {studyTitle}
          </p>
        )}

        {/* Звезды */}
        <div className="flex items-center justify-center gap-2 pt-2">
          {[1, 2, 3].map((starIdx) => (
            <div
              key={starIdx}
              className={`p-2 rounded-xl border transition-all ${
                starIdx <= summary.stars
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 scale-110 shadow-lg shadow-amber-500/20'
                  : 'bg-slate-800/40 border-slate-800 text-slate-600'
              }`}
            >
              <Star
                className={`w-6 h-6 ${
                  starIdx <= summary.stars ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 4 Ключевые метрики в сетке */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 1. Общий балл мастерства */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-center space-y-1">
          <div className="flex items-center justify-center text-amber-400 mb-1">
            <Trophy className="w-5 h-5" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-slate-100">
            {summary.totalScore}
            <span className="text-xs text-slate-500 font-normal">/100</span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium">Балл расчета</div>
        </div>

        {/* 2. Точность */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-center space-y-1">
          <div className="flex items-center justify-center text-emerald-400 mb-1">
            <Target className="w-5 h-5" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-slate-100">
            {summary.accuracyPercent}%
          </div>
          <div className="text-[11px] text-slate-400 font-medium">Чистая точность</div>
        </div>

        {/* 3. Глубина чистого расчета */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-center space-y-1">
          <div className="flex items-center justify-center text-blue-400 mb-1">
            <Zap className="w-5 h-5" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-slate-100">
            {summary.cleanDepthPlies}
            <span className="text-xs text-slate-500 font-normal"> plies</span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium">Глубина (Dclean)</div>
        </div>

        {/* 4. Время размышления */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-center space-y-1">
          <div className="flex items-center justify-center text-purple-400 mb-1">
            <Clock className="w-5 h-5" />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-slate-100 pt-1">
            {formatTime(summary.elapsedSeconds)}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">Время партии</div>
        </div>
      </div>

      {/* Бейдж качества размышления */}
      <div className="flex justify-center">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${timeBadge.style}`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>{timeBadge.label}</span>
        </span>
      </div>

      {/* Кнопки действий */}
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        {/* 1. Повторить этюд */}
        <button
          type="button"
          onClick={onRetry}
          className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-semibold text-xs sm:text-sm transition-all active:scale-95"
        >
          <RotateCcw className="w-4 h-4 text-amber-400" />
          <span>Повторить этюд</span>
        </button>

        {/* 2. Анализ партии (вернуться к дереву вариантов) */}
        <button
          type="button"
          onClick={onAnalysisMode}
          className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-semibold text-xs sm:text-sm transition-all active:scale-95"
        >
          <BookOpen className="w-4 h-4 text-emerald-400" />
          <span>Анализ партии</span>
        </button>

        {/* 3. Следующий этюд */}
        {onNextStudy && (
          <button
            type="button"
            onClick={onNextStudy}
            className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg hover:shadow-amber-500/20 transition-all active:scale-95"
          >
            <span>Следующий этюд</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default CalculationScoreCard;
