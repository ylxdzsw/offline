import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || 'dist')
const port = Number(process.env.PORT || 4173)
const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
}

http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`)
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1))
    const file = path.resolve(root, relative)
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        response.writeHead(404).end('Not found')
        return
    }
    response.writeHead(200, {
        'content-type': types[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
        'service-worker-allowed': './',
    })
    fs.createReadStream(file).pipe(response)
}).listen(port, '127.0.0.1', () => {
    console.log(`http://127.0.0.1:${port}`)
})
