#!/usr/bin/env node

/**
 * Litepacks Release Engine (release-tool.mjs)
 * 
 * Modular release validation, package inspection, Docboot gates,
 * and npm registry verification.
 * 
 * Usable by:
 * 1. Central GitHub Actions reusable workflow (.github/workflows/npm-release.yml)
 * 2. Local developers (node scripts/release-tool.mjs --tag v1.0.0)
 * 3. Future MCP tools (release.check, npm.exists, etc.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * 1. Read & parse package.json
 */
export function getPackageInfo(workingDir = '.') {
  const absDir = path.resolve(process.cwd(), workingDir);
  const pkgPath = path.join(absDir, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    throw new Error(`package.json not found in "${absDir}"`);
  }

  let pkg;
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    pkg = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse package.json in "${absDir}": ${err.message}`);
  }

  if (!pkg.name || typeof pkg.name !== 'string' || pkg.name.trim() === '') {
    throw new Error(`package.json missing required "name" field in "${absDir}"`);
  }

  if (!pkg.version || typeof pkg.version !== 'string' || pkg.version.trim() === '') {
    throw new Error(`package.json missing required "version" field in "${absDir}"`);
  }

  return {
    dir: absDir,
    pkgPath,
    name: pkg.name.trim(),
    version: pkg.version.trim(),
    private: Boolean(pkg.private),
    scripts: pkg.scripts || {},
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {},
    repository: pkg.repository || null,
    raw: pkg
  };
}

/**
 * 2. Validate Git tag against package.json version
 * Requirement: Tag must match v<version> exactly (e.g. v1.4.0 <-> 1.4.0)
 */
export function validateTag(tag, pkgVersion) {
  if (!tag || typeof tag !== 'string') {
    throw new Error(`Tag is required for release verification.`);
  }

  const cleanTag = tag.trim();
  const expectedTag = `v${pkgVersion}`;

  if (cleanTag !== expectedTag) {
    throw new Error(
      `Tag version mismatch!\n` +
      `  Git Tag:              "${cleanTag}"\n` +
      `  package.json version: "${pkgVersion}"\n` +
      `  Expected tag:         "${expectedTag}"\n` +
      `Ensure "package.json" version is bumped to match the release tag before pushing tags.`
    );
  }

  return {
    valid: true,
    tag: cleanTag,
    version: pkgVersion
  };
}

/**
 * 3. Inspect scripts and check requirements
 */
export function detectScripts(pkgScripts = {}, options = {}) {
  const { requireTests = true, requireBuild = false } = options;

  const hasLint = Boolean(pkgScripts.lint);
  const hasTypecheck = Boolean(pkgScripts.typecheck);
  const hasTest = Boolean(pkgScripts.test);
  const hasBuild = Boolean(pkgScripts.build);
  const hasDocsCheck = Boolean(pkgScripts['docs:check']);
  const hasDocsBuild = Boolean(pkgScripts['docs:build']);

  if (requireTests && !hasTest) {
    throw new Error(
      `Validation failed: "test" script is required (require-tests=true) but no "test" script was found in package.json.`
    );
  }

  if (requireBuild && !hasBuild) {
    throw new Error(
      `Validation failed: "build" script is required (require-build=true) but no "build" script was found in package.json.`
    );
  }

  return {
    lint: hasLint,
    typecheck: hasTypecheck,
    test: hasTest,
    build: hasBuild,
    'docs:check': hasDocsCheck,
    'docs:build': hasDocsBuild
  };
}

/**
 * 4. Docboot release gate integration
 */
export function checkDocboot(workingDir = '.', options = {}) {
  const absDir = path.resolve(process.cwd(), workingDir);
  const {
    runDocboot = 'auto',
    docbootCommand = '',
    pkgScripts = {},
    dependencies = {},
    devDependencies = {}
  } = options;

  if (runDocboot === 'false' || runDocboot === false) {
    return {
      enabled: false,
      status: 'disabled',
      reason: 'run-docboot is set to false'
    };
  }

  // Priority 1: package.json "docs:check" script
  if (pkgScripts['docs:check']) {
    try {
      const output = execSync('npm run docs:check', {
        cwd: absDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      return {
        enabled: true,
        status: 'passed',
        mode: 'npm_script',
        command: 'npm run docs:check',
        output
      };
    } catch (err) {
      throw new Error(
        `Docboot gate failed via "npm run docs:check":\n${err.stdout || ''}\n${err.stderr || err.message}`
      );
    }
  }

  // Priority 2: Custom docbootCommand
  if (docbootCommand && docbootCommand.trim() !== '') {
    const cmd = docbootCommand.trim();
    try {
      const output = execSync(cmd, {
        cwd: absDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      return {
        enabled: true,
        status: 'passed',
        mode: 'custom_command',
        command: cmd,
        output
      };
    } catch (err) {
      throw new Error(
        `Docboot gate failed via custom command "${cmd}":\n${err.stdout || ''}\n${err.stderr || err.message}`
      );
    }
  }

  // Priority 3: Detect Docboot presence in repository
  const allDeps = { ...dependencies, ...devDependencies };
  const hasDocbootDep = Boolean(allDeps.docboot);
  const hasDocbootConfig = (
    fs.existsSync(path.join(absDir, 'docboot.config.js')) ||
    fs.existsSync(path.join(absDir, 'docboot.config.json')) ||
    fs.existsSync(path.join(absDir, 'docboot.config.mjs')) ||
    fs.existsSync(path.join(absDir, 'docboot.config.ts'))
  );
  const hasDocbootFolder = fs.existsSync(path.join(absDir, '.docboot'));
  const hasDocsFolder = (
    fs.existsSync(path.join(absDir, 'docs')) &&
    fs.statSync(path.join(absDir, 'docs')).isDirectory()
  );

  const isDocbootProject = hasDocbootDep || hasDocbootConfig || hasDocbootFolder || (hasDocsFolder && hasDocbootDep);

  if (!isDocbootProject) {
    if (runDocboot === 'true' || runDocboot === true) {
      throw new Error(
        `Docboot gate failed: "run-docboot=true" was specified, but no Docboot configuration or dependency was detected in "${absDir}".`
      );
    }
    return {
      enabled: false,
      status: 'skipped',
      reason: 'No Docboot configuration or dependency detected in repository'
    };
  }

  // Run npx docboot check . --json
  const checkCmd = 'npx --yes docboot check . --json';
  try {
    const stdout = execSync(checkCmd, {
      cwd: absDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let jsonResult = null;
    try {
      jsonResult = JSON.parse(stdout.trim());
    } catch (_) {
      const start = stdout.indexOf('{');
      const end = stdout.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        jsonResult = JSON.parse(stdout.slice(start, end + 1));
      }
    }

    if (jsonResult && jsonResult.ok === false) {
      const errList = (jsonResult.errors || []).map(e => ` - [${e.type || 'Error'}] ${e.message}`).join('\n');
      throw new Error(`Docboot check failed validation:\n${errList}`);
    }

    return {
      enabled: true,
      status: 'passed',
      mode: 'docboot_cli',
      command: checkCmd,
      report: jsonResult,
      output: stdout
    };
  } catch (err) {
    throw new Error(
      `Docboot validation failed (${checkCmd}):\n${err.stdout || ''}\n${err.stderr || err.message}`
    );
  }
}

/**
 * 5. Run npm pack --dry-run and validate package manifest & assets
 */
export function validateNpmPack(workingDir = '.') {
  const absDir = path.resolve(process.cwd(), workingDir);
  const pkg = getPackageInfo(absDir);

  if (pkg.private === true) {
    throw new Error(
      `Cannot publish package "${pkg.name}": "private: true" is set in package.json.`
    );
  }

  let packOutput;
  try {
    const stdout = execSync('npm pack --dry-run --json', {
      cwd: absDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    packOutput = JSON.parse(stdout.trim());
  } catch (err) {
    throw new Error(`"npm pack --dry-run" failed:\n${err.stderr || err.stdout || err.message}`);
  }

  let manifest;
  if (Array.isArray(packOutput)) {
    manifest = packOutput[0];
  } else if (packOutput && typeof packOutput === 'object') {
    manifest = packOutput[pkg.name] || Object.values(packOutput)[0];
  }

  if (!manifest) {
    throw new Error(`"npm pack --dry-run" produced empty output.`);
  }

  if (manifest.name !== pkg.name) {
    throw new Error(`Package name mismatch: package.json has "${pkg.name}", npm pack returned "${manifest.name}".`);
  }

  if (manifest.version !== pkg.version) {
    throw new Error(`Package version mismatch: package.json has "${pkg.version}", npm pack returned "${manifest.version}".`);
  }

  if (!manifest.files || manifest.files.length === 0) {
    throw new Error(`Package "${pkg.name}" contains zero files to publish! Check files/package.json configuration.`);
  }

  return {
    valid: true,
    name: manifest.name,
    version: manifest.version,
    id: manifest.id,
    filename: manifest.filename,
    size: manifest.size,
    unpackedSize: manifest.unpackedSize,
    fileCount: manifest.entryCount || (manifest.files ? manifest.files.length : 0),
    files: manifest.files || []
  };
}

/**
 * 6. Check if target version is already published on npm registry
 */
export function checkNpmVersion(name, version, registryUrl = 'https://registry.npmjs.org') {
  const reg = registryUrl.replace(/\/$/, '');
  const cmd = `npm view ${name}@${version} version --registry=${reg}`;

  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();

    if (stdout === version) {
      return {
        published: true,
        name,
        version,
        registry: reg
      };
    }
  } catch (err) {
    return {
      published: false,
      name,
      version,
      registry: reg
    };
  }

  return {
    published: false,
    name,
    version,
    registry: reg
  };
}

/**
 * 7. Full Release Readiness Orchestrator
 */
export function getReleaseReadiness(workingDir = '.', tag = '', options = {}) {
  const pkg = getPackageInfo(workingDir);
  const tagValidation = tag ? validateTag(tag, pkg.version) : { valid: false, tag: null };
  const scripts = detectScripts(pkg.scripts, options);
  const pack = validateNpmPack(workingDir);
  const docboot = checkDocboot(workingDir, {
    ...options,
    pkgScripts: pkg.scripts,
    dependencies: pkg.dependencies,
    devDependencies: pkg.devDependencies
  });
  const registryCheck = checkNpmVersion(pkg.name, pkg.version, options.registryUrl || 'https://registry.npmjs.org');

  const ready = tagValidation.valid && pack.valid && !pkg.private && (docboot.status === 'passed' || docboot.status === 'skipped' || docboot.status === 'disabled');

  return {
    ready,
    package: {
      name: pkg.name,
      version: pkg.version,
      private: pkg.private,
      tag: tag || `v${pkg.version}`
    },
    tagMatches: tagValidation.valid,
    alreadyPublished: registryCheck.published,
    scripts,
    pack: {
      valid: pack.valid,
      filename: pack.filename,
      fileCount: pack.fileCount,
      unpackedSize: pack.unpackedSize
    },
    docboot: {
      enabled: docboot.enabled,
      status: docboot.status,
      command: docboot.command || null
    },
    summary: registryCheck.published
      ? `Package ${pkg.name}@${pkg.version} is already published on npm. Publish step will be safely skipped.`
      : `Package ${pkg.name}@${pkg.version} is fully validated and ready for release.`
  };
}

/**
 * 8. Generate GitHub Actions Step Summary Markdown
 */
export function generateSummaryMarkdown(state) {
  const { pkg, tag, scriptResults = {}, docboot = {}, pack = {}, registryCheck = {}, release = {} } = state;

  const boolBadge = (cond, label, detail = '') => (cond ? `- [x] **${label}** ${detail}` : `- [ ] **${label}** ${detail}`);

  return `
# 📦 Litepacks Release Summary

| Field | Value |
|---|---|
| **Package** | \`${pkg.name}\` |
| **Version** | \`${pkg.version}\` |
| **Release Tag** | \`${tag}\` |
| **Registry** | \`${registryCheck.registry || 'https://registry.npmjs.org'}\` |
| **Status** | **${release.published ? 'Published to npm' : (registryCheck.published ? 'Skipped (Already Published)' : 'Verified')}** |

---

### 🛡️ Pre-Release Gates

${boolBadge(true, 'Tag & Version Match', `(\`${tag}\` ↔ \`${pkg.version}\`)`)}
${scriptResults.lint !== undefined ? boolBadge(scriptResults.lint, 'Lint', scriptResults.lint ? '(\`npm run lint\`)' : '(failed)') : '- [ ] **Lint** *(skipped — no script)*'}
${scriptResults.typecheck !== undefined ? boolBadge(scriptResults.typecheck, 'Typecheck', scriptResults.typecheck ? '(\`npm run typecheck\`)' : '(failed)') : '- [ ] **Typecheck** *(skipped — no script)*'}
${scriptResults.test !== undefined ? boolBadge(scriptResults.test, 'Unit Tests', scriptResults.test ? '(\`npm test\`)' : '(failed)') : '- [ ] **Unit Tests** *(skipped — no script)*'}
${scriptResults.build !== undefined ? boolBadge(scriptResults.build, 'Build', scriptResults.build ? '(\`npm run build\`)' : '(failed)') : '- [ ] **Build** *(skipped — no script)*'}
${docboot.enabled ? boolBadge(docboot.status === 'passed', 'Docboot Validation', `(\`${docboot.command || 'docboot check'}\`)`) : `- [ ] **Docboot Gate** *(${docboot.reason || 'skipped'})*`}
${boolBadge(pack.valid, 'Package Pack Check', `(\`${pack.fileCount} files\`, \`${Math.round((pack.unpackedSize || 0) / 1024)} KB\`)`)}

---

### 🚀 Registry & Delivery

- **npm Registry Check**: ${registryCheck.published ? `⚠️ \`${pkg.name}@${pkg.version}\` is already published. (Skipped duplicate publish)` : `✓ Version is fresh and ready to publish`}
- **npm Publish**: ${release.published ? `✓ Published successfully via Trusted Publishing (--provenance)` : (registryCheck.published ? `Skipped (Already published)` : `Pending`)}
- **GitHub Release**: ${release.githubReleaseCreated ? `✓ Release created for tag \`${tag}\`` : (release.githubReleaseSkipped ? `Release already exists` : `Pending`)}
`.trim();
}

/**
 * 9. CLI Execution Entry Point
 */
function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = {
    dir: '.',
    tag: process.env.GITHUB_REF_NAME || process.env.TAG || '',
    stage: 'all',
    requireTests: true,
    requireBuild: false,
    runDocboot: 'auto',
    docbootCommand: '',
    registryUrl: 'https://registry.npmjs.org',
    publishAccess: 'public',
    npmTag: 'latest',
    json: false,
    summaryFile: process.env.GITHUB_STEP_SUMMARY || ''
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dir') options.dir = args[++i];
    else if (arg === '--tag') options.tag = args[++i];
    else if (arg === '--stage') options.stage = args[++i];
    else if (arg === '--require-tests') options.requireTests = args[++i] === 'true';
    else if (arg === '--require-build') options.requireBuild = args[++i] === 'true';
    else if (arg === '--run-docboot') options.runDocboot = args[++i];
    else if (arg === '--docboot-command') options.docbootCommand = args[++i];
    else if (arg === '--registry-url') options.registryUrl = args[++i];
    else if (arg === '--publish-access') options.publishAccess = args[++i];
    else if (arg === '--npm-tag') options.npmTag = args[++i];
    else if (arg === '--summary-file') options.summaryFile = args[++i];
    else if (arg === '--json') options.json = true;
  }

  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseCliArgs();

  try {
    const pkg = getPackageInfo(options.dir);

    // Stage: pre-flight (tag validation + package sanity)
    if (options.stage === 'pre-flight') {
      if (options.tag) {
        validateTag(options.tag, pkg.version);
        console.log(`✓ Tag "${options.tag}" matches package.json version "${pkg.version}".`);
      }
      if (pkg.private) {
        throw new Error(`Cannot release private package "${pkg.name}".`);
      }
      const scripts = detectScripts(pkg.scripts, options);
      console.log(`✓ Package "${pkg.name}@${pkg.version}" pre-flight checks passed.`);

      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `pkg_name=${pkg.name}
`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `pkg_version=${pkg.version}
`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_lint=${scripts.lint}
`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_typecheck=${scripts.typecheck}
`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_test=${scripts.test}
`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_build=${scripts.build}
`);
      }
      process.exit(0);
    }

    // Stage: docboot
    if (options.stage === 'docboot') {
      const docbootResult = checkDocboot(options.dir, {
        runDocboot: options.runDocboot,
        docbootCommand: options.docbootCommand,
        pkgScripts: pkg.scripts,
        dependencies: pkg.dependencies,
        devDependencies: pkg.devDependencies
      });
      if (docbootResult.enabled) {
        console.log(`✓ Docboot validation passed (${docbootResult.command || docbootResult.mode}).`);
      } else {
        console.log(`- Docboot check skipped (${docbootResult.reason}).`);
      }
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `docboot_status=${docbootResult.status}
`);
      }
      process.exit(0);
    }

    // Stage: pack
    if (options.stage === 'pack') {
      const packResult = validateNpmPack(options.dir);
      console.log(`✓ npm pack validated: ${packResult.fileCount} files, ${packResult.unpackedSize} bytes.`);
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `pack_file_count=${packResult.fileCount}
`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `pack_size=${packResult.unpackedSize}
`);
      }
      process.exit(0);
    }

    // Stage: registry-check
    if (options.stage === 'registry-check') {
      const reg = checkNpmVersion(pkg.name, pkg.version, options.registryUrl);
      if (reg.published) {
        console.log(`Package ${pkg.name}@${pkg.version} is already published.`);
        console.log(`Skipping publish.`);
      } else {
        console.log(`✓ Version ${pkg.name}@${pkg.version} is not yet published on registry.`);
      }
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `already_published=${reg.published}
`);
      }
      process.exit(0);
    }

    // Stage: all (Complete inspect / Readiness)
    const readiness = getReleaseReadiness(options.dir, options.tag, options);
    if (options.json) {
      console.log(JSON.stringify(readiness, null, 2));
    } else {
      console.log(`\n=== Litepacks Release Readiness: ${pkg.name}@${pkg.version} ===`);
      console.log(`Tag Match:         ${readiness.tagMatches ? '✓ Valid' : '✗ Invalid'}`);
      console.log(`npm Published:     ${readiness.alreadyPublished ? 'Already published (Will Skip)' : '✓ Not yet published'}`);
      console.log(`Docboot Status:    ${readiness.docboot.status}`);
      console.log(`Pack Valid:        ${readiness.pack.valid ? `✓ (${readiness.pack.fileCount} files)` : '✗ Invalid'}`);
      console.log(`Overall Ready:     ${readiness.ready ? '✓ YES' : '✗ NO'}`);
      console.log(`\n${readiness.summary}\n`);
    }

    if (options.summaryFile && fs.existsSync(path.dirname(options.summaryFile))) {
      const summaryMd = generateSummaryMarkdown({
        pkg,
        tag: options.tag || `v${pkg.version}`,
        scriptResults: readiness.scripts,
        docboot: readiness.docboot,
        pack: readiness.pack,
        registryCheck: { published: readiness.alreadyPublished, registry: options.registryUrl },
        release: { published: false }
      });
      fs.appendFileSync(options.summaryFile, summaryMd + '\n');
    }

    process.exit(readiness.ready ? 0 : 1);
  } catch (err) {
    console.error(`\n✖ Litepacks Release Tool Error: ${err.message}\n`);
    process.exit(1);
  }
}
