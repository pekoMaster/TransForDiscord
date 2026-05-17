# Twitter V2 To V1 Transition Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move V2-to-V1 quote collapse transition logic out of `toggle-handler.js`.

**Architecture:** Add `src/features/twitter/interactions/v2/v1-transition.js` to own classic embed payload creation and edit/send fallback behavior. `toggle-handler.js` keeps deciding when transition is needed and delegates the transition execution.

**Tech Stack:** Node.js CommonJS, Discord.js builders, pure smoke tests with injected extractor/logger.

---

### Task 1: Add V1 Transition Helper

**Files:**
- Create: `src/features/twitter/interactions/v2/v1-transition.js`
- Create: `scripts/twitter-v2-v1-transition-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Assert:
- `buildV1TransitionPayload` returns `null` without cached tweet.
- `buildV1TransitionPayload` returns `null` when enhanced embed is missing.
- payload preserves marker text, uses one embed, and adds translate/reload controls.
- `transitionV2ToV1` returns `true` when `interaction.editReply(payload)` succeeds.

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-v1-transition-smoke.js`
Expected: fails because `v1-transition.js` does not exist.

- [x] **Step 3: Implement helper**

Move `transitionV2ToV1` behavior from `toggle-handler.js` into `v1-transition.js`.
Also expose `buildV1TransitionPayload(interaction, tweetId, cached, options)` for smoke coverage.
Allow dependency injection for extractor and logger while preserving default runtime behavior.

- [x] **Step 4: Run smoke to verify GREEN**

Run: `node scripts\twitter-v2-v1-transition-smoke.js`
Expected: `twitter v2 v1 transition smoke ok`.

### Task 2: Update Toggle Handler

**Files:**
- Modify: `src/features/twitter/interactions/v2/toggle-handler.js`

- [x] **Step 1: Delegate transition**

Import `transitionV2ToV1` from `./v1-transition`.
Remove local `transitionV2ToV1` and imports that only supported it: `ActionRowBuilder` and `extractMarkerTextFromMessage`.
Keep transition decision and warning log unchanged.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `src/features/twitter/README.md`

- [x] **Step 1: Update docs**

Document `interactions/v2/v1-transition.js` and `scripts/twitter-v2-v1-transition-smoke.js`.

- [x] **Step 2: Verify and review**

Run:
- `node scripts\twitter-v2-v1-transition-smoke.js`
- `node scripts\twitter-v2-view-message-state-smoke.js`
- `node scripts\twitter-quote-display-policy-smoke.js`
- `node --check` on touched runtime files
- require-load `v1-transition`, `toggle-handler`, `reload-handler`, `translate-handler`
- `rg` for `transitionV2ToV1|buildV1TransitionPayload|v1-transition|ActionRowBuilder|extractMarkerTextFromMessage`
- `git diff --check`

- [x] **Step 3: Local commit**

Commit only this phase. Do not push or deploy.

---

## Self-Review

- Spec coverage: This plan moves only V2-to-V1 transition construction/execution, preserving the existing transition decision in `toggle-handler.js`.
- Placeholder scan: No TODO/TBD/fill-in placeholders remain.
- Type consistency: `transitionV2ToV1` keeps the same `(interaction, tweetId, cached)` runtime signature.
