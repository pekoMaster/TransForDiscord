const path = require('path');

function getProjectRoot() {
    return path.join(__dirname, '..', '..', '..');
}

function getTfdConfigPath() {
    return path.join(getProjectRoot(), 'tfd-system', 'config', 'tfd-config.json');
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
    loadTfdConfig,
    reloadTfdConfig
};
