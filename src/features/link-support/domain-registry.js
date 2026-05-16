const SUPPORTED_SITES = [
    {
        siteName: 'twitter',
        label: 'Twitter/X',
        domains: ['twitter.com', 'x.com', 'mobile.twitter.com', 'vxtwitter.com', 'fxtwitter.com', 'fixupx.com', 'twittpr.com', 'c.vxtwitter.com', 'd.vxtwitter.com']
    },
    { siteName: 'instagram', label: 'Instagram', domains: ['instagram.com', 'www.instagram.com'] },
    { siteName: 'ptt', label: 'PTT', domains: ['ptt.cc', 'www.ptt.cc'] },
    { siteName: 'pttweb', label: 'PTT Web', domains: ['pttweb.cc', 'www.pttweb.cc'] },
    { siteName: 'bahamut', label: 'Bahamut', domains: ['forum.gamer.com.tw', 'home.gamer.com.tw', 'gnn.gamer.com.tw'] },
    { siteName: 'pixiv', label: 'Pixiv', domains: ['pixiv.net', 'www.pixiv.net'] },
    { siteName: 'bilibili', label: 'Bilibili', domains: ['bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 'live.bilibili.com', 'b23.tv'] },
    { siteName: 'pchome', label: 'PChome24h', domains: ['24h.pchome.com.tw'] },
    { siteName: 'pokewiki', label: 'Pokemon Wiki', domains: ['wiki.52poke.com'] },
    { siteName: 'nikke', label: 'NIKKE', domains: ['nikke.hotcool.tw'] },
    { siteName: 'storm', label: 'Storm', domains: ['storm.mg', 'www.storm.mg'] },
    { siteName: 'linetoday', label: 'LINE TODAY', domains: ['today.line.me'] },
    { siteName: 'msn', label: 'MSN', domains: ['msn.com', 'www.msn.com'], subdomainRoots: ['msn.com'] },
    { siteName: 'udn', label: 'UDN', domains: ['udn.com', 'www.udn.com', 'video.udn.com'] },
    { siteName: 'cts', label: 'CTS', domains: ['news.cts.com.tw'] },
    { siteName: 'xfastest', label: 'XFastest', domains: ['news.xfastest.com'] },
    { siteName: 'mobile01', label: 'Mobile01', domains: ['mobile01.com', 'www.mobile01.com'] },
    { siteName: 'pornhub', label: 'Pornhub', domains: ['pornhub.com', 'www.pornhub.com'], subdomainRoots: ['pornhub.com'] },
    { siteName: '4gamers', label: '4Gamers', domains: ['4gamers.com.tw', 'www.4gamers.com.tw'] },
    { siteName: 'threads', label: 'Threads', domains: ['threads.com', 'www.threads.com'] },
    { siteName: 'hololiveshop', label: 'Hololive Shop', domains: ['shop.hololivepro.com'] },
    { siteName: 'youtube', label: 'YouTube Live', domains: ['youtube.com', 'www.youtube.com'] }
];

function normalizeDomainInput(input) {
    if (!input || typeof input !== 'string') return null;

    let value = input.trim().toLowerCase();
    value = value.replace(/^<|>$/g, '');
    if (!value) return null;

    try {
        const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
        return normalizeHost(url.hostname);
    } catch (_) {
        return normalizeHost(value.split(/[/?#]/)[0]);
    }
}

function normalizeHost(host) {
    if (!host || typeof host !== 'string') return null;
    return host.trim().toLowerCase().replace(/\.$/, '') || null;
}

function canonicalDomain(site, domain) {
    if (!domain.startsWith('www.')) return domain;

    const bare = domain.slice(4);
    return site.domains.includes(bare) ? bare : domain;
}

function listSupportedDomains() {
    const seen = new Set();
    const rows = [];

    for (const site of SUPPORTED_SITES) {
        for (const domain of site.domains) {
            const canonical = canonicalDomain(site, domain);
            const key = `${site.siteName}:${canonical}`;
            if (seen.has(key)) continue;
            seen.add(key);
            rows.push({
                siteName: site.siteName,
                label: site.label,
                domain: canonical
            });
        }
    }

    return rows;
}

function resolveSupportedDomain(input) {
    const host = normalizeDomainInput(input);
    if (!host) return null;

    for (const site of SUPPORTED_SITES) {
        for (const domain of site.domains) {
            if (host === domain) {
                return {
                    siteName: site.siteName,
                    label: site.label,
                    domain: canonicalDomain(site, domain),
                    matchedHost: host
                };
            }
        }

        for (const root of site.subdomainRoots || []) {
            if (host === root || host.endsWith(`.${root}`)) {
                return {
                    siteName: site.siteName,
                    label: site.label,
                    domain: root,
                    matchedHost: host
                };
            }
        }
    }

    return null;
}

module.exports = {
    SUPPORTED_SITES,
    listSupportedDomains,
    normalizeDomainInput,
    resolveSupportedDomain
};
