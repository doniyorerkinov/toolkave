/**
 * Merge, split, remove, rotate, forms — the page-level editing half of the
 * site, checked on the documents it produces.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pdf, lib, held, render, pageTexts, inkFraction, inkOutside } from './helpers/pdf.mjs'

const { PDFDocument, rgb } = lib

/** Pages of distinct widths, so order is observable after any shuffle. */
export async function pagesOfWidths(widths) {
  const doc = await PDFDocument.create()
  for (const w of widths) doc.addPage([w, 500])
  return await doc.save()
}
export const widthsOf = async bytes => (await PDFDocument.load(bytes)).getPages().map(p => p.getWidth())

test('merge keeps file order and page order', async () => {
  const out = await pdf.mergePdfs([held(await pagesOfWidths([100, 200]), 'a.pdf'), held(await pagesOfWidths([300]), 'b.pdf')])
  assert.deepEqual(await widthsOf(out), [100, 200, 300])
})

test('extractPages copies the requested pages in the requested order', async () => {
  const source = await pagesOfWidths([100, 200, 300])
  assert.deepEqual(await widthsOf(await pdf.extractPages(held(source), [2, 0])), [300, 100])
  assert.deepEqual(await widthsOf(await pdf.extractPages(held(source), [1, 99, -1])), [200], 'out-of-range indices are ignored')
  await assert.rejects(pdf.extractPages(held(source), [99]), { message: pdf.EMPTY_RESULT }, 'nothing valid is refused, not saved as a zero-page file')
})

test('removePdfPages keeps the rest and refuses to empty the document', async () => {
  const source = await pagesOfWidths([100, 200, 300])
  assert.deepEqual(await widthsOf(await pdf.removePdfPages(held(source), [1])), [100, 300])
  await assert.rejects(pdf.removePdfPages(held(source), [0, 1, 2]), { message: pdf.EMPTY_RESULT })
})

test('rotatePdf adds to the existing rotation and normalises the angle', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([100, 100]).setRotation(lib.degrees(90))
  doc.addPage([100, 100])
  const source = await doc.save()
  const angles = async bytes => (await PDFDocument.load(bytes)).getPages().map(p => p.getRotation().angle)
  assert.deepEqual(await angles(await pdf.rotatePdf(held(source), 270)), [0, 270], 'all pages when no selection is given')
  assert.deepEqual(await angles(await pdf.rotatePdf(held(source), 180, [1])), [90, 180], 'only the selected page')
})

test('form fields are read by kind and filled; one bad value does not abort the rest', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 300])
  const form = doc.getForm()
  form.createTextField('name').addToPage(page, { x: 20, y: 240, width: 200, height: 24 })
  form.createCheckBox('agree').addToPage(page, { x: 20, y: 200, width: 20, height: 20 })
  const city = form.createDropdown('city'); city.addOptions(['Tashkent', 'Samarkand']); city.addToPage(page, { x: 20, y: 150, width: 200, height: 24 })
  const size = form.createRadioGroup('size'); size.addOptionToPage('S', page, { x: 20, y: 100, width: 20, height: 20 }); size.addOptionToPage('L', page, { x: 60, y: 100, width: 20, height: 20 })
  const source = await doc.save()

  const fields = await pdf.readFormFields(held(source))
  assert.deepEqual(fields.map(f => [f.name, f.type]), [['name', 'text'], ['agree', 'checkbox'], ['city', 'dropdown'], ['size', 'radio']])
  assert.deepEqual(fields.find(f => f.name === 'city').options, ['Tashkent', 'Samarkand'])

  // pdf-lib lets a dropdown take a custom value (it marks the field editable), so
  // the stale value that must not abort the fill is a radio option that no longer exists.
  const filled = await pdf.fillForm(held(source), { name: 'Grace', agree: 'on', city: 'Samarkand', size: 'XL' }, false)
  const back = await pdf.readFormFields(held(filled))
  assert.deepEqual(Object.fromEntries(back.map(f => [f.name, f.value])), { name: 'Grace', agree: 'on', city: 'Samarkand', size: '' }, 'the stale radio value is skipped, everything else written')

  const flat = await PDFDocument.load(await pdf.fillForm(held(source), { name: 'Grace' }, true))
  assert.equal(flat.getForm().getFields().length, 0, 'flattening removes the fields')
})

test('flattening a document with no form is a no-op, not an error', async () => {
  const out = await pdf.flattenPdf(held(await pagesOfWidths([100, 200])))
  assert.deepEqual(await widthsOf(out), [100, 200])
})

test('resizePdfPages changes the page size, keeps orientation and centres the content', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89])
  page.drawRectangle({ x: 250, y: 380, width: 95, height: 80, color: rgb(0, 0, 0) })
  const a4 = held(await doc.save(), 'a4.pdf')

  const size = async bytes => {
    const out = await PDFDocument.load(bytes)
    const first = out.getPage(0)
    return [Math.round(first.getWidth()), Math.round(first.getHeight())]
  }

  assert.deepEqual(await size(await pdf.resizePdfPages(a4, 'letter')), [612, 792])
  assert.deepEqual(await size(await pdf.resizePdfPages(a4, 'legal')), [612, 1008])
  assert.deepEqual(await size(await pdf.resizePdfPages(a4, 'scale', 0.5)), [298, 421])

  const landscape = await PDFDocument.create()
  landscape.addPage([841.89, 595.28])
  const wide = held(await landscape.save(), 'wide.pdf')
  assert.deepEqual(await size(await pdf.resizePdfPages(wide, 'letter')), [792, 612], 'landscape stays landscape')

  // The mark is centred on A4; it must still be centred on Letter, including
  // when the page's own box does not start at (0, 0).
  const offset = await PDFDocument.create()
  const shifted = offset.addPage([595.28, 841.89])
  shifted.setMediaBox(20, 20, 595.28, 841.89)
  shifted.drawRectangle({ x: 270, y: 400, width: 95, height: 80, color: rgb(0, 0, 0) })
  const boxed = held(await offset.save(), 'offset.pdf')

  for (const [name, source] of [['plain', a4], ['offset box', boxed]]) {
    const [{ canvas }] = await render(await pdf.resizePdfPages(source, 'letter'), 1)
    const inset = [canvas.width * 0.18, canvas.height * 0.18]
    const middle = [inset[0], inset[1], canvas.width - inset[0], canvas.height - inset[1]]
    assert.ok(inkFraction(canvas, middle) > 0, `${name}: the mark is in the middle of the page`)
    assert.equal(inkOutside(canvas, [middle]), 0, `${name}: nothing drifted to the edges`)
  }
})

test('flattening a NeedAppearances form bakes the values, not the stale streams', async () => {
  // What many fillers write: /V holds the text, the widget keeps the empty
  // appearance it was created with, and NeedAppearances tells viewers to
  // redraw. The person sees "John Smith"; the flattened page must too.
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 300])
  const form = doc.getForm()
  const field = form.createTextField('name')
  field.addToPage(page, { x: 32, y: 122, width: 296, height: 36 })
  field.setText('John Smith')
  form.acroForm.dict.set(lib.PDFName.of('NeedAppearances'), lib.PDFBool.True)
  const stale = await doc.save({ updateFieldAppearances: false })
  assert.deepEqual(await pageTexts(stale), [''], 'the stale stream really is empty')

  const flat = await pdf.flattenPdf(held(stale, 'form.pdf'))
  assert.deepEqual(await pageTexts(flat), ['John Smith'])
  assert.equal((await PDFDocument.load(flat)).getForm().getFields().length, 0)

  // The same file through Fill with flatten on: an untouched field keeps its value.
  const filled = await pdf.fillForm(held(stale, 'form.pdf'), {}, true)
  assert.deepEqual(await pageTexts(filled), ['John Smith'])
})

test('Cyrillic and Uzbek values survive flatten and fill through the Unicode font', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 300])
  const form = doc.getForm()
  const name = form.createTextField('name')
  name.addToPage(page, { x: 32, y: 122, width: 296, height: 36 })
  name.setText('Иван Петров')
  form.acroForm.dict.set(lib.PDFName.of('NeedAppearances'), lib.PDFBool.True)
  const stale = await doc.save({ updateFieldAppearances: false })

  const flat = await pdf.flattenPdf(held(stale, 'form.pdf'))
  assert.deepEqual(await pageTexts(flat), ['Иван Петров'], 'flatten draws Cyrillic, not question marks')

  const filled = await pdf.fillForm(held(stale, 'form.pdf'), { name: 'Oʻzbekiston 2026' }, true)
  assert.deepEqual(await pageTexts(filled), ['Oʻzbekiston 2026'], 'the modifier apostrophe is a real glyph')
  assert.ok(filled.byteLength < 40_000, `the font is subset, not embedded whole: ${filled.byteLength} bytes`)

  // A Latin-only form keeps the standard font and stays tiny.
  const latin = await pdf.fillForm(held(stale, 'form.pdf'), { name: 'John Smith' }, true)
  assert.ok(latin.byteLength < 5_000, `no font embedded for Latin: ${latin.byteLength} bytes`)
})
