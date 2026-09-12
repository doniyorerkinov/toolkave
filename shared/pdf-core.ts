/**
 * The document operations that need no browser.
 *
 * pdf-lib is pure JavaScript: merging pages and laying images onto them
 * touches no canvas, no DOM, nothing a Cloudflare Worker lacks. Keeping those
 * functions here rather than in `usePdf.ts` means the Telegram bot runs the
 * code the site runs — the same tested merge, the same decryption handling —
 * instead of a second implementation that drifts.
 *
 * Everything that does need a browser (canvas re-encoding, libheif, the
 * pdf.js worker) stays in `app/composables/`, and so stays out of the Worker.
 */

/**
 * A file as both halves of the app hand it around: the browser store's
 * `HeldFile` satisfies this, and so does anything the bot downloads. Declared
 * structurally so this module depends on neither.
 */
export interface PdfSource {
  name: string
  data: Uint8Array
}

export async function loadPdfLib() {
  return await import('@cantoo/pdf-lib')
}

/** Thrown when an editing tool is handed a PDF that needs a password to open. */
export const ENCRYPTED_INPUT = 'toolkave/encrypted-input'

export function isPasswordError(error: unknown): boolean {
  return error instanceof Error && /password/i.test(error.message)
}

/**
 * pdf-lib wants an ArrayBuffer, and a Uint8Array is often only a window over
 * a larger buffer, so slice to exactly its own bytes.
 */
export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

/**
 * Load a document that is about to be modified or have pages copied out of it.
 *
 * `ignoreEncryption: true` is fine for reading metadata, but it leaves every
 * stream encrypted, and copying those into a fresh document produces a file
 * full of garbage. Passing an empty password instead decrypts the common
 * "owner password only" case transparently (printing restrictions and the
 * like), and a file that genuinely needs a password fails here with a code
 * the tools can turn into "unlock it first" rather than a broken download.
 */
export async function loadEditable(file: PdfSource) {
  const { PDFDocument, PDFDict, PDFName } = await loadPdfLib()
  let doc
  try {
    doc = await PDFDocument.load(toArrayBuffer(file.data), { password: '' })
  } catch (error) {
    if (isPasswordError(error)) throw new Error(ENCRYPTED_INPUT)
    throw error
  }

  // A decrypted parse leaves two objects behind that the writer must not see
  // again: the file's old cross-reference dictionary, which pdf-lib registers
  // as a plain dict once its stream is consumed, and the /Encrypt dictionary
  // it points at. Written back, the next reader takes that dictionary for a
  // trailer and the plaintext output reads as encrypted — "needs a password"
  // on a file that has none, which breaks chaining one tool into the next.
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue
    const staleTrailer = object.has(PDFName.of('Root')) && object.has(PDFName.of('Size'))
    const encryptDict = object.get(PDFName.of('Filter')) === PDFName.of('Standard') && object.has(PDFName.of('O'))
    if (staleTrailer || encryptDict) doc.context.delete(ref)
  }

  return doc
}

/**
 * Load a document for reading only (page count, metadata, sizes).
 *
 * Decrypting first matters even here: a PDF that is merely *restricted* —
 * owner password, no password to open — usually keeps its page tree inside
 * object streams, and `ignoreEncryption` leaves those encrypted, so the
 * page count is unreachable and the tool wrongly reports the file unreadable.
 * Only a file that genuinely needs a password falls back to the encrypted
 * view, which is enough for the Info tool to say so.
 */
export async function loadReadable(file: PdfSource) {
  const { PDFDocument } = await loadPdfLib()
  // `updateMetadata` defaults to true and rewrites Producer and ModDate on
  // load — the Info tool would then report pdf-lib and today's date instead
  // of what the file actually says.
  try {
    return await PDFDocument.load(toArrayBuffer(file.data), { password: '', updateMetadata: false })
  } catch (error) {
    if (!isPasswordError(error)) throw error
    return await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true, updateMetadata: false })
  }
}

/** Join documents end to end, in the order given. */
export async function mergePdfs(files: PdfSource[]): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const out = await PDFDocument.create()

  for (const file of files) {
    const source = await loadEditable(file)
    const pages = await out.copyPages(source, source.getPageIndices())
    for (const page of pages) out.addPage(page)
  }

  return await out.save()
}

export type PageFit = 'image' | 'a4'

/** A4 at 72 dpi, the unit pdf-lib works in. */
const A4 = { width: 595.28, height: 841.89 }

/**
 * Build a PDF from images, one image per page.
 *
 * Only JPEG and PNG: those are the two formats pdf-lib embeds without
 * re-encoding, so the pixels in the PDF are the pixels in the file. Anything
 * else has to be converted first, which needs a browser — `normaliseForPdf`
 * in `useImage` does it before calling this.
 */
export async function imagesToPdf(files: PdfSource[], fit: PageFit = 'image'): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const out = await PDFDocument.create()

  for (const file of files) {
    const bytes = file.data
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8

    if (!png && !jpeg) throw new Error(`unsupported image: ${file.name}`)

    const image = png
      ? await out.embedPng(toArrayBuffer(bytes))
      : await out.embedJpg(toArrayBuffer(bytes))

    if (fit === 'a4') {
      const page = out.addPage([A4.width, A4.height])
      const scale = Math.min(A4.width / image.width, A4.height / image.height)
      const width = image.width * scale
      const height = image.height * scale
      page.drawImage(image, {
        x: (A4.width - width) / 2,
        y: (A4.height - height) / 2,
        width,
        height
      })
    } else {
      const page = out.addPage([image.width, image.height])
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
    }
  }

  return await out.save()
}
