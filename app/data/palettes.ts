/**
 * A gallery of palettes to browse.
 *
 * Color Hunt's value is not its code, it is that a person chose these. So
 * these are chosen rather than generated: four colours each, in the order
 * they are meant to be read — usually darkest to lightest, or background
 * first and accent last.
 *
 * Tags are the mood someone searches by. The measurable properties — light
 * or dark, warm or cold, whether two colours collapse for a colour-blind
 * reader — are worked out from the colours themselves at run time rather
 * than typed in here, because a hand-typed "dark" tag on a light palette is
 * exactly the sort of thing nobody ever notices.
 */
export interface Palette {
  colours: [string, string, string, string]
  tags: string[]
}

export const PALETTE_TAGS = [
  'pastel',
  'vintage',
  'retro',
  'neon',
  'earth',
  'nature',
  'sunset',
  'sea',
  'night',
  'coffee',
  'candy',
  'mono'
] as const

export type PaletteTag = (typeof PALETTE_TAGS)[number]

export const PALETTES: Palette[] = [
  { colours: ['#222831', '#393e46', '#00adb5', '#eeeeee'], tags: ['night', 'mono'] },
  { colours: ['#1a1a2e', '#16213e', '#0f3460', '#e94560'], tags: ['night', 'neon'] },
  { colours: ['#2d4059', '#ea5455', '#f07b3f', '#ffd460'], tags: ['sunset', 'retro'] },
  { colours: ['#364f6b', '#3fc1c9', '#f5f5f5', '#fc5185'], tags: ['sea', 'candy'] },
  { colours: ['#252a34', '#ff2e63', '#08d9d6', '#eaeaea'], tags: ['neon', 'night'] },
  { colours: ['#f9f7f7', '#dbe2ef', '#3f72af', '#112d4e'], tags: ['sea', 'mono'] },
  { colours: ['#f6f5f5', '#d3e0ea', '#1687a7', '#276678'], tags: ['sea', 'pastel'] },
  { colours: ['#fdf6f0', '#f5cdc5', '#e1a0a0', '#8d6262'], tags: ['pastel', 'vintage'] },
  { colours: ['#fff5e4', '#ffe3e1', '#ffd1d1', '#ff9494'], tags: ['pastel', 'candy'] },
  { colours: ['#e8f6ef', '#b8dfd8', '#4c4c6d', '#1b9c85'], tags: ['nature', 'pastel'] },
  { colours: ['#f0e5cf', '#c8b6a6', '#a4907c', '#8d7b68'], tags: ['earth', 'coffee'] },
  { colours: ['#40230f', '#7b4b2a', '#c08552', '#f3e9dc'], tags: ['coffee', 'earth'] },
  { colours: ['#2c3639', '#3f4e4f', '#a27b5c', '#dcd7c9'], tags: ['earth', 'coffee'] },
  { colours: ['#1b3022', '#3a5a40', '#a3b18a', '#dad7cd'], tags: ['nature', 'earth'] },
  { colours: ['#132a13', '#31572c', '#4f772d', '#90a955'], tags: ['nature', 'mono'] },
  { colours: ['#03071e', '#370617', '#9d0208', '#faa307'], tags: ['sunset', 'night'] },
  { colours: ['#231942', '#5e548e', '#9f86c0', '#e0b1cb'], tags: ['night', 'pastel'] },
  { colours: ['#10002b', '#3c096c', '#7b2cbf', '#e0aaff'], tags: ['night', 'neon'] },
  { colours: ['#fefae0', '#faedcd', '#d4a373', '#ccd5ae'], tags: ['earth', 'nature'] },
  { colours: ['#264653', '#2a9d8f', '#e9c46a', '#e76f51'], tags: ['sea', 'sunset'] },
  { colours: ['#006d77', '#83c5be', '#edf6f9', '#ffddd2'], tags: ['sea', 'pastel'] },
  { colours: ['#001219', '#005f73', '#0a9396', '#94d2bd'], tags: ['sea', 'night'] },
  { colours: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff'], tags: ['candy', 'retro'] },
  { colours: ['#f72585', '#7209b7', '#3a0ca3', '#4361ee'], tags: ['neon', 'night'] },
  { colours: ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec'], tags: ['neon', 'candy'] },
  { colours: ['#edede9', '#d6ccc2', '#f5ebe0', '#d5bdaf'], tags: ['pastel', 'vintage'] },
  { colours: ['#cb997e', '#ddbea9', '#ffe8d6', '#b7b7a4'], tags: ['earth', 'vintage'] },
  { colours: ['#606c38', '#283618', '#fefae0', '#dda15e'], tags: ['nature', 'earth'] },
  { colours: ['#432818', '#99582a', '#bb9457', '#ffe6a7'], tags: ['coffee', 'vintage'] },
  { colours: ['#22223b', '#4a4e69', '#9a8c98', '#c9ada7'], tags: ['vintage', 'mono'] },
  { colours: ['#eaac8b', '#e56b6f', '#b56576', '#6d597a'], tags: ['sunset', 'vintage'] },
  { colours: ['#ffcdb2', '#ffb4a2', '#e5989b', '#b5838d'], tags: ['pastel', 'sunset'] },
  { colours: ['#f8f9fa', '#e9ecef', '#adb5bd', '#212529'], tags: ['mono'] },
  { colours: ['#000000', '#14213d', '#fca311', '#e5e5e5'], tags: ['mono', 'night'] },
  { colours: ['#d8f3dc', '#95d5b2', '#52b788', '#1b4332'], tags: ['nature', 'mono'] },
  { colours: ['#ffe5ec', '#ffc2d1', '#ff8fab', '#fb6f92'], tags: ['candy', 'pastel'] },
  { colours: ['#dec9e9', '#c19ee0', '#9163cb', '#5a189a'], tags: ['candy', 'mono'] },
  { colours: ['#0b132b', '#1c2541', '#3a506b', '#5bc0be'], tags: ['night', 'sea'] },
  { colours: ['#fdfcdc', '#fed9b7', '#f07167', '#00afb9'], tags: ['sunset', 'sea'] },
  { colours: ['#463f3a', '#8a817c', '#bcb8b1', '#f4f3ee'], tags: ['mono', 'vintage'] },
  { colours: ['#5f0f40', '#9a031e', '#fb8b24', '#e36414'], tags: ['sunset', 'retro'] },
  { colours: ['#233d4d', '#fe7f2d', '#fcca46', '#a1c181'], tags: ['retro', 'nature'] },
  { colours: ['#faf3dd', '#c8d5b9', '#8fc0a9', '#68b0ab'], tags: ['nature', 'pastel'] },
  { colours: ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c'], tags: ['mono', 'neon'] },
  { colours: ['#3d348b', '#7678ed', '#f7b801', '#f18701'], tags: ['retro', 'neon'] },
  { colours: ['#540b0e', '#9e2a2b', '#e09f3e', '#fff3b0'], tags: ['vintage', 'sunset'] },
  { colours: ['#04395e', '#70a288', '#dab785', '#d5896f'], tags: ['earth', 'vintage'] },
  { colours: ['#0d1b2a', '#1b263b', '#415a77', '#e0e1dd'], tags: ['night', 'mono'] }
]
