// The photo tool: turns photos in private/photos/ into coloring pictures for the game.
//
//   npm run photos      then open http://localhost:4191/tools/photo-tool.html
//
// Only this computer can reach it (it listens on 127.0.0.1). "Add to game" writes
// art/<id>/detailed-lines.png and detailed-colors.png (photo pictures are all Detailed), adds it to
// art/art.json and its credit to CREDITS.md. The photo itself is never copied into the game, so
// nothing hidden in it (like where it was taken) goes anywhere.
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeCredits } from './credits.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hub = resolve(root, '../hub')
const photos = join(root, 'private/photos')
const port = Number(process.argv[2] || 4191)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
const SIZES = ['detailed']

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

function addPicture(body) {
  if (!body.name || !SIZES.every((s) => body.sizes?.[s])) throw new Error('Missing a name or a size')
  const id = `photo-${slug(body.name)}`
  mkdirSync(join(root, 'art', id), { recursive: true })
  for (const size of SIZES) {
    for (const kind of ['lines', 'colors']) {
      const data = body.sizes[size][kind]
      if (!data.startsWith('data:image/png;base64,')) throw new Error('Pictures must be PNG')
      writeFileSync(join(root, 'art', id, `${size}-${kind}.png`), Buffer.from(data.split(',')[1], 'base64'))
    }
  }
  const artFile = join(root, 'art/art.json')
  const art = JSON.parse(readFileSync(artFile, 'utf8'))
  const entry = {
    id,
    name: body.name,
    group: body.group,
    width: body.width,
    height: body.height,
    sizes: Object.fromEntries(SIZES.map((s) => [s, { palette: body.sizes[s].palette }])),
    credit: body.credit,
  }
  const at = art.findIndex((a) => a.id === id)
  if (at === -1) art.push(entry)
  else art[at] = entry
  writeFileSync(artFile, JSON.stringify(art, null, 1) + '\n')
  writeCredits(root)
  // Remember the settings next to the photo, so it can be tuned again later.
  const infoFile = join(photos, body.file.replace(/\.[^.]+$/, '.json'))
  const info = existsSync(infoFile) ? JSON.parse(readFileSync(infoFile, 'utf8')) : {}
  writeFileSync(infoFile, JSON.stringify({ ...info, name: body.name, group: body.group, credit: body.credit, settings: body.settings, id }, null, 1) + '\n')
  return id
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (req.method === 'POST' && url.pathname === '/add') {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try {
        const id = addPicture(JSON.parse(raw))
        console.log(`Added ${id}`)
        res.writeHead(200).end(id)
      } catch (e) {
        res.writeHead(400).end(e.message)
      }
    })
    return
  }
  if (url.pathname === '/photos') {
    mkdirSync(photos, { recursive: true })
    const list = readdirSync(photos)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .map((file) => {
        const infoFile = join(photos, file.replace(/\.[^.]+$/, '.json'))
        return { file, info: existsSync(infoFile) ? JSON.parse(readFileSync(infoFile, 'utf8')) : null }
      })
    return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(list))
  }
  const path = decodeURIComponent(url.pathname)
  const base = path.startsWith('/shared/') ? hub : root
  const file = resolve(join(base, path))
  if (!file.startsWith(base) || !existsSync(file) || statSync(file).isDirectory()) return res.writeHead(404).end('Not found')
  res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(readFileSync(file))
}).listen(port, '127.0.0.1', () => console.log(`Photo tool: http://localhost:${port}/tools/photo-tool.html`))
