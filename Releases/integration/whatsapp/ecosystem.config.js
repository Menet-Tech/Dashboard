module.exports = {
    apps: [{
        name: "wa-gateway",
        script: "./src/server.js",
        instances: 1, // multiple instances with local auth and puppeteer currently not recommended without redis store / puppeteer cluster
        autorestart: true,
        watch: false,
        max_memory_restart: "1G",
        env: {
            NODE_ENV: "development",
        },
        env_production: {
            NODE_ENV: "production",
        }
    }]
};
