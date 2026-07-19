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
        delete require.cache[require.resolve('./runtime.js')]
        require('./runtime.js')

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
        delete require.cache[require.resolve('./runtime.js')]
    }
})

test('worker receives its compiled WASM module before game requests', () => {
    const previous = {
        document: globalThis.document,
        Worker: globalThis.Worker,
        createObjectURL: URL.createObjectURL,
        revokeObjectURL: URL.revokeObjectURL,
        OfflineGames: globalThis.OfflineGames,
    }
    const calls = []
    const compiledModule = {kind: 'compiled-wasm'}

    try {
        globalThis.document = {
            getElementById: id => id === 'worker-payload' ? {
                textContent: Buffer.from('self.ready = true').toString('base64'),
                dataset: {wasmModule: 'chess'},
            } : null,
        }
        globalThis.Worker = class {
            postMessage(message) { calls.push(message) }
            terminate() {}
        }
        URL.createObjectURL = () => 'blob:test'
        URL.revokeObjectURL = () => {}
        globalThis.OfflineGames = {wasm: {module: name => {
            assert.equal(name, 'chess')
            return compiledModule
        }}}
        delete require.cache[require.resolve('./runtime.js')]
        require('./runtime.js')

        const worker = globalThis.OfflineGames.runtime.createWorker('worker-payload')
        worker.postMessage({id: 7})
        assert.deepEqual(calls, [
            {__offlineWasmModule: true, name: 'chess', module: compiledModule},
            {id: 7},
        ])
    } finally {
        globalThis.document = previous.document
        globalThis.Worker = previous.Worker
        URL.createObjectURL = previous.createObjectURL
        URL.revokeObjectURL = previous.revokeObjectURL
        globalThis.OfflineGames = previous.OfflineGames
        delete require.cache[require.resolve('./runtime.js')]
    }
})

test('move seeds are stable for retries and distinct across plies', () => {
    const previous = globalThis.OfflineGames
    try {
        delete require.cache[require.resolve('./runtime.js')]
        require('./runtime.js')
        const {moveSeed} = globalThis.OfflineGames.runtime
        assert.equal(moveSeed(12345, 8), moveSeed(12345, 8))
        assert.notEqual(moveSeed(12345, 8), moveSeed(12345, 9))
        assert.notEqual(moveSeed(12345, 8), moveSeed(54321, 8))
    } finally {
        globalThis.OfflineGames = previous
        delete require.cache[require.resolve('./runtime.js')]
    }
})
