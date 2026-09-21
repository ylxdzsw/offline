const {test, expect} = require('@playwright/test')

for (const size of [9, 19]) {
    for (const action of ['escape', 'capture']) {
        test(`Go ${size}x${size} worker finds the obvious ${action} and saves the result`, async ({page}) => {
            await page.goto('/go.html')
            await page.locator('go-game .spot').first().waitFor()
            await page.locator('go-game').evaluate((game, {size, action}) => {
                game.cancelAI()
                const points = action === 'escape'
                    ? [[0, 8], [4, 4], [3, 4], [0, 0], [4, 3], [0, 2], [4, 5]]
                    : [[0, 8], [3, 4], [4, 4], [4, 3], [0, 0], [4, 5], [0, 2]]
                game.state = {...game.fresh(size, 'hard'), seed: 29,
                    history: points.map(([row, column]) => ({kind: 'play', index: row * size + column}))}
                game.position = game.engine.state(size, game.state.history)
                game.save()
                game.render()
                game.requestAI()
            }, {size, action})
            await expect.poll(() => page.locator('go-game').evaluate(game => game.state.history.length), {timeout: 8000}).toBe(8)
            const result = await page.locator('go-game').evaluate(game => ({
                move: game.state.history.at(-1), board: game.position.board, turn: game.position.turn,
                thinking: game.thinking, captures: game.position.captures,
            }))
            expect(result.move).toEqual({kind: 'play', index: 5 * size + 4})
            expect(result.board[4 * size + 4]).toBe(action === 'escape' ? 2 : 0)
            expect(result.thinking).toBe(false)
            expect(result.turn).toBe(1)
            if (action === 'capture') expect(result.captures.white).toBe(1)
            await page.reload()
            await expect(page.locator('go-game .status')).toHaveText('Your turn')
            expect(await page.locator('go-game').evaluate(game => game.state.history.at(-1))).toEqual(result.move)
        })
    }
}

test('Draughts computes a winning small king ending in a fresh worker', async ({page}) => {
    await page.goto('/checkers.html')
    await page.locator('checkers-game .square').first().waitFor()
    await page.locator('checkers-game').evaluate(game => {
        game.cancelAI()
        const board = Array(64).fill(0)
        board[1] = game.engine.BLACK_KING
        board[24] = board[26] = game.engine.RED_KING
        game.state = {...game.fresh('hard'), seed: 7, board, turn: game.engine.RED,
            halfmove: 1, keys: [game.engine.positionKey(board, game.engine.RED)]}
        game.save()
        game.render()
        game.requestAI()
    })
    await expect.poll(() => page.locator('checkers-game').evaluate(game => game.state.history.length), {timeout: 6000}).toBe(1)
    expect(await page.locator('checkers-game').evaluate(game => ({
        thinking: game.thinking, failed: game.aiFailed, turn: game.state.turn,
        kings: game.state.board.filter(piece => game.engine.isKing(piece)).length,
    }))).toEqual({thinking: false, failed: false, turn: 1, kings: 3})
    await page.reload()
    await expect(page.locator('checkers-game .status')).toHaveText('Your turn')
    expect(await page.locator('checkers-game').evaluate(game => game.state.history.length)).toBe(1)
})
