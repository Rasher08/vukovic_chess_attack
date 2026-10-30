/**
 * Challenger Empirical Audit Suite
 * 
 * Verifies:
 * 1. Calculation Depth across all 18 studies (3-7+ plies, R3 requirement)
 * 2. Key tactical study full paths (Ed. Lasker - Thomas, Colle - O'Hanlon)
 * 3. Blunder refutations integrity (isBlunderRefutation, Russian blunderExplanation, legality)
 * 4. Dual win conditions (Ed. Lasker - Thomas 18.Kd2# vs 18.O-O-O#, Reti - Tartakower)
 */

import { Chess } from 'chess.js';
import { allStudies, getStudyById } from '../../src/data/studies/index';
import { MoveNode, VukovicStudy } from '../../src/types/chess';
import { isValidFen, makeMove, isCheckmate, isCheck } from '../../src/lib/chessUtils';

interface AuditReport {
  passed: boolean;
  details: string[];
  errors: string[];
  warnings: string[];
}

function countTreePlies(node: MoveNode, currentDepth = 1): number {
  if (!node.children || node.children.length === 0) {
    return currentDepth;
  }
  let maxChildDepth = currentDepth;
  for (const child of node.children) {
    const d = countTreePlies(child, currentDepth + 1);
    if (d > maxChildDepth) {
      maxChildDepth = d;
    }
  }
  return maxChildDepth;
}

function getForcedLinePlies(node: MoveNode, currentDepth = 1): number {
  // A forced line follows moves marked isForced: true or the primary child
  if (!node.children || node.children.length === 0) {
    return currentDepth;
  }
  const forcedChild = node.children.find((c) => c.isForced) || node.children[0];
  return getForcedLinePlies(forcedChild, currentDepth + 1);
}

function collectAllNodes(node: MoveNode): MoveNode[] {
  const result: MoveNode[] = [node];
  for (const child of node.children) {
    result.push(...collectAllNodes(child));
  }
  return result;
}

function isRussianText(text: string): boolean {
  // Checks if text contains Cyrillic characters [а-яА-ЯёЁ]
  return /[а-яА-ЯёЁ]/.test(text);
}

export function runChallengerAudit(): AuditReport {
  const report: AuditReport = {
    passed: true,
    details: [],
    errors: [],
    warnings: [],
  };

  console.log('================================================================');
  console.log('🔍 EMPIRICAL CHALLENGER: AUDIT OF CALCULATION DEPTH & BLUNDERS');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TEST SECTION 1: CALCULATION DEPTH AUDIT (R3: 3-7 plies)
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: Calculation Depth Audit (R3 requirement: 3-7 plies) ---');

  if (allStudies.length !== 18) {
    report.errors.push(`Ожидалось ровно 18 этюдов, найдено ${allStudies.length}`);
    report.passed = false;
  }

  for (const study of allStudies) {
    const forcedPlies = getForcedLinePlies(study.rootNode);
    const maxPlies = countTreePlies(study.rootNode);
    const target = study.calculationTargetPlies;

    // R3 requirement check: target should be between 3 and 7 (or up to 8 for deep king hunts)
    if (target < 3) {
      report.errors.push(
        `Этюд ${study.id}: calculationTargetPlies (${target}) < 3 plies (нарушение R3: минимум 3 полухода)`
      );
      report.passed = false;
    }

    if (forcedPlies < target) {
      report.errors.push(
        `Этюд ${study.id}: длина форсированной линии (${forcedPlies}) меньше расчетной цели (${target})`
      );
      report.passed = false;
    }

    report.details.push(
      `✓ [DEPTH] ${study.id.padEnd(32)} | Target: ${target} plies | Forced: ${forcedPlies} plies | Max: ${maxPlies} plies`
    );
  }

  // --------------------------------------------------------------------------
  // TEST SECTION 2: KEY TACTICAL STUDIES COMPLETE PATH SIMULATION
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Key Tactical Studies Calculation Paths ---');

  // 2.1. Colle vs O'Hanlon (colle-ohanlon-1930)
  const colleStudy = getStudyById('colle-ohanlon-1930');
  if (!colleStudy) {
    report.errors.push('Этюд colle-ohanlon-1930 не найден в датасете!');
    report.passed = false;
  } else {
    // Traverse main line step by step with chess.js
    let chess = new Chess(colleStudy.initialFen);
    const expectedMoves = [
      'Bxh7+', // 12.Bxh7+
      'Kxh7',  // 12...Kxh7
      'Ng5+',  // 13.Ng5+
      'Kg6',   // 13...Kg6
      'h4',    // 14.h4!
      'Rh8',   // 14...Rh8
      'Rxe6+', // 15.Rxe6+!
      'Nf6',   // 15...Nf6
      'h5+',   // 16.h5+
      'Kh6',   // 16...Kh6
      'Rxd6',  // 17.Rxd6
      'Qa5',   // 17...Qa5
      'Nxf7+', // 18.Nxf7+
    ];

    let colleSimSuccess = true;
    for (let i = 0; i < expectedMoves.length; i++) {
      const san = expectedMoves[i];
      try {
        const moveRes = chess.move(san);
        if (!moveRes) {
          report.errors.push(`Colle - O'Hanlon: Не удалось сделать ход #${i + 1} (${san})`);
          colleSimSuccess = false;
          break;
        }
      } catch (err) {
        report.errors.push(`Colle - O'Hanlon: Ошибка на ходе #${i + 1} (${san}): ${String(err)}`);
        colleSimSuccess = false;
        break;
      }
    }

    if (colleSimSuccess) {
      report.details.push(
        `✓ [COLLE-OHANLON] Главная форсированная линия из 13 полуходов успешно просимулирована шахматным движком.`
      );
    } else {
      report.passed = false;
    }

    // Verify Colle alternative branches: 13...Kg8, 13...Kh6 (blunder), 13...Kh8, 14...f5
    const colleAllNodes = collectAllNodes(colleStudy.rootNode);
    const hasKg8 = colleAllNodes.some((n) => n.san === 'Kg8');
    const hasKh6 = colleAllNodes.some((n) => n.san === 'Kh6');
    const hasKh8 = colleAllNodes.some((n) => n.san === 'Kh8');
    const hasF5 = colleAllNodes.some((n) => n.san === 'f5');

    if (hasKg8 && hasKh6 && hasKh8 && hasF5) {
      report.details.push(`✓ [COLLE-OHANLON] Все 4 ветки защит черных (Kg8, Kh6, Kh8, f5) присутствуют в дереве.`);
    } else {
      report.errors.push(`Colle - O'Hanlon: Не все альтернативные ветки найдены в дереве.`);
      report.passed = false;
    }
  }

  // 2.2. Edward Lasker vs Thomas (ed-lasker-thomas-1912)
  const laskerStudy = getStudyById('ed-lasker-thomas-1912');
  if (!laskerStudy) {
    report.errors.push('Этюд ed-lasker-thomas-1912 не найден в датасете!');
    report.passed = false;
  } else {
    let chess = new Chess(laskerStudy.initialFen);
    const kingHuntMoves = [
      'Qxh7+', // 11.Qxh7+!!
      'Kxh7',  // 11...Kxh7
      'Nxf6+', // 12.Nxf6+
      'Kh6',   // 12...Kh6
      'Neg4+', // 13.Neg4+
      'Kg5',   // 13...Kg5
      'h4+',   // 14.h4+
      'Kf4',   // 14...Kf4
      'g3+',   // 15.g3+
      'Kf3',   // 15...Kf3
      'Be2+',  // 16.Be2+
      'Kg2',   // 16...Kg2
      'Rh2+',  // 17.Rh2+
      'Kg1',   // 17...Kg1
      'Kd2#',  // 18.Kd2#
    ];

    let laskerSimSuccess = true;
    for (let i = 0; i < kingHuntMoves.length; i++) {
      const san = kingHuntMoves[i];
      try {
        const moveRes = chess.move(san);
        if (!moveRes) {
          report.errors.push(`Ed. Lasker - Thomas: Не удалось сделать ход #${i + 1} (${san})`);
          laskerSimSuccess = false;
          break;
        }
      } catch (err) {
        report.errors.push(`Ed. Lasker - Thomas: Ошибка на ходе #${i + 1} (${san}): ${String(err)}`);
        laskerSimSuccess = false;
        break;
      }
    }

    if (laskerSimSuccess && chess.isCheckmate()) {
      report.details.push(
        `✓ [ED-LASKER-THOMAS] Королевская охота (15 полуходов, 8 ходов белых) через всю доску завершилась матом 18.Kd2#.`
      );
    } else {
      report.errors.push('Ed. Lasker - Thomas: Симуляция марша не завершилась матом!');
      report.passed = false;
    }
  }

  // --------------------------------------------------------------------------
  // TEST SECTION 3: BLUNDER REFUTATION INTEGRITY
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Blunder Refutation & Explanation Audit ---');

  let totalBlunderRefutationNodes = 0;
  let totalMistakeNodes = 0;

  for (const study of allStudies) {
    const nodes = collectAllNodes(study.rootNode);
    for (const node of nodes) {
      if (node.nag === '??' || node.nag === '?') {
        totalMistakeNodes++;
      }

      if (node.isBlunderRefutation) {
        totalBlunderRefutationNodes++;

        // Verify blunderExplanation exists
        if (!node.blunderExplanation || node.blunderExplanation.trim().length === 0) {
          report.errors.push(
            `Узел ${node.id} (${node.san}) в ${study.id}: isBlunderRefutation=true, но blunderExplanation отсутствует или пуст!`
          );
          report.passed = false;
        } else {
          // Verify it's in Russian
          if (!isRussianText(node.blunderExplanation)) {
            report.errors.push(
              `Узел ${node.id} (${node.san}) в ${study.id}: blunderExplanation не содержит русский текст!`
            );
            report.passed = false;
          }
        }

        // Verify chess legality of the blunder node position
        if (!isValidFen(node.fen)) {
          report.errors.push(`Узел ${node.id} (${node.san}): невалидный FEN ${node.fen}`);
          report.passed = false;
        }

        report.details.push(
          `✓ [BLUNDER REFUTATION] ${study.id} | Node: ${node.id} (${node.san}) | Explanation: "${node.blunderExplanation?.slice(0, 50)}..."`
        );
      }
    }
  }

  report.details.push(
    `Всего узлов с ошибками (??/?): ${totalMistakeNodes}. Из них с флагом isBlunderRefutation: ${totalBlunderRefutationNodes}.`
  );

  // --------------------------------------------------------------------------
  // TEST SECTION 4: DUAL WIN CONDITIONS (18.Kd2# vs 18.O-O-O#)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Dual Win Conditions & Multiple Solution Audit ---');

  // Position after 17...Kg1 in Ed. Lasker vs Thomas:
  const laskerPreMateFen = 'r4r2/pbppq1p1/1pn1pN2/8/3P2NP/6P1/PPP1BP1R/R3K1k1 w Q - 4 18';

  // Test Solution 1: 18.Kd2#
  const c1 = new Chess(laskerPreMateFen);
  const m1 = c1.move('Kd2#');
  const isM1Mate = c1.isCheckmate();
  if (!m1 || !isM1Mate) {
    report.errors.push(`Победное условие 18.Kd2# не признано матом!`);
    report.passed = false;
  } else {
    report.details.push(`✓ [DUAL WIN 1] 18.Kd2# легален и признан матом chess.js.`);
  }

  // Test Solution 2: 18.O-O-O# (Queenside castling)
  const c2 = new Chess(laskerPreMateFen);
  const m2 = c2.move('O-O-O#');
  const isM2Mate = c2.isCheckmate();
  if (!m2 || !isM2Mate) {
    report.errors.push(`Победное условие 18.O-O-O# не признано матом!`);
    report.passed = false;
  } else {
    report.details.push(`✓ [DUAL WIN 2] 18.O-O-O# (длинная рокировка) легальна и признана матом chess.js.`);
  }

  // Test Reti - Tartakower dual mates
  // Initial FEN: rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9
  // 9.Qd8+ Kxd8 10.Bg5+ (double check)
  const retiFenAfterDoubleCheck = 'rnbk1b1r/pp3ppp/2p5/6B1/4n3/8/PPP2PPP/2KR1BNR b - - 1 10';
  const cRetiE8 = new Chess(retiFenAfterDoubleCheck);
  cRetiE8.move('Ke8');
  cRetiE8.move('Rd8#');
  const isRetiE8Mate = cRetiE8.isCheckmate();

  const cRetiC7 = new Chess(retiFenAfterDoubleCheck);
  cRetiC7.move('Kc7');
  cRetiC7.move('Bd8#');
  const isRetiC7Mate = cRetiC7.isCheckmate();

  if (isRetiE8Mate && isRetiC7Mate) {
    report.details.push(`✓ [DUAL WIN RETI] Оба мата Рети (11.Rd8# при 10...Ke8 и 11.Bd8# при 10...Kc7) проверены и валидны.`);
  } else {
    report.errors.push(`Ошибка в валидации матов Рети: e8 mate: ${isRetiE8Mate}, c7 mate: ${isRetiC7Mate}`);
    report.passed = false;
  }

  // Print all details
  for (const detail of report.details) {
    console.log(detail);
  }

  if (report.warnings.length > 0) {
    console.log('\n--- ПРЕДУПРЕЖДЕНИЯ ---');
    for (const w of report.warnings) {
      console.warn(`⚠️ ${w}`);
    }
  }

  if (report.errors.length > 0) {
    console.log('\n--- ОШИБКИ ---');
    for (const e of report.errors) {
      console.error(`❌ ${e}`);
    }
  }

  console.log('\n================================================================');
  console.log(
    report.passed
      ? '🎉 ВСЕ ЭМПИРИЧЕСКИЕ ПРОВЕРКИ ПРОЙДЕНЫ С КОДОМ 0 (100% PASS)'
      : '❌ ЭМПИРИЧЕСКАЯ ПРОВЕРКА ОБНАРУЖИЛА ОШИБКИ!'
  );
  console.log('================================================================\n');

  return report;
}

// Execute when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runChallengerAudit();
  if (!result.passed) {
    process.exit(1);
  }
}
