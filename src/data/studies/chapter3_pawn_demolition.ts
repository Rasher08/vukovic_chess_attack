import { VukovicStudy } from '@/types/chess';
import { createVukovicStudy } from '@/lib/studyBuilder';

/**
 * Глава 3: Разрушение пешечного прикрытия рокированного короля (Demolition of Pawn Shield)
 * Включает 4 великих этюда:
 * 1. А. Алехин — Фельдт (1916): Разрушение пунктов f7 и e6 (15.Nf7!! и 16.Qxe6+!!)
 * 2. Р. Шпильман — М. Вальтер (1928): Пешечный таран 8.e6! и отрезание короля
 * 3. Г. Пиллсбери — Г. Марко (1900): Разрушение защитников f6/g6 и прорыв
 * 4. Г. Мароци — С. Тартаковер (1922): Сокрушение пешечного барьера на h2 (17...Rxh2!!)
 */

// 1. Александр Алехин — Фельдт (Тарнополь, 1916)
const studyAlekhineFeldt: VukovicStudy = createVukovicStudy({
  id: 'alekhine-feldt-1916',
  title: 'Александр Алехин — Фельдт (Тарнополь, 1916)',
  white: 'Alexander Alekhine',
  black: 'Feldt',
  year: 1916,
  event: 'Тарнополь, сеанс одновременной игры вслепую',
  eco: 'C11',
  initialFen: 'r2qr1k1/pb1nb1pp/1p2pn2/2p1Np2/2PP1B2/3B1N2/PP2QPPP/R4RK1 w - - 0 15',
  orientation: 'white',
  chapter: 'pawn_demolition',
  chapterTitle: 'Глава 3: Разрушение пешечного прикрытия короля',
  difficulty: 2000,
  tags: ['Жертва на f7', 'Жертва ферзя', 'Эполетный мат', 'Слепая игра Алехина'],
  description:
    'Жемчужина атакующего творчества Александра Алехина, сыгранная вслепую во время Первой мировой войны. Белые наносят сокрушительный удар 15.Nf7!!, а затем жертвуют ферзя 16.Qxe6+!!, форсируя мат в любых разветвлениях.',
  calculationTargetPlies: 5,
  rootNode: {
    id: 'alekhine-1',
    san: 'Nf7',
    nag: '!!',
    comment:
      'Громоподобный удар Алехина! Конь вторгается на f7, разрушая ключевую пешечную опору черного лагеря.',
    arrows: [{ from: 'e5', to: 'f7', color: 'rgba(239, 68, 68, 0.8)' }],
    highlights: { f7: 'rgba(239, 68, 68, 0.5)' },
    isForced: true,
    children: [
      {
        id: 'alekhine-2',
        san: 'Kxf7',
        comment: 'Взятие обязательно, иначе теряется ферзь d8.',
        isForced: true,
        children: [
          {
            id: 'alekhine-3',
            san: 'Qxe6+',
            nag: '!!',
            comment:
              'Фантастическая жертва ферзя! Алехин разрушает последнюю преграду e6 и форсирует мат.',
            arrows: [{ from: 'e2', to: 'e6', color: 'rgba(239, 68, 68, 0.8)' }],
            highlights: { e6: 'rgba(239, 68, 68, 0.5)' },
            isForced: true,
            children: [
              {
                id: 'alekhine-4-kxe6',
                san: 'Kxe6',
                comment: 'Черные принимают ферзя. Король оказывается в центре доски.',
                children: [
                  {
                    id: 'alekhine-5-ng5',
                    san: 'Ng5#',
                    nag: '!!',
                    comment:
                      'Бессмертный эполетный мат! Черный монарх запатован собственными фигурами и пешками d5, f5, e7, d7.',
                    arrows: [{ from: 'f3', to: 'g5', color: 'rgba(239, 68, 68, 0.8)' }],
                    children: [],
                  },
                ],
              },
              {
                id: 'alekhine-4-kg6',
                san: 'Kg6',
                comment: 'Король пытается скрыться на g6.',
                children: [
                  {
                    id: 'alekhine-5-g4',
                    san: 'g4',
                    nag: '!!',
                    comment: 'Пешечный таран разрушает пункт f5.',
                    arrows: [{ from: 'g2', to: 'g4', color: 'rgba(34, 197, 94, 0.8)' }],
                    isForced: true,
                    children: [
                      {
                        id: 'alekhine-6-be4',
                        san: 'Be4',
                        comment: 'Слон пытается закрыть диагональ.',
                        children: [
                          {
                            id: 'alekhine-7-nh4',
                            san: 'Nh4#',
                            nag: '!!',
                            comment: 'Мат конем посреди доски!',
                            children: [],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'alekhine-4-kf8',
                san: 'Kf8',
                comment: 'Отступление короля назад.',
                children: [
                  {
                    id: 'alekhine-5-kf8-ng5',
                    san: 'Ng5',
                    nag: '!',
                    comment: 'Угроза мата 18.Qf7# неотразима.',
                    arrows: [{ from: 'g5', to: 'f7', color: 'rgba(239, 68, 68, 0.8)' }],
                    children: [
                      {
                        id: 'alekhine-6-kf8-ne5',
                        san: 'Ne5',
                        comment: 'Отчаянный сброс коня.',
                        children: [
                          {
                            id: 'alekhine-7-kf8-dxe5',
                            san: 'dxe5',
                            children: [
                              {
                                id: 'alekhine-8-kf8-qxd3',
                                san: 'Qxd3',
                                children: [
                                  {
                                    id: 'alekhine-9-kf8-qf7',
                                    san: 'Qf7#',
                                    nag: '!!',
                                    comment: 'Неотвратимый мат!',
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

// 2. Рудольф Шпильман — Макс Вальтер (Тренчанске Теплице, 1928)
const studySpielmannWalter: VukovicStudy = createVukovicStudy({
  id: 'spielmann-walter-1928',
  title: 'Рудольф Шпильман — Макс Вальтер (Тренчанске Теплице, 1928)',
  white: 'Rudolf Spielmann',
  black: 'Max Walter',
  year: 1928,
  event: 'Тренчанске Теплице, международный турнир',
  eco: 'B10',
  initialFen: 'rnbqkb1r/p3pppp/1p6/2ppP3/3N4/2P5/PPP1QPPP/R1B1KB1R w KQkq - 0 8',
  orientation: 'white',
  chapter: 'pawn_demolition',
  chapterTitle: 'Глава 3: Разрушение пешечного прикрытия короля',
  difficulty: 2000,
  tags: ['Пешечный клин e6', 'Отрезание короля', 'Каро-Канн', 'Лишение рокировки'],
  description:
    'Мастер атаки Рудольф Шпильман взламывает центр ходом 8.e6!!, разрушая координацию черных и навсегда лишая короля возможности рокировать. Конь вторгается на e6, заставляя черных капитулировать.',
  calculationTargetPlies: 6,
  rootNode: {
    id: 'spielmann-1',
    san: 'e6',
    nag: '!!',
    comment:
      'Гроссмейстерский прорыв пешкой! Шпильман жертвует пешку ради полного разрушения прикрытия неприятельского монарха.',
    arrows: [{ from: 'e5', to: 'e6', color: 'rgba(34, 197, 94, 0.8)' }],
    highlights: { e6: 'rgba(34, 197, 94, 0.4)' },
    isForced: true,
    children: [
      {
        id: 'spielmann-2',
        san: 'fxe6',
        comment: 'Черные принимают пешку пешкой f.',
        children: [
          {
            id: 'spielmann-3',
            san: 'Nxe6',
            nag: '!',
            comment: 'Вторжение коня на ключевой пункт e6 с нападением на ферзя d8 и слона c8.',
            arrows: [
              { from: 'e6', to: 'd8', color: 'rgba(239, 68, 68, 0.8)' },
              { from: 'e6', to: 'c8', color: 'rgba(239, 68, 68, 0.8)' },
            ],
            isForced: true,
            children: [
              {
                id: 'spielmann-4',
                san: 'Qd6',
                comment: 'Ферзь уходит из-под удара.',
                children: [
                  {
                    id: 'spielmann-5',
                    san: 'Nxf8',
                    nag: '!',
                    comment: 'Уничтожение защитного слона f8.',
                    isForced: true,
                    children: [
                      {
                        id: 'spielmann-6',
                        san: 'Rxf8',
                        comment: 'Черные забирают ладьей.',
                        children: [
                          {
                            id: 'spielmann-7',
                            san: 'Qh5+',
                            nag: '!',
                            comment: 'Ферзь подключается по вскрывшейся диагонали с шахом.',
                            isForced: true,
                            children: [
                              {
                                id: 'spielmann-8',
                                san: 'Rf7',
                                comment: 'Ладья вынуждена закрыть короля.',
                                children: [
                                  {
                                    id: 'spielmann-9',
                                    san: 'Be3',
                                    nag: '!',
                                    comment:
                                      'Спокойное развитие фигур с подавляющим перевесом. Король черных застрял в центре под огнем белых.',
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
        id: 'spielmann-2-bxe6',
        san: 'Bxe6',
        comment: 'Взятие слоном.',
        children: [
          {
            id: 'spielmann-3-bxe6-nxe6',
            san: 'Nxe6',
            children: [
              {
                id: 'spielmann-4-bxe6-fxe6',
                san: 'fxe6',
                children: [
                  {
                    id: 'spielmann-5-bxe6-qh5',
                    san: 'Qh5+',
                    comment: 'Король черных выбивается в открытое поле с катастрофическими последствиями.',
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

// 3. Гарри Пиллсбери — Георг Марко (Париж, 1900)
const studyPillsburyMarco: VukovicStudy = createVukovicStudy({
  id: 'pillsbury-marco-1900',
  title: 'Гарри Пиллсбери — Георг Марко (Париж, 1900)',
  white: 'Harry Pillsbury',
  black: 'Georg Marco',
  year: 1900,
  event: 'Париж, всемирный турнир',
  eco: 'D55',
  initialFen: 'r4rk1/1b1qbp2/p4np1/3p2B1/2pP3Q/2p1P3/PPB3PP/R4RK1 w - - 0 19',
  orientation: 'white',
  chapter: 'pawn_demolition',
  chapterTitle: 'Глава 3: Разрушение пешечного прикрытия короля',
  difficulty: 2000,
  tags: ['Жертва качества', 'Разрушение защитника f6', 'Атака Пиллсбери', 'Мат на h8'],
  description:
    'Атака Пиллсбери в действии: белые жертвуют качество 19.Rxf6!!, устраняя единственную фигуру, сдерживавшую ферзя и слона. Брать ладью 19...Bxf6 ведет к немедленному мату 20.Bxf6 и 21.Qh8#.',
  calculationTargetPlies: 4,
  rootNode: {
    id: 'pillsbury-1',
    san: 'Rxf6',
    nag: '!!',
    comment:
      'Позиционная жертва качества! Пиллсбери уничтожает ключевого защитника королевского фланга.',
    arrows: [{ from: 'f1', to: 'f6', color: 'rgba(239, 68, 68, 0.8)' }],
    highlights: { f6: 'rgba(239, 68, 68, 0.5)' },
    isForced: true,
    children: [
      {
        id: 'pillsbury-2',
        san: 'Bxf6',
        comment: 'Слон забирает ладью.',
        isForced: true,
        children: [
          {
            id: 'pillsbury-3',
            san: 'Bxf6',
            nag: '!',
            comment:
              'Слон занимает доминирующий пункт f6. Матовая угроза 21.Qh8# абсолютно неотразима: у черных нет защиты.',
            arrows: [{ from: 'h4', to: 'h8', color: 'rgba(239, 68, 68, 0.8)' }],
            isForced: true,
            children: [
              {
                id: 'pillsbury-4-cxb2',
                san: 'cxb2',
                comment: 'Отчаянное продвижение пешки ферзевого фланга.',
                children: [
                  {
                    id: 'pillsbury-5-qh8',
                    san: 'Qh8#',
                    nag: '!!',
                    comment: 'Неотразимый мат по вертикали «h»!',
                    children: [],
                  },
                ],
              },
              {
                id: 'pillsbury-4-qd6',
                san: 'Qd6',
                comment: 'Попытка черных подключить ферзя к обороне.',
                children: [
                  {
                    id: 'pillsbury-5-qd6-qh8',
                    san: 'Qh8#',
                    nag: '!!',
                    comment: 'Мат!',
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

// 4. Геза Мароци — Савелий Тартаковер (Теплиц-Шёнау, 1922)
const studyMaroczyTartakower: VukovicStudy = createVukovicStudy({
  id: 'maroczy-tartakower-1922',
  title: 'Геза Мароци — Савелий Тартаковер (Теплиц-Шёнау, 1922)',
  white: 'Geza Maroczy',
  black: 'Savielly Tartakower',
  year: 1922,
  event: 'Теплиц-Шёнау, международный турнир (Brilliancy Prize)',
  eco: 'A84',
  initialFen: 'r1b3k1/pp1n3p/2pbpq1r/3p4/2PPp1p1/PP2P1P1/1BQN1P1P/3RRBK1 b - - 1 17',
  orientation: 'black',
  chapter: 'pawn_demolition',
  chapterTitle: 'Глава 3: Разрушение пешечного прикрытия короля',
  difficulty: 2200,
  tags: ['Игра за черных', '17...Rxh2!!', 'Разрушение пункта h2', 'Голландская защита'],
  description:
    'Партия удостоена 1-го приза за красоту. Савелий Тартаковер проводит сокрушительное разрушение королевского фланга белых фантастической жертвой ладьи 17...Rxh2!!, после чего черные фигуры устраивают настоящую охоту на короля.',
  calculationTargetPlies: 6,
  rootNode: {
    id: 'maroczy-1',
    san: 'Rxh2',
    nag: '!!',
    comment:
      'Бессмертная жертва ладьи Тартаковера! Черные сносят пешку h2 и вскрывают белого монарха.',
    arrows: [{ from: 'h6', to: 'h2', color: 'rgba(239, 68, 68, 0.8)' }],
    highlights: { h2: 'rgba(239, 68, 68, 0.5)' },
    isForced: true,
    children: [
      {
        id: 'maroczy-2',
        san: 'Kxh2',
        comment: 'Взятие обязательно, иначе ладья грозит новыми ударами.',
        isForced: true,
        children: [
          {
            id: 'maroczy-3',
            san: 'Qxf2+',
            nag: '!',
            comment: 'Вторжение черного ферзя с шахом!',
            isForced: true,
            children: [
              {
                id: 'maroczy-4',
                san: 'Kh1',
                comment: 'Король отступает в угол.',
                isForced: true,
                children: [
                  {
                    id: 'maroczy-5',
                    san: 'Nf6',
                    nag: '!!',
                    comment:
                      'Тончайший ход Тартаковера! Черные не спешат забирать слона, а подключают коня через g4 или h5 к матовой атаке.',
                    arrows: [{ from: 'f6', to: 'h5', color: 'rgba(34, 197, 94, 0.8)' }],
                    isForced: true,
                    children: [
                      {
                        id: 'maroczy-6',
                        san: 'Re2',
                        comment: 'Белая ладья пытается защитить короля.',
                        children: [
                          {
                            id: 'maroczy-7',
                            san: 'Qxg3',
                            nag: '!',
                            comment: 'Черные съедают вторую пешку прикрытия, сохраняя неотразимую матовую атаку.',
                            children: [
                              {
                                id: 'maroczy-8',
                                san: 'Nb1',
                                children: [
                                  {
                                    id: 'maroczy-9',
                                    san: 'Nh5',
                                    nag: '!',
                                    comment: 'Конь выходит на рубеж атаки. Белые абсолютно беззащитны.',
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

export const chapter3Studies: VukovicStudy[] = [
  studyAlekhineFeldt,
  studySpielmannWalter,
  studyPillsburyMarco,
  studyMaroczyTartakower,
];
