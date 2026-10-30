/**
 * Challenger 2 Empirical Test Suite for Milestone 3 (M3: Study Catalog & Variation Tree UI)
 * 
 * Empirically stress-tests:
 * 1. Build pipeline & static route coverage (SSG: '/' and all 18 '/study/[id]' pages in .next/server/app/)
 * 2. Study dataset completeness and React component loading integrity (zero missing props/imports)
 * 3. Prerequisite checklist evaluation across all studies (true/false indicators, isPerfect boundary conditions)
 * 4. Dynamic metadata generation and pre-rendered HTML metadata verification (title and chapter name)
 * 5. Adversarial stress & boundary tests: invalid IDs, prototype pollution, tree search edge cases,
 *    corrupted checklist objects, and variation tree depth/branching invariants.
 */

import { describe, it, expect, runSuite } from './e2e/harness/testRunner.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Chess } from 'chess.js';

import {
  allStudies,
  getStudyById,
  getAllStudyIds,
  getStudiesByChapter,
  getAllStudySummaries,
} from '../src/data/studies/index.ts';
import { CHAPTERS, getCatalogStats } from '../src/data/catalog.ts';
import { generateStaticParams, generateMetadata } from '../src/app/study/[id]/page.tsx';
import {
  findPathToNode,
  findNodeById,
  formatArrowsForBoard,
  VUKOVIC_ARROW_PALETTE,
} from '../src/lib/chessUtils.ts';
import { MoveNode, VukovicStudy, PrerequisiteChecklist } from '../src/types/chess.ts';

// Component imports to verify zero missing dependencies / broken imports
import StudyCard from '../src/components/catalog/StudyCard.tsx';
import ChapterSection from '../src/components/catalog/ChapterSection.tsx';
import PrerequisiteCard from '../src/components/study/PrerequisiteCard.tsx';
import StrategicCallout from '../src/components/study/StrategicCallout.tsx';
import MoveNavigation from '../src/components/study/MoveNavigation.tsx';
import VariationTree from '../src/components/study/VariationTree.tsx';
import { StudyHeader, StudyViewLayout } from '../src/components/study/StudyHeader.tsx';

const PROJECT_ROOT = path.resolve(process.cwd());
const APP_SERVER_DIR = path.join(PROJECT_ROOT, '.next', 'server', 'app');
const STUDY_SERVER_DIR = path.join(APP_SERVER_DIR, 'study');

describe('Challenger M3 Suite 1: Build Pipeline & Static Route Coverage', () => {
  it('TC-CHAL-01: Next.js build output directory exists and contains root page', () => {
    expect.ok(fs.existsSync(APP_SERVER_DIR), '.next/server/app directory must exist after build');
    const rootHtml = path.join(APP_SERVER_DIR, 'index.html');
    const rootPageHtml = path.join(APP_SERVER_DIR, 'page.html');
    const rootExists = fs.existsSync(rootHtml) || fs.existsSync(rootPageHtml);
    expect.ok(rootExists, 'Static pre-rendered root route (/) must exist in build output');

    const contentPath = fs.existsSync(rootHtml) ? rootHtml : rootPageHtml;
    const content = fs.readFileSync(contentPath, 'utf8');
    expect.match(content, /<!DOCTYPE html>/i, 'Root page must contain <!DOCTYPE html>');
    expect.match(content, /<html[^>]*lang="ru"/i, 'Root page must specify lang="ru"');
    expect.match(content, /Вукович/i, 'Root page must mention Vukovic in Russian');
  });

  it('TC-CHAL-02: generateStaticParams returns exactly 18 study route parameters', () => {
    const params = generateStaticParams();
    expect.equal(params.length, 18, 'generateStaticParams must return exactly 18 routes');

    const idsFromParams = params.map((p) => p.id);
    const uniqueIds = new Set(idsFromParams);
    expect.equal(uniqueIds.size, 18, 'All static route IDs must be unique (no duplicates)');

    const expectedIds = getAllStudyIds();
    expect.equal(expectedIds.length, 18);
    for (const id of expectedIds) {
      expect.ok(uniqueIds.has(id), `Missing static param for study id: ${id}`);
    }
  });

  it('TC-CHAL-03: Every one of the 18 studies has a pre-rendered HTML file in .next/server/app/study/', () => {
    expect.ok(fs.existsSync(STUDY_SERVER_DIR), '.next/server/app/study directory must exist');

    const studyIds = getAllStudyIds();
    for (const id of studyIds) {
      const htmlPath = path.join(STUDY_SERVER_DIR, `${id}.html`);
      expect.ok(fs.existsSync(htmlPath), `Pre-rendered HTML file must exist for study: ${id} at ${htmlPath}`);

      const stat = fs.statSync(htmlPath);
      expect.greaterThan(stat.size, 10000, `Study HTML file ${id}.html must be substantial (>10KB), got ${stat.size} bytes`);

      // Verify RSC and meta companion files
      const rscPath = path.join(STUDY_SERVER_DIR, `${id}.rsc`);
      const metaPath = path.join(STUDY_SERVER_DIR, `${id}.meta`);
      expect.ok(fs.existsSync(rscPath), `RSC payload file must exist for study: ${id}`);
      expect.ok(fs.existsSync(metaPath), `Next.js route metadata file must exist for study: ${id}`);
    }
  });

  it('TC-CHAL-04: Static pre-rendered HTML contains genuine semantic structure and Russian content', () => {
    const studyIds = getAllStudyIds();
    for (const id of studyIds) {
      const study = getStudyById(id)!;
      const htmlPath = path.join(STUDY_SERVER_DIR, `${id}.html`);
      const html = fs.readFileSync(htmlPath, 'utf8');

      // Title tag must match study title
      expect.includes(html, study.title, `HTML for ${id} must contain study title: ${study.title}`);

      // Accessibility roles
      expect.includes(html, 'role="toolbar"', `HTML for ${id} must have move navigation toolbar`);
      expect.includes(html, 'role="region"', `HTML for ${id} must have variation tree region`);

      // Russian terminology
      expect.includes(html, 'Дерево вариантов', `HTML for ${id} must contain Russian variation tree header`);
      expect.includes(html, 'Каталог', `HTML for ${id} must contain Russian breadcrumb link`);
    }
  });
});

describe('Challenger M3 Suite 2: Study Catalog & Component Integrity', () => {
  it('TC-CHAL-05: All 18 studies have strictly valid types, non-empty fields, and no undefined props', () => {
    expect.equal(allStudies.length, 18, 'Dataset must have exactly 18 studies');

    const validDifficulties = new Set([1800, 2000, 2200]);
    const validChapters = new Set(['greek_gift', 'rook_lift', 'pawn_demolition', 'king_hunt']);

    for (const study of allStudies) {
      expect.ok(study.id && typeof study.id === 'string', 'Study ID must be non-empty string');
      expect.match(study.id, /^[a-z0-9-]+$/, `Study ID "${study.id}" must be kebab-case`);
      expect.ok(study.title && typeof study.title === 'string', `${study.id}: title must be string`);
      expect.ok(study.white && typeof study.white === 'string', `${study.id}: white must be string`);
      expect.ok(study.black && typeof study.black === 'string', `${study.id}: black must be string`);
      expect.ok(validChapters.has(study.chapter), `${study.id}: invalid chapter ${study.chapter}`);
      expect.ok(study.chapterTitle && typeof study.chapterTitle === 'string', `${study.id}: chapterTitle missing`);
      expect.ok(validDifficulties.has(study.difficulty), `${study.id}: invalid difficulty ${study.difficulty}`);
      expect.ok(Array.isArray(study.tags) && study.tags.length > 0, `${study.id}: tags must be non-empty array`);
      expect.ok(study.description && typeof study.description === 'string', `${study.id}: description missing`);
      expect.ok(typeof study.calculationTargetPlies === 'number' && study.calculationTargetPlies >= 3, `${study.id}: target plies >= 3`);

      // Verify FEN legality
      const chessInitial = new Chess(study.initialFen);
      expect.ok(chessInitial, `${study.id}: initialFen must be valid FEN`);

      const chessRoot = new Chess(study.rootNode.fen);
      expect.ok(chessRoot, `${study.id}: rootNode.fen must be valid FEN`);
    }
  });

  it('TC-CHAL-06: Catalog statistics and chapter distribution match curriculum design', () => {
    const stats = getCatalogStats();
    expect.equal(stats.totalStudies, 18, 'Total studies in catalog must be 18');
    expect.equal(stats.totalChapters, 4, 'Total chapters in catalog must be 4');
    expect.equal(CHAPTERS.length, 4, 'CHAPTERS constant must define 4 chapters');

    const greekGiftStudies = getStudiesByChapter('greek_gift');
    const rookLiftStudies = getStudiesByChapter('rook_lift');
    const pawnDemolitionStudies = getStudiesByChapter('pawn_demolition');
    const kingHuntStudies = getStudiesByChapter('king_hunt');

    expect.equal(greekGiftStudies.length, 5, 'Chapter 1 (Greek Gift) must have 5 studies');
    expect.equal(rookLiftStudies.length, 5, 'Chapter 2 (Rook Lift) must have 5 studies');
    expect.equal(pawnDemolitionStudies.length, 4, 'Chapter 3 (Pawn Demolition) must have 4 studies');
    expect.equal(kingHuntStudies.length, 4, 'Chapter 4 (King Hunt) must have 4 studies');

    const sum = greekGiftStudies.length + rookLiftStudies.length + pawnDemolitionStudies.length + kingHuntStudies.length;
    expect.equal(sum, 18, 'Sum of chapter studies must equal 18');
  });

  it('TC-CHAL-07: MoveNode variation trees have zero broken pointers or circular references', () => {
    let totalNodesVisited = 0;

    for (const study of allStudies) {
      const visitedIds = new Set<string>();

      function traverse(node: MoveNode, depth: number) {
        expect.ok(!visitedIds.has(node.id), `Duplicate or cyclic node ID detected: ${node.id} in ${study.id}`);
        visitedIds.add(node.id);
        totalNodesVisited++;

        expect.ok(node.san && typeof node.san === 'string', `Node ${node.id} has invalid SAN`);
        expect.ok(node.fen && typeof node.fen === 'string', `Node ${node.id} has invalid FEN`);
        expect.ok(node.turn === 'w' || node.turn === 'b', `Node ${node.id} has invalid turn`);
        expect.ok(Array.isArray(node.children), `Node ${node.id} children must be array`);

        // Check NAG if present
        if (node.nag) {
          expect.includes(['!', '?', '!!', '??', '!?', '?!'], node.nag, `Node ${node.id} has invalid NAG: ${node.nag}`);
        }

        // Check arrows if present
        if (node.arrows && node.arrows.length > 0) {
          const formatted = formatArrowsForBoard(node.arrows);
          expect.equal(formatted.length, node.arrows.length, `Arrows format length mismatch in ${node.id}`);
        }

        for (const child of node.children) {
          traverse(child, depth + 1);
        }
      }

      traverse(study.rootNode, 0);
    }

    expect.equal(totalNodesVisited, 245, 'Variation trees across all 18 studies must contain exactly 245 nodes');
  });

  it('TC-CHAL-08: Component exports and prop interfaces are valid and render server-side without errors', () => {
    expect.equal(typeof StudyCard, 'function', 'StudyCard must be a React functional component');
    expect.equal(typeof ChapterSection, 'function', 'ChapterSection must be a React functional component');
    expect.equal(typeof PrerequisiteCard, 'function', 'PrerequisiteCard must be a React functional component');
    expect.equal(typeof StrategicCallout, 'function', 'StrategicCallout must be a React functional component');
    expect.equal(typeof MoveNavigation, 'function', 'MoveNavigation must be a React functional component');
    expect.equal(typeof VariationTree, 'function', 'VariationTree must be a React functional component');
    expect.equal(typeof StudyHeader, 'function', 'StudyHeader must be a React functional component');
    expect.equal(typeof StudyViewLayout, 'function', 'StudyViewLayout must be a React functional component');

    // Test SSR rendering across all 18 studies using StudyViewLayout
    for (const study of allStudies) {
      const html = renderToString(React.createElement(StudyViewLayout, { study }));
      expect.ok(html && html.length > 10000, `StudyViewLayout for ${study.id} must render valid HTML`);
      const escapedTitle = study.title.replace(/'/g, '&#x27;');
      expect.includes(html, escapedTitle, `Rendered HTML must include study title for ${study.id}`);
    }
  });
});

describe('Challenger M3 Suite 3: Prerequisite Checklist Logic & Truth Value Evaluation', () => {
  const studiesWithPrereqs = allStudies.filter((s) => Boolean(s.prerequisites));

  it('TC-CHAL-09: Exactly 5 Greek Gift studies define prerequisite checklists', () => {
    expect.equal(studiesWithPrereqs.length, 5, 'Exactly 5 studies in dataset must have prerequisites defined');
    for (const study of studiesWithPrereqs) {
      expect.equal(study.chapter, 'greek_gift', `Prerequisites must only belong to Greek Gift chapter, found: ${study.chapter}`);
      expect.ok(study.prerequisites, `Study ${study.id} must define prerequisites`);
    }
  });

  it('TC-CHAL-10: All 6 boolean conditions and author notes are strictly validated per study', () => {
    const keys: (keyof Omit<PrerequisiteChecklist, 'notes'>)[] = [
      'pawnOnE5',
      'knightOnF6Absent',
      'whiteBishopOnD3orC4',
      'whiteKnightOnG5Available',
      'whiteQueenOnH5orD3Available',
      'h4PawnSupportReady',
    ];

    for (const study of studiesWithPrereqs) {
      const p = study.prerequisites!;
      for (const k of keys) {
        expect.equal(typeof p[k], 'boolean', `${study.id}: prerequisite ${k} must be boolean, got ${typeof p[k]}`);
      }
      expect.ok(p.notes && typeof p.notes === 'string', `${study.id}: prerequisite notes must be non-empty string`);
      expect.greaterThan(p.notes.length, 10, `${study.id}: notes must be substantive`);
    }
  });

  it('TC-CHAL-11: Prerequisite satisfaction counter and isPerfect evaluation are mathematically exact', () => {
    const keys: (keyof Omit<PrerequisiteChecklist, 'notes'>)[] = [
      'pawnOnE5',
      'knightOnF6Absent',
      'whiteBishopOnD3orC4',
      'whiteKnightOnG5Available',
      'whiteQueenOnH5orD3Available',
      'h4PawnSupportReady',
    ];

    // Colle - O'Hanlon (1930): pawnOnE5 is false, others are true -> 5/6 (isPerfect = false)
    const colle = getStudyById('colle-ohanlon-1930')!;
    const colleSatisfied = keys.filter((k) => colle.prerequisites![k]).length;
    expect.equal(colleSatisfied, 5, 'Colle study must have exactly 5 satisfied conditions');
    expect.equal(colle.prerequisites!.pawnOnE5, false, 'Colle has pawnOnE5=false');
    expect.equal(colleSatisfied === 6, false, 'Colle must not be perfect 6/6');

    // Greco Gift Kg8 (1619): h4PawnSupportReady is false, others true -> 5/6 (isPerfect = false)
    const greco = getStudyById('greco-gift-kg8')!;
    const grecoSatisfied = keys.filter((k) => greco.prerequisites![k]).length;
    expect.equal(grecoSatisfied, 5, 'Greco study must have exactly 5 satisfied conditions');
    expect.equal(greco.prerequisites!.h4PawnSupportReady, false, 'Greco has h4PawnSupportReady=false');

    // Vukovic Qd3 Necessity: h4PawnSupportReady is false -> 5/6 (isPerfect = false)
    const qd3 = getStudyById('vukovic-qd3-necessity')!;
    const qd3Satisfied = keys.filter((k) => qd3.prerequisites![k]).length;
    expect.equal(qd3Satisfied, 5, 'Vukovic Qd3 study must have 5 satisfied conditions');

    // Vukovic Kg6 Refutation: all 6 conditions are TRUE -> 6/6 (isPerfect = true)
    const kg6 = getStudyById('vukovic-kg6-refutation')!;
    const kg6Satisfied = keys.filter((k) => kg6.prerequisites![k]).length;
    expect.equal(kg6Satisfied, 6, 'Vukovic Kg6 refutation study must satisfy all 6 conditions');
    expect.equal(kg6Satisfied === 6, true, 'Vukovic Kg6 study must evaluate to isPerfect=true');

    // Vukovic Failed Checklist: pawnOnE5=false, knightOnF6Absent=false, h4PawnSupportReady=false -> 3/6
    const failedCheck = getStudyById('vukovic-failed-checklist')!;
    const failedSatisfied = keys.filter((k) => failedCheck.prerequisites![k]).length;
    expect.equal(failedSatisfied, 3, 'Failed checklist study must have exactly 3 satisfied conditions');
    expect.equal(failedCheck.prerequisites!.pawnOnE5, false);
    expect.equal(failedCheck.prerequisites!.knightOnF6Absent, false);
    expect.equal(failedCheck.prerequisites!.h4PawnSupportReady, false);
  });

  it('TC-CHAL-12: PrerequisiteCard renders true/false indicators, warning badges, and notes correctly', () => {
    // 1. Study with missing prerequisites (Colle: 5/6, pawnOnE5=false)
    const colle = getStudyById('colle-ohanlon-1930')!;
    const colleHtml = renderToString(React.createElement(PrerequisiteCard, { prerequisites: colle.prerequisites }));
    // React server render outputs text node comments between expressions: 5<!-- --> / 6 условий
    expect.ok(colleHtml.includes('5 / 6 условий') || colleHtml.includes('5<!-- --> / 6 условий'), 'Colle card must display 5 / 6 условий');
    expect.includes(colleHtml, 'Внимание: жертва слона некорректна', 'Colle card must display warning on imperfect checklist');
    expect.includes(colleHtml, 'Пешка на e5 фиксирует пункт f6', 'Must list pawnOnE5 label');
    expect.includes(colleHtml, 'Отсутствует или не подготовлено!', 'Must display failure notice for false condition');
    expect.includes(colleHtml, colle.prerequisites!.notes, 'Must render author notes');

    // 2. Study with all 6 satisfied prerequisites (vukovic-kg6-refutation)
    const kg6 = getStudyById('vukovic-kg6-refutation')!;
    const kg6Html = renderToString(React.createElement(PrerequisiteCard, { prerequisites: kg6.prerequisites }));
    expect.ok(kg6Html.includes('6 / 6 условий') || kg6Html.includes('6<!-- --> / 6 условий'), 'Kg6 card must display 6 / 6 условий');
    expect.includes(kg6Html, 'Все условия для сокрушительной жертвы Bxh7+ соблюдены', 'Kg6 card must display perfect praise');
    expect.ok(!kg6Html.includes('Отсутствует или не подготовлено!'), 'Perfect checklist must have zero missing conditions');

    // 3. Study without prerequisites returns empty string (null)
    const rookLift = getStudyById('lasker-bauer-1889')!;
    const nullHtml = renderToString(React.createElement(PrerequisiteCard, { prerequisites: rookLift.prerequisites }));
    expect.equal(nullHtml, '', 'PrerequisiteCard must render nothing when prerequisites is undefined');
  });
});

describe('Challenger M3 Suite 4: Dynamic Metadata Verification', () => {
  it('TC-CHAL-13: generateMetadata returns correct study title and chapter name across all 18 studies', async () => {
    for (const study of allStudies) {
      const meta = await generateMetadata({ params: { id: study.id } });

      // Title check
      expect.ok(meta.title && typeof meta.title === 'string', `${study.id}: title must be string`);
      expect.includes(meta.title, study.title, `${study.id}: meta.title must include study title`);
      expect.includes(meta.title, 'Атака по Вуковичу', `${study.id}: meta.title must include platform brand`);

      // Description check
      expect.equal(meta.description, study.description, `${study.id}: meta.description must match study description`);

      // Keywords check (must include study title and chapter title)
      expect.ok(Array.isArray(meta.keywords), `${study.id}: keywords must be an array`);
      expect.includes(meta.keywords!, study.title, `${study.id}: keywords must include study title`);
      expect.includes(meta.keywords!, study.chapterTitle, `${study.id}: keywords must include chapter title`);
    }
  });

  it('TC-CHAL-14: Pre-rendered HTML contains dynamic metadata in <title>, <meta description>, and <meta keywords>', () => {
    for (const study of allStudies) {
      const htmlPath = path.join(STUDY_SERVER_DIR, `${study.id}.html`);
      const html = fs.readFileSync(htmlPath, 'utf8');

      // Title tag verification in HTML (escaped quotes or exact title)
      const titleSnippet = study.title.replace(/'/g, '&#x27;');
      expect.includes(html, titleSnippet, `Pre-rendered HTML for ${study.id} must contain escaped study title`);

      // Keywords verification in HTML
      expect.includes(html, study.chapterTitle, `Pre-rendered HTML for ${study.id} must contain chapterTitle in keywords`);
    }
  });

  it('TC-CHAL-15: generateMetadata handles unknown study ID with safe fallback metadata', async () => {
    const unknownMeta = await generateMetadata({ params: { id: 'non-existent-study-xyz' } });
    expect.equal(unknownMeta.title, 'Этюд не найден — Атака по Вуковичу');
    expect.equal(unknownMeta.description, 'Учебный этюд не найден в каталоге платформы.');
  });
});

describe('Challenger M3 Suite 5: Adversarial Stress Testing & Edge Cases', () => {
  it('TC-CHAL-16: getStudyById handles malicious/adversarial inputs gracefully', () => {
    expect.equal(getStudyById(''), undefined, 'Empty string should return undefined');
    expect.equal(getStudyById('   '), undefined, 'Whitespace string should return undefined');
    expect.equal(getStudyById('__proto__'), undefined, '__proto__ key should return undefined');
    expect.equal(getStudyById('constructor'), undefined, 'constructor key should return undefined');
    expect.equal(getStudyById('toString'), undefined, 'toString key should return undefined');
    expect.equal(getStudyById('../../etc/passwd'), undefined, 'Path traversal should return undefined');
    expect.equal(getStudyById('<script>alert(1)</script>'), undefined, 'XSS attempt should return undefined');
  });

  it('TC-CHAL-17: findPathToNode algorithm traverses from root to arbitrary deep leaf nodes', () => {
    for (const study of allStudies) {
      // Test root path
      const rootPath = findPathToNode(study.rootNode, study.rootNode.id);
      expect.equal(rootPath.length, 1, `Root path must have length 1 for study ${study.id}`);
      expect.equal(rootPath[0].id, study.rootNode.id);

      // Find deep leaf node
      let leafNode = study.rootNode;
      while (leafNode.children && leafNode.children.length > 0) {
        leafNode = leafNode.children[0];
      }

      const leafPath = findPathToNode(study.rootNode, leafNode.id);
      expect.greaterThanOrEqual(leafPath.length, 1, `Path to leaf ${leafNode.id} must exist`);
      expect.equal(leafPath[leafPath.length - 1].id, leafNode.id, 'Last node in path must be leaf node');

      // Test non-existent node returns empty array
      const nonExistentPath = findPathToNode(study.rootNode, 'bogus-node-id-999');
      expect.equal(nonExistentPath.length, 0, 'Non-existent node should return empty path');
    }
  });

  it('TC-CHAL-18: findNodeById retrieves any node by ID and returns null for invalid ID', () => {
    for (const study of allStudies) {
      const foundRoot = findNodeById(study.rootNode, study.rootNode.id);
      expect.ok(foundRoot !== null && foundRoot.id === study.rootNode.id, 'findNodeById must find root');

      const foundBogus = findNodeById(study.rootNode, 'does-not-exist');
      expect.equal(foundBogus, null, 'findNodeById must return null for missing node');
    }
  });

  it('TC-CHAL-19: PrerequisiteCard resilience under partial/malformed prerequisite objects', () => {
    // Missing notes
    const partialPrereqs: any = {
      pawnOnE5: true,
      knightOnF6Absent: false,
    };
    const htmlPartial = renderToString(React.createElement(PrerequisiteCard, { prerequisites: partialPrereqs }));
    expect.ok(htmlPartial.length > 0, 'PrerequisiteCard should render with partial keys');
    expect.ok(htmlPartial.includes('1 / 6 условий') || htmlPartial.includes('1<!-- --> / 6 условий'), 'Partial keys should count true values accurately');

    // All false
    const allFalsePrereqs: PrerequisiteChecklist = {
      pawnOnE5: false,
      knightOnF6Absent: false,
      whiteBishopOnD3orC4: false,
      whiteKnightOnG5Available: false,
      whiteQueenOnH5orD3Available: false,
      h4PawnSupportReady: false,
      notes: 'All conditions violated test case',
    };
    const htmlAllFalse = renderToString(React.createElement(PrerequisiteCard, { prerequisites: allFalsePrereqs }));
    expect.ok(htmlAllFalse.includes('0 / 6 условий') || htmlAllFalse.includes('0<!-- --> / 6 условий'), 'All false checklist should show 0 / 6');
  });

  it('TC-CHAL-20: StrategicCallout renders correct priority callouts for NAGs and blunder refutations', () => {
    const dummyStudy = allStudies[0];

    // Blunder refutation node
    const blunderNode: MoveNode = {
      id: 'blunder-1',
      san: 'Qh5??',
      uci: 'd1h5',
      fen: dummyStudy.rootNode.fen,
      turn: 'w',
      nag: '??',
      isBlunderRefutation: true,
      blunderExplanation: 'Refutation explanation test',
      children: [],
    };
    const blunderHtml = renderToString(React.createElement(StrategicCallout, { currentNode: blunderNode, study: dummyStudy }));
    expect.includes(blunderHtml, 'Ложный след • Опровержение ошибки', 'Blunder callout must show refutation banner');
    expect.includes(blunderHtml, 'Refutation explanation test', 'Blunder callout must show explanation');

    // Brilliant node
    const brilliantNode: MoveNode = {
      id: 'brilliant-1',
      san: 'Bxh7+!!',
      uci: 'd3h7',
      fen: dummyStudy.rootNode.fen,
      turn: 'w',
      nag: '!!',
      comment: 'Brilliant sacrifice',
      children: [],
    };
    const brilliantHtml = renderToString(React.createElement(StrategicCallout, { currentNode: brilliantNode, study: dummyStudy }));
    expect.includes(brilliantHtml, 'Блестящий ход • Решающая жертва', 'Brilliant callout must show sacrifice banner');

    // Strong move node (!)
    const strongNode: MoveNode = {
      id: 'strong-1',
      san: 'h4!',
      uci: 'h2h4',
      fen: dummyStudy.rootNode.fen,
      turn: 'w',
      nag: '!',
      comment: 'Strong move',
      children: [],
    };
    const strongHtml = renderToString(React.createElement(StrategicCallout, { currentNode: strongNode, study: dummyStudy }));
    expect.includes(strongHtml, 'Сильнейший ход по Вуковичу', 'Strong move callout must show strongest banner');

    // Fallback: null currentNode renders study principle
    const fallbackHtml = renderToString(React.createElement(StrategicCallout, { currentNode: null, study: dummyStudy }));
    expect.includes(fallbackHtml, 'Принцип атаки Владимира Вуковича', 'Fallback callout must render study principle');
  });
});

runSuite();
