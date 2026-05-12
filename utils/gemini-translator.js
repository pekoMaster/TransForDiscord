/**
 * Google Gemini AI 翻譯工具模組
 * 使用 Gemini API 進行高品質翻譯
 * 支援多組 API Key 輪替和自動回退機制
 */

class GeminiTranslator {
    constructor() {
        // 載入多組 API Keys（過濾重複的 KEY_4）
        this.apiKeys = [
            process.env.GOOGLE_GEMINI_API_KEY_1,
            process.env.GOOGLE_GEMINI_API_KEY_2,
            process.env.GOOGLE_GEMINI_API_KEY_3,
            process.env.GOOGLE_GEMINI_API_KEY_5, // 跳過與 KEY_1 重複的 KEY_4
            process.env.GOOGLE_GEMINI_API_KEY_6
        ].filter(key => key && key.trim() !== '');

        this.currentKeyIndex = 0;
        this.model = 'gemini-3.1-flash-lite-preview';
        this.translationModelFallbacks = [
            'gemini-3.1-flash-lite-preview',
            'gemini-3-flash-preview',
            'gemini-2.5-flash-lite',
            'gemini-2.5-flash',
            'gemini-3.1-pro-preview'
        ];
        this.GoogleGenAI = null; // 延遲載入 ES Module

        if (this.apiKeys.length === 0) {
            console.error('❌ [Gemini翻譯] API Keys 未設定！');
            this.isAvailable = false;
        } else {
            this.isAvailable = true;
            // 初始化日誌已移除（減少啟動時輸出）
        }

        // 引入 Google Translate 作為回退選項
        this.googleTranslator = require('./translator.js');
    }

    /**
     * 動態載入 ES Module SDK
     * @returns {Promise<Object>} GoogleGenAI 類別
     */
    async loadGoogleGenAI() {
        if (!this.GoogleGenAI) {
            const module = await import('@google/genai');
            this.GoogleGenAI = module.GoogleGenAI;
        }
        return this.GoogleGenAI;
    }

    /**
     * 獲取當前 API Key 並輪替到下一個
     * @returns {string} 當前的 API Key
     */
    getCurrentApiKey() {
        if (this.apiKeys.length === 0) {
            return null;
        }
        const currentKey = this.apiKeys[this.currentKeyIndex];
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
        return currentKey;
    }

    /**
     * 時間戳記函數
     * @returns {string} [HH:mm] 格式的時間戳記
     */
    getTimeStamp() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `[${hours}:${minutes}]`;
    }

    /**
     * 翻譯到繁體中文（台灣用語）
     * 支援自動回退到 Google Translate
     * @param {string} text 要翻譯的文字
     * @returns {Promise<Object>} 翻譯結果 { text, from, usedFallback }
     */
    async toTraditionalChinese(text) {
        if (!text || text.trim().length === 0) {
            return {
                text: '',
                from: 'unknown',
                usedFallback: false
            };
        }

        // 檢查文字長度（Gemini 有輸入限制）
        if (text.length > 10000) {
            console.warn(`${this.getTimeStamp()} [Gemini翻譯] 文字過長 (${text.length} 字元)，使用 Google Translate`);
            const result = await this.googleTranslator.toTraditionalChinese(text);
            return {
                text: result.text,
                from: result.from,
                usedFallback: true,
                fallbackReason: 'text_too_long'
            };
        }

        if (!this.isAvailable) {
            console.warn(`${this.getTimeStamp()} [Gemini翻譯] API Keys 未設定，使用 Google Translate`);
            const result = await this.googleTranslator.toTraditionalChinese(text);
            return {
                text: result.text,
                from: result.from,
                usedFallback: true,
                fallbackReason: 'no_api_keys'
            };
        }

        try {
            const apiKey = this.getCurrentApiKey();
            if (!apiKey) {
                throw new Error('無可用的 API Key');
            }

            // 動態載入 ES Module SDK
            const GoogleGenAI = await this.loadGoogleGenAI();
            const ai = new GoogleGenAI({ apiKey: apiKey });

            // 建立翻譯提示詞
            const prompt = `請將以下文字翻譯成繁體中文（台灣用語），保持原意、語氣和格式。只輸出翻譯結果，不要加任何說明：

${text}`;

            console.log(`${this.getTimeStamp()} [Gemini翻譯] 開始翻譯 (${text.length} 字元)`);

            const response = await ai.models.generateContent({
                model: this.model,
                contents: prompt
            });

            const translatedText = response.text.trim();

            console.log(`${this.getTimeStamp()} [Gemini翻譯] ✅ 翻譯成功`);

            return {
                text: translatedText,
                from: 'AUTO', // Gemini 自動檢測來源語言
                usedFallback: false
            };

        } catch (error) {
            console.error(`${this.getTimeStamp()} [Gemini翻譯] ❌ 錯誤: ${error.message}`);

            // 檢查是否為配額錯誤
            const isQuotaError =
                error.message.includes('429') ||
                error.message.includes('quota') ||
                error.message.includes('RESOURCE_EXHAUSTED') ||
                error.message.includes('rate limit');

            if (isQuotaError) {
                console.warn(`${this.getTimeStamp()} [Gemini翻譯] 配額已用盡，回退到 Google Translate`);
            } else {
                console.warn(`${this.getTimeStamp()} [Gemini翻譯] API 錯誤，回退到 Google Translate`);
            }

            // 自動回退到 Google Translate
            try {
                const result = await this.googleTranslator.toTraditionalChinese(text);
                return {
                    text: result.text,
                    from: result.from,
                    usedFallback: true,
                    fallbackReason: isQuotaError ? 'quota_exhausted' : 'api_error',
                    originalError: error.message
                };
            } catch (fallbackError) {
                console.error(`${this.getTimeStamp()} [Gemini翻譯] ❌ 回退也失敗: ${fallbackError.message}`);
                throw new Error(`翻譯失敗：${fallbackError.message}`);
            }
        }
    }

    /**
     * 翻譯成 5CH 風格日文（2channel/5channel 日本網友口語風格）
     * 支援多 API Key 自動重試機制
     * @param {string} text 要翻譯的文字
     * @returns {Promise<Object>} 翻譯結果 { text, from, usedFallback }
     */
    async to5CHJapanese(text) {
        if (!text || text.trim().length === 0) {
            return {
                text: '',
                from: 'unknown',
                usedFallback: false
            };
        }

        // 檢查文字長度
        if (text.length > 10000) {
            console.warn(`${this.getTimeStamp()} [Gemini翻譯] 文字過長 (${text.length} 字元)，無法翻譯`);
            return {
                text: text, // 返回原文
                from: 'unknown',
                usedFallback: false,
                error: 'text_too_long'
            };
        }

        if (!this.isAvailable) {
            console.warn(`${this.getTimeStamp()} [Gemini翻譯] API Keys 未設定，無法翻譯`);
            return {
                text: text, // 返回原文
                from: 'unknown',
                usedFallback: false,
                error: 'no_api_keys'
            };
        }

        // 🔥 多 API Key 重試機制：嘗試所有可用的 API Keys
        const maxRetries = this.apiKeys.length;
        let lastError = null;
        const failedKeys = [];

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const apiKey = this.getCurrentApiKey();
                if (!apiKey) {
                    throw new Error('無可用的 API Key');
                }

                // 動態載入 ES Module SDK
                const GoogleGenAI = await this.loadGoogleGenAI();
                const ai = new GoogleGenAI({ apiKey: apiKey });

                // 建立 5CH 風格翻譯提示詞
                const prompt = `你是一個專業的日本網路文化翻譯專家。請將以下文字翻譯成日文，使用「5CH（5ちゃんねる / 2ちゃんねる）」風格的口語日文。

**風格要求**：
- 使用 5CH 常見的網友口語和縮寫（wwww、草、マジで、ヤバい 等）
- 使用口語化表達，避免過於正式的書面語
- 保持輕鬆、隨意的語氣，就像匿名論壇發文
- 可以使用網路流行用語和顏文字
- 省略不必要的助詞，模仿自然的聊天語氣
- 如果是問句，使用「〜か？」「〜の？」等口語疑問句

**重要**：只輸出翻譯後的日文結果，不要加任何說明或註解。

原文：
${text}`;

                console.log(`${this.getTimeStamp()} [Gemini翻譯] 開始翻譯成 5CH 風格日文 (${text.length} 字元)${attempt > 0 ? ` [重試 ${attempt}/${maxRetries}]` : ''}`);

                const response = await ai.models.generateContent({
                    model: this.model,
                    contents: prompt
                });

                const translatedText = response.text.trim();

                console.log(`${this.getTimeStamp()} [Gemini翻譯] ✅ 5CH 風格翻譯成功${attempt > 0 ? ` (重試 ${attempt} 次後成功)` : ''}`);
                console.log(`${this.getTimeStamp()} [Gemini翻譯] 原文: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
                console.log(`${this.getTimeStamp()} [Gemini翻譯] 譯文: ${translatedText.substring(0, 50)}${translatedText.length > 50 ? '...' : ''}`);

                return {
                    text: translatedText,
                    from: 'AUTO',
                    usedFallback: false,
                    retriedCount: attempt
                };

            } catch (error) {
                lastError = error;
                const keyIndex = (this.currentKeyIndex - 1 + this.apiKeys.length) % this.apiKeys.length;
                failedKeys.push(keyIndex + 1);

                // 檢查是否為配額錯誤
                const isQuotaError =
                    error.message.includes('429') ||
                    error.message.includes('quota') ||
                    error.message.includes('RESOURCE_EXHAUSTED') ||
                    error.message.includes('rate limit');

                if (isQuotaError) {
                    console.warn(`${this.getTimeStamp()} [Gemini翻譯] ⚠️ API Key #${keyIndex + 1} 配額已用盡 (429 錯誤)`);

                    // 如果還有其他 Key 可以嘗試，繼續下一輪
                    if (attempt < maxRetries - 1) {
                        console.log(`${this.getTimeStamp()} [Gemini翻譯] 🔄 嘗試下一個 API Key...`);
                        continue;
                    }
                } else {
                    // 非配額錯誤，記錄後繼續嘗試
                    console.error(`${this.getTimeStamp()} [Gemini翻譯] ❌ API Key #${keyIndex + 1} 發生錯誤: ${error.message}`);

                    if (attempt < maxRetries - 1) {
                        console.log(`${this.getTimeStamp()} [Gemini翻譯] 🔄 嘗試下一個 API Key...`);
                        continue;
                    }
                }
            }
        }

        // 所有 API Keys 都失敗了
        console.error(`${this.getTimeStamp()} [Gemini翻譯] ❌ 所有 API Keys 都失敗了`);
        console.error(`${this.getTimeStamp()} [Gemini翻譯] 失敗的 Keys: #${failedKeys.join(', #')}`);
        console.error(`${this.getTimeStamp()} [Gemini翻譯] 最後錯誤: ${lastError?.message || '未知錯誤'}`);

        // 返回原文並附帶錯誤資訊
        return {
            text: text,
            from: 'unknown',
            usedFallback: false,
            error: lastError?.message || '所有 API Keys 都失敗',
            failedKeys: failedKeys,
            allKeysExhausted: true
        };
    }

    /**
     * 檢測語言（使用 Google Translate 的檢測功能）
     * @param {string} text 要檢測的文字
     * @returns {Promise<string>} 語言代碼
     */
    async detectLanguage(text) {
        return await this.googleTranslator.detectLanguage(text);
    }

    /**
     * 偵測是否為經紀人/工作人員代發文
     * @param {string} text 要檢測的文字
     * @returns {Object} { isManagerPost, managerType, hasIdolContent }
     */
    detectManagerPost(text) {
        // 經紀人/工作人員標記模式
        const managerPatterns = [
            // 經紀人
            { pattern: /マネジャーより/i, type: '經紀人' },
            { pattern: /マネージャーより/i, type: '經紀人' },
            { pattern: /マネより/i, type: '經紀人' },
            { pattern: /担当より/i, type: '負責人' },
            // 工作人員
            { pattern: /スタッフより/i, type: '工作人員' },
            { pattern: /運営より/i, type: '營運團隊' },
            { pattern: /事務所より/i, type: '事務所' },
            { pattern: /COVER\s*(株式会社)?より/i, type: 'COVER 公司' },
            // 代理發文
            { pattern: /代理投稿/i, type: '代理發文' },
            { pattern: /代わりに(投稿|ツイート)/i, type: '代理發文' },
            // 公告性質
            { pattern: /【(お知らせ|告知|重要)】/i, type: '官方公告' },
            { pattern: /＜(お知らせ|告知)＞/i, type: '官方公告' }
        ];

        // 偵測是否有經紀人標記
        let isManagerPost = false;
        let managerType = null;

        for (const { pattern, type } of managerPatterns) {
            if (pattern.test(text)) {
                isManagerPost = true;
                managerType = type;
                break;
            }
        }

        // 偵測是否同時包含偶像本人的內容（混合發文）
        // 例如：經紀人轉達偶像的話，或偶像發文後經紀人補充
        const idolContentPatterns = [
            /本人より/i,      // 本人說
            /本人曰く/i,      // 本人表示
            /本人から/i,      // 來自本人
            /「[^」]+」/,     // 引用格式（可能是偶像的話）
            /『[^』]+』/      // 另一種引用格式
        ];

        const hasIdolContent = idolContentPatterns.some(p => p.test(text));

        return {
            isManagerPost,
            managerType,
            hasIdolContent
        };
    }

    /**
     * 使用用戶自訂的 API Key 翻譯（VTuber 優化版本）
     * @param {string} text 要翻譯的文字
     * @param {string} userApiKey 用戶的 Gemini API Key
     * @param {Object} options 選項
     * @param {string} options.context 額外上下文（如引用原文）
     * @returns {Promise<Object>} 翻譯結果 { success, text, error, errorType }
     */
    async translateWithUserKey(text, userApiKey, options = {}) {
        if (!text || text.trim().length === 0) {
            return {
                success: true,
                text: '',
                error: null
            };
        }

        if (!userApiKey) {
            return {
                success: false,
                text: null,
                error: '未提供 API Key',
                errorType: 'NO_API_KEY'
            };
        }

        // 檢查文字長度
        if (text.length > 10000) {
            return {
                success: false,
                text: null,
                error: '文字過長（超過 10000 字元）',
                errorType: 'TEXT_TOO_LONG'
            };
        }

        try {
            // 動態載入 ES Module SDK
            const GoogleGenAI = await this.loadGoogleGenAI();
            const ai = new GoogleGenAI({ apiKey: userApiKey });

            // 偵測是否為經紀人代發文
            const managerDetection = this.detectManagerPost(text);

            // VTuber 優化翻譯提示詞
            let prompt = `你是一位專業的 VTuber 文化翻譯專家。請將以下文字翻譯成繁體中文（台灣用語）。

**翻譯規則**：
1. 保持原意、語氣、情緒與段落格式，不要過度潤飾。
2. 以自然、好讀、貼近台灣 VTuber / 實況圈的中文表達為主。
3. 人名、團體名、企劃名、品牌名優先保留常見寫法，不要硬翻。
4. 只在容易誤譯的圈內術語上套用優先譯法，不要浪費篇幅處理本來就直觀的詞。
5. 若原文是迷因、留言、口語或玩梗風格，翻譯也保留那種感覺，不要翻成公文。
6. 只輸出翻譯結果，不要加註解、說明、括號補充或術語表。

**高誤譯風險術語優先規則**：
- ライバー -> ライバー / 虛擬主播
- 中之人 / 魂 -> 中之人 / 魂
- 前世 -> 前世
- 轉生 -> 轉生
- 企業勢 -> 企業勢
- 個人勢 -> 個人勢
- 凸待 -> 凸待
- 逆凸 -> 逆凸
- てぇてぇ / 貼貼 -> 貼貼
- ガチ恋 -> ガチ戀 / 真愛粉
- 厄介 -> 厄介
- 杞憂民 -> 杞憂民
- 切り抜き -> 剪輯 / 切片
- 歌枠 / 歌回 -> 歌回 / 唱歌直播
- 作業配信 / 作業台 -> 作業台
- 朝活 -> 朝活
- 晩酌 -> 晚酌台 / 喝酒台
- フリチャ -> フリチャ / 自由聊天
- 草 / w / www -> 草 / 哈哈
- 助かる / TSKR -> 幫大忙了 / 太感謝了
- ポン / ポンコツ -> 兩光 / 廢柴 / Pon
- 限界化 -> 限界化 / 尊死
- 解釈一致 -> 解釋一致 / 符合人設
- 事故 -> 事故 / 直播事故
- 受肉 -> 受肉
- パパ / ママ -> 爸爸 / 媽媽
- 痛バ -> 痛包
- 祭壇 -> 祭壇
- 生肉 -> 生肉
- 熟肉 / 烤肉 -> 熟肉 / 烤肉

**VTuber 成員縮寫暱稱（禁止翻譯，保留原字或括注全名）**：
- フブ / ふぶ -> Fubuki（白上フブキ）
- ころ / ころね -> Korone（戌神ころね）
- まちゅ / まつり -> Matsuri（夏色まつり）
- フレア -> Flare（不知火フレア）
- ミオ -> Mio（大神ミオ）
- フルパ / フルパぁ -> 全員集合 / Full Party（多位成員同台）

**補充要求**：
- 配信通常譯為直播；若語境明顯偏圈內，也可保留配信語感。
- スパチャ可譯為 SC / 超級留言。
- メン限可譯為 會限 / 會員限定直播。
- 對於多義口語、迷因、慣用語與評價詞，必須依上下文、說話對象、情緒方向與場景功能判斷實際意思；不要做字面直譯，也不要固定套用單一中文對應。
- 若一句話在原文中的主要功能是吐槽、稱讚、嫌棄、驚呼、調情、陰陽怪氣或玩梗，譯文優先保留這個功能，而不是保留原字面。
- 不確定時，優先選擇台灣圈內常見、讀者一看就懂的說法。`;

            // 如果偵測到經紀人代發文，加入特殊處理規則
            if (managerDetection.isManagerPost) {
                console.log(`${this.getTimeStamp()} [Gemini用戶翻譯] 偵測到${managerDetection.managerType}代發文`);

                prompt += `

5. **【重要】經紀人/工作人員代發文處理**：
   - 此文章由「${managerDetection.managerType}」代為發布，不是偶像本人發文
   - 翻譯時使用第三人稱或客觀敘述，不要用偶像的第一人稱視角
   - 「マネジャーより」翻譯為「經紀人代發」或「來自經紀人」
   - 「スタッフより」翻譯為「工作人員代發」或「來自工作人員」
   - 「運営より」翻譯為「營運團隊代發」或「來自營運團隊」
   - 保持公告性質的正式語氣
   - 如果文中有引用偶像的話（用「」或『』括起來的部分），那部分保持偶像的語氣`;

                // 如果同時包含偶像內容（混合發文）
                if (managerDetection.hasIdolContent) {
                    prompt += `
   - 此文章為混合發文：部分是${managerDetection.managerType}的話，部分是偶像本人的話
   - 引用部分（「」『』內）保持偶像的第一人稱語氣
   - 其他部分保持${managerDetection.managerType}的客觀敘述語氣`;
                }
            }

            // 如果有額外上下文（如引用原文）
            if (options.context) {
                prompt += `\n\n**參考上下文**：\n${options.context}`;
            }

            prompt += `\n\n**原文**：\n${text}\n\n**譯文**：`;

            let lastError = null;
            const failedModels = [];

            for (let i = 0; i < this.translationModelFallbacks.length; i++) {
                const modelName = this.translationModelFallbacks[i];

                try {
                    console.log(
                        `${this.getTimeStamp()} [Gemini用戶翻譯] 開始翻譯 (${text.length} 字元)` +
                        `${i === 0 ? '' : ` [模型切換: ${modelName}]`}`
                    );

                    const response = await ai.models.generateContent({
                        model: modelName,
                        contents: prompt
                    });

                    const translatedText = response.text.trim();

                    console.log(`${this.getTimeStamp()} [Gemini用戶翻譯] ✅ 翻譯成功 (${modelName})`);

                    return {
                        success: true,
                        text: translatedText,
                        error: null
                    };
                } catch (modelError) {
                    lastError = modelError;
                    failedModels.push({
                        model: modelName,
                        message: modelError.message || ''
                    });

                    const errorText = modelError.message || '';
                    const isRetryableModelError =
                        errorText.includes('503') ||
                        errorText.includes('UNAVAILABLE') ||
                        errorText.includes('429') ||
                        errorText.includes('404') ||
                        errorText.includes('quota') ||
                        errorText.includes('RESOURCE_EXHAUSTED') ||
                        errorText.includes('rate limit') ||
                        errorText.includes('not found') ||
                        errorText.includes('not supported') ||
                        errorText.includes('INVALID_ARGUMENT') ||
                        errorText.includes('timeout') ||
                        errorText.includes('ETIMEDOUT');

                    if (!isRetryableModelError || i === this.translationModelFallbacks.length - 1) {
                        break;
                    }
                }
            }

            if (lastError && failedModels.length > 0) {
                lastError.message = `${lastError.message}\n[GeminiFallbacks] ${failedModels.map(item => `${item.model}: ${item.message}`).join(' | ')}`;
            }

            throw lastError || new Error('所有翻譯模型都無法使用');

        } catch (error) {
            console.error(`${this.getTimeStamp()} [Gemini用戶翻譯] ❌ 錯誤: ${error.message}`);

            // 判斷錯誤類型
            let errorType = 'UNKNOWN_ERROR';
            let errorMessage = error.message;

            if (error.message.includes('429') ||
                error.message.includes('quota') ||
                error.message.includes('RESOURCE_EXHAUSTED') ||
                error.message.includes('rate limit')) {
                errorType = 'QUOTA_EXHAUSTED';
                errorMessage = 'API 額度已用盡，免費額度通常於每日 UTC 0:00（台灣時間 8:00）重置';
            } else if (error.message.includes('401') ||
                       error.message.includes('403') ||
                       error.message.includes('invalid') ||
                       error.message.includes('API key')) {
                errorType = 'INVALID_API_KEY';
                errorMessage = 'API Key 無效或已過期，請重新設定';
            } else if (error.message.includes('timeout') ||
                       error.message.includes('ETIMEDOUT')) {
                errorType = 'TIMEOUT';
                errorMessage = '翻譯逾時，請稍後再試';
            }

            return {
                success: false,
                text: null,
                error: errorMessage,
                errorType: errorType
            };
        }
    }
}

// 單例模式
let instance = null;

/**
 * 獲取 Gemini 翻譯器單例
 * @returns {GeminiTranslator} Gemini 翻譯器實例
 */
function getInstance() {
    if (!instance) {
        instance = new GeminiTranslator();
    }
    return instance;
}

module.exports = {
    getInstance,
    GeminiTranslator
};
