(function (root) {
    'use strict'

    const entries = new Map()
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const decodeBase64 = encoded => {
        if (typeof atob === 'function') {
            const binary = atob(encoded)
            return Uint8Array.from(binary, character => character.charCodeAt(0))
        }
        if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(encoded, 'base64'))
        throw new Error('No base64 decoder is available')
    }

    const decompress = async compressed => {
        if (typeof DecompressionStream !== 'function') throw new Error('This browser does not support embedded WASM decompression')
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
        return new Uint8Array(await new Response(stream).arrayBuffer())
    }

    const defaultImports = imports => ({
        ...imports,
        env: {
            now_ms: () => typeof performance === 'object' ? performance.now() : Date.now(),
            ...imports?.env,
        },
    })

    const finishInstantiation = async (entry, module, imports) => {
        const instance = await WebAssembly.instantiate(module, defaultImports(imports))
        const version = instance.exports.offline_abi_version?.()
        if (version != null && version !== 1) throw new Error(`Unsupported ${entry.name} WASM ABI version: ${version}`)
        Object.assign(entry, {module, instance, exports: instance.exports})
        return entry
    }

    const finishInstantiationSync = (entry, module, imports) => {
        const instance = new WebAssembly.Instance(module, defaultImports(imports))
        const version = instance.exports.offline_abi_version?.()
        if (version != null && version !== 1) throw new Error(`Unsupported ${entry.name} WASM ABI version: ${version}`)
        Object.assign(entry, {module, instance, exports: instance.exports})
        return entry
    }

    const registerEmbedded = (name, compressedBase64, imports = {}) => {
        if (entries.has(name)) return entries.get(name).ready
        const entry = {name, module: null, instance: null, exports: null, ready: null}
        entries.set(name, entry)
        entry.ready = (async () => {
            const bytes = await decompress(decodeBase64(compressedBase64))
            const module = await WebAssembly.compile(bytes)
            return finishInstantiation(entry, module, imports)
        })()
        return entry.ready
    }

    const installModule = (name, module, imports = {}) => {
        if (entries.has(name)) return entries.get(name).ready
        const entry = {name, module: null, instance: null, exports: null, ready: null}
        entries.set(name, entry)
        entry.ready = finishInstantiation(entry, module, imports)
        return entry.ready
    }

    const has = name => entries.has(name)

    const installBytes = (name, bytes, imports = {}) => {
        if (entries.has(name)) {
            const found = entries.get(name)
            if (!found.exports) throw new Error(`WASM module is still initializing: ${name}`)
            return found
        }
        const entry = {name, module: null, instance: null, exports: null, ready: null}
        entries.set(name, entry)
        try {
            const module = new WebAssembly.Module(bytes)
            finishInstantiationSync(entry, module, imports)
            entry.ready = Promise.resolve(entry)
            return entry
        } catch (error) {
            entries.delete(name)
            throw error
        }
    }

    const entry = name => {
        const found = entries.get(name)
        if (!found) throw new Error(`WASM module is not registered: ${name}`)
        return found
    }

    const ready = name => entry(name).ready

    const moduleFor = name => {
        const found = entry(name)
        if (!found.module) throw new Error(`WASM module is not ready: ${name}`)
        return found.module
    }

    const exportsFor = name => {
        const found = entry(name)
        if (!found.exports) throw new Error(`WASM module is not ready: ${name}`)
        return found.exports
    }

    const dispatch = (name, request) => {
        const exports = exportsFor(name)
        const required = ['memory', 'offline_input_reserve', 'offline_dispatch', 'offline_output_ptr', 'offline_output_len']
        for (const key of required) if (exports[key] == null) throw new Error(`${name} WASM is missing export ${key}`)

        const input = encoder.encode(JSON.stringify(request))
        const inputPointer = exports.offline_input_reserve(input.length)
        new Uint8Array(exports.memory.buffer, inputPointer, input.length).set(input)
        const status = exports.offline_dispatch(input.length)
        const outputPointer = exports.offline_output_ptr()
        const outputLength = exports.offline_output_len()
        const output = decoder.decode(new Uint8Array(exports.memory.buffer, outputPointer, outputLength))
        const response = JSON.parse(output)
        if (status !== 0) {
            const error = new Error(response?.error?.message || `${name} WASM request failed with status ${status}`)
            Object.assign(error, {status, response})
            throw error
        }
        return response
    }

    const defineElement = (moduleName, elementName, constructor) => {
        const definition = ready(moduleName).then(() => {
            if (typeof customElements === 'undefined') return
            if (!customElements.get(elementName)) customElements.define(elementName, constructor)
        })
        definition.catch(error => console.error(`Unable to initialize ${elementName}`, error))
        return definition
    }

    const api = {registerEmbedded, installModule, installBytes, has, ready, module: moduleFor, exports: exportsFor, dispatch, defineElement}
    root.OfflineGames = Object.assign(root.OfflineGames || {}, {wasm: api})
    if (typeof module === 'object' && module.exports) module.exports = api

    const isWorker = typeof root.document === 'undefined' && typeof root.addEventListener === 'function' && typeof root.postMessage === 'function'
    if (isWorker) {
        const pending = []
        let initialized = false
        const gate = event => {
            if (event.data?.__offlineWasmModule === true) {
                event.stopImmediatePropagation()
                installModule(event.data.name, event.data.module).then(() => {
                    initialized = true
                    root.removeEventListener('message', gate)
                    for (const data of pending) root.dispatchEvent(new MessageEvent('message', {data}))
                }).catch(error => {
                    root.postMessage({__offlineWasmError: true, message: error.message})
                    queueMicrotask(() => { throw error })
                })
            } else if (!initialized) {
                event.stopImmediatePropagation()
                pending.push(event.data)
            }
        }
        root.addEventListener('message', gate)
    }
})(globalThis)
