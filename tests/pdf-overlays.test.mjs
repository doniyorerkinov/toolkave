/**
 * Every overlay tool, on pages stored with each /Rotate value.
 *
 * The fixture pages are blank, so any ink at all is the overlay. Each test
 * asserts the overlay's box has ink, the mirrored position does not, and
 * nothing lands outside the expected boxes — which is what fails when the
 * code draws in unrotated page space on a sideways scan.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pdf, held, rotatedPages, render, inkFraction, inkOutside, artifact, solidPng, ROTATIONS } from './helpers/pdf.mjs'

const NONE = 0.0005

function expectPlaced(pages, boxFor, label) {
  for (const [index, page] of pages.entries()) {
    const boxes = boxFor(page.width, page.height)
    for (const box of boxes) {
      assert.ok(inkFraction(page.canvas, box) > 0.02, `${label}: /Rotate ${ROTATIONS[index]} — no ink in ${box.map(Math.round)}`)
    }
    assert.ok(inkOutside(page.canvas, boxes) < NONE, `${label}: /Rotate ${ROTATIONS[index]} — ink outside the expected boxes`)
  }
}

test('pages keep their /Rotate and display landscape when rotated', async () => {
  const pages = await render(await rotatedPages())
  assert.deepEqual(pages.map(p => p.rotate), ROTATIONS)
  assert.ok(pages[1].width > pages[1].height && pages[3].width > pages[3].height)
  assert.ok(pages[0].width < pages[0].height && pages[2].width < pages[2].height)
})

test('page numbers sit at the bottom centre of the page as displayed', async () => {
  const out = await pdf.addPageNumbers(held(await rotatedPages()), { position: 'bottom-center', startAt: 1, fontSize: 16, skipFirst: false })
  const pages = await render(out)
  artifact('page-numbers', pages)
  expectPlaced(pages, (w, h) => [[w / 2 - 24, h - 48, w / 2 + 24, h - 22]], 'bottom-center')
  for (const page of pages) assert.equal(inkFraction(page.canvas, [page.width / 2 - 24, 22, page.width / 2 + 24, 48]), 0, 'nothing at the top')
})

test('page numbers honour top-right on rotated pages', async () => {
  const out = await pdf.addPageNumbers(held(await rotatedPages()), { position: 'top-right', startAt: 7, fontSize: 16, skipFirst: true })
  const pages = await render(out)
  assert.equal(inkFraction(pages[0].canvas, [0, 0, pages[0].width, pages[0].height]), 0, 'skipFirst leaves page 1 blank')
  expectPlaced(pages.slice(1), (w, h) => [[w - 62, 22, w - 20, 48]], 'top-right')
})

test('header and footer land in the top-left and bottom-left as displayed', async () => {
  const out = await pdf.addHeaderFooter(held(await rotatedPages()), { header: 'HEADER', footer: 'FOOTER', fontSize: 12, align: 'left' })
  const pages = await render(out)
  artifact('header-footer', pages)
  expectPlaced(pages, (w, h) => [[24, 24, 110, 44], [24, h - 44, 110, h - 24]], 'header/footer')
})

test('watermark crosses the centre and stays clear of the corners', async () => {
  const out = await pdf.addWatermark(held(await rotatedPages()), { text: 'WATERMARK', fontSize: 44, opacity: 0.4, angle: 45 })
  const pages = await render(out)
  artifact('watermark', pages)
  for (const [index, page] of pages.entries()) {
    const { width: w, height: h } = page
    assert.ok(inkFraction(page.canvas, [w / 2 - 30, h / 2 - 30, w / 2 + 30, h / 2 + 30]) > 0.02, `/Rotate ${ROTATIONS[index]}: no ink at the centre`)
    for (const corner of [[0, 0, 60, 60], [w - 60, 0, w, 60], [0, h - 60, 60, h], [w - 60, h - 60, w, h]]) {
      assert.equal(inkFraction(page.canvas, corner), 0, `/Rotate ${ROTATIONS[index]}: ink in a corner`)
    }
  }
})

test('signature is placed by fractions of the page as displayed', async () => {
  let bytes = await rotatedPages()
  for (let i = 0; i < 4; i++) {
    bytes = await pdf.signPdf(held(bytes), { image: solidPng(240, 90), pageIndex: i, xRatio: 0.6, yRatio: 0.78, widthRatio: 0.3 })
  }
  const pages = await render(bytes)
  artifact('sign', pages)
  expectPlaced(pages, (w, h) => [[0.6 * w, 0.78 * h, 0.9 * w, 0.78 * h + 0.1125 * w]], 'signature')
  for (const page of pages) assert.ok(inkFraction(page.canvas, [0.6 * page.width, 0.78 * page.height, 0.9 * page.width, 0.78 * page.height + 0.1125 * page.width]) > 0.95, 'box is solid')
})

test('highlights and notes land where they were drawn on the preview', async () => {
  const annotations = []
  for (let i = 0; i < 4; i++) {
    annotations.push({ kind: 'highlight', page: i, x: 0.08, y: 0.08, width: 0.35, height: 0.1 })
    annotations.push({ kind: 'note', page: i, x: 0.55, y: 0.3, text: 'note' })
  }
  const result = await pdf.annotatePdf(held(await rotatedPages()), annotations)
  assert.equal(result.notesSkipped, 0)
  const pages = await render(result.data)
  artifact('annotate', pages)
  expectPlaced(pages, (w, h) => [[0.08 * w, 0.08 * h, 0.43 * w, 0.18 * h], [0.55 * w - 4, 0.3 * h - 4, 0.55 * w + 26, 0.3 * h + 16]], 'annotate')
})

test('a Cyrillic note is skipped and counted, the rest still drawn', async () => {
  const result = await pdf.annotatePdf(held(await rotatedPages()), [
    { kind: 'note', page: 0, x: 0.2, y: 0.2, text: 'Привет' },
    { kind: 'highlight', page: 0, x: 0.1, y: 0.5, width: 0.2, height: 0.1 }
  ])
  assert.equal(result.notesSkipped, 1)
  const [page] = await render(result.data)
  assert.ok(inkFraction(page.canvas, [0.1 * page.width, 0.5 * page.height, 0.3 * page.width, 0.6 * page.height]) > 0.5)
})

test('replacing a rotated page with its raster keeps the displayed size and content', async () => {
  const original = await rotatedPages({ mark: true })
  const before = await render(original)
  const jpeg = new Uint8Array(before[1].canvas.toBuffer('image/jpeg', 90))
  const replaced = await pdf.replacePagesWithImages(held(original), [{ page: 1, data: jpeg, mimeType: 'image/jpeg' }])
  const after = await render(replaced)
  artifact('redact', after)
  assert.equal(after[1].rotate, 0, 'the replacement carries no /Rotate')
  assert.equal(after[1].width, before[1].width)
  assert.equal(after[1].height, before[1].height)
  // The marker must be in the same displayed quadrant as before, not squashed elsewhere.
  const { width: w, height: h } = before[1]
  for (const box of [[0, 0, w / 2, h / 2], [w / 2, 0, w, h / 2], [0, h / 2, w / 2, h], [w / 2, h / 2, w, h]]) {
    assert.ok(Math.abs(inkFraction(before[1].canvas, box) - inkFraction(after[1].canvas, box)) < 0.03, `quadrant ${box.map(Math.round)} changed`)
  }
  for (const i of [0, 2, 3]) assert.equal(after[i].rotate, before[i].rotate, 'untouched pages are untouched')
})
