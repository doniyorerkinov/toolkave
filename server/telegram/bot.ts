/**
 * What the bot does with an update.
 *
 * The whole interaction is one loop: files arrive and are counted, a button
 * turns them into a PDF. Photos become pages; PDFs get merged; a batch of
 * both is assembled in the order it arrived, which is how a Word-made cover
 * ends up in front of the scanned pages. The work
 * itself is `shared/pdf-core` - the same functions the site runs, so the bot
 * is a second front door to one implementation rather than a copy of it.
 */
import { imagesToPdf, mergePdfs } from '../../shared/pdf-core'
import { MAX_DOWNLOAD_BYTES, TelegramApi, type TelegramUpdate } from './api'
import { SessionStore, type PendingFile, type PendingKind } from './session'
import { STRINGS, localeOf, type BotLocale } from './strings'

/** Where a result points people next. */
const SITE = 'https://toolkave.com'

/**
 * Caps chosen for the Worker's 128 MB, not for scarcity: Telegram's own
 * compressed photos run 100-300 KB, so a hundred of them is comfortable,
 * while files sent at full quality hit the weight limit first.
 */
const MAX_FILES = 100
const MAX_TOTAL_BYTES = 45 * 1024 * 1024

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg']

/**
 * How long to wait for the rest of a batch before speaking.
 *
 * Telegram delivers an album as one update per photo, all at once, and a
 * Worker answers each in its own invocation. Reacting to every one of them
 * meant thirty edits in two seconds - past Telegram's rate limit, so the
 * counter silently stopped moving - and left the buttons stranded thirty
 * messages above the photos, which is what "stuck" looked like.
 *
 * So each invocation waits, then looks again: whoever's file ended up last
 * speaks for the whole batch and the rest say nothing. Waiting is wall time,
 * not CPU, so it costs the Worker nothing.
 */
const ALBUM_SETTLE_MS = 1500
const SINGLE_SETTLE_MS = 700

interface Context {
  api: TelegramApi
  store: SessionStore
  /** Overridden in tests, where waiting a real second and a half is waste. */
  settle?: { album: number; single: number }
  /**
   * Keeps work running after Telegram has been answered.
   *
   * Telegram delivers a chat's updates one at a time, waiting for the response
   * to each before sending the next. So waiting for a batch to settle *before*
   * replying does the opposite of what it looks like: it serialises the album,
   * every photo becomes the last one in an empty queue, and each posts its own
   * counter. Answering first and settling afterwards is what lets the thirty
   * arrive together and agree on one message.
   */
  defer?: (work: Promise<unknown>) => void
}

export async function handleUpdate(update: TelegramUpdate, context: Context): Promise<void> {
  if (update.callback_query) return await onCallback(update.callback_query, context)
  if (update.message) return await onMessage(update.message, context)
}

async function onMessage(message: NonNullable<TelegramUpdate['message']>, context: Context): Promise<void> {
  const chatId = message.chat.id
  const locale = localeOf(message.from?.language_code)
  const text = message.text?.trim() ?? ''

  if (text.startsWith('/start')) return await greet(chatId, locale, context)
  if (text.startsWith('/done')) return await build(chatId, locale, 'a4', context)
  if (text.startsWith('/cancel') || text.startsWith('/clear')) {
    await context.store.clear(chatId)
    await context.api.sendMessage(chatId, STRINGS[locale].cleared)
    return
  }
  if (text.startsWith('/help') || text.startsWith('/tools')) return await greet(chatId, locale, context)

  const incoming = fileFrom(message)
  if (!incoming) {
    if (text) await context.api.sendMessage(chatId, STRINGS[locale].unsupported)
    return
  }
  if (incoming.bytes > MAX_DOWNLOAD_BYTES) {
    await context.api.sendMessage(chatId, STRINGS[locale].tooBig)
    return
  }

  const session = await context.store.read(chatId)
  if (session.files.length >= MAX_FILES) {
    await context.api.sendMessage(chatId, STRINGS[locale].tooMany(MAX_FILES))
    return
  }
  const total = session.files.reduce((sum, file) => sum + file.bytes, 0)
  if (total + incoming.bytes > MAX_TOTAL_BYTES) {
    await context.api.sendMessage(chatId, STRINGS[locale].tooHeavy)
    return
  }

  await context.store.add(chatId, incoming)

  // The first file answers at once, so the buttons are there while the rest of
  // the album is still uploading. Everything after it coalesces.
  const delays = context.settle ?? { album: ALBUM_SETTLE_MS, single: SINGLE_SETTLE_MS }
  const wait = session.files.length === 0 ? 0 : message.media_group_id ? delays.album : delays.single

  const finish = (async () => {
    try {
      if (wait) await settle(wait)
      await showCount(chatId, locale, incoming, context)
    } catch (error) {
      console.error('[bot] counter failed', error)
    }
  })()

  if (context.defer) context.defer(finish)
  else await finish
}

const settle = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Drop whatever arrived over the caps, and say so.
 *
 * The check made when a file lands reads the table before inserting, and an
 * album lands all at once - so ten invocations can each see room that only one
 * of them is going to use, and the batch ends up past a limit every one of
 * them thought it was inside. This runs after the batch has settled, on what
 * is actually there. Without it someone forwarding ten 20 MB scans gets a
 * Worker that dies at build time with no explanation.
 *
 * Order decides what goes: the files that arrived first are the ones kept, so
 * a cover sent before the pages is never the one thrown away.
 */
async function trimToCaps(chatId: number, files: PendingFile[], context: Context): Promise<PendingFile[]> {
  const kept: PendingFile[] = []
  const over: PendingFile[] = []
  let total = 0

  for (const file of files) {
    if (kept.length < MAX_FILES && total + file.bytes <= MAX_TOTAL_BYTES) {
      kept.push(file)
      total += file.bytes
    } else {
      over.push(file)
    }
  }

  for (const file of over) await context.store.remove(chatId, file.fileId)
  return kept
}

/** The largest photo size Telegram offers, or a document it will accept. */
function fileFrom(message: NonNullable<TelegramUpdate['message']>): PendingFile | null {
  if (message.photo?.length) {
    const largest = message.photo[message.photo.length - 1]!
    return { fileId: largest.file_id, kind: 'image', bytes: largest.file_size ?? 0, name: 'photo.jpg' }
  }

  const document = message.document
  if (!document) return null

  const mime = (document.mime_type ?? '').toLowerCase()
  const name = document.file_name ?? 'file'
  let kind: PendingKind | null = null
  if (IMAGE_TYPES.includes(mime)) kind = 'image'
  else if (mime === 'application/pdf') kind = 'pdf'
  // Telegram sometimes sends no mime type at all; the extension is the only
  // other clue, and the bytes get sniffed again before anything is embedded.
  else if (!mime && /\.(jpe?g|png)$/i.test(name)) kind = 'image'
  else if (!mime && /\.pdf$/i.test(name)) kind = 'pdf'
  if (!kind) return null

  return { fileId: document.file_id, kind, bytes: document.file_size ?? 0, name }
}

/**
 * What the bot can do, said once.
 *
 * A list rather than a menu of buttons: there is no mode to enter here, so a
 * button per capability would only be a label that talks. What you can send is
 * the thing worth knowing; the buttons appear on the file itself, where they
 * can actually act on something.
 */
async function greet(chatId: number, locale: BotLocale, context: Context): Promise<void> {
  const s = STRINGS[locale]
  const lines = [s.greeting, s.can.join('\n'), s.howTo, s.limits, s.sendAsFile, s.privacy]
  await context.api.sendMessage(chatId, lines.join('\n\n'))
}

/**
 * Say what is in the batch, with the buttons that end it.
 *
 * Posted fresh at the bottom of the chat and the previous one deleted, rather
 * than rewritten where it stood: an album pushes thirty photos in underneath,
 * and a counter edited in place ends up somewhere above them where nobody
 * scrolls. The buttons have to be the last thing in the chat to be found.
 *
 * `mine` is the file this invocation added. Thirty of these run at once, so
 * the count is re-read from the table rather than assumed, and whoever's file
 * ended up last is the one that speaks - the other twenty-nine return here.
 */
async function showCount(
  chatId: number,
  locale: BotLocale,
  mine: PendingFile,
  context: Context
): Promise<void> {
  const s = STRINGS[locale]
  const session = await context.store.read(chatId)
  if (session.files.at(-1)?.fileId !== mine.fileId) return

  const files = await trimToCaps(chatId, session.files, context)
  if (files.length < session.files.length) {
    await context.api.sendMessage(chatId, files.length >= MAX_FILES ? s.tooMany(MAX_FILES) : s.tooHeavy)
  }
  const images = files.filter(file => file.kind === 'image').length
  const pdfs = files.length - images

  // The batch decides what to offer: all PDFs merge, anything with a photo in
  // it needs a page size first, because that is the only choice the user has.
  const text = images === 0 ? s.countPdfs(pdfs) : pdfs === 0 ? s.countImages(images) : s.countMixed(images, pdfs)
  const buttons =
    images === 0
      ? [[{ text: s.mergePdfs, callback_data: 'merge' }], [{ text: s.clear, callback_data: 'clear' }]]
      : [
          [{ text: s.makePdfA4, callback_data: 'a4' }],
          [{ text: s.makePdfOriginal, callback_data: 'image' }],
          [{ text: s.clear, callback_data: 'clear' }]
        ]

  const sent = await context.api.sendMessage(chatId, text, buttons)
  await context.store.setCounterMessage(chatId, sent.message_id)
  if (session.counterMessageId) await context.api.deleteMessage(chatId, session.counterMessageId)
}

async function onCallback(query: NonNullable<TelegramUpdate['callback_query']>, context: Context): Promise<void> {
  const chatId = query.message?.chat.id
  const locale = localeOf(query.from?.language_code)
  await context.api.answerCallback(query.id)
  if (!chatId) return

  if (query.data === 'clear') {
    await context.store.clear(chatId)
    await context.api.sendMessage(chatId, STRINGS[locale].cleared)
    return
  }
  if (query.data === 'a4' || query.data === 'image' || query.data === 'merge') {
    await build(chatId, locale, query.data === 'image' ? 'image' : 'a4', context)
  }
}

/**
 * How photos are placed on a page. Irrelevant to a batch of PDFs, which is
 * why the merge button maps onto it too rather than being a mode of its own.
 */
type Fit = 'a4' | 'image'

/** A file after download: the shape `shared/pdf-core` reads structurally. */
interface Held {
  name: string
  type: string
  data: Uint8Array
}

/**
 * Turn the batch into one PDF, keeping the order it was sent in.
 *
 * A run of consecutive photos becomes one image-built PDF; every PDF stays as
 * it is; the pieces are then merged in place. That is what makes a cover work:
 * send the Word-made cover as a PDF first and the scanned pages after it, and
 * the cover comes out in front, because nothing reorders anything.
 *
 * Runs are grouped rather than each photo converted separately because thirty
 * photos would otherwise mean thirty documents to merge, all of the work and
 * none of the benefit.
 */
async function assemble(held: Held[], fit: Fit): Promise<Uint8Array> {
  const parts: Held[] = []
  let photos: Held[] = []

  const flush = async () => {
    if (!photos.length) return
    parts.push({ name: 'photos.pdf', type: 'application/pdf', data: await imagesToPdf(photos, fit) })
    photos = []
  }

  for (const file of held) {
    if (file.type === 'application/pdf') {
      await flush()
      parts.push(file)
    } else {
      photos.push(file)
    }
  }
  await flush()

  // One part needs no merge, and skipping it keeps a plain batch of photos
  // byte-for-byte what it was before mixing was possible.
  return parts.length === 1 ? parts[0]!.data : await mergePdfs(parts)
}

/**
 * Download, convert, send, forget.
 *
 * Files are fetched one at a time and handed straight to the PDF builder;
 * nothing is written to storage at any point, which is what lets the bot
 * say so honestly. A file that fails to download is left out rather than
 * taking the batch down with it - the same rule the site follows.
 */
async function build(chatId: number, locale: BotLocale, fit: Fit, context: Context): Promise<void> {
  const s = STRINGS[locale]
  const session = await context.store.read(chatId)
  if (!session.files.length) {
    await context.api.sendMessage(chatId, s.nothingToDo)
    return
  }

  const progress = await context.api.sendMessage(chatId, s.working)

  try {
    const held: Held[] = []
    let dropped = 0
    for (const file of session.files) {
      try {
        const data = await context.api.download(file.fileId)
        held.push({
          name: file.name,
          type: file.kind === 'pdf' ? 'application/pdf' : 'image/jpeg',
          data
        })
      } catch {
        dropped++
      }
    }

    if (!held.length) {
      await context.api.editMessage(chatId, progress.message_id, s.failed)
      return
    }

    const bytes = await assemble(held, fit)
    const name = `toolkave-${new Date().toISOString().slice(0, 10)}.pdf`
    const caption = dropped ? `${s.failed}\n${s.caption(SITE)}` : s.caption(SITE)

    await context.api.sendDocument(chatId, name, bytes, caption)
    await context.api.editMessage(chatId, progress.message_id, dropped ? s.failed : s.working)
    await context.store.clear(chatId)
  } catch {
    await context.api.editMessage(chatId, progress.message_id, s.failed)
  }
}
