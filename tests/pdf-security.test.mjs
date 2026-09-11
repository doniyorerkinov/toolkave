/**
 * Passwords, metadata and the Latin-1 guard: the paths where a wrong answer
 * is a broken download rather than a visible error.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pdf, lib, held } from './helpers/pdf.mjs'

const { PDFDocument, PDFName, PDFString } = lib

async function onePage(width = 100) {
  const doc = await PDFDocument.create()
  doc.addPage([width, 500])
  return await doc.save()
}

async function locked({ userPassword = 'secret', ownerPassword = 'owner', title } = {}) {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  if (title) doc.setTitle(title)
  doc.encrypt({ userPassword, ownerPassword })
  return await doc.save()
}

test('password-protected input is refused with a code the tools can explain', async () => {
  const bytes = await locked()
  await assert.rejects(pdf.mergePdfs([held(bytes)]), { message: pdf.ENCRYPTED_INPUT })
  await assert.rejects(pdf.addWatermark(held(bytes), { text: 'X', fontSize: 20, opacity: 0.5, angle: 0 }), { message: pdf.ENCRYPTED_INPUT })
  await assert.rejects(pdf.readFormFields(held(bytes)), { message: pdf.ENCRYPTED_INPUT })
  assert.equal(pdf.pdfErrorKey(new Error(pdf.ENCRYPTED_INPUT)), 'pdf.errorEncrypted')
  assert.equal(pdf.pdfErrorKey(new Error('anything else')), 'pdf.errorGeneric')
  assert.equal(await pdf.isPdfEncrypted(held(bytes)), true)
  assert.equal(await pdf.isPdfEncrypted(held(await onePage())), false)
})

test('owner-password-only input is decrypted transparently', async () => {
  const merged = await PDFDocument.load(await pdf.mergePdfs([held(await locked({ userPassword: '' }))]))
  assert.equal(merged.isEncrypted, false)
  assert.equal(merged.getPageCount(), 1)
})

test('unlock distinguishes a wrong password from a corrupt or open file', async () => {
  const bytes = await locked()
  await assert.rejects(pdf.unlockPdf(held(bytes), 'nope'), { message: pdf.WRONG_PASSWORD })
  await assert.rejects(pdf.unlockPdf(held(new Uint8Array([1, 2, 3])), 'x'), error => error.message !== pdf.WRONG_PASSWORD)
  await assert.rejects(pdf.unlockPdf(held(await onePage()), 'x'), { message: pdf.NOT_ENCRYPTED })
  const open = await PDFDocument.load(await pdf.unlockPdf(held(bytes), 'secret'))
  assert.equal(open.isEncrypted, false)
  assert.equal(open.getPageCount(), 1)
})

// The fork's encrypted writer loses the document Info dictionary: with object
// streams the trailer's /Info entry is dropped, without them the strings come
// back empty. Nothing on our side can carry a title through that, so this is
// recorded as a todo rather than a failure and turns green when the fork is fixed.
test('title and author survive protect then unlock', { todo: '@cantoo/pdf-lib drops the Info dictionary on encrypted save' }, async () => {
  const doc = await PDFDocument.create()
  doc.addPage([100, 100])
  doc.setTitle('Kept')
  doc.setAuthor('Ada')
  const protectedBytes = await pdf.protectPdf(held(await doc.save()), 'pw')
  const open = await PDFDocument.load(await pdf.unlockPdf(held(protectedBytes), 'pw'))
  assert.equal(open.getTitle(), 'Kept')
  assert.equal(open.getAuthor(), 'Ada')
})

test('protect then unlock round-trips', async () => {
  const protectedBytes = await pdf.protectPdf(held(await onePage(123)), 'pw')
  assert.equal((await PDFDocument.load(protectedBytes, { ignoreEncryption: true })).isEncrypted, true)
  await assert.rejects(pdf.mergePdfs([held(protectedBytes)]), { message: pdf.ENCRYPTED_INPUT }, 'the output really needs the password')
  const reopened = await PDFDocument.load(await pdf.unlockPdf(held(protectedBytes), 'pw'))
  assert.equal(reopened.getPage(0).getWidth(), 123)
})

test('metadata survives a malformed date and names paper sizes', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([595.28, 841.89])
  doc.addPage([842, 595])
  doc.addPage([300, 300])
  doc.getInfoDict().set(PDFName.of('CreationDate'), PDFString.of('not a date'))
  doc.setAuthor('Ada')
  const meta = await pdf.readPdfMetadata(held(await doc.save()))
  assert.equal(meta.created, '')
  assert.equal(meta.author, 'Ada')
  assert.equal(meta.pageCount, 3)
  assert.deepEqual(meta.pageSizes.map(s => s.label), ['A4', 'A4 (landscape)', 'Custom'])
})

test('the Latin-1 guard and the tools that rely on it', async () => {
  assert.equal(pdf.isLatin1('Confidential draft, café'), true)
  assert.equal(pdf.isLatin1('Confidential — draft'), false, 'an em dash is outside Latin-1')
  assert.equal(pdf.isLatin1('Черновик'), false)
  assert.equal(pdf.isLatin1('tab\there'), false, 'control characters cannot be drawn')
  await assert.rejects(
    pdf.addWatermark(held(await onePage()), { text: 'Черновик', fontSize: 20, opacity: 0.5, angle: 0 }),
    { message: pdf.UNSUPPORTED_TEXT }
  )
  await assert.rejects(
    pdf.addHeaderFooter(held(await onePage()), { header: 'ok', footer: 'Ёлка', fontSize: 10, align: 'left' }),
    { message: pdf.UNSUPPORTED_TEXT }
  )
})
