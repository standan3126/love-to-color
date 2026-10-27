// The crayon box: 49 named colors, and palette packs made from them.

export const CRAYONS = [
  ['Ruby', '#a8324a'],
  ['Cherry Red', '#d64545'],
  ['Watermelon', '#ef6f7a'],
  ['Rose', '#e57a8a'],
  ['Dusty Rose', '#c98b8b'],
  ['Blush Pink', '#f4b6c2'],
  ['Coral', '#f28c6f'],
  ['Pumpkin', '#e07a2f'],
  ['Tangerine', '#f39233'],
  ['Apricot', '#f6a96b'],
  ['Peach', '#f9c09a'],
  ['Terracotta', '#c86b4a'],
  ['Honey', '#e3a73b'],
  ['Mustard', '#c9a227'],
  ['Sunflower', '#f6c443'],
  ['Lemon', '#f8e45c'],
  ['Butter Yellow', '#fbe38e'],
  ['Lime', '#a7cf5a'],
  ['Moss', '#6f8f3c'],
  ['Olive', '#7a7d3a'],
  ['Sage', '#9cb89a'],
  ['Mint Green', '#a8e0c4'],
  ['Seafoam', '#8fd3c1'],
  ['Jade Green', '#3fa47f'],
  ['Forest Green', '#2f6b45'],
  ['Teal', '#2a9d8f'],
  ["Robin's Egg", '#a3d9e0'],
  ['Sky Blue', '#8ecae6'],
  ['Cornflower', '#6a8fd8'],
  ['Ocean Blue', '#2f7fb5'],
  ['Denim', '#4f6d8f'],
  ['Navy', '#24395f'],
  ['Periwinkle', '#a5b4f0'],
  ['Lavender', '#c3aee6'],
  ['Lilac', '#d6b4d9'],
  ['Violet', '#8a63c8'],
  ['Grape', '#5e3a7e'],
  ['Plum', '#7d4a7a'],
  ['Wheat', '#efdcb0'],
  ['Sand', '#e4cfa3'],
  ['Caramel', '#c48a4a'],
  ['Cinnamon', '#a0613b'],
  ['Chocolate', '#6b4430'],
  ['Cream', '#fbf3dc'],
  ['Silver Gray', '#b8b8b8'],
  ['Stone Gray', '#8a8580'],
  ['Charcoal', '#4a4643'],
  ['Licorice', '#2e2a29'],
  ['Snow White', '#ffffff'],
].map(([name, hex]) => ({ name, hex }))

const byName = Object.fromEntries(CRAYONS.map((c) => [c.name, c]))
const pick = (...names) => names.map((n) => byName[n])

export const WHITE = '#ffffff'

export const PACKS = [
  { id: 'garden', name: 'Garden', colors: pick('Rose', 'Blush Pink', 'Sunflower', 'Butter Yellow', 'Mint Green', 'Jade Green', 'Forest Green', 'Lavender', 'Sky Blue', 'Cinnamon') },
  { id: 'ocean', name: 'Ocean', colors: pick('Navy', 'Ocean Blue', 'Teal', 'Seafoam', "Robin's Egg", 'Sky Blue', 'Periwinkle', 'Sand', 'Coral', 'Cream') },
  { id: 'autumn', name: 'Autumn', colors: pick('Cherry Red', 'Pumpkin', 'Terracotta', 'Honey', 'Mustard', 'Olive', 'Moss', 'Cinnamon', 'Chocolate', 'Wheat') },
  { id: 'sunset', name: 'Sunset', colors: pick('Ruby', 'Cherry Red', 'Watermelon', 'Coral', 'Tangerine', 'Apricot', 'Sunflower', 'Lilac', 'Violet', 'Plum') },
  { id: 'pastel', name: 'Pastel', colors: pick('Blush Pink', 'Peach', 'Butter Yellow', 'Mint Green', 'Seafoam', "Robin's Egg", 'Periwinkle', 'Lavender', 'Lilac', 'Cream') },
  { id: 'cottage', name: 'Cottage', colors: pick('Dusty Rose', 'Sage', 'Moss', 'Wheat', 'Sand', 'Caramel', 'Cornflower', 'Denim', 'Stone Gray', 'Cream') },
]

// The name of a color: the crayon's name, or a friendly description for a mixed one.
export function colorName(hex) {
  const c = CRAYONS.find((k) => k.hex === hex.toLowerCase())
  return c ? c.name : 'Your color'
}
