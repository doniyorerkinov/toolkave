/**
 * Merge, split, remove, rotate, forms — the page-level editing half of the
 * site, checked on the documents it produces.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pdf, lib, held } from './helpers/pdf.mjs'

const { PDFDocument } = lib

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
