// Turns a photo into a coloring picture: the outlines to color in and the colored answer key.
//
//   1. Soften: a Kuwahara filter flattens grain and texture into smooth patches while keeping
//      strong edges, which is what gives the painted / cartoon look.
//   2. Fewer colors: k-means in Lab color space (distances there match what eyes see) picks the
//      palette, and every pixel takes its nearest palette color.
//   3. Tidy: patches smaller than the smallest cell join the neighbor they share most edge with,
//      unless they stand out strongly (a bright sun, a dark eye): those may be a tenth the size.
//   4. Round: a majority vote over a small circle rounds off jagged corners and wiggles; tidy
//      again afterwards, since rounding can leave crumbs.
//   5. Outline: a line wherever two colors meet, drawn with a soft edge at the chosen thickness.
//
// Everything is seeded, so the same photo and settings always give the same picture.

export const PRESETS = {
  easy: { colors: 8, soften: 7, passes: 2, smallest: 0.0025, round: 4, line: 5 },
  cozy: { colors: 14, soften: 4, passes: 2, smallest: 0.0008, round: 2, line: 3 },
  detailed: { colors: 24, soften: 2, passes: 1, smallest: 0.00022, round: 1, line: 2 },
}

export const SETTING_NOTES = {
  colors: 'How many colors (numbers) the picture uses',
  soften: 'Smooths texture into flat patches: higher looks more like a cartoon',
  passes: 'How many times to soften',
  smallest: 'The smallest cell, as a share of the picture',
  round: 'Rounds off sharp corners and wiggly edges',
  line: 'Thickness of the dividing lines, in pixels',
}

const INK = [43, 38, 34]

// photo: ImageData. Returns { lines, colors (ImageData), palette ['#rrggbb'] }.
export function photoToPicture(photo, s) {
  const { width: w, height: h } = photo
  let rgb = new Float32Array(w * h * 3)
  for (let p = 0; p < w * h; p++) {
    rgb[p * 3] = photo.data[p * 4]
    rgb[p * 3 + 1] = photo.data[p * 4 + 1]
    rgb[p * 3 + 2] = photo.data[p * 4 + 2]
  }
  for (let i = 0; i < s.passes; i++) if (s.soften > 0) rgb = kuwahara(rgb, w, h, s.soften)
  const { centers, cls } = quantize(rgb, w, h, s.colors)
  const smallest = Math.max(12, Math.round(s.smallest * w * h))
  const lab = centers.map((c) => toLab(...c))
  tidy(cls, w, h, smallest, lab)
  if (s.round > 0) {
    roundOff(cls, w, h, s.round, centers.length)
    tidy(cls, w, h, smallest, lab)
  }
  // Palette in a pleasant order (by hue, then lightness), with unused colors dropped.
  const used = new Set(cls)
  const order = [...used].sort((a, b) => sortKey(centers[a]) - sortKey(centers[b]))
  const remap = new Int16Array(centers.length).fill(-1)
  order.forEach((c, i) => (remap[c] = i))
  for (let p = 0; p < cls.length; p++) cls[p] = remap[cls[p]]
  const palette = order.map((c) => toHex(centers[c]))
  return { lines: outlines(cls, w, h, s.line), colors: paint(cls, w, h, order.map((c) => centers[c])), palette }
}

// --- 1. Soften (Kuwahara with summed-area tables, so any radius costs the same) ---------------

function kuwahara(rgb, w, h, r) {
  const W = w + 1
  const sum = [0, 1, 2, 3, 4].map(() => new Float64Array(W * (h + 1)))
  const [SL, SL2, SR, SG, SB] = sum
  for (let y = 0; y < h; y++) {
    let l = 0, l2 = 0, cr = 0, cg = 0, cb = 0
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      const lum = 0.3 * rgb[i] + 0.59 * rgb[i + 1] + 0.11 * rgb[i + 2]
      l += lum
      l2 += lum * lum
      cr += rgb[i]
      cg += rgb[i + 1]
      cb += rgb[i + 2]
      const k = (y + 1) * W + x + 1
      const up = y * W + x + 1
      SL[k] = SL[up] + l
      SL2[k] = SL2[up] + l2
      SR[k] = SR[up] + cr
      SG[k] = SG[up] + cg
      SB[k] = SB[up] + cb
    }
  }
  const box = (S, x0, y0, x1, y1) => S[(y1 + 1) * W + x1 + 1] - S[y0 * W + x1 + 1] - S[(y1 + 1) * W + x0] + S[y0 * W + x0]
  const out = new Float32Array(rgb.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity
      let pick = null
      for (const [x0, y0, x1, y1] of [
        [x - r, y - r, x, y],
        [x, y - r, x + r, y],
        [x - r, y, x, y + r],
        [x, y, x + r, y + r],
      ]) {
        const ax = Math.max(0, x0), ay = Math.max(0, y0), bx = Math.min(w - 1, x1), by = Math.min(h - 1, y1)
        const n = (bx - ax + 1) * (by - ay + 1)
        const mean = box(SL, ax, ay, bx, by) / n
        const variance = box(SL2, ax, ay, bx, by) / n - mean * mean
        if (variance < best) {
          best = variance
          pick = [ax, ay, bx, by, n]
        }
      }
      const [ax, ay, bx, by, n] = pick
      const i = (y * w + x) * 3
      out[i] = box(SR, ax, ay, bx, by) / n
      out[i + 1] = box(SG, ax, ay, bx, by) / n
      out[i + 2] = box(SB, ax, ay, bx, by) / n
    }
  }
  return out
}

// --- 2. Fewer colors (k-means in Lab) ---------------------------------------------------------

function toLab(r, g, b) {
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const R = lin(r), G = lin(g), B = lin(b)
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047)
  const Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B)
  const Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883)
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]
}

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function quantize(rgb, w, h, k) {
  const n = w * h
  const step = Math.max(1, Math.floor(n / 60000))
  const sample = []
  for (let p = 0; p < n; p += step) sample.push([rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2], ...toLab(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2])])
  const d2 = (a, b) => (a[3] - b[3]) ** 2 + (a[4] - b[4]) ** 2 + (a[5] - b[5]) ** 2
  // k-means++ start, seeded.
  const rand = rng(7)
  const centers = [sample[Math.floor(rand() * sample.length)]]
  const near = sample.map((s) => d2(s, centers[0]))
  while (centers.length < k) {
    const total = near.reduce((a, b) => a + b, 0)
    let t = rand() * total
    let i = 0
    while (i < sample.length - 1 && (t -= near[i]) > 0) i++
    centers.push(sample[i])
    sample.forEach((s, j) => (near[j] = Math.min(near[j], d2(s, sample[i]))))
  }
  let cs = centers.map((c) => c.slice())
  for (let round = 0; round < 16; round++) {
    const acc = cs.map(() => [0, 0, 0, 0, 0, 0, 0])
    for (const s of sample) {
      let best = 0
      let bd = Infinity
      for (let j = 0; j < cs.length; j++) {
        const d = d2(s, cs[j])
        if (d < bd) (bd = d), (best = j)
      }
      const a = acc[best]
      for (let q = 0; q < 6; q++) a[q] += s[q]
      a[6]++
    }
    cs = cs.map((c, j) => (acc[j][6] ? acc[j].slice(0, 6).map((v) => v / acc[j][6]) : c))
  }
  // Small but striking colors (a bright sun, a red berry) are too few to win a color of their own,
  // so give them one: merge the two most alike colors to keep the count, then add the striking one.
  for (let extra = 0; extra < 2 && cs.length >= 4; extra++) {
    const misfits = sample.filter((s) => Math.min(...cs.map((c) => d2(s, c))) > 28 * 28)
    if (misfits.length < sample.length * 0.0003) break
    const mean = [0, 1, 2, 3, 4, 5].map((q) => misfits.reduce((a, m) => a + m[q], 0) / misfits.length)
    let pair = [0, 1]
    let closest = Infinity
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (d2(cs[i], cs[j]) < closest) (closest = d2(cs[i], cs[j])), (pair = [i, j])
    const [i, j] = pair
    cs[i] = cs[i].map((v, q) => (v + cs[j][q]) / 2)
    cs[j] = mean
  }
  // Every pixel to its nearest color (cached by 6-bit color, plenty for a photo).
  const cache = new Int16Array(1 << 18).fill(-1)
  const cls = new Int16Array(n)
  for (let p = 0; p < n; p++) {
    const r = rgb[p * 3], g = rgb[p * 3 + 1], b = rgb[p * 3 + 2]
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2)
    let c = cache[key]
    if (c === -1) {
      const lab = toLab(r, g, b)
      let bd = Infinity
      for (let j = 0; j < cs.length; j++) {
        const d = (lab[0] - cs[j][3]) ** 2 + (lab[1] - cs[j][4]) ** 2 + (lab[2] - cs[j][5]) ** 2
        if (d < bd) (bd = d), (c = j)
      }
      cache[key] = c
    }
    cls[p] = c
  }
  return { centers: cs.map((c) => [c[0], c[1], c[2]]), cls }
}

// --- 3. Tidy: small patches join their best neighbor ------------------------------------------

const STANDS_OUT = 38 // Lab distance from every neighbor that counts as standing out

function tidy(cls, w, h, smallest, lab) {
  const n = w * h
  for (let round = 0; round < 6; round++) {
    const comp = new Int32Array(n).fill(-1)
    const sizes = []
    const colorOf = []
    const stack = new Int32Array(n)
    for (let s = 0; s < n; s++) {
      if (comp[s] !== -1) continue
      const id = sizes.length
      const c = cls[s]
      let top = 0
      let size = 0
      stack[top++] = s
      comp[s] = id
      while (top) {
        const p = stack[--top]
        size++
        const x = p % w
        if (x > 0 && comp[p - 1] === -1 && cls[p - 1] === c) (comp[p - 1] = id), (stack[top++] = p - 1)
        if (x < w - 1 && comp[p + 1] === -1 && cls[p + 1] === c) (comp[p + 1] = id), (stack[top++] = p + 1)
        if (p >= w && comp[p - w] === -1 && cls[p - w] === c) (comp[p - w] = id), (stack[top++] = p - w)
        if (p < n - w && comp[p + w] === -1 && cls[p + w] === c) (comp[p + w] = id), (stack[top++] = p + w)
      }
      sizes.push(size)
      colorOf.push(c)
    }
    const small = sizes.map((s) => s < smallest)
    if (!small.some(Boolean)) return
    const far = (a, b) => Math.hypot(lab[a][0] - lab[b][0], lab[a][1] - lab[b][1], lab[a][2] - lab[b][2])
    // Shared edge lengths between each small patch and its neighbors.
    const edges = new Map()
    const note = (a, b) => {
      if (a === b) return
      if (small[a]) edges.set(a * 4294967296 + b, (edges.get(a * 4294967296 + b) || 0) + 1)
      if (small[b]) edges.set(b * 4294967296 + a, (edges.get(b * 4294967296 + a) || 0) + 1)
    }
    for (let p = 0; p < n; p++) {
      if (p % w < w - 1) note(comp[p], comp[p + 1])
      if (p < n - w) note(comp[p], comp[p + w])
    }
    const best = new Map()
    const closest = new Map() // each small patch's least different neighbor color
    for (const [key] of edges) {
      const a = Math.floor(key / 4294967296)
      const b = key % 4294967296
      const d = far(colorOf[a], colorOf[b])
      if (!closest.has(a) || d < closest.get(a)) closest.set(a, d)
    }
    for (const [key, len] of edges) {
      const a = Math.floor(key / 4294967296)
      const b = key % 4294967296
      if (closest.get(a) > STANDS_OUT && sizes[a] >= smallest / 10) continue
      const cur = best.get(a)
      // Prefer the neighbor with the longest shared edge; ties go to the bigger neighbor.
      if (!cur || len > cur.len || (len === cur.len && sizes[b] > sizes[cur.b])) best.set(a, { b, len })
    }
    // Smallest first; a patch joins a neighbor that isn't also joining something this round.
    const newColor = colorOf.slice()
    const moving = new Set()
    for (const a of [...best.keys()].sort((x, y) => sizes[x] - sizes[y])) {
      const { b } = best.get(a)
      if (moving.has(b)) continue
      newColor[a] = colorOf[b]
      moving.add(a)
    }
    for (let p = 0; p < n; p++) cls[p] = newColor[comp[p]]
  }
}

// --- 4. Round off corners: majority vote over a small circle ----------------------------------

function roundOff(cls, w, h, r, k) {
  const src = cls.slice()
  const votes = new Int32Array(k)
  const offsets = []
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) offsets.push([dx, dy])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      // Inside a patch nothing changes: skip quickly when the four far neighbors agree.
      const c = src[p]
      if (
        x >= r && y >= r && x < w - r && y < h - r &&
        src[p - r] === c && src[p + r] === c && src[p - r * w] === c && src[p + r * w] === c
      ) continue
      votes.fill(0)
      for (const [dx, dy] of offsets) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        votes[src[yy * w + xx]]++
      }
      let best = c
      for (let j = 0; j < k; j++) if (votes[j] > votes[best]) best = j
      cls[p] = best
    }
  }
}

// --- 5. Outlines and the colored key ----------------------------------------------------------

function outlines(cls, w, h, thickness) {
  const n = w * h
  // Distance to the nearest place two colors meet (0 on the edge pixels themselves).
  const d = new Float32Array(n).fill(1e6)
  for (let p = 0; p < n; p++) {
    const x = p % w
    if ((x < w - 1 && cls[p + 1] !== cls[p]) || (p < n - w && cls[p + w] !== cls[p])) d[p] = 0
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (x) d[p] = Math.min(d[p], d[p - 1] + 1)
      if (y) d[p] = Math.min(d[p], d[p - w] + 1)
      if (x && y) d[p] = Math.min(d[p], d[p - w - 1] + 1.414)
      if (x < w - 1 && y) d[p] = Math.min(d[p], d[p - w + 1] + 1.414)
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x
      if (x < w - 1) d[p] = Math.min(d[p], d[p + 1] + 1)
      if (y < h - 1) d[p] = Math.min(d[p], d[p + w] + 1)
      if (x < w - 1 && y < h - 1) d[p] = Math.min(d[p], d[p + w + 1] + 1.414)
      if (x && y < h - 1) d[p] = Math.min(d[p], d[p + w - 1] + 1.414)
    }
  const img = new ImageData(w, h)
  // The edge pixels are always solid, so cells stay apart; the rest fades out smoothly.
  const half = Math.max(0.5, thickness / 2)
  for (let p = 0; p < n; p++) {
    const a = d[p] === 0 ? 1 : Math.max(0, Math.min(1, half + 0.5 - d[p]))
    img.data[p * 4] = 255 - a * (255 - INK[0])
    img.data[p * 4 + 1] = 255 - a * (255 - INK[1])
    img.data[p * 4 + 2] = 255 - a * (255 - INK[2])
    img.data[p * 4 + 3] = 255
  }
  return img
}

function paint(cls, w, h, colors) {
  const img = new ImageData(w, h)
  for (let p = 0; p < w * h; p++) {
    const c = colors[cls[p]]
    img.data[p * 4] = c[0]
    img.data[p * 4 + 1] = c[1]
    img.data[p * 4 + 2] = c[2]
    img.data[p * 4 + 3] = 255
  }
  return img
}

const toHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

function sortKey([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 510
  if (max - min < 18) return 1000 + l // grays and near-whites last, dark to light
  let hue
  if (max === r) hue = ((g - b) / (max - min) + 6) % 6
  else if (max === g) hue = (b - r) / (max - min) + 2
  else hue = (r - g) / (max - min) + 4
  return Math.floor(hue * 2) * 10 + l
}
