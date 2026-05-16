class TextTruncator {
    constructor() {
        this.maxCharacters = 300;
        this.truncateMessage = '...(其餘請進入原推文觀看)';
    }

    calculateCharacterCount(text) {
        if (!text) return 0;

        let count = 0;
        for (let i = 0; i < text.length; i++) {
            const code = text[i].charCodeAt(0);
            count += this.isCJKCharacter(code) ? 2 : 1;
        }

        return count;
    }

    isCJKCharacter(charCode) {
        return (
            (charCode >= 0x4E00 && charCode <= 0x9FFF) ||
            (charCode >= 0x3400 && charCode <= 0x4DBF) ||
            (charCode >= 0x20000 && charCode <= 0x2A6DF) ||
            (charCode >= 0x2A700 && charCode <= 0x2B73F) ||
            (charCode >= 0x2B740 && charCode <= 0x2B81F) ||
            (charCode >= 0x2B820 && charCode <= 0x2CEAF) ||
            (charCode >= 0xF900 && charCode <= 0xFAFF) ||
            (charCode >= 0x2F800 && charCode <= 0x2FA1F) ||
            (charCode >= 0x3040 && charCode <= 0x309F) ||
            (charCode >= 0x30A0 && charCode <= 0x30FF) ||
            (charCode >= 0x31F0 && charCode <= 0x31FF) ||
            (charCode >= 0xFF65 && charCode <= 0xFF9F) ||
            (charCode >= 0xAC00 && charCode <= 0xD7AF) ||
            (charCode >= 0x1100 && charCode <= 0x11FF) ||
            (charCode >= 0x3130 && charCode <= 0x318F) ||
            (charCode >= 0xA960 && charCode <= 0xA97F) ||
            (charCode >= 0xD7B0 && charCode <= 0xD7FF)
        );
    }

    truncateText(text) {
        if (!text) {
            return {
                originalText: '',
                truncatedText: '',
                characterCount: 0,
                isTruncated: false
            };
        }

        const originalCount = this.calculateCharacterCount(text);
        if (originalCount <= this.maxCharacters) {
            return {
                originalText: text,
                truncatedText: text,
                characterCount: originalCount,
                isTruncated: false
            };
        }

        const urls = this.extractURLs(text);
        const truncateMessageCount = this.calculateCharacterCount(this.truncateMessage);
        const availableCount = this.maxCharacters - truncateMessageCount;

        let truncatedText = '';
        let currentCount = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const charCount = this.isCJKCharacter(char.charCodeAt(0)) ? 2 : 1;
            if (currentCount + charCount > availableCount) break;
            truncatedText += char;
            currentCount += charCount;
        }

        truncatedText = this.smartTruncate(truncatedText, text);

        const protectedResult = this.protectURLs(truncatedText, text, urls);
        truncatedText = protectedResult.text;

        let finalText = truncatedText + this.truncateMessage;
        if (protectedResult.appendedURLs.length > 0) {
            finalText += '\n\n' + protectedResult.appendedURLs.join('\n');
        }

        return {
            originalText: text,
            truncatedText: finalText,
            characterCount: originalCount,
            isTruncated: true
        };
    }

    extractURLs(text) {
        const urlPattern = /https?:\/\/[^\s]+/gi;
        return text.match(urlPattern) || [];
    }

    protectURLs(truncatedText, originalText, urls) {
        const appendedURLs = [];
        let processedText = truncatedText;

        for (const url of urls) {
            if (processedText.includes(url)) continue;

            const urlStart = originalText.indexOf(url);
            const truncatedLength = processedText.length;
            if (urlStart < truncatedLength && urlStart + url.length > truncatedLength) {
                const partialURL = originalText.substring(urlStart, truncatedLength);
                if (processedText.endsWith(partialURL)) {
                    processedText = processedText.substring(0, processedText.length - partialURL.length);
                    processedText = processedText.trimEnd();
                }

                appendedURLs.push(`🔗 ${url}`);
            }
        }

        return {
            text: processedText,
            appendedURLs
        };
    }

    smartTruncate(truncatedText, originalText) {
        if (!truncatedText) return truncatedText;

        const lastChar = truncatedText[truncatedText.length - 1];
        const nextCharIndex = truncatedText.length;

        if (
            this.isEnglishLetter(lastChar) &&
            nextCharIndex < originalText.length &&
            this.isEnglishLetter(originalText[nextCharIndex])
        ) {
            for (let i = truncatedText.length - 1; i >= 0; i--) {
                const char = truncatedText[i];
                if (this.isWordBoundary(char)) {
                    return truncatedText.substring(0, i + 1);
                }
            }
        }

        return truncatedText;
    }

    isEnglishLetter(char) {
        const code = char.charCodeAt(0);
        return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    }

    isWordBoundary(char) {
        return /[\s\.,!?;:]/.test(char);
    }

    processTweetContent(tweetText, context = 'Tweet') {
        void context;
        const result = this.truncateText(tweetText);

        return {
            text: result.truncatedText,
            isTruncated: result.isTruncated,
            fullText: result.originalText
        };
    }
}

module.exports = TextTruncator;
