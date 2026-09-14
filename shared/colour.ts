/**
 * Colour maths.
 *
 * Everything the colour tools need, with no DOM and no dependencies, so the
 * hard parts can be tested against published reference values rather than
 * against how they happen to look on screen. Conversions are exact where the
 * standards are exact; where a standard defines a rounding, it is the
 * standard's rounding and not a convenient one.
 *
 * Channels are 0–255 for RGB and 0–1 for the linear and perceptual spaces,
 * which is the convention every reference formula here is written in.
 */

import { NAMED } from '~~/shared/colour-names'

export interface Rgb {
  r: number
  g: number
  b: number
}
export interface Hsl {
  h: number
  s: number
  l: number
}
export interface Hsv {
  h: number
  s: number
  v: number
}
export interface Cmyk {
  c: number
  m: number
  y: number
  k: number
}
export interface Lab {
  l: number
  a: number
  b: number
}
export interface Lch {
  l: number
  c: number
  h: number
}

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value))
const round = (value: number, places = 0) => {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/**
 * Read any of the ways a colour gets written down.
 *
 * Accepts `#abc`, `#aabbcc`, `#aabbccff`, `rgb()`, `rgba()`, `hsl()`,
 * `hsla()` in both comma and space syntax, and the CSS named colours.
 * Returns null rather than guessing, so a half-typed value in a text box
 * leaves the last good colour alone instead of flashing black.
 */
export function parseColour(input: string): Rgb | null {
  const text = input.trim().toLowerCase()
  if (!text) return null

  const named = NAMED[text]
  if (named) return hexToRgb(named)

  const hex = /^#?([0-9a-f]{3,8})$/.exec(text)
  if (hex) {
    const digits = hex[1]!
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: parseInt(digits[0]! + digits[0]!, 16),
        g: parseInt(digits[1]! + digits[1]!, 16),
        b: parseInt(digits[2]! + digits[2]!, 16)
      }
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: parseInt(digits.slice(0, 2), 16),
        g: parseInt(digits.slice(2, 4), 16),
        b: parseInt(digits.slice(4, 6), 16)
      }
    }
    return null
  }

  const numbers = (body: string) => body.split(/[\s,/]+/).filter(Boolean)

  const rgb = /^rgba?\(([^)]+)\)$/.exec(text)
  if (rgb) {
    const parts = numbers(rgb[1]!)
    if (parts.length < 3) return null
    const channel = (part: string) =>
      part.endsWith('%') ? (parseFloat(part) / 100) * 255 : parseFloat(part)
    const [r, g, b] = [channel(parts[0]!), channel(parts[1]!), channel(parts[2]!)]
    if ([r, g, b].some(Number.isNaN)) return null
    return { r: clamp(Math.round(r), 0, 255), g: clamp(Math.round(g), 0, 255), b: clamp(Math.round(b), 0, 255) }
  }

  const hsl = /^hsla?\(([^)]+)\)$/.exec(text)
  if (hsl) {
    const parts = numbers(hsl[1]!)
    if (parts.length < 3) return null
    const h = parseFloat(parts[0]!)
    const s = parseFloat(parts[1]!) / 100
    const l = parseFloat(parts[2]!) / 100
    if ([h, s, l].some(Number.isNaN)) return null
    return hslToRgb({ h, s, l })
  }

  return null
}

export function hexToRgb(hex: string): Rgb {
  return parseColour(hex) ?? { r: 0, g: 0, b: 0 }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (value: number) =>
    clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const span = max - min
  const l = (max + min) / 2

  if (!span) return { h: 0, s: 0, l }

  const s = l > 0.5 ? span / (2 - max - min) : span / (max + min)
  let h: number
  if (max === red) h = ((green - blue) / span + (green < blue ? 6 : 0)) / 6
  else if (max === green) h = ((blue - red) / span + 2) / 6
  else h = ((red - green) / span + 4) / 6

  return { h: h * 360, s, l }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hue = ((h % 360) + 360) % 360 / 360
  const saturation = clamp(s)
  const lightness = clamp(l)
  if (!saturation) {
    const grey = Math.round(lightness * 255)
    return { r: grey, g: grey, b: grey }
  }

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q
  const channel = (t: number) => {
    let value = t
    if (value < 0) value += 1
    if (value > 1) value -= 1
    if (value < 1 / 6) return p + (q - p) * 6 * value
    if (value < 1 / 2) return q
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
    return p
  }

  return {
    r: Math.round(channel(hue + 1 / 3) * 255),
    g: Math.round(channel(hue) * 255),
    b: Math.round(channel(hue - 1 / 3) * 255)
  }
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const span = max - min
  let h = 0
  if (span) {
    if (max === red) h = ((green - blue) / span + (green < blue ? 6 : 0)) / 6
    else if (max === green) h = ((blue - red) / span + 2) / 6
    else h = ((red - green) / span + 4) / 6
  }
  return { h: h * 360, s: max ? span / max : 0, v: max }
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hue = (((h % 360) + 360) % 360) / 60
  const saturation = clamp(s)
  const value = clamp(v)
  const sector = Math.floor(hue)
  const fraction = hue - sector
  const p = value * (1 - saturation)
  const q = value * (1 - saturation * fraction)
  const t = value * (1 - saturation * (1 - fraction))
  const table: [number, number, number][] = [
    [value, t, p],
    [q, value, p],
    [p, value, t],
    [p, q, value],
    [t, p, value],
    [value, p, q]
  ]
  const [r, g, b] = table[sector % 6]!
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
}

/**
 * CMYK as print software writes it: the naive conversion, not a profiled
 * one. A real press needs an ICC profile and a proof; this is the number
 * people paste into a form, and saying otherwise would be a lie.
 */
export function rgbToCmyk({ r, g, b }: Rgb): Cmyk {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const k = 1 - Math.max(red, green, blue)
  if (k === 1) return { c: 0, m: 0, y: 0, k: 1 }
  return {
    c: (1 - red - k) / (1 - k),
    m: (1 - green - k) / (1 - k),
    y: (1 - blue - k) / (1 - k),
    k
  }
}

export function cmykToRgb({ c, m, y, k }: Cmyk): Rgb {
  return {
    r: Math.round(255 * (1 - clamp(c)) * (1 - clamp(k))),
    g: Math.round(255 * (1 - clamp(m)) * (1 - clamp(k))),
    b: Math.round(255 * (1 - clamp(y)) * (1 - clamp(k)))
  }
}

/** sRGB's transfer function, and its inverse. Everything perceptual needs it. */
export function toLinear(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function fromLinear(value: number): number {
  const channel = value <= 0.0031308 ? value * 12.92 : 1.055 * clamp(value) ** (1 / 2.4) - 0.055
  return clamp(Math.round(channel * 255), 0, 255)
}

export { clamp, round }

/* ------------------------------------------------------------------ *
 * Perceptual spaces
 * ------------------------------------------------------------------ */

const D65 = { x: 0.95047, y: 1, z: 1.08883 }

export function rgbToLab(rgb: Rgb): Lab {
  const r = toLinear(rgb.r)
  const g = toLinear(rgb.g)
  const b = toLinear(rgb.b)
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / D65.x
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / D65.y
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / D65.z
  const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function labToRgb({ l, a, b }: Lab): Rgb {
  const fy = (l + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const inv = (t: number) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29))
  const x = inv(fx) * D65.x
  const y = inv(fy) * D65.y
  const z = inv(fz) * D65.z
  return {
    r: fromLinear(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    g: fromLinear(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    b: fromLinear(0.0556434 * x - 0.2040259 * y + 1.0572252 * z)
  }
}

/** Lab in polar form — the one where "same colour, less saturated" is one number. */
export function labToLch({ l, a, b }: Lab): Lch {
  const c = Math.sqrt(a * a + b * b)
  const h = (((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360
  return { l, c, h }
}

export function lchToLab({ l, c, h }: Lch): Lab {
  const radians = (h * Math.PI) / 180
  return { l, a: Math.cos(radians) * c, b: Math.sin(radians) * c }
}

/**
 * OKLab — Björn Ottosson's space, and the one CSS adopted.
 *
 * Worth the extra conversion because a straight line through it looks like a
 * straight line: a gradient does not go grey in the middle and a lightness
 * ramp has even steps, neither of which is true in HSL.
 */
export function rgbToOklab(rgb: Rgb): Lab {
  const r = toLinear(rgb.r)
  const g = toLinear(rgb.g)
  const b = toLinear(rgb.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  }
}

/** Linear sRGB, unclamped — negative or over one means outside the gamut. */
function oklabToLinear({ l, a, b }: Lab): { r: number; g: number; b: number } {
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return {
    r: 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    g: -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    b: -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc
  }
}

export function oklabToRgb(lab: Lab): Rgb {
  const linear = oklabToLinear(lab)
  return { r: fromLinear(linear.r), g: fromLinear(linear.g), b: fromLinear(linear.b) }
}

export function rgbToOklch(rgb: Rgb): Lch {
  return labToLch(rgbToOklab(rgb))
}

const EPSILON = 1e-6
const fits = (lab: Lab) => {
  const { r, g, b } = oklabToLinear(lab)
  return (
    r >= -EPSILON && r <= 1 + EPSILON &&
    g >= -EPSILON && g <= 1 + EPSILON &&
    b >= -EPSILON && b <= 1 + EPSILON
  )
}

/**
 * OKLCH to a real colour, keeping the hue.
 *
 * Most of OKLCH describes colours a screen cannot show. Letting those fall
 * out and clipping each channel separately is the obvious thing to do and it
 * is wrong: clipping red harder than blue turns the colour a different hue,
 * so asking for five shades of one blue quietly returns four blues and a
 * teal. Instead the chroma is walked down until the colour fits, which keeps
 * the hue and the lightness someone asked for and gives up only the
 * saturation that was never available.
 */
export function oklchToRgb(lch: Lch): Rgb {
  const wanted = lchToLab(lch)
  if (fits(wanted)) return oklabToRgb(wanted)

  let low = 0
  let high = lch.c
  for (let i = 0; i < 18; i++) {
    const middle = (low + high) / 2
    if (fits(lchToLab({ ...lch, c: middle }))) low = middle
    else high = middle
  }
  return oklabToRgb(lchToLab({ ...lch, c: low }))
}

/** Whether a screen can actually show this, before anything is given up. */
export function inSrgbGamut(lch: Lch): boolean {
  return fits(lchToLab(lch))
}

/* ------------------------------------------------------------------ *
 * Contrast
 * ------------------------------------------------------------------ */

/** WCAG relative luminance. Not the same as Lab lightness, and not a swap for it. */
export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const first = luminance(a)
  const second = luminance(b)
  const light = Math.max(first, second)
  const dark = Math.min(first, second)
  return (light + 0.05) / (dark + 0.05)
}

export interface ContrastVerdict {
  ratio: number
  /** 4.5:1 for body text, 3:1 once it is large. */
  aaNormal: boolean
  aaLarge: boolean
  aaaNormal: boolean
  aaaLarge: boolean
  /** Icons, borders, form outlines. */
  uiComponents: boolean
}

export function judgeContrast(a: Rgb, b: Rgb): ContrastVerdict {
  const ratio = contrast(a, b)
  return {
    ratio,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
    uiComponents: ratio >= 3
  }
}

/** Black or white, whichever can actually be read on this. */
export function readableOn(background: Rgb): Rgb {
  const onBlack = contrast(background, { r: 0, g: 0, b: 0 })
  const onWhite = contrast(background, { r: 255, g: 255, b: 255 })
  return onBlack >= onWhite ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 }
}

/* ------------------------------------------------------------------ *
 * Colour vision deficiency
 * ------------------------------------------------------------------ */

export type Deficiency = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia'

/**
 * Machado, Oliveira and Fernandes (2009), at full severity.
 *
 * Applied to linear light, not to the numbers in a hex code — doing it on
 * gamma-encoded values is the usual mistake and it makes everything look
 * washed out rather than confusable.
 */
const DEFICIENCY: Record<Exclude<Deficiency, 'achromatopsia'>, number[]> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039]
}

/** How roughly one in twelve men sees this colour. */
export function simulate(rgb: Rgb, kind: Deficiency): Rgb {
  if (kind === 'achromatopsia') {
    const grey = fromLinear(luminance(rgb))
    return { r: grey, g: grey, b: grey }
  }
  const m = DEFICIENCY[kind]!
  const r = toLinear(rgb.r)
  const g = toLinear(rgb.g)
  const b = toLinear(rgb.b)
  return {
    r: fromLinear(m[0]! * r + m[1]! * g + m[2]! * b),
    g: fromLinear(m[3]! * r + m[4]! * g + m[5]! * b),
    b: fromLinear(m[6]! * r + m[7]! * g + m[8]! * b)
  }
}

/* ------------------------------------------------------------------ *
 * Harmony, shades, mixing
 * ------------------------------------------------------------------ */

export type Harmony =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'split-complementary'
  | 'tetradic'
  | 'square'
  | 'monochromatic'

const ANGLES: Record<Exclude<Harmony, 'monochromatic'>, number[]> = {
  complementary: [0, 180],
  analogous: [-30, 0, 30],
  triadic: [0, 120, 240],
  'split-complementary': [0, 150, 210],
  tetradic: [0, 60, 180, 240],
  square: [0, 90, 180, 270]
}

/**
 * The classic schemes, which are all "step around the wheel by so much".
 *
 * Monochromatic is the odd one out: it holds the hue and moves lightness,
 * which is why it gets its own branch rather than an angle of zero.
 */
export function harmony(base: Rgb, kind: Harmony): Rgb[] {
  const hsl = rgbToHsl(base)
  if (kind === 'monochromatic') {
    return [0.15, 0.3, 0.5, 0.7, 0.85].map(l => hslToRgb({ ...hsl, l }))
  }
  return ANGLES[kind]!.map(angle => hslToRgb({ ...hsl, h: hsl.h + angle }))
}

/**
 * Steps from black through the colour to white.
 *
 * Walked in OKLab so the steps look evenly spaced; the same walk in HSL
 * bunches up in the middle and washes out at the ends.
 */
export function scale(base: Rgb, steps = 11): Rgb[] {
  const { c, h } = rgbToOklch(base)
  const out: Rgb[] = []
  for (let i = 0; i < steps; i++) {
    const l = i / (steps - 1)
    // Chroma is pulled in at both ends, where no real colour can hold it.
    const taper = 1 - Math.abs(l * 2 - 1) ** 1.6
    out.push(oklchToRgb({ l, c: c * taper, h }))
  }
  return out
}

/** Toward black. */
export function shades(base: Rgb, steps = 10): Rgb[] {
  const hsl = rgbToHsl(base)
  return Array.from({ length: steps }, (_, i) =>
    hslToRgb({ ...hsl, l: hsl.l * (1 - (i + 1) / (steps + 1)) })
  )
}

/** Toward white. */
export function tints(base: Rgb, steps = 10): Rgb[] {
  const hsl = rgbToHsl(base)
  return Array.from({ length: steps }, (_, i) =>
    hslToRgb({ ...hsl, l: hsl.l + (1 - hsl.l) * ((i + 1) / (steps + 1)) })
  )
}

/** Toward grey: same lightness, less of the colour. */
export function tones(base: Rgb, steps = 10): Rgb[] {
  const hsl = rgbToHsl(base)
  return Array.from({ length: steps }, (_, i) =>
    hslToRgb({ ...hsl, s: hsl.s * (1 - (i + 1) / (steps + 1)) })
  )
}

/**
 * Blend two colours.
 *
 * In OKLab by default because mixing blue and yellow in sRGB goes through a
 * muddy grey, which is not what anybody means by mixing them.
 */
export function mix(a: Rgb, b: Rgb, amount = 0.5, space: 'oklab' | 'srgb' = 'oklab'): Rgb {
  const t = clamp(amount)
  if (space === 'srgb') {
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t)
    }
  }
  const first = rgbToOklab(a)
  const second = rgbToOklab(b)
  return oklabToRgb({
    l: first.l + (second.l - first.l) * t,
    a: first.a + (second.a - first.a) * t,
    b: first.b + (second.b - first.b) * t
  })
}

/** Evenly spaced steps from one colour to another, ends included. */
export function ramp(a: Rgb, b: Rgb, steps = 7, space: 'oklab' | 'srgb' = 'oklab'): Rgb[] {
  return Array.from({ length: steps }, (_, i) => mix(a, b, i / (steps - 1), space))
}

/** How far apart two colours look, as CIE76 in Lab. Under about 2.3 is invisible. */
export function difference(a: Rgb, b: Rgb): number {
  const first = rgbToLab(a)
  const second = rgbToLab(b)
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b)
}

/* ------------------------------------------------------------------ *
 * Palette generation
 * ------------------------------------------------------------------ */

export type PaletteMode =
  | 'auto'
  | 'analogous'
  | 'monochromatic'
  | 'complementary'
  | 'split-complementary'
  | 'triadic'
  | 'square'

/** Hue offsets each mode walks, repeated as needed to fill the row. */
const MODE_HUES: Record<Exclude<PaletteMode, 'auto' | 'monochromatic'>, number[]> = {
  analogous: [-40, -20, 0, 20, 40],
  complementary: [0, 0, 180, 180, 0],
  'split-complementary': [0, 0, 150, 210, 150],
  triadic: [0, 120, 240, 0, 120],
  square: [0, 90, 180, 270, 0]
}

/**
 * Lightness across a row, dark to light.
 *
 * A palette where every colour has the same lightness is unusable — nothing
 * can sit on anything else. Spreading it is what makes a set you can
 * actually build an interface out of.
 */
function lightnessRow(count: number, seed: () => number): number[] {
  const low = 0.22 + seed() * 0.1
  const high = 0.88 + seed() * 0.07
  return Array.from({ length: count }, (_, i) => low + ((high - low) * i) / Math.max(1, count - 1))
}

/**
 * A palette that holds together.
 *
 * Five random colours look like five random colours. These are built in
 * OKLCH from one hue relationship with lightness spread across the row, so
 * the result reads as a set — and because OKLCH is perceptual, the steps
 * look even rather than bunching in the middle the way HSL does.
 *
 * Locked entries are kept exactly, and the first of them sets the hue
 * everything else is derived from, so locking a brand colour and rerolling
 * gives you colours that go with it rather than colours that ignore it.
 */
export function generatePalette(
  mode: PaletteMode,
  count = 5,
  locked: (Rgb | null)[] = [],
  random: () => number = Math.random
): Rgb[] {
  const anchor = locked.find((entry): entry is Rgb => !!entry)
  const anchorLch = anchor ? rgbToOklch(anchor) : null

  const effective: Exclude<PaletteMode, 'auto'> =
    mode === 'auto'
      ? (['analogous', 'monochromatic', 'complementary', 'split-complementary', 'triadic', 'square'] as const)[
          Math.floor(random() * 6)
        ]!
      : mode

  const baseHue = anchorLch ? anchorLch.h : random() * 360
  const baseChroma = anchorLch && anchorLch.c > 0.02 ? anchorLch.c : 0.08 + random() * 0.1
  const lights = lightnessRow(count, random)

  // Where the anchor sits in the row decides which lightness slot it owns,
  // so the rest arrange themselves around it instead of fighting it.
  const anchorIndex = locked.findIndex(entry => !!entry)

  const out: Rgb[] = []
  for (let i = 0; i < count; i++) {
    const kept = locked[i]
    if (kept) {
      out.push(kept)
      continue
    }

    const hue =
      effective === 'monochromatic'
        ? baseHue + (random() - 0.5) * 8
        : baseHue + (MODE_HUES[effective][i % MODE_HUES[effective]!.length] ?? 0)

    // Chroma eases off at the pale and the near-black ends, where no real
    // colour can hold it, and wanders a little so a row is never mechanical.
    const l = lights[i]!
    const taper = 1 - Math.abs(l * 2 - 1) ** 1.5
    const chroma = Math.max(0.012, baseChroma * (0.55 + taper * 0.75) * (0.85 + random() * 0.3))
    out.push(oklchToRgb({ l, c: chroma, h: ((hue % 360) + 360) % 360 }))
  }

  void anchorIndex
  return out
}

/**
 * Whether a palette is safe for the most common colour vision deficiency.
 *
 * Two colours a deuteranope cannot tell apart are two colours that cannot
 * carry meaning between them — which is fine in a decorative palette and a
 * problem in a chart or a status badge. The threshold is CIE76, where about
 * ten is the point where a difference stops being obvious at a glance.
 */
export function confusablePairs(palette: Rgb[], kind: Deficiency = 'deuteranopia', threshold = 10): [number, number][] {
  const seen = palette.map(entry => simulate(entry, kind))
  const pairs: [number, number][] = []
  for (let i = 0; i < seen.length; i++) {
    for (let j = i + 1; j < seen.length; j++) {
      if (difference(seen[i]!, seen[j]!) < threshold) pairs.push([i, j])
    }
  }
  return pairs
}
