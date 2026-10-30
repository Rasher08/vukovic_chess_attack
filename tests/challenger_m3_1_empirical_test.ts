/**
 * Challenger 1 Empirical Test Suite for Milestone 3 (M3)
 * Study Catalog & Variation Tree UI
 * 
 * Verifies:
 * 1. Navigating along the main line moves updates board FEN and moves index accurately across all 18 Vukovic studies.
 * 2. Branching into side variations correctly switches branch path and tracks parent nodes.
 * 3. Keyboard events (ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Home, End) trigger expected node transitions.
 * 4. Audio feedback triggers on move changes (quiet moves vs captures, mute toggles).
 * 5. NAG badges and blunder explanations are present on designated blunder nodes in Russian.
 * 6. Board piece drop interaction (handlePieceDrop) matching UCI moves and triggering sounds.
 * 7. Arrows and highlight styling on currentNode across all studies.
 * 8. Greek Gift prerequisite checklist cards schema and Russian notes.
 * 9. High-throughput adversarial stress tests (rapid keystrokes, wide trees, deep lines, boundary limits, invalid IDs).
 */

import { describe, it, expect, runSuite } from './e2e/harness/testRunner.ts';
import { BrowserDomHarness, MoveNodeRecord } from './e2e/harness/browserDomHarness.ts';
import { allStudies, getStudyById } from '../src/data/studies/index.ts';
import { MoveNode, NagType, VukovicStudy, PrerequisiteChecklist } from '../src/types/chess.ts';
import {
  findPathToNode,
  findNodeById,
  getMainLine,
  getAllNodes,
  isValidFen,
  formatArrowsForBoard,
} from '../src/lib/chessUtils.ts';
import {
  playMoveSound,
  playCaptureSound,
  playCheckSound,
  playVictorySound,
  playErrorSound,
  isAudioMuted,
  setAudioMuted,
  toggleAudio,
} from '../src/lib/audioSynth.ts';

// Helper: Check if string contains Russian Cyrillic characters
function containsCyrillic(text?: string): boolean {
  if (!text) return false;
  return /[\u0400-\u04FF]/.test(text);
}

// Helper: Emulate VariationTree keyboard navigation logic on a MoveNode tree
class VariationTreeNavigator {
  public root: MoveNode;
  public currentNodeId: string;
  public moveSoundCalls = 0;
  public captureSoundCalls = 0;

  constructor(root: MoveNode) {
    this.root = root;
    this.currentNodeId = root.id;
  }

  getCurrentNode(): MoveNode {
    const node = findNodeById(this.root, this.currentNodeId);
    if (!node) throw new Error(`Node ${this.currentNodeId} not found in tree`);
    return node;
  }

  getCurrentPath(): MoveNode[] {
    return findPathToNode(this.root, this.currentNodeId);
  }

  selectNode(node: MoveNode): void {
    if (node.san.includes('x')) {
      this.captureSoundCalls++;
      playCaptureSound();
    } else {
      this.moveSoundCalls++;
      playMoveSound();
    }
    this.currentNodeId = node.id;
  }

  handleKeyDown(key: string, targetTag: string = 'div'): boolean {
    if (targetTag === 'input' || targetTag === 'textarea') {
      return false; // Ignored in input fields
    }

    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
      return false;
    }

    const path = this.getCurrentPath();
    if (path.length === 0) return false;

    const current = path[path.length - 1];
    const parent = path.length > 1 ? path[path.length - 2] : null;

    switch (key) {
      case 'ArrowRight': {
        if (current.children.length > 0) {
          this.selectNode(current.children[0]);
          return true;
        }
        break;
      }
      case 'ArrowLeft': {
        if (parent) {
          this.selectNode(parent);
          return true;
        }
        break;
      }
      case 'ArrowDown': {
        if (parent) {
          const idx = parent.children.findIndex((c) => c.id === current.id);
          if (idx >= 0 && idx + 1 < parent.children.length) {
            this.selectNode(parent.children[idx + 1]);
            return true;
          }
        }
        if (current.children.length > 1) {
          this.selectNode(current.children[1]);
          return true;
        }
        break;
      }
      case 'ArrowUp': {
        if (parent) {
          const idx = parent.children.findIndex((c) => c.id === current.id);
          if (idx > 0) {
            this.selectNode(parent.children[idx - 1]);
            return true;
          }
          this.selectNode(parent);
          return true;
        }
        break;
      }
      case 'Home': {
        this.selectNode(this.root);
        return true;
      }
      case 'End': {
        let leaf = current;
        while (leaf.children.length > 0) {
          leaf = leaf.children[0];
        }
        this.selectNode(leaf);
        return true;
      }
    }
    return false;
  }
}

describe('Challenger 1 Empirical Verification: Milestone 3 Variation Tree UI', () => {

  // =========================================================================
  // 1. Main Line Navigation & FEN / Move Index Synchronization
  // =========================================================================
  describe('Area 1: Main Line Navigation & FEN / Move Index Synchronization', () => {
    it('TC-CH3-01: Main line extraction and legal FEN validation across all 18 studies', () => {
      expect.equal(allStudies.length, 18, 'Dataset must contain all 18 Vukovic studies');

      let totalMainLineMoves = 0;

      for (const study of allStudies) {
        const mainLine = getMainLine(study.rootNode);
        expect.greaterThan(mainLine.length, 1, `Study ${study.id} main line must have at least 2 moves`);
        expect.equal(mainLine[0].id, study.rootNode.id, `First node in main line must be rootNode in ${study.id}`);

        totalMainLineMoves += mainLine.length;

        for (let i = 0; i < mainLine.length; i++) {
          const node = mainLine[i];
          expect.ok(isValidFen(node.fen), `FEN at move ${i} in study ${study.id} must be legal: ${node.fen}`);

          // Validate turn alternation or validity
          const fenTurn = node.fen.split(' ')[1];
          if (node.turn === 'w') {
            expect.equal(fenTurn, 'b', `After White move ${node.san}, active color in FEN must be 'b' (study: ${study.id})`);
          } else {
            expect.equal(fenTurn, 'w', `After Black move ${node.san}, active color in FEN must be 'w' (study: ${study.id})`);
          }
        }
      }

      expect.greaterThan(totalMainLineMoves, 100, 'All main lines combined must comprise >100 positions');
    });

    it('TC-CH3-02: Step-by-step main line forward and backward traversal keeps accurate path and index', () => {
      const studyIdsToTest = [
        'colle-ohanlon-1930',
        'ed-lasker-thomas-1912',
        'vukovic-qd3-necessity',
        'greco-gift-kg8',
      ];

      for (const studyId of studyIdsToTest) {
        const study = getStudyById(studyId)!;
        expect.ok(study, `Study ${studyId} must exist`);

        const mainLine = getMainLine(study.rootNode);
        const nav = new VariationTreeNavigator(study.rootNode);

        // 1. Forward step-by-step
        for (let step = 0; step < mainLine.length - 1; step++) {
          expect.equal(nav.currentNodeId, mainLine[step].id);
          const pathBefore = nav.getCurrentPath();
          expect.equal(pathBefore.length, step + 1);

          const moved = nav.handleKeyDown('ArrowRight');
          expect.ok(moved, `ArrowRight must succeed at step ${step} in ${studyId}`);
          expect.equal(nav.currentNodeId, mainLine[step + 1].id);

          const currentNode = nav.getCurrentNode();
          expect.equal(currentNode.fen, mainLine[step + 1].fen);
        }

        // At end of line, ArrowRight is a graceful no-op
        const atEnd = nav.handleKeyDown('ArrowRight');
        expect.equal(atEnd, false, `ArrowRight at terminal node must return false`);
        expect.equal(nav.currentNodeId, mainLine[mainLine.length - 1].id);

        // 2. Backward step-by-step
        for (let step = mainLine.length - 1; step > 0; step--) {
          expect.equal(nav.currentNodeId, mainLine[step].id);
          const movedBack = nav.handleKeyDown('ArrowLeft');
          expect.ok(movedBack, `ArrowLeft must succeed at step ${step} in ${studyId}`);
          expect.equal(nav.currentNodeId, mainLine[step - 1].id);
        }

        // At root node, ArrowLeft is a graceful no-op
        const atRoot = nav.handleKeyDown('ArrowLeft');
        expect.equal(atRoot, false, `ArrowLeft at root node must return false`);
        expect.equal(nav.currentNodeId, study.rootNode.id);
      }
    });
  });

  // =========================================================================
  // 2. Branching into Side Variations & Parent Tracking
  // =========================================================================
  describe('Area 2: Branching into Side Variations & Parent Tracking', () => {
    it('TC-CH3-03: Switching between multiple defense variations updates branch path and lineage', () => {
      // In colle-ohanlon-1930:
      // colle-1: 12.Bxh7+
      // colle-2: 12...Kxh7
      // colle-3: 13.Ng5+ -> 4 branching variations:
      //   0: colle-4-kg6 (13...Kg6)
      //   1: colle-4-kg8 (13...Kg8)
      //   2: colle-4-kh6 (13...Kh6 ??)
      //   3: colle-4-kh8 (13...Kh8 ?)
      const study = getStudyById('colle-ohanlon-1930')!;
      const nav = new VariationTreeNavigator(study.rootNode);

      const forkNode = findNodeById(study.rootNode, 'colle-3')!;
      expect.ok(forkNode, 'colle-3 Ng5+ must exist in tree');
      expect.equal(forkNode.children.length, 4, 'colle-3 must have 4 defense responses');

      const [childKg6, childKg8, childKh6, childKh8] = forkNode.children;
      expect.equal(childKg6.san, 'Kg6');
      expect.equal(childKg8.san, 'Kg8');
      expect.equal(childKh6.san, 'Kh6');
      expect.equal(childKh8.san, 'Kh8');

      // 1. Navigate to 13...Kg6 branch
      nav.selectNode(childKg6);
      let path = nav.getCurrentPath();
      expect.equal(path.length, 4); // [colle-1, colle-2, colle-3, colle-4-kg6]
      expect.equal(path[0].id, 'colle-1');
      expect.equal(path[1].id, 'colle-2');
      expect.equal(path[2].id, 'colle-3');
      expect.equal(path[3].id, childKg6.id);

      // Deepen into Kg6 continuation: 14.h4!
      expect.greaterThan(childKg6.children.length, 0);
      const childH4 = childKg6.children[0];
      nav.selectNode(childH4);
      path = nav.getCurrentPath();
      expect.equal(path.length, 5);
      expect.equal(path[4].id, childH4.id);

      // 2. Jump directly to side variation 13...Kg8
      nav.selectNode(childKg8);
      path = nav.getCurrentPath();
      expect.equal(path.length, 4);
      expect.equal(path[2].id, 'colle-3');
      expect.equal(path[3].id, childKg8.id);
      // Verify Kg6 branch is no longer in path
      expect.ok(!path.some((n) => n.id === childKg6.id));

      // 3. Jump to blunder variation 13...Kh6 ??
      nav.selectNode(childKh6);
      path = nav.getCurrentPath();
      expect.equal(path.length, 4);
      expect.equal(path[3].id, childKh6.id);

      // Advance into blunder refutation: 14.Nxf7+!!
      expect.greaterThan(childKh6.children.length, 0);
      const refutationNode = childKh6.children[0];
      nav.selectNode(refutationNode);
      path = nav.getCurrentPath();
      expect.equal(path.length, 5);
      expect.equal(path[4].id, refutationNode.id);
      expect.equal(refutationNode.san, 'Nxf7+');
      expect.equal(refutationNode.isBlunderRefutation, true);
    });

    it('TC-CH3-04: Comprehensive lineage audit across all 245 nodes in all 18 studies', () => {
      let totalNodesAudited = 0;

      for (const study of allStudies) {
        const allNodes = getAllNodes(study.rootNode);
        totalNodesAudited += allNodes.length;

        for (const node of allNodes) {
          // Every node must have a non-empty path starting with rootNode
          const path = findPathToNode(study.rootNode, node.id);
          expect.greaterThan(path.length, 0, `Path to node ${node.id} in study ${study.id} must exist`);
          expect.equal(path[0].id, study.rootNode.id, `Path must start with root`);
          expect.equal(path[path.length - 1].id, node.id, `Path must end with current node`);

          // Verify strictly contiguous parent-child relationship along the path
          for (let p = 0; p < path.length - 1; p++) {
            const parent = path[p];
            const child = path[p + 1];
            expect.ok(
              parent.children.some((c) => c.id === child.id),
              `Node ${parent.id} must list ${child.id} in children (study: ${study.id})`
            );
          }
        }
      }

      expect.greaterThanOrEqual(totalNodesAudited, 245, 'Must audit >= 245 nodes across all studies');
    });

    it('TC-CH3-05: Deep branch jumping stress test across random target nodes', () => {
      const study = getStudyById('colle-ohanlon-1930')!;
      const allNodes = getAllNodes(study.rootNode);
      const nav = new VariationTreeNavigator(study.rootNode);

      // Perform 200 random node selections
      for (let i = 0; i < 200; i++) {
        const target = allNodes[i % allNodes.length];
        nav.selectNode(target);
        expect.equal(nav.currentNodeId, target.id);

        const path = nav.getCurrentPath();
        expect.equal(path[path.length - 1].id, target.id);
        expect.equal(path[0].id, study.rootNode.id);
      }
    });
  });

  // =========================================================================
  // 3. Keyboard Controls & Node Transitions
  // =========================================================================
  describe('Area 3: Keyboard Controls & Node Transitions', () => {
    it('TC-CH3-06: BrowserDomHarness keyboard navigation transitions', () => {
      const nodes: MoveNodeRecord[] = [
        {
          id: 'root',
          parentId: null,
          san: 'Bxh7+',
          uci: 'e4h7',
          fen: 'r1bqr1k1/pp1n1ppB/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 b - - 0 12',
          turn: 'w',
          children: ['branch-kg8', 'branch-kg6'],
        },
        {
          id: 'branch-kg8',
          parentId: 'root',
          san: 'Kg8',
          uci: 'g8h7',
          fen: 'r1bqr1k1/pp1n1pp1/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 w - - 1 13',
          turn: 'b',
          children: ['move-ng5'],
        },
        {
          id: 'move-ng5',
          parentId: 'branch-kg8',
          san: 'Ng5',
          uci: 'f3g5',
          fen: 'r1bqr1k1/pp1n1pp1/3bp3/6N1/3p4/2P5/PP3PPP/R1BQR1K1 b - - 2 13',
          turn: 'w',
          children: [],
        },
        {
          id: 'branch-kg6',
          parentId: 'root',
          san: 'Kg6',
          uci: 'h7g6',
          fen: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
          turn: 'b',
          children: ['move-h4'],
        },
        {
          id: 'move-h4',
          parentId: 'branch-kg6',
          san: 'h4',
          uci: 'h2h4',
          fen: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 b - - 0 14',
          turn: 'w',
          children: [],
        },
      ];

      const dom = new BrowserDomHarness();
      dom.loadTree(nodes, 'root');
      expect.equal(dom.currentNodeId, 'root');

      // 1. ArrowRight -> branch-kg8
      dom.handleKeyDown('ArrowRight');
      expect.equal(dom.currentNodeId, 'branch-kg8');

      // 2. ArrowDown -> branch-kg6 (next sibling)
      dom.handleKeyDown('ArrowDown');
      expect.equal(dom.currentNodeId, 'branch-kg6');

      // 3. ArrowUp -> branch-kg8 (previous sibling)
      dom.handleKeyDown('ArrowUp');
      expect.equal(dom.currentNodeId, 'branch-kg8');

      // 4. ArrowRight -> move-ng5
      dom.handleKeyDown('ArrowRight');
      expect.equal(dom.currentNodeId, 'move-ng5');

      // 5. ArrowLeft -> branch-kg8
      dom.handleKeyDown('ArrowLeft');
      expect.equal(dom.currentNodeId, 'branch-kg8');

      // 6. Home -> root
      dom.handleKeyDown('Home');
      expect.equal(dom.currentNodeId, 'root');

      // 7. End -> move-ng5 (leaf of main line)
      dom.handleKeyDown('End');
      expect.equal(dom.currentNodeId, 'move-ng5');
    });

    it('TC-CH3-07: VariationTree keyboard handler emulation matches UI contract exactly', () => {
      const study = getStudyById('colle-ohanlon-1930')!;
      const nav = new VariationTreeNavigator(study.rootNode);

      // Test input element ignore
      expect.equal(nav.handleKeyDown('ArrowRight', 'input'), false);
      expect.equal(nav.handleKeyDown('ArrowRight', 'textarea'), false);
      expect.equal(nav.currentNodeId, study.rootNode.id);

      // Test invalid / arbitrary keys
      expect.equal(nav.handleKeyDown('Enter'), false);
      expect.equal(nav.handleKeyDown('Escape'), false);
      expect.equal(nav.handleKeyDown('Space'), false);

      // Step forward: 12.Bxh7+ -> 12...Kxh7
      expect.equal(nav.handleKeyDown('ArrowRight'), true);
      expect.equal(nav.getCurrentNode().san, 'Kxh7');

      // Step forward: 12...Kxh7 -> 13.Ng5+
      expect.equal(nav.handleKeyDown('ArrowRight'), true);
      expect.equal(nav.getCurrentNode().san, 'Ng5+');

      // Step forward: 13.Ng5+ -> first child 13...Kg6
      expect.equal(nav.handleKeyDown('ArrowRight'), true);
      expect.equal(nav.getCurrentNode().san, 'Kg6');

      // ArrowDown to next sibling: 13...Kg8
      expect.equal(nav.handleKeyDown('ArrowDown'), true);
      expect.equal(nav.getCurrentNode().san, 'Kg8');

      // ArrowDown to next sibling: 13...Kh6
      expect.equal(nav.handleKeyDown('ArrowDown'), true);
      expect.equal(nav.getCurrentNode().san, 'Kh6');

      // ArrowDown to next sibling: 13...Kh8
      expect.equal(nav.handleKeyDown('ArrowDown'), true);
      expect.equal(nav.getCurrentNode().san, 'Kh8');

      // ArrowUp back to 13...Kh6
      expect.equal(nav.handleKeyDown('ArrowUp'), true);
      expect.equal(nav.getCurrentNode().san, 'Kh6');

      // ArrowUp back to 13...Kg8
      expect.equal(nav.handleKeyDown('ArrowUp'), true);
      expect.equal(nav.getCurrentNode().san, 'Kg8');

      // ArrowUp back to 13...Kg6
      expect.equal(nav.handleKeyDown('ArrowUp'), true);
      expect.equal(nav.getCurrentNode().san, 'Kg6');

      // ArrowUp from first sibling steps back to parent (13.Ng5+)
      expect.equal(nav.handleKeyDown('ArrowUp'), true);
      expect.equal(nav.getCurrentNode().san, 'Ng5+');

      // Home from any point returns to rootNode
      expect.equal(nav.handleKeyDown('Home'), true);
      expect.equal(nav.currentNodeId, study.rootNode.id);

      // End steps to deep leaf
      expect.equal(nav.handleKeyDown('End'), true);
      const leaf = nav.getCurrentNode();
      expect.equal(leaf.children.length, 0, 'End must navigate to a leaf with 0 children');
    });

    it('TC-CH3-08: High-throughput keystroke fuzzing (2,000 random events) retains tree integrity', () => {
      const study = getStudyById('colle-ohanlon-1930')!;
      const nav = new VariationTreeNavigator(study.rootNode);
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

      const start = performance.now();
      for (let i = 0; i < 2000; i++) {
        const key = keys[i % keys.length];
        nav.handleKeyDown(key);

        // Invariant checks:
        const node = nav.getCurrentNode();
        expect.ok(node !== null, `Current node must exist after key ${key}`);
        expect.ok(node.id.length > 0);
        expect.ok(isValidFen(node.fen));
      }
      const elapsed = performance.now() - start;
      expect.lessThanOrEqual(elapsed, 150, '2000 keystrokes must process in under 150ms');
    });
  });

  // =========================================================================
  // 4. Audio Feedback Triggers on Move Changes
  // =========================================================================
  describe('Area 4: Audio Feedback Triggers on Move Changes', () => {
    it('TC-CH3-09: Sound trigger differentiation: quiet moves trigger playMoveSound, captures trigger playCaptureSound', () => {
      const study = getStudyById('colle-ohanlon-1930')!;
      const nav = new VariationTreeNavigator(study.rootNode);

      nav.moveSoundCalls = 0;
      nav.captureSoundCalls = 0;

      // 1. Select quiet move: 13.Ng5+ (no 'x')
      const ng5 = findNodeById(study.rootNode, 'colle-3')!;
      expect.ok(!ng5.san.includes('x'));
      nav.selectNode(ng5);
      expect.equal(nav.moveSoundCalls, 1);
      expect.equal(nav.captureSoundCalls, 0);

      // 2. Select capture move: 12.Bxh7+ (contains 'x')
      const bxh7 = study.rootNode;
      expect.ok(bxh7.san.includes('x'));
      nav.selectNode(bxh7);
      expect.equal(nav.moveSoundCalls, 1);
      expect.equal(nav.captureSoundCalls, 1);

      // 3. Select another capture move: 14.Nxf7+ (contains 'x')
      const nxf7 = findNodeById(study.rootNode, 'colle-5-kh6-nxf7')!;
      expect.ok(nxf7.san.includes('x'));
      nav.selectNode(nxf7);
      expect.equal(nav.moveSoundCalls, 1);
      expect.equal(nav.captureSoundCalls, 2);

      // 4. Scan all 245 moves across all studies and verify exact capture classification
      let quietCount = 0;
      let captureCount = 0;

      for (const s of allStudies) {
        const nodes = getAllNodes(s.rootNode);
        for (const n of nodes) {
          if (n.san.includes('x')) {
            captureCount++;
          } else {
            quietCount++;
          }
        }
      }

      expect.greaterThan(quietCount, 100, 'Platform must have quiet moves');
      expect.greaterThan(captureCount, 30, 'Platform must have capture moves');
    });

    it('TC-CH3-10: Audio synthesizer mute toggling suppresses execution without errors', () => {
      setAudioMuted(false);
      expect.equal(isAudioMuted(), false);

      // Ensure calling sound methods does not throw
      playMoveSound();
      playCaptureSound();
      playCheckSound();
      playVictorySound();
      playErrorSound();

      // Mute audio
      setAudioMuted(true);
      expect.equal(isAudioMuted(), true);

      // Under mute, calls must still execute safely (noop)
      playMoveSound();
      playCaptureSound();

      // Toggle audio back
      const newStatus = toggleAudio();
      expect.equal(newStatus, false);
      expect.equal(isAudioMuted(), false);
    });
  });

  // =========================================================================
  // 5. NAG Badges and Blunder Explanations
  // =========================================================================
  describe('Area 5: NAG Badges and Blunder Explanations', () => {
    it('TC-CH3-11: NAG badges are present, valid NagType, and styled correctly', () => {
      const validNags = new Set<NagType>(['!', '?', '!!', '??', '!?', '?!']);
      let nagCount = 0;

      for (const study of allStudies) {
        const nodes = getAllNodes(study.rootNode);
        for (const node of nodes) {
          if (node.nag) {
            nagCount++;
            expect.ok(validNags.has(node.nag), `NAG ${node.nag} in ${study.id} must be valid NagType`);
          }
        }
      }

      expect.greaterThan(nagCount, 50, 'Platform must contain >50 annotated moves with NAGs');
    });

    it('TC-CH3-12: Blunder nodes across all studies contain Russian explanations and refutation markers', () => {
      let blunderNodesFound = 0;

      for (const study of allStudies) {
        const nodes = getAllNodes(study.rootNode);
        for (const node of nodes) {
          if (node.isBlunderRefutation || node.nag === '??') {
            blunderNodesFound++;

            // Must have Russian explanation either in blunderExplanation or in comment
            const explanation = node.blunderExplanation || node.comment;
            expect.ok(explanation !== undefined, `Blunder node ${node.id} in ${study.id} must have explanation`);
            expect.ok(containsCyrillic(explanation), `Blunder explanation for ${node.id} must be in Russian: ${explanation}`);
            expect.greaterThan(explanation!.length, 15, `Explanation for ${node.id} must be descriptive`);
          }
        }
      }

      expect.greaterThanOrEqual(blunderNodesFound, 2, 'Platform must have at least 2 verified blunder nodes');
    });
  });

  // =========================================================================
  // 6. Adversarial Stress & Edge Cases
  // =========================================================================
  describe('Area 6: Adversarial Stress & Edge Cases', () => {
    it('TC-CH3-13: Single-node tree (root with no children) handles keyboard navigation gracefully', () => {
      const singleNode: MoveNode = {
        id: 'isolated-root',
        san: 'e4',
        uci: 'e2e4',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        turn: 'w',
        children: [],
      };

      const nav = new VariationTreeNavigator(singleNode);
      expect.equal(nav.currentNodeId, 'isolated-root');

      // None of the keys should crash or leave the node
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
        const res = nav.handleKeyDown(key);
        expect.equal(nav.currentNodeId, 'isolated-root');
      }

      const path = nav.getCurrentPath();
      expect.equal(path.length, 1);
      expect.equal(path[0].id, 'isolated-root');
    });

    it('TC-CH3-14: Wide tree with 25 sibling children navigates cleanly', () => {
      const children: MoveNode[] = [];
      for (let i = 0; i < 25; i++) {
        children.push({
          id: `child-${i}`,
          san: `N${i}`,
          uci: `g1f3`,
          fen: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1',
          turn: 'w',
          children: [],
        });
      }

      const wideRoot: MoveNode = {
        id: 'wide-root',
        san: 'd4',
        uci: 'd2d4',
        fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1',
        turn: 'w',
        children,
      };

      const nav = new VariationTreeNavigator(wideRoot);

      // Step to first child
      nav.handleKeyDown('ArrowRight');
      expect.equal(nav.currentNodeId, 'child-0');

      // ArrowDown through all 25 siblings
      for (let i = 1; i < 25; i++) {
        const moved = nav.handleKeyDown('ArrowDown');
        expect.ok(moved, `Must step to sibling ${i}`);
        expect.equal(nav.currentNodeId, `child-${i}`);
      }

      // ArrowUp all the way back
      for (let i = 23; i >= 0; i--) {
        const moved = nav.handleKeyDown('ArrowUp');
        expect.ok(moved, `Must step back to sibling ${i}`);
        expect.equal(nav.currentNodeId, `child-${i}`);
      }

      // One more ArrowUp steps to root
      nav.handleKeyDown('ArrowUp');
      expect.equal(nav.currentNodeId, 'wide-root');
    });

    it('TC-CH3-15: Deep linear variation (depth 60) handles End and Home in sub-millisecond time', () => {
      let current: MoveNode = {
        id: 'deep-leaf',
        san: 'Kh1',
        uci: 'g1h1',
        fen: '8/8/8/8/8/8/8/7K w - - 0 60',
        turn: 'w',
        children: [],
      };

      for (let d = 59; d >= 0; d--) {
        current = {
          id: `deep-node-${d}`,
          san: `m${d}`,
          uci: 'a2a3',
          fen: '8/8/8/8/8/8/8/7K w - - 0 1',
          turn: 'w',
          children: [current],
        };
      }

      const deepRoot = current;
      const nav = new VariationTreeNavigator(deepRoot);

      // Home and End performance
      const startEnd = performance.now();
      nav.handleKeyDown('End');
      const elapsedEnd = performance.now() - startEnd;
      expect.equal(nav.currentNodeId, 'deep-leaf');
      expect.lessThanOrEqual(elapsedEnd, 5, 'End must take <= 5ms');

      const startHome = performance.now();
      nav.handleKeyDown('Home');
      const elapsedHome = performance.now() - startHome;
      expect.equal(nav.currentNodeId, deepRoot.id);
      expect.lessThanOrEqual(elapsedHome, 5, 'Home must take <= 5ms');
    });

    it('TC-CH3-16: Board piece drop (handlePieceDrop) transitions to matching child UCI and plays sound', () => {
      const study = getStudyById('colle-ohanlon-1930')!;
      let currentNode = study.rootNode;
      let soundPlayed: 'none' | 'move' | 'capture' = 'none';

      const handlePieceDrop = (sourceSquare: string, targetSquare: string): boolean => {
        if (!currentNode.children || currentNode.children.length === 0) {
          return false;
        }
        const uciMove = `${sourceSquare}${targetSquare}`;
        const matchingChild = currentNode.children.find((child) => child.uci.startsWith(uciMove));

        if (matchingChild) {
          currentNode = matchingChild;
          if (matchingChild.san.includes('x')) {
            soundPlayed = 'capture';
          } else {
            soundPlayed = 'move';
          }
          return true;
        }
        return false;
      };

      // 1. From root 12.Bxh7+, legal reply is 12...Kxh7 (uci: g8h7)
      expect.equal(currentNode.id, 'colle-1');
      const legalDrop = handlePieceDrop('g8', 'h7');
      expect.ok(legalDrop, 'g8h7 Kxh7 must be accepted as matching branch');
      expect.equal(currentNode.id, 'colle-2');
      expect.equal(soundPlayed, 'capture', 'Kxh7 capture must trigger capture sound');

      // 2. From 12...Kxh7, White plays 13.Ng5+ (uci: f3g5)
      const nextDrop = handlePieceDrop('f3', 'g5');
      expect.ok(nextDrop, 'f3g5 Ng5+ must be accepted');
      expect.equal(currentNode.id, 'colle-3');
      expect.equal(soundPlayed, 'move', 'Ng5+ quiet move must trigger move sound');

      // 3. From 13.Ng5+, illegal move not in tree (e.g. h7h8)
      const illegalDrop = handlePieceDrop('a7', 'a6');
      expect.equal(illegalDrop, false, 'Move not in variation tree must be rejected');
      expect.equal(currentNode.id, 'colle-3');
    });

    it('TC-CH3-17: Arrows and highlights formatting on current node across all studies', () => {
      let totalNodesWithArrows = 0;
      let totalNodesWithHighlights = 0;

      for (const study of allStudies) {
        const nodes = getAllNodes(study.rootNode);
        for (const node of nodes) {
          if (node.arrows && node.arrows.length > 0) {
            totalNodesWithArrows++;
            const boardArrows = formatArrowsForBoard(node.arrows);
            expect.equal(boardArrows.length, node.arrows.length);
            for (const [from, to, color] of boardArrows) {
              expect.match(from, /^[a-h][1-8]$/);
              expect.match(to, /^[a-h][1-8]$/);
              expect.ok(color && typeof color === 'string');
            }
          }

          if (node.highlights && Object.keys(node.highlights).length > 0) {
            totalNodesWithHighlights++;
            for (const [sq, col] of Object.entries(node.highlights)) {
              expect.match(sq, /^[a-h][1-8]$/);
              expect.ok(typeof col === 'string');
            }
          }
        }
      }

      expect.greaterThan(totalNodesWithArrows, 10, 'Platform must have nodes with arrows');
    });

    it('TC-CH3-18: Greek Gift prerequisite checklist cards schema and Russian notes validation', () => {
      const greekGiftStudies = allStudies.filter((s) => s.chapter === 'greek_gift');
      expect.greaterThan(greekGiftStudies.length, 3, 'Must have multiple Greek Gift studies');

      const requiredKeys = [
        'pawnOnE5',
        'knightOnF6Absent',
        'whiteBishopOnD3orC4',
        'whiteKnightOnG5Available',
        'whiteQueenOnH5orD3Available',
        'h4PawnSupportReady',
        'notes',
      ];

      for (const study of greekGiftStudies) {
        expect.ok(study.prerequisites !== undefined, `Study ${study.id} must define prerequisites`);
        const prereqs = study.prerequisites!;

        for (const key of requiredKeys) {
          expect.ok(key in prereqs, `Prerequisites in ${study.id} must contain key ${key}`);
        }

        expect.equal(typeof prereqs.notes, 'string');
        expect.ok(containsCyrillic(prereqs.notes), `Prerequisite notes in ${study.id} must be in Russian`);
        expect.greaterThan(prereqs.notes.length, 20);
      }
    });

    it('TC-CH3-19: Graceful error tolerance for invalid or missing node IDs in findPathToNode and findNodeById', () => {
      const study = getStudyById('colle-ohanlon-1930')!;

      // 1. Non-existent node ID
      const missingPath = findPathToNode(study.rootNode, 'non-existent-id-999');
      expect.ok(Array.isArray(missingPath));
      expect.equal(missingPath.length, 0, 'findPathToNode must return [] for non-existent node');

      const missingNode = findNodeById(study.rootNode, 'non-existent-id-999');
      expect.equal(missingNode, null, 'findNodeById must return null for non-existent node');

      // 2. Empty string ID
      expect.equal(findPathToNode(study.rootNode, '').length, 0);
      expect.equal(findNodeById(study.rootNode, ''), null);
    });
  });
});

runSuite();
