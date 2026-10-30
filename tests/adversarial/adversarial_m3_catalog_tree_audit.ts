/**
 * Adversarial Stress & Integrity Audit for Milestone 3:
 * - Study Catalog, Chapter Structure & Stats Integrity
 * - SSG Route Generation & Dynamic Route Handling
 * - Variation Tree Graph Walk, Cycles, Depth, and Sibling Traversal
 * - Russian Chess Terminology & Pedagogical Annotations
 * - Edge Cases: Missing IDs, Malformed Paths, Empty Trees, Deep Variations
 * - Anti-Cheating & Integrity Violations Check
 */

import { allStudies, getAllStudyIds, getStudyById, getStudiesByChapter } from '../../src/data/studies/index';
import { CHAPTERS, getCatalogStats, getChapterInfo, getStudySummariesByChapter, getStudiesByDifficulty } from '../../src/data/catalog';
import { generateStaticParams, generateMetadata } from '../../src/app/study/[id]/page';
import { findNodeById, findPathToNode, formatArrowsForBoard } from '../../src/lib/chessUtils';
import { MoveNode, VukovicStudy } from '../../src/types/chess';
import * as fs from 'fs';
import * as path from 'path';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failCount++;
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passCount++;
    console.log(`  ✓ PASS: ${message}`);
  }
}

console.log('==============================================================================');
console.log('🕵️   ADVERSARIAL INTEGRITY & STRESS AUDIT — MILESTONE 3 (Catalog & Tree UI)  ');
console.log('==============================================================================\n');

// -----------------------------------------------------------------------------
// 1. SSG Routing & generateStaticParams Verification
// -----------------------------------------------------------------------------
console.log('--- PART 1: SSG Route Generation & Params Integrity ---');

const staticParams = generateStaticParams();
assert(Array.isArray(staticParams), 'generateStaticParams() must return an array');
assert(staticParams.length === 18, `Expected exactly 18 static params, got ${staticParams.length}`);

const uniqueIds = new Set(staticParams.map((p) => p.id));
assert(uniqueIds.size === 18, 'All 18 generated static route IDs must be unique');

for (const p of staticParams) {
  assert(typeof p.id === 'string' && p.id.length > 0, `Route ID must be non-empty string: ${p.id}`);
  assert(/^[a-z0-9-]+$/.test(p.id), `Route ID must be URL-safe slug: ${p.id}`);
  const study = getStudyById(p.id);
  assert(study !== undefined, `getStudyById must resolve route id '${p.id}'`);
}

// -----------------------------------------------------------------------------
// 2. Metadata Generation (All 18 Valid Studies + Adversarial Negative Inputs)
// -----------------------------------------------------------------------------
console.log('\n--- PART 2: Metadata Generation & Negative Inputs ---');

async function testMetadata() {
  for (const study of allStudies) {
    const meta = await generateMetadata({ params: { id: study.id } });
    assert(typeof meta.title === 'string' && meta.title.includes(study.title), `Metadata title for ${study.id} must include study title`);
    assert(meta.title.includes('Вукович'), `Metadata title for ${study.id} must include 'Вукович'`);
    assert(typeof meta.description === 'string' && meta.description.length > 10, `Metadata description for ${study.id} must be non-empty`);
    assert(Array.isArray(meta.keywords) && meta.keywords.length >= 5, `Metadata keywords for ${study.id} must contain at least 5 tags`);
  }

  // Adversarial invalid IDs
  const maliciousIds = [
    'non-existent-study-id',
    '../../etc/passwd',
    '<script>alert(1)</script>',
    '',
    '   ',
    'null',
    'undefined',
    '__proto__',
    'SELECT * FROM users',
  ];

  for (const badId of maliciousIds) {
    const meta = await generateMetadata({ params: { id: badId } });
    assert(typeof meta.title === 'string' && meta.title.includes('не найден'), `Negative ID '${badId}' should return 'Этюд не найден' title`);
  }
}

// -----------------------------------------------------------------------------
// 3. Catalog Structure, Chapter Coherence & Difficulty Distributions
// -----------------------------------------------------------------------------
console.log('\n--- PART 3: Catalog Structure & Chapter Coherence ---');

assert(CHAPTERS.length === 4, `Expected 4 chapters, got ${CHAPTERS.length}`);
const stats = getCatalogStats();
assert(stats.totalStudies === 18, `Catalog stats totalStudies must be 18, got ${stats.totalStudies}`);
assert(stats.totalChapters === 4, `Catalog stats totalChapters must be 4, got ${stats.totalChapters}`);

const chapterStudyCountSum = CHAPTERS.reduce((sum, ch) => sum + ch.studiesCount, 0);
assert(chapterStudyCountSum === 18, `Sum of chapter studiesCount (${chapterStudyCountSum}) must equal 18`);

const expectedChapterIds = ['greek_gift', 'rook_lift', 'pawn_demolition', 'king_hunt'];
for (const chId of expectedChapterIds) {
  const ch = getChapterInfo(chId as any);
  assert(ch !== undefined, `getChapterInfo must resolve '${chId}'`);
  const studies = getStudiesByChapter(chId as any);
  assert(studies.length === ch!.studiesCount, `Chapter '${chId}' actual studies (${studies.length}) matches studiesCount (${ch!.studiesCount})`);
  const summaries = getStudySummariesByChapter(chId as any);
  assert(summaries.length === studies.length, `Summaries length matches studies length for '${chId}'`);
}

const diff1800 = getStudiesByDifficulty(1800);
const diff2000 = getStudiesByDifficulty(2000);
const diff2200 = getStudiesByDifficulty(2200);
assert(diff1800.length + diff2000.length + diff2200.length === 18, 'Difficulty distribution covers all 18 studies');
assert(diff1800.length > 0 && diff2000.length > 0 && diff2200.length > 0, 'All 3 difficulty tiers (1800, 2000, 2200) are populated');

// -----------------------------------------------------------------------------
// 4. Variation Tree Graph Traversal, Cycles & Node Reachability
// -----------------------------------------------------------------------------
console.log('\n--- PART 4: Variation Tree Graph Traversal & Node Reachability ---');

let totalNodesEncountered = 0;

for (const study of allStudies) {
  const visitedNodeIds = new Set<string>();

  function traverse(node: MoveNode, depth: number, parentId: string | null) {
    assert(!visitedNodeIds.has(node.id), `Cycle detected! Node '${node.id}' in study '${study.id}' was visited twice.`);
    visitedNodeIds.add(node.id);
    totalNodesEncountered++;

    // Graph node contract validation
    assert(typeof node.id === 'string' && node.id.length > 0, `Node in ${study.id} must have non-empty id`);
    assert(typeof node.san === 'string' && node.san.length > 0, `Node ${node.id} must have non-empty SAN`);
    assert(typeof node.fen === 'string' && node.fen.split(' ').length === 6, `Node ${node.id} must have 6-part valid FEN`);
    assert(node.turn === 'w' || node.turn === 'b', `Node ${node.id} turn must be 'w' or 'b'`);
    assert(Array.isArray(node.children), `Node ${node.id} children must be an array`);

    // Path resolution test
    const foundNode = findNodeById(study.rootNode, node.id);
    assert(foundNode !== null && foundNode.id === node.id, `findNodeById failed to find '${node.id}' in ${study.id}`);

    const pathToNode = findPathToNode(study.rootNode, node.id);
    assert(pathToNode.length > 0, `findPathToNode returned empty path for '${node.id}' in ${study.id}`);
    assert(pathToNode[0].id === study.rootNode.id, `findPathToNode must start at rootNode for '${node.id}'`);
    assert(pathToNode[pathToNode.length - 1].id === node.id, `findPathToNode must terminate at '${node.id}'`);

    // Verify parent-child chain in path
    for (let i = 0; i < pathToNode.length - 1; i++) {
      const currentInPath = pathToNode[i];
      const nextInPath = pathToNode[i + 1];
      const hasChild = currentInPath.children.some((c) => c.id === nextInPath.id);
      assert(hasChild, `Broken path link between '${currentInPath.id}' and '${nextInPath.id}' in ${study.id}`);
    }

    // Arrows formatting test if present
    if (node.arrows && node.arrows.length > 0) {
      const formatted = formatArrowsForBoard(node.arrows);
      assert(formatted.length === node.arrows.length, `formatArrowsForBoard must format all arrows for ${node.id}`);
    }

    for (const child of node.children) {
      traverse(child, depth + 1, node.id);
    }
  }

  traverse(study.rootNode, 0, null);
}

assert(totalNodesEncountered === 245, `Expected exactly 245 move nodes across dataset, audited ${totalNodesEncountered}`);

// -----------------------------------------------------------------------------
// 5. Russian Terminology & Educational Annotations Verification
// -----------------------------------------------------------------------------
console.log('\n--- PART 5: Russian Chess Terminology & Pedagogical Quality ---');

const russianChessTerms = [
  'жертва',
  'слон',
  'корол',
  'конь',
  'ферз',
  'ладь',
  'мат',
  'шах',
  'атак',
  'расчет',
  'Вукович',
  'лифт',
  'фигур',
  'вертикал',
  'комбинаци',
  'удар',
  'белы',
  'черн',
];

for (const study of allStudies) {
  assert(/[\u0400-\u04FF]/.test(study.title), `Study '${study.id}' title must contain Russian text`);
  assert(/[\u0400-\u04FF]/.test(study.description), `Study '${study.id}' description must contain Russian text`);

  // Check that description contains relevant chess terminology
  const hasTerminology = russianChessTerms.some((term) =>
    study.description.toLowerCase().includes(term.toLowerCase())
  );
  assert(hasTerminology, `Study '${study.id}' description must contain recognized Russian chess terms`);

  // If study has prerequisites (Greek Gift), check Russian in checklist
  if (study.prerequisites) {
    assert(/[\u0400-\u04FF]/.test(study.prerequisites.notes), `Prerequisites notes in '${study.id}' must be in Russian`);
  }
}

// -----------------------------------------------------------------------------
// 6. Component File Existence & Source Integrity Check
// -----------------------------------------------------------------------------
console.log('\n--- PART 6: Component Source Code & Integrity Inspection ---');

const m3Files = [
  'src/app/page.tsx',
  'src/app/study/[id]/page.tsx',
  'src/components/catalog/ChapterSection.tsx',
  'src/components/catalog/StudyCard.tsx',
  'src/components/layout/Header.tsx',
  'src/components/layout/Footer.tsx',
  'src/components/study/StudyHeader.tsx',
  'src/components/study/VariationTree.tsx',
  'src/components/study/MoveNavigation.tsx',
  'src/components/study/StrategicCallout.tsx',
  'src/components/study/PrerequisiteCard.tsx',
  'src/app/globals.css',
  'src/app/layout.tsx',
];

for (const fileRel of m3Files) {
  const fullPath = path.resolve(fileRel);
  assert(fs.existsSync(fullPath), `Required M3 file '${fileRel}' must exist`);
  const content = fs.readFileSync(fullPath, 'utf8');
  assert(content.length > 50, `File '${fileRel}' must not be empty`);

  // Anti-cheating / facade checks
  assert(!content.includes('TODO: implement'), `File '${fileRel}' must not contain unfinished TODOs`);
  assert(!content.includes('mockImplementation'), `File '${fileRel}' must not contain test mocks in source`);
  assert(!content.includes('placeholder-div'), `File '${fileRel}' must not contain dummy placeholder-divs`);
}

// Run async tests
testMetadata().then(() => {
  console.log('\n==============================================================================');
  console.log(`AUDIT RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('==============================================================================');
  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL M3 ADVERSARIAL INTEGRITY & STRESS TESTS PASSED CLEANLY (100%)!\n');
    process.exit(0);
  }
}).catch((err) => {
  console.error('Fatal error during audit:', err);
  process.exit(1);
});
