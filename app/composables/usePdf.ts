import type { HeldFile } from '~/stores/files'

/**
 * Thin PDF API. Every entry point imports `pdf-lib` dynamically, so the library
 * is fetched only when a PDF tool is actually used - never on the word counter
 * or the homepage.
 *
 * Merge and split are fast enough to stay on the main thread. The heavy
 * operations (compress, rasterise, OCR) move to a web worker in Phase 3.
 */

async function loadPdfLib() {
  return await import('pdf-lib')
}

export interface PdfInfo {
  pageCount: number
}

export async function readPdfInfo(file: HeldFile): Promise<PdfInfo> {
  const { PDFDocument } = await loadPdfLib()
  // Encrypted files would otherwise throw; ignoreEncryption lets us at least
  // report the page count for owner-password-only documents.
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })
  return { pageCount: doc.getPageCount() }
}

export async function mergePdfs(files: HeldFile[]): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const out = await PDFDocument.create()

  for (const file of files) {
    const source = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })
    const pages = await out.copyPages(source, source.getPageIndices())
    for (const page of pages) out.addPage(page)
  }

  return await out.save()
}

export async function extractPages(file: HeldFile, pageIndices: number[]): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const source = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })
  const out = await PDFDocument.create()

  const valid = pageIndices.filter(i => i >= 0 && i < source.getPageCount())
  const pages = await out.copyPages(source, valid)
  for (const page of pages) out.addPage(page)

  return await out.save()
}

/** Rotate pages by a multiple of 90 degrees. Empty `pageIndices` means all pages. */
export async function rotatePdf(
  file: HeldFile,
  turn: number,
  pageIndices: number[] = []
): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await loadPdfLib()
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })

  const targets = pageIndices.length ? pageIndices : doc.getPageIndices()
  for (const index of targets) {
    const page = doc.getPage(index)
    // Add to the existing rotation rather than replacing it, so a page that was
    // already sideways in the source ends up where the user expects.
    const current = page.getRotation().angle
    page.setRotation(degrees((current + turn) % 360))
  }

  return await doc.save()
}

/** Thrown when an operation would leave a PDF with no pages at all. */
export const EMPTY_RESULT = 'toolkave/empty-result'

/** Keep everything except the given pages. */
export async function removePdfPages(
  file: HeldFile,
  pageIndices: number[]
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const source = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })

  const drop = new Set(pageIndices)
  const keep = source.getPageIndices().filter(i => !drop.has(i))

  // A zero-page PDF is not a valid document - pdf-lib will happily save one and
  // readers then disagree about what it contains. Refuse instead of handing the
  // user a broken file.
  if (!keep.length) throw new Error(EMPTY_RESULT)

  const out = await PDFDocument.create()
  const pages = await out.copyPages(source, keep)
  for (const page of pages) out.addPage(page)

  return await out.save()
}

export type PageFit = 'image' | 'a4'

/** A4 at 72 dpi, the unit pdf-lib works in. */
const A4 = { width: 595.28, height: 841.89 }

/**
 * Build a PDF from images, one image per page.
 *
 * pdf-lib embeds JPEG and PNG directly, so the pixels are copied across without
 * re-encoding and nothing is lost. Format is detected from the file's magic
 * bytes rather than its extension, because a .jpg that is actually a PNG is
 * common enough to matter.
 */
export async function imagesToPdf(files: HeldFile[], fit: PageFit = 'image'): Promise<Uint8Array> {
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

/**
 * `pdf-lib` accepts an ArrayBuffer. A Uint8Array from the store may be a view
 * over a larger buffer, so slice to exactly its own bytes.
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}
