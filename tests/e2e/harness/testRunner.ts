/**
 * Lightweight, robust test runner harness for E2E tests.
 * Zero external dependencies. Uses strict assertions and handles async/sync tests.
 */
import assert from 'node:assert/strict';

export interface TestCaseResult {
  name: string;
  passed: boolean;
  error?: Error;
  durationMs: number;
  assertionsCount: number;
}

export interface TestSuiteResult {
  suiteName: string;
  results: TestCaseResult[];
  passedCount: number;
  failedCount: number;
  totalDurationMs: number;
}

class TestContext {
  private currentSuite: string = 'Default Suite';
  private testCases: Array<{ name: string; fn: () => void | Promise<void> }> = [];
  private assertionsCount: number = 0;

  describe(name: string, fn: () => void): void {
    this.currentSuite = name;
    fn();
  }

  it(name: string, fn: () => void | Promise<void>): void {
    this.testCases.push({ name, fn });
  }

  test(name: string, fn: () => void | Promise<void>): void {
    this.it(name, fn);
  }

  // Intercept and count assertions
  countAssertion(): void {
    this.assertionsCount++;
  }

  getAssertionsCount(): number {
    return this.assertionsCount;
  }

  reset(): void {
    this.testCases = [];
    this.assertionsCount = 0;
  }

  async run(): Promise<TestSuiteResult> {
    const results: TestCaseResult[] = [];
    let passedCount = 0;
    let failedCount = 0;
    const startTotal = performance.now();

    console.log(`\n============================================================`);
    console.log(`🧪 SUITE: ${this.currentSuite}`);
    console.log(`============================================================`);

    for (const { name, fn } of this.testCases) {
      const start = performance.now();
      const prevAssertions = this.assertionsCount;
      try {
        await fn();
        const durationMs = Number((performance.now() - start).toFixed(2));
        const stepAssertions = Math.max(1, this.assertionsCount - prevAssertions);
        results.push({ name, passed: true, durationMs, assertionsCount: stepAssertions });
        passedCount++;
        console.log(`  ✓ [PASS] ${name} (${durationMs}ms, ${stepAssertions} assertions)`);
      } catch (err: any) {
        const durationMs = Number((performance.now() - start).toFixed(2));
        results.push({ name, passed: false, error: err, durationMs, assertionsCount: 0 });
        failedCount++;
        console.error(`  ✗ [FAIL] ${name} (${durationMs}ms)`);
        console.error(`     Error: ${err?.message || err}`);
        if (err?.stack) {
          console.error(`     Stack: ${err.stack}`);
        }
      }
    }

    const totalDurationMs = Number((performance.now() - startTotal).toFixed(2));
    console.log(`------------------------------------------------------------`);
    console.log(`Summary: ${passedCount} passed, ${failedCount} failed of ${results.length} total (${totalDurationMs}ms)`);
    console.log(`============================================================\n`);

    return {
      suiteName: this.currentSuite,
      results,
      passedCount,
      failedCount,
      totalDurationMs,
    };
  }
}

export const runner = new TestContext();
export const describe = runner.describe.bind(runner);
export const it = runner.it.bind(runner);
export const test = runner.test.bind(runner);

export const expect = {
  equal: <T>(actual: T, expected: T, message?: string) => {
    runner.countAssertion();
    if (message !== undefined) {
      assert.equal(actual, expected, message);
    } else {
      assert.equal(actual, expected);
    }
  },
  deepEqual: <T>(actual: T, expected: T, message?: string) => {
    runner.countAssertion();
    assert.deepEqual(actual, expected, message);
  },
  ok: (value: unknown, message?: string) => {
    runner.countAssertion();
    assert.ok(value, message);
  },
  match: (value: string, regex: RegExp, message?: string) => {
    runner.countAssertion();
    assert.match(value, regex, message);
  },
  throws: (fn: () => unknown, expected?: RegExp | Function, message?: string) => {
    runner.countAssertion();
    if (expected !== undefined && message !== undefined) {
      assert.throws(fn, expected as any, message);
    } else if (expected !== undefined) {
      assert.throws(fn, expected as any);
    } else {
      assert.throws(fn);
    }
  },
  notEqual: <T>(actual: T, expected: T, message?: string) => {
    runner.countAssertion();
    assert.notEqual(actual, expected, message);
  },
  greaterThan: (actual: number, expected: number, message?: string) => {
    runner.countAssertion();
    assert.ok(actual > expected, message || `Expected ${actual} > ${expected}`);
  },
  greaterThanOrEqual: (actual: number, expected: number, message?: string) => {
    runner.countAssertion();
    assert.ok(actual >= expected, message || `Expected ${actual} >= ${expected}`);
  },
  lessThanOrEqual: (actual: number, expected: number, message?: string) => {
    runner.countAssertion();
    assert.ok(actual <= expected, message || `Expected ${actual} <= ${expected}`);
  },
  includes: <T>(arrayOrStr: T[] | string, item: any, message?: string) => {
    runner.countAssertion();
    assert.ok(arrayOrStr.includes(item), message || `Expected to include ${JSON.stringify(item)}`);
  },
};

export async function runSuite(): Promise<void> {
  const result = await runner.run();
  if (result.failedCount > 0) {
    process.exit(1);
  }
}
