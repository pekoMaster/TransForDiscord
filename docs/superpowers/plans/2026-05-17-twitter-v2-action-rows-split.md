# Twitter V2 Action Rows Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Twitter V2 button/action-row construction out of the V2 container builder while preserving existing Discord payload behavior.

**Architecture:** Add `src/features/twitter/containers/v2/action-rows.js` for V2 translate, expand/collapse, reload, and report buttons. `v2-container-builder.js` keeps layout/media/footer responsibilities and delegates action-row creation to the helper.

**Tech Stack:** Node.js CommonJS, discord.js builders, smoke tests.

---

### Task 1: Add Action Row Helper

**Files:**
- Create: `src/features/twitter/containers/v2/action-rows.js`
- Create: `scripts/twitter-v2-action-rows-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Create a smoke test that asserts:
- translated state uses `v2_original_*`
- untranslated state uses `v2_translate_*`
- expanded state uses `v2_collapse_all_*`
- collapsed state uses `v2_expand_all_*`
- every row has 1-5 components
- reload and report buttons are always included

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-action-rows-smoke.js`
Expected: fails because `src/features/twitter/containers/v2/action-rows.js` does not exist.

- [x] **Step 3: Implement helper**

Implement `buildV2ActionRows(tweet, options)` and keep it deterministic with an optional `reportId` value for tests.

- [x] **Step 4: Run smoke to verify GREEN**

Run: `node scripts\twitter-v2-action-rows-smoke.js`
Expected: `twitter v2 action rows smoke ok`.

### Task 2: Delegate Builder Buttons

**Files:**
- Modify: `src/features/twitter/containers/v2-container-builder.js`

- [x] **Step 1: Remove button imports from builder**

Remove `ActionRowBuilder`, `ButtonBuilder`, and `ButtonStyle` from the builder import list if no longer used directly.

- [x] **Step 2: Call helper**

Replace the inline button construction with:

```js
for (const row of buildV2ActionRows(tweet, {
    isTranslated,
    isQuoteShown,
    isReplyShown,
    isExpanded,
    hasTruncated
})) {
    container.addActionRowComponents(row);
}
```

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] **Step 1: Update docs**

Document `containers/v2/action-rows.js` and `scripts/twitter-v2-action-rows-smoke.js`.

- [x] **Step 2: Verify and review**

Run:
- `node scripts\twitter-v2-action-rows-smoke.js`
- `node --check` on touched runtime files
- require-load helper and builder
- `rg` for `ActionRowBuilder|ButtonBuilder|ButtonStyle|buildV2ActionRows`
- `git diff --check`

- [ ] **Step 3: Local commit**

Commit only this phase. Do not stage unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, or `tools/`.
