# TFD Shared HTTP Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the shared Axios HTTP client from `tfd-system/utils/http-client.js` to `src/shared/http/http-client.js` without changing network behavior, retry behavior, config defaults, or extractor call sites.

**Architecture:** The real implementation belongs under shared HTTP utilities because it is used by site extractors and Twitter interaction helpers. Keep `tfd-system/utils/http-client.js` as a legacy adapter while direct runtime consumers move to `src/shared/http/http-client.js`.

**Tech Stack:** Node.js CommonJS, Axios, existing TFD config JSON, shared TFD logger, local smoke scripts.

---

## Safety Boundaries

- Do not push or deploy.
- Current pre-phase restore point: `58b70c2 refactor: move embed builder to shared discord`.
- Keep `tfd-system/utils/http-client.js` as an adapter.
- Do not change timeout, retry, bot-block status handling, return object shape, headers, or fetchHTML/fetchJSON semantics.
- Do not make real network calls in smoke tests.
- Do not stage unrelated untracked `SQL/migrate_blacklist_from_4.0.sql`.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/http/http-client.js` | Real `HTTPClient` implementation. Reads `tfd-system/config/tfd-config.json` from the stable root-relative path and logs through `src/shared/logging/tfd-logger.js`. |
| `tfd-system/utils/http-client.js` | Legacy adapter re-exporting `src/shared/http/http-client.js`. |
| `scripts/http-client-smoke.js` | Verifies shared and legacy imports match, config defaults, request success/failure shapes, JSON parsing, HTML errors, URL checks, backoff, and no-network mocked behavior. |
| `src/features/twitter/**` | Update Twitter runtime imports to shared HTTP client. |
| `tfd-system/extractors/**` | Update extractor runtime imports to shared HTTP client. |
| `doc/system/FILE_INDEX.md` | Record shared helper and legacy adapter. |
| `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` | Mark HTTP client as moved with adapter. |
| `CLAUDE.md` | Add shared HTTP client location to quick map. |

## Task 1: Add Smoke Coverage

- [x] Create `scripts/http-client-smoke.js`.
- [x] Assert `require('../tfd-system/utils/http-client') === require('../src/shared/http/http-client')`.
- [x] Assert constructor reads `timeout`, `maxRetries`, `userAgent`, and `maxContentLength` from `tfd-system/config/tfd-config.json`.
- [x] Mock `client(config)` to verify `request()` success returns `{ success, data, status, headers, url }`.
- [x] Mock `client(config)` to verify bot-block status returns failure immediately and does not retry.
- [x] Mock `client(config)` to verify normal errors retry up to `maxRetries`.
- [x] Mock `get()` to verify `fetchHTML()` returns string on success and error object on failure.
- [x] Mock `get()` to verify `fetchJSON()` parses string JSON, returns object JSON unchanged, and returns `null` on parse or request failure.
- [x] Mock `client.head()` to verify `checkURL()` true/false.
- [x] Run `node scripts\http-client-smoke.js`; expected output: `http-client smoke ok`.

## Task 2: Move Implementation With Adapter

- [x] Move implementation to `src/shared/http/http-client.js`.
- [x] Change config import from `../config/tfd-config.json` to `../../../tfd-system/config/tfd-config.json`.
- [x] Change logger import from `../../utils/tfd-logger` to `../logging/tfd-logger`.
- [x] Preserve public class name `HTTPClient`.
- [x] Preserve all public methods: `get`, `request`, `fetchHTML`, `fetchJSON`, `checkURL`, `calculateBackoff`, `sleep`, `log`.
- [x] Replace `tfd-system/utils/http-client.js` with `module.exports = require('../../src/shared/http/http-client');`.

## Task 3: Update Runtime Imports

- [x] Update `tfd-system/extractors/*` direct imports from `../utils/http-client` to `../../src/shared/http/http-client`.
- [x] Update `src/features/twitter/interactions/*.js` imports from `../../../../tfd-system/utils/http-client` to `../../../shared/http/http-client`.
- [x] Update `src/features/twitter/interactions/v2/tweet-data.js` import to `../../../../shared/http/http-client`.
- [x] Update `src/features/twitter/extractors/*.js` imports to `../../../shared/http/http-client`.
- [x] Run `rg -n "tfd-system/utils/http-client|utils/http-client|shared/http/http-client|http-client.js"` and verify old runtime paths are adapter-only or historical docs.

## Task 4: Documentation And Inventory

- [x] Add `src/shared/http/` section to `doc/system/FILE_INDEX.md`.
- [x] Mark `tfd-system/utils/http-client.js` as a legacy adapter in `doc/system/FILE_INDEX.md`.
- [x] Update `CLAUDE.md` quick map with the new shared HTTP client path.
- [x] Update `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` to `done-adapter`.

## Task 5: Verification And Review

- [x] Run `node scripts\http-client-smoke.js`.
- [x] Run `node scripts\translation-smoke.js`.
- [x] Run `node --check src\shared\http\http-client.js`.
- [x] Run `node --check tfd-system\utils\http-client.js`.
- [x] Run `node --check` on changed Twitter/extractor files.
- [x] Run a require-load check for shared HTTP client, legacy adapter, and changed modules. Stub existing optional browser dependencies such as `puppeteer` when loading Facebook modules.
- [x] Compare old `HEAD:tfd-system/utils/http-client.js` behavior against new shared implementation for mocked success, bot-block failure, retry failure, JSON parsing, HTML errors, and URL check cases.
- [x] Run `git diff --check`; CRLF warnings are acceptable, whitespace errors are not.
- [x] Review changed files, old adapter path, docs/index, `rg` output, and staged files to confirm `SQL/` is excluded.
- [x] Commit locally with `refactor: move http client to shared http`.

## Review Criteria

- Existing old imports continue to work through `tfd-system/utils/http-client.js`.
- New shared path follows naming convention: `src/shared/http/http-client.js`.
- Runtime Twitter and extractor files import the shared path directly.
- Config path still resolves to `tfd-system/config/tfd-config.json`.
- Public method behavior is covered by smoke tests and parity check.
- Documentation and inventory reflect both the new real path and the legacy adapter.

## Execution Review

- `scripts/http-client-smoke.js`, `scripts/translation-smoke.js`, `scripts/dom-parser-smoke.js`, and `scripts/embed-builder-smoke.js` passed.
- `node --check` passed for `src/shared/http/http-client.js`, the legacy adapter, the smoke script, and every changed Twitter/extractor runtime file.
- Require-load passed for the shared implementation, adapter, and changed runtime modules when existing optional browser dependencies (`puppeteer`, `playwright`) were stubbed.
- Parity check passed against `HEAD:tfd-system/utils/http-client.js` for constructor config, request success, bot-block no-retry, normal retry failure, HTML/JSON helpers, `checkURL`, and backoff.
- `rg` confirmed old HTTP client runtime paths are adapter-only; historical plan files still mention old paths by design.
- `git diff --check` passed with only existing CRLF normalization warnings and no whitespace errors.
