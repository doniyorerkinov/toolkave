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

/**
 * `pdf-lib` accepts an ArrayBuffer. A Uint8Array from the store may be a view
 * over a larger buffer, so slice to exactly its own bytes.
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}
