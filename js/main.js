// Love To Color: pick a picture, pick Easy / Cozy / Detailed and Color by Number or Free Color,
// then tap cells to fill them. Uses GameHub's toolbox for the Exit button, Tap to Start, saving,
// moving progress and the gentle music.
import { addExitButton, setupPage, tapToStart, warmOffline } from '/shared/v1/kit.js'
import { gameStore, makeTransferCode, openBackupFile, readTransferCode, saveBackupFile } from '/shared/v1/save.js'
import { Sound } from '/shared/v1/sound/index.js'
import { colorName, CRAYONS, PACKS, WHITE } from './crayons.js'
import { findPicture, GROUPS, loadCatalog, loadCells, outlineCanvas, previewOf, SIZES } from './pictures.js'
import { Stage } from './stage.js'
import { colorWheel } from './wheel.js'

const GAME_ID = 'love-to-color'
const MODES = [
  { id: 'number', name: 'Color by Number', note: 'Match each number to its color' },
  { id: 'free', name: 'Free Color', note: 'Any color in any cell' },
]
const store = gameStore(GAME_ID)
const settings = { music: true, sounds: true, size: 'cozy', mode: 'number', freeSet: 'crayons', myColors: [], group: 'home', ...store.get('settings', {}) }
const saveSettings = () => store.set('settings', settings)
const sound = new Sound({ notes: settings.sounds ? 0.7 : 0, nature: 0, music: 0.45 })

const $ = (id) => document.getElementById(id)
function el(tag, { role, ...props } = {}) {
  const node = Object.assign(document.createElement(tag), props)
  if (role) node.setAttribute('role', role)
  return node
}

let toastTimer = 0
function toast(text) {
  const t = $('toast')
  t.textContent = text
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800)
}

// --- Screens -------------------------------------------------------------------------------------

function show(id) {
  for (const s of ['home', 'setup', 'coloring']) $(s).hidden = s !== id
  document.body.classList.toggle('coloring-open', id !== 'home')
  window.scrollTo(0, 0)
}

const saveKey = (id, size, mode) => `pic:${id}:${size}:${mode}`
const savedPictures = () =>
  store
    .keys()
    .filter((k) => k.startsWith('pic:'))
    .map((k) => ({ key: k, ...store.get(k) }))
    .filter((s) => findPicture(s.id))
    .sort((a, b) => b.updated - a.updated)

function renderHome() {
  const saves = savedPictures()
  $('keepSection').hidden = !saves.length
  $('keepList').replaceChildren(
    ...saves.map((s) => {
      const card = el('div', { className: 'keep-card' })
      const open = el('button', { type: 'button', className: 'keep-open' })
      const size = SIZES.find((z) => z.id === s.size)
      const name = findPicture(s.id).name
      open.append(
        el('img', { src: s.thumb || '', alt: '' }),
        el('span', { className: 'card-name', textContent: name }),
        el('span', { className: 'card-note', textContent: `${s.mode === 'number' ? 'By Number' : 'Free'} · ${size?.name} · ${s.done ? 'Finished' : `${s.percent || 0}%`}` }),
      )
      open.addEventListener('click', () => openColoring(findPicture(s.id), s.size, s.mode))
      const remove = el('button', { type: 'button', className: 'keep-delete', innerHTML: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>' })
      remove.setAttribute('aria-label', `Delete ${name}`)
      remove.addEventListener('click', () => {
        if (!confirm(`Delete “${name}”? Its colors will be gone for good.`)) return
        store.remove(s.key)
        renderHome()
        toast('Picture deleted')
      })
      card.append(open, remove)
      return card
    }),
  )
  $('groupChips').replaceChildren(
    ...GROUPS.map((g) => {
      const chip = el('button', { type: 'button', className: 'chip', textContent: g.name, role: 'tab' })
      chip.setAttribute('aria-selected', String(g.id === settings.group))
      chip.addEventListener('click', () => {
        settings.group = g.id
        saveSettings()
        renderHome()
      })
      return chip
    }),
  )
  renderGrid()
}

async function renderGrid() {
  const catalog = await loadCatalog()
  $('pictureGrid').replaceChildren(
    ...catalog
      .filter((p) => p.group === settings.group)
      .map((p) => {
        const card = el('button', { type: 'button', className: 'picture-card' })
        card.append(previewOf(p), el('span', { className: 'card-name', textContent: p.name }))
        card.addEventListener('click', () => openSetup(p))
        return card
      }),
  )
}

// --- Setup ---------------------------------------------------------------------------------------

let setupItem = null

function choiceButtons(host, options, current, onPick) {
  host.replaceChildren(
    ...options.map((o) => {
      const b = el('button', { type: 'button', className: 'choice', role: 'radio' })
      b.append(el('strong', { textContent: o.name }), el('span', { textContent: o.note }))
      b.setAttribute('aria-checked', String(o.id === current))
      b.addEventListener('click', () => onPick(o.id))
      return b
    }),
  )
}

function openSetup(item) {
  setupItem = item
  $('setupName').textContent = item.name
  $('setupPreview').replaceChildren(previewOf(item, 480))
  renderSetupChoices()
  show('setup')
}

// The picture exactly as it will be at the chosen size (cells joined, outlines and all).
let previewTurn = 0
async function showSizePreview() {
  const turn = ++previewTurn
  const item = setupItem
  const detail = SIZES.findIndex((z) => z.id === settings.size)
  $('setupPreview').classList.add('busy')
  await new Promise((r) => setTimeout(r, 20))
  const canvas = await outlineCanvas(item, detail)
  if (turn !== previewTurn || item !== setupItem) return
  $('setupPreview').replaceChildren(canvas)
  $('setupPreview').classList.remove('busy')
}

function renderSetupChoices() {
  showSizePreview()
  choiceButtons($('sizeChoices'), SIZES, settings.size, (id) => {
    settings.size = id
    saveSettings()
    renderSetupChoices()
  })
  choiceButtons($('modeChoices'), MODES, settings.mode, (id) => {
    settings.mode = id
    saveSettings()
    renderSetupChoices()
  })
  const existing = store.get(saveKey(setupItem.id, settings.size, settings.mode))
  $('startColoring').textContent = existing ? (existing.done ? 'Look at it again' : 'Keep coloring') : 'Start coloring'
  $('startOver').hidden = !existing
}

$('setupBack').addEventListener('click', () => show('home'))
$('startColoring').addEventListener('click', () => openColoring(setupItem, settings.size, settings.mode))
$('startOver').addEventListener('click', () => {
  if (!confirm('Start this picture over? The colors you added will be cleared.')) return
  store.remove(saveKey(setupItem.id, settings.size, settings.mode))
  openColoring(setupItem, settings.size, settings.mode)
})

// --- Coloring ------------------------------------------------------------------------------------

let session = null // { item, size, mode, cells, stage, numbers, selected, history, ... }
let saveTimer = 0

async function openColoring(item, size, mode) {
  show('coloring')
  $('colorName').textContent = item.name
  $('colorProgress').textContent = ''
  $('preparing').hidden = false
  $('stage').replaceChildren()
  $('swatches').replaceChildren()
  delete $('swatches').dataset.set
  await new Promise((r) => setTimeout(r, 30)) // let "Getting your picture ready" show first
  const detail = SIZES.findIndex((s) => s.id === size)
  const cells = await loadCells(item, detail)
  const s = { item, size, mode, cells, history: [], key: saveKey(item.id, size, mode) }
  session = s
  s.stage = new Stage($('stage'), cells, { onTap: (c) => (mode === 'number' ? tapNumber(c) : tapFree(c)) })

  // Color by Number: number the palette colors that are used, in palette order.
  const used = [...new Set(Array.from(cells.target).filter((t) => !cells.blank.has(t)))].sort((a, b) => a - b)
  s.numbers = new Map(used.map((t, i) => [t, i + 1]))
  s.numbered = Array.from(cells.target).filter((t) => !cells.blank.has(t)).length
  s.left = new Map(used.map((t) => [t, 0]))
  for (let c = 0; c < cells.cellCount; c++) if (s.numbers.has(cells.target[c])) s.left.set(cells.target[c], s.left.get(cells.target[c]) + 1)

  // Bring back what was colored before (each cell is remembered by a point inside it).
  const saved = store.get(s.key)
  if (saved) {
    for (const [x, y, k] of saved.fills || []) {
      const c = cells.cellOf[y * cells.width + x]
      if (c === -1) continue
      if (mode === 'number') {
        if (s.numbers.has(cells.target[c]) && !s.stage.colors[c]) {
          s.stage.setColor(c, cells.palette[cells.target[c]])
          s.left.set(cells.target[c], s.left.get(cells.target[c]) - 1)
        }
      } else if (saved.colors?.[k]) s.stage.setColor(c, saved.colors[k])
    }
  }
  s.stage.numberOf = mode === 'number' ? (c) => s.numbers.get(cells.target[c]) ?? null : () => null
  $('undo').hidden = mode !== 'free'
  $('findCell').hidden = mode !== 'number'
  $('setChips').hidden = mode !== 'free'
  if (mode === 'number') {
    s.selected = used.find((t) => s.left.get(t) > 0) ?? used[0]
    renderNumberSwatches()
  } else {
    s.selected = s.selected || settings.lastFree || CRAYONS[23].hex
    renderFreePalette()
  }
  updateProgress()
  $('preparing').hidden = true
  revealSelected()
  s.stage.draw()
}

function updateProgress() {
  const s = session
  const filled = s.stage.colors.filter(Boolean).length
  if (s.mode === 'number') {
    const done = s.numbered - [...s.left.values()].reduce((a, b) => a + b, 0)
    $('colorProgress').textContent = `${done} of ${s.numbered} cells`
    s.percent = Math.round((done / Math.max(1, s.numbered)) * 100)
  } else {
    s.percent = Math.round((filled / Math.max(1, s.cells.cellCount)) * 100)
    $('colorProgress').textContent = `${s.percent}% colored`
  }
}

// Color by Number: the right number fills; anything else gets a gentle hint.
function tapNumber(c) {
  const s = session
  const t = s.cells.target[c]
  if (!s.numbers.has(t) || s.stage.colors[c]) return
  if (t !== s.selected) {
    sound.soft()
    toast(`That's a ${s.numbers.get(t)}`)
    const sw = $('swatches').querySelector(`[data-target="${t}"]`)
    sw?.classList.remove('nudge')
    void sw?.offsetWidth
    sw?.classList.add('nudge')
    return
  }
  s.stage.setColor(c, s.cells.palette[t])
  s.left.set(t, s.left.get(t) - 1)
  s.streak = (s.streak || 0) + 1
  sound.step(tuneStep(s.streak))
  updateProgress()
  scheduleSave()
  if (s.left.get(t) === 0) {
    sound.chime()
    const next = [...s.left.keys()].find((k) => s.left.get(k) > 0)
    if (next === undefined) return finish()
    s.selected = next
    toast(`All the ${s.numbers.get(t)}s are done!`)
    renderNumberSwatches()
    revealSelected()
    return
  }
  renderNumberSwatches()
}

// A little tune that walks up and back down, so quick fills never get shrill.
const TUNE = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1]
const tuneStep = (n) => TUNE[(n - 1) % TUNE.length]

function renderNumberSwatches() {
  const s = session
  const row = $('swatches')
  const scrolled = row.scrollLeft
  row.replaceChildren(
    ...[...s.numbers].map(([t, num]) => {
      const hex = s.cells.palette[t]
      const b = el('button', { type: 'button', className: 'swatch', textContent: num })
      b.dataset.target = t
      b.style.background = hex
      b.style.color = textOn(hex)
      b.setAttribute('aria-label', `${num}: ${colorName(hex)}`)
      b.setAttribute('aria-pressed', String(t === s.selected))
      if (s.left.get(t) === 0) b.classList.add('done')
      b.addEventListener('click', () => {
        s.selected = t
        renderNumberSwatches()
      })
      return b
    }),
  )
  row.scrollLeft = scrolled
  $('colorLabel').textContent = `${s.numbers.get(s.selected)} is ${colorName(s.cells.palette[s.selected])}: ${s.left.get(s.selected)} left`
  s.stage.setTinted((c) => s.cells.target[c] === s.selected)
}

// Only when the game picks the next number itself: bring it into view if it's off to the side.
const revealSelected = () => $('swatches').querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })

// Light text on dark colors, dark text on light ones.
function textOn(hex) {
  const v = parseInt(hex.slice(1), 16)
  const lum = 0.3 * (v >> 16) + 0.59 * ((v >> 8) & 255) + 0.11 * (v & 255)
  return lum < 140 ? '#fff' : '#3b3a34'
}

// Free Color: any color in any cell; white clears it.
function tapFree(c) {
  const s = session
  const hex = s.selected === WHITE ? null : s.selected
  if (s.stage.colors[c] === hex) return
  s.history.push([c, s.stage.colors[c]])
  if (s.history.length > 200) s.history.shift()
  s.stage.setColor(c, hex)
  s.streak = (s.streak || 0) + 1
  sound.step(tuneStep(s.streak))
  updateProgress()
  scheduleSave()
}

$('undo').addEventListener('click', () => {
  const s = session
  const last = s?.history.pop()
  if (!last) return toast('Nothing to undo')
  s.stage.setColor(last[0], last[1])
  updateProgress()
  scheduleSave()
})

const FREE_SETS = () => [
  { id: 'crayons', name: 'Crayons', colors: CRAYONS.filter((c) => c.hex !== WHITE) },
  ...PACKS,
  { id: 'mine', name: 'My Colors', colors: settings.myColors.map((hex) => ({ hex, name: colorName(hex) })) },
]

function renderFreePalette() {
  const s = session
  const sets = FREE_SETS()
  const set = sets.find((x) => x.id === settings.freeSet) || sets[0]
  $('setChips').replaceChildren(
    ...sets.map((x) => {
      const chip = el('button', { type: 'button', className: 'chip', textContent: x.name, role: 'tab' })
      chip.setAttribute('aria-selected', String(x.id === set.id))
      chip.addEventListener('click', () => {
        settings.freeSet = x.id
        saveSettings()
        renderFreePalette()
      })
      return chip
    }),
  )
  const eraser = el('button', { type: 'button', className: 'swatch eraser', textContent: 'White' })
  eraser.setAttribute('aria-label', 'White (clears a cell)')
  const items = [eraser, ...set.colors.map((c) => {
    const b = el('button', { type: 'button', className: 'swatch' })
    b.style.background = c.hex
    b.dataset.hex = c.hex
    b.setAttribute('aria-label', c.name)
    return b
  })]
  eraser.dataset.hex = WHITE
  if (set.id === 'mine') {
    const add = el('button', { type: 'button', className: 'swatch add', textContent: '+' })
    add.setAttribute('aria-label', 'Make a new color')
    add.addEventListener('click', () => openSheet('wheelSheet'))
    items.push(add)
  }
  for (const b of items) {
    if (!b.dataset.hex) continue
    b.setAttribute('aria-pressed', String(b.dataset.hex === s.selected))
    b.addEventListener('click', () => {
      s.selected = b.dataset.hex
      settings.lastFree = s.selected
      saveSettings()
      renderFreePalette()
    })
  }
  const row = $('swatches')
  const scrolled = row.dataset.set === set.id ? row.scrollLeft : 0
  row.dataset.set = set.id
  row.replaceChildren(...items)
  row.scrollLeft = scrolled
  // The chosen color's name, and a way to keep it in My Colors.
  const label = $('colorLabel')
  label.replaceChildren(document.createTextNode(s.selected === WHITE ? 'White clears a cell' : colorName(s.selected)))
  if (s.selected !== WHITE && !settings.myColors.includes(s.selected)) {
    const keep = el('button', { type: 'button', className: 'text-button', textContent: ' ★ Keep' })
    keep.style.padding = '0 6px'
    keep.addEventListener('click', () => {
      settings.myColors.push(s.selected)
      saveSettings()
      toast('Added to My Colors')
      renderFreePalette()
    })
    label.append(keep)
  }
}

colorWheel($('wheelHost'), {
  onPick(hex) {
    if (!settings.myColors.includes(hex)) settings.myColors.push(hex)
    settings.freeSet = 'mine'
    saveSettings()
    if (session?.mode === 'free') {
      session.selected = hex
      renderFreePalette()
    }
    closeSheet('wheelSheet')
    toast('Added to My Colors')
  },
})

// --- Saving --------------------------------------------------------------------------------------

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 800)
}

function saveNow() {
  clearTimeout(saveTimer)
  const s = session
  if (!s) return
  const { cells } = s
  const colors = []
  const fills = []
  s.stage.colors.forEach((hex, c) => {
    if (!hex) return
    let k = 0
    if (s.mode === 'free') {
      k = colors.indexOf(hex)
      if (k === -1) k = colors.push(hex) - 1
    }
    fills.push(s.mode === 'free' ? [cells.labelX[c], cells.labelY[c], k] : [cells.labelX[c], cells.labelY[c]])
  })
  const data = { id: s.item.id, size: s.size, mode: s.mode, fills, updated: Date.now(), percent: s.percent, done: !!s.done }
  if (s.mode === 'free') data.colors = colors
  try {
    data.thumb = s.stage.snapshot(240).toDataURL('image/jpeg', 0.75)
  } catch {}
  if (!store.set(s.key, data)) {
    delete data.thumb
    store.set(s.key, data)
  }
}

function finish() {
  const s = session
  s.done = true
  saveNow()
  updateProgress()
  renderNumberSwatches()
  sound.celebrate()
  const img = el('img', { src: s.stage.snapshot(600).toDataURL('image/png'), alt: s.item.name })
  $('donePicture').replaceChildren(img)
  setTimeout(() => openSheet('doneSheet'), 600)
}

function leaveColoring() {
  saveNow()
  session = null
  renderHome()
  show('home')
}

$('colorBack').addEventListener('click', leaveColoring)
$('doneHome').addEventListener('click', () => {
  closeSheet('doneSheet')
  leaveColoring()
})

async function savePhoto() {
  const s = session
  if (!s) return
  const canvas = s.stage.snapshot()
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
  const file = new File([blob], `${s.item.id}.png`, { type: 'image/png' })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: s.item.name })
      return
    }
  } catch (e) {
    if (e?.name === 'AbortError') return
  }
  const a = el('a', { href: URL.createObjectURL(blob), download: file.name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
$('savePhoto').addEventListener('click', savePhoto)
$('doneSave').addEventListener('click', savePhoto)

$('zoomIn').addEventListener('click', () => session?.stage.zoomBy(1.6))
$('zoomOut').addEventListener('click', () => session?.stage.zoomBy(1 / 1.6))
$('zoomFit').addEventListener('click', () => session?.stage.fit())
$('findCell').addEventListener('click', () => {
  const s = session
  if (!s) return
  const start = (s.lastFound ?? -1) + 1
  for (let i = 0; i < s.cells.cellCount; i++) {
    const c = (start + i) % s.cells.cellCount
    if (s.cells.target[c] === s.selected && !s.stage.colors[c]) {
      s.lastFound = c
      s.stage.showCell(c)
      return
    }
  }
  toast('All done for this number')
})

// --- Sheets and settings -------------------------------------------------------------------------

function openSheet(id) {
  $(id).hidden = false
}
function closeSheet(id) {
  $(id).hidden = true
}
document.querySelectorAll('.sheet').forEach((sheet) => {
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(sheet.id)
  })
})

$('openSettings').addEventListener('click', async () => {
  $('musicToggle').checked = settings.music
  $('soundToggle').checked = settings.sounds
  const catalog = await loadCatalog()
  $('credits').replaceChildren(
    ...catalog
      .filter((p) => p.credit)
      .map((p) => {
        const li = el('li')
        li.append(`${p.name}: “${p.credit.title}” by `, el('a', { href: p.credit.source, target: '_blank', rel: 'noopener', textContent: p.credit.artist }))
        return li
      }),
  )
  $('moveNote').textContent = ''
  openSheet('settingsSheet')
})
$('musicToggle').addEventListener('change', (e) => {
  settings.music = e.target.checked
  saveSettings()
  sound.unlock()
  sound.setMusic(settings.music)
})
$('soundToggle').addEventListener('change', (e) => {
  settings.sounds = e.target.checked
  saveSettings()
  sound.setVolumes({ notes: settings.sounds ? 0.7 : 0 })
})

// Moving pictures: everything except the small previews, which are made again when opened.
const movable = () => {
  const all = store.all()
  for (const v of Object.values(all)) if (v && typeof v === 'object') delete v.thumb
  return all
}
const moveNote = (t) => ($('moveNote').textContent = t)
$('makeCode').addEventListener('click', async () => {
  const box = $('moveCode')
  box.hidden = false
  $('useCode').hidden = true
  box.value = makeTransferCode(GAME_ID, movable())
  box.select()
  try {
    await navigator.clipboard.writeText(box.value)
    moveNote('Code copied. Paste it into Love To Color on the other phone or app.')
  } catch {
    moveNote('Copy this code, then paste it into Love To Color on the other phone or app.')
  }
})
$('enterCode').addEventListener('click', () => {
  $('moveCode').hidden = false
  $('moveCode').value = ''
  $('useCode').hidden = false
  $('moveCode').focus()
  moveNote('Pasting a code replaces the pictures on this phone.')
})
function restore(data) {
  if (!data || typeof data !== 'object') throw new Error("That isn't Love To Color progress.")
  store.replaceAll(data)
  Object.assign(settings, store.get('settings', {}))
  closeSheet('settingsSheet')
  renderHome()
  toast('Your pictures are here')
}
$('useCode').addEventListener('click', () => {
  try {
    restore(readTransferCode($('moveCode').value, GAME_ID))
  } catch (e) {
    moveNote(e.message || "That code didn't work.")
  }
})
$('saveFile').addEventListener('click', () => saveBackupFile(GAME_ID, movable()).catch(() => moveNote("Couldn't save the file.")))
$('openFile').addEventListener('click', async () => {
  try {
    restore(await openBackupFile(GAME_ID))
  } catch (e) {
    moveNote(e.message || "Couldn't open that file.")
  }
})

// For the browser tests: the open picture.
window.loveToColor = { get session() { return session } }

// --- Start ---------------------------------------------------------------------------------------

setupPage()
addExitButton({ beforeExit: saveNow })
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveNow())
await loadCatalog()
renderHome()
show('home')
tapToStart({
  title: 'Love To Color',
  subtitle: 'Tap a cell to fill it with color.',
  onStart: () => {
    sound.unlock()
    sound.setMusic(settings.music)
  },
})
setTimeout(() => warmOffline('offline-files.json'), 4000)
