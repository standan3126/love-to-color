// The picture list: drawings prepared from Openclipart (art/art.json) and patterns drawn in
// code (patterns.js), and how each becomes cells at Easy, Cozy and Detailed.
import { buildCells } from './engine.js'
import { drawPattern, PATTERNS, SIZE } from './patterns.js'

export const SIZES = [
  { id: 'easy', name: 'Easy', note: 'Big cells' },
  { id: 'cozy', name: 'Cozy', note: 'Some detail' },
  { id: 'detailed', name: 'Detailed', note: 'Small cells to zoom into' },
]

// For drawings: cells smaller than this share of the picture join a neighbor.
export const MERGE = [0.004, 0.0012, 0.0003]

export const GROUPS = [
  { id: 'home', name: 'Cottages' },
  { id: 'garden', name: 'Gardens' },
  { id: 'animals', name: 'Animals' },
  { id: 'mandala', name: 'Mandalas' },
  { id: 'fractal', name: 'Fractals' },
  { id: 'tessellation', name: 'Tessellations' },
]

let catalog = null

export async function loadCatalog() {
  if (catalog) return catalog
  const art = await (await fetch('art/art.json')).json()
  catalog = [
    ...art.map((a) => ({ ...a, kind: 'art' })),
    ...PATTERNS.map((p) => ({ id: p.id, name: p.name, group: p.kind, kind: 'pattern', pattern: p, width: SIZE, height: SIZE })),
  ]
  return catalog
}

export const findPicture = (id) => catalog?.find((p) => p.id === id)

// A small uncolored preview: an <img> for drawings, a canvas for patterns.
export function previewOf(item, px = 220) {
  if (item.kind === 'art') {
    const img = new Image()
    img.src = `art/${item.id}/lines.png`
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
