/**
 * Compress recompresses embedded JPEGs and nothing else. The canvas it
 * decodes and re-encodes through is a browser API, so the shim supplies one
 * for the duration of the call only — pdf.js renders afterwards without it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pdf, lib, held, noisyJpeg, render, pageTexts, inkFraction, installBrowserShims } from './helpers/pdf.mjs'

const { PDFDocument, PDFName, PDFRawStream, StandardFonts } = lib

/** A page with an embedded JPEG and a line of real text; `mutate` gets the image dict before saving. */
async function photoPdf({ pages = 1, jpeg = noisyJpeg(), text = 'Hello compress', mutate } = {}) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const image = await doc.embedJpg(jpeg)
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([600, 800])
    page.drawImage(image, { x: 50, y: 200, width: 500, height: 375 })
    page.drawText(text, { x: 50, y: 700, size: 24, font })
  }
  if (mutate) {
    await image.embed()
    mutate(doc.context.lookup(image.ref).dict, doc)
  }
  return await doc.save()
}

/** The first Image XObject reachable from page 1. */
async function firstImage(bytes) {
  const doc = await PDFDocument.load(bytes)
  const xobjects = doc.getPage(0).node.Resources().lookup(PDFName.of('XObject'))
  for (const [, ref] of xobjects.entries()) {
    const stream = doc.context.lookup(ref)
    if (stream instanceof PDFRawStream) return { dict: stream.dict, bytes: stream.getContents() }
  }
  throw new Error('no image on page 1')
}

async function compress(bytes, options) {
  const uninstall = installBrowserShims()
  try {
    return await pdf.compressPdf(held(bytes), options)
  } finally {
    uninstall()
  }
}

test('a photo-heavy PDF shrinks, its text is untouched and the image is downsampled', async () => {
  const source = await photoPdf()
  const result = await compress(source, { quality: 0.6, maxDimension: 800 })
  assert.equal(result.imagesCompressed, 1)
  assert.equal(result.imagesSkipped, 0)
  assert.ok(result.data.byteLength < source.byteLength * 0.8, `${result.data.byteLength} vs ${source.byteLength}`)
  assert.deepEqual(await pageTexts(result.data), await pageTexts(source))
  const { dict } = await firstImage(result.data)
  assert.equal(dict.get(PDFName.of('Width')).asNumber(), 800)
  assert.equal(dict.get(PDFName.of('Height')).asNumber(), 600)
  const [page] = await render(result.data, 0.5)
  assert.ok(inkFraction(page.canvas, [25, 112, 275, 300]) > 0.9, 'the image still renders where it was')
})

test('a text-only PDF has nothing to compress and says so', async () => {
  const doc = await PDFDocument.create()
  doc.addPage().drawText('Just text', { x: 50, y: 700, size: 24, font: await doc.embedFont(StandardFonts.Helvetica) })
  const result = await compress(await doc.save())
  assert.deepEqual([result.imagesCompressed, result.imagesSkipped], [0, 0])
})

test('an image shared by several pages is recompressed once, not once per page', async () => {
  const result = await compress(await photoPdf({ pages: 3 }), { quality: 0.6, maxDimension: 800 })
  assert.equal(result.imagesCompressed, 1)
  assert.equal(result.imagesSkipped, 0)
  const pages = await render(result.data, 0.25)
  for (const page of pages) assert.ok(inkFraction(page.canvas, [13, 56, 137, 150]) > 0.9, 'every page still shows the image')
})

test('the array spelling of /Filter is recognised', async () => {
  const source = await photoPdf({ mutate: (dict, doc) => dict.set(PDFName.of('Filter'), doc.context.obj([PDFName.of('DCTDecode')])) })
  const result = await compress(source, { quality: 0.6, maxDimension: 800 })
  assert.equal(result.imagesCompressed, 1)
  const { dict } = await firstImage(result.data)
  assert.equal(dict.get(PDFName.of('Filter')).decodeText(), 'DCTDecode')
})

test('an image with a /Decode array is left alone', async () => {
  const source = await photoPdf({ mutate: (dict, doc) => dict.set(PDFName.of('Decode'), doc.context.obj([1, 0, 1, 0, 1, 0])) })
  const result = await compress(source)
  assert.deepEqual([result.imagesCompressed, result.imagesSkipped], [0, 1])
})

test('an image with a soft mask is re-encoded but not downsampled', async () => {
  const source = await photoPdf({
    mutate: (dict, doc) => {
      const mask = doc.context.flateStream(new Uint8Array(1200 * 900).fill(255), {
        Type: 'XObject', Subtype: 'Image', Width: 1200, Height: 900, ColorSpace: 'DeviceGray', BitsPerComponent: 8
      })
      dict.set(PDFName.of('SMask'), doc.context.register(mask))
    }
  })
  const result = await compress(source, { quality: 0.5, maxDimension: 800 })
  assert.equal(result.imagesCompressed, 1)
  const { dict } = await firstImage(result.data)
  assert.equal(dict.get(PDFName.of('Width')).asNumber(), 1200, 'dimensions kept so the mask still fits')
})

test('a tiny image is not worth touching', async () => {
  const result = await compress(await photoPdf({ jpeg: noisyJpeg(120, 90, 80) }))
  assert.deepEqual([result.imagesCompressed, result.imagesSkipped], [0, 1])
})

test('a gray JPEG comes back declared as RGB, since that is what the canvas produced', async () => {
  const source = await photoPdf({ mutate: dict => dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceGray')) })
  const result = await compress(source, { quality: 0.6, maxDimension: 800 })
  assert.equal(result.imagesCompressed, 1)
  const { dict } = await firstImage(result.data)
  assert.equal(dict.get(PDFName.of('ColorSpace')).decodeText(), 'DeviceRGB')
  assert.equal(dict.get(PDFName.of('BitsPerComponent')).asNumber(), 8)
})
