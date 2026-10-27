// Pictures drawn in code: mandalas, fractals and tessellations. Each one is a list of shapes
// (filled with a palette color, outlined in ink), drawn the same way every time from its seed.
//
// detail: 0 = Easy (big cells), 1 = Cozy, 2 = Detailed (small cells).
// Never change how a published pattern draws: saved pictures find their cells again from it.
import { PACKS, WHITE } from './crayons.js'

export const SIZE = 1200 // pixels per side the engine works at
const LINE = [7, 5, 3.5] // outline thickness by detail

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]

function poly(points) {
  const p = new Path2D()
  points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
  p.closePath()
  return p
}

function circle(x, y, r) {
  const p = new Path2D()
  p.arc(x, y, r, 0, Math.PI * 2)
  return p
}

// --- Mandalas ------------------------------------------------------------------------------------

function mandala(seed) {
  return (detail) => {
    const rand = rng(seed * 7 + detail)
    const c = SIZE / 2
    const R = SIZE * 0.47
    const rings = [3, 5, 8][detail]
    const core = R * [0.2, 0.14, 0.1][detail]
    const base = [8, 12, 20][detail]
    const kinds = ['petal', 'arch', 'zigzag', 'round', 'petal2', 'beads']
    const shapes = []
    let color = 0
    const next = () => color++
    for (let i = 0; i < rings; i++) {
      const r1 = R - ((R - core) * i) / rings
      const r0 = R - ((R - core) * (i + 1)) / rings
      const rm = (r0 + r1) / 2
      const ringColor = next()
      shapes.push({ path: circle(c, c, r1), c: ringColor })
      const n = Math.max(6, Math.round((base * (rm / R)) / 2) * 2 * (rand() < 0.4 ? 2 : 1))
      const kind = kinds[Math.floor(rand() * kinds.length)]
      const off = rand() < 0.5 ? 0 : Math.PI / n
      const a = next()
      const b = rand() < 0.5 ? a : next()
      for (let k = 0; k < n; k++) {
        const th = off + (k * 2 * Math.PI) / n
        const col = k % 2 ? b : a
        const half = Math.PI / n
        if (kind === 'petal' || kind === 'petal2') {
          const p = new Path2D()
          p.moveTo(...polar(c, c, r0, th))
          p.quadraticCurveTo(...polar(c, c, rm, th - half * 1.1), ...polar(c, c, r1 * 0.98, th))
          p.quadraticCurveTo(...polar(c, c, rm, th + half * 1.1), ...polar(c, c, r0, th))
          shapes.push({ path: p, c: col })
          if (kind === 'petal2') {
            const q = new Path2D()
            const r2 = r0 + (r1 - r0) * 0.25
            const r3 = r0 + (r1 - r0) * 0.75
            q.moveTo(...polar(c, c, r2, th))
            q.quadraticCurveTo(...polar(c, c, (r2 + r3) / 2, th - half * 0.5), ...polar(c, c, r3, th))
            q.quadraticCurveTo(...polar(c, c, (r2 + r3) / 2, th + half * 0.5), ...polar(c, c, r2, th))
            shapes.push({ path: q, c: ringColor })
          }
        } else if (kind === 'arch') {
          const p = new Path2D()
          p.moveTo(...polar(c, c, r0, th - half))
          p.quadraticCurveTo(...polar(c, c, r0 + (r1 - r0) * 1.9, th), ...polar(c, c, r0, th + half))
          p.arc(c, c, r0, th + half, th - half, true)
          shapes.push({ path: p, c: col })
        } else if (kind === 'zigzag') {
          shapes.push({ path: poly([polar(c, c, r0, th - half), polar(c, c, r1 * 0.99, th), polar(c, c, r0, th + half)]), c: col })
        } else if (kind === 'round') {
          shapes.push({ path: circle(...polar(c, c, rm, th), Math.min((r1 - r0) * 0.45, rm * Math.sin(half) * 0.95)), c: col })
        } else {
          shapes.push({ path: circle(...polar(c, c, rm, th), Math.min((r1 - r0) * 0.28, rm * Math.sin(half) * 0.8)), c: col })
        }
      }
    }
    shapes.push({ path: circle(c, c, core), c: next() })
    if (detail > 0) {
      const n = 6
      for (let k = 0; k < n; k++) {
        const th = (k * 2 * Math.PI) / n
        const p = new Path2D()
        p.moveTo(c, c)
        p.quadraticCurveTo(...polar(c, c, core * 0.6, th - 0.6), ...polar(c, c, core * 0.92, th))
        p.quadraticCurveTo(...polar(c, c, core * 0.6, th + 0.6), c, c)
        shapes.push({ path: p, c: next() })
      }
    }
    return shapes
  }
}

// --- Fractals ------------------------------------------------------------------------------------

function sierpinski(detail) {
  const depth = [3, 4, 5][detail]
  const shapes = []
  const h = SIZE * 0.86
  const top = [SIZE / 2, (SIZE - h) / 2 + 10]
  const left = [SIZE * 0.02, top[1] + h * 0.96]
  const right = [SIZE * 0.98, top[1] + h * 0.96]
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  const go = (a, b, c, level, corner) => {
    if (level === depth) {
      shapes.push({ path: poly([a, b, c]), c: 3 + corner })
      return
    }
    const ab = mid(a, b)
    const bc = mid(b, c)
    const ca = mid(c, a)
    go(a, ab, ca, level + 1, 0)
    go(ab, b, bc, level + 1, 1)
    go(ca, bc, c, level + 1, 2)
    shapes.push({ path: poly([ab, bc, ca]), c: level % 3 })
  }
  go(top, right, left, 0, 0)
  return shapes
}

function whirl(detail) {
  const levels = [9, 14, 18][detail]
  const tiles = detail === 2 ? 2 : 1
  const t = [0.16, 0.12, 0.13][detail]
  const shapes = []
  const cell = SIZE / tiles
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const pad = cell * 0.02
      let v = [
        [tx * cell + pad, ty * cell + pad],
        [(tx + 1) * cell - pad, ty * cell + pad],
        [(tx + 1) * cell - pad, (ty + 1) * cell - pad],
        [tx * cell + pad, (ty + 1) * cell - pad],
      ]
      const spin = (tx + ty) % 2 === 1
      for (let level = 0; level < levels; level++) {
        const nv = v.map((p, i) => {
          const q = v[(i + 1) % 4]
          const tt = spin ? 1 - t : t
          return [p[0] + (q[0] - p[0]) * tt, p[1] + (q[1] - p[1]) * tt]
        })
        for (let i = 0; i < 4; i++) {
          shapes.push({ path: poly([v[i], nv[i], nv[(i + 3) % 4]]), c: (level + (i % 2) * 2) % 6 })
        }
        v = nv
      }
      shapes.push({ path: poly(v), c: levels % 6 })
    }
  }
  return shapes
}

function nestedCircles(detail) {
  const depth = [1, 2, 3][detail]
  const shapes = []
  const go = (x, y, r, level, kind) => {
    shapes.push({ path: circle(x, y, r), c: (level * 2 + kind) % 6 })
    if (level === depth) return
    const s = r / 3
    go(x, y, s, level + 1, 1)
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3 + Math.PI / 6
      go(x + Math.cos(a) * 2 * s, y + Math.sin(a) * 2 * s, s, level + 1, 0)
    }
  }
  go(SIZE / 2, SIZE / 2, SIZE * 0.48, 0, 0)
  return shapes
}

// Squares inside squares: each square keeps a center hole and splits into eight around it.
// Cozy stops one step early and keeps the last squares whole around their holes.
function carpet(detail) {
  const depth = [2, 3, 3][detail]
  const shapes = []
  const go = (x, y, s, level) => {
    const t = s / 3
    if (level === depth - 1) {
      if (detail !== 2) shapes.push({ path: poly([[x, y], [x + s, y], [x + s, y + s], [x, y + s]]), c: 3 + ((Math.round(x / s) + Math.round(y / s)) % 3) })
      else {
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
          if (i === 1 && j === 1) continue
          shapes.push({ path: poly([[x + i * t, y + j * t], [x + (i + 1) * t, y + j * t], [x + (i + 1) * t, y + (j + 1) * t], [x + i * t, y + (j + 1) * t]]), c: 3 + ((i + j) % 3) })
        }
      }
      shapes.push({ path: poly([[x + t, y + t], [x + 2 * t, y + t], [x + 2 * t, y + 2 * t], [x + t, y + 2 * t]]), c: level % 3 })
      return
    }
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (i !== 1 || j !== 1) go(x + i * t, y + j * t, t, level + 1)
    shapes.push({ path: poly([[x + t, y + t], [x + 2 * t, y + t], [x + 2 * t, y + 2 * t], [x + t, y + 2 * t]]), c: level % 3 })
  }
  const m = SIZE * 0.02
  go(m, m, SIZE - 2 * m, 0)
  return shapes
}

// --- Tessellations -------------------------------------------------------------------------------

function hexGrid(r, fn) {
  const w = Math.sqrt(3) * r
  for (let row = -1; row * 1.5 * r < SIZE + r; row++) {
    for (let col = -1; col * w < SIZE + w; col++) {
      const x = col * w + (row % 2 ? w / 2 : 0)
      const y = row * 1.5 * r
      fn(x, y, row, col)
    }
  }
}

const hexPoints = (x, y, r, turn = Math.PI / 6) => [0, 1, 2, 3, 4, 5].map((k) => polar(x, y, r, turn + (k * Math.PI) / 3))

function hexFlowers(detail) {
  const r = [140, 100, 80][detail]
  const shapes = []
  hexGrid(r, (x, y, row, col) => {
    const base = (((col + Math.floor(row / 2)) % 3) + 3) % 3
    const pts = hexPoints(x, y, r)
    if (detail === 2) {
      for (let k = 0; k < 6; k++) shapes.push({ path: poly([[x, y], pts[k], pts[(k + 1) % 6]]), c: (base + (k % 2) * 3) % 6 })
    } else {
      shapes.push({ path: poly(pts), c: base })
    }
    if (detail > 0) shapes.push({ path: poly(hexPoints(x, y, r * 0.45, 0)), c: (base + 4) % 6 })
  })
  return shapes
}

function cubes(detail) {
  const r = [130, 90, 62][detail]
  const shapes = []
  hexGrid(r, (x, y, row) => {
    const p = hexPoints(x, y, r, Math.PI / 6)
    const set = detail === 0 ? 0 : (row % 2) * 3
    shapes.push({ path: poly([[x, y], p[3], p[4], p[5]]), c: set })
    shapes.push({ path: poly([[x, y], p[5], p[0], p[1]]), c: set + 1 })
    shapes.push({ path: poly([[x, y], p[1], p[2], p[3]]), c: set + 2 })
  })
  return shapes
}

function scales(seed) {
  return (detail) => {
    const rand = rng(seed + detail)
    const r = [120, 80, 56][detail]
    const shapes = []
    const rows = Math.ceil(SIZE / (r * 0.6)) + 2
    let above = []
    for (let row = 0; row < rows; row++) {
      const y = row * r * 0.6 - r * 0.4
      const shift = row % 2 ? r : 0
      const line = []
      for (let x = -r + shift, i = 0; x < SIZE + r; x += 2 * r, i++) {
        let col
        do col = Math.floor(rand() * 6)
        while (col === line[i - 1] || col === above[i])
        line.push(col)
        shapes.push({ path: circle(x, y, r), c: col })
        if (detail === 2) shapes.push({ path: circle(x, y + r * 0.25, r * 0.5), c: (col + 3) % 6 })
      }
      above = line
    }
    return shapes
  }
}

function pinwheels(detail) {
  const s = [200, 150, 100][detail]
  const shapes = []
  for (let y = 0; y < SIZE; y += s) {
    for (let x = 0; x < SIZE; x += s) {
      const i = Math.round(x / s)
      const j = Math.round(y / s)
      const a = [x, y]
      const b = [x + s, y]
      const c = [x + s, y + s]
      const d = [x, y + s]
      const block = ((Math.floor(i / 2) + Math.floor(j / 2)) % 3) * 2
      if (detail === 2) {
        const m = [x + s / 2, y + s / 2]
        ;[[a, b], [b, c], [c, d], [d, a]].forEach(([p, q], k) => shapes.push({ path: poly([p, q, m]), c: (block + ((k + i + j) % 2)) % 6 }))
      } else {
        // Pinwheel: the diagonal turns with the square's place in its 2×2 block.
        const turn = (i % 2) + 2 * (j % 2)
        const tri = [[a, b, d], [b, c, a], [d, a, c], [c, d, b]][turn]
        shapes.push({ path: poly([a, b, c, d]), c: block + 1 })
        shapes.push({ path: poly(tri), c: block })
      }
    }
  }
  return shapes
}

// --- The list ------------------------------------------------------------------------------------

const pack = (id) => PACKS.find((p) => p.id === id).colors.map((c) => c.hex)
const choose = (hexes, order) => order.map((i) => hexes[i])

export const PATTERNS = [
  { id: 'mandala-sunrise', name: 'Sunrise Mandala', kind: 'mandala', build: mandala(11), palette: choose(pack('sunset'), [6, 3, 5, 1, 8, 4, 9, 2]) },
  { id: 'mandala-garden', name: 'Garden Mandala', kind: 'mandala', build: mandala(23), palette: choose(pack('garden'), [5, 0, 3, 7, 4, 2, 8, 6]) },
  { id: 'mandala-sea', name: 'Sea Glass Mandala', kind: 'mandala', build: mandala(37), palette: choose(pack('ocean'), [1, 3, 4, 2, 8, 0, 6, 5]) },
  { id: 'mandala-harvest', name: 'Harvest Mandala', kind: 'mandala', build: mandala(41), palette: choose(pack('autumn'), [1, 4, 3, 6, 9, 0, 2, 7]) },
  { id: 'mandala-dream', name: 'Dreamy Mandala', kind: 'mandala', build: mandala(58), palette: choose(pack('pastel'), [7, 0, 3, 5, 2, 8, 1, 6]) },
  { id: 'mandala-quilt', name: 'Quilt Mandala', kind: 'mandala', build: mandala(64), palette: choose(pack('cottage'), [1, 6, 0, 4, 7, 5, 2, 3]) },
  { id: 'fractal-triangle', name: 'Triangle of Triangles', kind: 'fractal', build: sierpinski, palette: choose(pack('sunset'), [8, 6, 2, 4, 9, 7]) },
  { id: 'fractal-whirl', name: 'Whirling Squares', kind: 'fractal', build: whirl, palette: choose(pack('ocean'), [0, 1, 2, 3, 4, 5]) },
  { id: 'fractal-circles', name: 'Circles in Circles', kind: 'fractal', build: nestedCircles, palette: choose(pack('garden'), [6, 4, 5, 2, 7, 0]) },
  { id: 'fractal-carpet', name: 'Squares in Squares', kind: 'fractal', build: carpet, palette: choose(pack('cottage'), [7, 1, 5, 6, 3, 9]) },
  { id: 'tiles-hexagons', name: 'Honeycomb Flowers', kind: 'tessellation', build: hexFlowers, palette: choose(pack('garden'), [2, 1, 4, 0, 3, 7]) },
  { id: 'tiles-cubes', name: 'Tumbling Blocks', kind: 'tessellation', build: cubes, palette: choose(pack('cottage'), [3, 6, 7, 8, 1, 5]) },
  { id: 'tiles-scales', name: 'Fish Scales', kind: 'tessellation', build: scales(5), palette: choose(pack('ocean'), [0, 1, 2, 3, 4, 5]) },
  { id: 'tiles-pinwheels', name: 'Pinwheel Quilt', kind: 'tessellation', build: pinwheels, palette: choose(pack('autumn'), [0, 9, 3, 8, 6, 2]) },
]

// Draws a pattern's outlines and its colored-in version. size: the canvases' side in pixels.
// Returns the Color by Number palette (the last entry, white, is the background: no number).
export function drawPattern(pattern, detail, linesCtx, colorsCtx, size = SIZE) {
  const shapes = pattern.build(detail)
  const colorsUsed = Math.max(...shapes.map((s) => s.c)) + 1
  const palette = [...pattern.palette.slice(0, colorsUsed), WHITE]
  const scale = size / SIZE
  for (const [ctx, fill] of [[linesCtx, false], [colorsCtx, true]]) {
    if (!ctx) continue
    ctx.save()
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.fillStyle = WHITE
    ctx.fillRect(0, 0, SIZE, SIZE)
    ctx.lineJoin = 'round'
    for (const s of shapes) {
      ctx.fillStyle = fill ? pattern.palette[s.c % pattern.palette.length] : WHITE
      ctx.fill(s.path)
      if (!fill) {
        ctx.strokeStyle = '#2b2622'
        ctx.lineWidth = LINE[detail]
        ctx.stroke(s.path)
      }
    }
    ctx.restore()
  }
  return { palette, blank: [palette.length - 1] }
}
