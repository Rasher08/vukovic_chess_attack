'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { MoveNode, NagType } from '@/types/chess';
import { findNodeById, findPathToNode } from '@/lib/chessUtils';
import { playMoveSound, playCaptureSound } from '@/lib/audioSynth';
import { GitBranch, AlertTriangle, Sparkles, MessageSquare } from 'lucide-react';

export interface VariationTreeProps {
  rootNode: MoveNode;
  currentNodeId: string;
  onSelectNode: (node: MoveNode) => void;
  className?: string;
}

export function VariationTree({
  rootNode,
  currentNodeId,
  onSelectNode,
  className = '',
}: VariationTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Автоматическая прокрутка к активному узлу
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const activeElem = document.getElementById(`tree-node-${currentNodeId}`);
    if (activeElem && containerRef.current) {
      activeElem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [currentNodeId]);

  // Обработчик выбора узла с воспроизведением звука
  const handleNodeClick = useCallback(
    (node: MoveNode) => {
      if (node.san.includes('x')) {
        playCaptureSound();
      } else {
        playMoveSound();
      }
      onSelectNode(node);
    },
    [onSelectNode]
  );

  // 2. Полная навигация с клавиатуры (ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Home, End)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Игнорируем нажатия внутри полей ввода
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        return;
      }

      const path = findPathToNode(rootNode, currentNodeId);
      if (path.length === 0) return;

      const current = path[path.length - 1];
      const parent = path.length > 1 ? path[path.length - 2] : null;

      switch (e.key) {
        case 'ArrowRight': {
          // Шаг вперед по главной активной ветке
          if (current.children.length > 0) {
            e.preventDefault();
            handleNodeClick(current.children[0]);
          }
          break;
        }
        case 'ArrowLeft': {
          // Шаг назад к родителю
          if (parent) {
            e.preventDefault();
            handleNodeClick(parent);
          }
          break;
        }
        case 'ArrowDown': {
          // Переключение на следующий боковой вариант того же родителя
          if (parent) {
            const idx = parent.children.findIndex((c) => c.id === current.id);
            if (idx >= 0 && idx + 1 < parent.children.length) {
              e.preventDefault();
              handleNodeClick(parent.children[idx + 1]);
              return;
            }
          }
          // Если у текущего узла есть альтернативные ответвления (больше 1 потомка), спускаемся в первый вариант
          if (current.children.length > 1) {
            e.preventDefault();
            handleNodeClick(current.children[1]);
          }
          break;
        }
        case 'ArrowUp': {
          // Переключение на предыдущий боковой вариант того же родителя
          if (parent) {
            const idx = parent.children.findIndex((c) => c.id === current.id);
            if (idx > 0) {
              e.preventDefault();
              handleNodeClick(parent.children[idx - 1]);
              return;
            }
          }
          // Шаг к родителю при отсутствии предыдущих вариантов
          if (parent) {
            e.preventDefault();
            handleNodeClick(parent);
          }
          break;
        }
        case 'Home': {
          // Переход к начальному корневому узлу
          e.preventDefault();
          handleNodeClick(rootNode);
          break;
        }
        case 'End': {
          // Переход в самый конец активной главной линии
          e.preventDefault();
          let leaf = current;
          while (leaf.children.length > 0) {
            leaf = leaf.children[0];
          }
          handleNodeClick(leaf);
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rootNode, currentNodeId, handleNodeClick]);

  // Стилизация оценочного символа NAG (!, !!, ?, ??, !?, ?!)
  const renderNagBadge = (nag?: NagType) => {
    if (!nag) return null;

    let nagStyles = 'bg-slate-700 text-slate-300';
    if (nag === '!') nagStyles = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
    else if (nag === '!!') nagStyles = 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold';
    else if (nag === '?') nagStyles = 'bg-amber-600/20 text-amber-400 border border-amber-600/40';
    else if (nag === '??') nagStyles = 'bg-rose-500/20 text-rose-400 border border-rose-500/50 font-bold';
    else if (nag === '!?' || nag === '?!') nagStyles = 'bg-purple-500/20 text-purple-300 border border-purple-500/40';

    return (
      <span className={`ml-1 px-1 py-0.2 rounded text-[10px] font-mono leading-none ${nagStyles}`}>
        {nag}
      </span>
    );
  };

  // Компонент одного узла хода
  const renderMoveButton = (node: MoveNode, moveNumberPrefix?: string) => {
    const isActive = node.id === currentNodeId;
    const isBlunder = node.isBlunderRefutation || node.nag === '??';
    const isBrilliant = node.nag === '!!';

    return (
      <button
        key={node.id}
        id={`tree-node-${node.id}`}
        type="button"
        onClick={() => handleNodeClick(node)}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all select-none m-0.5 ${
          isActive
            ? 'bg-emerald-600 text-white font-bold ring-2 ring-emerald-400/60 shadow-md scale-105 z-10'
            : isBlunder
            ? 'bg-rose-950/40 text-rose-300 border border-rose-800/60 hover:bg-rose-900/50 hover:text-white'
            : isBrilliant
            ? 'bg-amber-950/40 text-amber-300 border border-amber-700/60 hover:bg-amber-900/50 hover:text-white'
            : 'bg-slate-800/80 text-slate-200 border border-slate-700/60 hover:bg-slate-700 hover:text-white'
        }`}
        title={node.comment || node.san}
      >
        {/* Префикс номера хода (например, "12." или "12...") */}
        {moveNumberPrefix && (
          <span
            className={`font-mono text-[11px] ${
              isActive ? 'text-emerald-100' : 'text-slate-400'
            }`}
          >
            {moveNumberPrefix}
          </span>
        )}

        {/* SAN нотация хода */}
        <span className="font-semibold">{node.san}</span>

        {/* NAG бейдж */}
        {renderNagBadge(node.nag)}

        {/* Значок ошибки/опровержения */}
        {isBlunder && (
          <span title="Опровержение ошибки">
            <AlertTriangle
              className={`w-3 h-3 ${isActive ? 'text-white' : 'text-rose-400'}`}
            />
          </span>
        )}

        {/* Значок жертвы */}
        {isBrilliant && !isBlunder && (
          <span title="Блестящий ход / Жертва">
            <Sparkles
              className={`w-3 h-3 ${isActive ? 'text-white' : 'text-amber-300'}`}
            />
          </span>
        )}

        {/* Индикатор наличия комментария */}
        {node.comment && (
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isActive ? 'bg-white' : 'bg-amber-400'
            }`}
            title="Есть комментарий Вуковича"
          />
        )}
      </button>
    );
  };

  // Рекурсивный рендеринг ветвей дерева вариантов
  const renderNodeHierarchy = (node: MoveNode, depth: number = 0): React.ReactNode => {
    const hasVariations = node.children.length > 1;

    return (
      <div key={node.id} className="relative">
        {/* Текущий ход */}
        <div className="flex flex-wrap items-center">
          {renderMoveButton(node)}

          {/* Если есть продолжение главной линии без развилки */}
          {node.children.length === 1 && renderNodeHierarchy(node.children[0], depth)}
        </div>

        {/* Если у хода несколько дочерних продолжений (развилка вариантов) */}
        {hasVariations && (
          <div className="mt-2.5 mb-2 pl-3 border-l-2 border-slate-800 space-y-2">
            {/* Главное продолжение ветки (children[0]) */}
            <div className="bg-slate-900/40 rounded-lg p-2 border border-slate-800/80">
              <div className="text-[10px] uppercase font-mono font-bold text-emerald-400/90 mb-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Основное продолжение
              </div>
              <div className="flex flex-wrap items-center">
                {renderNodeHierarchy(node.children[0], depth + 1)}
              </div>
            </div>

            {/* Боковые альтернативные варианты и опровержения (children[1..n]) */}
            {node.children.slice(1).map((childNode, index) => {
              const isRefutation = childNode.isBlunderRefutation || childNode.nag === '??';
              return (
                <div
                  key={childNode.id}
                  className={`rounded-lg p-2 border transition-colors ${
                    isRefutation
                      ? 'bg-rose-950/20 border-rose-900/50'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="text-[10px] uppercase font-mono font-bold mb-1 flex items-center justify-between">
                    <span
                      className={`flex items-center gap-1 ${
                        isRefutation ? 'text-rose-400' : 'text-amber-400/90'
                      }`}
                    >
                      <GitBranch className="w-3 h-3" />
                      {isRefutation
                        ? `Опровержение ошибки #${index + 1}`
                        : `Вариант #${index + 1} (${childNode.san})`}
                    </span>
                    {childNode.isForced && (
                      <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-400 font-normal">
                        Форсированно
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center">
                    {renderNodeHierarchy(childNode, depth + 1)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl backdrop-blur flex flex-col ${className}`}
    >
      {/* Шапка дерева вариантов */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <GitBranch className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              Дерево вариантов Вуковича
            </h3>
            <p className="text-[11px] text-slate-400">
              Кликните на любой ход для навигации по доске
            </p>
          </div>
        </div>

        {/* Легенда символов */}
        <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-slate-400">
          <span className="flex items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Ход
          </span>
          <span className="flex items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Зевок
          </span>
          <span className="flex items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Жертва
          </span>
        </div>
      </div>

      {/* Прокручиваемый контейнер иерархии ходов */}
      <div
        ref={containerRef}
        className="custom-scrollbar overflow-y-auto max-h-[460px] pr-2 space-y-2 text-sm"
        role="region"
        aria-label="Интерактивное дерево ходов"
      >
        {renderNodeHierarchy(rootNode, 0)}
      </div>
    </div>
  );
}

export default VariationTree;
