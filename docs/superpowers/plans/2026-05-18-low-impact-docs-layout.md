# Low Impact Docs Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize docs-only files into `docs/` while preserving old `doc/` and root paths through lightweight stubs.

**Architecture:** Move canonical document content to topic folders under `docs/`, then leave old paths as compatibility pointers so historical plans, public references, and user bookmarks do not break immediately. Runtime code is not changed.

**Tech Stack:** Markdown, Git file moves, ripgrep reference checks, Node.js syntax/load smoke checks.

---

### Task 1: Move Canonical Docs

**Files:**
- Move: `TFD_UNIFIED_SPEC.md` -> `docs/archive/TFD_UNIFIED_SPEC.md`
- Move: `doc/INTENT_APPLICATION.md` -> `docs/discord/intent-application.md`
- Move: `doc/PRIVACY_POLICY.md` -> `docs/legal/privacy-policy.md`
- Move: `doc/TERMS_OF_SERVICE.md` -> `docs/legal/terms-of-service.md`
- Move: `doc/PUBLIC_RELEASE_REFACTOR.md` -> `docs/archive/public-release-refactor.md`
- Move: `doc/TWITTER_TRANSLATE_AUTO_TRANSLATE_ON_EXPAND_2026-04-12.md` -> `docs/archive/twitter/translate-auto-expand.md`
- Move: `doc/tfd-1-4-0-blacklist-plan.md` -> `docs/archive/moderation/tfd-1-4-0-blacklist-plan.md`
- Move: `doc/system/FILE_INDEX.md` -> `docs/system/file-index.md`
- Move: `doc/specs/ORACLE_CLOUD_SETUP_GUIDE.md` -> `docs/deploy/oracle-cloud-setup-guide.md`
- Move: `doc/specs/TFD_COST_MODEL_AND_PRICING_SPEC.md` -> `docs/product/cost-model-and-pricing.md`
- Move: `doc/specs/TFD_DATA_MODEL_AND_STATE_MACHINE_SPEC.md` -> `docs/product/data-model-and-state-machine.md`
- Move: `doc/specs/TFD_DISCORD_PRODUCT_FLOW_SPEC.md` -> `docs/product/discord-product-flow.md`
- Move: `doc/specs/TFD_MODEL_PRICING_RESEARCH.md` -> `docs/research/model-pricing.md`
- Move: `doc/specs/TFD_ORACLE_DEPLOYMENT_PLAN.md` -> `docs/deploy/oracle-deployment-plan.md`
- Move: `doc/specs/TFD_TRANSLATION_MONETIZATION_PLAN.md` -> `docs/product/translation-monetization-plan.md`
- Move: `doc/specs/TFD_WALLET_AND_BILLING_SPEC.md` -> `docs/product/wallet-and-billing.md`

- [x] Create required target directories.
- [x] Move each canonical document with `git mv`.
- [x] Leave old paths as Markdown stubs pointing to the new canonical path.

### Task 2: Update Current References

**Files:**
- Modify: moved canonical docs as needed.
- Modify: `docs/system/file-index.md`.
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`.

- [x] Update canonical docs that reference peer moved docs.
- [x] Update current file index to list canonical docs and old compatibility stubs.
- [x] Mark moved docs in the refactor map as `done-adapter`.

### Task 3: Remove Verified Dead Legacy Adapters

**Files:**
- Delete: `utils/blacklist-manager.js`
- Delete: `utils/openrouter-translator.js`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`
- Modify: `docs/system/file-index.md`

- [x] Confirm no runtime imports reference `utils/blacklist-manager.js`.
- [x] Confirm no runtime imports reference `utils/openrouter-translator.js`.
- [x] Delete the verified dead legacy files.
- [x] Mark removed and already-missing delete candidates in the refactor map.

### Task 4: Verify and Review

**Files:**
- Review all moved docs, stubs, map updates, and references.

- [x] Search old and new docs paths with `rg`.
- [x] Verify core JavaScript entrypoints still parse/load because runtime should be untouched.
- [x] Run `git diff --check`.
- [x] Review staged scope before committing.
