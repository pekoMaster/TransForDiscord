async function fetchTweetData(tid, { fetchJSON, normalizeVxTwitterResponse, logFallback }) {
    const fxResp = await fetchJSON(`https://api.fxtwitter.com/i/status/${tid}`);
    if (fxResp && fxResp.tweet) {
        return { tweet: fxResp.tweet, source: 'fxtwitter' };
    }

    if (logFallback) {
        logFallback(tid);
    }

    const vxResp = await fetchJSON(`https://api.vxtwitter.com/i/status/${tid}`);
    if (vxResp) {
        const normalized = normalizeVxTwitterResponse(vxResp, tid);
        if (normalized) {
            return { tweet: normalized, source: 'vxtwitter' };
        }
    }

    return null;
}

module.exports = {
    fetchTweetData,
};
