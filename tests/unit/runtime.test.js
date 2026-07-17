const test = require('node:test')
const assert = require('node:assert/strict')

test('worker Blob URLs are revoked after the worker captures them', () => {
    const previous = {
        document: globalThis.document,
        Worker: globalThis.Worker,
        createObjectURL: URL.createObjectURL,
        revokeObjectURL: URL.revokeObjectURL,
        OfflineGames: globalThis.OfflineGames,
    }
    const calls = []

    try {
        globalThis.document = {
            getElementById: id => id === 'worker-payload' ? {textContent: Buffer.from('self.ready = true').toString('base64')} : null,
        }
        globalThis.Worker = class {
            constructor(url) {
                this.url = url
                calls.push(['worker', url])
            }
        }
        URL.createObjectURL = blob => {
            assert(blob instanceof Blob)
            calls.push(['create', 'blob:test'])
            return 'blob:test'
        }
        URL.revokeObjectURL = url => calls.push(['revoke', url])
        delete require.cache[require.resolve('../../src/shared/runtime.js')]
        require('../../src/shared/runtime.js')

        const worker = globalThis.OfflineGames.runtime.createWorker('worker-payload')
        assert.equal(worker.url, 'blob:test')
        assert.deepEqual(calls, [
            ['create', 'blob:test'],
            ['worker', 'blob:test'],
            ['revoke', 'blob:test'],
        ])
    } finally {
        globalThis.document = previous.document
        globalThis.Worker = previous.Worker
        URL.createObjectURL = previous.createObjectURL
        URL.revokeObjectURL = previous.revokeObjectURL
        globalThis.OfflineGames = previous.OfflineGames
        delete require.cache[require.resolve('../../src/shared/runtime.js')]
    }
})
