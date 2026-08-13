const {test, expect} = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const gamesRoot = path.resolve('games')
const games = fs.readdirSync(gamesRoot, {withFileTypes: true})
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(gamesRoot, entry.name, 'page.ymd')))
    .map(entry => entry.name)
const gamePageFiles = games.map(game => `${game}.html`)
const pageFiles = ['index.html', ...gamePageFiles]
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

test('gallery grid logos stay centered and contained', async ({page}) => {
    await page.goto('/index.html')

    const geometry = await page.locator([
        'article[data-game="sudoku"] .preview > span',
        'article[data-game="go"] .preview > span',
        'article[data-game="doushouqi"] .preview > span',
        'article[data-game="huarong"] .preview > span',
        'article[data-game="sliding"] .preview > span',
        'article[data-game="nonogram"] .preview > span',
        'article[data-game="minesweeper"] .preview > span',
    ].join(',')).evaluateAll(marks => marks.map(mark => {
        const preview = mark.parentElement.getBoundingClientRect()
        const rect = mark.getBoundingClientRect()
        return {
            game: mark.closest('article').dataset.game,
            centerX: rect.left + rect.width / 2 - (preview.left + preview.width / 2),
            centerY: rect.top + rect.height / 2 - (preview.top + preview.height / 2),
            overflowX: mark.scrollWidth - mark.clientWidth,
            overflowY: mark.scrollHeight - mark.clientHeight,
        }
    }))

    for (const mark of geometry) {
        expect(Math.abs(mark.centerX), `${mark.game} horizontal alignment`).toBeLessThanOrEqual(.01)
        expect(Math.abs(mark.centerY), `${mark.game} vertical alignment`).toBeLessThanOrEqual(.01)
        expect(mark.overflowX, `${mark.game} horizontal overflow`).toBeLessThanOrEqual(0)
        expect(mark.overflowY, `${mark.game} vertical overflow`).toBeLessThanOrEqual(0)
    }

    const huarongOffsets = await page.locator('.huarong-mark').evaluate(mark => {
        const center = mark.getBoundingClientRect().left + mark.getBoundingClientRect().width / 2
        const offset = selector => {
            const rect = mark.querySelector(selector).getBoundingClientRect()
            return rect.left + rect.width / 2 - center
        }
        const soldiers = ['.s1', '.s2'].map(selector => mark.querySelector(selector).getBoundingClientRect())
        return [
            offset('.cao'),
            offset('.guan'),
            (soldiers[0].left + soldiers[1].right) / 2 - center,
        ]
    })
    for (const offset of huarongOffsets) expect(Math.abs(offset)).toBeLessThanOrEqual(.01)

    const slidingBorders = await page.locator('.sliding-mark i:not(:last-child)').evaluateAll(cells =>
        new Set(cells.map(cell => getComputedStyle(cell).borderTopColor)).size
    )
    expect(slidingBorders).toBe(1)
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
    await expect(page.locator('offline-shell offline-drawer a[href*="go.html"]')).toHaveAttribute('href', /go\.html$/)
    await expect(page.locator('offline-shell offline-drawer a[href*="reversi.html"]')).toHaveAttribute('href', /reversi\.html$/)
    await expect(page.locator('offline-shell offline-drawer a[href*="checkers.html"]')).toHaveAttribute('href', /checkers\.html$/)
    await expect(page.locator('offline-shell offline-drawer a[href*="backgammon.html"]')).toHaveAttribute('href', /backgammon\.html$/)
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

    const drawerFooter = page.locator('offline-shell offline-drawer footer')
    await drawerFooter.scrollIntoViewIfNeeded()
    await expect(drawerFooter).toBeInViewport()
    await expect(drawerFooter.locator('.copyright')).toHaveText('© 2026 ylxdzsw')
    await expect(drawerFooter.locator('a')).toHaveText('Source code available under the MIT license')
    await expect(drawerFooter.locator('a')).toHaveAttribute('href', 'https://github.com/ylxdzsw/offline')

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

test('gallery copyright stays reachable below the first screen', async ({page}) => {
    for (const viewport of [{width: 390, height: 844}, {width: 1024, height: 768}]) {
        await page.setViewportSize(viewport)
        await page.goto('/index.html')
        const footer = page.locator('offline-shell .layout > footer')
        expect(await footer.evaluate(element => element.getBoundingClientRect().top))
            .toBeGreaterThanOrEqual(viewport.height)
        await footer.scrollIntoViewIfNeeded()
        await expect(footer).toBeInViewport()
    }
})

test('game viewport setup waits for a parser-delayed game element', async ({page}) => {
    await page.setViewportSize({width: 320, height: 480})
    await page.goto('/2048.html')
    await page.evaluate(async () => {
        document.querySelector('offline-shell').remove()
        const shell = document.createElement('offline-shell')
        shell.setAttribute('page', '2048')
        shell.setAttribute('guide', './guides/2048.svg')
        document.body.append(shell)
        await new Promise(resolve => setTimeout(resolve, 50))
        shell.append(document.createElement('game-2048'))
    })

    await page.waitForFunction(() =>
        document.querySelector('offline-shell')?._fitSurface?.dataset.fitScale !== undefined
    )
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(480)
})

test('Spider uses the available width on compact phone viewports', async ({page}) => {
    for (const viewport of [
        {width: 320, height: 480},
        {width: 375, height: 667},
        {width: 393, height: 852, safeTop: 59, safeBottom: 34},
    ]) {
        await page.setViewportSize(viewport)
        await page.goto('/spider.html')
        await page.evaluate(({safeTop = 0, safeBottom = 0}) => {
            document.documentElement.style.setProperty('--safe-top', `${safeTop}px`)
            document.documentElement.style.setProperty('--safe-bottom', `${safeBottom}px`)
        }, viewport)
        await page.waitForFunction(() =>
            document.querySelector('offline-shell')?._fitSurface?.dataset.fitScale !== undefined
        )
        await page.evaluate(() => new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
        ))
        const geometry = await page.locator('spider-game').evaluate(game => {
            const table = game.shadowRoot.querySelector('.table').getBoundingClientRect()
            const host = game.getBoundingClientRect()
            return {
                scale: Number(document.querySelector('offline-shell')._fitSurface.dataset.fitScale),
                tableWidth: table.width,
                hostWidth: host.width,
            }
        })
        expect(geometry.scale).toBe(1)
        expect(geometry.tableWidth).toBeGreaterThanOrEqual(geometry.hostWidth - 1)
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
    await page.evaluate(() => {
        document.documentElement.style.setProperty('--safe-top', '47px')
        document.documentElement.style.setProperty('--safe-bottom', '34px')
    })
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
        return rect.left >= 0 && rect.right <= innerWidth
            && rect.top >= 47 && rect.bottom <= innerHeight - 34
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

test('Xiangqi legal capture hints preserve piece shape', async ({page}) => {
    await page.goto('/xiangqi.html')
    const target = page.locator('xiangqi-game .spot[data-index="1"]')
    const pieceSize = () => target.locator('.piece').evaluate(piece => {
        const {width, height} = piece.getBoundingClientRect()
        return {width, height}
    })
    const before = await pieceSize()

    await page.locator('xiangqi-game .spot[data-index="64"]').click()
    await expect(target).toHaveClass(/capture/)
    const after = await pieceSize()

    expect(after.width).toBeCloseTo(before.width)
    expect(after.height).toBeCloseTo(before.height)
})

test('Xiangqi keeps a fast AI reply visible and marks its landing square', async ({page}) => {
    await page.goto('/xiangqi.html')
    const midpoint = await page.evaluate(async () => {
        const game = document.querySelector('xiangqi-game')
        OfflineGames.runtime.createWorker = () => {
            const worker = {
                postMessage(message) {
                    const move = game.engine.legalMoves(game.state.board, game.engine.BLACK)[0]
                    queueMicrotask(() => worker.onmessage({data: {id: message.id, move}}))
                },
                terminate() {},
            }
            return worker
        }
        game.tap(54)
        const started = performance.now()
        game.tap(45)
        await new Promise(resolve => setTimeout(resolve, 180))
        const landing = game.shadowRoot.querySelector('.spot.last-to .piece')
        return {
            started,
            historyLength: game.state.history.length,
            thinking: game.thinking,
            animationName: getComputedStyle(landing).animationName,
        }
    })

    expect(midpoint.historyLength).toBe(1)
    expect(midpoint.thinking).toBeTruthy()
    expect(midpoint.animationName).toBe('land')

    await expect.poll(() => page.evaluate(() => document.querySelector('xiangqi-game').state.history.length)).toBe(2)
    expect(await page.evaluate(started => performance.now() - started, midpoint.started)).toBeGreaterThanOrEqual(320)
    await expect(page.locator('xiangqi-game .status')).toHaveText('Your turn')
    await expect(page.locator('xiangqi-game .spot.last-to .piece')).toHaveCount(1)
})

test('Wuziqi plays an AI reply and undo removes the pair', async ({page}) => {
    await page.goto('/wuziqi.html')
    await page.locator('wuziqi-game .spot[data-index="112"]').click()
    await expect(page.locator('wuziqi-game .status')).toHaveText('Your turn', {timeout: 6000})
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:wuziqi')).history.length)).toBe(2)
    await page.locator('wuziqi-game .undo').click()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:wuziqi')).history.length)).toBe(0)
})

test('Wuziqi keeps a fast AI reply visible and settles the latest stone', async ({page}) => {
    await page.goto('/wuziqi.html')
    const midpoint = await page.evaluate(async () => {
        const game = document.querySelector('wuziqi-game')
        OfflineGames.runtime.createWorker = () => {
            const worker = {
                postMessage(message) {
                    const move = game.state.board.findIndex(value => value === game.engine.EMPTY)
                    queueMicrotask(() => worker.onmessage({data: {id: message.id, move}}))
                },
                terminate() {},
            }
            return worker
        }
        const started = performance.now()
        game.tap(112)
        await new Promise(resolve => setTimeout(resolve, 180))
        const latest = game.shadowRoot.querySelector('.spot.last .stone')
        return {
            started,
            historyLength: game.state.history.length,
            thinking: game.thinking,
            animationName: getComputedStyle(latest).animationName,
        }
    })

    expect(midpoint.historyLength).toBe(1)
    expect(midpoint.thinking).toBeTruthy()
    expect(midpoint.animationName).toBe('place')

    await expect.poll(() => page.evaluate(() => document.querySelector('wuziqi-game').state.history.length)).toBe(2)
    expect(await page.evaluate(started => performance.now() - started, midpoint.started)).toBeGreaterThanOrEqual(320)
    await expect(page.locator('wuziqi-game .status')).toHaveText('Your turn')
    await expect(page.locator('wuziqi-game .spot.last .stone.white')).toHaveCount(1)
})

test('Go defaults to 13x13, plays offline AI replies, persists, and switches standard sizes', async ({page}) => {
    await page.goto('/go.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Go')
    await expect(page.locator('go-game .board')).toHaveAttribute('data-size', '13')
    await expect(page.locator('go-game .spot')).toHaveCount(169)
    await expect(page.locator('go-game .star')).toHaveCount(5)
    await page.locator('offline-shell .guide-btn').click()
    await expect(page.locator('offline-shell .guide-image')).toHaveAttribute('src', './guides/go.svg')
    await expect(page.locator('offline-shell .rule-group')).toHaveCount(4)
    await page.keyboard.press('Escape')

    await page.locator('go-game .field').click()
    await expect(page.locator('go-game .status')).toHaveText('Your turn', {timeout: 6000})
    await expect(page.locator('go-game .stone')).toHaveCount(2)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:go')).history.length)).toBe(2)
    await page.reload()
    await expect(page.locator('go-game .stone')).toHaveCount(2)
    await page.locator('go-game .undo').click()
    await expect(page.locator('go-game .stone')).toHaveCount(0)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:go')).history.length)).toBe(0)

    await page.locator('go-game .size [data-value="9"]').click()
    await expect(page.locator('go-game .board')).toHaveAttribute('data-size', '9')
    await expect(page.locator('go-game .spot')).toHaveCount(81)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:go')).size)).toBe(9)
})

test('Sudoku supports long-press notes, entries, undo, and persistence without hints', async ({page}) => {
    await page.goto('/sudoku.html')
    let editable = page.locator('sudoku-game .cell:not(.given)').first()
    await editable.click()
    await expect(page.locator('sudoku-game .notes-toggle, sudoku-game .hint')).toHaveCount(0)
    await page.locator('sudoku-game .digit[data-digit="3"]').click({delay: 600})
    await expect(editable.locator('.notes')).toContainText('3')
    await expect(editable.locator('.notes')).toHaveCSS('animation-name', 'sudoku-entry')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:sudoku')).history.length)).toBe(1)
    await page.reload()
    editable = page.locator('sudoku-game .cell:not(.given)').first()
    await expect(editable.locator('.notes')).toContainText('3')
    await editable.click()
    await page.locator('sudoku-game .digit[data-digit="4"]').click()
    await expect(editable).toHaveText('4')
    await expect(editable.locator('.entry')).toHaveCSS('animation-name', 'sudoku-entry')
    await expect(page.locator('sudoku-game .undo')).toBeEnabled()
    await page.locator('sudoku-game .undo').click()
    await expect(editable.locator('.notes')).toContainText('3')
    await expect(editable).toHaveClass(/changed/)
})

test('Sudoku handles iPhone-style touches without selecting number-pad text', async ({page}) => {
    await page.goto('/sudoku.html')
    const editable = page.locator('sudoku-game .cell:not(.given)').first()
    const digit = page.locator('sudoku-game .digit:not(:disabled)').first()
    const value = await digit.getAttribute('data-digit')
    await editable.click()

    const longTouch = await digit.evaluate(async button => {
        const start = new Event('touchstart', {bubbles: true, cancelable: true})
        button.dispatchEvent(start)
        await new Promise(resolve => setTimeout(resolve, 550))
        const style = getComputedStyle(button)
        const userSelect = style.userSelect
        const webkitUserSelect = style.webkitUserSelect
        const end = new Event('touchend', {bubbles: true, cancelable: true})
        button.dispatchEvent(end)
        return {
            startPrevented: start.defaultPrevented,
            endPrevented: end.defaultPrevented,
            userSelect,
            webkitUserSelect,
        }
    })

    expect(longTouch).toEqual({
        startPrevented: true,
        endPrevented: true,
        userSelect: 'none',
        webkitUserSelect: 'none',
    })
    await expect(editable.locator('.notes')).toContainText(value)

    const shortTouch = await digit.evaluate(button => {
        const start = new Event('touchstart', {bubbles: true, cancelable: true})
        button.dispatchEvent(start)
        const end = new Event('touchend', {bubbles: true, cancelable: true})
        button.dispatchEvent(end)
        return {startPrevented: start.defaultPrevented, endPrevented: end.defaultPrevented}
    })
    expect(shortTouch).toEqual({startPrevented: true, endPrevented: true})
    await expect(editable).toHaveText(value)
})

test('Sudoku marks only direct row, column, or box conflicts', async ({page}) => {
    await page.goto('/sudoku.html')
    const game = page.locator('sudoku-game')
    const alternate = await game.evaluate(element => {
        Object.assign(element.state, {
            puzzle: Array(81).fill(0),
            board: Array(81).fill(0),
            notes: Array(81).fill(0),
            history: [],
            outcome: null,
        })
        element.selected = 0
        element.render()
        return element.state.solution[0] === 1 ? 2 : 1
    })
    const first = page.locator('sudoku-game .cell[data-index="0"]')
    const second = page.locator('sudoku-game .cell[data-index="1"]')
    const digit = page.locator(`sudoku-game .digit[data-digit="${alternate}"]`)

    await digit.click()
    await expect(first).toHaveText(String(alternate))
    await expect(first).not.toHaveClass(/conflict/)

    await second.click()
    await digit.click()
    await expect(first).toHaveClass(/conflict/)
    await expect(second).toHaveClass(/conflict/)
})

test('2048 merges, scores, persists, reloads, undoes, and accepts a swipe', async ({page}) => {
    await page.goto('/2048.html')
    await expect(page.locator('game-2048 .cell:not([data-value="0"])')).toHaveCount(2)
    await expect(page.locator('game-2048 .direction')).toHaveCount(0)
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
    const cue = await board.evaluate(element => {
        element.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
        return {
            className: element.className,
            merged: getComputedStyle(element.querySelector('.merged')).animationName,
            spawned: getComputedStyle(element.querySelector('.spawn')).animationName,
            background: getComputedStyle(element.querySelector('[data-value="0"]')).animationName,
        }
    })
    expect(cue.className).not.toContain('move-left')
    expect(cue.merged).toBe('merge')
    expect(cue.spawned).toBe('spawn')
    expect(cue.background).toBe('none')
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

test('Junqi holds a fast AI battle reply and cues its destination', async ({page}) => {
    await page.goto('/junqi.html')
    const midpoint = await page.evaluate(async () => {
        const game = document.querySelector('junqi-game')
        game.startBattle()
        let request
        OfflineGames.runtime.createWorker = () => {
            const worker = {
                postMessage(message) {
                    request = message
                    const move = game.engine.legalMoves(game.state.board, game.engine.BLACK)[0]
                    queueMicrotask(() => worker.onmessage({data: {id: message.id, move}}))
                },
                terminate() {},
            }
            return worker
        }
        const move = game.engine.legalMoves(game.state.board, game.engine.RED)[0]
        const started = performance.now()
        game.commit(move, game.engine.RED)
        await new Promise(resolve => setTimeout(resolve, 180))
        const target = game.shadowRoot.querySelector('.square.last-to')
        return {
            started,
            historyLength: game.state.history.length,
            thinking: game.thinking,
            animationName: getComputedStyle(target).animationName,
            currentEnemyKinds: [...new Set(request.board.filter(piece => piece?.side === game.engine.RED).map(piece => piece.type))],
            initialEnemyKinds: [...new Set(request.initialBoard.filter(piece => piece?.side === game.engine.RED).map(piece => piece.type))],
            enemyIds: request.initialBoard.filter(piece => piece?.side === game.engine.RED).map(piece => piece.id),
            eventFields: Object.keys(request.events[0]).sort(),
        }
    })

    expect(midpoint.historyLength).toBe(1)
    expect(midpoint.thinking).toBeTruthy()
    expect(midpoint.animationName).toBe('junqi-target')
    expect(midpoint.currentEnemyKinds).toEqual(['?'])
    expect(midpoint.initialEnemyKinds).toEqual(['?'])
    expect(midpoint.enemyIds).toEqual(Array.from({length:25},(_,index)=>`e${index}`))
    expect(midpoint.eventFields).toEqual(['attacker', 'defender', 'move', 'result', 'revealed', 'side'])

    await expect.poll(() => page.evaluate(() => document.querySelector('junqi-game').state.history.length)).toBe(2)
    expect(await page.evaluate(started => performance.now() - started, midpoint.started)).toBeGreaterThanOrEqual(320)
    await expect(page.locator('junqi-game .status')).not.toHaveClass(/thinking/)
    await expect(page.locator('junqi-game .square.last-to')).toHaveAttribute('aria-label', /last move/)
})

test('Junqi reports relative battle strength without revealing the surviving rank', async ({page}) => {
    await page.goto('/junqi.html')
    const battle = await page.locator('junqi-game').evaluate(game => {
        const engine = game.engine
        const board = Array(engine.ROWS * engine.COLS).fill(null)
        const from = engine.at(5,2), to = engine.at(6,2)
        board[from] = {id:'b9', side:engine.BLACK, type:'9'}
        board[to] = {id:'r2', side:engine.RED, type:'2'}
        board[engine.at(0,1)] = {id:'bf', side:engine.BLACK, type:engine.FLAG}
        board[engine.at(10,0)] = {id:'r3', side:engine.RED, type:'3'}
        board[engine.at(11,1)] = {id:'rf', side:engine.RED, type:engine.FLAG}
        Object.assign(game.state, {
            phase:'playing', board, turn:engine.BLACK, revealed:[], history:[],
            lastMove:null, message:null, outcome:null,
        })
        game.commit({from,to}, engine.BLACK)
        return {to, survivor:'b9'}
    })

    await expect(page.locator('junqi-game .status'))
        .toHaveText('The attacking piece was stronger — your turn')
    const survivor = page.locator(`junqi-game .square[data-index="${battle.to}"]`)
    await expect(survivor.locator('.piece.hidden')).toHaveText('◆')
    await expect(survivor).toHaveAttribute('aria-label', /hidden enemy piece/)
    expect(await page.locator('junqi-game').evaluate(game => game.state.revealed)).toEqual([])

    await page.locator('junqi-game').evaluate((game, id) => {
        game.state.revealed = [id]
        game.save()
    }, battle.survivor)
    await page.reload()
    await expect(survivor.locator('.piece.hidden')).toHaveText('◆')
    expect(await page.locator('junqi-game').evaluate(game => game.state.revealed)).toEqual([])
})

test('Dou Shou Qi starts correctly and bounds its hard AI turn', async ({page}) => {
    await page.goto('/doushouqi.html')
    const game = page.locator('doushouqi-game')
    await expect(game.locator('.status')).toHaveText('Your turn')
    const setup = await game.evaluate(element => {
        const {engine, state} = element
        return {
            red: [engine.rankOf(state.board[engine.at(6, 2)]), engine.rankOf(state.board[engine.at(6, 4)])],
            black: [engine.rankOf(state.board[engine.at(2, 2)]), engine.rankOf(state.board[engine.at(2, 4)])],
            keys: state.keys.length,
            firstKey: state.keys[0] === engine.positionKey(state.board, state.turn),
        }
    })
    expect(setup).toEqual({red: [4, 5], black: [5, 4], keys: 1, firstKey: true})

    await game.locator('.difficulty').selectOption('hard')
    const move = await game.evaluate(element => element.legal[0])
    const started = Date.now()
    await game.locator(`.cell[data-index="${move.from}"]`).click()
    await game.locator(`.cell[data-index="${move.to}"]`).click()
    await expect(game.locator('.status')).toHaveText('Your turn', {timeout: 6000})
    expect(Date.now() - started).toBeLessThan(6000)
    expect(await game.evaluate(element => ({
        history: element.state.history.length,
        keys: element.state.keys.length,
    }))).toEqual({history: 2, keys: 3})

    await game.locator('.undo').click()
    expect(await game.evaluate(element => ({
        history: element.state.history.length,
        keys: element.state.keys.length,
    }))).toEqual({history: 0, keys: 1})
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

test('Chess holds a fast AI reply and settles the arriving piece',async({page})=>{
    await page.goto('/chess.html')
    const midpoint=await page.evaluate(async()=>{
        const game=document.querySelector('chess-game')
        OfflineGames.runtime.createWorker=()=>{
            const worker={
                postMessage(message){
                    const move=game.engine.legalMoves(game.position(),game.engine.BLACK)[0]
                    queueMicrotask(()=>worker.onmessage({data:{id:message.id,move}}))
                },
                terminate(){},
            }
            return worker
        }
        game.tap(52)
        const started=performance.now()
        game.tap(36)
        await new Promise(resolve=>setTimeout(resolve,180))
        const piece=game.shadowRoot.querySelector('.square.last-to .piece')
        return{started,historyLength:game.state.history.length,thinking:game.thinking,animationName:getComputedStyle(piece).animationName}
    })

    expect(midpoint.historyLength).toBe(1)
    expect(midpoint.thinking).toBeTruthy()
    expect(midpoint.animationName).toBe('chess-land')

    await expect.poll(()=>page.evaluate(()=>document.querySelector('chess-game').state.history.length)).toBe(2)
    expect(await page.evaluate(started=>performance.now()-started,midpoint.started)).toBeGreaterThanOrEqual(320)
    await expect(page.locator('chess-game .status')).toHaveText('Your turn')
    await expect(page.locator('chess-game .square.last-to')).toHaveAttribute('aria-label',/last move/)
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

test('Reversi lets flips finish before applying a fast AI reply', async ({page}) => {
    await page.goto('/reversi.html')
    const midpoint = await page.evaluate(async () => {
        const game = document.querySelector('reversi-game')
        OfflineGames.runtime.createWorker = () => {
            const worker = {
                postMessage(message) {
                    const move = game.engine.legalMoves(game.state.board, game.engine.WHITE)[0].index
                    queueMicrotask(() => worker.onmessage({data: {id: message.id, move}}))
                },
                terminate() {},
            }
            return worker
        }
        const started = performance.now()
        game.tap(19)
        await new Promise(resolve => setTimeout(resolve, 300))
        const placed = game.shadowRoot.querySelector('.cell.last .disc')
        const flipped = game.shadowRoot.querySelector('.cell.flipped .disc')
        return {
            started,
            historyLength: game.state.history.length,
            thinking: game.thinking,
            placedAnimation: getComputedStyle(placed).animationName,
            flippedAnimation: getComputedStyle(flipped).animationName,
        }
    })

    expect(midpoint.historyLength).toBe(1)
    expect(midpoint.thinking).toBeTruthy()
    expect(midpoint.placedAnimation).toBe('reversi-place')
    expect(midpoint.flippedAnimation).toBe('flip')

    await expect.poll(() => page.evaluate(() => document.querySelector('reversi-game').state.history.length)).toBe(2)
    expect(await page.evaluate(started => performance.now() - started, midpoint.started)).toBeGreaterThanOrEqual(380)
    await expect(page.locator('reversi-game .status')).toHaveText('Your turn')
    await expect(page.locator('reversi-game .cell.last .disc.white')).toHaveCount(1)
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

test('English Draughts lets a landing finish before a fast AI reply', async ({page}) => {
    await page.goto('/checkers.html')
    const midpoint = await page.evaluate(async () => {
        const game = document.querySelector('checkers-game')
        OfflineGames.runtime.createWorker = () => {
            const worker = {
                postMessage(message) {
                    const move = game.engine.legalMoves(game.state.board, game.engine.RED)[0]
                    queueMicrotask(() => worker.onmessage({data: {id: message.id, move}}))
                },
                terminate() {},
            }
            return worker
        }
        const move = game.engine.legalMoves(game.state.board, game.engine.BLACK)[0]
        const started = performance.now()
        game.commit(move, game.engine.BLACK)
        await new Promise(resolve => setTimeout(resolve, 180))
        const piece = game.shadowRoot.querySelector('.square.last-to .piece')
        return {
            started,
            historyLength: game.state.history.length,
            thinking: game.thinking,
            animationName: getComputedStyle(piece).animationName,
        }
    })

    expect(midpoint.historyLength).toBe(1)
    expect(midpoint.thinking).toBeTruthy()
    expect(midpoint.animationName).toBe('land')

    await expect.poll(() => page.evaluate(() => document.querySelector('checkers-game').state.history.length)).toBe(2)
    expect(await page.evaluate(started => performance.now() - started, midpoint.started)).toBeGreaterThanOrEqual(320)
    await expect(page.locator('checkers-game .status')).toHaveText('Your turn')
    await expect(page.locator('checkers-game .square.last-to .piece.red')).toHaveCount(1)
})

test('Backgammon plays a fixed opening, persists the AI reply, and undoes the turn pair', async ({page}) => {
    await page.goto('/backgammon.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Backgammon')
    await expect(page.locator('backgammon-game .point')).toHaveCount(24)

    await page.locator('offline-shell .guide-btn').click()
    const guide = page.locator('offline-shell offline-guide dialog')
    await expect(guide.locator('.rule-group')).toHaveCount(3)
    await expect(guide.locator('.guide-image')).toHaveAttribute('src', './guides/backgammon.svg')
    await expect(guide.locator('figcaption')).toContainText('Light checkers travel')
    expect(await guide.locator('.guide-image').evaluate(image => image.complete && image.naturalWidth > 0)).toBeTruthy()
    await page.keyboard.press('Escape')

    await page.locator('backgammon-game').evaluate(game => {
        game.cancelAI()
        game.clearTimers()
        game.state = {
            ...game.fresh('easy'),
            seed: 7,
            rng: 1,
            position: game.engine.initialPosition(),
            turn: game.engine.HUMAN,
            phase: 'move',
            dice: [3, 1],
            opening: true,
            openingRolls: 1,
            ply: 0,
            history: [],
            lastTurn: null,
            progress: false,
        }
        game.clearSelection()
        game.notice = null
        game.save()
        game.render()
    })
    await expect(page.locator('backgammon-game .status')).toHaveText('Opening roll 3–1 · you move first')
    for (const location of [5, 2, 2, 1]) {
        await page.locator(`backgammon-game .point[data-location="${location}"]`).click()
    }
    await expect(page.locator('backgammon-game .status')).toHaveText('Roll the dice or offer the cube', {timeout: 8000})

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:backgammon')))
    expect(saved.history.map(entry => entry.actor)).toEqual(['human', 'computer'])
    expect(saved.ply).toBe(2)
    expect(saved.lastTurn.side).toBe(1)

    await page.reload()
    await expect(page.locator('backgammon-game .status')).toHaveText('Roll the dice or offer the cube')
    expect(await page.locator('backgammon-game').evaluate(game => game.state.position)).toEqual(saved.position)
    await page.locator('backgammon-game .undo').click()
    await expect(page.locator('backgammon-game .status')).toHaveText('Opening roll 3–1 · you move first')
    await expect(page.locator('backgammon-game .point[data-location="5"] .checker.human')).toHaveCount(5)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:backgammon')).history.length)).toBe(0)
})

test('Backgammon shows a fast AI turn one checker step at a time', async ({page}) => {
    await page.goto('/backgammon.html')
    const playback = await page.evaluate(async () => {
        const game = document.querySelector('backgammon-game')
        game.cancelAI()
        game.clearTimers()
        game.state = {
            ...game.fresh('easy'),
            seed: 7,
            rng: 1,
            position: game.engine.initialPosition(),
            turn: game.engine.AI,
            phase: 'move',
            dice: [3, 1],
            opening: false,
            ply: 0,
            history: [],
            lastTurn: null,
            progress: false,
        }
        game.clearSelection()
        game.notice = null
        game.render()
        OfflineGames.runtime.createWorker = () => {
            const worker = {
                postMessage(message) {
                    const turn = game.engine.legalTurns(game.state.position, game.engine.AI, game.state.dice)[0]
                    queueMicrotask(() => worker.onmessage({data: {id: message.id, turn}}))
                },
                terminate() {},
            }
            return worker
        }
        const waitFor = predicate => new Promise((resolve, reject) => {
            const deadline = performance.now() + 3000
            const check = () => {
                if (predicate()) resolve()
                else if (performance.now() >= deadline) reject(new Error('timed out waiting for AI playback'))
                else setTimeout(check, 10)
            }
            check()
        })
        const started = performance.now()
        game.scheduleAI()
        await new Promise(resolve => setTimeout(resolve, 160))
        const before = {ply: game.state.ply, steps: game.aiPath.length, thinking: game.shadowRoot.querySelector('.status').classList.contains('thinking')}
        await waitFor(() => game.aiPath.length === 1)
        const firstAt = performance.now()
        const firstAnimation = getComputedStyle(game.shadowRoot.querySelector('.target.arrival .stack, .target.arrival .off-stack')).animationName
        await waitFor(() => game.aiPath.length === 2)
        const secondAt = performance.now()
        await waitFor(() => game.state.ply === 1)
        return {
            before,
            firstDelay: firstAt - started,
            stepDelay: secondAt - firstAt,
            firstAnimation,
            actors: game.state.history.map(entry => entry.actor),
            lastSteps: game.state.lastTurn.steps.length,
            remainingPreview: game.aiPath.length,
        }
    })

    expect(playback.before).toEqual({ply: 0, steps: 0, thinking: true})
    expect(playback.firstDelay).toBeGreaterThanOrEqual(450)
    expect(playback.stepDelay).toBeGreaterThanOrEqual(160)
    expect(playback.firstAnimation).toBe('backgammon-arrive')
    expect(playback.actors).toEqual(['computer'])
    expect(playback.lastSteps).toBe(2)
    expect(playback.remainingPreview).toBe(0)
})

test('Backgammon accepts the doubling cube and disables it for the Crawford game', async ({page}) => {
    await page.goto('/backgammon.html')
    await page.locator('backgammon-game').evaluate(game => {
        game.cancelAI()
        game.clearTimers()
        const position = {board: Array(24).fill(0), bar: [0, 0], off: [0, 10]}
        position.board[18] = 15
        position.board[20] = -5
        game.state = {
            ...game.fresh('easy'),
            seed: 11,
            rng: 1,
            position,
            turn: game.engine.AI,
            phase: 'roll',
            dice: null,
            opening: false,
            ply: 2,
            history: [],
            progress: true,
        }
        game.clearSelection()
        game.notice = null
        game.save()
        game.render()
        game.resume()
    })
    await expect(page.locator('backgammon-game .status')).toHaveText('Opponent offers the cube at 2')
    await expect(page.locator('backgammon-game .take')).toBeVisible()
    await expect(page.locator('backgammon-game .pass-cube')).toBeVisible()
    await page.locator('backgammon-game .take').click()
    await expect(page.locator('backgammon-game .cube')).toHaveText('2')
    await expect(page.locator('backgammon-game .cube')).toHaveClass(/owner-human/)
    await expect.poll(() => page.locator('backgammon-game').evaluate(game => game.state.cubeOwner)).toBe(0)

    await page.locator('backgammon-game').evaluate(game => {
        game.cancelAI()
        game.clearTimers()
        Object.assign(game.state, {
            score: [4, 0],
            gameNumber: 3,
            crawford: false,
            crawfordPlayed: false,
            turn: game.engine.HUMAN,
            phase: 'game-over',
            dice: null,
            cube: 1,
            cubeOwner: null,
            offeredBy: null,
            opening: false,
            rng: 1,
            history: [],
            roundOutcome: {winner: game.engine.HUMAN, kind: 'regular', multiplier: 1, points: 1, dropped: false, cube: 1},
            outcome: null,
        })
        game.clearSelection()
        game.notice = null
        game.save()
        game.render()
    })
    await page.locator('backgammon-game .next-game').click()
    await expect(page.locator('backgammon-game .match-center .crawford')).toBeVisible()
    await expect(page.locator('backgammon-game .game-number')).toHaveText('Game 4')
    await expect(page.locator('backgammon-game .match-note')).toHaveText('The doubling cube is out of play for this Crawford game.')
    await expect(page.locator('backgammon-game .cube')).toHaveClass(/crawford/)

    await page.locator('backgammon-game').evaluate(game => {
        game.state.turn = game.engine.HUMAN
        game.state.phase = 'roll'
        game.state.dice = null
        game.state.opening = false
        game.clearSelection()
        game.render()
    })
    await expect(page.locator('backgammon-game .roll')).toBeVisible()
    await expect(page.locator('backgammon-game .double')).toBeHidden()
    expect(await page.locator('backgammon-game').evaluate(game => game.canDouble(game.engine.HUMAN))).toBe(false)
})

test('Huarong Dao hints and animates an optimal slide, persists, reloads, and undoes', async ({page}) => {
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
    const motion = await page.locator('huarong-game .target.hinted').evaluate(target => {
        const root = target.getRootNode()
        const piece = root.querySelector('.piece.hinted')
        const pieceIndex = piece.dataset.piece
        piece.getBoundingClientRect()
        target.click()
        const moved = root.querySelector(`.piece[data-piece="${pieceIndex}"]`)
        moved.getBoundingClientRect()
        const transition = moved.getAnimations().find(animation => ['left', 'top'].includes(animation.transitionProperty))
        return {sameElement: moved === piece, duration: transition?.effect.getTiming().duration}
    })
    expect(motion).toEqual({sameElement: true, duration: 200})
    await expect(page.locator('huarong-game .move-count')).toHaveText('1')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:huarong')).history.length)).toBe(1)
    await page.reload()
    await expect(page.locator('huarong-game .undo')).toBeEnabled()
    await page.locator('huarong-game .undo').click()
    await expect(page.locator('huarong-game .move-count')).toHaveText('0')
    await page.emulateMedia({reducedMotion: 'reduce'})
    await expect(page.locator('huarong-game .piece').first()).toHaveCSS('transition-duration', '0s')

    await page.locator('huarong-game').evaluate(game => {
        game.state.positions = [8, 18, 0, 1, 2, 3, 10, 11, 14, 17]
        game.state.history = []
        game.state.outcome = null
        game.selected = null
        game.render()
    })
    await page.locator('huarong-game .piece[data-piece="8"]').click()
    await expect(page.locator('huarong-game .target[data-to="16"]')).toHaveCount(0)
})

test('Sliding Puzzle changes size, slides with touch and keyboard, persists, and undoes', async ({page}) => {
    await page.goto('/sliding.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Sliding Puzzle')
    await expect(page.locator('sliding-puzzle .board')).toHaveAttribute('data-size', '4')
    await expect(page.locator('sliding-puzzle .tile')).toHaveCount(15)
    await expect(page.locator('sliding-puzzle .timer')).toHaveText('00:00')
    await page.locator('offline-shell .guide-btn').click()
    await expect(page.locator('offline-shell .guide-image')).toHaveAttribute('src', './guides/sliding.svg')
    await expect(page.locator('offline-shell .rule-group')).toHaveCount(3)
    await expect(page.locator('offline-shell .rule-group').first()).toContainText('called the 15 Puzzle')
    await page.keyboard.press('Escape')

    await page.locator('sliding-puzzle').evaluate(game => {
        game.pauseTimer(false)
        Object.assign(game.state, {
            size: 4,
            seed: 7,
            board: [1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,0,15],
            history: [],
            elapsedMs: 65000,
            progress: false,
            outcome: null,
        })
        game.notice = null
        game.rebuildBoard = true
        game.save()
        game.render()
    })
    await expect(page.locator('sliding-puzzle .slot')).toHaveCount(16)
    const tileColors = await page.locator('sliding-puzzle .tile').evaluateAll(tiles => ({
        backgrounds: new Set(tiles.map(tile => getComputedStyle(tile).backgroundColor)).size,
        borders: new Set(tiles.map(tile => getComputedStyle(tile).borderTopColor)).size,
    }))
    expect(tileColors).toEqual({backgrounds: 1, borders: 1})
    const motion = await page.locator('sliding-puzzle .tile[data-value="15"]').evaluate(tile => {
        const root = tile.getRootNode()
        const slots = [...root.querySelectorAll('.slot')]
        const before = slots.map(slot => {
            const rect = slot.getBoundingClientRect()
            return [rect.x, rect.y, rect.width, rect.height]
        })
        tile.getBoundingClientRect()
        tile.click()
        const transition = tile.getAnimations().find(animation =>
            ['left', 'top'].includes(animation.transitionProperty))
        const after = slots.map(slot => {
            const rect = slot.getBoundingClientRect()
            return [rect.x, rect.y, rect.width, rect.height]
        })
        return {
            duration: transition?.effect.getTiming().duration,
            fixedBackground: JSON.stringify(before) === JSON.stringify(after),
            emptyIndex: root.querySelector('.slot[aria-hidden="false"]')?.dataset.index,
            emptyIsBackground: (() => {
                const style = getComputedStyle(slots[0])
                return style.backgroundColor === 'rgba(0, 0, 0, 0)'
                    && style.borderStyle === 'none' && style.boxShadow === 'none'
            })(),
            backgroundAnimations: slots.flatMap(slot => slot.getAnimations()).length,
            animatedTiles: [...root.querySelectorAll('.tile')]
                .filter(element => element.getAnimations().some(animation =>
                    ['left', 'top'].includes(animation.transitionProperty)))
                .map(element => element.dataset.value),
        }
    })
    expect(motion).toEqual({
        duration: 180,
        fixedBackground: true,
        emptyIndex: '15',
        emptyIsBackground: true,
        backgroundAnimations: 0,
        animatedTiles: ['15'],
    })
    await expect(page.locator('sliding-puzzle .move-count')).toHaveText('1')
    await expect(page.locator('sliding-puzzle .status')).toHaveText('Puzzle solved in 1 move · 01:05')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:sliding')).outcome)).toBe('solved')

    await page.reload()
    await expect(page.locator('sliding-puzzle .status')).toContainText('Puzzle solved')
    await page.locator('sliding-puzzle .undo').click()
    await expect(page.locator('sliding-puzzle .move-count')).toHaveText('0')
    await expect(page.locator('sliding-puzzle .status')).toHaveText('Slide the numbered tiles into order')

    page.once('dialog', dialog => dialog.accept())
    await page.locator('sliding-puzzle .size [data-value="3"]').click()
    await expect(page.locator('sliding-puzzle .board')).toHaveAttribute('data-size', '3')
    await expect(page.locator('sliding-puzzle .tile')).toHaveCount(8)
    await page.locator('sliding-puzzle').evaluate(game => {
        game.pauseTimer(false)
        Object.assign(game.state, {
            board: [1,2,3, 4,5,6, 7,0,8],
            history: [],
            elapsedMs: 0,
            progress: false,
            outcome: null,
        })
        game.rebuildBoard = true
        game.save()
        game.render()
    })
    await page.locator('sliding-puzzle .board').press('ArrowRight')
    await expect(page.locator('sliding-puzzle .status')).toContainText('Puzzle solved')

    await page.locator('sliding-puzzle .size [data-value="5"]').click()
    await expect(page.locator('sliding-puzzle .tile')).toHaveCount(24)
    await page.locator('sliding-puzzle').evaluate(game => {
        game.pauseTimer(false)
        Object.assign(game.state, {
            board: [
                1,2,3,4,5, 6,7,8,9,10, 11,12,13,14,15,
                16,17,18,19,20, 21,22,23,0,24,
            ],
            history: [],
            elapsedMs: 0,
            progress: false,
            outcome: null,
        })
        game.rebuildBoard = true
        game.save()
        game.render()
    })
    const tile24 = page.locator('sliding-puzzle .tile[data-value="24"]')
    const box = await tile24.boundingBox()
    await tile24.dispatchEvent('pointerdown', {
        pointerId: 17, pointerType: 'touch', button: 0,
        clientX: box.x + box.width / 2, clientY: box.y + box.height / 2,
    })
    await tile24.dispatchEvent('pointerup', {
        pointerId: 17, pointerType: 'touch', button: 0,
        clientX: box.x + box.width / 2 - 30, clientY: box.y + box.height / 2,
    })
    await expect(page.locator('sliding-puzzle .status')).toContainText('Puzzle solved')
    await expect(page.locator('sliding-puzzle .board')).toHaveAttribute('data-size', '5')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:sliding')).size)).toBe(5)

    await page.emulateMedia({reducedMotion: 'reduce'})
    await expect(page.locator('sliding-puzzle .tile').first()).toHaveCSS('transition-duration', '0s')
})

test('Nonogram toggles marks, completes clues promptly, supports sizes, and persists', async ({page}) => {
    await page.goto('/nonogram.html')
    const game = page.locator('nonogram-game')
    await page.evaluate(() =>
        document.documentElement.style.setProperty('--safe-top', '59px'))
    const header = page.locator('offline-shell header')
    await expect(header).toHaveCSS('box-sizing', 'border-box')
    await expect(header).toHaveCSS('min-height', '99px')
    const headerHeight = await header.evaluate(element =>
        element.getBoundingClientRect().height)
    expect(headerHeight).toBeGreaterThanOrEqual(99)
    expect(headerHeight).toBeLessThanOrEqual(100)
    await expect(game.locator('.board-wrap')).toHaveAttribute('data-size', '10')
    await expect(game.locator('.cell')).toHaveCount(100)
    await expect(game.locator('.timer')).toHaveText('00:00')
    await expect(page.locator('offline-shell .guide-image')).toHaveAttribute('src', './guides/nonogram.svg')

    const first = game.locator('.cell[data-index="0"]')
    const second = game.locator('.cell[data-index="1"]')
    const firstBox = await first.boundingBox()
    const secondBox = await second.boundingBox()
    await first.dispatchEvent('pointerdown', {
        pointerId: 17, pointerType: 'touch', button: 0,
        clientX: firstBox.x + firstBox.width / 2,
        clientY: firstBox.y + firstBox.height / 2,
    })
    await game.locator('.board').dispatchEvent('pointermove', {
        pointerId: 17, pointerType: 'touch', button: 0,
        clientX: secondBox.x + secondBox.width / 2,
        clientY: secondBox.y + secondBox.height / 2,
    })
    await game.locator('.board').dispatchEvent('pointerup', {
        pointerId: 17, pointerType: 'touch', button: 0,
        clientX: secondBox.x + secondBox.width / 2,
        clientY: secondBox.y + secondBox.height / 2,
    })
    await expect(first).not.toHaveClass(/filled/)
    await expect(second).not.toHaveClass(/filled/)
    await expect(game.locator('.board')).toHaveCSS('touch-action', 'manipulation')

    await first.click()
    await expect(first).toHaveClass(/filled/)
    expect(await page.evaluate(() =>
        JSON.parse(localStorage.getItem('offline-games:v1:nonogram')).history.length)).toBe(1)
    await first.click()
    await expect(first).not.toHaveClass(/filled/)

    await game.locator('.mode [data-value="2"]').click()
    await first.click()
    await expect(first).toHaveClass(/crossed/)
    await expect(game.locator('.undo')).toHaveCount(0)
    await first.click()
    await expect(first).not.toHaveClass(/crossed/)

    await game.locator('.mode [data-value="1"]').click()
    const promptRow = await game.evaluate(element => {
        const size = element.puzzle.size
        const row = Array.from({length: size}, (_, index) => index).find(index => {
            const values = element.puzzle.solution.slice(index * size, (index + 1) * size)
            return values.some(Boolean) && values.some(value => !value)
        })
        element.pauseTimer(false)
        element.state.cells = Array(size * size).fill(element.engine.MARKS.empty)
        element.state.history = []
        element.state.elapsedMs = 0
        element.state.outcome = null
        element.save()
        element.render()
        return {
            row,
            filled: element.puzzle.solution
                .map((value, index) => value && Math.floor(index / size) === row ? index : -1)
                .filter(index => index >= 0),
        }
    })
    for (const index of promptRow.filled) {
        await game.locator(`.cell[data-index="${index}"]`).click()
    }
    await expect(game.locator(`.row-clues .clue[data-index="${promptRow.row}"]`))
        .toHaveClass(/complete/)
    await expect(game.locator('.cell.crossed')).toHaveCount(0)

    const finalIndex = await game.evaluate(element => {
        const target = element.puzzle.solution.findLastIndex(Boolean)
        element.pauseTimer(false)
        element.state.cells = element.puzzle.solution.map((filled, index) =>
            filled && index !== target ? element.engine.MARKS.filled : element.engine.MARKS.empty)
        element.state.history = []
        element.state.elapsedMs = 65000
        element.state.outcome = null
        element.save()
        element.render()
        return target
    })
    await game.locator(`.cell[data-index="${finalIndex}"]`).click()
    await expect(game.locator('.status')).toHaveText('Picture complete in 1 mark · 01:05')
    await expect(game.locator('.clue.complete')).toHaveCount(20)
    expect(await page.evaluate(() =>
        JSON.parse(localStorage.getItem('offline-games:v1:nonogram')).outcome)).toBe('won')

    await page.reload()
    await expect(game.locator('.status')).toContainText('Picture complete')
    await game.locator('.difficulty [data-value="easy"]').click()
    await expect(game.locator('.board-wrap')).toHaveAttribute('data-size', '5')
    await expect(game.locator('.cell')).toHaveCount(25)
    await game.locator('.difficulty [data-value="hard"]').click()
    await expect(game.locator('.board-wrap')).toHaveAttribute('data-size', '15')
    await expect(game.locator('.cell')).toHaveCount(225)

    await page.emulateMedia({reducedMotion: 'reduce'})
    await expect(game.locator('.cell').first()).toHaveCSS('transition-duration', '0s')
})

test('Minesweeper animates confirmed reveals, keeps flags reversible, persists, and has no undo', async ({page}) => {
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
    const revealMotion = await page.locator('minesweeper-game .cell.just-revealed').evaluateAll(cells => ({
        count: cells.length,
        names: [...new Set(cells.map(cell => getComputedStyle(cell).animationName))],
        delays: [...new Set(cells.map(cell => getComputedStyle(cell).animationDelay))],
    }))
    expect(revealMotion.count).toBeGreaterThanOrEqual(9)
    expect(revealMotion.names).toEqual(['minesweeper-reveal'])
    expect(revealMotion.delays.length).toBeGreaterThan(1)
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
    await expect(covered).toHaveCSS('animation-name', 'minesweeper-flag')
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

    await page.emulateMedia({reducedMotion: 'reduce'})
    await page.locator('minesweeper-game .flag').click()
    await expect(covered).toHaveCSS('animation-name', 'none')
    await page.locator('minesweeper-game .flag').click()

    await page.reload()
    expect(await page.locator('minesweeper-game .cell.revealed').count()).toBeGreaterThanOrEqual(9)
    await page.locator('offline-shell .guide-btn').click()
    await expect(page.locator('offline-shell .guide-image')).toHaveAttribute('src', './guides/minesweeper.svg')
    await expect(page.locator('offline-shell .rule-group')).toHaveCount(3)
    await page.goto('/index.html')
    await expect(page.locator('.game-gallery article[data-game="minesweeper"] a')).toHaveText('Continue')
})

test('Solitaire animates draws and tableau moves, persists, reloads, and undoes', async ({page}) => {
    await page.goto('/solitaire.html')
    await expect(page.locator('solitaire-game .pile')).toHaveCount(7)
    await expect(page.locator('solitaire-game [data-action="draw"] .stock-count')).toHaveText('24')
    await expect(page.locator('solitaire-game .timer')).toHaveText('00:00')

    await page.locator('solitaire-game [data-action="draw"]').click()
    await expect(page.locator('solitaire-game .top .card.face[data-kind="waste"]')).toHaveCount(1)
    await expect(page.locator('solitaire-game .top .card.dealt')).toHaveCSS('animation-name', 'solitaire-deal')
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
    await expect(page.locator(`solitaire-game .pile[data-column="${move.to}"] .card.moved`)).toHaveCSS('animation-name', 'solitaire-land')
    await expect(page.locator(`solitaire-game .pile[data-column="${move.from}"] .card.turned`)).toHaveCSS('animation-name', 'solitaire-turn')
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
    await expect(page.locator('solitaire-game .card[data-value="51"]')).toHaveCSS('animation-name', 'solitaire-land')
    await expect(page.locator('solitaire-game .celebration')).toBeVisible()
    await page.emulateMedia({reducedMotion: 'reduce'})
    await expect(page.locator('solitaire-game .card[data-value="51"]')).toHaveCSS('animation-name', 'none')
    await expect(page.locator('solitaire-game .celebration')).toBeHidden()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:solitaire')).outcome)).toBe('won')
})

test('Spider animates deals and moves, blocks empty-column deals, and completes the final run', async ({page}) => {
    await page.goto('/spider.html')
    await expect(page.locator('spider-game .pile')).toHaveCount(10)
    await expect(page.locator('spider-game .tableau .card.back')).toHaveCount(44)
    await expect(page.locator('spider-game .stock-count')).toHaveText('5')
    await expect(page.locator('spider-game .runs')).toHaveText('0/8')
    await expect(page.locator('spider-game .timer')).toHaveText('00:00')

    await page.locator('spider-game .stock').click()
    await expect(page.locator('spider-game .stock-count')).toHaveText('4')
    await expect(page.locator('spider-game .moves')).toHaveText('1')
    const dealMotion = await page.locator('spider-game .card.dealt').evaluateAll(cards => ({
        count: cards.length,
        names: [...new Set(cards.map(card => getComputedStyle(card).animationName))],
        delays: [...new Set(cards.map(card => getComputedStyle(card).animationDelay))],
    }))
    expect(dealMotion).toEqual({
        count: 10,
        names: ['spider-deal'],
        delays: ['0s', '0.012s', '0.024s', '0.036s', '0.048s', '0.06s', '0.072s', '0.084s', '0.096s', '0.108s'],
    })
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:spider')).history.length)).toBe(1)
    await page.reload()
    await expect(page.locator('spider-game .stock-count')).toHaveText('4')
    await page.locator('spider-game .undo').click()
    await expect(page.locator('spider-game .stock-count')).toHaveText('5')

    const move = await page.locator('spider-game').evaluate(game => {
        for (let seed = 0; seed < 500; seed++) {
            const deal = OfflineGames.Spider.newGame(seed, 1)
            for (let from = 0; from < 10; from++) {
                const card = deal.tableau[from].visible[0]
                for (let to = 0; to < 10; to++) {
                    if (from === to) continue
                    const top = deal.tableau[to].visible.at(-1)
                    if (OfflineGames.Spider.rank(card) + 1 !== OfflineGames.Spider.rank(top)) continue
                    Object.assign(game.state, {
                        suitCount: 1, deal, moves: 0, elapsedMs: 0,
                        history: [], progress: false, outcome: null,
                    })
                    game.render()
                    return {from, to}
                }
            }
        }
        throw new Error('No deterministic Spider move found')
    })
    await page.locator(`spider-game .card[data-column="${move.from}"][data-card="0"]`).click()
    await page.locator(`spider-game .pile[data-column="${move.to}"]`).click({position: {x: 2, y: 300}})
    await expect(page.locator(`spider-game .pile[data-column="${move.to}"] .card.moved`)).toHaveCSS('animation-name', 'spider-land')
    await expect(page.locator(`spider-game .pile[data-column="${move.from}"] .card.turned`)).toHaveCSS('animation-name', 'spider-turn')

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
    await expect(page.locator('spider-game .run-slot.collected')).toHaveCSS('animation-name', 'spider-collect')
    await expect(page.locator('spider-game .celebration')).toBeVisible()
    await page.emulateMedia({reducedMotion: 'reduce'})
    await expect(page.locator('spider-game .run-slot.collected')).toHaveCSS('animation-name', 'none')
    await expect(page.locator('spider-game .celebration')).toBeHidden()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offline-games:v1:spider')).outcome)).toBe('won')
})

for (const viewport of [
    {width: 320, height: 480},
    {width: 390, height: 844},
    {width: 844, height: 390},
    {width: 1024, height: 768},
]) {
    test(`game pages stay within a ${viewport.width}x${viewport.height} viewport`, async ({page}) => {
        await page.setViewportSize(viewport)
        for (const file of gamePageFiles) {
            const url = '/' + file
            await page.goto(url)
            await page.waitForFunction(() =>
                document.querySelector('offline-shell')?._fitSurface?.dataset.fitScale !== undefined
            )
            await page.evaluate(() => new Promise(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
            ))
            const layout = await page.evaluate(() => {
                const shell = document.querySelector('offline-shell')
                const main = shell.shadowRoot.querySelector('main')
                const footer = shell.shadowRoot.querySelector('footer')
                const game = shell.firstElementChild
                const surface = shell._fitSurface
                const mainRect = main.getBoundingClientRect()
                const mainStyle = getComputedStyle(main)
                const padding = {
                    top: parseFloat(mainStyle.paddingTop) || 0,
                    right: parseFloat(mainStyle.paddingRight) || 0,
                    bottom: parseFloat(mainStyle.paddingBottom) || 0,
                    left: parseFloat(mainStyle.paddingLeft) || 0,
                }
                const children = [...game.shadowRoot.children].filter(element =>
                    element instanceof HTMLElement &&
                    element.tagName !== 'STYLE' &&
                    getComputedStyle(element).display !== 'none'
                ).map(element => element.getBoundingClientRect())
                const surfaceRect = surface.getBoundingClientRect()
                return {
                    innerWidth,
                    innerHeight,
                    scrollWidth: document.documentElement.scrollWidth,
                    scrollHeight: document.documentElement.scrollHeight,
                    footerDisplay: getComputedStyle(footer).display,
                    scale: Number(surface.dataset.fitScale),
                    usable: {
                        top: mainRect.top + padding.top,
                        right: mainRect.right - padding.right,
                        bottom: mainRect.bottom - padding.bottom,
                        left: mainRect.left + padding.left,
                    },
                    content: {
                        top: Math.min(...children.map(rect => rect.top)),
                        right: Math.max(...children.map(rect => rect.right)),
                        bottom: Math.max(...children.map(rect => rect.bottom)),
                        left: Math.min(...children.map(rect => rect.left)),
                    },
                    surface: {
                        right: surfaceRect.right,
                        left: surfaceRect.left,
                    },
                }
            })

            expect(layout.scrollWidth, url).toBeLessThanOrEqual(layout.innerWidth)
            expect(layout.scrollHeight, url).toBe(layout.innerHeight)
            expect(layout.footerDisplay, url).toBe('none')
            expect(layout.scale, url).toBeGreaterThan(0)
            expect(layout.scale, url).toBeLessThanOrEqual(1)
            expect(layout.content.top, url).toBeGreaterThanOrEqual(layout.usable.top - 1)
            expect(layout.content.right, url).toBeLessThanOrEqual(layout.usable.right + 1)
            expect(layout.content.bottom, url).toBeLessThanOrEqual(layout.usable.bottom + 1)
            expect(layout.content.left, url).toBeGreaterThanOrEqual(layout.usable.left - 1)
            expect(layout.surface.right, url).toBeLessThanOrEqual(layout.usable.right + 1)
            expect(layout.surface.left, url).toBeGreaterThanOrEqual(layout.usable.left - 1)
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
    await page.goto('/go.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Go')
    await expect(page.locator('go-game .board')).toHaveAttribute('data-size', '13')
    await page.goto('/reversi.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Reversi')
    await expect(page.locator('reversi-game .cell.legal')).toHaveCount(4)
    await page.goto('/checkers.html')
    await expect(page.locator('offline-shell h1')).toHaveText('English Draughts')
    await expect(page.locator('checkers-game .square.movable')).toHaveCount(4)
    await page.goto('/backgammon.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Backgammon')
    await expect(page.locator('backgammon-game .point')).toHaveCount(24)
    await page.locator('offline-shell .guide-btn').click()
    await expect(page.locator('offline-shell .guide-image')).toHaveAttribute('src', './guides/backgammon.svg')
    expect(await page.locator('offline-shell .guide-image').evaluate(image => image.complete && image.naturalWidth > 0)).toBeTruthy()
    await page.goto('/huarong.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Huarong Dao')
    await expect(page.locator('huarong-game .piece')).toHaveCount(10)
    await page.goto('/sliding.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Sliding Puzzle')
    await expect(page.locator('sliding-puzzle .tile')).toHaveCount(15)
    await page.goto('/nonogram.html')
    await expect(page.locator('offline-shell h1')).toHaveText('Nonogram')
    await expect(page.locator('nonogram-game .cell')).toHaveCount(100)
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
