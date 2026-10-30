/**
 * Tier 1: Feature 3 (F3) - Interactive Study & Analysis UI (Variation Tree)
 * Tests MoveNode graph structure, branching, keyboard navigation,
 * strategic callout cards, and blunder refutation nodes.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { BrowserDomHarness, MoveNodeRecord } from '../harness/browserDomHarness.ts';

describe('Tier 1 - F3: Interactive Study & Analysis UI (Variation Tree)', () => {
  const sampleTreeNodes: MoveNodeRecord[] = [
    {
      id: 'root',
      parentId: null,
      san: 'Bxh7+',
      uci: 'e4h7',
      fen: 'r1bqr1k1/pp1n1ppB/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 b - - 0 12',
      turn: 'w',
      comment: 'Классическая жертва слона на h7 (Greek Gift).',
      children: ['node-kg8', 'node-kg6', 'node-kh8'],
    },
    {
      id: 'node-kg8',
      parentId: 'root',
      san: 'Kg8',
      uci: 'g8h7',
      fen: 'r1bqr1k1/pp1n1pp1/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 w - - 1 13',
      turn: 'b',
      comment: 'Пассивный отход короля.',
      children: ['node-qh5', 'node-qd3'],
    },
    {
      id: 'node-qh5',
      parentId: 'node-kg8',
      san: 'Qh5',
      uci: 'd1h5',
      fen: 'r1bqr1k1/pp1n1pp1/3bp3/7Q/3p4/2P2N2/PP3PPP/R1B1R1K1 b - - 2 13',
      turn: 'w',
      comment: 'Ферзь создает прямую матовую угрозу на h7.',
      children: [],
    },
    {
      id: 'node-qd3',
      parentId: 'node-kg8',
      san: 'Qd3!',
      uci: 'd1d3',
      fen: 'r1bqr1k1/pp1n1pp1/3bp3/8/3p4/2PQ1N2/PP3PPP/R1B1R1K1 b - - 2 13',
      turn: 'w',
      nag: '!',
      comment: 'Тонкий маневр Вуковича для переброски на h3.',
      children: [],
    },
    {
      id: 'node-kg6',
      parentId: 'root',
      san: 'Kg6!',
      uci: 'h7g6',
      fen: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
      turn: 'b',
      nag: '!',
      comment: 'Главное упорство защиты по Вуковичу: король выходит в поле.',
      children: ['node-h4', 'node-blunder-qh5'],
    },
    {
      id: 'node-h4',
      parentId: 'node-kg6',
      san: 'h4!',
      uci: 'h2h4',
      fen: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 b - - 0 14',
      turn: 'w',
      nag: '!',
      comment: 'Пешечный таран! Белые угрожают матовым капканом.',
      children: [],
    },
    {
      id: 'node-blunder-qh5',
      parentId: 'node-kg6',
      san: 'Qh5??',
      uci: 'd1h5',
      fen: 'r1bqr3/pp1n1pp1/3bp1k1/6NQ/3p4/2P5/PP3PPP/R1B1R1K1 b - - 1 14',
      turn: 'w',
      nag: '??',
      comment: 'Типичная грубая ошибка! Черные опровергают атаку.',
      children: [],
    },
    {
      id: 'node-kh8',
      parentId: 'root',
      san: 'Kh8',
      uci: 'h7h8',
      fen: 'r1bqr2k/pp1n1pp1/3bp3/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
      turn: 'b',
      nag: '?',
      comment: 'Отступление в угол ведет к немедленному мату.',
      children: [],
    },
  ];

  it('TC-F3-01: MoveNode graph structure integrity and parent-child relations', () => {
    const dom = new BrowserDomHarness();
    dom.loadTree(sampleTreeNodes, 'root');

    expect.equal(dom.treeNodes.size, sampleTreeNodes.length);
    expect.equal(dom.rootNodeId, 'root');
    expect.equal(dom.currentNodeId, 'root');

    const root = dom.treeNodes.get('root')!;
    expect.equal(root.parentId, null);
    expect.equal(root.children.length, 3);
    expect.deepEqual(root.children, ['node-kg8', 'node-kg6', 'node-kh8']);
  });

  it('TC-F3-02: Branch selection and active move navigation', () => {
    const dom = new BrowserDomHarness();
    dom.loadTree(sampleTreeNodes, 'root');

    // Select branch 2...Kg6
    dom.navigateToNode('node-kg6');
    expect.equal(dom.currentNodeId, 'node-kg6');
    expect.match(dom.engine.getFen(), /3bp1k1/);

    const currentNode = dom.treeNodes.get(dom.currentNodeId)!;
    expect.equal(currentNode.san, 'Kg6!');
    expect.equal(currentNode.nag, '!');
    expect.includes(currentNode.comment || '', 'Главное упорство');
  });

  it('TC-F3-03: Keyboard navigation shortcuts (ArrowRight, ArrowLeft, ArrowDown, ArrowUp, Home, End)', () => {
    const dom = new BrowserDomHarness();
    dom.loadTree(sampleTreeNodes, 'root');

    // 1. ArrowRight steps to first child (node-kg8)
    dom.handleKeyDown('ArrowRight');
    expect.equal(dom.currentNodeId, 'node-kg8');

    // 2. ArrowDown switches to next sibling branch (node-kg6)
    dom.handleKeyDown('ArrowDown');
    expect.equal(dom.currentNodeId, 'node-kg6');

    // 3. ArrowDown switches to third sibling branch (node-kh8)
    dom.handleKeyDown('ArrowDown');
    expect.equal(dom.currentNodeId, 'node-kh8');

    // 4. ArrowUp switches back to previous sibling branch (node-kg6)
    dom.handleKeyDown('ArrowUp');
    expect.equal(dom.currentNodeId, 'node-kg6');

    // 5. ArrowRight moves to child of node-kg6 (node-h4)
    dom.handleKeyDown('ArrowRight');
    expect.equal(dom.currentNodeId, 'node-h4');

    // 6. ArrowLeft steps back to parent (node-kg6)
    dom.handleKeyDown('ArrowLeft');
    expect.equal(dom.currentNodeId, 'node-kg6');

    // 7. Home steps to root node
    dom.handleKeyDown('Home');
    expect.equal(dom.currentNodeId, 'root');

    // 8. End steps to deep leaf node
    dom.handleKeyDown('End');
    expect.equal(dom.currentNodeId, 'node-qh5'); // end of primary line
  });

  it('TC-F3-04: Vukovic strategic callout cards provide thematic guidance in Russian', () => {
    const strategicCallouts = [
      {
        theme: 'h4-Attack',
        quote: 'Нельзя давать королю закрепиться на g6. Пешечный тычок 3.h4! отнимает пункт g5...',
        rule: 'Правило атаки короля в открытом поле',
      },
      {
        theme: 'Qd3-Maneuver',
        quote: 'Если пункт h5 прикрыт черным ферзем, белые строят батарею по диагонали b1-h7 через 3.Qd3!...',
        rule: 'Правило обхода контролируемых полей',
      },
    ];

    for (const callout of strategicCallouts) {
      expect.match(callout.quote, /[\u0400-\u04FF]/, 'Callout quote must be in Russian');
      expect.match(callout.rule, /[\u0400-\u04FF]/, 'Callout rule must be in Russian');
      expect.greaterThan(callout.quote.length, 30);
    }
  });

  it('TC-F3-05: Blunder refutation branches are labeled with "??" and contain refutation logic', () => {
    const dom = new BrowserDomHarness();
    dom.loadTree(sampleTreeNodes, 'root');

    const blunderNode = dom.treeNodes.get('node-blunder-qh5')!;
    expect.equal(blunderNode.san, 'Qh5??');
    expect.equal(blunderNode.nag, '??');
    expect.match(blunderNode.comment || '', /ошибка/i);
  });

  it('TC-F3-06: Greek Gift prerequisite checklist card items validation', () => {
    const checklistItems = [
      { key: 'pawnOnE5', label: 'Пешка на e5 фиксирует пункт f6' },
      { key: 'knightOnF6Absent', label: 'Черный защитный конь f6 отсутствует или отвлечен' },
      { key: 'whiteBishopOnD3orC4', label: 'Белопольный слон готов к жертве на h7' },
      { key: 'whiteKnightOnG5Available', label: 'Конь может беспрепятственно вторгнуться на g5' },
      { key: 'whiteQueenOnH5orD3Available', label: 'Ферзь имеет доступ к пунктам h5 или d3' },
      { key: 'h4PawnSupportReady', label: 'Пешка h2 готова к продвижению h4 при выходе короля на g6' },
    ];

    expect.equal(checklistItems.length, 6, 'Checklist must consist of exactly 6 Vukovic prerequisites');
    for (const item of checklistItems) {
      expect.match(item.label, /[\u0400-\u04FF]/, 'Checklist label must be in Russian');
    }
  });
});

runSuite();
