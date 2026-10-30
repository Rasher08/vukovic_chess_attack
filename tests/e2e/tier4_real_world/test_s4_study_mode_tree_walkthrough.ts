/**
 * Tier 4: Real-World Application Scenario 4 (S4):
 * Study Mode Full Variation Tree Walkthrough:
 * Traverses all 6 branches of the Greek Gift theory tree, validating Russian commentary,
 * NAG evaluation symbols, and threat arrows at each critical junction.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { BrowserDomHarness, MoveNodeRecord } from '../harness/browserDomHarness.ts';

describe('Tier 4 - S4: Study Mode Full Variation Tree Walkthrough', () => {
  const fullGreekGiftTree: MoveNodeRecord[] = [
    {
      id: 'root-12-bxh7',
      parentId: null,
      san: 'Bxh7+',
      uci: 'e4h7',
      fen: 'r1bqr1k1/pp1n1ppB/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 b - - 0 12',
      turn: 'w',
      comment: 'Классическая жертва слона на h7 (Greek Gift).',
      arrows: [['e4', 'h7', 'red']],
      children: ['12-kxh7'],
    },
    {
      id: '12-kxh7',
      parentId: 'root-12-bxh7',
      san: 'Kxh7',
      uci: 'g8h7',
      fen: 'r1bqr3/pp1n1ppk/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 w - - 0 13',
      turn: 'b',
      comment: 'Черные принимают вызов.',
      children: ['13-ng5'],
    },
    {
      id: '13-ng5',
      parentId: '12-kxh7',
      san: 'Ng5+',
      uci: 'f3g5',
      fen: 'r1bqr3/pp1n1ppk/3bp3/6N1/3p4/2P5/PP3PPP/R1BQR1K1 b - - 1 13',
      turn: 'w',
      comment: 'Вторжение коня с шахом. Черные выбирают одно из 4 отступлений монарха.',
      arrows: [['f3', 'g5', 'blue']],
      children: ['branch-kg8', 'branch-kg6', 'branch-kh8', 'branch-kh6'],
    },
    // Branch 1: 13...Kg8
    {
      id: 'branch-kg8',
      parentId: '13-ng5',
      san: 'Kg8',
      uci: 'h7g8',
      fen: 'r1bqr1k1/pp1n1pp1/3bp3/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
      turn: 'b',
      comment: 'Пассивный отход назад в укрытие.',
      children: ['14-qh5', '14-qd3'],
    },
    {
      id: '14-qh5',
      parentId: 'branch-kg8',
      san: 'Qh5!',
      uci: 'd1h5',
      fen: 'r1bqr1k1/pp1n1pp1/3bp3/6NQ/3p4/2P5/PP3PPP/R1B1R1K1 b - - 3 14',
      turn: 'w',
      nag: '!',
      comment: 'Двойная угроза мата на h7 и взятия на f7.',
      arrows: [['h5', 'f7', 'red'], ['h5', 'h7', 'red']],
      children: ['14-re8', '14-bf5', '14-nf6'],
    },
    {
      id: '14-re8',
      parentId: '14-qh5',
      san: 'Re8',
      uci: 'e8e8',
      fen: 'r1bqr1k1/pp1n1pp1/3bp3/6NQ/3p4/2P5/PP3PPP/R1B1R1K1 w - - 4 15',
      turn: 'b',
      comment: 'Ладья освобождает поле f8 для бегства короля.',
      children: [],
    },
    {
      id: '14-bf5',
      parentId: '14-qh5',
      san: 'Bf5',
      uci: 'c8f5',
      fen: 'r2qr1k1/pp1n1pp1/3bp3/5bNQ/3p4/2P5/PP3PPP/R1B1R1K1 w - - 4 15',
      turn: 'b',
      comment: 'Сброс слона ради освобождения поля e7.',
      children: [],
    },
    {
      id: '14-nf6',
      parentId: '14-qh5',
      san: 'Nf6',
      uci: 'd7f6',
      fen: 'r1bqr1k1/pp3pp1/3bpn2/6NQ/3p4/2P5/PP3PPP/R1B1R1K1 w - - 4 15',
      turn: 'b',
      comment: 'Контрудар с перекрытием вертикали.',
      children: [],
    },
    // Branch 2: 14.Qd3!
    {
      id: '14-qd3',
      parentId: 'branch-kg8',
      san: 'Qd3!',
      uci: 'd1d3',
      fen: 'r1bqr1k1/pp1n1pp1/3bp3/6N1/3p4/2PQ4/PP3PPP/R1B1R1K1 b - - 3 14',
      turn: 'w',
      nag: '!',
      comment: 'Маневр Вуковича для переброски ферзя на h3.',
      children: [],
    },
    // Branch 3: 13...Kg6!
    {
      id: 'branch-kg6',
      parentId: '13-ng5',
      san: 'Kg6!',
      uci: 'h7g6',
      fen: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
      turn: 'b',
      nag: '!',
      comment: 'Главное упорство защиты. Король идет в центр.',
      children: ['14-h4'],
    },
    {
      id: '14-h4',
      parentId: 'branch-kg6',
      san: 'h4!',
      uci: 'h2h4',
      fen: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 b - - 0 14',
      turn: 'w',
      nag: '!',
      comment: 'Пешечный таран 14.h4! отнимает поля у короля.',
      arrows: [['h4', 'h5', 'green']],
      children: [],
    },
    // Branch 4: 13...Kh8
    {
      id: 'branch-kh8',
      parentId: '13-ng5',
      san: 'Kh8',
      uci: 'h7h8',
      fen: 'r1bqr2k/pp1n1pp1/3bp3/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
      turn: 'b',
      nag: '?',
      comment: 'Грубая ошибка: отступление в угол ведет к немедленному мату 14.Qh5+ Kg8 15.Qh7#.',
      children: [],
    },
    // Branch 5: 13...Kh6
    {
      id: 'branch-kh6',
      parentId: '13-ng5',
      san: 'Kh6',
      uci: 'h7h6',
      fen: 'r1bqr3/pp1n1pp1/3bp2k/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
      turn: 'b',
      nag: '??',
      comment: 'Катастрофа: монарх встает под вилку 14.Nxf7+ с выигрышем ферзя d8.',
      children: [],
    },
  ];

  it('TC-S4-01: Full traversal of all branches validates Russian annotations and tactical markers', () => {
    const dom = new BrowserDomHarness();
    dom.loadTree(fullGreekGiftTree, 'root-12-bxh7');

    expect.equal(dom.treeNodes.size, fullGreekGiftTree.length);

    // 1. Check Root
    const root = dom.treeNodes.get('root-12-bxh7')!;
    expect.equal(root.san, 'Bxh7+');
    expect.match(root.comment!, /Greek Gift/);
    expect.deepEqual(root.arrows![0], ['e4', 'h7', 'red']);

    // 2. Navigate to 13.Ng5+ and verify 4 distinct child branches
    dom.navigateToNode('13-ng5');
    const nodeNg5 = dom.treeNodes.get('13-ng5')!;
    expect.equal(nodeNg5.children.length, 4, 'Must offer 4 king defenses (Kg8, Kg6, Kh8, Kh6)');

    // 3. Walkthrough Branch 1: Kg8 -> Qh5 -> Re8, Bf5, Nf6
    dom.navigateToNode('branch-kg8');
    expect.match(dom.treeNodes.get('branch-kg8')!.comment!, /Пассивный отход/);

    dom.navigateToNode('14-qh5');
    const nodeQh5 = dom.treeNodes.get('14-qh5')!;
    expect.equal(nodeQh5.nag, '!');
    expect.equal(nodeQh5.children.length, 3, 'Must explore Re8, Bf5, Nf6 defenses');

    // 4. Walkthrough Branch 2: 14.Qd3! maneuver
    dom.navigateToNode('14-qd3');
    expect.equal(dom.treeNodes.get('14-qd3')!.nag, '!');
    expect.match(dom.treeNodes.get('14-qd3')!.comment!, /Вуковича/);

    // 5. Walkthrough Branch 3: Kg6 -> 14.h4!
    dom.navigateToNode('branch-kg6');
    expect.equal(dom.treeNodes.get('branch-kg6')!.nag, '!');
    expect.match(dom.treeNodes.get('branch-kg6')!.comment!, /Главное упорство/);

    dom.navigateToNode('14-h4');
    expect.equal(dom.treeNodes.get('14-h4')!.san, 'h4!');
    expect.deepEqual(dom.treeNodes.get('14-h4')!.arrows![0], ['h4', 'h5', 'green']);

    // 6. Walkthrough Marginal Branches: Kh8 (Corner) and Kh6 (Royal Fork)
    dom.navigateToNode('branch-kh8');
    expect.equal(dom.treeNodes.get('branch-kh8')!.nag, '?');

    dom.navigateToNode('branch-kh6');
    expect.equal(dom.treeNodes.get('branch-kh6')!.nag, '??');
    expect.match(dom.treeNodes.get('branch-kh6')!.comment!, /вилку/);
  });
});

runSuite();
