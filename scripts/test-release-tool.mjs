import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getPackageInfo,
  validateTag,
  detectScripts,
  checkNpmVersion,
  validateNpmPack,
  generateSummaryMarkdown
} from './release-tool.mjs';

test('validateTag enforces exact v<version> match', () => {
  assert.strictEqual(validateTag('v1.4.0', '1.4.0').valid, true);
  assert.strictEqual(validateTag('v0.0.1', '0.0.1').valid, true);

  assert.throws(() => validateTag('1.4.0', '1.4.0'), /Tag version mismatch/);
  assert.throws(() => validateTag('v1.4.1', '1.4.0'), /Tag version mismatch/);
  assert.throws(() => validateTag('', '1.4.0'), /Tag is required/);
});

test('detectScripts enforces required scripts and detects optional scripts', () => {
  const scripts = {
    lint: 'eslint .',
    typecheck: 'tsc --noEmit',
    test: 'vitest run',
    build: 'tsup',
    'docs:check': 'docboot check .'
  };

  const detected = detectScripts(scripts, { requireTests: true, requireBuild: true });
  assert.strictEqual(detected.lint, true);
  assert.strictEqual(detected.typecheck, true);
  assert.strictEqual(detected.test, true);
  assert.strictEqual(detected.build, true);
  assert.strictEqual(detected['docs:check'], true);

  // requireTests = true without test script should throw
  assert.throws(
    () => detectScripts({ build: 'echo 1' }, { requireTests: true }),
    /Validation failed: "test" script is required/
  );

  // requireBuild = true without build script should throw
  assert.throws(
    () => detectScripts({ test: 'echo 1' }, { requireTests: false, requireBuild: true }),
    /Validation failed: "build" script is required/
  );

  // requireBuild = false without build script should pass
  const noBuild = detectScripts({ test: 'echo 1' }, { requireTests: true, requireBuild: false });
  assert.strictEqual(noBuild.build, false);
});

test('getPackageInfo validates presence and fields', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-test-'));
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
      name: '@litepacks/test-sample',
      version: '2.0.0',
      scripts: { test: 'node -e "process.exit(0)"' }
    }));

    const info = getPackageInfo(tmp);
    assert.strictEqual(info.name, '@litepacks/test-sample');
    assert.strictEqual(info.version, '2.0.0');
    assert.strictEqual(info.private, false);
    assert.strictEqual(info.scripts.test, 'node -e "process.exit(0)"');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('checkNpmVersion distinguishes published vs non-existent package/version', () => {
  // A published package
  const resPublished = checkNpmVersion('workmatic', '1.1.3');
  assert.strictEqual(resPublished.published, true);

  // A non-existent version
  const resUnpublished = checkNpmVersion('workmatic', '99.99.99-nonexistent');
  assert.strictEqual(resUnpublished.published, false);
});

test('generateSummaryMarkdown produces readable markdown', () => {
  const summary = generateSummaryMarkdown({
    pkg: { name: 'sample', version: '1.0.0' },
    tag: 'v1.0.0',
    scriptResults: { lint: true, test: true, build: true },
    docboot: { enabled: true, status: 'passed' },
    pack: { valid: true, fileCount: 5, unpackedSize: 10240 },
    registryCheck: { published: false },
    release: { published: true, githubReleaseCreated: true }
  });

  assert.ok(summary.includes('sample'));
  assert.ok(summary.includes('v1.0.0'));
  assert.ok(summary.includes('Docboot Validation'));
  assert.ok(summary.includes('Published to npm'));
});
