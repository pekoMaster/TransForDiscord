const ADMIN_EMAIL = 'lmmlmm16861@gmail.com';

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }

    // GET → 回傳 Google Client ID（給前端初始化 Sign-In）
    if (req.method === 'GET') {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID 未設定' });
        return res.json({ googleClientId: clientId });
    }

    // POST → 驗證身份 + 回傳 Bot 資料
    if (req.method === 'POST') {
        try {
            const { idToken } = req.body || {};
            if (!idToken) return res.status(400).json({ error: '缺少 idToken' });

            // 驗證 Google ID Token
            const googleRes = await fetch(
                `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
            );
            if (!googleRes.ok) return res.status(401).json({ error: 'Google token 驗證失敗' });

            const payload = await googleRes.json();
            if (payload.email !== ADMIN_EMAIL) {
                return res.status(403).json({ error: '此帳號未授權存取' });
            }

            const botToken = process.env.DISCORD_BOT_TOKEN;
            if (!botToken) return res.status(500).json({ error: 'DISCORD_BOT_TOKEN 未設定' });

            // 同時取得 Bot 資訊 + 伺服器列表
            const [botUser, appInfo, guildsBasic] = await Promise.all([
                discordFetch('/users/@me', botToken),
                discordFetch('/oauth2/applications/@me', botToken).catch(() => null),
                fetchAllGuilds(botToken)
            ]);

            // 批次取得各伺服器詳細資料（成員數等）
            const guildDetails = await fetchGuildDetails(
                guildsBasic.map(g => g.id),
                botToken
            );

            // 合併基本 + 詳細資料
            const guilds = guildsBasic.map(basic => {
                const detail = guildDetails[basic.id];
                return {
                    id: basic.id,
                    name: detail?.name || basic.name,
                    icon: detail?.icon || basic.icon,
                    owner: basic.owner,
                    permissions: basic.permissions,
                    features: detail?.features || basic.features || [],
                    approximate_member_count: detail?.approximate_member_count || 0,
                    approximate_presence_count: detail?.approximate_presence_count || 0,
                    description: detail?.description || null,
                    premium_tier: detail?.premium_tier || 0,
                    preferred_locale: detail?.preferred_locale || null,
                    vanity_url_code: detail?.vanity_url_code || null
                };
            });

            guilds.sort((a, b) => b.approximate_member_count - a.approximate_member_count);

            // 從 Bot Express API 取得 TFD 功能統計
            let tfdStats = null;
            try {
                const tfdApiUrl = process.env.TFD_API_URL;
                const tfdApiKey = process.env.TFD_API_KEY;
                if (tfdApiUrl && tfdApiKey) {
                    const tfdRes = await fetch(`${tfdApiUrl}/api/tfd-stats`, {
                        headers: { 'x-api-key': tfdApiKey },
                        signal: AbortSignal.timeout(5000),
                    });
                    if (tfdRes.ok) tfdStats = await tfdRes.json();
                }
            } catch (e) {
                console.error('[bot-stats] TFD API 查詢失敗:', e.message);
            }

            return res.json({
                bot: botUser,
                application: appInfo,
                guilds,
                totalGuilds: guilds.length,
                totalMembers: guilds.reduce((s, g) => s + g.approximate_member_count, 0),
                totalOnline: guilds.reduce((s, g) => s + g.approximate_presence_count, 0),
                tfdStats,
                fetchedAt: new Date().toISOString()
            });
        } catch (err) {
            console.error('[bot-stats] Error:', err);
            return res.status(500).json({ error: err.message || '伺服器內部錯誤' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};

/* ── Discord API helpers ── */

async function discordFetch(path, botToken) {
    const r = await fetch(`https://discord.com/api/v10${path}`, {
        headers: { Authorization: `Bot ${botToken}` }
    });
    if (!r.ok) throw new Error(`Discord API ${r.status}: ${path}`);
    return r.json();
}

async function fetchAllGuilds(botToken) {
    let all = [];
    let after;
    for (;;) {
        let url = 'https://discord.com/api/v10/users/@me/guilds?limit=200';
        if (after) url += `&after=${after}`;
        const r = await fetch(url, { headers: { Authorization: `Bot ${botToken}` } });
        if (!r.ok) throw new Error(`Discord API ${r.status}: guilds list`);
        const page = await r.json();
        all = all.concat(page);
        if (page.length < 200) break;
        after = page[page.length - 1].id;
    }
    return all;
}

async function fetchGuildDetails(ids, botToken) {
    const results = {};
    const BATCH = 5;
    for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        await Promise.all(batch.map(async id => {
            try {
                const r = await fetch(
                    `https://discord.com/api/v10/guilds/${id}?with_counts=true`,
                    { headers: { Authorization: `Bot ${botToken}` } }
                );
                if (r.ok) results[id] = await r.json();
            } catch {}
        }));
        if (i + BATCH < ids.length) await new Promise(r => setTimeout(r, 300));
    }
    return results;
}
