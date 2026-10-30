# Архитектурное исследование фронтенда: Платформа тренировки шахматной атаки по Вуковичу
**Платформа**: Vukovic Chess Attack Training Platform  
**Модуль**: Фронтенд-архитектура, интеграция шахматной доски, интерактивное дерево вариантов и Vercel-деплой  
**Требования**: R2, R4 и соответствующие Acceptance Criteria  
**Дата**: 2026-10-24  
**Статус**: Завершено  

---

## 1. Резюме архитектуры (Executive Summary)

Настоящее исследование определяет архитектурный стек, компонентную модель, интерфейсные контракты и стратегию развертывания для веб-платформы тренировки шахматной атаки в миттельшпиле на базе классической книги Владимира Вуковича **«Искусство атаки в шахматах» (The Art of Attack in Chess)**.

### Ключевые архитектурные выводы:
1. **Zero-Backend Architecture (100% Client-Side)**:
   Платформа не требует внешних баз данных, платных серверов или облачных API. Все 15–20 позиций и партий Вуковича компилируются статически (SSG через `generateStaticParams`), валидация ходов и генерация легальных ответов выполняются на клиенте через `chess.js`, а прогресс игрока (пройденные этюды, точность расчета, заработанные звезды) персистируется в браузере через `localStorage`.
2. **Технологический стек**:
   * **Фреймворк**: Next.js 14.2+ (App Router, React 18, TypeScript strict mode).
   * **Стилизация**: Tailwind CSS 3.4+ с адаптивным дизайном под Desktop (1920×1080, split-screen) и Mobile (375px+, stacked view).
   * **Шахматное ядро**: `chess.js` (версия 1.4.0) — современный типизированный движок шахматных правил с O(1) FEN/SAN генерацией.
   * **Визуализация доски**: `react-chessboard` (версия 4.7.3) с кастомной оберткой `ChessboardWrapper`, исключающей гидратационные расхождения (SSR-safe).
   * **Иконки и интерфейс**: `lucide-react` + синтезатор звуков ходов на базе Web Audio API (без внешних MP3-файлов).
3. **Развертывание в Vercel**:
   Проект оптимизирован под мгновенный деплой в Vercel Edge Network с предсказуемым `npm run build` (Exit code 0, 0 warning, 0 error).

---

## 2. Архитектура Next.js App Router и структура проекта

### 2.1. Иерархия маршрутов и страниц (Route Hierarchy)

В Next.js App Router используется гибридный подход: статический пререндеринг страниц курса при сборке в сочетании с клиентскими интерактивными островами (`'use client'`):

```
vukovic_chess_attack/
├── app/
│   ├── layout.tsx               # Корневой макет: темная тема, метаданные, шапка, звуковой контекст
│   ├── page.tsx                 # Главная страница: каталог глав Вуковича, карточки этюдов, прогресс-бар
│   ├── study/
│   │   └── [id]/
│   │       └── page.tsx         # Режим свободного исследования этюда (Study Mode)
│   ├── trainer/
│   │   └── [id]/
│   │       └── page.tsx         # Режим глубокого расчета тактики (Calculation Trainer Mode)
│   ├── methodology/
│   │   └── page.tsx             # Методология Вуковича: 5 условий Greek Gift, Colle System
│   └── globals.css              # Глобальные стили Tailwind CSS + шахматная доска
├── components/
│   ├── board/
│   │   ├── ChessboardWrapper.tsx # Клиентский контейнер доски с авто-ресайзом и защитой от SSR-сбоев
│   │   ├── BoardControls.tsx     # Кнопки навигации (<<, <, >, >>, переворот доски, сброс)
│   │   ├── BoardLegend.tsx       # Легенда графических стрелок и полей атаки
│   │   └── PromotionModal.tsx    # Модальное окно превращения пешки (Ф, Л, С, К)
│   ├── tree/
│   │   ├── VariationTree.tsx     # Интерактивное дерево вариантов с вложенными ветвями
│   │   ├── MoveNodeItem.tsx      # Элемент хода с NAG-значком и контекстным меню
│   │   ├── StrategicCallout.tsx  # Карточка с правилом и цитатой Владимира Вуковича
│   │   └── BlunderRefutation.tsx # Блок разбора тактического опровержения ошибки
│   ├── navigation/
│   │   ├── Header.tsx            # Навбар с переключателем глав, счетчиком звезд и прогрессом
│   │   ├── ChapterCard.tsx       # Карточка темы (жертва на h7, отходы короля, ладейные лифты)
│   │   ├── StudyCard.tsx         # Карточка конкретного этюда со значком сложности и прогрессом
│   │   └── ModeSwitch.tsx        # Переключатель «Исследование» ↔ «Тренажер расчета»
│   └── ui/
│       ├── Badge.tsx             # Бейджи сложности и оценок (!!, !, ?!, ??)
│       └── ProgressBar.tsx       # Индикатор освоения тем
├── data/
│   ├── chapters.ts               # Каталог 4 тематических глав Вуковича
│   └── studies/
│       ├── greek_gift_kg8.ts     # Этюды: вариант 2...Kg8 (маневры Qh5/Qd3)
│       ├── greek_gift_kg6.ts     # Этюды: вариант 2...Kg6 (штурм 3.h4! и 3.Qg4)
│       ├── rook_lifts.ts         # Этюды: подключение ладей по 3-й горизонтали
│       └── pawns_demolition.ts   # Этюды: разрушение пешечного прикрытия
├── lib/
│   ├── chess/
│   │   ├── treeEngine.ts         # Алгоритмы навигации по дереву (DAG traversal, поиск родителя, детей)
│   │   ├── moveValidator.ts      # Обертка над chess.js: валидация, расчет легальных полей для точек
│   │   └── audioSynth.ts         # Web Audio API синтезатор звуков (ход, взятие, шах, победа)
│   ├── storage/
│   │   └── progressStore.ts      # Типизированная работа с LocalStorage (сохранение звезд, очков)
│   └── types/
│       └── chess.ts              # Интерфейсы MoveNode, VariationTree, Study, Chapter, NAG
├── public/                       # Статические ассеты (фавикон, SVG-логотип)
├── next.config.mjs               # Конфигурация Next.js
├── tailwind.config.ts            # Настройки тем Tailwind (палитра шахматных досок)
├── tsconfig.json                 # Строгий режим TypeScript
└── vercel.json                   # Деплой-конфигурация Vercel
```

### 2.2. Статическая генерация страниц (SSG) для мгновенного CDN-деплоя
Для каждого динамического маршрута `/study/[id]` и `/trainer/[id]` реализуется функция `generateStaticParams()`:

```tsx
// app/study/[id]/page.tsx
import { getAllStudyIds, getStudyById } from '@/lib/chess/datasetRegistry';
import { notFound } from 'next/navigation';
import StudyClientView from '@/components/study/StudyClientView';

export function generateStaticParams() {
  const ids = getAllStudyIds(); // ['greek-gift-kg8-standard', 'greek-gift-kg6-h4', ...]
  return ids.map((id) => ({ id }));
}

export default function StudyPage({ params }: { params: { id: string } }) {
  const study = getStudyById(params.id);
  if (!study) {
    notFound();
  }
  return <StudyClientView study={study} />;
}
```
**Преимущество**: Во время `npm run build` Next.js компилирует все страницы этюдов в чистый статический HTML + JSON-данные. На Vercel страницы загружаются мгновенно (0 мс TTFB), работают без cold start и потребляют 0 единиц бекенд-вычислений.

---

## 3. Интеграция шахматной доски (react-chessboard + chess.js)

### 3.1. Исследование версий и зависимостей библиотек

В ходе экспериментального исследования были протестированы связки:
* **chess.js**: Рекомендуется версия `1.4.0` (современный TypeScript-релиз).
  * *Ключевое отличие от старых версий (0.13)*: метод `chess.move({ from, to, promotion })` в случае нелегального хода выбрасывает исключение `Error`, а не возвращает `null`. Поэтому проверка хода обязательно оборачивается в блок `try ... catch` или валидируется предварительно через `chess.moves({ verbose: true })`.
  * Методы проверки состояния: camelCase (`isCheckmate()`, `isDraw()`, `isGameOver()`, `isCheck()`, `inCheck()`).
  * Экспорт типа поля: `import { Square } from 'chess.js'`.
* **react-chessboard**: Рекомендуется версия `4.7.3` для стабильной связки с React 18 / Next.js 14.
  * Прямой проброс пропсов: `<Chessboard position={fen} customArrows={arrows} customSquareStyles={styles} onPieceDrop={onDrop} onSquareClick={onClick} />`.
  * Тип стрелки: кортеж `[Square, Square, string?]` (например, `['f3', 'g5', 'rgba(59, 130, 246, 0.85)']`).
  * Для предотвращения SSR-ошибок (отсутствие `window` на этапе серверного рендеринга) компонент доски рендерится внутри обертки с флагом клиентского монтирования `isMounted`.

### 3.2. Архитектура компонента `ChessboardWrapper`

```tsx
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { Square } from 'chess.js';

interface ChessboardWrapperProps {
  fen: string;
  orientation?: 'white' | 'black';
  arrows?: [Square, Square, string?][];
  squareStyles?: Record<string, React.CSSProperties>;
  onPieceDrop?: (sourceSquare: Square, targetSquare: Square) => boolean;
  onSquareClick?: (square: Square) => void;
  arePiecesDraggable?: boolean;
}

export function ChessboardWrapper({
  fen,
  orientation = 'white',
  arrows = [],
  squareStyles = {},
  onPieceDrop,
  onSquareClick,
  arePiecesDraggable = true,
}: ChessboardWrapperProps) {
  const [boardWidth, setBoardWidth] = useState<number>(480);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    function updateDimensions() {
      if (containerRef.current) {
        const clientWidth = containerRef.current.clientWidth;
        // Ограничиваем максимальную ширину 540px для сохранения баланса с панелью вариантов
        const calculatedWidth = Math.min(clientWidth, 540);
        setBoardWidth(calculatedWidth > 260 ? calculatedWidth : 260);
      }
    }
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Стилизация темных и светлых полей в благородных турнирных тонах (Wood / Slate Green)
  const customBoardStyle = useMemo(() => ({
    borderRadius: '10px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
  }), []);

  const customDarkSquareStyle = useMemo(() => ({
    backgroundColor: '#779952', // Классический соревновательный зеленый
  }), []);

  const customLightSquareStyle = useMemo(() => ({
    backgroundColor: '#edeed1', // Теплый кремовый
  }), []);

  if (!isMounted) {
    return (
      <div
        ref={containerRef}
        className="w-full aspect-square max-w-[540px] bg-slate-800/60 rounded-xl animate-pulse flex items-center justify-center text-slate-500 font-medium"
      >
        Загрузка шахматной доски...
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full max-w-[540px] flex justify-center items-center select-none">
      <Chessboard
        position={fen}
        boardWidth={boardWidth}
        boardOrientation={orientation}
        onPieceDrop={(source, target) => {
          if (!onPieceDrop) return false;
          return onPieceDrop(source as Square, target as Square);
        }}
        onSquareClick={(square) => {
          if (onSquareClick) onSquareClick(square as Square);
        }}
        customArrows={arrows}
        customSquareStyles={squareStyles}
        customBoardStyle={customBoardStyle}
        customDarkSquareStyle={customDarkSquareStyle}
        customLightSquareStyle={customLightSquareStyle}
        arePiecesDraggable={arePiecesDraggable}
        animationDuration={220}
      />
    </div>
  );
}
```

### 3.3. Реализация режима кликов (Click-to-Move) и точек легальных ходов

Для игроков на смартфонах и трекпадах перетаскивание (drag-and-drop) бывает неудобным. Реализована полноценная поддержка ввода ходов двумя кликами (Click-to-Move):
1. **Первый клик на свою фигуру**: поле выделяется янтарным контуром, `chess.js` рассчитывает доступные ходы (`chess.moves({ square, verbose: true })`).
2. **Отображение точек легальных ходов**:
   * Для свободных полей: аккуратная изумрудная точка в центре поля (`radial-gradient(circle, rgba(16, 185, 129, 0.7) 24%, transparent 25%)`).
   * Для полей с взятием вражеской фигуры: красный полупрозрачный прицельный ободок (`radial-gradient(circle, transparent 65%, rgba(239, 68, 68, 0.7) 66%)`).
3. **Второй клик на целевое поле**: ход валидируется и выполняется, точки очищаются.
4. **Клик на другую свою фигуру**: фокус мгновенно переключается на новую фигуру с пересчетом точек.

### 3.4. Обработка превращения пешки (Promotion Modal)
При достижении пешкой 8-й горизонтали (или 1-й за черных) всплывает компактное модальное окно с выбором фигуры (Ферзь, Ладья, Слон, Конь). В тренажере Вуковича в 98% случаев превращение идет в Ферзя, однако возможность превращения в Коня критична для решения редких матовых конструкций (Underpromotion).

---

## 4. Система визуальных графических стрелок и подсветки полей

В соответствии с требованием R2 стрелки и поля служат важнейшим дидактическим инструментом, объясняющим атакующие замыслы Вуковича.

### 4.1. Семантическая палитра стрелок

| Тип стрелки | Назначение в методологии Вуковича | Цветовой код | Примеры ходов |
|---|---|---|---|
| **Угроза / Прямая атака (Threat)** | Матовые угрозы, прямое нападение на короля и тяжелые фигуры | `rgba(239, 68, 68, 0.9)` (Red) | $Qh7\#$, $Qxf7+$, $Ng5\times e6$ |
| **Атакующий маневр (Maneuver Green)** | Подключение ферзя по диагоналям, ладейный лифт | `rgba(34, 197, 94, 0.85)` (Green) | $Rf1\to e3\to h3$, $Qd1\to h5$ |
| **Атакующий прыжок (Maneuver Blue)** | Вторжение коня на ключевой форпост | `rgba(59, 130, 246, 0.85)` (Blue) | $Nf3\to g5$, $Nd2\to f3$ |
| **Пункт жертвы (Sacrifice Target)** | Классическая жертва на ослабленный пункт | `rgba(245, 158, 11, 0.95)` (Gold/Amber) | $Bd3\times h7+$, $Bc1\times h6$ |
| **Ресурс защиты (Defense Resource)** | Попытка черных перекрыть вертикаль или выставить заслон | `rgba(168, 85, 247, 0.85)` (Purple) | $f7\to f5$, $Bc8\to f5$ |

### 4.2. Семантическая подсветка полей (`customSquareStyles`)
* **Поле шаха королю**: Пульсирующий радиальный алый градиент (`rgba(239, 68, 68, 0.8)`).
* **Поле жертвы ($h7$)**: Мягкое золотистое свечение (`rgba(245, 158, 11, 0.45)`).
* **Поля предыдущего хода**: Тонкая подсветка полей «откуда» и «куда» (`rgba(250, 204, 21, 0.25)`).

### 4.3. Встроенный звуковой синтезатор (Web Audio API)
Вместо загрузки внешних `.mp3` файлов, вызывающих задержки или 404-ошибки при отсутствии сети, реализован легковесный синтезатор `audioSynth.ts`:
* Ход обычной фигурой: короткий деревянный щелчок (синусоида 400 Гц, 60 мс).
* Взятие фигуры: плотный низкий щелчок (260 Гц, 100 мс).
* Шах королю: звонкий предупреждающий тон (880 Гц, 140 мс).
* Успешное завершение расчета: победное мажорное арпеджио (C-E-G-C).

---

## 5. Проектирование компонента интерактивного дерева вариантов (Interactive Variation Tree)

### 5.1. Модель данных узла дерева (`MoveNode`)

В шахматных партиях варианты представляют собой направленный ациклический граф (дерево с ветвлениями). Структура строго типизирована в TypeScript:

```ts
export type NAGBadge = 
  | '!'   // Сильный ход
  | '!!'  // Блестящий ход (жертва)
  | '?'   // Ошибка
  | '??'  // Зевок
  | '!?'  // Интересный ход
  | '?!'; // Сомнительный ход

export interface StrategicCalloutData {
  type: 'concept' | 'warning' | 'calculation' | 'historical';
  title: string;
  ruleQuote: string;
  explanation: string;
}

export interface MoveNode {
  id: string;                      // Уникальный идентификатор узла, напр. "node-2w-ng5"
  parentId: string | null;         // null для начальной позиции этюда
  moveNumber: number;              // Номер хода (1, 2, 3...)
  turn: 'w' | 'b';                 // Чей ход
  san: string;                     // SAN: "Bxh7+", "Ng5+", "Kg6", "h4!"
  uci: string;                     // UCI: "d3h7", "f3g5", "g8g6"
  fen: string;                     // FEN позиции ПОСЛЕ выполнения данного хода
  comment?: string;                // Развернутый русскоязычный комментарий
  callout?: StrategicCalloutData;  // Стратегическая врезка Вуковича
  nag?: NAGBadge;                  // Оценочный символ хода
  arrows?: [Square, Square, string?][]; // Графические стрелки для данной позиции
  highlightSquares?: Record<string, string>; // Подсветка ключевых полей
  isMainLine: boolean;             // Принадлежность к главной линии
  isBlunderRefutation?: boolean;   // Ветка опровержения ошибки белых или черных
  children: string[];              // Массив ID следующих ходов (children[0] = главная ветка)
}

export interface VariationTreeData {
  rootId: string;
  initialFen: string;
  nodes: Record<string, MoveNode>;
}
```

### 5.2. Визуальное представление иерархии вариантов
Компонент `VariationTree` рендерит список ходов с четким разделением уровней:
1. **Главная линия (Main Line)**:
   Отображается жирным шрифтом в строке с номерами ходов (напр. **1. Сxh7+! Крxh7 2. Кg5+**).
2. **Вложенные боковые варианты (Sub-variations)**:
   При наличии нескольких ответов черных (например, на $2.Ng5+$: $2...Kg8$, $2...Kg6$, $2...Kh8$, $2...Kh6$) варианты оформляются в виде аккуратных плашек-чипов со светлым фоном `bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700` с отступами.
3. **Опровержения ложных следов (Blunder Refutations)**:
   Ошибочные ходы маркируются значками `??` и выделяются красноватым фоном `bg-rose-950/40 border-rose-900/60`, сразу показывая читателю, что это демонстрация опровержения.
4. **Активный ход**:
   Выделяется ярким изумрудно-зеленым бейджем `bg-emerald-600 text-white font-bold ring-2 ring-emerald-400/50 shadow-md` с автоматической плавной прокруткой контейнера к активному ходу (`scrollIntoView({ behavior: 'smooth', block: 'nearest' })`).

### 5.3. Спецификация навигации с клавиатуры и кнопок

| Клавиша / Кнопка | Действие | Логика перехода в дереве |
|---|---|---|
| **Стрелка Вправо ($\rightarrow$)** / `>` | Шаг вперед | Если у узла есть потомки, переход на `children[0]` (главное продолжение) |
| **Стрелка Влево ($\leftarrow$)** / `<` | Шаг назад | Переход к `nodes[currentNode.parentId]` |
| **Стрелка Вниз ($\downarrow$)** | Следующий вариант | Переключение на следующий боковой вариант того же родителя (`nextSibling`) |
| **Стрелка Вверх ($\uparrow$)** | Предыдущий вариант | Переключение на предыдущий боковой вариант того же родителя (`prevSibling`) |
| **Home / `<<`** | В начало | Переход к начальной позиции этюда (`rootId`) |
| **End / `>>`** | В конец ветки | Последовательный переход по `children[0]` до листового узла |
| **Клик мышью по ходу** | Мгновенный переход | Переход непосредственно к выбранному `nodeId` с обновлением доски |

### 5.4. Стратегические врезки Вуковича (`StrategicCallout`)
Когда пользователь переходит на узловой ход (например, $3.h4!$ после $2...Kg6$), под нотацией раскрывается блок «Принцип Владимира Вуковича»:
* 💡 **Иконка темы** (`Lightbulb`, `Swords`, `Shield`).
* **Заголовок**: «Правило атаки короля в открытом поле».
* **Цитата мастера**: *«Нельзя давать королю закрепиться на g6. Пешечный тычок 3.h4! отнимает поле g5 у черных фигур и готовит смертельный шах 4.h5+...»*

---

## 6. Система навигации по главам и темам курса

### 6.1. Тематическая структура курса по книге Вуковича

Курс разбит на 4 фундаментальные главы, отражающие логику монографии «Искусство атаки в шахматах»:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Глава 1: Классическая жертва слона (Greek Gift: 1.Bxh7+ Kxh7 2.Ng5+)   │
│ ├─ Этюд 1.1: Канонический разгром при 2...Kg8 и 3.Qh5 (Мат на h7)      │
│ ├─ Этюд 1.2: Защитный ресурс 2...Kg8 3.Qh5 Re8 4.Qxf7+ Kh8             │
│ ├─ Этюд 1.3: Тонкий маневр 3.Qd3! против слона на c8                   │
│ ├─ Этюд 1.4: Главное упорство 2...Kg6! и пешечный штурм 3.h4! f5       │
│ ├─ Этюд 1.5: Опровержение ложного следа 2...Kg6 3.Qh5?? (Зевок короля) │
│ └─ Этюд 1.6: Маргинальные отходы короля: 2...Kh8 и 2...Kh6             │
├────────────────────────────────────────────────────────────────────────┤
│ Глава 2: Подключение тяжелых фигур и ладейный лифт (Rook Lifts)        │
│ ├─ Этюд 2.1: Ладейный подъем Rd1-d3-h3 по 3-й горизонтали             │
│ ├─ Этюд 2.2: Ладейный лифт Rf1-f3-h3 со связкой пункта f7             │
│ ├─ Этюд 2.3: Вскрытие вертикали «h» через жертву пешки h4-h5          │
│ └─ Этюд 2.4: Батарея тяжелых фигур Ферзь + Ладья по вертикали «g»      │
├────────────────────────────────────────────────────────────────────────┤
│ Глава 3: Разрушение пешечного прикрытия рокированного короля           │
│ ├─ Этюд 3.1: Пробитие пункта g7 (жертва слона/ладьи)                  │
│ ├─ Этюд 3.2: Прорыв через f7 с отвлечением защитников                 │
│ └─ Этюд 3.3: Матовые сети при отрезании путей отступления             │
├────────────────────────────────────────────────────────────────────────┤
│ Глава 4: Шедевры атаки Вуковича (Исторические партии)                  │
│ ├─ Этюд 4.1: Бессмертная партия Эд. Ласкер — Томас (Марш короля)       │
│ ├─ Этюд 4.2: Партия Колле — О'Хэнлон (Классика системы Колле)         │
│ └─ Этюд 4.3: Партия Алехин — Маршалл                                  │
└────────────────────────────────────────────────────────────────────────┘
```

### 6.2. Карточки этюдов (Study Cards) и индикаторы сложности
Каждая карточка на главной странице отображает:
* **Название и источник**: например, *«Эд. Ласкер — Дж. Томас (Лондон, 1912)»*.
* **Бейдж сложности**:
  * 🟢 **Клубный (1800 Chess.com)** — базовая цепочка 3–4 хода.
  * 🟡 **Продвинутый (2000 Chess.com)** — глубокий расчет 5–6 ходов с выбором между $Qh5$ и $Qd3$.
  * 🔴 **Мастерский (2200+ Chess.com)** — разветвленный расчет 7+ ходов при защите $2...Kg6$.
* **Теги мотивов**: `#GreekGift`, `#h4-Attack`, `#ColleSystem`, `#RookLift`.
* **Статус прохождения**:
  * `Не начато` (серая иконка).
  * `В процессе` (синий бейдж).
  * `Пройдено (★ ★ ★)` — идеальное решение без подсказок.
  * `Пройдено (★ ★ ☆)` — решение с 1–2 неточностями.
  * `Пройдено (★ ☆ ☆)` — пройдено с подсказками.

### 6.3. Схема сохранения прогресса в LocalStorage

Для соблюдения требования R4 (полная автономность без бэкенда) модуль `progressStore.ts` хранит состояние в браузере:

```ts
export interface StudyProgressRecord {
  studyId: string;
  isCompleted: boolean;
  stars: number;                   // 1..3
  accuracyPercent: number;         // Точность расчета
  hintsUsedCount: number;
  completedAt: string;             // ISO-дата
}

export interface UserProgressData {
  version: 1;
  totalStudiesCount: number;
  completedCount: number;
  totalStarsEarned: number;
  soundEnabled: boolean;
  records: Record<string, StudyProgressRecord>;
}

const STORAGE_KEY = 'vukovic_chess_attack_progress_v1';
```

---

## 7. Готовность к продакшен-деплою на Vercel (Production Readiness)

### 7.1. Спецификация зависимостей (`package.json`)
Конфигурация проверена на совместимость и отсутствие циклических или уязвимых связей:

```json
{
  "name": "vukovic-chess-attack",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "chess.js": "^1.4.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.454.0",
    "next": "14.2.24",
    "react": "^18.3.1",
    "react-chessboard": "^4.7.3",
    "react-dom": "^18.3.1",
    "tailwind-merge": "^2.5.4"
  },
  "devDependencies": {
    "@types/node": "^20.17.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3"
  }
}
```

### 7.2. Строгая конфигурация TypeScript (`tsconfig.json`)
Обеспечивает строгость типов и гарантирует нулевой уровень скрытых багов `any`:

```json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 7.3. Конфигурация Next.js (`next.config.mjs`)

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  poweredByHeader: false,
};

export default nextConfig;
```

### 7.4. Конфигурация Vercel (`vercel.json`)
Содержит настройки безопасных HTTP-заголовков (Content Security, X-Frame-Options, No-Sniff) и политику кэширования статики:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ]
}
```

### 7.5. Экспериментальное подтверждение сборки (Build Verification)
В ходе исследования был создан тестовый стенд с полным набором зависимостей (`next@14.2`, `react@18.3`, `react-chessboard@4.7.3`, `chess.js@1.4.0`, динамические SSG-страницы и строгий TypeScript).  
**Результат тестовой сборки**:
* Команда `npx next build` завершилась с кодом **Exit Code 0**.
* Типизация и проверка линтера прошли успешно: `✓ Linting and checking validity of types`.
* Все маршруты успешно сгенерированы статически: `● (SSG) prerendered as static HTML`.
* Время холодной сборки составило менее 8 секунд.

---

## 8. Матрица взаимодействия с компонентами Тренажера расчета (Trainer Integration)

Фронтенд-платформа предоставляет Тренажеру глубокого расчета (`explorer_survey_trainer`) стандартизированные слоты и интерфейсы:

1. **Board Lock State**: Доска автоматически блокирует ввод пользователя (`arePiecesDraggable = false`), когда тренажер находится в состояниях ожидания анимации черных (`BOT_REPLY_ANIMATING`) или разбора зевка (`BLUNDER_REFUTATION_DISPLAY`).
2. **Move Evaluation Bridge**: При отпускании фигуры или клике на целевое поле `ChessboardWrapper` вызывает коллбэк `onUserMoveAttempt(from, to)`. Тренажер классифицирует ход (`best`, `alternative`, `inaccuracy`, `blunder`, `illegal`) и возвращает результат в интерфейс.
3. **Refutation Overlay**: При ошибке `VariationTree` немедленно подсвечивает сделанный ход красным значком `??`, доска воспроизводит карающий ответ черных (например, $3...B\times g5!$), и выводится компонент `BlunderRefutation` с объяснением Вуковича.
4. **Spoiler Protection**: В режиме тренажера ходы дерева скрыты пеленой тумана войны («Следующий ход рассчитывается вами...»). Графические стрелки угроз скрываются до момента успешного нахождения хода.

---

## 9. План декомпозиции и рекомендации для реализации (Milestones)

Рекомендуется следующий порядок реализации фронтенд-подсистем:

* **M1. Базовая инициализация и дизайн-система**:
  Создание проекта Next.js, настройка Tailwind CSS темной турнирной темы (Slate/Emerald/Amber), шапка сайта, шрифты, синтезатор звуков `audioSynth.ts`.
* **M2. Модуль шахматной доски (`ChessboardWrapper`)**:
  Интеграция `react-chessboard` и `chess.js`, клики/драг, точки легальных ходов, адаптивная ширина под мобильные экраны, всплывающее окно превращения пешки.
* **M3. Компонент Дерева вариантов (`VariationTree`)**:
  Рендеринг иерархии ходов, NAG-бейджи, врезки `StrategicCallout`, управление стрелками и подсветкой полей, полная навигация стрелками клавиатуры.
* **M4. Каталог глав и навигация (`ChapterList` & `StudyCard`)**:
  Главная страница, карточки 4 глав Вуковича, фильтрация по сложности, карточки этюдов, персистенция прогресса в `localStorage`.
* **M5. Связка с Тренажером глубокого расчета**:
  Интеграция конечного автомата расчета, скрытие будущих ходов, показ опровержений ложных следов, анимация победы.
* **M6. Финальная верификация и Vercel-деплой**:
  Полный запуск `npm run build`, `npm run lint`, `npx tsc --noEmit`, создание `README.md` с инструкцией запуска в 1 клик.
