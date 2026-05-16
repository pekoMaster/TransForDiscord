# TFD Shared Tunnel URL Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Cloudflare Tunnel URL helper from `tfd-system/utils/tunnel-url-provider.js` to `src/shared/web/tunnel-url-provider.js` without changing config path, cache behavior, status shape, or URL conversion semantics.

**Architecture:** The real implementation belongs under shared web utilities because it reads project-level tunnel state and can be reused by future rendering/proxy features. Keep `tfd-system/utils/tunnel-url-provider.js` as a legacy adapter so any old path still works.

**Tech Stack:** Node.js CommonJS, built-in `fs`/`path`, existing TFD logger, local no-network smoke script.

---

## Safety Boundaries

- Do not push or deploy.
- Current pre-phase restore point: `743eca8 refactor: move http client to shared http`.
- Keep `tfd-system/utils/tunnel-url-provider.js` as an adapter.
- Do not create, edit, or delete real `data/cloudflare_tunnel.json`.
- Do not stage unrelated untracked `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, or `tools/`.
- Preserve public exports: `isTunnelAvailable`, `getTunnelBaseUrl`, `getTwitterEmbedUrl`, `convertTwitterUrl`, `getTunnelStatus`, `clearCache`.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/web/tunnel-url-provider.js` | Real Tunnel URL provider implementation. Reads `data/cloudflare_tunnel.json` from the stable project-root path and logs through shared TFD logger. |
| `tfd-system/utils/tunnel-url-provider.js` | Legacy adapter re-exporting `src/shared/web/tunnel-url-provider.js`. |
| `scripts/tunnel-url-provider-smoke.js` | Verifies shared and legacy imports match, active/inactive/missing config behavior, Twitter URL conversion, cache, and parse-error handling without touching real data files. |
| `doc/system/FILE_INDEX.md` | Records shared web helper and old adapter. |
| `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` | Marks tunnel URL provider as moved with adapter. |
| `CLAUDE.md` | Adds shared web helper to the quick shared-module map. |

## Task 1: Add Smoke Coverage

- [x] Create `scripts/tunnel-url-provider-smoke.js`.
- [x] Assert `require('../tfd-system/utils/tunnel-url-provider') === require('../src/shared/web/tunnel-url-provider')`.
- [x] Monkey-patch `fs.existsSync` and `fs.readFileSync` only for paths ending in `data/cloudflare_tunnel.json`; restore both functions in `finally`.
- [x] Verify active config preserves the existing `isTunnelAvailable()` string return (`current_url`), `getTunnelBaseUrl()` as the configured URL, `getTwitterEmbedUrl('123')` as `${base}/embed/twitter/123`, and `convertTwitterUrl('https://x.com/user/status/123')` as the same embed URL.
- [x] Verify inactive config returns unavailable status and no base URL.
- [x] Verify missing config returns `getTunnelStatus()` shape `{ available: false, url: null, lastUpdated: null }`.
- [x] Verify invalid JSON is handled as unavailable after `clearCache()`.
- [x] Verify cache behavior by changing the fake file contents before `clearCache()` and confirming the old value remains until the cache is cleared.
- [x] Run `node scripts\tunnel-url-provider-smoke.js`; expected output: `tunnel-url-provider smoke ok`.

## Task 2: Move Implementation With Adapter

- [x] Create `src/shared/web/` if missing.
- [x] Move implementation to `src/shared/web/tunnel-url-provider.js`.
- [x] Change logger import from `../../utils/tfd-logger` to `../logging/tfd-logger`.
- [x] Change `CONFIG_PATH` from `path.join(__dirname, '..', '..', 'data', 'cloudflare_tunnel.json')` to `path.join(__dirname, '..', '..', '..', 'data', 'cloudflare_tunnel.json')`.
- [x] Replace `tfd-system/utils/tunnel-url-provider.js` with `module.exports = require('../../src/shared/web/tunnel-url-provider');`.
- [x] Preserve all public exports and function names.

## Task 3: Update Documentation And Inventory

- [x] Add `src/shared/web/` section to `doc/system/FILE_INDEX.md`.
- [x] Mark `tfd-system/utils/tunnel-url-provider.js` as a legacy adapter in `doc/system/FILE_INDEX.md`.
- [x] Add `scripts/tunnel-url-provider-smoke.js` to the scripts section in `doc/system/FILE_INDEX.md`.
- [x] Update `CLAUDE.md` shared map with `src/shared/web/tunnel-url-provider.js`.
- [x] Update `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` action to `done-adapter`.

## Task 4: Verification And Review

- [x] Run `node scripts\tunnel-url-provider-smoke.js`.
- [x] Run `node --check src\shared\web\tunnel-url-provider.js`.
- [x] Run `node --check tfd-system\utils\tunnel-url-provider.js`.
- [x] Run `node --check scripts\tunnel-url-provider-smoke.js`.
- [x] Run `rg -n "tunnel-url-provider|shared/web/tunnel-url-provider|convertTwitterUrl|getTunnelStatus" src tfd-system utils handlers events commands scripts doc\system CLAUDE.md docs\superpowers\specs\2026-05-15-tfd-file-inventory-and-refactor-map.md` and verify old runtime path is adapter-only or documentation.
- [x] Compare old `HEAD:tfd-system/utils/tunnel-url-provider.js` behavior against new shared implementation for active, inactive, missing, invalid JSON, cache, and Twitter URL conversion.
- [x] Run `git diff --check`; CRLF warnings are acceptable, whitespace errors are not.
- [x] Review changed files, adapter path, docs/index, search output, and staged files to confirm unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/` are excluded.
- [x] Commit locally with `refactor: move tunnel url provider to shared web`.

## Review Criteria

- Existing old imports continue to work through `tfd-system/utils/tunnel-url-provider.js`.
- New shared path follows naming convention: `src/shared/web/tunnel-url-provider.js`.
- Config path still resolves to project-root `data/cloudflare_tunnel.json`.
- Public export names and return shapes are unchanged.
- Documentation and inventory reflect both the new real path and the legacy adapter.

## Execution Review

- `scripts/tunnel-url-provider-smoke.js` passed without touching real `data/cloudflare_tunnel.json`.
- Smoke coverage preserves the old `isTunnelAvailable()` active return value as `current_url` string rather than changing it to boolean.
- `node --check` passed for `src/shared/web/tunnel-url-provider.js`, the legacy adapter, and the smoke script.
- Parity check passed against `HEAD:tfd-system/utils/tunnel-url-provider.js` for active, inactive, missing config, invalid JSON, cache behavior, and Twitter URL conversion.
- `rg` confirmed old tunnel provider runtime path is adapter-only; remaining mentions are documentation, smoke, and the new shared implementation.
- `git diff --check` passed with only CRLF normalization warnings and no whitespace errors.
- Staged review included only this phase's seven files and excluded unrelated untracked `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/`.
