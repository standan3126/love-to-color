// The coloring stage: shows a picture's cells and outlines, zooms and pans, and reports taps.
//
//   one finger tap      color the cell under it
//   one finger drag     move around (when zoomed in)
//   two fingers         pinch to zoom, drag to move
//   mouse wheel         zoom (on a computer)
//
// The picture is drawn onto a screen-sized canvas each frame from two full-size canvases (fills
// and outlines), so it stays sharp and light on memory at any zoom. Numbers are drawn at screen
// size on top, so they're crisp, and only appear once they're big enough to read.
import { hexToRgb } from './engine.js'

const TAP_MOVE = 10 // pixels a finger may move and still count as a tap
const TAP_TIME = 600 // ms
const MAX_ZOOM = 14 // times the fitted size
const INK = [43, 38, 34]
const PAPER = [255, 255, 255]
// Unfilled cells of the chosen number get soft stripes, easy to spot on white paper.
const STRIPE_A = [184, 200, 222]
const STRIPE_B = [222, 230, 241]
const STRIPE = 7 // stripe width, in picture pixels

export class Stage {
  constructor(host, cells, { onTap }) {
    this.host = host
    this.cells = cells
    this.onTap = onTap
    const { width: w, height: h } = cells
    this.fillCanvas = Object.assign(document.createElement('canvas'), { width: w, height: h })
    this.fillCtx = this.fillCanvas.getContext('2d')
    this.fill = this.fillCtx.createImageData(w, h)
    this.fill.data.fill(255)
    this.fillCtx.putImageData(this.fill, 0, 0)
    this.lineCanvas = Object.assign(document.createElement('canvas'), { width: w, height: h })
    const lines = this.lineCanvas.getContext('2d').createImageData(w, h)
    for (let p = 0, k = 0; p < w * h; p++, k += 4) {
      lines.data[k] = INK[0]
      lines.data[k + 1] = INK[1]
      lines.data[k + 2] = INK[2]
      lines.data[k + 3] = cells.lineAlpha[p]
    }
    this.lineCanvas.getContext('2d').putImageData(lines, 0, 0)

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'stage-canvas'
    this.ctx = this.canvas.getContext('2d')
    host.replaceChildren(this.canvas)
    this.colors = new Array(cells.cellCount).fill(null) // '#rrggbb' or null
    this.tinted = new Uint8Array(cells.cellCount)
    this.numberOf = () => null
    this.dirty = null
    this.pointers = new Map()
    this.listen()
    this.resize()
    new ResizeObserver(() => this.resize()).observe(host)
  }

  // --- Colors ----------------------------------------------------------------------------------

  setColor(cell, hex) {
    this.colors[cell] = hex
    this.paint(cell)
  }

  // Shade (or unshade) unfilled cells, e.g. every cell of the chosen number.
  setTinted(test) {
    for (let c = 0; c < this.cells.cellCount; c++) {
      const t = test(c) ? 1 : 0
      if (t !== this.tinted[c]) {
        this.tinted[c] = t
        if (!this.colors[c]) this.paint(c)
      }
    }
  }

  paint(cell) {
    const { cellStart, cellPixels, box } = this.cells
    const d = this.fill.data
    if (!this.colors[cell] && this.tinted[cell]) {
      const w = this.cells.width
      for (let i = cellStart[cell]; i < cellStart[cell + 1]; i++) {
        const p = cellPixels[i]
        const x = p % w
        const rgb = Math.floor((x + (p - x) / w) / STRIPE) % 2 ? STRIPE_A : STRIPE_B
        const k = p * 4
        d[k] = rgb[0]
        d[k + 1] = rgb[1]
        d[k + 2] = rgb[2]
      }
    } else {
      const rgb = this.colors[cell] ? hexToRgb(this.colors[cell]) : PAPER
      for (let i = cellStart[cell]; i < cellStart[cell + 1]; i++) {
        const k = cellPixels[i] * 4
        d[k] = rgb[0]
        d[k + 1] = rgb[1]
        d[k + 2] = rgb[2]
      }
    }
    const b = cell * 4
    this.markDirty(box[b], box[b + 1], box[b + 2], box[b + 3])
  }

  markDirty(x0, y0, x1, y1) {
    const d = this.dirty
    this.dirty = d ? [Math.min(d[0], x0), Math.min(d[1], y0), Math.max(d[2], x1), Math.max(d[3], y1)] : [x0, y0, x1, y1]
    this.draw()
  }

  // The whole picture at full size (for saving to Photos), or small (for the gallery).
  // Only the colors put in: no highlight stripes.
  snapshot(maxSide = 0) {
    const { width: w, height: h, cellStart, cellPixels } = this.cells
    const plain = new ImageData(w, h)
    plain.data.fill(255)
    this.colors.forEach((hex, cell) => {
      if (!hex) return
      const [r, g, b] = hexToRgb(hex)
      for (let i = cellStart[cell]; i < cellStart[cell + 1]; i++) {
        const q = cellPixels[i] * 4
        plain.data[q] = r
        plain.data[q + 1] = g
        plain.data[q + 2] = b
      }
    })
    const fills = Object.assign(document.createElement('canvas'), { width: w, height: h })
    fills.getContext('2d').putImageData(plain, 0, 0)
    const k = maxSide ? Math.min(1, maxSide / Math.max(w, h)) : 1
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(w * k), height: Math.round(h * k) })
    const g = c.getContext('2d')
    g.imageSmoothingQuality = 'high'
    g.drawImage(fills, 0, 0, c.width, c.height)
    g.drawImage(this.lineCanvas, 0, 0, c.width, c.height)
    return c
  }

  // --- Drawing ---------------------------------------------------------------------------------

  flush() {
    if (!this.dirty) return
    const [x0, y0, x1, y1] = this.dirty
    this.fillCtx.putImageData(this.fill, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1)
    this.dirty = null
  }

  draw() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  render() {
    this.flush()
    const { ctx, dpr, s, tx, ty } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = s > 1.5 ? 'low' : 'high'
    ctx.drawImage(this.fillCanvas, 0, 0)
    ctx.drawImage(this.lineCanvas, 0, 0)
    // Numbers, sized to their cell and skipped while too small to read.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const { labelX, labelY, labelR, cellCount } = this.cells
    for (let c = 0; c < cellCount; c++) {
      if (this.colors[c]) continue
      const text = this.numberOf(c)
      if (text == null) continue
      const size = Math.min(26, labelR[c] * s * 1.15)
      if (size < 8) continue
      const x = tx + labelX[c] * s
      const y = ty + labelY[c] * s
      if (x < -20 || y < -20 || x > this.vw + 20 || y > this.vh + 20) continue
      ctx.font = `${this.tinted[c] ? 700 : 500} ${size.toFixed(1)}px system-ui, sans-serif`
      ctx.fillStyle = this.tinted[c] ? '#3b3a34' : '#8a857c'
      ctx.fillText(text, x, y + size * 0.04)
    }
  }

  // --- Zoom and pan ----------------------------------------------------------------------------

  resize() {
    const r = this.host.getBoundingClientRect()
    if (!r.width || !r.height) return
    this.dpr = Math.min(devicePixelRatio || 1, 3)
    this.vw = r.width
    this.vh = r.height
    this.canvas.width = Math.round(r.width * this.dpr)
    this.canvas.height = Math.round(r.height * this.dpr)
    const fitBefore = this.fitScale
    this.fitScale = Math.min(r.width / this.cells.width, r.height / this.cells.height) * 0.96
    if (!fitBefore || this.s <= fitBefore * 1.001) this.fit()
    else this.clamp()
    this.render()
  }

  fit() {
    this.s = this.fitScale
    this.tx = (this.vw - this.cells.width * this.s) / 2
    this.ty = (this.vh - this.cells.height * this.s) / 2
    this.draw()
  }

  get zoom() {
    return this.s / this.fitScale
  }

  // Zoom by a factor around a point on screen (default: the middle).
  zoomBy(f, cx = this.vw / 2, cy = this.vh / 2) {
    const s = Math.min(this.fitScale * MAX_ZOOM, Math.max(this.fitScale, this.s * f))
    const ix = (cx - this.tx) / this.s
    const iy = (cy - this.ty) / this.s
    this.s = s
    this.tx = cx - ix * s
    this.ty = cy - iy * s
    this.clamp()
    this.draw()
  }

  // Keep the picture on screen: centered while it's smaller than the view, edge to edge after.
  clamp() {
    const iw = this.cells.width * this.s
    const ih = this.cells.height * this.s
    const pad = 40
    this.tx = iw <= this.vw ? (this.vw - iw) / 2 : Math.min(pad, Math.max(this.vw - iw - pad, this.tx))
    this.ty = ih <= this.vh ? (this.vh - ih) / 2 : Math.min(pad, Math.max(this.vh - ih - pad, this.ty))
  }

  // Shows a cell in the middle of the screen, zoomed in enough to see it.
  showCell(cell) {
    const b = cell * 4
    const { box } = this.cells
    const cw = box[b + 2] - box[b] + 1
    const ch = box[b + 3] - box[b + 1] + 1
    const want = Math.min(this.vw / (cw * 3), this.vh / (ch * 3))
    this.s = Math.min(this.fitScale * MAX_ZOOM, Math.max(this.s, Math.min(want, this.fitScale * 6)))
    // Center on the cell's number spot: always inside the cell, even for a ring.
    this.tx = this.vw / 2 - (this.cells.labelX[cell] + 0.5) * this.s
    this.ty = this.vh / 2 - (this.cells.labelY[cell] + 0.5) * this.s
    this.clamp()
    this.draw()
  }

  // Where a cell's number spot is on screen (used by the tests).
  screenPoint(cell) {
    const r = this.canvas.getBoundingClientRect()
    return [r.left + this.tx + (this.cells.labelX[cell] + 0.5) * this.s, r.top + this.ty + (this.cells.labelY[cell] + 0.5) * this.s]
  }

  cellAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect()
    const x = Math.floor((clientX - r.left - this.tx) / this.s)
    const y = Math.floor((clientY - r.top - this.ty) / this.s)
    if (x < 0 || y < 0 || x >= this.cells.width || y >= this.cells.height) return -1
    return this.cells.cellOf[y * this.cells.width + x]
  }

  listen() {
    const el = this.canvas
    const local = (e) => {
      const r = el.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId)
      const [x, y] = local(e)
      this.pointers.set(e.pointerId, { x, y })
      if (this.pointers.size === 1) this.tap = { x, y, t: performance.now(), ok: true }
      else this.tap = null
      this.gesture = null
    })
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId)
      if (!p) return
      const [x, y] = local(e)
      if (this.pointers.size === 1) {
        if (this.tap && Math.hypot(x - this.tap.x, y - this.tap.y) > TAP_MOVE) this.tap.ok = false
        if (!this.tap?.ok) {
          this.tx += x - p.x
          this.ty += y - p.y
          this.clamp()
          this.draw()
        }
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]
        if (!this.gesture) {
          this.gesture = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: this.s, tx: this.tx, ty: this.ty }
        }
        p.x = x
        p.y = y
        const [a2, b2] = [...this.pointers.values()]
        const g = this.gesture
        const d = Math.hypot(a2.x - b2.x, a2.y - b2.y)
        const mx = (a2.x + b2.x) / 2
        const my = (a2.y + b2.y) / 2
        const s = Math.min(this.fitScale * MAX_ZOOM, Math.max(this.fitScale, (g.s * d) / Math.max(1, g.d)))
        const ix = (g.mx - g.tx) / g.s
        const iy = (g.my - g.ty) / g.s
        this.s = s
        this.tx = mx - ix * s
        this.ty = my - iy * s
        this.clamp()
        this.draw()
        return
      }
      p.x = x
      p.y = y
    })
    const end = (e) => {
      if (!this.pointers.has(e.pointerId)) return
      this.pointers.delete(e.pointerId)
      if (this.pointers.size === 0) {
        const t = this.tap
        this.tap = null
        if (e.type === 'pointerup' && t?.ok && performance.now() - t.t < TAP_TIME) {
          const cell = this.cellAt(e.clientX, e.clientY)
          if (cell !== -1) this.onTap(cell)
        }
      }
      if (this.pointers.size < 2) this.gesture = null
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const [x, y] = local(e)
        this.zoomBy(Math.exp(-e.deltaY * 0.0025), x, y)
      },
      { passive: false },
    )
  }
}
