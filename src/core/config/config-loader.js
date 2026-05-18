const path = require('path');

function getTfdConfigPath() {
    return path.join(__dirname, 'tfd-config.json');
}

function getPekoembedConfigPath() {
    return path.join(__dirname, 'pekoembed-config.json');
}

function getSupportedSitesConfigPath() {
    return path.join(__dirname, 'supported-sites.json');
}

function loadJson(configPath) {
    return require(configPath);
}

function reloadJson(configPath) {
    const resolvedPath = require.resolve(configPath);
    delete require.cache[resolvedPath];
    return require(resolvedPath);
}

function loadTfdConfig() {
    return loadJson(getTfdConfigPath());
}

function reloadTfdConfig() {
    return reloadJson(getTfdConfigPath());
}

module.exports = {
    getTfdConfigPath,
    getPekoembedConfigPath,
    getSupportedSitesConfigPath,
    loadTfdConfig,
    reloadTfdConfig
};
