import { allStudies } from '../src/data/studies';
import { validateStudy, StudyValidationResult } from '../src/lib/validation';

/**
 * CLI-скрипт полной верификации датасета этюдов по Вуковичу с помощью chess.js
 * Запуск: npx tsx scripts/validate_dataset.ts
 */

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

console.log(`${ANSI.bold}${ANSI.cyan}================================================================================${ANSI.reset}`);
console.log(`${ANSI.bold}  ВАЛИДАТОР ШАХМАТНОГО ДАТАСЕТА: 18 ЭТЮДОВ ВЛАДИМИРА ВУКОВИЧА (chess.js)${ANSI.reset}`);
console.log(`${ANSI.cyan}================================================================================${ANSI.reset}\n`);

const results: StudyValidationResult[] = [];
let totalErrors = 0;
let totalWarnings = 0;
let totalNodesVerified = 0;

for (let i = 0; i < allStudies.length; i++) {
  const study = allStudies[i];
  const res = validateStudy(study);
  results.push(res);
  totalNodesVerified += res.totalNodes;

  const num = String(i + 1).padStart(2, '0');
  const statusIcon = res.valid ? `${ANSI.green}✓ PASS${ANSI.reset}` : `${ANSI.red}✗ FAIL${ANSI.reset}`;
  const nodesStr = `${res.totalNodes} узлов`.padStart(10, ' ');
  const depthStr = `глубина ${res.maxDepth}`.padStart(12, ' ');

  console.log(
    `[${num}/18] ${statusIcon} | ${ANSI.bold}${study.id.padEnd(30, ' ')}${ANSI.reset} | ${nodesStr} | ${depthStr} | ${study.title}`
  );

  if (res.errors.length > 0) {
    totalErrors += res.errors.length;
    res.errors.forEach((err) => console.error(`       ${ANSI.red}ERROR:${ANSI.reset} ${err}`));
  }

  if (res.warnings.length > 0) {
    totalWarnings += res.warnings.length;
    res.warnings.forEach((warn) => console.warn(`       ${ANSI.yellow}WARN:${ANSI.reset} ${warn}`));
  }
}

console.log(`\n${ANSI.cyan}--------------------------------------------------------------------------------${ANSI.reset}`);
console.log(`${ANSI.bold}ИТОГОВЫЙ ОТЧЕТ ВАЛИДАЦИИ:${ANSI.reset}`);
console.log(`  Всего этюдов в базе:        ${ANSI.bold}${allStudies.length}${ANSI.reset}`);
console.log(`  Успешно верифицировано:     ${ANSI.green}${ANSI.bold}${results.filter((r) => r.valid).length} / ${allStudies.length}${ANSI.reset}`);
console.log(`  Всего ходов проверено:      ${ANSI.bold}${totalNodesVerified}${ANSI.reset}`);
console.log(`  Ошибок легальности/FEN:     ${totalErrors > 0 ? `${ANSI.red}${totalErrors}` : `${ANSI.green}0`}${ANSI.reset}`);
console.log(`  Предупреждений:             ${totalWarnings > 0 ? `${ANSI.yellow}${totalWarnings}` : `${ANSI.green}0`}${ANSI.reset}`);
console.log(`${ANSI.cyan}================================================================================${ANSI.reset}\n`);

if (totalErrors > 0 || results.some((r) => !r.valid)) {
  console.error(`${ANSI.red}${ANSI.bold}✗ ПРОВЕРКА НЕ ПРОЙДЕНА: Обнаружены шахматные ошибки в датасете!${ANSI.reset}\n`);
  process.exit(1);
} else {
  console.log(`${ANSI.green}${ANSI.bold}✓ 100% ВАЛИДАЦИЯ УСПЕШНА: Все 18 этюдов, переходы, FEN и маты проверены chess.js без единой ошибки!${ANSI.reset}\n`);
  process.exit(0);
}
