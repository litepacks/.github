#!/usr/bin/env node

/**
 * Bulk Setup NPM Trusted Publishing for all Litepacks Packages
 * 
 * Requirements:
 *   - npm 12+ (e.g. Node 24 via `nvm use 24` or `npm install -g npm@latest`)
 *   - Logged in to npm (`npm whoami`)
 */

import { execSync, spawnSync } from 'node:child_process';

// Check npm version
let npmVersion = '';
try {
  npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim();
} catch (e) {
  console.error('Error: npm is not available in PATH.');
  process.exit(1);
}

const major = parseInt(npmVersion.split('.')[0], 10);
if (major < 12) {
  console.error(`\n❌ npm version is ${npmVersion}. "npm trust" requires npm 12+ (Node 24+).`);
  console.error(`\n💡 Çözüm:`);
  console.error(`   1. nvm kullanıyorsanız:   nvm use 24`);
  console.error(`   2. veya npm'i güncelleyin: npm install -g npm@latest\n`);
  process.exit(1);
}

// Check npm whoami
try {
  const whoami = execSync('npm whoami', { encoding: 'utf-8' }).trim();
  console.log(`✓ Logged in as: ${whoami}`);
} catch (e) {
  console.error('\n❌ npm login yapılmamış. Önce "npm login" çalıştırın.');
  process.exit(1);
}

const PACKAGES = [
  { pkg: 'workmatic', repo: 'litepacks/workmatic', file: 'release.yml' },
  { pkg: 'screenpool', repo: 'litepacks/screenpool', file: 'release.yml' },
  { pkg: 'browsertrack', repo: 'litepacks/browsertrack', file: 'release.yml' },
  { pkg: 'euixjs', repo: 'litepacks/euix', file: 'release.yml' },
  { pkg: 'docboot', repo: 'litepacks/docboot', file: 'release.yml' },
  { pkg: 'deployra', repo: 'litepacks/deployra', file: 'release.yml' },
  { pkg: 'unitup', repo: 'litepacks/unitup', file: 'release.yml' },
  { pkg: 'welyjs', repo: 'litepacks/welyjs', file: 'release.yml' },
  { pkg: 'pgpulse', repo: 'litepacks/pgpulse', file: 'release.yml' },
  { pkg: 'jsonld-easy', repo: 'litepacks/jsonld-easy', file: 'release.yml' },
  { pkg: 'cron8n', repo: 'litepacks/cron8n', file: 'release.yml' },
  { pkg: 'pipsel', repo: 'litepacks/pipsel', file: 'release.yml' },
  { pkg: 'webspresso', repo: 'litepacks/webspresso', file: 'release.yml' },
  { pkg: 'nginx-log-analyzer', repo: 'litepacks/nginx-log-analyzer', file: 'release.yml' },
  { pkg: 'image2tags', repo: 'litepacks/image2tags', file: 'release.yml' },
  { pkg: 'domain-safe', repo: 'litepacks/domain-safe', file: 'release.yml' },
  { pkg: 'envx-ui', repo: 'litepacks/envx-ui', file: 'release.yml' },
  { pkg: 'sessionsnap', repo: 'litepacks/sessionsnap', file: 'release.yml' },
  { pkg: 'liteflow', repo: 'litepacks/liteflow', file: 'release.yml' },
  { pkg: 'liteflow-ui', repo: 'litepacks/liteflow-ui', file: 'release.yml' },
  { pkg: 'peerdep-checker', repo: 'litepacks/peerdep-checker', file: 'release.yml' },
  { pkg: 'node-rembg', repo: 'litepacks/node-rembg', file: 'release.yml' },
  { pkg: 'appspresso', repo: 'litepacks/appspresso', file: 'release.yml' }
];

console.log(`\n🚀 Setting up Trusted Publishing for ${PACKAGES.length} Litepacks packages...\n`);

let passed = 0;
let failed = 0;

for (const { pkg, repo, file } of PACKAGES) {
  process.stdout.write(`Configuring ${pkg.padEnd(22)} (repo: ${repo})... `);

  const args = [
    'trust',
    'github',
    pkg,
    '--repo', repo,
    '--file', file,
    '--allow-publish',
    '--yes'
  ];

  const res = spawnSync('npm', args, {
    stdio: 'inherit'
  });

  if (res.status === 0) {
    passed++;
    console.log(`✓ OK`);
  } else {
    failed++;
    console.log(`✗ Failed (exit code ${res.status})`);
  }
}

console.log(`\n=== Trusted Publishing Setup Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${PACKAGES.length}\n`);
