import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const dist = path.resolve(process.argv[2] || 'dist')
const iconDir = path.join(dist, 'icons')
fs.mkdirSync(iconDir, {recursive: true})

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
}

const crc32 = buffer => {
    let c = 0xffffffff
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
    const name = Buffer.from(type)
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([name, data])))
    return Buffer.concat([length, name, data, crc])
}

const render = size => {
    const pixels = Buffer.alloc((size * 4 + 1) * size)
    const background = [244, 234, 212, 255]
    const ink = [74, 55, 45, 255]
    const red = [158, 55, 48, 255]
    const black = [42, 41, 38, 255]
    const stride = size * 4 + 1

    for (let y = 0; y < size; y++) {
        const row = y * stride
        pixels[row] = 0
        for (let x = 0; x < size; x++) pixels.set(background, row + 1 + x * 4)
    }

    const put = (x, y, color) => {
        if (x < 0 || y < 0 || x >= size || y >= size) return
        pixels.set(color, y * stride + 1 + x * 4)
    }
    const line = (x1, y1, x2, y2, width, color) => {
        const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))
        for (let i = 0; i <= steps; i++) {
            const x = Math.round(x1 + (x2 - x1) * i / steps)
            const y = Math.round(y1 + (y2 - y1) * i / steps)
            for (let dy = -width; dy <= width; dy++) for (let dx = -width; dx <= width; dx++) put(x + dx, y + dy, color)
        }
    }
    const circle = (cx, cy, radius, color) => {
        for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
            if (x * x + y * y <= radius * radius) put(cx + x, cy + y, color)
        }
    }

    const margin = Math.round(size * 0.18)
    const step = (size - margin * 2) / 4
    const width = Math.max(1, Math.round(size / 150))
    for (let i = 0; i < 5; i++) {
        const p = Math.round(margin + step * i)
        line(margin, p, size - margin, p, width, ink)
        line(p, margin, p, size - margin, width, ink)
    }
    circle(Math.round(margin + step), Math.round(margin + step), Math.round(size * 0.105), red)
    circle(Math.round(margin + step * 3), Math.round(margin + step * 3), Math.round(size * 0.105), black)

    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(size, 0)
    ihdr.writeUInt32BE(size, 4)
    ihdr[8] = 8
    ihdr[9] = 6
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    return Buffer.concat([
        signature,
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(pixels, {level: 9})),
        chunk('IEND', Buffer.alloc(0)),
    ])
}

for (const size of [180, 192, 512]) {
    const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
    fs.writeFileSync(path.join(iconDir, name), render(size))
}
