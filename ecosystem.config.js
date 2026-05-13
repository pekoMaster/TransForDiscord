module.exports = {
    apps: [{
        name: 'transfordiscord',
        script: 'index.js',
        watch: false,
        restart_delay: 5000,
        max_restarts: 10,
        env: {
            NODE_ENV: 'production',
            TZ: 'Asia/Taipei'
        }
    }]
};
