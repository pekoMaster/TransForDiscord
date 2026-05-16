# Twitter Quote Auto Expand Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the imported Twitter quote display rules so quote tweets choose the correct V1/V2 layout and expansion state.

**Architecture:** Keep quote-display decisions in a pure policy helper, then call that helper from the extractor and interaction handlers. Prefer existing V2 rebuild paths for V1->V2 expansion, and keep V2 initial state cached so later interactions reflect the displayed message.

**Tech Stack:** Node.js, discord.js, existing TFD Twitter extractor/interactions, smoke tests.

---

### Task 1: Quote Display Policy

**Files:**
- Create: `src/features/twitter/extractors/v2/quote-display-policy.js`
- Create: `scripts/twitter-quote-display-policy-smoke.js`
- Modify: `doc/system/FILE_INDEX.md`

- [x] **Step 1: Write smoke coverage for the four imported scenarios**

Create `scripts/twitter-quote-display-policy-smoke.js` and assert:
- no quoter images + no quoted video => V1, quote expanded
- quoter images + no quoted video => V1, quote collapsed
- no quoter images + quoted video => V2, quote expanded
- quoter images + quoted video => V1, quote collapsed, V1 expand transitions to V2, V2 collapse transitions to V1

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-quote-display-policy-smoke.js`
Expected: fails because `quote-display-policy.js` does not exist.

- [x] **Step 3: Implement pure policy helper**

Create `src/features/twitter/extractors/v2/quote-display-policy.js` with:
- `getQuoteDisplayPolicy(input)`
- `shouldTransitionV1QuoteToV2(input)`
- `shouldTransitionV2QuoteToV1(input)`

- [x] **Step 4: Run smoke to verify GREEN**

Run: `node scripts\twitter-quote-display-policy-smoke.js`
Expected: `twitter quote display policy smoke ok`.

### Task 2: Extractor Initial Display State

**Files:**
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
- Modify: `tfd-system/core/message-handler-v2.js`

- [x] **Step 1: Import and apply quote policy before generic video routing**

Compute quote info and the policy before `videoTypes.includes(tweetType)`. If policy says V2, call `handleVideoTweetV2(..., { isQuoteShown: true })`.

- [x] **Step 2: Use the policy for V1 embed default expansion**

Pass `quotePolicy.shouldAutoExpandQuote` into `buildEnhancedEmbed(...)` and `buildAllToggleButtonComponent(...)`.

- [x] **Step 3: Preserve initial V2 state**

Allow `handleVideoTweetV2` to accept `v2Options`, pass state into `buildV2Container`, and return `initialV2State`. Cache that state in `sendTwitterV2` instead of hardcoding quote/reply/expanded to false.

- [x] **Step 4: Verify syntax and require-load**

Run `node --check` on touched files and require-load the extractor plus message handler.

### Task 3: Interaction Transition Hooks

**Files:**
- Modify: `src/features/twitter/interactions/toggle-all.js`
- Modify: `src/features/twitter/interactions/v2/toggle-handler.js`
- Modify: `src/features/twitter/interactions/v2/shared.js`

- [x] **Step 1: Add V1 expand transition hook**

When V1 all-toggle expands a quote tweet where the quoter has images and the quoted tweet has video, call the existing V2 rebuild path with `isQuoteShown: true`, `isExpanded: true`, and the original marker text.

- [x] **Step 2: Add marker extraction fallback**

Let `extractMarkerTextFromMessage` read V1 message `content` as well as V2 TextDisplay markers.

- [x] **Step 3: Add V2 collapse transition fallback**

When V2 all-toggle collapses a quote tweet with quoted video, try editing the existing message to a V1 embed first. If Discord rejects the Components V2 -> Embed edit, send a new bot V1 message and delete the old V2 message.

- [x] **Step 4: Verify syntax, smoke, and search fallout**

Run smoke tests, `node --check`, require-load, and `rg` for new policy functions/call sites.

### Review Checklist

- [x] Confirm no `4.0` files changed.
- [x] Confirm no push or deploy occurred.
- [x] Confirm old untracked `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/` remain unstaged.
- [x] Confirm all new paths are listed in `doc/system/FILE_INDEX.md`.
- [x] Confirm Twitter extractor, V1 toggle, V2 toggle, shared marker extraction, and V2 send state are aligned.
