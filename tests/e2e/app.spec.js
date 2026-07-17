const {test, expect} = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')

test('build is self-contained and contains the complete PWA shell', async () => {
    const dist = path.resolve('dist')
    for (const file of ['index.html', 'xiangqi.html', 'wuziqi.html', 'sudoku.html', 'junqi.html', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png']) {
        expect(fs.existsSync(path.join(dist, file)), file).toBeTruthy()
    }
    for (const page of ['index.html', 'xiangqi.html', 'wuziqi.html', 'sudoku.html', 'junqi.html']) {
        const html = fs.readFileSync(path.join(dist, page), 'utf8')
        expect(html).toContain('manifest.webmanifest')
        expect(html).not.toMatch(/<(?:script|link|img)[^>]+(?:src|href)=["']https?:\/\//i)
    }
    const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8')
    for (const asset of ['./index.html', './xiangqi.html', './wuziqi.html', './sudoku.html', './junqi.html', './manifest.webmanifest']) expect(sw).toContain(asset)
})

test('gallery and sidebar localize from query and preserve the override', async ({page}) => {
    await page.goto('/index.html?lang=zh')
    await expect(page.locator('offline-shell h1')).toHaveText('经典棋类')
    await expect(page.locator('game-gallery h2').first()).toHaveText('中国象棋')
    await page.locator('offline-shell .menu').click()
    await expect(page.locator('offline-shell aside')).toHaveAttribute('aria-hidden', 'false')
    await expect(page.locator('offline-shell a[data-page="xiangqi"]')).toHaveAttribute('href', /xiangqi\.html\?lang=zh$/)
    await page.locator('offline-shell .backdrop').click({position: {x: 380, y: 400}})
    await expect(page.locator('offline-shell aside')).toHaveAttribute('aria-hidden', 'true')
})

test('navigator language auto-detects Chinese without a query override', async ({browser}) => {
    const context = await browser.newContext({locale: 'zh-CN', viewport: {width: 390, height: 844}})
    const page = await context.newPage()
    await page.goto('/index.html')
    await expect(page.locator('offline-shell h1')).toHaveText('经典棋类')
    expect(await page.locator('html').getAttribute('lang')).toBe('zh-CN')
    await context.close()
})

test('Xiangqi plays an AI reply, persists, reloads, and undoes a full turn', async ({page}) => {
    await page.goto('/xiangqi.html?lang=en')
    await expect(page.locator('xiangqi-game .status')).toHaveText('Your turn')
    await page.locator('xiangqi-game .spot[data-index="54"]').click()
    await page.locator('xiangqi-game .spot[data-index="45"]').click()
    await expect(page.locator('xiangqi-game .status')).toHaveText('Your turn', {timeout: 6000})
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:xiangqi')).history.length)).toBe(2)
    await page.reload()
    await expect(page.locator('xiangqi-game .status')).toHaveText('Your turn')
    await page.locator('xiangqi-game .undo').click()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:xiangqi')).history.length)).toBe(0)
})

test('Wuziqi plays an AI reply and undo removes the pair', async ({page}) => {
    await page.goto('/wuziqi.html?lang=en')
    await page.locator('wuziqi-game .spot[data-index="112"]').click()
    await expect(page.locator('wuziqi-game .status')).toHaveText('Your turn', {timeout: 6000})
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:wuziqi')).history.length)).toBe(2)
    await page.locator('wuziqi-game .undo').click()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:wuziqi')).history.length)).toBe(0)
})

test('Sudoku supports entries, notes, hints, undo, and persistence', async ({page}) => {
    await page.goto('/sudoku.html?lang=en')
    const editable = page.locator('sudoku-game .cell:not(.given)').first()
    await editable.click()
    await page.locator('sudoku-game .notes-toggle').click()
    await page.locator('sudoku-game .digit[data-digit="3"]').click()
    await expect(editable.locator('.notes')).toContainText('3')
    await page.locator('sudoku-game .hint').click()
    await expect(editable).not.toContainText(/^$/)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:sudoku')).history.length)).toBe(2)
    await page.reload()
    await expect(page.locator('sudoku-game .undo')).toBeEnabled()
    await page.locator('sudoku-game .undo').click()
})

test('Junqi conceals the opponent, makes an AI reply, persists, and undoes', async ({page}) => {
    await page.goto('/junqi.html?lang=en')
    await expect(page.locator('junqi-game .piece.hidden').first()).toHaveText('◆')
    const move = await page.locator('junqi-game').evaluate(game => {
        const engine = OfflineGames.Junqi
        return engine.legalMoves(game.state.board, engine.RED)[0]
    })
    await page.locator(`junqi-game .square[data-index="${move.from}"]`).click()
    await page.locator(`junqi-game .square[data-index="${move.to}"]`).click()
    await expect(page.locator('junqi-game .status')).not.toHaveText('Opponent is thinking…', {timeout:6000})
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:junqi')).history.length)).toBe(2)
    await page.reload(); await page.locator('junqi-game .undo').click()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:junqi')).history.length)).toBe(0)
})

for (const viewport of [{width: 320, height: 568}, {width: 390, height: 844}, {width: 430, height: 932}]) {
    test(`all pages fit a ${viewport.width}x${viewport.height} mobile viewport`, async ({page}) => {
        await page.setViewportSize(viewport)
        for (const url of ['/index.html', '/xiangqi.html', '/wuziqi.html', '/sudoku.html', '/junqi.html']) {
            await page.goto(url)
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
        }
    })
}

test('the installed app reloads and navigates completely offline', async ({browser}) => {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, serviceWorkers: 'allow'})
    const page = await context.newPage()
    await page.goto('/index.html?lang=en')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await context.setOffline(true)
    await page.goto('/xiangqi.html?lang=zh')
    await expect(page.locator('offline-shell h1')).toHaveText('中国象棋')
    await page.goto('/wuziqi.html?lang=en')
    await expect(page.locator('offline-shell h1')).toHaveText('Wuziqi')
    await page.locator('wuziqi-game .spot[data-index="112"]').click()
    await expect(page.locator('wuziqi-game .status')).toHaveText('Your turn', {timeout: 6000})
    await context.close()
})
