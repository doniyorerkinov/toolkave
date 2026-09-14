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
  // A separate map on purpose: clear() must not touch it, just as clear()
  // does not touch the prefs table.
  const locales = new Map()
  return {
    sent: files,
    async readLocale(chatId) {
      return locales.get(chatId) ?? null
    },
    async setLocale(chatId, locale) {
      locales.set(chatId, locale)
    },
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
 * The bot waits for the rest of an album before it speaks. Shortened here, not
 * switched off: a zero wait removes the coalescing entirely, which is the bug
 * these tests exist to catch rather than the behaviour under test.
 */
const BRIEF = { album: 25, single: 25 }

/** Telegram answers one update at a time, then the deferred work overlaps. */
async function deliver(updates, context) {
  const deferred = []
  context.defer = work => deferred.push(work)
  for (const update of updates) await handleUpdate(update, context)
  await Promise.all(deferred)
}

const pdfDoc = (fileId, bytes) => ({
  message: {
    message_id: 2,
    chat: { id: 7 },
    from: { language_code: 'en' },
    document: { file_id: fileId, file_name: 'a.pdf', mime_type: 'application/pdf', file_size: bytes.byteLength }
  }
})

test('the counter moves to the bottom of the chat instead of being rewritten above', async () => {
  const context = { api: fakeApi(), store: fakeStore(), settle: BRIEF }
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
test('thirty photos arrive as three albums and leave four messages, not thirty', async () => {
  const context = { api: fakeApi(), store: fakeStore(), settle: BRIEF }
  for (let album = 0; album < 3; album++) {
    await deliver(
      Array.from({ length: 10 }, (_, i) => photo(`a${album}-${i}`, 2048, `group-${album}`)),
      context
    )
  }

  assert.deepEqual(
    context.api.log.messages.map(message => message.text),
    [
      '1 photo received. Send more, or:',
      '10 photos received. Send more, or:',
      '20 photos received. Send more, or:',
      '30 photos received. Send more, or:'
    ]
  )
  assert.equal(context.api.log.edits.length, 0)
  assert.equal(context.api.log.deleted.length, 3, 'each counter clears the one before it')
})

/**
 * What actually caused "it is sending me 10 messages, one per photo".
 *
 * Telegram holds a chat's next update until the current one is answered, so
 * settling before the response serialised the whole album: each photo was the
 * only one in the table when its turn came, so each was "last", so each posted
 * a counter. Deferring the wait until after the reply is what lets them
 * overlap - modelled here by running the handlers together, which is what
 * `defer` produces in the Worker.
 */
test('an album settles into one counter only because the reply comes first', async () => {
  const context = { api: fakeApi(), store: fakeStore(), settle: BRIEF }
  const deferred = []
  context.defer = work => deferred.push(work)

  const album = Array.from({ length: 10 }, (_, i) => photo(`d${i}`, 2048, 'album-d'))
  for (const update of album) await handleUpdate(update, context)   // Telegram, one at a time
  await Promise.all(deferred)                                        // the background work

  assert.equal(context.api.log.messages.length, 2, 'one for the first photo, one for the settled batch')
  assert.equal(context.api.log.messages[0].text, '1 photo received. Send more, or:')
  assert.equal(context.api.log.messages[1].text, '10 photos received. Send more, or:')
  assert.deepEqual(context.api.log.deleted, [100], 'the first counter is cleared away')
})

test('the button turns the batch into a real PDF and forgets it', async () => {
  const png = solidPng(120, 80)
  const context = { api: fakeApi({ a: png, b: png }), store: fakeStore(), settle: BRIEF }
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
  const context = { api: fakeApi({ a: png }), store: fakeStore(), settle: BRIEF }
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

  const context = { api: fakeApi({ p1: bytes, p2: bytes }), store: fakeStore(), settle: BRIEF }
  await handleUpdate(pdfDoc('p1', bytes), context)
  await handleUpdate(pdfDoc('p2', bytes), context)
  // The first PDF says "send another"; the second is what can actually merge.
  assert.match(context.api.log.messages[0].text, /One PDF received/)
  assert.match(context.api.log.messages.at(-1).text, /2 PDFs received/)

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
    const context = { api: fakeApi(files), store: fakeStore(), settle: BRIEF }
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

  const context = { api: fakeApi({ c: cover, a: solidPng(60, 60) }), store: fakeStore(), settle: BRIEF }
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
  const context = { api: fakeApi(), store: fakeStore(), settle: BRIEF }
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
  const context = { api: fakeApi({ a: png }), store: fakeStore(), settle: BRIEF }
  await handleUpdate(photo('a'), context)
  await handleUpdate(photo('missing'), context)
  await handleUpdate(press('a4'), context)

  const doc = await PDFDocument.load(context.api.log.documents[0].bytes)
  assert.equal(doc.getPageCount(), 1, 'the readable photo still became a page')
})

test('the caps stop a batch before the Worker runs out of memory', async () => {
  const MB = 1024 * 1024

  // Past what Telegram will even hand a bot, whatever the chat shows.
  const single = { api: fakeApi(), store: fakeStore(), settle: BRIEF }
  await handleUpdate(photo('huge', 25 * MB), single)
  assert.match(single.api.log.messages[0].text, /20 MB/)
  assert.equal((await single.store.read(7)).files.length, 0)

  // Each one allowed, the pile is not: the third would put the PDF past 45 MB.
  const many = { api: fakeApi(), store: fakeStore(), settle: BRIEF }
  for (const id of ['a', 'b', 'c']) await handleUpdate(photo(id, 19 * MB), many)

  assert.ok(many.api.log.messages.some(message => /too heavy/i.test(message.text)))
  assert.equal((await many.store.read(7)).files.length, 2, 'the two that fit are kept')
})

const start = language => ({ message: { message_id: 1, chat: { id: 7 }, from: { language_code: language }, text: '/start' } })

/** /start, then answer the picker — how every chat now actually begins. */
async function openedIn(locale, context, phone = 'ru') {
  await handleUpdate(start(phone), context)
  await handleUpdate(press(`lang:${locale}`, phone), context)
  return context.api.log.messages.at(-1)
}

test('once a language is chosen, the phone stops mattering', async () => {
  const uzbek = { api: fakeApi(), store: fakeStore(), settle: BRIEF }
  assert.match((await openedIn('uz', uzbek)).text, /Fayl yuboring/)

  const russian = { api: fakeApi(), store: fakeStore(), settle: BRIEF }
  assert.match((await openedIn('ru', russian, 'en')).text, /Пришлите файл/)
})

/**
 * /start used to be a paragraph that only described photos, so nothing told
 * anyone the bot could merge PDFs or put a cover in front of scanned pages.
 * Whatever the bot can do has to be listed there, in every language.
 */
test('the greeting lists every capability, in all three languages', async () => {
  for (const language of ['en', 'ru', 'uz']) {
    const context = { api: fakeApi(), store: fakeStore(), settle: BRIEF }
    const reply = await openedIn(language, context)

    const listed = reply.text.split('\n').filter(line => /^\p{Emoji_Presentation}/u.test(line))
    assert.equal(listed.length, 2, `${language}: two capabilities listed`)
    assert.ok(/20 MB|20 МБ/.test(reply.text), `${language}: states the file cap`)
    assert.ok(/\/language/.test(reply.text), `${language}: says how to change language back`)
  }
})

/**
 * The menu has to be a menu that teaches, not a mode that traps.
 *
 * Doniyor's worry was that people used to tapping a button would not know to
 * just send a file. The answer is buttons that explain and store nothing, so
 * tapping the wrong one costs a sentence rather than putting the chat into a
 * state it has to be talked out of.
 */
test('the greeting offers a button per capability, and tapping one only explains', async () => {
  const context = { api: fakeApi(), store: fakeStore(), settle: BRIEF }
  const intro = await openedIn('uz', context)

  assert.equal(intro.buttons.length, 2, 'one button per capability')
  assert.deepEqual(intro.buttons.flat().map(button => button.callback_data), ['how:photos', 'how:merge'])

  await handleUpdate(press('how:merge', 'ru'), context)
  // Uzbek was chosen, so the answer is Uzbek even though the phone says Russian.
  assert.match(context.api.log.messages.at(-1).text, /PDF fayllarni kerakli tartibda/)
})

test('tapping the wrong menu button leaves nothing behind to get stuck in', async () => {
  const png = solidPng(60, 40)
  const context = { api: fakeApi({ a: png, b: png }), store: fakeStore(), settle: BRIEF }

  await handleUpdate(start('en'), context)
  await handleUpdate(press('how:merge'), context)      // says "send me PDFs"

  // ...and then photos arrive anyway. The file decides, not the tap.
  await deliver([photo('a'), photo('b')], context)
  const counter = context.api.log.messages.at(-1)
  assert.match(counter.text, /2 photos received/)
  assert.deepEqual(counter.buttons.flat().map(button => button.callback_data), ['a4', 'image', 'clear'])

  await handleUpdate(press('a4'), context)
  assert.equal(context.api.log.documents.length, 1, 'the PDF is made regardless of what was tapped earlier')
})

/**
 * An Uzbek teacher whose phone is in Russian - which is most of them - was
 * being greeted in Russian and had no way to say otherwise. The phone's
 * language is a guess, and a bad one here, so the bot asks instead.
 */
test('the first /start asks which language, in all three at once', async () => {
  const context = { api: fakeApi(), store: fakeStore(), settle: BRIEF }
  await handleUpdate(start('ru'), context)     // a Russian phone

  const [ask] = context.api.log.messages
  assert.match(ask.text, /Tilni tanlang/)
  assert.match(ask.text, /Выберите язык/)
  assert.match(ask.text, /Choose your language/)
  assert.deepEqual(ask.buttons.flat().map(button => button.callback_data), ['lang:uz', 'lang:ru', 'lang:en'])
  assert.equal(context.api.log.messages.length, 1, 'nothing is said in a language before one is chosen')

  // Picking Uzbek on a Russian phone is the whole point.
  await handleUpdate(press('lang:uz', 'ru'), context)
  assert.match(context.api.log.messages[1].text, /Fayl yuboring/)
})

test('the choice outlives the batch it was made in', async () => {
  const png = solidPng(50, 50)
  const context = { api: fakeApi({ a: png }), store: fakeStore(), settle: BRIEF }

  await handleUpdate(start('en'), context)
  await handleUpdate(press('lang:uz', 'en'), context)

  // A whole batch, finished - which clears the chat's row.
  await deliver([photo('a')], context)
  await handleUpdate(press('a4', 'en'), context)
  assert.equal(context.api.log.documents.length, 1)

  // Still Uzbek afterwards, from a phone that is not.
  await handleUpdate(start('en'), context)
  assert.match(context.api.log.messages.at(-1).text, /Fayl yuboring/)
})

test('/language reopens the picker and the new choice sticks', async () => {
  const context = { api: fakeApi(), store: fakeStore(), settle: BRIEF }
  await handleUpdate(start('uz'), context)
  await handleUpdate(press('lang:uz', 'uz'), context)

  await handleUpdate({ message: { message_id: 9, chat: { id: 7 }, from: { language_code: 'uz' }, text: '/language' } }, context)
  assert.match(context.api.log.messages.at(-1).text, /Choose your language/)

  await handleUpdate(press('lang:ru', 'uz'), context)
  assert.match(context.api.log.messages.at(-1).text, /Пришлите файл/)
})

/**
 * The state right after "send the cover first" is the one that went wrong.
 *
 * A lone PDF was offered "merge into one PDF", which with nothing to merge it
 * into hands the same file back - and it arrives seconds after the bot has told
 * someone to send a cover and then the pages, so it contradicts its own
 * instruction. And once the photos landed the buttons said "make PDF", which is
 * photo talk for what is actually a document being assembled.
 */
test('a lone PDF is not offered a merge with itself', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([595, 842])
  const cover = await doc.save()
  const context = { api: fakeApi({ c: cover }), store: fakeStore(), settle: BRIEF }

  await deliver([pdfDoc('c', cover)], context)
  const counter = context.api.log.messages.at(-1)

  assert.match(counter.text, /One PDF received\. Send another/)
  assert.deepEqual(counter.buttons.flat().map(button => button.callback_data), ['clear'],
    'nothing to do with one PDF but send another file')
})

test('a cover plus pages is labelled as one document, not as making a PDF', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([595, 842])
  const cover = await doc.save()
  const png = solidPng(60, 90)
  const context = { api: fakeApi({ c: cover, a: png, b: png }), store: fakeStore(), settle: BRIEF }

  await deliver([pdfDoc('c', cover), photo('a'), photo('b')], context)
  const counter = context.api.log.messages.at(-1)

  assert.match(counter.text, /2 photos and 1 PDF received/)
  const labels = counter.buttons.flat().map(button => button.text)
  assert.ok(labels.some(label => /one document/i.test(label)), `photo-only wording is back: ${labels}`)
  assert.ok(!labels.some(label => /Make PDF/i.test(label)))

  // And it still builds, cover first.
  await handleUpdate(press('a4'), context)
  const out = await PDFDocument.load(context.api.log.documents[0].bytes)
  assert.equal(out.getPageCount(), 3)
})
