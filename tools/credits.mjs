// Writes CREDITS.md from art/art.json, so every drawing and photo in the game is credited.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const cell = (text) => String(text || '').replace(/\|/g, '/')
const link = (title, url) => (url ? `[${cell(title)}](${url.replace(/\(/g, '%28').replace(/\)/g, '%29')})` : cell(title))

export function writeCredits(root) {
  const art = JSON.parse(readFileSync(join(root, 'art/art.json'), 'utf8'))
  const drawings = art.filter((a) => !a.sizes)
  const photos = art.filter((a) => a.sizes)
  const lines = [
    '# Credits',
    '',
    "Love To Color's code, patterns (mandalas, fractals, tessellations) and crayon names are our own.",
    '',
    '## Drawings',
    '',
    'These drawings come from [Openclipart](https://openclipart.org), where every picture is shared as',
    'public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No credit is',
    "required, but we're grateful, so here is who made them. Each was simplified into outlines and",
    'crayon colors for coloring (`tools/prep-art.mjs`); the originals are in `tools/art-src/`.',
    '',
    '| In the game | Original | Artist | License |',
    '|---|---|---|---|',
    ...drawings.map((a) => `| ${cell(a.name)} | ${link(a.credit.title, a.credit.source)} | ${cell(a.credit.artist)} | ${cell(a.credit.license)} |`),
  ]
  if (photos.length) {
    lines.push(
      '',
      '## Photos',
      '',
      'These pictures were made from photos that are public domain, CC0, or our own, turned into',
      'outlines and colors by `tools/photo-tool`. The photos themselves are not part of the game.',
      '',
      '| In the game | Photo | By | License |',
      '|---|---|---|---|',
      ...photos.map((a) => `| ${cell(a.name)} | ${link(a.credit.title, a.credit.source)} | ${cell(a.credit.artist)} | ${cell(a.credit.license)} |`),
    )
  }
  lines.push('', '## Sound', '', "Music and sounds are generated live by GameHub's toolbox (`/shared/v1/sound/`); no recordings are used.", '')
  writeFileSync(join(root, 'CREDITS.md'), lines.join('\n'))
}
