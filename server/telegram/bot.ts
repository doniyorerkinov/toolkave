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

interface Context {
  api: TelegramApi
  store: SessionStore
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
  await showCount(chatId, locale, [...session.files, incoming], session.counterMessageId, context)
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

async function greet(chatId: number, locale: BotLocale, context: Context): Promise<void> {
  const s = STRINGS[locale]
  await context.api.sendMessage(
    chatId,
    `${s.greeting}\n\n${s.howTo}\n\n${s.limits}\n\n${s.sendAsFile}\n\n${s.privacy}`
  )
}

/** The running count, rewritten in place, with the buttons that end the batch. */
async function showCount(
  chatId: number,
  locale: BotLocale,
  files: PendingFile[],
  counterMessageId: number | null,
  context: Context
): Promise<void> {
  const s = STRINGS[locale]
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

  if (counterMessageId) {
    await context.api.editMessage(chatId, counterMessageId, text, buttons)
    return
  }
  const sent = await context.api.sendMessage(chatId, text, buttons)
  await context.store.setCounterMessage(chatId, sent.message_id)
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
