# Отчет передачи (Handoff Report): Исследование логики извлечения ошибок (Blunder Extraction Logic) в CalculationTrainer.tsx

**Агент**: `explorer_m4_fix_3` (Explorer: исследование, анализ дерева вариантов, синтез стратегии)  
**Дата**: 2026-10-24  
**Рабочая директория**: `/Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/explorer_m4_fix_3`  
**Проект**: Vukovic Chess Attack Training Platform (`/Users/user/teamwork_projects/vukovic_chess_attack`)  
**Тема**: Milestone 4 Remediation — Архитектура обхода дерева вариантов и извлечение ошибок (Blunders) и альтернатив (Alternative Moves)  

---

## 1. Наблюдение (Observation)

При исследовании исходного кода компонента `src/components/trainer/CalculationTrainer.tsx` и структуры датасета `src/data/studies/` зафиксированы следующие факты:

### 1.1. Текущая реализация извлечения ошибок в `CalculationTrainer.tsx` (строки 201–219)
```typescript
    // Извлекаем возможные опровержения ошибок из дочерних узлов дерева
    const blunders: CalculationStepSpec['blunders'] = [];
    if (currentNode.children) {
      for (const child of currentNode.children) {
        if (child.isBlunderRefutation || (child.nag && child.nag.includes('?'))) {
          blunders.push({
            san: child.san,
            uci: child.uci,
            refutationSan: child.children?.[0]?.san || 'Bxg5',
            refutationUci: child.children?.[0]?.uci || 'c8g5',
            refutationFen: child.children?.[0]?.fen || currentFen,
            explanation:
              child.blunderExplanation ||
              child.comment ||
              `Ошибка! Ход ${child.san} выпускает решающий перевес по концепции Вуковича.`,
          });
        }
      }
    }
```

### 1.2. Фактическая структура дерева ходов (`MoveNode`)
1. В цикле обхода `while (currentNode)` переменная `currentNode` на каждом шаге представляет **ход БЕЛЫХ** (например, `11.Qxh7+!!` или `12.Nxf6+!!` в `ed-lasker-thomas-1912`, `12.Bxh7+` или `12.Qd3!!` в `vukovic-qd3-necessity`).
2. В соответствии с правилами шахмат и контрактом `buildVerifiedNode` (`src/lib/studyBuilder.ts`, строки 47–78), из позиции после хода белых ходят **ЧЕРНЫЕ** (`turn === 'b'`). Поэтому `currentNode.children` — это всегда массив возможных ответов **ЧЕРНЫХ**.
3. **Эмпирический дефект 1 (Попадание ходов черных в зевки белых)**:
   В партии `ed-lasker-thomas-1912` (`src/data/studies/chapter4_king_hunt.ts`, строки 49–63):
   - Узел `12.Nxf6+!!` (`lasker-hunt-3`, ход белых) имеет двух детей в `children`:
     - `12...Kh6` (`lasker-hunt-4-kh6`, упорная защита по главной линии);
     - `12...Kh8` (`lasker-hunt-4-kh8`, `nag: '?'`, ошибка черных, ведущая к мату `13.Ng6#`).
   - Текущий алгоритм на строке 204 итерирует по `currentNode.children`, находит `12...Kh8?` и добавляет ход `Kh8` в массив `step.blunders` для шага белых!
   - В результате в шаге расчета белых значится зевок `{ san: 'Kh8' }`, хотя пользователь играет за белых и физически не может сделать ход черным королем `Kh8`.
4. **Эмпирический дефект 2 (Пропуск реальных зевков белых)**:
   В этюде `vukovic-qd3-necessity` (`src/data/studies/chapter1_greek_gift.ts`, строки 507–588):
   - После `11.Bxh7+ Kxh7 12.Ng5+ Kg8` наступает очередь хода белых.
   - Узел черных `12...Kg8` (`qd3-4-kg8`) имеет в `children` два узла:
     - `12.Qd3!!` (`qd3-5-qd3`, `nag: '!!'` — лучший атакующий ход белых по Вуковичу);
     - `12.Qh5??` (`qd3-5-qh5-blunder`, `nag: '??'`, `isBlunderRefutation: true`, опровержение `12...Qxg5!`).
   - Узел `12.Qh5??` является **братом (sibling)** узла `12.Qd3!!`, так как они оба являются детьми `12...Kg8`.
   - Текущий код ищет зевки в `currentNode.children` (то есть в детях `12.Qd3!!`, где лежит единственный ответ черных `12...g6`). В результате ход `12.Qh5??` вообще **НЕ извлекается**! При попытке сыграть естественный ход `12.Qh5` тренажер выдает дефолтную заглушку вместо глубокого педагогического опровержения Вуковича (`12...Qxg5!`).
5. **Эмпирический дефект 3 (Хардкод-заглушки)**:
   На строках 209–210 указаны хардкод-значения `'Bxg5'` и `'c8g5'`, взятые из партии Колле — О'Хэнлона, которые не имеют никакого отношения к другим 17 этюдам платформы.

---

## 2. Логическая цепочка (Logic Chain)

1. **Сущность шага расчета (CalculationStepSpec)**:
   - Каждый шаг расчета `CalculationStepSpec` моделирует выбор хода пользователем, играющим за **Белых**.
   - `fenBefore` — это FEN перед ходом белых.
   - `bestMoveSan` / `bestMoveUci` — сильнейший ход белых (`currentNode`).
   - `blunders` — типичные ошибки и ложные следы **БЕЛЫХ** из позиции `fenBefore` с их опровержениями ходами **ЧЕРНЫХ**.
   - `alternativeMoves` — альтернативные корректные ходы **БЕЛЫХ** из позиции `fenBefore` (например, альтернативный мат).
   - `opponentResponse` — сильнейший ответ **ЧЕРНЫХ** на `bestMoveSan`.

2. **Отношения родства в дереве ходов (`MoveNode`)**:
   - `currentNode` — узел хода белых на текущем шаге.
   - `currentNode.children[0]` (`blackNode`) — главный ответ черных на этот ход белых.
   - `blackNode.children` — все ходы белых в ответ на `blackNode`:
     - `blackNode.children[0]` (`nextWhiteNode`) — главный ход белых следующего шага.
     - `blackNode.children.slice(1)` — это **узлы-братья (siblings)** хода `nextWhiteNode`. Они начинаются из той же позиции `blackNode.fen` (`fenBefore` следующего шага) и делаются той же стороной (**Белыми**).

3. **Следствие для алгоритма обхода дерева**:
   - Чтобы извлечь ошибки и альтернативы белых для хода `currentNode`, необходимо анализировать не дочерние узлы `currentNode.children` (которые принадлежат черным), а **узлы-братья `currentNode`**, то есть остальные альтернативные ветки белых, выходящие из той же родительской позиции `fenBefore`.
   - Для шага 0 (`stepIndex === 0`): `currentNode` — это `study.rootNode`, выходящий из `study.initialFen`. У него нет братьев в текущей схеме данных.
   - Для шага $k \ge 1$: кандидаты в ходы белых берутся из `blackNode.children`. Первый узел (`blackNode.children[0]`) становится `currentNode`, а остальные узлы `blackNode.children.slice(1)` являются `candidateSiblings`.
   - Для каждого узла `sibling` из `candidateSiblings`:
     - Если `sibling.isBlunderRefutation || (sibling.nag && sibling.nag.includes('?')) || Boolean(sibling.blunderExplanation)`: это **зевок белых** (`blunder`).
       Опровержение этого зевка — это первый дочерний ход черных: `refutationChild = sibling.children?.[0]`.
     - Иначе: это **альтернативный верный ход белых** (`alternativeMove`), который должен пополнять массив `step.alternativeMoves`.

---

## 3. Оговорки и допущения (Caveats)

1. **Специализированная ветка для Колле — О'Хэнлона**:
   В `CalculationTrainer.tsx` (строки 68–165) этюд `colle-ohanlon-1930` имеет специализированную ручную спецификацию шагов с явными зевками `14.Qh5??` и `14.Qg4?`. В этой ветке необходимо исправить только опечатку FEN на шаге 1 (строка 94, зона ответственности Explorer 2). Универсальный алгоритмический экстрактор применяется ко всем остальным 17 этюдам платформы.
2. **Многократные зевки черных**:
   В дереве вариантов некоторые ходы черных также помечены вопросительными знаками (например, `12...Kh8?` в партии Ласкера или `13...Kh6??` в партии Колле). В режиме расчета тренажер форсирует сильнейшую защиту черных (`blackNode = currentNode.children[0]`), а слабые ходы черных доступны в режиме интерактивного изучения дерева (`VariationTree` в Study Mode). Поэтому ходы черных не должны попадать в список ошибок белых.

---

## 4. Заключение и стратегия исправления (Conclusion & Fix Strategy)

### 4.1. Итоговый вердикт
Текущая логика извлечения зевков на строках 201–219 в корне некорректна из-за инверсии сторон: она парсит дочерние узлы белых (ходы черных) вместо узлов-братьев (альтернативных ходов белых). Это приводит к засорению шагов белых ходами черных фигур и одновременной потере важнейших авторских ложных следов Вуковича (как `12.Qh5??` в этюде на необходимость `Qd3`).

### 4.2. Точный план замены кода для исполнителя (Worker)

В файле `src/components/trainer/CalculationTrainer.tsx` заменить блок строк 167–248 на следующий протестированный код:

#### До (Lines 167–248):
```typescript
  // Общий алгоритмический экстрактор шагов расчета из дерева вариантов этюда
  const steps: CalculationStepSpec[] = [];
  let currentFen = study.initialFen;
  let currentNode = study.rootNode;
  let stepIndex = 0;

  // Извлекаем цепочку ходов белых и ответов черных по главной линии
  while (currentNode) {
    const isWhiteMove = currentNode.turn === 'w' || !currentNode.turn;
    const fenBefore = currentFen;
    const expectedFenAfter = currentNode.fen;

    const fromSquare = (currentNode.uci.slice(0, 2) || 'e4') as Square;
    const toSquare = (currentNode.uci.slice(2, 4) || 'h7') as Square;

    // Ищем упорный ответ черных (первый дочерний узел)
    let opponentResponse: CalculationStepSpec['opponentResponse'] = undefined;
    let nextWhiteNode: typeof study.rootNode | null = null;

    if (currentNode.children && currentNode.children.length > 0) {
      const blackNode = currentNode.children[0];
      opponentResponse = {
        san: blackNode.san,
        uci: blackNode.uci,
        fenAfter: blackNode.fen,
        comment: blackNode.comment || 'Защита черных по главной линии Вуковича.',
      };

      if (blackNode.children && blackNode.children.length > 0) {
        nextWhiteNode = blackNode.children[0];
        currentFen = blackNode.fen;
      }
    }

    // Извлекаем возможные опровержения ошибок из дочерних узлов дерева
    const blunders: CalculationStepSpec['blunders'] = [];
    if (currentNode.children) {
      for (const child of currentNode.children) {
        if (child.isBlunderRefutation || (child.nag && child.nag.includes('?'))) {
          blunders.push({
            san: child.san,
            uci: child.uci,
            refutationSan: child.children?.[0]?.san || 'Bxg5',
            refutationUci: child.children?.[0]?.uci || 'c8g5',
            refutationFen: child.children?.[0]?.fen || currentFen,
            explanation:
              child.blunderExplanation ||
              child.comment ||
              `Ошибка! Ход ${child.san} выпускает решающий перевес по концепции Вуковича.`,
          });
        }
      }
    }

    const moveNum = Math.floor(stepIndex + 1);

    steps.push({
      stepIndex,
      moveNumber: moveNum,
      fenBefore,
      expectedFenAfter,
      bestMoveSan: currentNode.san,
      bestMoveUci: currentNode.uci,
      bestMoveExplanation: currentNode.comment || 'Сильнейший атакующий ход по концепции Вуковича.',
      blunders: blunders.length > 0 ? blunders : undefined,
      hints: {
        level1Concept:
          currentNode.comment?.split('.')[0] ||
          'Сконцентрируйте фигуры против ослабленного пункта королевского фланга.',
        level2Highlight: { fromSquare, toSquare },
        level3Arrow: [fromSquare, toSquare],
      },
      opponentResponse,
    });

    stepIndex++;
    if (!nextWhiteNode) {
      break;
    }
    currentNode = nextWhiteNode;
  }
```

#### После (Предлагаемый код):
```typescript
  // Общий алгоритмический экстрактор шагов расчета из дерева вариантов этюда
  const steps: CalculationStepSpec[] = [];
  let currentFen = study.initialFen;
  let currentNode: typeof study.rootNode | null = study.rootNode;
  let currentCandidateSiblings: typeof study.rootNode[] = [];
  let stepIndex = 0;

  // Извлекаем цепочку ходов белых и ответов черных по главной линии
  while (currentNode) {
    const isWhiteMove = currentNode.turn === 'w' || !currentNode.turn;
    const fenBefore = currentFen;
    const expectedFenAfter = currentNode.fen;

    const fromSquare = (currentNode.uci.slice(0, 2) || 'e4') as Square;
    const toSquare = (currentNode.uci.slice(2, 4) || 'h7') as Square;

    // Ищем упорный ответ черных (первый дочерний узел хода белых)
    let opponentResponse: CalculationStepSpec['opponentResponse'] = undefined;
    let nextWhiteNode: typeof study.rootNode | null = null;
    let nextCandidateSiblings: typeof study.rootNode[] = [];

    if (currentNode.children && currentNode.children.length > 0) {
      const blackNode = currentNode.children[0];
      opponentResponse = {
        san: blackNode.san,
        uci: blackNode.uci,
        fenAfter: blackNode.fen,
        comment: blackNode.comment || 'Защита черных по главной линии Вуковича.',
      };

      if (blackNode.children && blackNode.children.length > 0) {
        nextWhiteNode = blackNode.children[0];
        // Все остальные дочерние узлы ответа черных — это альтернативные ходы белых (ошибки или альтернативы)
        nextCandidateSiblings = blackNode.children.slice(1);
        currentFen = blackNode.fen;
      }
    }

    // Извлекаем возможные ошибки белых и альтернативные ходы из узлов-братьев (candidate siblings) текущего хода
    const blunders: CalculationStepSpec['blunders'] = [];
    const alternativeMoves: NonNullable<CalculationStepSpec['alternativeMoves']> = [];

    for (const sibling of currentCandidateSiblings) {
      const isBlunder =
        sibling.isBlunderRefutation ||
        (sibling.nag && sibling.nag.includes('?')) ||
        Boolean(sibling.blunderExplanation);

      if (isBlunder) {
        const refutationChild = sibling.children?.[0];
        blunders.push({
          san: sibling.san,
          uci: sibling.uci,
          refutationSan: refutationChild?.san || '??',
          refutationUci: refutationChild?.uci || sibling.uci || '',
          refutationFen: refutationChild?.fen || sibling.fen || fenBefore,
          explanation:
            sibling.blunderExplanation ||
            sibling.comment ||
            `Ошибка! Ход ${sibling.san} выпускает решающий перевес по концепции Вуковича.`,
        });
      } else {
        alternativeMoves.push({
          san: sibling.san,
          uci: sibling.uci,
          explanation:
            sibling.comment ||
            `Альтернативное верное продолжение атаки: ${sibling.san}`,
        });
      }
    }

    const moveNum = Math.floor(stepIndex + 1);

    steps.push({
      stepIndex,
      moveNumber: moveNum,
      fenBefore,
      expectedFenAfter,
      bestMoveSan: currentNode.san,
      bestMoveUci: currentNode.uci,
      bestMoveExplanation: currentNode.comment || 'Сильнейший атакующий ход по концепции Вуковича.',
      blunders: blunders.length > 0 ? blunders : undefined,
      alternativeMoves: alternativeMoves.length > 0 ? alternativeMoves : undefined,
      hints: {
        level1Concept:
          currentNode.comment?.split('.')[0] ||
          'Сконцентрируйте фигуры против ослабленного пункта королевского фланга.',
        level2Highlight: { fromSquare, toSquare },
        level3Arrow: [fromSquare, toSquare],
      },
      opponentResponse,
    });

    stepIndex++;
    if (!nextWhiteNode) {
      break;
    }
    currentNode = nextWhiteNode;
    currentCandidateSiblings = nextCandidateSiblings;
  }
```

---

## 5. Метод верификации (Verification Method)

Для независимой проверки правильности извлечения ходов и ошибок:

1. **Проверка извлечения ошибок на всех 18 этюдах (CLI скрипт)**:
   ```bash
   npx tsx -e "
   import { allStudies } from './src/data/studies/index.ts';
   import { getCalculationStepsForStudy } from './src/components/trainer/CalculationTrainer.tsx';

   for (const s of allStudies) {
     const steps = getCalculationStepsForStudy(s);
     for (const st of steps) {
       if (st.blunders) {
         for (const b of st.blunders) {
           console.log(\`Study: \${s.id}, Step \${st.stepIndex}: Blunder \${b.san}, Refutation \${b.refutationSan}\`);
         }
       }
     }
   }
   "
   ```
   - **Ожидаемый результат**:
     - В `ed-lasker-thomas-1912` ОТСУТСТВУЕТ ход `Kh8` в списке зевков белых.
     - В `vukovic-qd3-necessity` ПРИСУТСТВУЕТ ход `12.Qh5` с опровержением `12...Qxg5!`.
     - Все ходы в `blunders` являются легальными ходами белых из `fenBefore`.

2. **Запуск эмпирического набора тестов Challenger M4**:
   ```bash
   npx tsx tests/challenger_m4_empirical_test.ts
   ```
   - Тесты CH-M4-01 и CH-M4-02 должны продолжать проходить 100% (813 и 256 assertions без разрыва непрерывности доски).

3. **Сборка проекта без ошибок**:
   ```bash
   npm run build
   ```
   - Должен завершаться с exit code 0.
