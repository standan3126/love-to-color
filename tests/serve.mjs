// A small local server laid out like the live site: GameHub's toolbox and icons at /shared/ and
// /icons/ (from the hub folder next to this one), the game at /love-to-color/.
//   node tests/serve.mjs [port]     then open http://localhost:4190/love-to-color/
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const game = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hub = resolve(process.env.HUB_DIR ?? join(game, '../hub'))
const port = Number(process.argv[2] || 4190)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' }

createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let base = hub
  if (path.startsWith('/love-to-color/')) {
    base = game
    path = path.slice('/love-to-color'.length)
  }
  let file = resolve(join(base, path))
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!file.startsWith(base) || !existsSync(file)) return res.writeHead(404).end('Not found')
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(readFileSync(file))
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/love-to-color/`))
