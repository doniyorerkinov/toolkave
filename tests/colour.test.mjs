/**
 * Colour maths against published numbers.
 *
 * Every value here comes from a standard or a reference implementation, not
 * from running this code and writing down what it said — otherwise the test
 * only proves the code is consistent with itself.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

register('./helpers/alias-loader.mjs', import.meta.url)
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const c = await import(pathToFileURL(path.join(ROOT, 'shared/colour.ts')).href)

const near = (actual, expected, tolerance, what) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: expected ${expected} +/- ${tolerance}, got ${actual}`
  )

test('hex parsing takes every spelling people use', () => {
  assert.deepEqual(c.parseColour('#fff'), { r: 255, g: 255, b: 255 })
  assert.deepEqual(c.parseColour('4169e1'), { r: 65, g: 105, b: 225 })
  assert.deepEqual(c.parseColour('#4169E1FF'), { r: 65, g: 105, b: 225 })
  assert.deepEqual(c.parseColour('rgb(65, 105, 225)'), { r: 65, g: 105, b: 225 })
  assert.deepEqual(c.parseColour('rgb(65 105 225 / 50%)'), { r: 65, g: 105, b: 225 })
  assert.deepEqual(c.parseColour('royalblue'), { r: 65, g: 105, b: 225 })
  assert.equal(c.parseColour('#12'), null)
  assert.equal(c.parseColour('not a colour'), null)
  assert.equal(c.parseColour(''), null)
})

test('HSL round-trips, and matches known values', () => {
  const hsl = c.rgbToHsl({ r: 65, g: 105, b: 225 })
  near(hsl.h, 225, 0.5, 'hue')
  near(hsl.s, 0.73, 0.01, 'saturation')
  near(hsl.l, 0.568, 0.01, 'lightness')

  for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff80', '#123456', '#7f7f7f']) {
    const rgb = c.hexToRgb(hex)
    assert.equal(c.rgbToHex(c.hslToRgb(c.rgbToHsl(rgb))), hex, hex + ' through HSL')
    assert.equal(c.rgbToHex(c.hsvToRgb(c.rgbToHsv(rgb))), hex, hex + ' through HSV')
    assert.equal(c.rgbToHex(c.cmykToRgb(c.rgbToCmyk(rgb))), hex, hex + ' through CMYK')
  }
})

test('contrast ratios are the ones WCAG publishes', () => {
  near(c.contrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }), 21, 0.001, 'black on white')
  near(c.contrast({ r: 255, g: 255, b: 255 }, { r: 255, g: 255, b: 255 }), 1, 0.001, 'white on white')
  near(c.contrast(c.hexToRgb('#767676'), c.hexToRgb('#ffffff')), 4.54, 0.02, 'the AA grey')
  near(c.contrast(c.hexToRgb('#777777'), c.hexToRgb('#ffffff')), 4.48, 0.02, 'one shade lighter')

  const verdict = c.judgeContrast(c.hexToRgb('#767676'), c.hexToRgb('#ffffff'))
  assert.equal(verdict.aaNormal, true)
  assert.equal(verdict.aaaNormal, false)
  assert.equal(c.judgeContrast(c.hexToRgb('#777777'), c.hexToRgb('#ffffff')).aaNormal, false)
})

test('relative luminance matches the sRGB primaries', () => {
  near(c.luminance({ r: 255, g: 0, b: 0 }), 0.2126, 0.0001, 'red')
  near(c.luminance({ r: 0, g: 255, b: 0 }), 0.7152, 0.0001, 'green')
  near(c.luminance({ r: 0, g: 0, b: 255 }), 0.0722, 0.0001, 'blue')
  near(c.luminance({ r: 255, g: 255, b: 255 }), 1, 0.0001, 'white')
})

test('Lab puts white and the greys where CIE says', () => {
  const white = c.rgbToLab({ r: 255, g: 255, b: 255 })
  near(white.l, 100, 0.01, 'white L')
  near(white.a, 0, 0.01, 'white a')
  near(white.b, 0, 0.01, 'white b')
  near(c.rgbToLab(c.hexToRgb('#808080')).l, 53.585, 0.05, 'mid grey L')
  assert.equal(c.rgbToHex(c.labToRgb(c.rgbToLab(c.hexToRgb('#c2410c')))), '#c2410c')
})

test('OKLab agrees with Ottosson on white, and round-trips', () => {
  const white = c.rgbToOklab({ r: 255, g: 255, b: 255 })
  near(white.l, 1, 0.001, 'white L')
  near(white.a, 0, 0.001, 'white a')
  for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#c2410c', '#123456']) {
    assert.equal(c.rgbToHex(c.oklabToRgb(c.rgbToOklab(c.hexToRgb(hex)))), hex, hex + ' through OKLab')
    assert.equal(c.rgbToHex(c.oklchToRgb(c.rgbToOklch(c.hexToRgb(hex)))), hex, hex + ' through OKLCH')
  }
})

test('harmonies step around the wheel by the right angles', () => {
  const base = c.hexToRgb('#ff0000')
  const [, complement] = c.harmony(base, 'complementary')
  assert.equal(c.rgbToHex(complement), '#00ffff', 'red opposite is cyan')
  const triad = c.harmony(base, 'triadic').map(c.rgbToHex)
  assert.deepEqual(triad, ['#ff0000', '#00ff00', '#0000ff'], 'a third of the wheel each way')
  assert.equal(c.harmony(base, 'monochromatic').length, 5)
})

test('colour blindness simulation collapses the confusable pair', () => {
  const red = c.hexToRgb('#ff0000')
  const green = c.hexToRgb('#00ff00')
  const apart = c.difference(red, green)
  const seen = c.difference(c.simulate(red, 'deuteranopia'), c.simulate(green, 'deuteranopia'))
  assert.ok(seen < apart / 2, 'red and green should collapse: ' + apart + ' -> ' + seen)
  const kept = c.difference(
    c.simulate(c.hexToRgb('#0000ff'), 'deuteranopia'),
    c.simulate(c.hexToRgb('#ffff00'), 'deuteranopia')
  )
  assert.ok(kept > 50, 'blue and yellow should survive: ' + kept)
  const grey = c.simulate(c.hexToRgb('#c2410c'), 'achromatopsia')
  assert.equal(grey.r, grey.g)
  assert.equal(grey.g, grey.b)
})

test('mixing goes the perceptual way, not through mud', () => {
  assert.equal(c.rgbToHex(c.mix(c.hexToRgb('#000000'), c.hexToRgb('#ffffff'), 0, 'srgb')), '#000000')
  assert.equal(c.rgbToHex(c.mix(c.hexToRgb('#000000'), c.hexToRgb('#ffffff'), 1, 'srgb')), '#ffffff')
  const middle = c.mix(c.hexToRgb('#0000ff'), c.hexToRgb('#ffff00'), 0.5)
  const chroma = c.rgbToOklch(middle).c
  assert.ok(chroma > 0.02, 'midpoint should not be grey, chroma was ' + chroma)
  const steps = c.ramp(c.hexToRgb('#000000'), c.hexToRgb('#ffffff'), 5)
  assert.equal(steps.length, 5)
  assert.equal(c.rgbToHex(steps[0]), '#000000')
  assert.equal(c.rgbToHex(steps[4]), '#ffffff')
})

test('a scale runs dark to light with no repeats', () => {
  const steps = c.scale(c.hexToRgb('#c2410c'), 11)
  assert.equal(steps.length, 11)
  const lightness = steps.map(step => c.luminance(step))
  for (let i = 1; i < lightness.length; i++) {
    assert.ok(lightness[i] > lightness[i - 1], 'step ' + i + ' should be lighter than ' + (i - 1))
  }
})

test('readableOn picks the one you can actually read', () => {
  assert.equal(c.rgbToHex(c.readableOn(c.hexToRgb('#ffffff'))), '#000000')
  assert.equal(c.rgbToHex(c.readableOn(c.hexToRgb('#000000'))), '#ffffff')
  assert.equal(c.rgbToHex(c.readableOn(c.hexToRgb('#c2410c'))), '#ffffff')
})
