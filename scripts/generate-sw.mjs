import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {fileURLToPath} from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.resolve(process.argv[2] || path.join(root, 'dist'))
const template = fs.readFileSync(path.join(root, 'public', 'sw.template.js'), 'utf8')

const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
})

const files = walk(dist)
    .filter(file => !['sw.js', 'CNAME', '.nojekyll'].includes(path.basename(file)))
    .sort()

const hash = crypto.createHash('sha256')
for (const file of files) {
    hash.update(path.relative(dist, file))
    hash.update(fs.readFileSync(file))
}

const precache = ['./', ...files.map(file => './' + path.relative(dist, file).replaceAll(path.sep, '/'))]
const output = template
    .replace('__CACHE_NAME__', `offline-games-${hash.digest('hex').slice(0, 12)}`)
    .replace('__PRECACHE__', JSON.stringify(precache, null, 4))

fs.writeFileSync(path.join(dist, 'sw.js'), output)
