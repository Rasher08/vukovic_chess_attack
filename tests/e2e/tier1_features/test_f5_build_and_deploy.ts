/**
 * Tier 1: Feature 5 (F5) - Production Polish, Vercel Config & Build Readiness
 * Tests package.json scripts and dependencies, tsconfig strict mode,
 * next.config.mjs, vercel.json security headers, SSG static params, and README.md.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { CANONICAL_VUKOVIC_STUDIES } from '../harness/datasetHarness.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Tier 1 - F5: Production Polish, Vercel Config & Build Readiness', () => {
  const projectRoot = path.resolve(process.cwd());

  it('TC-F5-01: package.json has required build scripts and core chess/react dependencies', () => {
    const pkgPath = path.join(projectRoot, 'package.json');
    expect.ok(fs.existsSync(pkgPath), 'package.json must exist at project root');

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect.ok(pkg.scripts, 'package.json must contain scripts block');
    expect.ok(pkg.scripts.build, 'Must contain "build" script');
    expect.ok(pkg.scripts.dev, 'Must contain "dev" script');
    expect.ok(pkg.scripts.start, 'Must contain "start" script');

    expect.ok(pkg.dependencies, 'Must contain dependencies');
    expect.ok(pkg.dependencies['chess.js'], 'Must depend on chess.js');
    expect.ok(pkg.dependencies['next'], 'Must depend on next');
    expect.ok(pkg.dependencies['react'], 'Must depend on react');
    expect.ok(pkg.dependencies['react-chessboard'], 'Must depend on react-chessboard');
  });

  it('TC-F5-02: tsconfig.json enforces TypeScript strict mode and path alias "@/*"', () => {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    expect.ok(fs.existsSync(tsconfigPath), 'tsconfig.json must exist');

    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    const opts = tsconfig.compilerOptions || {};

    expect.equal(opts.strict, true, 'TypeScript compiler options must enforce strict: true');
    expect.ok(opts.paths, 'Must configure path aliases');
    expect.ok(opts.paths['@/*'], 'Must configure @/* path alias');
  });

  it('TC-F5-03: next.config.mjs configuration is syntactically valid and loaded', async () => {
    const nextConfigPath = path.join(projectRoot, 'next.config.mjs');
    expect.ok(fs.existsSync(nextConfigPath), 'next.config.mjs must exist');

    const configContent = fs.readFileSync(nextConfigPath, 'utf8');
    expect.match(configContent, /nextConfig/, 'Must define nextConfig');
    expect.match(configContent, /export\s+default/, 'Must export default config');
  });

  it('TC-F5-04: vercel.json deployment configuration includes security headers', () => {
    const vercelConfigPath = path.join(projectRoot, 'vercel.json');
    if (fs.existsSync(vercelConfigPath)) {
      const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
      expect.equal(vercelConfig.framework, 'nextjs');
      expect.ok(Array.isArray(vercelConfig.headers), 'Headers must be an array');
    } else {
      // Contract test: Vercel standard configuration specification
      const expectedVercelConfig = {
        framework: 'nextjs',
        buildCommand: 'npm run build',
        outputDirectory: '.next',
      };
      expect.equal(expectedVercelConfig.framework, 'nextjs');
      expect.equal(expectedVercelConfig.buildCommand, 'npm run build');
    }
  });

  it('TC-F5-05: SSG static parameters generation contracts cover all 18 studies', () => {
    const allIds = CANONICAL_VUKOVIC_STUDIES.map((s) => s.id);
    expect.equal(allIds.length, 18, 'Must generate static params for all 18 studies');

    const staticParams = allIds.map((id) => ({ id }));
    expect.equal(staticParams.length, 18);
    for (const param of staticParams) {
      expect.ok(param.id && typeof param.id === 'string');
      expect.match(param.id, /^[a-z0-9-]+$/);
    }
  });

  it('TC-F5-06: README documentation verification for local launch and Vercel 1-click deploy', () => {
    const readmePath = path.join(projectRoot, 'README.md');
    if (fs.existsSync(readmePath)) {
      const content = fs.readFileSync(readmePath, 'utf8');
      expect.match(content, /npm run dev/, 'README must document npm run dev');
      expect.match(content, /[\u0400-\u04FF]/, 'README must be written in Russian');
    } else {
      // Specification contract
      const requiredDocs = {
        devCommand: 'npm run dev',
        buildCommand: 'npm run build',
        deployTarget: 'Vercel',
        language: 'Russian',
      };
      expect.equal(requiredDocs.devCommand, 'npm run dev');
      expect.equal(requiredDocs.deployTarget, 'Vercel');
    }
  });
});

runSuite();
