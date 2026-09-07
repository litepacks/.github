# Litepacks Central NPM Release Infrastructure 🚀

Centralized, tag-driven, secure npm release workflow for all packages across the **Litepacks** organization.

---

## 📐 Architecture & Flow

```text
git tag v1.4.0
git push origin v1.4.0
        ↓
GitHub Actions (push: tags: ["v*"])
        ↓
checkout repository (fetch-depth: 0)
        ↓
tag & package.json version verification (v1.4.0 == 1.4.0)
        ↓
lockfile check & npm ci
        ↓
run scripts (lint → typecheck → test → build)
        ↓
Docboot documentation gate (docs:check / npx docboot check .)
        ↓
npm pack --dry-run validation (manifest, entrypoints, files)
        ↓
npm registry duplicate check (skip if already published)
        ↓
npm publish --provenance (Trusted Publishing via OIDC)
        ↓
GitHub Release (auto-generated notes for tag)
        ↓
Job Summary (GitHub Actions step summary report)
```

---

## ⚡ Quick Start: Adding to a Package Repository

In any Litepacks package repository (e.g. `workmatic`, `screenpool`, `euix`), create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    uses: litepacks/.github/.github/workflows/npm-release.yml@main
    permissions:
      contents: write
      id-token: write
```

That's it! All validation, building, testing, documentation checking, and publishing is handled centrally.

---

## ⚙️ Workflow Inputs

Customize the release behavior in your caller workflow via `with:`:

| Input | Description | Default | Required |
|---|---|---|---|
| `node-version` | Node.js version for CI environment | `22` | No |
| `working-directory` | Subdirectory containing `package.json` | `.` | No |
| `require-tests` | Fail workflow if `test` script is missing | `true` | No |
| `require-build` | Fail workflow if `build` script is missing | `false` | No |
| `run-docboot` | Docboot gate mode (`auto`, `true`, `false`) | `auto` | No |
| `docboot-command` | Custom documentation verification command | `""` | No |
| `publish-access` | NPM publish access (`public` or `restricted`) | `public` | No |
| `npm-tag` | NPM distribution tag (`latest`, `beta`, `next`) | `latest` | No |
| `registry-url` | NPM registry endpoint | `https://registry.npmjs.org` | No |
| `create-github-release` | Create GitHub Release with auto-generated notes | `true` | No |

### Example with Custom Inputs

```yaml
jobs:
  release:
    uses: litepacks/.github/.github/workflows/npm-release.yml@main
    permissions:
      contents: write
      id-token: write
    with:
      node-version: 22
      require-build: true
      run-docboot: true
      npm-tag: latest
```

---

## 📦 Package Script Detection

The workflow dynamically inspects `package.json` scripts:

| Script | Behavior |
|---|---|
| `lint` | Executed if defined in `package.json`. |
| `typecheck` | Executed if defined in `package.json`. |
| `test` | Executed if defined. If missing and `require-tests: true`, workflow fails. |
| `build` | Executed if defined. If missing and `require-build: true`, workflow fails. |
| `docs:check` | Highest priority for Docboot documentation gate. |
| `docs:build` | Can be invoked as part of build or docs verification. |

---

## 📚 Docboot Documentation Gate

Docboot verification runs automatically before package packaging:

1. **`npm run docs:check`**: If defined in `package.json`, it is executed first.
2. **`docboot-command`**: Custom command if passed via workflow input.
3. **`npx docboot check . --json`**: Triggered automatically if `docboot` is in `dependencies`/`devDependencies`, or if `docboot.config.*` / `.docboot` / `docs/` is present.

If `run-docboot: auto` and the project has no documentation, the check is skipped without failing.

### Running Docboot Check Locally

```bash
# Terminal summary
npx docboot check .

# JSON output for CI / MCP integration
npx docboot check . --json
```

---

## 🔐 Trusted Publishing (OIDC) Setup

Litepacks uses **npm Trusted Publishing** via OpenID Connect (OIDC). No long-lived NPM tokens are stored in repository secrets.

### One-Time Configuration on npmjs.com:
1. Go to your package on `https://www.npmjs.com/package/<package-name>/access`.
2. Under **Publishing Access**, click **Add GitHub Actions**.
3. Fill in:
   - **GitHub organization**: `litepacks`
   - **Repository**: Your package repo (e.g. `workmatic`)
   - **Workflow filename**: `release.yml`
4. Save. NPM will now authenticate pushes matching tags directly via GitHub OIDC with cryptographic `--provenance` attestations!

*(Note: If a repository still uses a classic token, pass `secrets: { NPM_TOKEN: secrets.NPM_TOKEN }` as fallback).*

---

## 🏷️ Releasing a New Version

1. Bump version locally:
   ```bash
   npm version patch # or minor / major
   git push origin main
   git push origin --tags
   ```

2. Alternatively, tag an existing version:
   ```bash
   git tag v1.4.0
   git push origin v1.4.0
   ```

> **Important**: Tag `v1.4.0` must match `"version": "1.4.0"` in `package.json`. If mismatched, the workflow fails immediately to prevent accidental or out-of-sync releases.

---

## 🤖 MCP Tool Preparation

The core release checks are decoupled from YAML into `scripts/release-tool.mjs`.

Future Model Context Protocol (MCP) servers can import these pure modular functions:

```js
import {
  getPackageInfo,
  validateTag,
  detectScripts,
  checkDocboot,
  validateNpmPack,
  checkNpmVersion,
  getReleaseReadiness
} from './scripts/release-tool.mjs';

// Query release readiness via MCP:
const status = getReleaseReadiness('./path/to/project', 'v1.4.0');
```

Available CLI commands for inspection:

```bash
# Check complete release readiness
node scripts/release-tool.mjs --dir ../workmatic --tag v1.1.3 --json

# Run individual gate
node scripts/release-tool.mjs --dir ../workmatic --stage pack
node scripts/release-tool.mjs --dir ../workmatic --stage registry-check
```
