// The picture list, in three sections:
//   Easy      simple drawings (art/art.json, prepared from Openclipart)
//   Cozy      mandalas, fractals and tessellations drawn in code (patterns.js)
//   Detailed  very detailed pictures made from photos and prints (tools/photo-tool), with soft
//             gray outlines that colors cover up
// Each section colors its pictures at one size. Saves made before the sections (2026-10-27) may
// be at another size; those still open at the size they were saved with.
import { buildCells } from './engine.js'
import { drawPattern, PATTERNS, SIZE } from './patterns.js'
import { SOFT_INK } from './stage.js'

export const SIZES = [
  { id: 'easy', name: 'Easy', note: 'Big cells' },
  { id: 'cozy', name: 'Cozy', note: 'Some detail' },
  { id: 'detailed', name: 'Detailed', note: 'Small cells to zoom into' },
]

export const SECTIONS = [
  { id: 'easy', name: 'Easy', kind: 'art', size: 'easy' },
  { id: 'cozy', name: 'Cozy', kind: 'pattern', size: 'cozy' },
  { id: 'detailed', name: 'Detailed', kind: 'photo', size: 'detailed' },
]
export const sectionOf = (item) => SECTIONS.find((s) => s.kind === item.kind)

// Detailed pictures have soft outlines (see stage.js).
export const softLines = (item, size) => item.kind === 'photo' && size === 'detailed'

// For drawings: cells smaller than this share of the picture join a neighbor.
export const MERGE = [0.004, 0.0012, 0.0003]

export const GROUPS = [
  { id: 'home', name: 'Cottages' },
  { id: 'garden', name: 'Gardens' },
  { id: 'animals', name: 'Animals' },
  { id: 'nature', name: 'Nature' },
  { id: 'mandala', name: 'Mandalas' },
  { id: 'fractal', name: 'Fractals' },
  { id: 'tessellation', name: 'Tessellations' },
]

let catalog = null

export async function loadCatalog() {
  if (catalog) return catalog
  const art = await (await fetch('art/art.json')).json()
  catalog = [
    ...art.map((a) => ({ ...a, kind: a.sizes ? 'photo' : 'art' })),
    ...PATTERNS.map((p) => ({ id: p.id, name: p.name, group: p.kind, kind: 'pattern', pattern: p, width: SIZE, height: SIZE })),
  ]
  return catalog
}

export const findPicture = (id) => catalog?.find((p) => p.id === id)

// A small uncolored preview: an <img> for drawings, a canvas for patterns.
export function previewOf(item, px = 220) {
  if (item.kind !== 'pattern') {
    const img = new Image()
    img.src = item.kind === 'photo' ? `art/${item.id}/detailed-lines.png` : `art/${item.id}/lines.png`
    img.alt = ''
    img.loading = 'lazy'
    return img
  }
  const c = document.createElement('canvas')
  c.width = c.height = px
  drawPattern(item.pattern, 1, c.getContext('2d'), null, px)
  return c
}

async function imageData(src, w, h) {
  const img = new Image()
  img.src = src
  await img.decode()
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, w, h)
}

// Everything the coloring screen needs for one picture at one size.
export async function loadCells(item, detail) {
  if (item.kind === 'photo') {
    const size = SIZES[detail].id
    const [lines, colors] = await Promise.all([
      imageData(`art/${item.id}/${size}-lines.png`, item.width, item.height),
      imageData(`art/${item.id}/${size}-colors.png`, item.width, item.height),
    ])
    return buildCells({ lines, colors, palette: item.sizes[size].palette, blank: [] })
  }
  if (item.kind === 'art') {
    const [lines, colors] = await Promise.all([
      imageData(`art/${item.id}/lines.png`, item.width, item.height),
      imageData(`art/${item.id}/colors.png`, item.width, item.height),
    ])
    return buildCells({ lines, colors, palette: item.palette, mergeBelow: MERGE[detail], blank: [item.palette.length - 1] })
  }
  const mk = () => {
    const c = document.createElement('canvas')
    c.width = c.height = SIZE
    return c.getContext('2d', { willReadFrequently: true })
  }
  const L = mk()
  const C = mk()
  const { palette, blank } = drawPattern(item.pattern, detail, L, C)
  return buildCells({ lines: L.getImageData(0, 0, SIZE, SIZE), colors: C.getImageData(0, 0, SIZE, SIZE), palette, blank })
}

// A picture's outlines at one size, as the coloring screen will show them before any color.
const outlines = new Map()
export async function outlineCanvas(item, detail) {
  const key = `${item.id}:${detail}`
  if (!outlines.has(key)) {
    const cells = await loadCells(item, detail)
    const c = document.createElement('canvas')
    c.width = cells.width
    c.height = cells.height
    const g = c.getContext('2d')
    const img = g.createImageData(cells.width, cells.height)
    const ink = softLines(item, SIZES[detail].id) ? SOFT_INK : [43, 38, 34]
    for (let p = 0, k = 0; p < cells.lineAlpha.length; p++, k += 4) {
      const a = cells.lineAlpha[p] / 255
      img.data[k] = 255 - a * (255 - ink[0])
      img.data[k + 1] = 255 - a * (255 - ink[1])
      img.data[k + 2] = 255 - a * (255 - ink[2])
      img.data[k + 3] = 255
    }
    g.putImageData(img, 0, 0)
    outlines.set(key, c)
    // Keep only the last few: each is a full-size picture, and phones have little memory.
    if (outlines.size > 4) outlines.delete(outlines.keys().next().value)
  }
  return outlines.get(key)
}
