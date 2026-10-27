// Prepares the drawings in tools/art-src/ for the game: writes art/<id>/lines.png and
// art/<id>/colors.png, and art/art.json (names, palettes, sizes and credits).
//
//   node tools/prep-art.mjs            all drawings
//   node tools/prep-art.mjs fox owl    just these
//
// Needs Playwright (npm install). Never re-run it for a published drawing unless its saves can
// be lost: the game finds a drawing's cells from these images.
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { extname, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sources = JSON.parse(readFileSync(join(root, 'tools/art-src/sources.json'), 'utf8'))
const only = process.argv.slice(2)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' }
const server = createServer((req, res) => {
  const file = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (!file.startsWith(root) || !existsSync(file)) return res.writeHead(404).end()
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(readFileSync(file))
}).listen(0)
const port = server.address().port

const artFile = join(root, 'art/art.json')
const art = existsSync(artFile) ? JSON.parse(readFileSync(artFile, 'utf8')) : []
const browser = await chromium.launch()
const page = await browser.newPage()
for (const s of sources) {
  if (only.length && !only.includes(s.id)) continue
  await page.goto(`http://localhost:${port}/tools/prep-art.html?src=/tools/art-src/${s.id}.svg&k=${s.k || 12}`)
  await page.waitForFunction(() => document.title === 'done', null, { timeout: 120000 })
  const r = await page.evaluate(() => window.result)
  mkdirSync(join(root, 'art', s.id), { recursive: true })
  for (const name of ['lines', 'colors']) writeFileSync(join(root, 'art', s.id, `${name}.png`), Buffer.from(r[name].split(',')[1], 'base64'))
  const entry = {
    id: s.id,
    name: s.name,
    group: s.group,
    width: r.width,
    height: r.height,
    palette: r.palette,
    credit: { title: s.title, artist: s.artist, source: s.source, license: s.license },
  }
  const at = art.findIndex((a) => a.id === s.id)
  if (at === -1) art.push(entry)
  else art[at] = entry
  console.log(s.id, `${r.width}×${r.height}`, r.names.join(', '))
}
art.sort((a, b) => sources.findIndex((s) => s.id === a.id) - sources.findIndex((s) => s.id === b.id))
writeFileSync(artFile, JSON.stringify(art, null, 1) + '\n')
await browser.close()
server.close()
