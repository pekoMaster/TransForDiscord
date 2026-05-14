/*jshint esversion: 9 */
/**
 * facebook-with-login.js
 * Facebook 提取器（使用已保存的登入狀態）
 */

const path = require('path');
const fs = require('fs').promises;
const { chromium } = require('playwright');
const tfd = require('../../utils/tfd-logger');

class FacebookWithLoginExtractor {
    constructor() {
        this.name = 'facebook_with_login';
        this.userDataDir = path.join(__dirname, '..', '..', 'data', 'facebook_session');
        this.storageStatePath = path.join(__dirname, '..', '..', 'data', 'facebook_auth.json');
        this.browser = null;
        this.context = null;
    }

    async initContext() {
        try {
            await fs.access(this.userDataDir);
        } catch {
            await fs.access(this.storageStatePath).catch(() => {
                throw new Error('找不到 Facebook 登入狀態，請先執行: node utils/facebook-login-simple.js');
            });
        }

        try {
            this.context = await chromium.launchPersistentContext(this.userDataDir, {
                headless: true,
                channel: 'chrome',
                viewport: { width: 1280, height: 720 },
                locale: 'zh-TW',
                timeout: 30000
            });
            this.browser = null;
            tfd.sys('FB Extractor', '✅ 使用已保存的持久化登入狀態');
            return;
        } catch (error) {
            tfd.sysWarn('FB Extractor', `持久化登入狀態啟動失敗，改用 storageState: ${error.message}`);
        }

        await fs.access(this.storageStatePath);
        this.browser = await chromium.launch({
            headless: true,
            channel: 'chrome'
        });
        this.context = await this.browser.newContext({
            viewport: { width: 1280, height: 720 },
            locale: 'zh-TW',
            storageState: this.storageStatePath
        });
        tfd.sys('FB Extractor', '✅ 使用 storageState 登入狀態');
    }

    async extract(url, extractedData = {}, message = null) {
        try {
            tfd.sys('FB Extractor', `開始提取: ${url}`);

            if (!this.context) {
                await this.initContext();
            }

            const page = await this.context.newPage();

            tfd.sys('FB Extractor', '開啟頁面...');
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            await page.waitForTimeout(3000);

            tfd.sys('FB Extractor', '取得語義化快照...');
            const snapshot = await page.accessibility.snapshot();
            const lines = [];
            this._convertToLines(snapshot, lines, 0);
            const snapshotText = lines.join('\n');
            const elements = this._parseSnapshot(snapshotText);

            tfd.sys('FB Extractor', `找到 ${elements.length} 個元素`);

            const result = {
                success: true,
                siteName: 'facebook',
                contentType: 'post',
                data: {
                    url,
                    author: this._extractAuthor(elements),
                    groupName: this._extractGroupName(elements),
                    headline: this._extractHeadline(elements),
                    postTime: this._extractPostTime(elements),
                    content: this._extractContent(elements),
                    hashtags: this._extractHashtags(elements),
                    interactions: this._extractInteractions(elements),
                    comments: this._extractComments(elements),
                    images: [],
                    elementCount: elements.length
                }
            };

            const screenshotPath = path.join(__dirname, '..', '..', 'temp', `fb-${Date.now()}.png`);
            await fs.mkdir(path.dirname(screenshotPath), { recursive: true }).catch(() => {});
            await page.screenshot({ path: screenshotPath, fullPage: false });
            result.data.screenshot = screenshotPath;

            tfd.sys('FB Extractor', '✅ 提取完成');
            tfd.sys('Facebook-Login', `  作者: ${result.data.author}`);
            tfd.sys('Facebook-Login', `  社團: ${result.data.groupName || '(無)'}`);
            tfd.sys('Facebook-Login', `  標題: ${result.data.headline || '(無)'}`);
            tfd.sys('Facebook-Login', `  內容: ${result.data.content.substring(0, 100)}...`);

            await page.close();
            return result;
        } catch (error) {
            tfd.sysError('FB Extractor', `錯誤: ${error.message}`);
            return {
                success: false,
                siteName: 'facebook',
                error: error.message
            };
        }
    }

    _extractAuthor(elements) {
        const headingAuthor = elements.find(el =>
            el.role === 'heading' && / 的貼文$/.test(el.text)
        );

        if (headingAuthor) {
            return headingAuthor.text.replace(/ 的貼文$/, '').trim();
        }

        const groupName = this._extractGroupName(elements);

        const authorLink = elements.find(el =>
            el.role === 'link' &&
            el.text.length > 1 &&
            el.text.length < 60 &&
            el.text !== 'Facebook' &&
            el.text !== groupName &&
            !this._isUiText(el.text) &&
            !/ 的貼文$/.test(el.text)
        );

        if (authorLink) {
            return authorLink.text;
        }

        return '未知作者';
    }

    _extractGroupName(elements) {
        const headingPost = elements.find(el =>
            el.role === 'heading' && / 的貼文$/.test(el.text)
        );

        const authorFromHeading = headingPost
            ? headingPost.text.replace(/ 的貼文$/, '').trim()
            : null;

        const groupLink = elements.find(el =>
            el.role === 'link' &&
            el.text.length > 3 &&
            el.text !== 'Facebook' &&
            el.text !== authorFromHeading &&
            !this._isUiText(el.text)
        );

        return groupLink ? groupLink.text : '';
    }

    _extractHeadline(elements) {
        const author = this._extractAuthor(elements);
        const groupName = this._extractGroupName(elements);

        const headline = elements.find(el =>
            el.role === 'heading' &&
            el.text.length > 1 &&
            el.text.length < 120 &&
            el.text !== 'Facebook' &&
            el.text !== author &&
            el.text !== groupName &&
            !/ 的貼文$/.test(el.text) &&
            !el.text.includes('尚無留言')
        );

        return headline ? headline.text : '';
    }

    _extractPostTime(elements) {
        const timeElement = elements.find(el =>
            el.role === 'link' &&
            /\d+\s*(分鐘|小時|天|週|個月|年)/.test(el.text)
        );

        return timeElement ? timeElement.text : '';
    }

    _extractContent(elements) {
        const author = this._extractAuthor(elements);
        const groupName = this._extractGroupName(elements);
        const headline = this._extractHeadline(elements);

        const textElements = elements.filter(el => {
            if (el.role !== 'text' && el.role !== 'StaticText') return false;
            const text = (el.text || '').trim();
            if (text.length < 2) return false;
            if (text === author || text === groupName || text === headline) return false;
            if (this._isUiText(text)) return false;
            return true;
        });

        const contentParts = [];
        if (headline) contentParts.push(headline);

        for (const el of textElements) {
            const text = el.text.trim();
            if (!contentParts.includes(text)) {
                contentParts.push(text);
            }
        }

        return contentParts.join('\n\n') || '未找到可用正文';
    }

    _extractHashtags(elements) {
        return elements
            .filter(el => el.role === 'link' && el.text.startsWith('#'))
            .map(el => el.text);
    }

    _extractInteractions(elements) {
        const interactions = { likes: 0, comments: 0, shares: 0 };

        elements.forEach(el => {
            const text = el.text || '';
            const match = text.match(/(\d+)/);
            if (!match) return;

            if (text.includes('讚')) interactions.likes = parseInt(match[1]);
            if (text.includes('留言')) interactions.comments = parseInt(match[1]);
            if (text.includes('分享')) interactions.shares = parseInt(match[1]);
        });

        return interactions;
    }

    _extractComments(elements) {
        return [];
    }

    _convertToLines(node, lines, depth) {
        if (!node) return;
        const indent = '  '.repeat(depth);
        const role = node.role || 'unknown';
        const name = node.name || '';
        if (name) {
            lines.push(`${indent}- ${role}: ${String(name).replace(/\s+/g, ' ').trim()}`);
        }
        if (node.children) {
            node.children.forEach(child => this._convertToLines(child, lines, depth + 1));
        }
    }

    _parseSnapshot(snapshot) {
        return snapshot.split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('- '))
            .map(line => {
                const match = line.match(/^- ([^:]+):\s*(.*)$/);
                return match ? { role: match[1].trim(), text: match[2].trim() } : null;
            })
            .filter(Boolean);
    }

    _isUiText(text) {
        return [
            'Facebook', '登入', 'Cookie', '查看更多', '更多選項', '分享', '留言', '傳送',
            '按讚', '表情符號', '貼圖', '影片', '新增相片', '查看翻譯', '回覆', '發佈',
            '尚無留言', '留言搶頭香！', '通知', 'Messenger', '功能表', '你的個人檔案', '關閉'
        ].some(keyword => text.includes(keyword));
    }

    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
            tfd.sys('FB Extractor', '上下文已關閉');
        }
        if (this.browser) {
            await this.browser.close().catch(() => {});
            this.browser = null;
        }
    }
}

module.exports = FacebookWithLoginExtractor;
