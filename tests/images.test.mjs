/**
 * Preparing images for the PDF embedder, under the canvas shim.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import { image, lib, held, noisyJpeg, installBrowserShims } from './helpers/pdf.mjs'

const { PDFDocument } = lib
const asImage = (data, name, type) => ({ id: name, name, size: data.byteLength, type, data })

async function prepared(files, options) {
  const uninstall = installBrowserShims()
  try {
    return (await image.normaliseForPdf(files, options)).ready
  } finally {
    uninstall()
  }
}

test('original quality: JPG and PNG pass through byte-for-byte, WebP becomes JPEG', async () => {
  const jpg = noisyJpeg(1600, 1200, 90)
  const png = new Uint8Array(createCanvas(300, 200).toBuffer('image/png'))
  const webp = new Uint8Array(createCanvas(300, 200).toBuffer('image/webp', 80))
  const out = await prepared([asImage(jpg, 'a.jpg', 'image/jpeg'), asImage(png, 'b.png', 'image/png'), asImage(webp, 'c.webp', 'image/webp')])
  assert.equal(out[0].data, jpg, 'same bytes, not a copy')
  assert.equal(out[1].data, png)
  assert.equal(image.sniffImage(out[2].data), 'jpeg')
})

test('smaller file: photos are downscaled to the long side and re-encoded; PNG is downscaled but stays PNG', async () => {
  const big = noisyJpeg(3000, 2000, 95)
  const small = noisyJpeg(800, 600, 95)
  const png = new Uint8Array(createCanvas(2400, 1200).toBuffer('image/png'))
  const out = await prepared([asImage(big, 'big.jpg', 'image/jpeg'), asImage(small, 'small.jpg', 'image/jpeg'), asImage(png, 'shot.png', 'image/png')], { maxDimension: 2000, quality: 0.82 })

  assert.ok(out[0].data.byteLength < big.byteLength / 2, `${out[0].data.byteLength} vs ${big.byteLength}`)
  assert.equal(image.sniffImage(out[1].data), 'jpeg')
  assert.notEqual(out[1].data, small, 'a small photo is still re-encoded at the chosen quality')
  assert.equal(image.sniffImage(out[2].data), 'png', 'lossless stays lossless')

  // The embedder reports the real pixel size: 3000x2000 → 2000x1333, 2400x1200 → 2000x1000.
  const doc = await PDFDocument.load(await (async () => { const u = installBrowserShims(); try { return await (await import('file:///D:/PROJECTS/toolkave/app/composables/usePdf.ts')).imagesToPdf(out, 'image') } finally { u() } })())
  const sizes = doc.getPages().map(p => [Math.round(p.getWidth()), Math.round(p.getHeight())])
  assert.deepEqual(sizes, [[2000, 1333], [800, 600], [2000, 1000]])
})
