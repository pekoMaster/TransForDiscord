/**
 * Ermiana 系統 - URL 匹配模式
 * 各網站的正則表達式模式定義
 */

const patterns = {
    // 社交媒體
    twitter: {
        // 支援多種 Twitter URL 格式：
        // 1. 標準格式: twitter.com/username/status/123
        // 2. 新版格式: twitter.com/i/status/123 或 twitter.com/i/web/status/123
        // 3. 第三方轉換服務: vxtwitter.com, fxtwitter.com, fixupx.com 等
        tweet: /https?:\/\/(?:twitter\.com|x\.com|mobile\.twitter\.com|vxtwitter\.com|fxtwitter\.com|fixupx\.com|twittpr\.com|c\.vxtwitter\.com|d\.vxtwitter\.com)\/(?:([A-Za-z0-9_.-]+)\/)?(?:status|i\/(?:web\/)?status)\/(\d+)/i,
        profile: /https?:\/\/(?:twitter\.com|x\.com|mobile\.twitter\.com|vxtwitter\.com|fxtwitter\.com|fixupx\.com)\/([A-Za-z0-9_.-]+)$/i
    },

    instagram: {
        post: /https?:\/\/(?:www\.)?instagram\.com\/p\/([A-Za-z0-9_-]+)/i,
        reel: /https?:\/\/(?:www\.)?instagram\.com\/reel\/([A-Za-z0-9_-]+)/i,
        story: /https?:\/\/(?:www\.)?instagram\.com\/stories\/([A-Za-z0-9._-]+)\/(\d+)/i
    },

    facebook: {
        // 修正：支援包含任意字符的貼文 URL (包括中文、emoji等)
        // 格式：facebook.com/{用戶名}/posts/{任意內容}/{貼文ID}/
        post: /https?:\/\/(?:www\.|m\.)?facebook\.com\/[^\/]+\/posts\/[^\/]+\/(\d+)/i,
        // 簡單格式：facebook.com/{用戶名}/posts/{貼文ID}
        postSimple: /https?:\/\/(?:www\.|m\.)?facebook\.com\/[^\/]+\/posts\/([A-Za-z0-9_-]+)(?:\/)?$/i,
        video: /https?:\/\/(?:www\.|m\.)?facebook\.com\/watch\/\?v=(\d+)/i,
        watch: /https?:\/\/(?:www\.|m\.)?facebook\.com\/watch\/\?v=(\d+)/i,
        reel: /https?:\/\/(?:www\.|m\.)?facebook\.com\/reel\/(\d+)/i,
        photo: /https?:\/\/(?:www\.|m\.)?facebook\.com\/photo\.php\?fbid=(\d+)/i,
        photoNew: /https?:\/\/(?:www\.|m\.)?facebook\.com\/photo\?fbid=([A-Za-z0-9_-]+)/i,
        story: /https?:\/\/(?:www\.|m\.)?facebook\.com\/story\.php\?story_fbid=([A-Za-z0-9_-]+)/i,
        share: /https?:\/\/(?:www\.|m\.)?facebook\.com\/share\/p\/([A-Za-z0-9_-]+)/i,
        shareVideo: /https?:\/\/(?:www\.|m\.)?facebook\.com\/share\/v\/([A-Za-z0-9_-]+)/i,
        shareR: /https?:\/\/(?:www\.|m\.)?facebook\.com\/share\/r\/([A-Za-z0-9_-]+)/i,
        shareGeneric: /https?:\/\/(?:www\.|m\.)?facebook\.com\/share\/([A-Za-z0-9_-]+)/i,
        // 修正：支援多種社團 URL 格式
        groupsPost: /https?:\/\/(?:www\.|m\.)?facebook\.com\/groups\/([A-Za-z0-9_-]+)\/posts\/([A-Za-z0-9_-]+)/i,
        groupsPermalink: /https?:\/\/(?:www\.|m\.)?facebook\.com\/groups\/([A-Za-z0-9_-]+)\/permalink\/(\d+)/i,
        groups: /https?:\/\/(?:www\.|m\.)?facebook\.com\/groups\/([A-Za-z0-9_-]+)(?:\/)?(?:\?([^#\s]*))?/i,
        generic: /https?:\/\/(?:www\.|m\.)?facebook\.com\/(.+)/i
    },

    threads: {
        // 支援 threads.net（舊域名）和 threads.com（2024年後新域名）
        post: /https?:\/\/(?:www\.)?threads(?:\.net|\.com)\/@([A-Za-z0-9._-]+)\/post\/([A-Za-z0-9_-]+)/i,
        profile: /https?:\/\/(?:www\.)?threads(?:\.net|\.com)\/@([A-Za-z0-9._-]+)/i
    },

    tiktok: {
        video: /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._-]+)\/video\/(\d+)/i,
        shortUrl: /https?:\/\/vm\.tiktok\.com\/([A-Za-z0-9]+)/i
    },

    plurk: {
        post: /https?:\/\/(?:www\.)?plurk\.com\/p\/([A-Za-z0-9]+)/i,
        profile: /https?:\/\/(?:www\.)?plurk\.com\/([A-Za-z0-9_-]+)/i
    },

    bluesky: {
        post: /https?:\/\/bsky\.app\/profile\/([^\/]+)\/post\/([A-Za-z0-9]+)/i,
        profile: /https?:\/\/bsky\.app\/profile\/([^\/]+)$/i
    },

    // 社群網站
    ptt: {
        article: /https?:\/\/(?:www\.)?ptt\.cc\/bbs\/([A-Za-z0-9_-]+)\/M\.(\d+)\.A\.([A-F0-9]+)\.html/i,
        board: /https?:\/\/(?:www\.)?ptt\.cc\/bbs\/([A-Za-z0-9_-]+)\/index\.html/i
    },

    pttweb: {
        article: /https?:\/\/(?:www\.)?pttweb\.cc\/bbs\/([A-Za-z0-9_-]+)\/M\.(\d+)\.A\.([A-F0-9]+)/i
    },

    bahamut: {
        forum: /https?:\/\/forum\.gamer\.com\.tw\/Co?\.php\?bsn=(\d+)&snA?=(\d+)/i,
        home: /https?:\/\/home\.gamer\.com\.tw\/artwork\.php\?sn=(\d+)/i,
        creationDetail: /https?:\/\/home\.gamer\.com\.tw\/creationDetail\.php\?sn=(\d+)/i
    },

    dcard: {
        post: /https?:\/\/(?:www\.)?dcard\.tw\/f\/([A-Za-z0-9_-]+)\/p\/(\d+)/i,
        forum: /https?:\/\/(?:www\.)?dcard\.tw\/f\/([A-Za-z0-9_-]+)/i
    },

    // 媒體平台
    pixiv: {
        artwork: /https?:\/\/(?:www\.)?pixiv\.net\/(?:en\/)?artworks\/(\d+)/i,
        user: /https?:\/\/(?:www\.)?pixiv\.net\/(?:en\/)?users\/(\d+)/i,
        novel: /https?:\/\/(?:www\.)?pixiv\.net\/novel\/show\.php\?id=(\d+)/i
    },

    iwara: {
        video: /https?:\/\/(?:www\.)?iwara\.tv\/video\/([A-Za-z0-9_-]+)/i,
        profile: /https?:\/\/(?:www\.)?iwara\.tv\/profile\/([A-Za-z0-9_-]+)/i
    },

    bilibili: {
        video: /https?:\/\/(?:www\.)?bilibili\.com\/video\/([A-Za-z0-9]+)(?:\?[^#\s]*)?(?:#[^\s]*)?/i,
        column: /https?:\/\/(?:www\.)?bilibili\.com\/read\/cv(\d+)(?:\?[^#\s]*)?(?:#[^\s]*)?/i,
        dynamic: /https?:\/\/(?:www\.)?bilibili\.com\/opus\/(\d+)(?:\?[^#\s]*)?(?:#[^\s]*)?/i,
        space: /https?:\/\/(?:www\.)?bilibili\.com\/space\/(\d+)(?:\?[^#\s]*)?(?:#[^\s]*)?/i,
        live: /https?:\/\/live\.bilibili\.com\/(\d+)(?:\?[^#\s]*)?(?:#[^\s]*)?/i,
        shortUrl: /https?:\/\/b23\.tv\/([A-Za-z0-9]+)(?:\?[^#\s]*)?(?:#[^\s]*)?/i,
        mobileShortUrl: /https?:\/\/m\.bilibili\.com\/video\/([A-Za-z0-9]+)(?:\?[^#\s]*)?(?:#[^\s]*)?/i
    },

    // 電商平台
    pchome: {
        // PCHome 24h 購物產品頁面 (格式: DGCA07-A900FARTQ，6碼-9碼)
        product: /https?:\/\/24h\.pchome\.com\.tw\/prod\/([A-Z0-9]{6}-[A-Z0-9]{9})/i,
        // PCHome 商店頁面（備用）
        store: /https?:\/\/24h\.pchome\.com\.tw\/store\/([A-Za-z0-9-]+)/i
    },

    // 18+ 內容 (可選)
    ehentai: {
        gallery: /https?:\/\/(?:e-hentai\.org|exhentai\.org)\/g\/(\d+)\/([a-f0-9]+)/i
    },

    nhentai: {
        gallery: /https?:\/\/nhentai\.net\/g\/(\d+)/i
    },

    // 遊戲官網
    nikke: {
        // 勝利女神：妮姬 官方網站（台灣）
        // 格式: nikke.hotcool.tw/News_detail-{id}
        news: /https?:\/\/nikke\.hotcool\.tw\/News_detail-(\d+)/i
    },

    // 新聞平台
    linetoday: {
        article: /https?:\/\/today\.line\.me\/([a-z]{2})\/v3\/article\/([A-Za-z0-9]+)/i
    },

    udn: {
        // UDN 聯合新聞網
        // 格式: udn.com/news/story/{分類ID}/{文章ID}
        article: /https?:\/\/(?:www\.)?udn\.com\/news\/story\/(\d+)\/(\d+)/i,
        // 格式: udn.com/news/amp/story/{分類ID}/{文章ID}
        ampArticle: /https?:\/\/(?:www\.)?udn\.com\/news\/amp\/story\/(\d+)\/(\d+)/i,
        // 格式: video.udn.com/news/{文章ID}
        video: /https?:\/\/video\.udn\.com\/news\/(\d+)/i
    },

    xfastest: {
        // XFastest 最速科技
        // 格式: news.xfastest.com/{分類}/{文章ID}/{slug}/
        article: /https?:\/\/news\.xfastest\.com\/([a-zA-Z0-9_-]+)\/(\d+)\/([a-zA-Z0-9_%-]+)\/?/i
    },

    // 論壇
    mobile01: {
        // 文章頁面: mobile01.com/topicdetail.php?f=490&t=7207897&p=3
        topic: /https?:\/\/(?:www\.)?mobile01\.com\/topicdetail\.php\?(?:[^#\s]*&)?f=(\d+)(?:&[^#\s]*)?&t=(\d+)(?:&p=(\d+))?/i
    },

    // 成人內容平台
    pornhub: {
        // 影片頁面: pornhub.com/view_video.php?viewkey=xxxxx
        video: /https?:\/\/(?:www\.|[a-z]{2}\.)?pornhub\.com\/view_video\.php\?viewkey=([a-zA-Z0-9]+)/i,
        // 新版格式: pornhub.com/video/xxxxx
        videoNew: /https?:\/\/(?:www\.|[a-z]{2}\.)?pornhub\.com\/video\/([a-zA-Z0-9_-]+)/i,
        // 嵌入格式: pornhub.com/embed/xxxxx
        embed: /https?:\/\/(?:www\.|[a-z]{2}\.)?pornhub\.com\/embed\/([a-zA-Z0-9_-]+)/i
    }
};

module.exports = patterns;