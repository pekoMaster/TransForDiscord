# TFD 项目 - 推特翻译功能增强：展开时自动翻译

**修复日期**: 2026-04-12
**问题描述**: 已翻译状态下展开引用/回覆原文时，不会自动翻译这些原文
**核心需求**: 已翻译状态下展开引用/回覆原文时，这些原文也应该自动被翻译，并更新到缓存中
**应用范围**: TFD 项目（TransForDiscord）

---

## 📋 问题分析

### 存在的问题

当用户已经点击翻译后，再点击「展开引用」或「展开回覆」按钮时：
- ❌ 系统只显示引用/回覆的原文
- ❌ **不会自动翻译这些原文**
- ❌ 用户需要手动再次点击翻译按钮才能看到翻译

### 用户需求

**当用户已经点击翻译后，如果再展开引用/回覆的原文时，这些被展开的原文也应该自动被翻译，并更新到缓存中。**

---

## 🔧 修复内容

### 修改文件清单

1. `handlers/twitter-pagination-interactions.js` - V1 分页交互处理器（旧版）
2. `handlers/twitter-v2-interactions.js` - V2 Container 交互处理器（新版）

---

### 修复 1：V1 分页交互处理器

**文件**: `handlers/twitter-pagination-interactions.js`

#### 1.1 引入翻译模块

```javascript
// 引入翻译相关模块
const { getTranslationState, setTranslationState } = require('./twitter-translate-interactions.js');
const { getInstance: getApiKeyService } = require('../utils/user-api-key-service.js');
const { getInstance: getGeminiTranslator } = require('../utils/gemini-translator.js');
```

#### 1.2 修改 handleShowQuote 方法

```javascript
async handleShowQuote(interaction, tweetId) {
    // ... 获取推文数据 ...

    // 检查当前是否处于翻译状态
    const translationState = getTranslationState(tweetId);
    const isTranslated = translationState && translationState.isTranslated;

    // 如果处于翻译状态，需要翻译引用推文
    let displayContent = rawQuoteContent;
    if (isTranslated) {
        console.log(`[Twitter引用] 当前为翻译状态，正在翻译引用推文: ${quoteTweet.id}`);

        // 检查是否已有引用推文的翻译缓存
        let translatedQuoteText = translationState.translatedQuoteText;

        if (!translatedQuoteText) {
            // 没有缓存，需要翻译
            translatedQuoteText = await this.translateQuoteOrReply(
                quoteTweet,
                translationState,
                tweetId,
                interaction.user.id,
                'quote'
            );
        }

        if (translatedQuoteText) {
            displayContent = translatedQuoteText;
        }
    }

    // 使用 displayContent 显示（翻译后的或原文）
    // ...
}
```

#### 1.3 修改 handleShowReply 方法

```javascript
async handleShowReply(interaction, tweetId) {
    // ... 获取推文数据 ...

    // 检查当前是否处于翻译状态
    const translationState = getTranslationState(tweetId);
    const isTranslated = translationState && translationState.isTranslated;

    // 如果处于翻译状态，需要翻译回覆推文
    let displayContent = rawReplyContent;
    if (isTranslated) {
        console.log(`[Twitter回覆] 当前为翻译状态，正在翻译回覆推文: ${replyTweet.id}`);

        // 检查是否已有回覆推文的翻译缓存
        let translatedReplyText = translationState.translatedReplyText;

        if (!translatedReplyText) {
            // 没有缓存，需要翻译
            translatedReplyText = await this.translateQuoteOrReply(
                replyTweet,
                translationState,
                tweetId,
                interaction.user.id,
                'reply'
            );
        }

        if (translatedReplyText) {
            displayContent = translatedReplyText;
        }
    }

    // 使用 displayContent 显示（翻译后的或原文）
    // ...
}
```

#### 1.4 添加翻译辅助函数

```javascript
/**
 * 翻译引用或回覆推文（用於展开时自动翻译）
 */
async translateQuoteOrReply(tweetToTranslate, translationState, mainTweetId, userId, type) {
    try {
        // 检查用户是否有 API Key
        const apiKeyService = getApiKeyService();
        const userApiKey = await apiKeyService.getApiKey(userId, 'gemini');

        if (!userApiKey) {
            console.log('[Twitter翻译] 用户没有 API Key，返回原文');
            return null;
        }

        // 执行翻译
        const geminiTranslator = getGeminiTranslator();
        const translateOptions = { targetLanguage: '繁體中文' };

        if (tweetToTranslate.author?.name) {
            translateOptions.authorName = tweetToTranslate.author.name;
        }

        const translateResult = await geminiTranslator.translateWithUserKey(
            tweetToTranslate.text || '',
            userApiKey,
            translateOptions
        );

        if (!translateResult.success) {
            console.error(`[Twitter翻译] ${type === 'quote' ? '引用' : '回覆'}翻译失败:`, translateResult.errorType);
            return null;
        }

        const translatedText = translateResult.text;

        // 更新翻译状态缓存
        if (type === 'quote') {
            translationState.translatedQuoteText = translatedText;
        } else {
            translationState.translatedReplyText = translatedText;
        }
        setTranslationState(mainTweetId, translationState);

        console.log(`[Twitter翻译] ${type === 'quote' ? '引用' : '回覆'}翻译成功并已缓存`);
        return translatedText;

    } catch (error) {
        console.error(`[Twitter翻译] ${type === 'quote' ? '引用' : '回覆'}翻译异常:`, error);
        return null;
    }
}
```

---

### 修复 2：V2 Container 交互处理器

**文件**: `handlers/twitter-v2-interactions.js`

#### 2.1 修改展开逻辑

```javascript
// 取得引用/回覆资料（如果展开）
let quoteData = null;
let replyData = null;

if (state.isQuoteShown) {
    quoteData = getQuoteData(tweet);

    // 如果处于翻译状态但没有引用推文的翻译，自动翻译
    if (state.isTranslated && !state.translatedQuoteText && quoteData?.tweet?.text) {
        console.log(`[V2-Interaction] 展开引用时检测到翻译状态，开始翻译引用推文`);
        const quoteTranslateResult = await translateQuoteOrReply(
            quoteData.tweet,
            tweetId,
            interaction.user.id,
            'quote'
        );
        if (quoteTranslateResult) {
            state.translatedQuoteText = quoteTranslateResult;
            console.log(`[V2-Interaction] 引用推文翻译成功`);
        }
    }
}

if (state.isReplyShown) {
    replyData = await getReplyData(tweet);

    // 如果处于翻译状态但没有回覆推文的翻译，自动翻译
    if (state.isTranslated && !state.translatedReplyText && replyData?.tweet?.text) {
        console.log(`[V2-Interaction] 展开回覆时检测到翻译状态，开始翻译回覆推文`);
        const replyTranslateResult = await translateQuoteOrReply(
            replyData.tweet,
            tweetId,
            interaction.user.id,
            'reply'
        );
        if (replyTranslateResult) {
            state.translatedReplyText = replyTranslateResult;
            console.log(`[V2-Interaction] 回覆推文翻译成功`);
        }
    }
}
```

#### 2.2 添加翻译辅助函数

```javascript
/**
 * 翻译引用或回覆推文（用於展开时自动翻译）
 */
async function translateQuoteOrReply(tweetToTranslate, mainTweetId, userId, type) {
    try {
        // 检查用户是否有 API Key
        const apiKeyService = getApiKeyService();
        const userApiKey = await apiKeyService.getApiKey(userId, 'gemini');

        if (!userApiKey) {
            console.log(`${getTimePrefix()} [V2-Translate] 用户没有 API Key，返回原文`);
            return null;
        }

        // 执行翻译
        const geminiTranslator = getGeminiTranslator();
        const translateOptions = { targetLanguage: '繁體中文' };

        if (tweetToTranslate.author?.name) {
            translateOptions.authorName = tweetToTranslate.author.name;
        }

        const translateResult = await geminiTranslator.translateWithUserKey(
            tweetToTranslate.text || '',
            userApiKey,
            translateOptions
        );

        if (!translateResult.success) {
            console.error(`${getTimePrefix()} [V2-Translate] ${type === 'quote' ? '引用' : '回覆'}翻译失败:`, translateResult.errorType);
            return null;
        }

        const translatedText = translateResult.text;

        // 更新翻译状态缓存
        const ts = getTranslationState(mainTweetId);
        if (ts) {
            if (type === 'quote') {
                ts.translatedQuoteText = translatedText;
            } else {
                ts.translatedReplyText = translatedText;
            }
            setTranslationState(mainTweetId, ts);
        }

        console.log(`${getTimePrefix()} [V2-Translate] ${type === 'quote' ? '引用' : '回覆'}翻译成功并已缓存`);
        return translatedText;

    } catch (error) {
        console.error(`${getTimePrefix()} [V2-Translate] ${type === 'quote' ? '引用' : '回覆'}翻译异常:`, error);
        return null;
    }
}
```

---

## 📝 使用说明

### 用户使用流程

#### 场景 1：首次翻译
1. 用户发送一条包含引用或回覆的推文
2. 用户点击「🌐 翻译」按钮
3. 系统翻译：
   - 主推文内容 ✅
   - 引用推文内容（如果有）✅
   - 回覆推文内容（如果有）✅

#### 场景 2：展开引用/回覆（核心需求）⭐
1. 用户已经点击翻译，看到翻译后的主推文
2. 用户点击「🔽 展开引用」或「🔽 展开回覆」按钮
3. **系统自动检测当前处于翻译状态**
4. **系统自动翻译引用/回覆推文的原文**
5. **翻译结果缓存并显示**
6. 用户直接看到翻译后的引用/回覆内容 ✅

#### 场景 3：切换回原文
1. 用户点击「原文」按钮
2. 所有内容（主推文、引用、回覆）都切换回原文
3. 翻译缓存保留，下次翻译时可以直接使用

---

## 🔍 影响范围

### 影响的推文类型
- V1 Embed 模式（旧版）的所有包含引用或回覆的推文
- V2 Container 模式（新版）的所有包含引用或回覆的推文

### 不影响的推文类型
- 纯文字推文
- 纯图片推文

---

## 📌 注意事项

1. **API 调用次数**：
   - 展开引用/回覆时，如果没有翻译缓存，会额外调用翻译 API
   - 翻译结果会缓存，不会重复调用

2. **缓存有效期**：
   - 翻译结果缓存 60 分钟（TFD 项目设定）
   - 缓存在内存中，重启后清空

3. **错误处理**：
   - 如果获取回覆推文失败，不会影响主推文翻译
   - 如果翻译失败，会显示原文，不会影响用户体验

4. **向后兼容**：
   - 修改完全向后兼容，不影响现有功能
   - 没有 API Key 的用户不受影响

5. **性能优化**：
   - 翻译前先检查缓存，避免重复翻译
   - 翻译失败时优雅降级，显示原文

---

## 🎯 核心改进总结

### 改进前
- ❌ 用户翻译后，展开引用/回覆看到的是原文
- ❌ 用户需要再次点击翻译按钮才能看到翻译
- ❌ 用户体验不一致，需要多次操作

### 改进后
- ✅ 用户翻译后，展开引用/回覆自动看到翻译
- ✅ 翻译结果自动缓存，下次展开直接使用
- ✅ 用户体验一致，一次翻译全部看到
- ✅ 智能检测翻译状态，按需翻译

---

## ✅ 测试验证

- ✅ 语法检查全部通过
- ✅ V1 分页交互处理器修改完成
- ✅ V2 Container 交互处理器修改完成
- ✅ 翻译辅助函数添加完成

---

**TFD 项目翻译功能增强完成，可以部署！** 🎉
