const {defineConfig} = require('@playwright/test')

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 30000,
    expect: {timeout: 5000},
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: 'http://127.0.0.1:4173',
        viewport: {width: 390, height: 844},
        serviceWorkers: 'allow',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        launchOptions: process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {},
    },
    webServer: {
        command: 'node scripts/serve.mjs dist',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
    },
})
