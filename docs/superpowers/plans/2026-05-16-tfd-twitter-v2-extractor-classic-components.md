# TFD Twitter V2 Extractor Classic Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move classic Twitter V2 Discord button/component builders out of `twitter-v2-extractor.js` while preserving every existing extractor method name.

**Architecture:** Add a focused helper under `src/features/twitter/extractors/v2/`. The helper owns Discord `ActionRowBuilder`, `ButtonBuilder`, and `ButtonStyle` construction for classic embed messages. The extractor keeps compatibility wrappers and passes callbacks for instance-dependent behavior.

**Tech Stack:** Node.js CommonJS, Discord.js builders.

---

## File Structure

- Create: `src/features/twitter/extractors/v2/classic-components.js`
  - Owns classic pagination, expand/collapse, translate, and reload buttons.
  - Accepts callbacks for `extractImagesFromTweet` and translate button construction.
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
  - Imports `classic-components`.
  - Keeps the current method names as wrappers.
  - Narrows direct Discord.js imports to only builders still used in the extractor file.

## Tasks

### Task 1: Extract classic component builders

**Files:**
- Create: `src/features/twitter/extractors/v2/classic-components.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [ ] **Step 1: Create helper module**

Create `src/features/twitter/extractors/v2/classic-components.js`:

```js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PAGINATION_TYPES = ['multi-image', 'reply-with-media', 'video-with-images'];

function buildPaginationButtons(tweet, tweetType, extractImagesFromTweet) {
    if (!PAGINATION_TYPES.includes(tweetType)) {
        return null;
    }

    try {
        const images = extractImagesFromTweet(tweet);
        if (images.length <= 1) {
            return null;
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`twitter_first_${tweet.id}_0`)
                    .setLabel('⏪')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`twitter_prev_${tweet.id}_0`)
                    .setLabel('◀️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`twitter_page_${tweet.id}_0`)
                    .setLabel('1 / ' + images.length)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`twitter_next_${tweet.id}_1`)
                    .setLabel('▶️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`twitter_last_${tweet.id}_${images.length - 1}`)
                    .setLabel('⏩')
                    .setStyle(ButtonStyle.Secondary)
            );

        return [row];
    } catch (error) {
        return null;
    }
}

function buildExpandToggleButtonComponent(tweetId, isExpanded) {
    return new ButtonBuilder()
        .setCustomId(isExpanded ? `twitter_collapse_${tweetId}` : `twitter_expand_${tweetId}`)
        .setLabel(isExpanded ? '收回全文' : '展開全文')
        .setStyle(ButtonStyle.Secondary);
}

function buildAllToggleButtonComponent(tweetId, isAllExpanded) {
    return new ButtonBuilder()
        .setCustomId(isAllExpanded ? `twitter_collapse_all_${tweetId}` : `twitter_expand_all_${tweetId}`)
        .setLabel(isAllExpanded ? '收回' : '展開')
        .setStyle(ButtonStyle.Secondary);
}

function buildTranslateButtonComponent(tweetId, isTranslated) {
    return new ButtonBuilder()
        .setCustomId(isTranslated ? `twitter_original_${tweetId}` : `twitter_translate_${tweetId}`)
        .setLabel(isTranslated ? '原文' : '翻譯')
        .setStyle(ButtonStyle.Secondary);
}

function addTranslateButtonToComponents(components, tweet, buildTranslateButton) {
    const textContent = tweet.text || '';
    if (textContent.trim().length < 10) {
        return components;
    }

    const translateButton = buildTranslateButton(tweet.id, false);

    if (!components || components.length === 0) {
        return [new ActionRowBuilder().addComponents(translateButton)];
    }

    const firstRow = components[0];
    if (firstRow && firstRow.components && firstRow.components.length < 5) {
        const newFirstRow = new ActionRowBuilder().addComponents(
            translateButton,
            ...firstRow.components
        );
        return [newFirstRow, ...components.slice(1)];
    }

    if (components.length < 5) {
        const newRow = new ActionRowBuilder().addComponents(translateButton);
        return [newRow, ...components];
    }

    return components;
}

function buildReloadButtonComponent(tweetId) {
    return new ButtonBuilder()
        .setCustomId(`twitter_reload_${tweetId}`)
        .setLabel('重整')
        .setStyle(ButtonStyle.Secondary);
}

module.exports = {
    buildPaginationButtons,
    buildExpandToggleButtonComponent,
    buildAllToggleButtonComponent,
    buildTranslateButtonComponent,
    addTranslateButtonToComponents,
    buildReloadButtonComponent,
};
```

- [ ] **Step 2: Import helper and update wrappers**

In `src/features/twitter/extractors/twitter-v2-extractor.js`, import:

```js
const classicComponents = require('./v2/classic-components');
```

Update methods:

```js
buildPaginationButtons(tweet, tweetType) {
    return classicComponents.buildPaginationButtons(tweet, tweetType, item => this.extractImagesFromTweet(item));
}

buildExpandToggleButtonComponent(tweetId, isExpanded) {
    return classicComponents.buildExpandToggleButtonComponent(tweetId, isExpanded);
}

buildAllToggleButtonComponent(tweetId, isAllExpanded) {
    return classicComponents.buildAllToggleButtonComponent(tweetId, isAllExpanded);
}

buildTranslateButtonComponent(tweetId, isTranslated) {
    return classicComponents.buildTranslateButtonComponent(tweetId, isTranslated);
}

addTranslateButtonToComponents(components, tweet) {
    return classicComponents.addTranslateButtonToComponents(
        components,
        tweet,
        (tweetId, isTranslated) => this.buildTranslateButtonComponent(tweetId, isTranslated)
    );
}
```

Update prototype reload wrapper:

```js
TFDTwitterExtractor.prototype.buildReloadButtonComponent = function(tweetId) {
    return classicComponents.buildReloadButtonComponent(tweetId);
};
```

- [ ] **Step 3: Narrow Discord.js imports**

Change:

```js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
```

to:

```js
const { EmbedBuilder, ActionRowBuilder } = require('discord.js');
```

- [ ] **Step 4: Verify behavior**

Run:

```powershell
node --check src\features\twitter\extractors\v2\classic-components.js
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node -e "const c=require('./src/features/twitter/extractors/v2/classic-components'); const tweet={id:'abc',text:'this text is long enough',media:{all:[{type:'photo',url:'https://p/1.jpg'},{type:'photo',url:'https://p/2.jpg'}]}}; const rows=c.buildPaginationButtons(tweet,'multi-image',t=>t.media.all); console.log(rows.length, rows[0].components.length, c.buildReloadButtonComponent('abc').data.custom_id); process.exit(0)"
node -e "const T=require('./src/features/twitter/extractors/twitter-v2-extractor'); const x=new T(); const tweet={id:'abc',text:'this text is long enough',media:{all:[{type:'photo',url:'https://p/1.jpg'},{type:'photo',url:'https://p/2.jpg'}]}}; const rows=x.buildPaginationButtons(tweet,'multi-image'); const translated=x.addTranslateButtonToComponents(null,tweet); console.log(rows.length, rows[0].components.length, translated.length, x.buildReloadButtonComponent('abc').data.custom_id); process.exit(0)"
```

Expected:
- Syntax checks pass.
- Helper behavior prints `1 5 twitter_reload_abc`.
- Extractor behavior prints `1 5 1 twitter_reload_abc`.

- [ ] **Step 5: Review and commit**

Run:

```powershell
node -e "require('./tfd-system/extractors/twitter-v2'); require('./handlers/twitter-v2-interactions'); console.log('twitter classic components split ok'); process.exit(0)"
node scripts\translation-smoke.js
rg -n "classic-components|buildPaginationButtons\(|buildExpandToggleButtonComponent\(|buildAllToggleButtonComponent\(|buildTranslateButtonComponent\(|addTranslateButtonToComponents\(|buildReloadButtonComponent\(" src\features\twitter tfd-system handlers events
rg -n "twitter-posting-handler|gemini-translator|twitter-api-v2|X_CONSUMER|X_ACCESS_TOKEN" src utils handlers events commands tfd-system package.json package-lock.json
git diff --check
git status --short
git add docs\superpowers\plans\2026-05-16-tfd-twitter-v2-extractor-classic-components.md src\features\twitter\extractors\twitter-v2-extractor.js src\features\twitter\extractors\v2\classic-components.js
git commit -m "refactor: extract twitter v2 classic components"
```

Expected:
- Existing adapter load still passes.
- Translation smoke still passes.
- No legacy posting/Gemini/Twitter API dependency references return.
- Commit is local only; no push or deploy.

## Self-Review

- Spec coverage: This plan extracts only classic embed component builders, not V2 container builders.
- Placeholder scan: No placeholders remain.
- Compatibility: Existing extractor method names remain available to interaction handlers and `message-handler-v2`.
