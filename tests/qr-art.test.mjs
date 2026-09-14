/**
 * A QR code with a logo on it, decoded back.
 *
 * The whole risk of this feature is that it looks right and does not scan —
 * silently, on somebody else's phone, after it has been printed on five
 * hundred flyers. So the test is not "did it draw something": it draws the
 * real thing and reads it back with a decoder.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import jsQR from 'jsqr'
import QR from 'qrcode'

register('./helpers/alias-loader.mjs', import.meta.url)
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const { drawQrArt, layout, MAX_LOGO_SCALE } = await import(
  pathToFileURL(path.join(ROOT, 'shared/qr-art.ts')).href
)

const PAYLOAD = 'https://toolkave.com/generators/qr-code-generator?utm=test'
const SIZE = 512

/** A stand-in brand mark: a solid disc, the worst case for coverage. */
async function makeLogo(px = 200) {
  const canvas = createCanvas(px, px)
  const context = canvas.getContext('2d')
  context.fillStyle = '#c2410c'
  context.beginPath()
  context.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2)
  context.fill()
  return loadImage(canvas.toBuffer('image/png'))
}

async function render({ logoScale = 0, above = '', below = '', level = 'H' } = {}) {
  const qrPng = await QR.toBuffer(PAYLOAD, {
    width: SIZE,
    margin: 2,
    errorCorrectionLevel: level,
    color: { dark: '#000000', light: '#ffffff' }
  })
  const qr = await loadImage(qrPng)
  const logo = logoScale ? await makeLogo() : null

  const options = {
    qr,
    qrSize: SIZE,
    logo: logo ? { image: logo, width: logo.width, height: logo.height } : null,
    logoScale,
    above,
    below
  }
  const plan = layout(options)
  const canvas = createCanvas(plan.width, plan.height)
  drawQrArt(canvas.getContext('2d'), options)
  return { canvas, plan }
}

/** Read the code back out of the finished image. */
function decode(canvas) {
  const context = canvas.getContext('2d')
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
  return jsQR(Uint8ClampedArray.from(data), width, height)?.data ?? null
}

test('a plain code still decodes after being redrawn', async () => {
  const { canvas } = await render()
  assert.equal(decode(canvas), PAYLOAD)
})

test('a code with a logo in the middle still decodes', async () => {
  for (const scale of [0.1, 0.15, 0.2, 0.3]) {
    const { canvas } = await render({ logoScale: scale })
    assert.equal(decode(canvas), PAYLOAD, `logo at ${Math.round(scale * 100)}% of the width`)
  }
})

test('captions do not disturb the code', async () => {
  const { canvas, plan } = await render({
    logoScale: 0.18,
    above: 'Scan for the menu',
    below: 'toolkave.com'
  })
  assert.equal(decode(canvas), PAYLOAD)
  // Captions add height only; the code keeps its own width and quiet zone.
  assert.equal(plan.width, SIZE)
  assert.ok(plan.height > SIZE, 'the captions should have made it taller')
  assert.ok(plan.qrY > 0, 'the code should have been pushed down by the caption above it')
})

test('how much room a logo has depends on the payload, which is why it is checked', async () => {
  const logo = await makeLogo()
  const paint = (qr, scale) => {
    const canvas = createCanvas(SIZE, SIZE)
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, SIZE, SIZE)
    context.drawImage(qr, 0, 0, SIZE, SIZE)
    const box = SIZE * scale
    context.drawImage(logo, (SIZE - box) / 2, (SIZE - box) / 2, box, box)
    return canvas
  }

  const load = async (payload) =>
    loadImage(await QR.toBuffer(payload, { width: SIZE, margin: 2, errorCorrectionLevel: 'H' }))

  const short = 'https://toolkave.com'
  const long = 'WIFI:T:WPA;S:SomeNetworkName;P:a-fairly-long-password-1234567890;H:false;;' + 'x'.repeat(120)

  // At a third of the width, one survives and the other does not. A single
  // fixed cap cannot serve both, which is the case for checking instead.
  assert.equal(decode(paint(await load(long), 0.45)), long, 'a long payload still has room at 45%')
  assert.equal(decode(paint(await load(short), 0.45)), null, 'a short one gave out well before that')
})

test('the lowest error correction cannot carry a logo, which is why H is forced', async () => {
  const { canvas } = await render({ logoScale: MAX_LOGO_SCALE, level: 'L' })
  assert.equal(decode(canvas), null, 'level L plus a logo is the combination to prevent')
})
