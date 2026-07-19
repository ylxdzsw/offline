const {test, expect} = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const catalog = require('../../games/catalog.json')
const pageFiles = ['index.html', ...catalog.map(game => `${game.id}.html`)]

test('build is self-contained and contains the complete PWA shell', async () => {
    const dist = path.resolve('dist')
    for (const file of [...pageFiles, 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png']) {
        expect(fs.existsSync(path.join(dist, file)), file).toBeTruthy()
    }
    for (const page of pageFiles) {
        const html = fs.readFileSync(path.join(dist, page), 'utf8')
        expect(html).toContain('manifest.webmanifest')
        expect(html).not.toMatch(/<(?:script|link|img)[^>]+(?:src|href)=["']https?:\/\//i)
    }
    for (const game of catalog) {
        const html = fs.readFileSync(path.join(dist, `${game.id}.html`), 'utf8')
        expect(html).toContain(`<${game.element}`)
        expect(html.includes(`id=${game.id}-worker-payload`)).toBe(game.worker)
    }
    const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8')
    for (const asset of [...pageFiles.map(file => './' + file), './manifest.webmanifest']) expect(sw).toContain(asset)
})

test('gallery and sidebar localize from query and preserve the override', async ({page}) => {
    await page.goto('/index.html?lang=zh')
    await expect(page.locator('offline-shell h1')).toHaveText('经典棋类')
    await expect(page.locator('.game-gallery h2').first()).toHaveText('中国象棋')
    await expect(page.locator('.game-gallery article')).toHaveCount(6)
    await expect(page.locator('.game-gallery h2').last()).toHaveText('黑白棋')
    await page.locator('offline-shell .menu').click()
    await expect(page.locator('offline-shell aside')).toHaveAttribute('aria-hidden', 'false')
    await expect(page.locator('offline-shell a[data-page="xiangqi"]')).toHaveAttribute('href', /xiangqi\.html\?lang=zh$/)
    await expect(page.locator('offline-shell a[data-page="reversi"]')).toHaveAttribute('href', /reversi\.html\?lang=zh$/)
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

test('game intro opens localized rules and tips without appearing in the gallery', async ({page}) => {
    await page.goto('/index.html?lang=en')
    await expect(page.locator('offline-shell .guide-trigger')).toBeHidden()

    await page.setViewportSize({width: 320, height: 568})
    await page.goto('/wuziqi.html?lang=en')
    const intro = page.locator('offline-shell .guide-trigger')
    await expect(intro).toHaveAttribute('aria-label', 'How to play')
    await intro.click()
    const dialog = page.locator('offline-shell .guide-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.guide-intro')).toContainText('Black stones')
    await expect(dialog.locator('.guide-rules li')).toHaveCount(3)
    await expect(dialog.locator('.guide-tips li')).toHaveCount(3)
    expect(await dialog.evaluate(element => {
        const rect = element.getBoundingClientRect()
        return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
    })).toBeTruthy()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(intro).toBeFocused()

    await page.goto('/sudoku.html?lang=zh')
    await page.locator('offline-shell .guide-trigger').click()
    await expect(page.locator('offline-shell #guide-title')).toHaveText('怎么玩')
    await expect(page.locator('offline-shell .rules-title')).toHaveText('基本规则')
    await expect(page.locator('offline-shell .guide-done')).toHaveText('知道了')
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

test('Chess makes a legal AI reply, persists, reloads, and undoes the turn',async({page})=>{
    await page.goto('/chess.html?lang=en')
    await page.locator('chess-game .square[data-index="52"]').click()
    await page.locator('chess-game .square[data-index="36"]').click()
    await expect(page.locator('chess-game .status')).toHaveText('Your turn',{timeout:6000})
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('offline-games:v1:chess')).history.length)).toBe(2)
    await page.reload();await page.locator('chess-game .undo').click()
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('offline-games:v1:chess')).history.length)).toBe(0)
})

test('Chess promotion presents all choices and applies the selected piece',async({page})=>{
    await page.goto('/chess.html?lang=en')
    await page.locator('chess-game').evaluate(game=>{
        const e=OfflineGames.Chess,board=Array(64).fill(null)
        board[e.at(7,4)]='wK';board[e.at(0,4)]='bK';board[e.at(1,0)]='wP'
        Object.assign(game.state,{board,turn:e.WHITE,castling:{wK:false,wQ:false,bK:false,bQ:false},enPassant:null,halfmove:0,fullmove:1,history:[],keys:[],outcome:null})
        game.state.keys=[e.positionKey(game.position())];game.render()
    })
    await page.locator('chess-game .square[data-index="8"]').click();await page.locator('chess-game .square[data-index="0"]').click()
    await expect(page.locator('chess-game .promotion')).toBeVisible();await expect(page.locator('chess-game .choice')).toHaveCount(4)
    await page.locator('chess-game .choice[data-type="N"]').click()
    expect(await page.locator('chess-game').evaluate(game=>game.state.board[0])).toBe('wN')
})

test('Reversi flips discs, plays an AI reply, persists, and undoes the turn', async ({page}) => {
    await page.goto('/reversi.html?lang=en')
    await expect(page.locator('reversi-game .cell.legal')).toHaveCount(4)
    await expect(page.locator('reversi-game .black-score')).toHaveText('2')
    await page.locator('reversi-game .cell[data-index="19"]').click()
    await expect(page.locator('reversi-game .status')).toHaveText('Your turn', {timeout: 6000})
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:reversi')).history.length)).toBe(2)
    await page.reload()
    await expect(page.locator('reversi-game .undo')).toBeEnabled()
    await page.locator('reversi-game .undo').click()
    await expect(page.locator('reversi-game .black-score')).toHaveText('2')
    await expect(page.locator('reversi-game .white-score')).toHaveText('2')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:reversi')).history.length)).toBe(0)

    await page.locator('reversi-game').evaluate(game => {
        const engine = OfflineGames.Reversi
        const board = Array(64).fill(engine.BLACK)
        board[0] = engine.EMPTY
        board[1] = engine.WHITE
        board[3] = engine.EMPTY
        board[4] = engine.WHITE
        Object.assign(game.state, {board, turn: engine.BLACK, history: [], outcome: null, passed: null})
        game.render()
    })
    await page.locator('reversi-game .cell[data-index="0"]').click()
    await expect(page.locator('reversi-game .status')).toHaveText('Opponent has no legal move — play again')
    await expect(page.locator('reversi-game .cell[data-index="3"]')).toHaveClass(/legal/)
})

for (const viewport of [{width: 320, height: 568}, {width: 390, height: 844}, {width: 430, height: 932}]) {
    test(`all pages fit a ${viewport.width}x${viewport.height} mobile viewport`, async ({page}) => {
        await page.setViewportSize(viewport)
        for (const url of pageFiles.map(file => '/' + file)) {
            await page.goto(url)
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), url).toBeTruthy()
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
    await page.goto('/reversi.html?lang=zh')
    await expect(page.locator('offline-shell h1')).toHaveText('黑白棋')
    await expect(page.locator('reversi-game .cell.legal')).toHaveCount(4)
    await context.close()
})
