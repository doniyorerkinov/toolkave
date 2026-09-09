import type { HeldFile } from '~/stores/files'

/**
 * Thin PDF API. Every entry point imports `pdf-lib` dynamically, so the library
 * is fetched only when a PDF tool is actually used - never on the word counter
 * or the homepage.
 *
 * Merge and split are fast enough to stay on the main thread. The heavy
 * operations (compress, rasterise, OCR) move to a web worker in Phase 3.
 */

/**
 * `@cantoo/pdf-lib` is a maintained fork of `pdf-lib` with the same API plus
 * encryption support, which upstream does not have. Using the fork everywhere
 * avoids shipping two copies of the same 400 KB library.
 *
 * The alternative for encryption was `pdfcpu-wasm`: also free (MIT), but 30 MB
 * unpacked, one commit, and untouched since July 2025.
 */
async function loadPdfLib() {
  return await import('@cantoo/pdf-lib')
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
 * The standard PDF fonts are WinAnsi-encoded, so they cannot draw Cyrillic or
 * most non-Latin text. Embedding a font that can means shipping a TTF and
 * fontkit, which is a large dependency for a watermark.
 *
 * Rather than let pdf-lib throw a cryptic encoding error, callers check this
 * first and say plainly which characters will not work.
 */
export const UNSUPPORTED_TEXT = 'toolkave/unsupported-text'

export function isLatin1(text: string): boolean {
  // Printable Latin-1 only: ASCII space to tilde, plus the accented block.
  // U+007F-U+009F are control codes with no glyph, and neither tabs nor
  // newlines can be drawn as watermark text, so all of them are excluded.
  //
  // The bounds are written as \u escapes on purpose. Typing them literally
  // put a real NUL byte in this file, which silently widened the range to
  // every control character and made git treat the whole file as binary.
  return /^[\u0020-\u007E\u00A0-\u00FF]*$/.test(text)
}

export type NumberPosition = 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-right'

export interface PageNumberOptions {
  position: NumberPosition
  startAt: number
  fontSize: number
  skipFirst: boolean
}

export async function addPageNumbers(
  file: HeldFile,
  options: PageNumberOptions
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib()
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.Helvetica)

  const pages = doc.getPages()
  const margin = 28

  pages.forEach((page, index) => {
    if (options.skipFirst && index === 0) return

    const label = String(options.startAt + index)
    const width = font.widthOfTextAtSize(label, options.fontSize)
    const { width: pageWidth, height: pageHeight } = page.getSize()

    let x = (pageWidth - width) / 2
    let y = margin

    if (options.position === 'bottom-right') x = pageWidth - width - margin
    else if (options.position === 'bottom-left') x = margin
    else if (options.position === 'top-right') {
      x = pageWidth - width - margin
      y = pageHeight - margin - options.fontSize
    }

    page.drawText(label, { x, y, size: options.fontSize, font, color: rgb(0.1, 0.1, 0.1) })
  })

  return await doc.save()
}

export interface WatermarkOptions {
  text: string
  fontSize: number
  opacity: number
  angle: number
}

export async function addWatermark(
  file: HeldFile,
  options: WatermarkOptions
): Promise<Uint8Array> {
  if (!isLatin1(options.text)) throw new Error(UNSUPPORTED_TEXT)

  const { PDFDocument, StandardFonts, degrees, rgb } = await loadPdfLib()
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.HelveticaBold)

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    const textWidth = font.widthOfTextAtSize(options.text, options.fontSize)

    // Rotate about the page centre, so the text stays centred at any angle.
    const radians = (options.angle * Math.PI) / 180
    const x = width / 2 - (textWidth / 2) * Math.cos(radians)
    const y = height / 2 - (textWidth / 2) * Math.sin(radians)

    page.drawText(options.text, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(0.45, 0.45, 0.45),
      opacity: options.opacity,
      rotate: degrees(options.angle)
    })
  }

  return await doc.save()
}

export interface PdfMetadata {
  pageCount: number
  title: string
  author: string
  subject: string
  creator: string
  producer: string
  created: string
  modified: string
  pageSizes: { width: number; height: number; label: string }[]
  encrypted: boolean
}

/** Match a page size to a familiar paper name, within a 4pt tolerance. */
function paperName(width: number, height: number): string {
  const known: [string, number, number][] = [
    ['A4', 595, 842],
    ['A3', 842, 1191],
    ['A5', 420, 595],
    ['Letter', 612, 792],
    ['Legal', 612, 1008]
  ]
  for (const [name, w, h] of known) {
    const portrait = Math.abs(width - w) < 4 && Math.abs(height - h) < 4
    const landscape = Math.abs(width - h) < 4 && Math.abs(height - w) < 4
    if (portrait) return name
    if (landscape) return `${name} (landscape)`
  }
  return 'Custom'
}

export async function readPdfMetadata(file: HeldFile): Promise<PdfMetadata> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })

  const iso = (date: Date | undefined) => (date ? date.toISOString().slice(0, 10) : '')

  const sizes = doc.getPages().map(page => {
    const { width, height } = page.getSize()
    return {
      width: Math.round(width),
      height: Math.round(height),
      label: paperName(width, height)
    }
  })

  return {
    pageCount: doc.getPageCount(),
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
    created: iso(doc.getCreationDate()),
    modified: iso(doc.getModificationDate()),
    pageSizes: sizes,
    encrypted: doc.isEncrypted
  }
}

export interface HeaderFooterOptions {
  header: string
  footer: string
  fontSize: number
  align: 'left' | 'center' | 'right'
}

export async function addHeaderFooter(
  file: HeldFile,
  options: HeaderFooterOptions
): Promise<Uint8Array> {
  if (!isLatin1(options.header) || !isLatin1(options.footer)) throw new Error(UNSUPPORTED_TEXT)

  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib()
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const margin = 28

  const place = (text: string, pageWidth: number) => {
    const width = font.widthOfTextAtSize(text, options.fontSize)
    if (options.align === 'left') return margin
    if (options.align === 'right') return pageWidth - width - margin
    return (pageWidth - width) / 2
  }

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    const colour = rgb(0.25, 0.25, 0.25)

    if (options.header) {
      page.drawText(options.header, {
        x: place(options.header, width),
        y: height - margin - options.fontSize,
        size: options.fontSize,
        font,
        color: colour
      })
    }
    if (options.footer) {
      page.drawText(options.footer, {
        x: place(options.footer, width),
        y: margin,
        size: options.fontSize,
        font,
        color: colour
      })
    }
  }

  return await doc.save()
}

export type PageSizePreset = 'a4' | 'letter' | 'legal' | 'scale'

const PAPER: Record<Exclude<PageSizePreset, 'scale'>, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008]
}

/**
 * Change page size, or scale pages by a factor.
 *
 * Fitting to a paper size scales the content proportionally and then centres
 * it, so nothing is stretched and nothing ends up in the bottom-left corner -
 * which is what happens if you only call `setSize`.
 */
export async function resizePdfPages(
  file: HeldFile,
  preset: PageSizePreset,
  scale = 1
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })

  for (const page of doc.getPages()) {
    if (preset === 'scale') {
      page.scale(scale, scale)
      continue
    }

    const [targetWidth, targetHeight] = PAPER[preset]
    const { width, height } = page.getSize()
    // Keep the page's own orientation rather than forcing everything upright.
    const [tw, th] = width > height ? [targetHeight, targetWidth] : [targetWidth, targetHeight]

    const factor = Math.min(tw / width, th / height)
    page.scaleContent(factor, factor)
    page.translateContent((tw - width * factor) / 2, (th - height * factor) / 2)
    page.setSize(tw, th)
  }

  return await doc.save()
}

export interface FormField {
  name: string
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'other'
  value: string
  options: string[]
}

export async function readFormFields(file: HeldFile): Promise<FormField[]> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })

  const form = doc.getForm()
  return form.getFields().map(field => {
    const name = field.getName()
    const kind = field.constructor.name

    if (kind === 'PDFTextField') {
      const typed = form.getTextField(name)
      return { name, type: 'text' as const, value: typed.getText() ?? '', options: [] }
    }
    if (kind === 'PDFCheckBox') {
      const typed = form.getCheckBox(name)
      return { name, type: 'checkbox' as const, value: typed.isChecked() ? 'on' : '', options: [] }
    }
    if (kind === 'PDFDropdown') {
      const typed = form.getDropdown(name)
      return {
        name,
        type: 'dropdown' as const,
        value: typed.getSelected()[0] ?? '',
        options: typed.getOptions()
      }
    }
    if (kind === 'PDFRadioGroup') {
      const typed = form.getRadioGroup(name)
      return {
        name,
        type: 'radio' as const,
        value: typed.getSelected() ?? '',
        options: typed.getOptions()
      }
    }
    return { name, type: 'other' as const, value: '', options: [] }
  })
}

/** Fill form fields, optionally flattening so the values can no longer be edited. */
export async function fillForm(
  file: HeldFile,
  values: Record<string, string>,
  flatten: boolean
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })
  const form = doc.getForm()

  for (const field of form.getFields()) {
    const name = field.getName()
    if (!(name in values)) continue
    const value = values[name] ?? ''
    const kind = field.constructor.name

    try {
      if (kind === 'PDFTextField') form.getTextField(name).setText(value)
      else if (kind === 'PDFCheckBox') {
        const box = form.getCheckBox(name)
        value ? box.check() : box.uncheck()
      } else if (kind === 'PDFDropdown' && value) form.getDropdown(name).select(value)
      else if (kind === 'PDFRadioGroup' && value) form.getRadioGroup(name).select(value)
    } catch {
      // A value that no longer matches the field's options should not abort the
      // whole fill; the remaining fields are still worth writing.
    }
  }

  if (flatten) form.flatten()
  return await doc.save()
}

/**
 * Turn form fields and annotations into static page content.
 *
 * Flattening a document with no form is a no-op rather than an error, since
 * "make this uneditable" is a reasonable thing to ask of any PDF.
 */
export async function flattenPdf(file: HeldFile): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })

  try {
    doc.getForm().flatten()
  } catch {
    // No form, or a form pdf-lib cannot flatten. The save below still strips
    // nothing and returns a valid document.
  }

  return await doc.save()
}

export interface SignaturePlacement {
  /** PNG bytes of the drawn signature. */
  image: Uint8Array
  pageIndex: number
  /** Position and width as a fraction of the page, so it survives any page size. */
  xRatio: number
  yRatio: number
  widthRatio: number
}

export async function signPdf(file: HeldFile, placement: SignaturePlacement): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })

  const png = await doc.embedPng(toArrayBuffer(placement.image))
  const page = doc.getPage(Math.min(placement.pageIndex, doc.getPageCount() - 1))
  const { width, height } = page.getSize()

  const drawWidth = width * placement.widthRatio
  const drawHeight = drawWidth * (png.height / png.width)

  page.drawImage(png, {
    x: width * placement.xRatio,
    // PDF origin is bottom-left; the UI works top-down, so flip here.
    y: height * (1 - placement.yRatio) - drawHeight,
    width: drawWidth,
    height: drawHeight
  })

  return await doc.save()
}

export const WRONG_PASSWORD = 'toolkave/wrong-password'
export const NOT_ENCRYPTED = 'toolkave/not-encrypted'

/** Whether a file is password-protected, without needing the password. */
export async function isPdfEncrypted(file: HeldFile): Promise<boolean> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })
  return doc.isEncrypted
}

/**
 * Add password protection.
 *
 * A user password is required to open the document at all. An owner password
 * only restricts what can be done once open, and every reader enforces that on
 * the honour system - so the FAQ says plainly that it is a deterrent, not
 * encryption of the content against a determined reader.
 */
export async function protectPdf(
  file: HeldFile,
  userPassword: string,
  ownerPassword?: string
): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })

  doc.encrypt({
    userPassword,
    ownerPassword: ownerPassword || userPassword
  })

  return await doc.save()
}

/**
 * Remove password protection, given the password.
 *
 * `save()` preserves the existing encryption, so decrypting means copying the
 * pages into a fresh document. Document-level metadata does not survive that,
 * so the fields worth keeping are carried across explicitly.
 */
export async function unlockPdf(file: HeldFile, password: string): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()

  const probe = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })
  if (!probe.isEncrypted) throw new Error(NOT_ENCRYPTED)

  let source
  try {
    source = await PDFDocument.load(toArrayBuffer(file.data), { password })
  } catch {
    throw new Error(WRONG_PASSWORD)
  }

  const out = await PDFDocument.create()
  const pages = await out.copyPages(source, source.getPageIndices())
  for (const page of pages) out.addPage(page)

  const title = source.getTitle()
  const author = source.getAuthor()
  const subject = source.getSubject()
  if (title) out.setTitle(title)
  if (author) out.setAuthor(author)
  if (subject) out.setSubject(subject)

  return await out.save()
}

/**
 * `pdf-lib` accepts an ArrayBuffer. A Uint8Array from the store may be a view
 * over a larger buffer, so slice to exactly its own bytes.
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}
