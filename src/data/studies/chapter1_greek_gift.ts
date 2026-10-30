import { VukovicStudy } from '@/types/chess';
import { createVukovicStudy } from '@/lib/studyBuilder';

/**
 * Глава 1: Классическая жертва слона (Greek Gift: 1.Bxh7+ Kxh7 2.Ng5+)
 * Включает 5 глубоких этюдов с разветвленным деревом защит черных (Kg8, Kg6, Kh8, Kh6),
 * маневрами ферзя (Qh5 vs Qd3!), пешечными таранами (h4!) и чек-листом предпосылок Вуковича.
 */

// 1. Эдгар Колле — Джон О'Хэнлон (Ницца, 1930)
const studyColleOHanlon: VukovicStudy = createVukovicStudy({
  id: 'colle-ohanlon-1930',
  title: 'Эдгар Колле — Джон О\'Хэнлон (Ницца, 1930)',
  white: 'Edgar Colle',
  black: 'John James O\'Hanlon',
  year: 1930,
  event: 'Ницца, международный турнир',
  eco: 'D05',
  initialFen: 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12',
  orientation: 'white',
  chapter: 'greek_gift',
  chapterTitle: 'Глава 1: Классическая жертва слона (Greek Gift)',
  difficulty: 2000,
  tags: ['Greek Gift', '2...Kg6', 'h4!', 'Rook Lift', 'Вскрытие короля'],
  description:
    'Хрестоматийный шедевр мастера Эдгара Колле. После классической жертвы Bxh7+ черные выбирают упорнейшую защиту 13...Kg6. Белые наносят сокрушительный удар пешкой 14.h4! и жертвуют ладью 15.Rxe6+!!.',
  calculationTargetPlies: 7,
  prerequisites: {
    pawnOnE5: false,
    knightOnF6Absent: true,
    whiteBishopOnD3orC4: true,
    whiteKnightOnG5Available: true,
    whiteQueenOnH5orD3Available: true,
    h4PawnSupportReady: true,
    notes: 'Конь f6 отсутствует, что открывает доступ к h7. Готовность продвижения h4 решает судьбу партии против выхода короля на g6.',
  },
  rootNode: {
    id: 'colle-1',
    san: 'Bxh7+',
    nag: '!',
    comment:
      'Классическая жертва слона на h7! Белые разрушают пешечный щит неприятельского короля, пользуясь отсутствием коня на f6.',
    arrows: [
      { from: 'e4', to: 'h7', color: 'rgba(239, 68, 68, 0.8)' },
      { from: 'f3', to: 'g5', color: 'rgba(234, 179, 8, 0.8)' },
    ],
    highlights: { h7: 'rgba(239, 68, 68, 0.4)' },
    isForced: true,
    children: [
      {
        id: 'colle-2',
        san: 'Kxh7',
        comment: 'Черные принимают жертву. Отказ 12...Kh8 оставляет белых с чистой лишней пешкой и продолжающейся атакой.',
        isForced: true,
        children: [
          {
            id: 'colle-3',
            san: 'Ng5+',
            nag: '!',
            comment: 'Вторжение коня с шахом! Черные стоят перед выбором: отступать назад (Kg8, Kh8) или идти вперед в открытое поле (Kg6, Kh6).',
            arrows: [{ from: 'g5', to: 'h7', color: 'rgba(239, 68, 68, 0.8)' }],
            isForced: true,
            children: [
              {
                id: 'colle-4-kg6',
                san: 'Kg6',
                comment: 'Самое упорное возражение черных. Король выходит вперед, надеясь спрятаться от маневра ферзя.',
                children: [
                  {
                    id: 'colle-5-h4',
                    san: 'h4',
                    nag: '!!',
                    comment:
                      'Ключевой ход концепции Вуковича! Пешка «h» идет вперед, создавая угрозу 15.h5+ Kh6 16.Nxf7+ с выигрышем ферзя.',
                    arrows: [{ from: 'h4', to: 'h5', color: 'rgba(34, 197, 94, 0.8)' }],
                    isForced: true,
                    children: [
                      {
                        id: 'colle-6-rh8',
                        san: 'Rh8',
                        comment: 'Черные контролируют поле h5 ладьей, пытаясь заблокировать пешечный таран.',
                        children: [
                          {
                            id: 'colle-7-rxe6',
                            san: 'Rxe6+',
                            nag: '!!',
                            comment:
                              'Блестящая жертва ладьи! Белые уничтожают пешку e6, открывая диагональ c1-h6 для вскрытого нападения.',
                            arrows: [{ from: 'e6', to: 'g6', color: 'rgba(239, 68, 68, 0.8)' }],
                            highlights: { e6: 'rgba(239, 68, 68, 0.4)' },
                            isForced: true,
                            children: [
                              {
                                id: 'colle-8-nf6',
                                san: 'Nf6',
                                comment: 'Единственная попытка заслониться. Брать ладью 15...fxe6 ведет к мату: 16.Qd3+ Kh5 17.g4+ Kxg4 18.Qh3#.',
                                children: [
                                  {
                                    id: 'colle-9-h5',
                                    san: 'h5+',
                                    nag: '!',
                                    comment: 'Пешка наносит решающий удар! Король вынужден отойти на h6.',
                                    isForced: true,
                                    children: [
                                      {
                                        id: 'colle-10-kh6',
                                        san: 'Kh6',
                                        comment: 'Король загнан в угол под вскрытый шах.',
                                        children: [
                                          {
                                            id: 'colle-11-rxd6',
                                            san: 'Rxd6',
                                            nag: '!',
                                            comment:
                                              'Уничтожение ключевого защитника d6! Брать ладью 17...Qxd6 нельзя из-за вилки 18.Nxf7+ с выигрышем ферзя.',
                                            children: [
                                              {
                                                id: 'colle-12-qa5',
                                                san: 'Qa5',
                                                comment: 'Отчаянный выпад ферзя.',
                                                children: [
                                                  {
                                                    id: 'colle-13-nxf7',
                                                    san: 'Nxf7+',
                                                    comment: 'Вилка на короля и ладью. Черные сдались.',
                                                    children: [],
                                                  },
                                                ],
                                              },
                                            ],
                                          },
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                      {
                        id: 'colle-6-f5',
                        san: 'f5',
                        comment: 'Попытка заблокировать пешку путем 14...f5.',
                        children: [
                          {
                            id: 'colle-7-f5-h5',
                            san: 'h5+',
                            nag: '!',
                            comment: 'Шах пешкой! Черный монарх оттесняется под вилку.',
                            children: [
                              {
                                id: 'colle-8-f5-kh6',
                                san: 'Kh6',
                                comment: 'Король отступает на край.',
                                children: [
                                  {
                                    id: 'colle-9-f5-nxf7',
                                    san: 'Nf7+',
                                    nag: '!!',
                                    comment: 'Королевская вилка! Белые выигрывают ферзя d8.',
                                    arrows: [
                                      { from: 'f7', to: 'h6', color: 'rgba(239, 68, 68, 0.8)' },
                                      { from: 'f7', to: 'd8', color: 'rgba(239, 68, 68, 0.8)' },
                                    ],
                                    children: [],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'colle-4-kg8',
                san: 'Kg8',
                comment: 'Пассивное отступление назад. Белые немедленно развивают смертельную матовую атаку.',
                children: [
                  {
                    id: 'colle-5-kg8-qh5',
                    san: 'Qh5',
                    nag: '!',
                    comment: 'Ферзь вторгается на h5, угрожая матом на f7 и h7.',
                    arrows: [{ from: 'h5', to: 'f7', color: 'rgba(239, 68, 68, 0.8)' }],
                    children: [
                      {
                        id: 'colle-6-kg8-nf6',
                        san: 'Nf6',
                        comment: 'Черные пытаются перекрыть атаку.',
                        children: [
                          {
                            id: 'colle-7-kg8-qxf7',
                            san: 'Qxf7+',
                            comment: 'Король загоняется в угол.',
                            children: [
                              {
                                id: 'colle-8-kg8-kh8',
                                san: 'Kh8',
                                children: [
                                  {
                                    id: 'colle-9-kg8-re4',
                                    san: 'Re4',
                                    nag: '!!',
                                    comment: 'Ладейный лифт Re1-e4-h4#! Мат неотразим.',
                                    arrows: [{ from: 'e4', to: 'h4', color: 'rgba(34, 197, 94, 0.8)' }],
                                    children: [],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'colle-4-kh6',
                san: 'Kh6',
                nag: '??',
                comment: 'Грубейший зевок черных! Король встает под прямую вилку.',
                children: [
                  {
                    id: 'colle-5-kh6-nxf7',
                    san: 'Nxf7+',
                    nag: '!!',
                    isBlunderRefutation: true,
                    blunderExplanation: 'Ход 13...Kh6?? наказывается немедленной вилкой на ферзя d8.',
                    comment: 'Вилка на короля h6 и ферзя d8. Черные несут фатальные потери.',
                    arrows: [
                      { from: 'g5', to: 'f7', color: 'rgba(239, 68, 68, 0.8)' },
                      { from: 'f7', to: 'd8', color: 'rgba(239, 68, 68, 0.8)' },
                    ],
                    children: [],
                  },
                ],
              },
              {
                id: 'colle-4-kh8',
                san: 'Kh8',
                nag: '?',
                comment: 'Отступление в угол позволяет белым форсировать линейный мат.',
                children: [
                  {
                    id: 'colle-5-kh8-qh5+',
                    san: 'Qh5+',
                    comment: 'Ферзь подключается с шахом.',
                    children: [
                      {
                        id: 'colle-6-kh8-kg8',
                        san: 'Kg8',
                        children: [
                          {
                            id: 'colle-7-kh8-qxf7+',
                            san: 'Qxf7+',
                            comment: 'Король снова загоняется в угол.',
                            children: [
                              {
                                id: 'colle-8-kh8-kh8',
                                san: 'Kh8',
                                children: [
                                  {
                                    id: 'colle-9-kh8-qh5+',
                                    san: 'Qh5+',
                                    children: [
                                      {
                                        id: 'colle-10-kh8-kg8',
                                        san: 'Kg8',
                                        children: [
                                          {
                                            id: 'colle-11-kh8-qh7#',
                                            san: 'Qh7#',
                                            nag: '!!',
                                            comment: 'Мат в углу доски!',
                                            children: [],
                                          },
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});

// 2. Джоакино Греко (1619) — Модельный разбор отступления 2...Kg8
const studyGrecoGiftKg8: VukovicStudy = createVukovicStudy({
  id: 'greco-gift-kg8',
  title: 'Джоакино Греко — Модельный разбор отступления 2...Kg8 (1619)',
  white: 'Gioachino Greco',
  black: 'NN',
  year: 1619,
  event: 'Рим, манускрипт Греко',
  eco: 'C10',
  initialFen: 'r1bq1rk1/pp1nbppp/4p3/3pP3/3P4/3B1N2/PP3PPP/R1BQK2R w KQ - 0 9',
  orientation: 'white',
  chapter: 'greek_gift',
  chapterTitle: 'Глава 1: Классическая жертва слона (Greek Gift)',
  difficulty: 1800,
  tags: ['Greek Gift', '2...Kg8', 'Линейный мат', 'Французская защита'],
  description:
    'Исторический первоисточник темы: манускрипт итальянского мастера Джоакино Греко (1619 г.). Разбор классической матовой цепочки 7-8 полуходов против пассивного отхода короля 10...Kg8.',
  calculationTargetPlies: 7,
  prerequisites: {
    pawnOnE5: true,
    knightOnF6Absent: true,
    whiteBishopOnD3orC4: true,
    whiteKnightOnG5Available: true,
    whiteQueenOnH5orD3Available: true,
    h4PawnSupportReady: false,
    notes: 'Идеальные классические предпосылки: пешка e5 блокирует коня d7, слон на d3 и ферзь готовы создать матовую сеть.',
  },
  rootNode: {
    id: 'greco-1',
    san: 'Bxh7+',
    nag: '!',
    comment: 'Каноническая жертва Греко. Слон выманивает монарха на h7.',
    isForced: true,
    children: [
      {
        id: 'greco-2',
        san: 'Kxh7',
        comment: 'Взятие обязательно, иначе белые остаются с чистой пешкой.',
        isForced: true,
        children: [
          {
            id: 'greco-3',
            san: 'Ng5+',
            nag: '!',
            comment: 'Шах конем, отрезая поле f7.',
            isForced: true,
            children: [
              {
                id: 'greco-4-kg8',
                san: 'Kg8',
                comment: 'Пассивный отход на g8 — классическая ошибка, допускающая форсированный мат.',
                children: [
                  {
                    id: 'greco-5-qh5',
                    san: 'Qh5',
                    nag: '!',
                    comment: 'Ферзь вторгается с угрозой 12.Qh7#.',
                    arrows: [{ from: 'h5', to: 'h7', color: 'rgba(239, 68, 68, 0.8)' }],
                    isForced: true,
                    children: [
                      {
                        id: 'greco-6-re8',
                        san: 'Re8',
                        comment: 'Ладья освобождает поле f8 для короля.',
                        children: [
                          {
                            id: 'greco-7-qxf7',
                            san: 'Qxf7+',
                            nag: '!',
                            comment: 'Шах! Белые не спешат с 12.Qh7+ Kf8 13.Qh8+ Ke7 без мата, а методично гонят короля.',
                            isForced: true,
                            children: [
                              {
                                id: 'greco-8-kh8',
                                san: 'Kh8',
                                children: [
                                  {
                                    id: 'greco-9-qh5',
                                    san: 'Qh5+',
                                    comment: 'Возврат ферзя для перестройки матовой сети.',
                                    isForced: true,
                                    children: [
                                      {
                                        id: 'greco-10-kg8',
                                        san: 'Kg8',
                                        children: [
                                          {
                                            id: 'greco-11-qh7',
                                            san: 'Qh7+',
                                            comment: 'Король вытесняется на f8.',
                                            isForced: true,
                                            children: [
                                              {
                                                id: 'greco-12-kf8',
                                                san: 'Kf8',
                                                children: [
                                                  {
                                                    id: 'greco-13-qh8',
                                                    san: 'Qh8#',
                                                    nag: '!!',
                                                    comment:
                                                      'Мат! Король отрезан от поля e7 собственным слоном e7, а конь g5 и пешка e5 держат всю диагональ. Чистая победа!',
                                                    children: [],
                                                  },
                                                ],
                                              },
                                            ],
                                          },
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                      {
                        id: 'greco-6-nf6',
                        san: 'Nf6',
                        comment: 'Попытка сброса коня ради перекрытия диагонали.',
                        children: [
                          {
                            id: 'greco-7-exf6',
                            san: 'exf6',
                            comment: 'Белые забирают коня с сохранением сокрушительных матовых угроз.',
                            children: [
                              {
                                id: 'greco-8-bxf6',
                                san: 'Bxf6',
                                children: [
                                  {
                                    id: 'greco-9-qh7',
                                    san: 'Qh7#',
                                    nag: '!!',
                                    comment: 'Форсированный мат на h7! Сброс коня 11...Nf6 лишь отсрочил неизбежное.',
                                    children: [],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});

// 3. Учебный этюд Вуковича: Необходимость маневра 3.Qd3!
const studyVukovicQd3: VukovicStudy = createVukovicStudy({
  id: 'vukovic-qd3-necessity',
  title: 'Учебный этюд Вуковича: Необходимость маневра 3.Qd3!',
  white: 'Vladimir Vukovic',
  black: 'Theoretical Analysis',
  year: 1965,
  event: '«The Art of Attack in Chess», Глава 5',
  eco: 'C07',
  initialFen: 'r1b2rk1/pp1nqppp/4p3/3pP3/3P4/2PB1N2/PP3PPP/R1BQK2R w KQ - 0 10',
  orientation: 'white',
  chapter: 'greek_gift',
  chapterTitle: 'Глава 1: Классическая жертва слона (Greek Gift)',
  difficulty: 2200,
  tags: ['Greek Gift', '3.Qd3!', 'Ловушка 3.Qh5??', 'En Passant', 'Глубокий расчет'],
  description:
    'Критическая тонкость Вуковича: если черный ферзь контролирует диагональ и поле g5 (ферзь на e7), стандартный выпад 12.Qh5?? опровергается контрударом 12...Qxg5!. Единственный путь к победе — тонкий маневр 12.Qd3! g6 13.Qh3! f5 14.exf6! e.p..',
  calculationTargetPlies: 6,
  prerequisites: {
    pawnOnE5: true,
    knightOnF6Absent: true,
    whiteBishopOnD3orC4: true,
    whiteKnightOnG5Available: true,
    whiteQueenOnH5orD3Available: true,
    h4PawnSupportReady: false,
    notes: 'Внимание: поле h5 находится под контролем черных или под ударом ...Qxg5, поэтому ферзь обязан подключаться через пункт d3!',
  },
  rootNode: {
    id: 'qd3-1',
    san: 'Bxh7+',
    nag: '!',
    comment: 'Жертва слона корректна, но требует филигранного расчета на 3-м ходу белых!',
    isForced: true,
    children: [
      {
        id: 'qd3-2',
        san: 'Kxh7',
        isForced: true,
        children: [
          {
            id: 'qd3-3',
            san: 'Ng5+',
            nag: '!',
            isForced: true,
            children: [
              {
                id: 'qd3-4-kg8',
                san: 'Kg8',
                comment: 'Черный король отступает на g8.',
                children: [
                  {
                    id: 'qd3-5-qd3',
                    san: 'Qd3',
                    nag: '!!',
                    comment:
                      'Гениальный маневр Вуковича! Белые создают батарею по диагонали b1-h7. Шаблонное 12.Qh5?? проигрывало из-за 12...Qxg5!.',
                    arrows: [{ from: 'd3', to: 'h7', color: 'rgba(34, 197, 94, 0.8)' }],
                    isForced: true,
                    children: [
                      {
                        id: 'qd3-6-g6',
                        san: 'g6',
                        comment: 'Единственная защита от мата на h7.',
                        children: [
                          {
                            id: 'qd3-7-qh3',
                            san: 'Qh3',
                            nag: '!',
                            comment: 'Ферзь перебрасывается на h3, возобновляя неотразимую матовую угрозу Qh7#.',
                            arrows: [{ from: 'h3', to: 'h7', color: 'rgba(239, 68, 68, 0.8)' }],
                            isForced: true,
                            children: [
                              {
                                id: 'qd3-8-f5',
                                san: 'f5',
                                comment: 'Отчаянная попытка перекрыться пешкой.',
                                children: [
                                  {
                                    id: 'qd3-9-exf6',
                                    san: 'exf6',
                                    nag: '!!',
                                    comment:
                                      'Взятие на проходе (En Passant)! Вскрывается диагональ слона c1 и вертикаль e. Защиты от мата нет.',
                                    arrows: [{ from: 'f6', to: 'h7', color: 'rgba(239, 68, 68, 0.8)' }],
                                    isForced: true,
                                    children: [
                                      {
                                        id: 'qd3-10-nxf6',
                                        san: 'Nxf6',
                                        children: [
                                          {
                                            id: 'qd3-11-qh6',
                                            san: 'Qh6',
                                            nag: '!',
                                            comment: 'Вторжение на h6. Мат неизбежен: угрожает Qh7# и Qxg6#.',
                                            children: [],
                                          },
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    id: 'qd3-5-qh5-blunder',
                    san: 'Qh5',
                    nag: '??',
                    isBlunderRefutation: true,
                    blunderExplanation:
                      'Грубейшая ошибка! Шаблонный выпад 12.Qh5?? позволяет черным сыграть 12...Qxg5!, уничтожая ключевого коня и ликвидируя атаку. Белые остаются без фигуры.',
                    comment: 'Катастрофическая ошибка!',
                    children: [
                      {
                        id: 'qd3-6-blunder-qxg5',
                        san: 'Qxg5',
                        nag: '!',
                        comment: 'Черный ферзь уничтожает коня. Белая атака захлебнулась.',
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});

// 4. Учебный этюд Вуковича: Опровержение упорного выхода 2...Kg6
const studyVukovicKg6Refutation: VukovicStudy = createVukovicStudy({
  id: 'vukovic-kg6-refutation',
  title: 'Учебный этюд Вуковича: Опровержение упорного выхода 2...Kg6',
  white: 'Vladimir Vukovic',
  black: 'Theoretical Analysis',
  year: 1965,
  event: '«The Art of Attack in Chess», Глава 5',
  eco: 'D05',
  initialFen: 'r1bqr1k1/pp1n1ppp/4p3/3pP3/8/2PB1N2/PP3PPP/R1BQK2R w KQ - 0 11',
  orientation: 'white',
  chapter: 'greek_gift',
  chapterTitle: 'Глава 1: Классическая жертва слона (Greek Gift)',
  difficulty: 2000,
  tags: ['Greek Gift', '2...Kg6', 'Пешечный таран h4', 'Охота на короля'],
  description:
    'Анализ Вуковича показывает, что ответ 12...Kg6 требует от белых точнейшей реакции. Пешечный клин 13.h4! отрезает черного монарха от спасительных полей и готовит вскрытый шах конём.',
  calculationTargetPlies: 7,
  prerequisites: {
    pawnOnE5: true,
    knightOnF6Absent: true,
    whiteBishopOnD3orC4: true,
    whiteKnightOnG5Available: true,
    whiteQueenOnH5orD3Available: true,
    h4PawnSupportReady: true,
    notes: 'Крайне важна пешка на h2, готовая к немедленному рывку h4-h5+ против выхода короля.',
  },
  rootNode: {
    id: 'kg6ref-1',
    san: 'Bxh7+',
    nag: '!',
    comment: 'Начало комбинации Greek Gift.',
    isForced: true,
    children: [
      {
        id: 'kg6ref-2',
        san: 'Kxh7',
        isForced: true,
        children: [
          {
            id: 'kg6ref-3',
            san: 'Ng5+',
            isForced: true,
            children: [
              {
                id: 'kg6ref-4-kg6',
                san: 'Kg6',
                comment: 'Король выходит в центр, надеясь укрыться от линейных шахов.',
                children: [
                  {
                    id: 'kg6ref-5-h4',
                    san: 'h4',
                    nag: '!!',
                    comment: 'Пешечный таран h4! Подготовка смертельного шаха h5+.',
                    arrows: [{ from: 'h4', to: 'h5', color: 'rgba(34, 197, 94, 0.8)' }],
                    isForced: true,
                    children: [
                      {
                        id: 'kg6ref-6-nxe5',
                        san: 'Nxe5',
                        comment: 'Черные пытаются уничтожить опорную пешку e5.',
                        children: [
                          {
                            id: 'kg6ref-7-h5',
                            san: 'h5+',
                            nag: '!',
                            comment: 'Шах! Король вытесняется на f6.',
                            isForced: true,
                            children: [
                              {
                                id: 'kg6ref-8-kf6',
                                san: 'Kf6',
                                children: [
                                  {
                                    id: 'kg6ref-9-f4',
                                    san: 'f4',
                                    nag: '!',
                                    comment: 'Белые прогоняют коня e5 и готовят вскрытый шах.',
                                    isForced: true,
                                    children: [
                                      {
                                        id: 'kg6ref-10-nc6',
                                        san: 'Nc6',
                                        children: [
                                          {
                                            id: 'kg6ref-11-nh7',
                                            san: 'Nh7+',
                                            nag: '!',
                                            comment: 'Вскрытый шах конём! Король бежит на e7.',
                                            isForced: true,
                                            children: [
                                              {
                                                id: 'kg6ref-12-ke7',
                                                san: 'Ke7',
                                                children: [
                                                  {
                                                    id: 'kg6ref-13-f5',
                                                    san: 'f5',
                                                    nag: '!',
                                                    comment: 'Полный разгром позиции черных. Черный король обречен.',
                                                    children: [],
                                                  },
                                                ],
                                              },
                                            ],
                                          },
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                      {
                        id: 'kg6ref-6-f5',
                        san: 'f5',
                        comment: 'Попытка заблокировать пешку путем 13...f5.',
                        children: [
                          {
                            id: 'kg6ref-7-f5-h5',
                            san: 'h5+',
                            comment: 'Король оттесняется под вилку.',
                            children: [
                              {
                                id: 'kg6ref-8-f5-kh6',
                                san: 'Kh6',
                                children: [
                                  {
                                    id: 'kg6ref-9-f5-nxf7',
                                    san: 'Nf7+',
                                    nag: '!!',
                                    comment: 'Королевская вилка! Белые выигрывают ферзя d8.',
                                    children: [],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});

// 5. Чек-лист предпосылок Вуковича: Ложная жертва и опровержение
const studyVukovicFailedChecklist: VukovicStudy = createVukovicStudy({
  id: 'vukovic-failed-checklist',
  title: 'Чек-лист предпосылок Вуковича: Ложная жертва и опровержение',
  white: 'Vladimir Vukovic',
  black: 'Didactic Demonstration',
  year: 1965,
  event: '«The Art of Attack in Chess», Глава 5 (Ошибочные жертвы)',
  eco: 'D00',
  initialFen: 'r1bq1rk1/pp2bppp/2n1pn2/3p4/3P4/2PB1N2/PP3PPP/R1BQK2R w KQ - 0 9',
  orientation: 'white',
  chapter: 'greek_gift',
  chapterTitle: 'Глава 1: Классическая жертва слона (Greek Gift)',
  difficulty: 2000,
  tags: ['Checklist', 'Ложная жертва', 'Конь f6', 'Опровержение'],
  description:
    'Учебный пример на понимание чек-листа Вуковича: почему жертва 9.Bxh7+?? в этой структуре является грубой ошибкой. При наличии защитного коня на f6 черные просто забирают слона 9...Nxh7!, оставляя белых у разбитого корыта.',
  calculationTargetPlies: 3,
  prerequisites: {
    pawnOnE5: false,
    knightOnF6Absent: false,
    whiteBishopOnD3orC4: true,
    whiteKnightOnG5Available: true,
    whiteQueenOnH5orD3Available: true,
    h4PawnSupportReady: false,
    notes: 'Внимание: пешка e5 отсутствует, а конь f6 на месте! Жертва слона на h7 категорически некорректна!',
  },
  rootNode: {
    id: 'failcheck-1-ne5',
    san: 'Ne5',
    nag: '!',
    comment:
      'Правильный позиционный план! Белые занимают форпост e5 конем, не форсируя некорректную жертву.',
    arrows: [{ from: 'f3', to: 'e5', color: 'rgba(34, 197, 94, 0.8)' }],
    isForced: true,
    children: [
      {
        id: 'failcheck-2-nxe5',
        san: 'Nxe5',
        comment: 'Черные разменивают активного коня.',
        children: [
          {
            id: 'failcheck-3-dxe5',
            san: 'dxe5',
            nag: '!',
            comment:
              'Пешка оттесняет коня f6! Вот теперь предпосылка Вуковича (пешка e5 и отсутствие коня f6) выполнена, и белые готовят настоящую атаку.',
            children: [
              {
                id: 'failcheck-4-nd7',
                san: 'Nd7',
                children: [
                  {
                    id: 'failcheck-5-bf4',
                    san: 'Bf4',
                    comment: 'Белые укрепляют центр с комфортным позиционным преимуществом.',
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});

export const chapter1Studies: VukovicStudy[] = [
  studyColleOHanlon,
  studyGrecoGiftKg8,
  studyVukovicQd3,
  studyVukovicKg6Refutation,
  studyVukovicFailedChecklist,
];
