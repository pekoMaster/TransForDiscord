# TFD Shared Crypto Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `utils/crypto-helper.js` implementation into `src/shared/crypto/crypto-helper.js` without changing encryption behavior, key location, or API-key decryptability.

**Architecture:** Keep runtime behavior stable by anchoring the fallback key file to the project root `data/.encryption-key`, not to the helper file directory. Preserve `utils/crypto-helper.js` as a compatibility adapter so existing imports keep working while future feature code can import from `src/shared/crypto/crypto-helper.js`.

**Tech Stack:** Node.js CommonJS, built-in `crypto`/`fs`/`path`, existing TFD logger adapter, local smoke scripts.

---

## Safety Boundaries

- Do not push or deploy.
- Current pre-phase restore point: `ed463fa refactor: move tfd logger to shared logging`.
- Older stable refactor baseline: tag `baseline/pre-translation-refactor-2026-05-15`.
- Do not read or print real `.env` secrets.
- Do not delete or regenerate `data/.encryption-key`.
- Do not run crypto smoke tests in a way that writes to the real `data/.encryption-key`.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/crypto/crypto-helper.js` | Real AES-256-GCM implementation, stable project-root key path, exported API. |
| `utils/crypto-helper.js` | Legacy adapter re-exporting `src/shared/crypto/crypto-helper.js`. |
| `scripts/crypto-helper-smoke.js` | Verifies shared and legacy imports are identical, env-key encrypt/decrypt works, invalid key length fails, and fallback key path stays under project `data/.encryption-key`. |
| `src/features/translation/keys/user-api-key-storage.js` | Update runtime import to shared crypto helper; keep behavior unchanged. |
| `scripts/migrate-from-json.js` | Update migration script import to shared crypto helper. |
| `doc/system/FILE_INDEX.md` | Record `src/shared/crypto/` and legacy adapter. |
| `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` | Mark crypto helper as moved with adapter. |
| `CLAUDE.md` | Add shared crypto location to the quick map. |

## Task 1: Pre-Move Path Safety Test

- [ ] Add `scripts/crypto-helper-smoke.js`.
- [ ] The script must set `process.env.TFD_ENCRYPTION_KEY` to a deterministic 64-char hex string before importing the helper.
- [ ] The script must verify `encrypt()` and `decrypt()` round trip through both shared and legacy import paths.
- [ ] The script must verify `maskKey()` and `secureEqual()` keep existing behavior.
- [ ] The script must verify an invalid `TFD_ENCRYPTION_KEY` length throws after `_resetForTesting()`.
- [ ] The script must verify exported `_KEY_FILE` equals `<repo>/data/.encryption-key`.
- [ ] Run `node scripts\crypto-helper-smoke.js`.
- [ ] Expected output: `crypto-helper smoke ok`.

## Task 2: Move Implementation With Adapter

- [ ] Create `src/shared/crypto/crypto-helper.js`.
- [ ] Use `const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');`.
- [ ] Use `const KEY_FILE = path.join(PROJECT_ROOT, 'data', '.encryption-key');`.
- [ ] Require logger via `../logging/tfd-logger`.
- [ ] Export the existing public API: `encrypt`, `decrypt`, `secureEqual`, `maskKey`, `_resetForTesting`.
- [ ] Also export `_KEY_FILE` for smoke verification only.
- [ ] Replace `utils/crypto-helper.js` with `module.exports = require('../src/shared/crypto/crypto-helper');`.
- [ ] Do not change ciphertext format.
- [ ] Do not change env var name.
- [ ] Do not change `data/.encryption-key` fallback behavior.

## Task 3: Update Runtime Imports

- [ ] In `src/features/translation/keys/user-api-key-storage.js`, import from `../../../../utils/crypto-helper.js` is the old adapter path; use `../../../shared/crypto/crypto-helper.js` from that file's directory.
- [ ] In `scripts/migrate-from-json.js`, import from `../src/shared/crypto/crypto-helper.js`.
- [ ] Leave `utils/crypto-helper.js` adapter in place for any un-migrated old paths.
- [ ] Search with `rg -n "crypto-helper" .` and verify runtime code either uses the shared path or the legacy adapter intentionally.

## Task 4: Documentation And Index Updates

- [ ] Add `src/shared/crypto/` section to `doc/system/FILE_INDEX.md`.
- [ ] Mark `utils/crypto-helper.js` as an adapter in `doc/system/FILE_INDEX.md`.
- [ ] Update `CLAUDE.md` quick map to mention shared crypto and legacy adapter.
- [ ] Update `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` row for `utils/crypto-helper.js` to `done-adapter`.

## Task 5: Verification And Review

- [ ] Run `node scripts\crypto-helper-smoke.js`.
- [ ] Run `node scripts\tfd-logger-smoke.js`.
- [ ] Run `node scripts\message-helpers-smoke.js`.
- [ ] Run `node scripts\translation-smoke.js`.
- [ ] Run `node scripts\link-support-smoke.js`.
- [ ] Run `node --check src\shared\crypto\crypto-helper.js`.
- [ ] Run `node --check utils\crypto-helper.js`.
- [ ] Run `node --check src\features\translation\keys\user-api-key-storage.js`.
- [ ] Run `node --check scripts\migrate-from-json.js`.
- [ ] Run a require-load check for shared crypto, legacy crypto, and user API key storage.
- [ ] Run `git diff --check`; CRLF warnings are acceptable, whitespace errors are not.
- [ ] Review changed files, old adapter path, docs/index, and `rg -n "crypto-helper"` output.
- [ ] Commit locally with `refactor: move crypto helper to shared crypto`.

## Review Criteria

- Existing encrypted API keys remain decryptable because the env var name, AES-GCM format, and fallback key path do not change.
- `data/.encryption-key` is not created, deleted, regenerated, or printed by smoke tests.
- Existing old imports continue to work through `utils/crypto-helper.js`.
- New shared path follows naming convention: `src/shared/crypto/crypto-helper.js`.
- Documentation and inventory reflect both the new real path and the legacy adapter.

## Execution Review

- Status: implemented locally, pending final commit.
- Restore point before this phase: `ed463fa refactor: move tfd logger to shared logging`.
- Safety incident found during verification: `scripts/migrate-from-json.js` executed when required, because it called `main()` at module scope.
- Mitigation applied: `scripts/migrate-from-json.js` now runs only when `require.main === module`, and exports `main`, `migrateConfig`, `migrateApiKeys`, and `backupJsons` for safe require-load checks.
- Side effect from incident: ignored `data/.migration-backup-2026-05-16T06-03-48` was created and `data/tfd.db` timestamp changed during the accidental migration run; these files are not staged and are not part of the commit.
- Review result: runtime crypto imports moved to `src/shared/crypto/crypto-helper.js` where safe; `utils/crypto-helper.js` remains an adapter; docs and inventory now describe both paths.
