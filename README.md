# Love To Color

A calm tap-to-fill coloring game, part of GameHub (`standan3126.github.io`). Pick a picture from
**Easy**, **Cozy** or **Detailed**, then **Color by Number** or **Free Color**, and tap cells to
fill them. Colors always stay inside the lines. Pinch to zoom, two fingers to move.

Live at https://standan3126.github.io/love-to-color/ (inside GameHub).

## Pictures

- **Easy: drawings** from [Openclipart](https://openclipart.org) (all CC0, public domain), listed
  with their artists in [CREDITS.md](CREDITS.md). `node tools/prep-art.mjs` turns each SVG in
  `tools/art-src/` into `art/<id>/lines.png` (outlines) and `art/<id>/colors.png` (the
  Color by Number answer key, in named crayon colors).
- **Cozy: patterns** drawn in code: mandalas, fractals and tessellations (`js/patterns.js`).
- **Detailed: photos and prints** turned into very detailed pictures with the photo tool:
  `npm run photos`, then open http://localhost:4191/tools/photo-tool.html. Originals go in
  `private/photos/` (never published). **Add to game** writes `art/<id>/detailed-lines.png` and
  `detailed-colors.png`, `art/art.json` and `CREDITS.md`. Only public domain, CC0 or our own; the
  original itself never goes in the game. In the game their outlines are soft gray and each
  colored cell covers its own outline, so a finished picture has no lines, like a painting.

Every picture becomes cells in the browser (`js/engine.js`): the white areas between the lines are
found, tiny ones in the drawings join a neighbor, and each cell gets its number from the colored
version. Saves remember each colored cell by a point inside it.

**Never change a published picture or pattern**: saved pictures find their cells again from it.
Add new ones instead.

## Files

| Path | What |
|---|---|
| `index.html`, `css/style.css` | The page and its look |
| `js/main.js` | Screens, saving, settings, moving pictures |
| `js/engine.js` | Line art to cells |
| `js/stage.js` | Showing a picture, zoom and pan, taps |
| `js/patterns.js` | Mandalas, fractals, tessellations |
| `js/pictures.js` | The picture list and sizes |
| `js/crayons.js` | The crayon box and palette packs |
| `js/wheel.js` | The color wheel for making your own colors |
| `art/` | Prepared drawings and `art.json` |
| `tools/` | Drawing and photo preparation, preview pages, credits (not published) |
| `tests/` | Browser tests and a local server |

GameHub's toolbox (`/shared/v1/`) provides the Exit button, Tap to Start, saving, transfer codes,
backup files and the music.

## Working on it

```
npm install
npm run serve      # http://localhost:4190/love-to-color/ (needs the hub folder next to this one)
npm test           # browser tests on iPhone, Android and small-phone sizes
```

Every push to `main` publishes through GitHub Actions.
