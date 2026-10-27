import { expect, test } from '@playwright/test'

// Opens the game past Tap to Start, failing the test on any page error.
async function start(page) {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./')
  await page.getByText('Tap to Start').click()
  await expect(page.locator('.picture-card').first()).toBeVisible()
  return errors
}

async function openPicture(page, section, group, name, mode) {
  await page.getByRole('tab', { name: section, exact: true }).click()
  if (group) await page.getByRole('tab', { name: group, exact: true }).click()
  await page.locator('.picture-card', { hasText: name }).click()
  await page.getByRole('radio', { name: new RegExp(mode) }).click()
  await page.locator('#startColoring').click()
  await expect(page.locator('#preparing')).toBeHidden({ timeout: 20000 })
}

// Taps a cell where it is on screen, zooming to it first.
async function tapCell(page, cell) {
  const [x, y] = await page.evaluate((c) => {
    const s = window.loveToColor.session
    s.stage.showCell(c)
    s.stage.render()
    return s.stage.screenPoint(c)
  }, cell)
  await page.mouse.click(x, y)
}

const info = (page) =>
  page.evaluate(() => {
    const s = window.loveToColor.session
    const t = Array.from(s.cells.target)
    return { count: s.cells.cellCount, target: t, blank: [...s.cells.blank], selected: s.selected, colors: s.stage.colors.slice() }
  })

test('home lists every section and group of pictures', async ({ page }) => {
  const errors = await start(page)
  const sections = { Easy: ['Cottages', 'Gardens', 'Animals'], Cozy: ['Mandalas', 'Fractals', 'Tessellations'], Detailed: ['Gardens', 'Animals', 'Nature'] }
  for (const [section, groups] of Object.entries(sections)) {
    await page.getByRole('tab', { name: section, exact: true }).click()
    for (const group of groups) {
      await page.getByRole('tab', { name: group, exact: true }).click()
      expect(await page.locator('.picture-card').count()).toBeGreaterThan(0)
    }
  }
  // Each section only has its own kind of picture.
  await page.getByRole('tab', { name: 'Easy', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Mandalas' })).toHaveCount(0)
  // Nothing wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('color by number: right number fills, wrong number nudges, finishing celebrates', async ({ page }) => {
  const errors = await start(page)
  await openPicture(page, 'Cozy', 'Mandalas', 'Sunrise Mandala', 'Color by Number')
  let s = await info(page)
  const wrong = s.target.findIndex((t) => t !== s.selected && !s.blank.includes(t))
  await tapCell(page, wrong)
  await expect(page.locator('#toast')).toContainText("That's a")
  expect((await info(page)).colors[wrong]).toBe(null)

  // Color every numbered cell, one number at a time, through the palette and taps.
  const numbers = [...new Set(s.target.filter((t) => !s.blank.includes(t)))].sort((a, b) => a - b)
  for (const t of numbers) {
    await page.locator(`.swatch[data-target="${t}"]`).click()
    for (let c = 0; c < s.count; c++) if (s.target[c] === t) await tapCell(page, c)
  }
  await expect(page.locator('#doneSheet')).toBeVisible()
  s = await info(page)
  expect(s.colors.filter(Boolean).length).toBe(s.target.filter((t) => !s.blank.includes(t)).length)
  expect(errors).toEqual([])
})

test('progress is saved and comes back, also after a reload', async ({ page }) => {
  const errors = await start(page)
  await openPicture(page, 'Easy', 'Animals', 'Happy Fox', 'Color by Number')
  const s = await info(page)
  const mine = s.target.map((t, c) => (t === s.selected ? c : -1)).filter((c) => c !== -1).slice(0, 3)
  for (const c of mine) await tapCell(page, c)
  await page.locator('#colorBack').click()
  await expect(page.locator('#keepSection')).toBeVisible()
  await expect(page.locator('.keep-card')).toHaveCount(1)
  await page.reload()
  await page.getByText('Tap to Start').click()
  await page.locator('.keep-card').click()
  await expect(page.locator('#preparing')).toBeHidden({ timeout: 20000 })
  const again = await info(page)
  expect(again.colors.map((c, i) => (c ? i : -1)).filter((i) => i !== -1)).toEqual(mine)
  expect(errors).toEqual([])
})

test('free color: any color, recolor, white clears, undo', async ({ page }) => {
  const errors = await start(page)
  await openPicture(page, 'Cozy', 'Tessellations', 'Honeycomb Flowers', 'Free Color')
  await page.getByRole('tab', { name: 'Ocean' }).click()
  await page.locator('.swatch[data-hex]').nth(2).click()
  const first = await page.evaluate(() => window.loveToColor.session.selected)
  await tapCell(page, 5)
  expect((await info(page)).colors[5]).toBe(first)
  await page.locator('.swatch[data-hex]').nth(4).click()
  const second = await page.evaluate(() => window.loveToColor.session.selected)
  await tapCell(page, 5)
  expect((await info(page)).colors[5]).toBe(second)
  await page.locator('.swatch.eraser').click()
  await tapCell(page, 5)
  expect((await info(page)).colors[5]).toBe(null)
  await page.locator('#undo').click()
  expect((await info(page)).colors[5]).toBe(second)
  // Lines stay lines: a tap only ever changes the one cell under it.
  expect((await info(page)).colors.filter(Boolean).length).toBe(1)
  // Keeping a crayon in My Colors.
  await page.locator('.swatch[data-hex]').nth(4).click()
  await page.getByRole('button', { name: '★ Keep' }).click()
  await page.getByRole('tab', { name: 'My Colors' }).click()
  await expect(page.locator(`.swatch[data-hex="${second}"]`)).toBeVisible()
  expect(errors).toEqual([])
})

test('zooming in keeps taps on the right cell', async ({ page }) => {
  const errors = await start(page)
  await openPicture(page, 'Cozy', 'Fractals', 'Circles in Circles', 'Free Color')
  for (let i = 0; i < 4; i++) await page.locator('#zoomIn').click()
  expect(await page.evaluate(() => window.loveToColor.session.stage.zoom)).toBeGreaterThan(5)
  const box = await page.locator('#stage canvas').boundingBox()
  const cell = await page.evaluate(([x, y]) => window.loveToColor.session.stage.cellAt(x, y), [box.x + box.width / 2, box.y + box.height / 2])
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const colors = (await info(page)).colors
  if (cell !== -1) expect(colors[cell]).not.toBe(null)
  await page.locator('#zoomFit').click()
  expect(await page.evaluate(() => window.loveToColor.session.stage.zoom)).toBeCloseTo(1)
  // The palette is on screen, not pushed below it.
  await expect(page.locator('.swatch[aria-pressed="true"]')).toBeInViewport()
  expect(errors).toEqual([])
})

test('every picture opens in its section, and older photo pictures at every size', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'checked once')
  await start(page)
  const report = await page.evaluate(async () => {
    const { loadCatalog, loadCells, sectionOf, SIZES } = await import('./js/pictures.js')
    const out = []
    for (const p of await loadCatalog()) {
      const sizes = p.sizes ? Object.keys(p.sizes) : [sectionOf(p).size]
      for (const size of sizes) {
        const cells = await loadCells(p, SIZES.findIndex((z) => z.id === size))
        out.push({ id: `${p.id}:${size}`, numbered: Array.from(cells.target).filter((t) => !cells.blank.has(t)).length })
      }
    }
    return out
  })
  for (const r of report) expect(r.numbered, r.id).toBeGreaterThan(0)
})

test('pictures move with a code', async ({ page, context }) => {
  await start(page)
  await openPicture(page, 'Easy', 'Gardens', 'Flower Meadow', 'Free Color')
  await tapCell(page, 1)
  await page.locator('#colorBack').click()
  await page.locator('#openSettings').click()
  await page.locator('#makeCode').click()
  const code = await page.locator('#moveCode').inputValue()
  expect(code.startsWith('GH1.love-to-color.')).toBe(true)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByText('Tap to Start').click()
  await expect(page.locator('#keepSection')).toBeHidden()
  await page.locator('#openSettings').click()
  await page.locator('#enterCode').click()
  await page.locator('#moveCode').fill(code)
  await page.locator('#useCode').click()
  await expect(page.locator('.keep-card')).toHaveCount(1)
})

test('in an iPhone app with a solid top bar, the colors sit fully on screen', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }))
  await start(page)
  expect(await page.evaluate(() => document.documentElement.classList.contains('ios-solid-bar'))).toBe(true)
  await openPicture(page, 'Cozy', 'Mandalas', 'Garden Mandala', 'Color by Number')
  const panel = await page.locator('.palette-panel').boundingBox()
  const height = await page.evaluate(() => innerHeight)
  expect(panel.y + panel.height).toBeLessThanOrEqual(height + 1)
  const swatch = await page.locator('.swatch').first().boundingBox()
  // At least 30px between the colors and the bottom edge (the home bar lives there).
  expect(height - (swatch.y + swatch.height)).toBeGreaterThanOrEqual(30)
})

test('a started picture can be deleted from Keep coloring', async ({ page }) => {
  await start(page)
  await openPicture(page, 'Easy', 'Animals', 'Snail', 'Free Color')
  await tapCell(page, 1)
  await page.locator('#colorBack').click()
  await expect(page.locator('.keep-card')).toHaveCount(1)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete Snail' }).click()
  await expect(page.locator('#keepSection')).toBeHidden()
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('love-to-color:pic:')).length)).toBe(0)
})

test('detailed pictures have soft outlines that colors cover', async ({ page }) => {
  const errors = await start(page)
  await openPicture(page, 'Detailed', 'Nature', 'The Great Wave', 'Color by Number')
  const s = await info(page)
  expect(s.count).toBeGreaterThan(500)
  const cell = s.target.findIndex((t) => t === s.selected)
  // A pixel of this cell's own outline: gray before coloring, the cell's color after.
  const linePixel = () =>
    page.evaluate((c) => {
      const { cells, stage } = window.loveToColor.session
      stage.flush()
      for (let i = cells.cellStart[c]; i < cells.cellStart[c + 1]; i++) {
        const p = cells.cellPixels[i]
        if (cells.lineAlpha[p] > 200) {
          const k = p * 4
          return { p, rgb: Array.from(stage.fill.data.slice(k, k + 3)), soft: stage.soft }
        }
      }
    }, cell)
  const before = await linePixel()
  expect(before.soft).toBe(true)
  expect(before.rgb[0]).toBeLessThan(160)
  await tapCell(page, cell)
  const after = await page.evaluate(([p, c]) => {
    const { cells, stage } = window.loveToColor.session
    return { rgb: Array.from(stage.fill.data.slice(p * 4, p * 4 + 3)), hex: stage.colors[c], want: cells.palette[cells.target[c]] }
  }, [before.p, cell])
  expect(after.hex).toBe(after.want)
  const hex = '#' + after.rgb.map((v) => v.toString(16).padStart(2, '0')).join('')
  expect(hex).toBe(after.want)
  expect(errors).toEqual([])
})

test('pictures saved before the sections still open at their old size', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    const old = { id: 'photo-fox-in-the-grass', size: 'easy', mode: 'free', fills: [], colors: [], updated: Date.now(), percent: 3 }
    localStorage.setItem('love-to-color:pic:photo-fox-in-the-grass:easy:free', JSON.stringify(old))
  })
  const errors = await start(page)
  await expect(page.locator('.keep-card')).toContainText('Easy')
  await page.locator('.keep-open').click()
  await expect(page.locator('#preparing')).toBeHidden({ timeout: 20000 })
  expect(await page.evaluate(() => [window.loveToColor.session.size, window.loveToColor.session.stage.soft])).toEqual(['easy', false])
  expect(errors).toEqual([])
})

test('sound settings open while coloring, with volumes and nature sounds', async ({ page }) => {
  const errors = await start(page)
  await openPicture(page, 'Easy', 'Gardens', 'Flower Meadow', 'Free Color')
  await page.locator('#colorSettings').click()
  await expect(page.locator('#settingsSheet')).toBeVisible()
  // Only sound here: moving pictures waits for the home screen.
  await expect(page.locator('#makeCode')).toBeHidden()
  await page.getByLabel('Music volume').fill('0.2')
  await page.getByLabel('Coloring sounds').fill('0')
  await page.getByLabel('Rain').fill('0.6')
  await page.getByLabel('Crickets').fill('0.3')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('love-to-color:settings')))
  expect([saved.musicVolume, saved.soundsVolume, saved.nature]).toEqual([0.2, 0, { rain: 0.6, crickets: 0.3 }])
  await page.locator('#settingsSheet [data-close]').click()
  await expect(page.locator('#settingsSheet')).toBeHidden()
  await expect(page.locator('#coloring')).toBeVisible()
  // From home, everything is there again.
  await page.locator('#colorBack').click()
  await page.locator('#openSettings').click()
  await expect(page.locator('#makeCode')).toBeVisible()
  expect(errors).toEqual([])
})
