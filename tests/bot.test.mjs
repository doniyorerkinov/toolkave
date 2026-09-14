/**
 * The Telegram bot's flow, with Telegram and D1 replaced by stand-ins.
 *
 * Everything the bot does between "a photo arrived" and "here is your PDF"
 * is worth checking without a network: the counting, the caps, the branch
 * between images and PDFs, and that the file it sends is a real document.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { lib, solidPng } from './helpers/pdf.mjs'

register('./helpers/alias-loader.mjs', import.meta.url)
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const { handleUpdate } = await import(pathToFileURL(path.join(ROOT, 'server/telegram/bot.ts')).href)
const { PDFDocument } = lib

/** An in-memory stand-in for the two D1 tables. */
function fakeStore() {
  const files = new Map()
  const counters = new Map()
  return {
    sent: files,
    async read(chatId) {
      return { files: files.get(chatId) ?? [], counterMessageId: counters.get(chatId) ?? null }
    },
    async add(chatId, file) {
      files.set(chatId, [...(files.get(chatId) ?? []), file])
    },
    async remove(chatId, fileId) {
      files.set(chatId, (files.get(chatId) ?? []).filter(file => file.fileId !== fileId))
    },
    async setCounterMessage(chatId, messageId) {
      counters.set(chatId, messageId)
    },
    async clear(chatId) {
      files.delete(chatId)
      counters.delete(chatId)
    }
  }
}

function fakeApi(downloads = {}) {
  const log = { messages: [], edits: [], documents: [], deleted: [] }
  let nextId = 100
  return {
    log,
    async sendMessage(chatId, text, buttons) {
      log.messages.push({ chatId, text, buttons })
      return { message_id: nextId++ }
    },
    async editMessage(chatId, messageId, text, buttons) {
      log.edits.push({ chatId, messageId, text, buttons })
    },
    async deleteMessage(chatId, messageId) {
      log.deleted.push(messageId)
    },
    async answerCallback() {},
    async download(fileId) {
      const bytes = downloads[fileId]
      if (!bytes) throw new Error('no such file')
      return bytes
    },
    async sendDocument(chatId, name, bytes, caption) {
      log.documents.push({ chatId, name, bytes, caption })
    }
  }
}

const photo = (fileId, size = 2048, mediaGroupId) => ({
  message: {
    message_id: 1,
    chat: { id: 7 },
    from: { language_code: 'en' },
    photo: [{ file_id: fileId, file_size: size, width: 90, height: 90 }],
    ...(mediaGroupId ? { media_group_id: mediaGroupId } : {})
  }
})

const press = (data, language = 'en') => ({
  callback_query: { id: 'cb', data, from: { language_code: language }, message: { message_id: 5, chat: { id: 7 } } }
})

/**
 * The bot waits for the rest of an album before it speaks. That wait is real
 * seconds in production and pure waste here, so every context switches it off.
 */
const NO_WAIT = { album: 0, single: 0 }

const pdfDoc = (fileId, bytes) => ({
  message: {
    message_id: 2,
    chat: { id: 7 },
    from: { language_code: 'en' },
    document: { file_id: fileId, file_name: 'a.pdf', mime_type: 'application/pdf', file_size: bytes.byteLength }
  }
})

test('the counter moves to the bottom of the chat instead of being rewritten above', async () => {
  const context = { api: fakeApi(), store: fakeStore(), settle: NO_WAIT }
  for (const id of ['a', 'b', 'c']) await handleUpdate(photo(id), context)

  // A new message each time, because an album pushes the old one out of sight.
  assert.deepEqual(
    context.api.log.messages.map(message => message.text),
    ['1 photo received. Send more, or:', '2 photos received. Send more, or:', '3 photos received. Send more, or:']
  )
  assert.equal(context.api.log.edits.length, 0, 'nothing is edited in place any more')
  // And the old ones are cleaned up, so the chat does not fill with counters.
  assert.equal(context.api.log.deleted.length, 2)
  assert.ok(context.api.log.messages.every(message => message.buttons?.length))
})

/**
 * The bug this was reported as: "stuck after uploading 30 images".
 *
 * Telegram splits an album into one update per photo and delivers them at
 * once, so thirty invocations run concurrently. Each used to rewrite the
 * counter, which is thirty edits in a second - past Telegram's rate limit, so
 * the counter silently froze - and left the buttons above thirty photos where
 * nobody would scroll. One message, one correct count, is the whole fix.
 */
test('an album of 30 produces exactly one counter, with the right number on it', async () => {
  const context = { api: fakeApi(), store: fakeStore(), settle: NO_WAIT }
  const album = Array.from({ length: 30 }, (_, i) => photo(`p${i}`, 2048, 'album-1'))

  await Promise.all(album.map(update => handleUpdate(update, context)))

  assert.equal(context.api.log.messages.length, 1, 'one message for the whole album')
  assert.equal(context.api.log.messages[0].text, '30 photos received. Send more, or:')
  assert.equal(context.api.log.edits.length, 0)
  assert.equal(context.api.log.deleted.length, 0, 'nothing to delete: it is the first counter')

  // A second album on top of the first counts both and replaces the counter.
  const more = Array.from({ length: 5 }, (_, i) => photo(`q${i}`, 2048, 'album-2'))
  await Promise.all(more.map(update => handleUpdate(update, context)))
  assert.equal(context.api.log.messages.length, 2)
  assert.equal(context.api.log.messages[1].text, '35 photos received. Send more, or:')
  assert.deepEqual(context.api.log.deleted, [100], 'the first counter is removed')
})

test('the button turns the batch into a real PDF and forgets it', async () => {
  const png = solidPng(120, 80)
  const context = { api: fakeApi({ a: png, b: png }), store: fakeStore(), settle: NO_WAIT }
  await handleUpdate(photo('a'), context)
  await handleUpdate(photo('b'), context)
  await handleUpdate(press('a4'), context)

  const [sent] = context.api.log.documents
  assert.ok(sent, 'a document was sent')
  assert.match(sent.name, /^toolkave-\d{4}-\d{2}-\d{2}\.pdf$/)
  assert.match(sent.caption, /toolkave\.com/)

  const doc = await PDFDocument.load(sent.bytes)
  assert.equal(doc.getPageCount(), 2)
  assert.equal(Math.round(doc.getPage(0).getWidth()), 595, 'A4 width')
  assert.deepEqual((await context.store.read(7)).files, [], 'the batch is cleared after sending')
})

test('photo size is respected when asked for', async () => {
  const png = solidPng(120, 80)
  const context = { api: fakeApi({ a: png }), store: fakeStore(), settle: NO_WAIT }
  await handleUpdate(photo('a'), context)
  await handleUpdate(press('image'), context)

  const doc = await PDFDocument.load(context.api.log.documents[0].bytes)
  assert.deepEqual(
    [Math.round(doc.getPage(0).getWidth()), Math.round(doc.getPage(0).getHeight())],
    [120, 80]
  )
})

test('PDFs on their own are merged', async () => {
  const source = await PDFDocument.create()
  source.addPage([200, 200])
  const bytes = await source.save()

  const context = { api: fakeApi({ p1: bytes, p2: bytes }), store: fakeStore(), settle: NO_WAIT }
  await handleUpdate(pdfDoc('p1', bytes), context)
  await handleUpdate(pdfDoc('p2', bytes), context)
  assert.match(context.api.log.messages[0].text, /2 PDFs received|1 PDF received/)

  await handleUpdate(press('merge'), context)
  const merged = await PDFDocument.load(context.api.log.documents[0].bytes)
  assert.equal(merged.getPageCount(), 2)
})

/**
 * The attestation file: a cover written in Word, exported to PDF, then the
 * scanned pages photographed on a phone. Nothing may reorder them — a cover
 * that lands on page four is worse than no cover at all — so the assertion is
 * on page sizes, which say plainly which page came from where: the cover keeps
 * its own 200x200, every photo is placed on A4.
 */
test('a cover and scanned pages come back in the order they were sent', async () => {
  const source = await PDFDocument.create()
  source.addPage([200, 200])
  const cover = await source.save()
  const photo1 = solidPng(300, 400)
  const photo2 = solidPng(300, 400, '#080')
  const isCover = size => Math.round(size.width) === 200 && Math.round(size.height) === 200
  const isA4 = size => Math.round(size.width) === 595 && Math.round(size.height) === 842

  const run = async order => {
    const files = { c: cover, a: photo1, b: photo2 }
    const context = { api: fakeApi(files), store: fakeStore(), settle: NO_WAIT }
    for (const id of order) {
      await handleUpdate(id === 'c' ? pdfDoc('c', cover) : photo(id), context)
    }
    await handleUpdate(press('a4'), context)
    assert.equal(context.api.log.documents.length, 1, `${order} produced no document`)
    const out = await PDFDocument.load(context.api.log.documents[0].bytes)
    return out.getPages().map(page => page.getSize())
  }

  // Cover first, then the pages.
  const front = await run(['c', 'a', 'b'])
  assert.equal(front.length, 3)
  assert.ok(isCover(front[0]), 'the cover should be page one')
  assert.ok(front.slice(1).every(isA4), 'the photos should be on A4')

  // Cover last, for someone who scans first and writes the cover afterwards.
  const back = await run(['a', 'b', 'c'])
  assert.equal(back.length, 3)
  assert.ok(back.slice(0, 2).every(isA4))
  assert.ok(isCover(back[2]), 'the cover should be the last page')

  // And a PDF in the middle of a run of photos stays in the middle.
  const middle = await run(['a', 'c', 'b'])
  assert.deepEqual(middle.map(isCover), [false, true, false])
})

test('the counter names both kinds once a batch is mixed', async () => {
  const source = await PDFDocument.create()
  source.addPage([200, 200])
  const cover = await source.save()

  const context = { api: fakeApi({ c: cover, a: solidPng(60, 60) }), store: fakeStore(), settle: NO_WAIT }
  await handleUpdate(pdfDoc('c', cover), context)
  await handleUpdate(photo('a'), context)

  // The counter is one message rewritten in place, so the second file shows up
  // as an edit rather than a new message.
  const last = context.api.log.edits.at(-1) ?? context.api.log.messages.at(-1)
  assert.match(last.text, /1 photo and 1 PDF received/)
})

/**
 * Ten album photos arrive at once, so ten invocations each read the table
 * before any of them has inserted. Every one of them sees room. The caps can
 * only be enforced afterwards, on what is really there.
 */
test('a burst that overshoots the weight cap is trimmed back, oldest kept', async () => {
  const context = { api: fakeApi(), store: fakeStore(), settle: NO_WAIT }
  const eightMb = 8 * 1024 * 1024
  const burst = Array.from({ length: 10 }, (_, i) => photo(`big${i}`, eightMb, 'album-heavy'))

  await Promise.all(burst.map(update => handleUpdate(update, context)))

  const { files } = await context.store.read(7)
  const total = files.reduce((sum, file) => sum + file.bytes, 0)
  assert.ok(total <= 45 * 1024 * 1024, `kept ${(total / 1024 / 1024).toFixed(0)} MB, over the cap`)
  assert.equal(files.length, 5, '5 x 8 MB fits, the sixth does not')
  // The ones that arrived first are the ones kept.
  assert.deepEqual(files.map(file => file.fileId), ['big0', 'big1', 'big2', 'big3', 'big4'])
  assert.ok(context.api.log.messages.some(message => /too heavy/i.test(message.text)))
})

test('a file that will not download is left out instead of losing the batch', async () => {
  const png = solidPng(60, 60)
  const context = { api: fakeApi({ a: png }), store: fakeStore(), settle: NO_WAIT }
  await handleUpdate(photo('a'), context)
  await handleUpdate(photo('missing'), context)
  await handleUpdate(press('a4'), context)

  const doc = await PDFDocument.load(context.api.log.documents[0].bytes)
  assert.equal(doc.getPageCount(), 1, 'the readable photo still became a page')
})

test('the caps stop a batch before the Worker runs out of memory', async () => {
  const MB = 1024 * 1024

  // Past what Telegram will even hand a bot, whatever the chat shows.
  const single = { api: fakeApi(), store: fakeStore(), settle: NO_WAIT }
  await handleUpdate(photo('huge', 25 * MB), single)
  assert.match(single.api.log.messages[0].text, /20 MB/)
  assert.equal((await single.store.read(7)).files.length, 0)

  // Each one allowed, the pile is not: the third would put the PDF past 45 MB.
  const many = { api: fakeApi(), store: fakeStore(), settle: NO_WAIT }
  for (const id of ['a', 'b', 'c']) await handleUpdate(photo(id, 19 * MB), many)

  assert.ok(many.api.log.messages.some(message => /too heavy/i.test(message.text)))
  assert.equal((await many.store.read(7)).files.length, 2, 'the two that fit are kept')
})

test('an Uzbek phone is answered in Uzbek without being asked', async () => {
  const context = { api: fakeApi(), store: fakeStore(), settle: NO_WAIT }
  await handleUpdate({ message: { message_id: 1, chat: { id: 7 }, from: { language_code: 'uz' }, text: '/start' } }, context)
  assert.match(context.api.log.messages[0].text, /Suratlarni yuboring/)

  const russian = { api: fakeApi(), store: fakeStore(), settle: NO_WAIT }
  await handleUpdate({ message: { message_id: 1, chat: { id: 7 }, from: { language_code: 'ru-RU' }, text: '/start' } }, russian)
  assert.match(russian.api.log.messages[0].text, /Отправьте фотографии/)
})
