// The coloring engine: turns line art into cells you can tap to fill.
//
// Every picture arrives as two images of the same size:
//   lines   dark outlines on white (the drawing to color in)
//   colors  the same picture colored in, used only to decide each cell's Color by Number color
// The white areas between the lines become cells. Each cell also owns the half of the outline
// next to it, so a fill reaches right up under the line with no white gap.
//
// Cells are found again from the pictures every time one opens, so saves remember a cell by a
// point inside it (its label point), never by its number.

const INK_LINE = 110 // how dark (0-255) a pixel must be to count as outline
const SPECK = 14 // smaller white bits than this (pixels) are holes in the outline, not cells
const HIDE_REACH = 7 // how far (pixels) a merged-away outline is hidden from where cells meet

// lines, colors: ImageData-like { data, width, height }. palette: ['#rrggbb', ...].
// mergeBelow: cells smaller than this share of the picture join their neighbor (Easy/Cozy).
// blank: palette indexes that mean "leave white" (no number, counts as done).
export function buildCells({ lines, colors, palette, mergeBelow = 0, blank = [] }) {
  const w = lines.width
  const h = lines.height
  const n = w * h
  const ink = new Uint8Array(n)
  const isLine = new Uint8Array(n)
  const L = lines.data
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const lum = 0.3 * L[i] + 0.59 * L[i + 1] + 0.11 * L[i + 2]
    const a = L[i + 3] / 255
    const v = Math.round((255 - lum) * a)
    ink[p] = v
    if (v > INK_LINE) isLine[p] = 1
  }

  // 1. The white areas: flood each one (4-way, so a diagonal crack in a line doesn't leak).
  let region = new Int32Array(n).fill(-1)
  let areas = []
  const stack = new Int32Array(n)
  for (let s = 0; s < n; s++) {
    if (isLine[s] || region[s] !== -1) continue
    const id = areas.length
    let top = 0
    let area = 0
    stack[top++] = s
    region[s] = id
    while (top) {
      const p = stack[--top]
      area++
      const x = p % w
      if (x > 0 && !isLine[p - 1] && region[p - 1] === -1) (region[p - 1] = id), (stack[top++] = p - 1)
      if (x < w - 1 && !isLine[p + 1] && region[p + 1] === -1) (region[p + 1] = id), (stack[top++] = p + 1)
      if (p >= w && !isLine[p - w] && region[p - w] === -1) (region[p - w] = id), (stack[top++] = p - w)
      if (p < n - w && !isLine[p + w] && region[p + w] === -1) (region[p + w] = id), (stack[top++] = p + w)
    }
    areas.push(area)
  }

  // 2. Specks become part of the outline.
  const alive = areas.map((a) => a >= SPECK)
  for (let p = 0; p < n; p++) {
    if (region[p] !== -1 && !alive[region[p]]) {
      region[p] = -1
      isLine[p] = 1
    }
  }

  // 3. Each outline pixel belongs to the nearest area (spreading out from the areas).
  const owner = region.slice()
  let head = 0
  let tail = 0
  for (let p = 0; p < n; p++) if (owner[p] !== -1) stack[tail++] = p
  while (head < tail) {
    const p = stack[head++]
    const o = owner[p]
    const x = p % w
    if (x > 0 && owner[p - 1] === -1) (owner[p - 1] = o), (stack[tail++] = p - 1)
    if (x < w - 1 && owner[p + 1] === -1) (owner[p + 1] = o), (stack[tail++] = p + 1)
    if (p >= w && owner[p - w] === -1) (owner[p - w] = o), (stack[tail++] = p - w)
    if (p < n - w && owner[p + w] === -1) (owner[p + w] = o), (stack[tail++] = p + w)
  }

  // 4. Which areas touch, and how much. Then small areas join the neighbor they touch most.
  const count = areas.length
  const parent = Int32Array.from({ length: count }, (_, i) => i)
  const find = (a) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]]
    return a
  }
  if (mergeBelow > 0) {
    const touch = new Map()
    const note = (a, b) => {
      if (a === b || a === -1 || b === -1) return
      const key = a < b ? a * count + b : b * count + a
      touch.set(key, (touch.get(key) || 0) + 1)
    }
    for (let p = 0; p < n; p++) {
      if ((p % w) < w - 1) note(owner[p], owner[p + 1])
      if (p < n - w) note(owner[p], owner[p + w])
    }
    const neighbors = Array.from({ length: count }, () => [])
    for (const [key, len] of touch) {
      const a = Math.floor(key / count)
      const b = key % count
      neighbors[a].push([b, len])
      neighbors[b].push([a, len])
    }
    const total = areas.slice()
    const limit = mergeBelow * n
    const order = [...areas.keys()].filter((i) => alive[i]).sort((a, b) => areas[a] - areas[b] || a - b)
    for (const r of order) {
      const root = find(r)
      if (total[root] >= limit) continue
      let best = -1
      let bestLen = 0
      for (const [b, len] of neighbors[r]) {
        if (find(b) !== root && (len > bestLen || (len === bestLen && b < best))) (best = b), (bestLen = len)
      }
      if (best === -1) continue
      const other = find(best)
      parent[root] = other
      total[other] += total[root]
    }
  }

  // 5. Number the cells in reading order (top-left first), so the numbering never wobbles.
  const cellOfRoot = new Int32Array(count).fill(-1)
  const cellOf = new Int32Array(n).fill(-1)
  let cellCount = 0
  for (let p = 0; p < n; p++) {
    const o = owner[p]
    if (o === -1) continue
    const root = find(o)
    if (cellOfRoot[root] === -1) cellOfRoot[root] = cellCount++
    cellOf[p] = cellOfRoot[root]
  }

  // 6. Outlines between areas that merged fade away; outlines between real cells stay.
  // (A stroke inside one area, like a whisker, touches no border, so it stays too.)
  const near = (seedTest) => {
    const dist = new Uint8Array(n).fill(255)
    let qh = 0
    let qt = 0
    for (let p = 0; p < n; p++) {
      if (!isLine[p] || owner[p] === -1) continue
      if (seedTest(p)) (dist[p] = 0), (stack[qt++] = p)
    }
    while (qh < qt) {
      const p = stack[qh++]
      const d = dist[p] + 1
      if (d > HIDE_REACH) continue
      const x = p % w
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= n || !isLine[q] || dist[q] <= d) continue
        dist[q] = d
        stack[qt++] = q
      }
    }
    return dist
  }
  const borderWith = (p, sameCell) => {
    const x = p % w
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (q < 0 || q >= n || owner[q] === -1 || owner[q] === owner[p]) continue
      if ((cellOf[q] === cellOf[p]) === sameCell) return true
    }
    return false
  }
  const lineAlpha = ink
  if (mergeBelow > 0) {
    const nearMerged = near((p) => borderWith(p, true))
    const nearReal = near((p) => borderWith(p, false))
    for (let p = 0; p < n; p++) {
      if (isLine[p] && nearMerged[p] !== 255 && nearReal[p] === 255) lineAlpha[p] = 0
    }
  }

  // 7. Each cell's pixels, grouped for fast filling, and its bounding box.
  const cellStart = new Int32Array(cellCount + 1)
  for (let p = 0; p < n; p++) if (cellOf[p] !== -1) cellStart[cellOf[p] + 1]++
  for (let c = 0; c < cellCount; c++) cellStart[c + 1] += cellStart[c]
  const fillAt = cellStart.slice(0, cellCount)
  const cellPixels = new Int32Array(cellStart[cellCount])
  const box = new Int32Array(cellCount * 4)
  for (let c = 0; c < cellCount; c++) box.set([w, h, -1, -1], c * 4)
  for (let p = 0; p < n; p++) {
    const c = cellOf[p]
    if (c === -1) continue
    cellPixels[fillAt[c]++] = p
    const x = p % w
    const y = (p - x) / w
    const b = c * 4
    if (x < box[b]) box[b] = x
    if (y < box[b + 1]) box[b + 1] = y
    if (x > box[b + 2]) box[b + 2] = x
    if (y > box[b + 3]) box[b + 3] = y
  }

  // 8. Where each cell's number goes: the spot farthest from any outline (two-pass distance).
  const dist = new Float32Array(n)
  for (let p = 0; p < n; p++) dist[p] = isLine[p] ? 0 : 1e6
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (!dist[p]) continue
      let d = dist[p]
      if (x > 0) d = Math.min(d, dist[p - 1] + 1)
      else d = Math.min(d, 1)
      if (y > 0) d = Math.min(d, dist[p - w] + 1)
      else d = Math.min(d, 1)
      if (x > 0 && y > 0) d = Math.min(d, dist[p - w - 1] + 1.4)
      if (x < w - 1 && y > 0) d = Math.min(d, dist[p - w + 1] + 1.4)
      dist[p] = d
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x
      if (!dist[p]) continue
      let d = dist[p]
      d = Math.min(d, x < w - 1 ? dist[p + 1] + 1 : 1)
      d = Math.min(d, y < h - 1 ? dist[p + w] + 1 : 1)
      if (x < w - 1 && y < h - 1) d = Math.min(d, dist[p + w + 1] + 1.4)
      if (x > 0 && y < h - 1) d = Math.min(d, dist[p + w - 1] + 1.4)
      dist[p] = d
    }
  }
  const labelX = new Int32Array(cellCount)
  const labelY = new Int32Array(cellCount)
  const labelR = new Float32Array(cellCount)
  for (let c = 0; c < cellCount; c++) {
    let best = -1
    let bestD = -1
    for (let i = cellStart[c]; i < cellStart[c + 1]; i++) {
      const p = cellPixels[i]
      if (dist[p] > bestD) (bestD = dist[p]), (best = p)
    }
    labelX[c] = best % w
    labelY[c] = Math.floor(best / w)
    labelR[c] = bestD
  }

  // 9. Each cell's Color by Number color: the palette color most of it has in the colored picture.
  const pal = palette.map(hexToRgb)
  const target = new Int16Array(cellCount)
  const C = colors.data
  const votes = new Float64Array(pal.length)
  const nearestCache = new Map()
  const nearest = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b
    let k = nearestCache.get(key)
    if (k !== undefined) return k
    let bestD = Infinity
    k = 0
    for (let j = 0; j < pal.length; j++) {
      const dr = r - pal[j][0]
      const dg = g - pal[j][1]
      const db = b - pal[j][2]
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db
      if (d < bestD) (bestD = d), (k = j)
    }
    nearestCache.set(key, k)
    return k
  }
  for (let c = 0; c < cellCount; c++) {
    votes.fill(0)
    for (let i = cellStart[c]; i < cellStart[c + 1]; i++) {
      const p = cellPixels[i]
      if (isLine[p]) continue
      const j = p * 4
      votes[nearest(C[j], C[j + 1], C[j + 2])] += 1
    }
    let k = 0
    for (let j = 1; j < pal.length; j++) if (votes[j] > votes[k]) k = j
    target[c] = k
  }

  return {
    width: w,
    height: h,
    cellCount,
    cellOf,
    cellStart,
    cellPixels,
    box,
    labelX,
    labelY,
    labelR,
    target,
    blank: new Set(blank),
    lineAlpha,
    palette,
  }
}

export function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
