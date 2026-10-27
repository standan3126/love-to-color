// "Make your own" color: a color wheel (shade around, softness from the middle out) and a
// brightness slider. Calls onPick('#rrggbb') when the player adds the color.

const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return [f(5) * 255, f(3) * 255, f(1) * 255]
}

export function colorWheel(host, { onPick }) {
  host.innerHTML = `
    <canvas class="wheel" width="480" height="480" aria-label="Color wheel"></canvas>
    <label class="wheel-row">Brightness <input type="range" class="wheel-bright" min="20" max="100" value="100" /></label>
    <div class="wheel-row">
      <span class="wheel-preview" aria-hidden="true"></span>
      <button type="button" class="button wheel-add">Add to My Colors</button>
    </div>`
  const canvas = host.querySelector('canvas')
  const bright = host.querySelector('.wheel-bright')
  const preview = host.querySelector('.wheel-preview')
  const ctx = canvas.getContext('2d')
  const R = canvas.width / 2
  let hue = 140
  let sat = 0.45

  const drawWheel = () => {
    const v = bright.value / 100
    const img = ctx.createImageData(canvas.width, canvas.height)
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const dx = x - R
        const dy = y - R
        const d = Math.hypot(dx, dy) / R
        if (d > 1) continue
        const [r, g, b] = hsvToRgb(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, d, v)
        img.data.set([r, g, b, d > 0.985 ? 255 * (1 - d) * 66 : 255], (y * canvas.width + x) * 4)
      }
    }
    ctx.putImageData(img, 0, 0)
    // The chosen spot.
    const a = (hue * Math.PI) / 180
    ctx.beginPath()
    ctx.arc(R + Math.cos(a) * sat * R, R + Math.sin(a) * sat * R, 14, 0, Math.PI * 2)
    ctx.lineWidth = 5
    ctx.strokeStyle = '#fff'
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#3b3a34'
    ctx.stroke()
    preview.style.background = current()
  }
  const current = () => toHex(...hsvToRgb(hue, sat, bright.value / 100))

  const pick = (e) => {
    const r = canvas.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * canvas.width - R
    const y = ((e.clientY - r.top) / r.height) * canvas.height - R
    hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
    sat = Math.min(1, Math.hypot(x, y) / R)
    drawWheel()
  }
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId)
    pick(e)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (canvas.hasPointerCapture(e.pointerId)) pick(e)
  })
  bright.addEventListener('input', drawWheel)
  host.querySelector('.wheel-add').addEventListener('click', () => onPick(current()))
  drawWheel()
}
