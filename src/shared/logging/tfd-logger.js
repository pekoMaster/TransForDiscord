function ts() {
    const now = new Date();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
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

function sysWarn(fn, detail = '') {
    console.warn(`${ts()} [${fn}] ${detail}`);
}

function sysError(fn, detail = '') {
    console.error(`${ts()} [${fn}] ${detail}`);
}

module.exports = {
    log,
    warn,
    error,
    sys,
    sysWarn,
    sysError,
    ts
};
