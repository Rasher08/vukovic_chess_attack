'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { VukovicStudy, MoveNode } from '@/types/chess';
import { formatArrowsForBoard, findPathToNode } from '@/lib/chessUtils';
import { playMoveSound, playCaptureSound } from '@/lib/audioSynth';
import { allStudies } from '@/data/studies';
import ChessboardWrapper from '@/components/chess/ChessboardWrapper';
import MoveNavigation from '@/components/study/MoveNavigation';
import VariationTree from '@/components/study/VariationTree';
import PrerequisiteCard from '@/components/study/PrerequisiteCard';
import StrategicCallout from '@/components/study/StrategicCallout';
import ModeSwitcher, { StudyMode } from '@/components/trainer/ModeSwitcher';
import CalculationTrainer from '@/components/trainer/CalculationTrainer';
import {
  ArrowLeft,
  Calendar,
  Award,
  Target,
  BookOpen,
  ChevronRight,
  Shield,
  Layers,
} from 'lucide-react';
import { Square } from 'chess.js';

export interface StudyHeaderProps {
  study: VukovicStudy;
  className?: string;
}

/**
 * Заголовок страницы этюда с хлебными крошками и метаданными
 */
export function StudyHeader({ study, className = '' }: StudyHeaderProps) {
  const difficultyBadge = {
    1800: {
      label: 'Учебный пример',
      style: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60',
    },
    2000: {
      label: 'Учебный пример',
      style: 'bg-amber-950/80 text-amber-400 border-amber-800/60',
    },
    2200: {
      label: 'Учебный пример',
      style: 'bg-rose-950/80 text-rose-400 border-rose-800/60',
    },
  }[study.difficulty];

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Хлебные крошки и кнопка возврата */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <nav aria-label="Хлебные крошки" className="flex items-center gap-1.5 flex-wrap">
          <Link href="/" className="hover:text-amber-400 transition-colors flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span>Каталог</span>
          </Link>
          <ChevronRight className="w-3 h-3 text-slate-600" />
          <Link
            href={`/#${study.chapter}`}
            className="hover:text-amber-400 transition-colors"
          >
            {study.chapterTitle}
          </Link>
          <ChevronRight className="w-3 h-3 text-slate-600" />
          <span className="text-slate-200 font-medium truncate max-w-[200px] sm:max-w-xs">
            {study.title}
          </span>
        </nav>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-400 border border-slate-800 transition-colors active:scale-95 text-xs font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>В каталог</span>
        </Link>
      </div>

      {/* Название партии и статус-панель */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {study.eco && (
              <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-slate-800 text-amber-400 border border-slate-700">
                ECO {study.eco}
              </span>
            )}
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${difficultyBadge.style}`}
            >
              {difficultyBadge.label}
            </span>
            <span className="px-2.5 py-0.5 rounded-md text-xs bg-slate-800/80 text-slate-300 border border-slate-700/60 flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-amber-400" />
              Расчет: {study.calculationTargetPlies} полуходов
            </span>
          </div>

          {study.year && (
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>{study.year} г.{study.event ? ` (${study.event})` : ''}</span>
            </div>
          )}
        </div>

        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 tracking-tight mb-2">
          {study.title}
        </h1>

        {/* Соперники */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-100 border border-slate-400" />
            <span className="font-semibold text-slate-200">{study.white}</span>
            <span className="text-slate-500">(Белые)</span>
          </div>
          <span className="text-slate-600">•</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-600" />
            <span className="font-semibold text-slate-300">{study.black}</span>
            <span className="text-slate-500">(Черные)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Полнофункциональный интерактивный клиентский макет страницы этюда
 */
export function StudyViewLayout({ study }: { study: VukovicStudy }) {
  const router = useRouter();

  // Режим работы: 'study' (изучение дерева) или 'trainer' (тренажер расчета)
  const [mode, setMode] = useState<StudyMode>('study');

  // Состояние активного узла дерева
  const [currentNodeId, setCurrentNodeId] = useState<string>(study.rootNode.id);
  // Состояние ориентации доски
  const [orientation, setOrientation] = useState<'white' | 'black'>(study.orientation || 'white');

  // Поиск следующего этюда в курсе
  const currentIndex = allStudies.findIndex((s) => s.id === study.id);
  const nextStudy =
    currentIndex >= 0 && currentIndex < allStudies.length - 1 ? allStudies[currentIndex + 1] : null;
  const handleNextStudy = nextStudy ? () => router.push(`/study/${nextStudy.id}`) : undefined;

  // Вычисляем путь от корня к текущему узлу для навигации
  const path = useMemo(
    () => findPathToNode(study.rootNode, currentNodeId),
    [study.rootNode, currentNodeId]
  );

  // Текущий выбранный узел
  const currentNode = useMemo(() => {
    return path.length > 0 ? path[path.length - 1] : study.rootNode;
  }, [path, study.rootNode]);

  // Преобразуем стрелки текущего узла для react-chessboard
  const arrows = useMemo(() => {
    return formatArrowsForBoard(currentNode?.arrows);
  }, [currentNode]);

  // Подсветка полей текущего узла
  const highlights = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (currentNode?.highlights) {
      for (const [square, color] of Object.entries(currentNode.highlights)) {
        styles[square] = { backgroundColor: color };
      }
    }
    return styles;
  }, [currentNode]);

  // Обработчик выбора узла
  const handleSelectNode = useCallback((node: MoveNode) => {
    setCurrentNodeId(node.id);
  }, []);

  // Навигация: Первый ход (rootNode)
  const handleFirstMove = useCallback(() => {
    handleSelectNode(study.rootNode);
    playMoveSound();
  }, [study.rootNode, handleSelectNode]);

  // Навигация: Предыдущий ход (родитель)
  const handlePreviousMove = useCallback(() => {
    if (path.length > 1) {
      handleSelectNode(path[path.length - 2]);
      playMoveSound();
    }
  }, [path, handleSelectNode]);

  // Навигация: Следующий ход (первый ребенок)
  const handleNextMove = useCallback(() => {
    if (currentNode.children && currentNode.children.length > 0) {
      const nextNode = currentNode.children[0];
      handleSelectNode(nextNode);
      if (nextNode.san.includes('x')) {
        playCaptureSound();
      } else {
        playMoveSound();
      }
    }
  }, [currentNode, handleSelectNode]);

  // Навигация: В конец ветки (последний потомок по главной линии)
  const handleLastMove = useCallback(() => {
    let node = currentNode;
    while (node.children && node.children.length > 0) {
      node = node.children[0];
    }
    handleSelectNode(node);
    playMoveSound();
  }, [currentNode, handleSelectNode]);

  // Переворот доски
  const handleFlipBoard = useCallback(() => {
    setOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
  }, []);

  // Сброс к начальной позиции
  const handleReset = useCallback(() => {
    handleSelectNode(study.rootNode);
    playMoveSound();
  }, [study.rootNode, handleSelectNode]);

  // Интерактивный ход на доске: если ход соответствует одному из вариантов дерева, переходим к нему
  const handlePieceDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square): boolean => {
      if (!currentNode.children || currentNode.children.length === 0) {
        return false;
      }
      const uciMove = `${sourceSquare}${targetSquare}`;
      const matchingChild = currentNode.children.find((child) => child.uci.startsWith(uciMove));

      if (matchingChild) {
        handleSelectNode(matchingChild);
        if (matchingChild.san.includes('x')) {
          playCaptureSound();
        } else {
          playMoveSound();
        }
        return true;
      }
      return false;
    },
    [currentNode, handleSelectNode]
  );

  const canGoBack = path.length > 1;
  const canGoForward = Boolean(currentNode.children && currentNode.children.length > 0);

  return (
    <div className="legacy-study max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <aside className="legacy-notice">Архив исходного демо. Здесь проверена легальность ходов, но не подтверждены книжная атрибуция и оптимальность вариантов. <Link href="/" className="underline">Перейти к новому практикуму</Link>.</aside>
      {/* 1. Шапка исследования с метаданными и хлебными крошками */}
      <StudyHeader study={study} />

      {/* 2. Доступный переключатель режимов «Режим изучения» vs «Тренажер расчета» */}
      <ModeSwitcher
        mode={mode}
        onModeChange={setMode}
        calculationTargetPlies={study.calculationTargetPlies}
      />

      {/* 3. Отображение выбранного режима: Тренажер глубокого расчета или Дерево изучения */}
      {mode === 'trainer' ? (
        <CalculationTrainer
          study={study}
          onSwitchToAnalysis={() => setMode('study')}
          onNextStudy={handleNextStudy}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Левая колонка (Шахматная доска + Навигация + Чек-лист) */}
          <div className="lg:col-span-6 xl:col-span-6 flex flex-col items-center lg:items-start gap-4">
            {/* Контейнер шахматной доски */}
            <div className="w-full flex justify-center bg-slate-900/60 border border-slate-800 rounded-2xl p-3 sm:p-5 shadow-2xl backdrop-blur">
              <ChessboardWrapper
                position={currentNode.fen}
                orientation={orientation}
                customArrows={arrows}
                customSquareStyles={highlights}
                onPieceDrop={handlePieceDrop}
                autoResize={true}
                arePiecesDraggable={true}
                isInteractive={true}
              />
            </div>

            {/* Панель навигации по ходам */}
            <MoveNavigation
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onFirstMove={handleFirstMove}
              onPreviousMove={handlePreviousMove}
              onNextMove={handleNextMove}
              onLastMove={handleLastMove}
              onFlipBoard={handleFlipBoard}
              onReset={handleReset}
              orientation={orientation}
            />

            {/* Чек-лист предпосылок Вуковича (Greek Gift) */}
            {study.prerequisites && (
              <div className="w-full max-w-[540px]">
                <PrerequisiteCard prerequisites={study.prerequisites} />
              </div>
            )}
          </div>

          {/* Правая колонка (Стратегический анализ + Дерево вариантов) */}
          <div className="lg:col-span-6 xl:col-span-6 flex flex-col gap-4">
            {/* Стратегическая врезка Вуковича для текущего хода */}
            <StrategicCallout currentNode={currentNode} study={study} />

            {/* Интерактивное дерево вариантов */}
            <VariationTree
              rootNode={study.rootNode}
              currentNodeId={currentNodeId}
              onSelectNode={handleSelectNode}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default StudyHeader;
