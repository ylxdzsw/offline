const {test, expect} = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const gamesRoot = path.resolve('games')
const games = fs.readdirSync(gamesRoot, {withFileTypes: true})
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(gamesRoot, entry.name, 'page.ymd')))
    .map(entry => entry.name)
const pageFiles = ['index.html', ...games.map(game => `${game}.html`)]
const guideAssets = games.map(game => {
    const extension = fs.existsSync(path.join(gamesRoot, game, 'guide.svg')) ? 'svg' : 'webp'
    return `guides/${game}.${extension}`
})

test('build is self-contained and contains the complete PWA shell', async () => {
    const dist = path.resolve('dist')
    for (const file of [...pageFiles, 'manifest.webmanifest', 'sw.js', ...guideAssets, 'icons/icon-192.png', 'icons/icon-512.png']) {
        expect(fs.existsSync(path.join(dist, file)), file).toBeTruthy()
    }
    for (const page of pageFiles) {
        const html = fs.readFileSync(path.join(dist, page), 'utf8')
        expect(html).toContain('manifest.webmanifest')
        expect(html).toContain('maximum-scale=1,user-scalable=no,viewport-fit=cover')
        expect(html).toContain('name=apple-mobile-web-app-capable content=yes')
        expect(html).toContain('name=apple-mobile-web-app-status-bar-style content=black-translucent')
        expect(html).not.toMatch(/<(?:script|link|img)[^>]+(?:src|href)=["']https?:\/\//i)
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'))
    expect(manifest.background_color).toBe('#f5f4f2')
    expect(manifest.theme_color).toBe('#f5f4f2')
    for (const game of games) {
        const html = fs.readFileSync(path.join(dist, `${game}.html`), 'utf8')
        expect(html).toContain(`<offline-shell page=${game}`)
        expect(html.includes(`id=${game}-worker-payload`)).toBe(fs.existsSync(path.join(gamesRoot, game, 'worker.js')))
    }
    const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8')
    for (const asset of [...pageFiles.map(file => './' + file), './manifest.webmanifest', ...guideAssets.map(file => './' + file)]) {
        expect(sw).toContain(asset)
    }
    expect(sw).not.toContain('cache.put(request')
})

test('language preference persists across pages without changing their URLs', async ({page}) => {
    await page.goto('/index.html')
    await page.locator('offline-shell .menu-btn').click()
    await page.locator('offline-shell [data-value="zh"]').click()
    await expect(page.locator('offline-shell h1')).toHaveText('经典游戏')
    await expect(page).toHaveURL(/\/index\.html$/)
    expect(await page.evaluate(() => localStorage.getItem('offline-games:v1:language'))).toBe('zh')
    await expect(page.locator('.game-gallery h2').first()).toHaveText('中国象棋')
    await expect(page.locator('.game-gallery article')).toHaveCount(games.length)
    await expect(page.locator('.game-gallery h2').last()).toHaveText('蜘蛛纸牌')
    await page.locator('offline-shell .menu-btn').click()
    await expect(page.locator('offline-shell aside')).toHaveAttribute('aria-hidden', 'false')
    await expect(page.locator('offline-shell offline-drawer .brand')).toHaveAttribute('href', /index\.html$/)
    await expect(page.locator('offline-shell offline-drawer nav a')).toHaveCount(games.length)
    await expect(page.locator('offline-shell offline-drawer nav a[href*="index.html"]')).toHaveCount(0)
    await expect(page.locator('offline-shell offline-drawer a[href*="xiangqi.html"]')).toHaveAttribute('href', /xiangqi\.html$/)
    await expect(page.locator('offline-shell offline-drawer a[href*="reversi.html"]')).toHaveAttribute('href', /reversi\.html$/)
    await expect(page.locator('offline-shell offline-drawer a[href*="checkers.html"]')).toHaveAttribute('href', /checkers\.html$/)
    await expect(page.locator('offline-shell offline-drawer a[href*="huarong.html"]')).toHaveAttribute('href', /huarong\.html$/)
    await page.locator('offline-shell offline-drawer a[href*="xiangqi.html"]').click()
    await expect(page).toHaveURL(/\/xiangqi\.html$/)
    await expect(page.locator('offline-shell h1')).toHaveText('中国象棋')
})

test('theme preference switches and persists across pages', async ({page}) => {
    await page.goto('/index.html')
    await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/)
    await page.locator('offline-shell .menu-btn').click()
    await page.locator('offline-shell [data-value="dark"]').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('offline-shell [data-value="dark"]')).toHaveAttribute('aria-pressed', 'true')
    await page.goto('/chess.html')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.locator('offline-shell .menu-btn').click()
    await page.locator('offline-shell [data-value="system"]').click()
    await expect(page.locator('offline-shell [data-value="system"]')).toHaveAttribute('aria-pressed', 'true')
})

test('drawer controls remain reachable on a short phone viewport', async ({page}) => {
    await page.setViewportSize({width: 320, height: 568})
    await page.goto('/index.html')
    const menu = page.locator('offline-shell .menu-btn')
    const layout = page.locator('offline-shell .layout')
    const drawer = page.locator('offline-shell aside')
    const darkTheme = page.locator('offline-shell [data-value="dark"]')

    await expect(drawer).toHaveAttribute('inert', '')
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await menu.click()
    await expect(drawer).not.toHaveAttribute('inert', '')
    await expect(layout).toHaveAttribute('inert', '')
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    await expect(drawer).toHaveCSS('overflow-y', 'auto')

    await darkTheme.scrollIntoViewIfNeeded()
    await expect(darkTheme).toBeInViewport()
    await darkTheme.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.locator('offline-shell offline-drawer .close-btn').click()
    await expect(drawer).toHaveAttribute('inert', '')
    await expect(layout).not.toHaveAttribute('inert', '')
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await expect(menu).toBeFocused()
})

test('closed drawer stays fully offscreen on iPad and desktop widths', async ({page}) => {
    for (const viewport of [{width: 1024, height: 768}, {width: 1440, height: 900}]) {
        await page.setViewportSize(viewport)
        await page.goto('/index.html')
        const menu = page.locator('offline-shell .menu-btn')
        const drawer = page.locator('offline-shell aside')

        const closed = await drawer.boundingBox()
        expect(closed.x + closed.width).toBeLessThanOrEqual(-60)

        await menu.click()
        await expect.poll(async () => (await drawer.boundingBox()).x)
            .toBeCloseTo((viewport.width - 480) / 2, 0)

        await page.locator('offline-shell offline-drawer .close-btn').click()
        await expect(drawer).toHaveAttribute('inert', '')
        await expect.poll(async () => {
            const box = await drawer.boundingBox()
            return box.x + box.width
        }).toBeLessThanOrEqual(-60)
    }
})

test('app shell suppresses page bounce and browser zoom gestures', async ({page}) => {
    await page.goto('/index.html')
    await expect(page.locator('html')).toHaveCSS('overscroll-behavior', 'none')
    await expect(page.locator('body')).toHaveCSS('overscroll-behavior', 'none')
    await expect(page.locator('html')).toHaveCSS('touch-action', 'pan-x pan-y')
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(245, 244, 242)')
})

test('copyright stays below the first screen on every page', async ({page}) => {
    for (const viewport of [{width: 390, height: 844}, {width: 1024, height: 768}]) {
        await page.setViewportSize(viewport)
        for (const url of pageFiles.map(file => '/' + file)) {
            await page.goto(url)
            const footer = page.locator('offline-shell footer')
            expect(await footer.evaluate(element => element.getBoundingClientRect().top), url)
                .toBeGreaterThanOrEqual(viewport.height)
            await footer.scrollIntoViewIfNeeded()
            await expect(footer).toBeInViewport()
        }
    }
})

test('navigator language auto-detects Chinese without a saved preference', async ({browser}) => {
    const context = await browser.newContext({locale: 'zh-CN', viewport: {width: 390, height: 844}})
    const page = await context.newPage()
    await page.goto('/index.html')
    await expect(page.locator('offline-shell h1')).toHaveText('经典游戏')
    expect(await page.locator('html').getAttribute('lang')).toBe('zh-CN')
    await context.close()
})

test('game intro opens localized rules and tips without appearing in the gallery', async ({page}) => {
    await page.goto('/index.html')
    await expect(page.locator('offline-shell .guide-btn')).toBeHidden()

    await page.setViewportSize({width: 320, height: 568})
    await page.goto('/wuziqi.html')
    const intro = page.locator('offline-shell .guide-btn')
    await expect(intro).toHaveAttribute('aria-label', 'How to play')
    await intro.click()
    const dialog = page.locator('offline-shell offline-guide dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.intro')).toContainText('Black stones')
    await expect(dialog.locator('.quick-list li')).toHaveCount(3)
    await expect(dialog.locator('.rule-group')).toHaveCount(3)
    expect(await dialog.locator('.rule-group li').count()).toBeGreaterThanOrEqual(8)
    await expect(dialog.locator('.tips-list li')).toHaveCount(3)
    await expect(dialog.locator('figcaption')).toContainText('Winning lines')
    await expect(dialog.locator('.guide-image')).toHaveAttribute('src', './guides/wuziqi.svg')
    expect(await dialog.locator('.guide-image').evaluate(image => image.complete && image.naturalWidth > 0)).toBeTruthy()
    expect(await dialog.evaluate(element => {
        const rect = element.getBoundingClientRect()
        return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
    })).toBeTruthy()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(intro).toBeFocused()

    await page.evaluate(() => localStorage.setItem('offline-games:v1:language', 'zh'))
    await page.goto('/sudoku.html')
    await page.locator('offline-shell .guide-btn').click()
    await expect(page.locator('offline-shell #guide-heading')).toHaveText('怎么玩')
    await expect(page.locator('offline-shell .quick-title')).toHaveText('三步上手')
    await expect(page.locator('offline-shell .rules-title')).toHaveText('完整规则')
    await expect(page.locator('offline-shell .rule-group').first()).toContainText('谜题构成')
    await expect(page.locator('offline-shell .done-btn')).toHaveText('知道了')
})

test('Xiangqi plays an AI reply, persists, reloads, and undoes a full turn', async ({page}) => {
    await page.goto('/xiangqi.html')
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
    await page.goto('/wuziqi.html')
    await page.locator('wuziqi-game .spot[data-index="112"]').click()
    await expect(page.locator('wuziqi-game .status')).toHaveText('Your turn', {timeout: 6000})
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:wuziqi')).history.length)).toBe(2)
    await page.locator('wuziqi-game .undo').click()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:wuziqi')).history.length)).toBe(0)
})

test('Sudoku supports long-press notes, entries, undo, and persistence without hints', async ({page}) => {
    await page.goto('/sudoku.html')
    let editable = page.locator('sudoku-game .cell:not(.given)').first()
    await editable.click()
    await expect(page.locator('sudoku-game .notes-toggle, sudoku-game .hint')).toHaveCount(0)
    await page.locator('sudoku-game .digit[data-digit="3"]').click({delay: 600})
    await expect(editable.locator('.notes')).toContainText('3')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:sudoku')).history.length)).toBe(1)
    await page.reload()
    editable = page.locator('sudoku-game .cell:not(.given)').first()
    await expect(editable.locator('.notes')).toContainText('3')
    await editable.click()
    await page.locator('sudoku-game .digit[data-digit="4"]').click()
    await expect(editable).toHaveText('4')
    await expect(page.locator('sudoku-game .undo')).toBeEnabled()
    await page.locator('sudoku-game .undo').click()
    await expect(editable.locator('.notes')).toContainText('3')
})

test('2048 merges, scores, persists, reloads, undoes, and accepts a swipe', async ({page}) => {
    await page.goto('/2048.html')
    await expect(page.locator('game-2048 .cell:not([data-value="0"])')).toHaveCount(2)
    await page.locator('game-2048').evaluate(game => {
        Object.assign(game.state, {
            seed: 7,
            board: [2,2,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
            score: 0,
            best: 0,
            spawnCount: 2,
            history: [],
            reached2048: false,
            outcome: null,
        })
        game.render()
    })
    const board = page.locator('game-2048 .board')
    await board.press('ArrowLeft')
    await expect(page.locator('game-2048 .current-score')).toHaveText('4')
    await expect(page.locator('game-2048 .cell[data-value="4"]')).toHaveCount(1)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:2048')).history.length)).toBe(1)

    await page.reload()
    await expect(page.locator('game-2048 .best-score')).toHaveText('4')
    await page.locator('game-2048 .undo').click()
    await expect(page.locator('game-2048 .current-score')).toHaveText('0')
    await expect(page.locator('game-2048 .cell[data-value="2"]')).toHaveCount(2)

    await board.dispatchEvent('pointerdown', {pointerId: 1, pointerType: 'touch', clientX: 240, clientY: 120})
    await board.dispatchEvent('pointerup', {pointerId: 1, pointerType: 'touch', clientX: 40, clientY: 120})
    await expect(page.locator('game-2048 .current-score')).toHaveText('4')
})

test('Junqi places the army, conceals the opponent, plays, persists, and undoes', async ({page}) => {
    await page.goto('/junqi.html')
    await expect(page.locator('junqi-game .piece.hidden').first()).toHaveText('◆')
    await expect(page.locator('junqi-game .new')).toHaveText('Start battle')
    const swap = await page.locator('junqi-game').evaluate(game => {
        const engine = OfflineGames.Junqi
        return game.state.board
            .map((piece,index) => ({piece,index}))
            .filter(({piece}) => piece?.side === engine.RED && ![engine.FLAG,engine.MINE,engine.BOMB].includes(piece.type))
            .slice(0,2)
            .map(({index}) => index)
    })
    const before = await page.locator('junqi-game').evaluate((game, swap) => swap.map(index => game.state.board[index].id), swap)
    await page.locator(`junqi-game .square[data-index="${swap[0]}"]`).click()
    await expect(page.locator('junqi-game .status')).toHaveText('Select another piece to swap')
    await page.locator(`junqi-game .square[data-index="${swap[1]}"]`).click()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:junqi')).phase)).toBe('placement')
    await page.reload()
    expect(await page.locator('junqi-game').evaluate((game, swap) => swap.map(index => game.state.board[index].id), swap)).toEqual(before.reverse())
    await page.locator('junqi-game .new').click()
    await expect(page.locator('junqi-game .status')).toHaveText('Your turn')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:junqi')).phase)).toBe('playing')
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
    await page.goto('/chess.html')
    await page.locator('chess-game .square[data-index="52"]').click()
    await page.locator('chess-game .square[data-index="36"]').click()
    await expect(page.locator('chess-game .status')).toHaveText('Your turn',{timeout:6000})
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('offline-games:v1:chess')).history.length)).toBe(2)
    await page.reload();await page.locator('chess-game .undo').click()
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('offline-games:v1:chess')).history.length)).toBe(0)
})

test('Chess promotion presents all choices and applies the selected piece',async({page})=>{
    await page.goto('/chess.html')
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
    await page.goto('/reversi.html')
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

test('English Draughts plays full turns and previews a compulsory multi-jump', async ({page}) => {
    await page.goto('/checkers.html')
    await expect(page.locator('checkers-game .square.movable')).toHaveCount(4)
    await expect(page.locator('checkers-game .black-count')).toHaveText('12')
    await page.locator('checkers-game').evaluate(game => {
        const parent = game.parentNode
        game.remove()
        parent.append(game)
    })
    await page.locator('checkers-game .difficulty').selectOption('easy')
    await page.locator('checkers-game .square[data-index="40"]').click()
    await expect(page.locator('checkers-game .status')).toHaveText('Choose a highlighted destination')
    await page.locator('checkers-game .square[data-index="33"]').click()
    await expect(page.locator('checkers-game .status')).not.toHaveText('Opponent is thinking…', {timeout: 6000})
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:checkers')).history.length)).toBe(2)
    await page.reload()
    await page.locator('checkers-game .undo').click()
    await expect(page.locator('checkers-game .black-count')).toHaveText('12')
    await expect(page.locator('checkers-game .red-count')).toHaveText('12')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:checkers')).history.length)).toBe(0)

    await page.locator('checkers-game').evaluate(game => {
        const engine = OfflineGames.Checkers
        const board = Array(64).fill(engine.EMPTY)
        board[42] = engine.BLACK_MAN
        board[35] = engine.RED_MAN
        board[19] = engine.RED_MAN
        Object.assign(game.state, {
            board,
            turn: engine.BLACK,
            halfmove: 0,
            keys: [engine.positionKey(board, engine.BLACK)],
            history: [],
            outcome: null,
            lastMove: null,
        })
        game.clearSelection()
        game.render()
    })
    await page.locator('checkers-game .square[data-index="42"]').click()
    await page.locator('checkers-game .square[data-index="28"]').click()
    await expect(page.locator('checkers-game .status')).toHaveText('Continue jumping with the same piece')
    await expect(page.locator('checkers-game .square[data-index="28"] .piece.black')).toHaveCount(1)
    await expect(page.locator('checkers-game .square[data-index="35"] .piece')).toHaveCount(0)
    await page.locator('checkers-game .square[data-index="10"]').click()
    await expect(page.locator('checkers-game .status')).toHaveText('You win')
    await expect(page.locator('checkers-game .red-count')).toHaveText('0')
})

test('Huarong Dao hints an optimal slide, moves, persists, reloads, and undoes', async ({page}) => {
    await page.goto('/huarong.html')
    await expect(page.locator('huarong-game .piece')).toHaveCount(10)
    await page.locator('offline-shell .guide-btn').click()
    await expect(page.locator('offline-shell .rule-group')).toHaveCount(3)
    await expect(page.locator('offline-shell .guide-image')).toHaveAttribute('src', './guides/huarong.svg')
    await page.keyboard.press('Escape')
    await page.locator('huarong-game .difficulty').selectOption('easy')
    await expect(page.locator('huarong-game .move-count')).toHaveText('0')
    await page.locator('huarong-game .hint').click()
    await expect(page.locator('huarong-game .piece.hinted')).toHaveCount(1, {timeout: 6000})
    await expect(page.locator('huarong-game .target.hinted')).toHaveCount(1)
    await expect(page.locator('huarong-game .status')).toContainText('optimal moves remain')
    await page.locator('huarong-game .target.hinted').click()
    await expect(page.locator('huarong-game .move-count')).toHaveText('1')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:huarong')).history.length)).toBe(1)
    await page.reload()
    await expect(page.locator('huarong-game .undo')).toBeEnabled()
    await page.locator('huarong-game .undo').click()
    await expect(page.locator('huarong-game .move-count')).toHaveText('0')
})

test('Minesweeper confirms reveals, keeps flags reversible, persists, and has no undo', async ({page}) => {
    await page.goto('/minesweeper.html')
    await expect(page.locator('minesweeper-game .cell')).toHaveCount(256)
    await expect(page.locator('minesweeper-game .undo')).toHaveCount(0)
    await expect(page.locator('minesweeper-game .timer')).toHaveText('00:00')

    const first = page.locator('minesweeper-game .cell[data-index="119"]')
    const second = page.locator('minesweeper-game .cell[data-index="120"]')
    await first.click()
    await expect(first).toHaveClass(/selected/)
    expect(await page.locator('minesweeper-game .cell.revealed').count()).toBe(0)

    await second.click()
    await expect(second).toHaveClass(/selected/)
    await expect(first).not.toHaveClass(/selected/)
    expect(await page.locator('minesweeper-game .cell.revealed').count()).toBe(0)

    await second.click()
    expect(await page.locator('minesweeper-game .cell.revealed').count()).toBeGreaterThanOrEqual(9)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:minesweeper')))
    expect(saved.board.started).toBe(true)
    expect(saved.board.cells[120]).toBe(0)
    expect(saved.board.outcome).toBeNull()

    const coveredIndex = await page.locator('minesweeper-game').evaluate(game =>
        game.state.board.revealed.findIndex(revealed => !revealed))
    const covered = page.locator(`minesweeper-game .cell[data-index="${coveredIndex}"]`)
    await covered.click()
    await page.locator('minesweeper-game .flag').click()
    await expect(covered).toHaveClass(/flagged/)
    await page.locator('minesweeper-game .flag').click()
    await expect(covered).not.toHaveClass(/flagged/)
    await covered.dispatchEvent('pointerdown', {
        pointerId: 9, pointerType: 'touch', button: 0, clientX: 100, clientY: 300,
    })
    await page.waitForTimeout(560)
    await covered.dispatchEvent('pointerup', {
        pointerId: 9, pointerType: 'touch', button: 0, clientX: 100, clientY: 300,
    })
    await covered.dispatchEvent('click')
    await expect(covered).toHaveClass(/flagged/)
    await page.locator('minesweeper-game .flag').click()
    await expect(covered).not.toHaveClass(/flagged/)

    await page.reload()
    expect(await page.locator('minesweeper-game .cell.revealed').count()).toBeGreaterThanOrEqual(9)
    await page.locator('offline-shell .guide-btn').click()
    await expect(page.locator('offline-shell .guide-image')).toHaveAttribute('src', './guides/minesweeper.svg')
    await expect(page.locator('offline-shell .rule-group')).toHaveCount(3)
    await page.goto('/index.html')
    await expect(page.locator('.game-gallery article[data-game="minesweeper"] a')).toHaveText('Continue')
})

test('Solitaire draws, moves a tableau card, persists, reloads, and undoes', async ({page}) => {
    await page.goto('/solitaire.html')
    await expect(page.locator('solitaire-game .pile')).toHaveCount(7)
    await expect(page.locator('solitaire-game [data-action="draw"] .stock-count')).toHaveText('24')
    await expect(page.locator('solitaire-game .timer')).toHaveText('00:00')

    await page.locator('solitaire-game [data-action="draw"]').click()
    await expect(page.locator('solitaire-game .top .card.face[data-kind="waste"]')).toHaveCount(1)
    await expect(page.locator('solitaire-game .moves')).toHaveText('1')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:solitaire')).history.length)).toBe(1)
    await page.reload()
    await expect(page.locator('solitaire-game .top .card.face[data-kind="waste"]')).toHaveCount(1)
    await page.locator('solitaire-game .undo').click()
    await expect(page.locator('solitaire-game [data-action="draw"] .stock-count')).toHaveText('24')

    const move = await page.locator('solitaire-game').evaluate(game => {
        const engine = OfflineGames.Solitaire
        for (let seed = 0; seed < 500; seed++) {
            const deal = engine.newGame(seed, 1)
            for (let from = 1; from < 7; from++) {
                const card = deal.tableau[from].visible[0]
                for (let to = 0; to < 7; to++) {
                    if (from === to) continue
                    const top = deal.tableau[to].visible.at(-1)
                    if (engine.rank(card) + 1 === engine.rank(top) && engine.color(card) !== engine.color(top)) {
                        Object.assign(game.state, {
                            drawCount: 1, deal, moves: 0, elapsedMs: 0,
                            history: [], progress: false, outcome: null,
                        })
                        game.render()
                        return {from, to, hidden: deal.tableau[from].hidden.length}
                    }
                }
            }
        }
        throw new Error('No deterministic tableau fixture found')
    })
    await page.locator(`solitaire-game .card[data-kind="tableau"][data-column="${move.from}"][data-card="0"]`).click()
    await expect(page.locator('solitaire-game .status')).toContainText('selected')
    await page.locator(`solitaire-game .pile[data-column="${move.to}"]`).click({position: {x: 2, y: 220}})
    await expect(page.locator('solitaire-game .moves')).toHaveText('1')
    expect(await page.locator(`solitaire-game .pile[data-column="${move.from}"] .card.back`).count()).toBe(move.hidden - 1)
    await page.reload()
    await expect(page.locator('solitaire-game .moves')).toHaveText('1')

    await page.locator('offline-shell .guide-btn').click()
    await expect(page.locator('offline-shell .guide-image')).toHaveAttribute('src', './guides/solitaire.svg')
    await expect(page.locator('offline-shell .rule-group')).toHaveCount(3)
    await page.keyboard.press('Escape')

    await page.locator('solitaire-game').evaluate(game => {
        const foundations = Array.from({length: 4}, (_, suit) =>
            Array.from({length: suit === 3 ? 12 : 13}, (_, rank) => suit * 13 + rank))
        const tableau = Array.from({length: 7}, () => ({hidden: [], visible: []}))
        tableau[0].visible.push(51)
        Object.assign(game.state, {
            drawCount: 1,
            deal: {drawCount: 1, stock: [], waste: [], foundations, tableau, won: false},
            moves: 0, elapsedMs: 0, history: [], progress: false, outcome: null,
        })
        game.render()
    })
    await page.locator('solitaire-game .card[data-value="51"]').dblclick()
    await expect(page.locator('solitaire-game .status')).toHaveText('All four suits complete — you win!')
    await expect(page.locator('solitaire-game .celebration')).toBeVisible()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:solitaire')).outcome)).toBe('won')
})

test('Spider deals, persists, blocks empty-column deals, and completes the final run', async ({page}) => {
    await page.goto('/spider.html')
    await expect(page.locator('spider-game .pile')).toHaveCount(10)
    await expect(page.locator('spider-game .tableau .card.back')).toHaveCount(44)
    await expect(page.locator('spider-game .stock-count')).toHaveText('5')
    await expect(page.locator('spider-game .runs')).toHaveText('0/8')
    await expect(page.locator('spider-game .timer')).toHaveText('00:00')

    await page.locator('spider-game .stock').click()
    await expect(page.locator('spider-game .stock-count')).toHaveText('4')
    await expect(page.locator('spider-game .moves')).toHaveText('1')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:spider')).history.length)).toBe(1)
    await page.reload()
    await expect(page.locator('spider-game .stock-count')).toHaveText('4')
    await page.locator('spider-game .undo').click()
    await expect(page.locator('spider-game .stock-count')).toHaveText('5')

    await page.locator('offline-shell .guide-btn').click()
    await expect(page.locator('offline-shell .guide-image')).toHaveAttribute('src', './guides/spider.svg')
    await expect(page.locator('offline-shell .rule-group')).toHaveCount(3)
    await page.keyboard.press('Escape')

    await page.locator('spider-game').evaluate(game => {
        const deal = OfflineGames.Spider.newGame(11, 1)
        deal.tableau[1].visible.push(deal.tableau[0].visible.pop())
        deal.tableau[1].hidden.push(...deal.tableau[0].hidden.splice(0))
        game.state = {
            schema: 1, game: 'spider', suitCount: 1, deal,
            moves: 0, elapsedMs: 0, history: [], progress: false, outcome: null,
        }
        game.render()
    })
    await page.locator('spider-game .stock').click()
    await expect(page.locator('spider-game .status')).toHaveText('Fill every empty column before dealing from the stock')
    await expect(page.locator('spider-game .moves')).toHaveText('0')

    await page.locator('spider-game').evaluate(game => {
        const completed = Array.from({length: 7}, (_, group) =>
            Array.from({length: 13}, (_, index) => group * 13 + 12 - index))
        const tableau = Array.from({length: 10}, () => ({hidden: [], visible: []}))
        tableau[0].visible = Array.from({length: 12}, (_, index) => 7 * 13 + 12 - index)
        tableau[1].visible = [7 * 13]
        game.state = {
            schema: 1, game: 'spider', suitCount: 1,
            deal: {suitCount: 1, stock: [], completed, tableau, won: false},
            moves: 0, elapsedMs: 0, history: [], progress: false, outcome: null,
        }
        game.selected = null
        game.notice = null
        game.render()
    })
    await page.locator('spider-game .card[data-column="1"][data-card="0"]').click()
    await expect(page.locator('spider-game .status')).toContainText('selected')
    await page.locator('spider-game .card[data-column="0"][data-card="11"]').click()
    await expect(page.locator('spider-game .status')).toHaveText('All eight suited runs complete — you win!')
    await expect(page.locator('spider-game .runs')).toHaveText('8/8')
    await expect(page.locator('spider-game .celebration')).toBeVisible()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:spider')).outcome)).toBe('won')
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
    const context = await browser.newContext({locale: 'en-US', viewport: {width: 390, height: 844}, serviceWorkers: 'allow'})
    const page = await context.newPage()
    await page.goto('/index.html')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await context.setOffline(true)
    await page.goto('/xiangqi.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Xiangqi')
    await page.locator('offline-shell .menu-btn').click()
    await page.locator('offline-shell [data-value="zh"]').click()
    await expect(page.locator('offline-shell h1')).toHaveText('中国象棋')
    await expect(page).toHaveURL(/\/xiangqi\.html$/)
    await page.locator('offline-shell .menu-btn').click()
    await page.locator('offline-shell [data-value="en"]').click()
    await expect(page.locator('offline-shell h1')).toHaveText('Xiangqi')
    await page.goto('/wuziqi.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Wuziqi')
    await page.locator('wuziqi-game .spot[data-index="112"]').click()
    await expect(page.locator('wuziqi-game .status')).toHaveText('Your turn', {timeout: 6000})
    await page.goto('/reversi.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Reversi')
    await expect(page.locator('reversi-game .cell.legal')).toHaveCount(4)
    await page.goto('/checkers.html')
    await expect(page.locator('offline-shell h1')).toHaveText('English Draughts')
    await expect(page.locator('checkers-game .square.movable')).toHaveCount(4)
    await page.goto('/huarong.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Huarong Dao')
    await expect(page.locator('huarong-game .piece')).toHaveCount(10)
    await page.goto('/minesweeper.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Minesweeper')
    await expect(page.locator('minesweeper-game .cell')).toHaveCount(256)
    await page.goto('/solitaire.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Solitaire')
    await expect(page.locator('solitaire-game .pile')).toHaveCount(7)
    await page.goto('/spider.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Spider Solitaire')
    await expect(page.locator('spider-game .pile')).toHaveCount(10)
    await context.close()
})
