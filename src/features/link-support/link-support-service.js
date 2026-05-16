const db = require('../../../db');
const { resolveSupportedDomain } = require('./domain-registry');

function setDomainEnabled(guildId, domainInput, enabled, updatedBy = null) {
    const resolved = resolveSupportedDomain(domainInput);
    if (!resolved) {
        return { ok: false, reason: 'unsupported_domain' };
    }

    if (enabled) {
        db.linkDomains.remove(guildId, resolved.domain);
    } else {
        db.linkDomains.set(guildId, resolved.siteName, resolved.domain, false, updatedBy);
    }

    return { ok: true, enabled: !!enabled, ...resolved };
}

function isDomainEnabled(guildId, domainInput) {
    if (!guildId) return true;

    const resolved = resolveSupportedDomain(domainInput);
    if (!resolved) return true;

    return db.linkDomains.isEnabled(guildId, resolved.domain);
}

function listDisabledDomains(guildId) {
    return db.linkDomains.listDisabled(guildId);
}

module.exports = {
    setDomainEnabled,
    isDomainEnabled,
    listDisabledDomains
};
