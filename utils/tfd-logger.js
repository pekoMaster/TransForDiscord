/**
 * TFD 統一 Logger
 * 格式: [MM/DD-HH:mm:ss] [Server] [Function] [User] detail
 */

function ts() {
    const n = new Date();
    const MM = String(n.getMonth() + 1).padStart(2, '0');
    const DD = String(n.getDate()).padStart(2, '0');
    const hh = String(n.getHours()).padStart(2, '0');
    const mm = String(n.getMinutes()).padStart(2, '0');
    const ss = String(n.getSeconds()).padStart(2, '0');
    return `[${MM}/${DD}-${hh}:${mm}:${ss}]`;
}

function getServer(source) {
    if (!source) return '[—]';
    if (source.guild) return `[${source.guild.name}]`;
    if (typeof source === 'string') return `[${source}]`;
    return '[DM]';
}

function getUser(source) {
    if (!source) return '';
    if (source.member?.displayName) return `[${source.member.displayName}]`;
    if (source.author?.globalName) return `[${source.author.globalName}]`;
    if (source.author?.username) return `[${source.author.username}]`;
    if (source.user?.globalName) return `[${source.user.globalName}]`;
    if (source.user?.username) return `[${source.user.username}]`;
    if (typeof source === 'string') return `[${source}]`;
    return '';
}

/**
 * @param {string} fn - 功能名稱 e.g. 'Twitter-V2', 'Pixiv', 'PTT', '翻譯'
 * @param {Object|string} source - message/interaction 物件，或伺服器名稱字串
 * @param {string} detail - URL 或其他細節
 */
function log(fn, source, detail = '') {
    const parts = [ts(), getServer(source), `[${fn}]`, getUser(source)];
    if (detail) parts.push(detail);
    console.log(parts.join(' '));
}

function warn(fn, source, detail = '') {
    const parts = [ts(), getServer(source), `[${fn}]`, getUser(source)];
    if (detail) parts.push(detail);
    console.warn(parts.join(' '));
}

function error(fn, source, detail = '') {
    const parts = [ts(), getServer(source), `[${fn}]`, getUser(source)];
    if (detail) parts.push(detail);
    console.error(parts.join(' '));
}

function sys(fn, detail = '') {
    console.log(`${ts()} [${fn}] ${detail}`);
}

function sysError(fn, detail = '') {
    console.error(`${ts()} [${fn}] ${detail}`);
}

module.exports = { log, warn, error, sys, sysError, ts };
