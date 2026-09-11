import type { HeldFile } from '~/stores/files'
// Type-only: erased at build time, so this does not force an eager load of
// the library the way a value import would.
import type {
  PDFDict as PDFDictType,
  PDFPage as PDFPageType,
  PDFRawStream as PDFRawStreamType,
  Rotation as RotationType
} from '@cantoo/pdf-lib'

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

/** Thrown when an editing tool is handed a PDF that needs a password to open. */
export const ENCRYPTED_INPUT = 'toolkave/encrypted-input'

function isPasswordError(error: unknown): boolean {
  return error instanceof Error && /password/i.test(error.message)
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
async function loadEditable(file: HeldFile) {
  const { PDFDocument } = await loadPdfLib()
  try {
    return await PDFDocument.load(toArrayBuffer(file.data), { password: '' })
  } catch (error) {
    if (isPasswordError(error)) throw new Error(ENCRYPTED_INPUT)
    throw error
  }
}

/** i18n key for an error thrown by any function in this file. */
export function pdfErrorKey(error: unknown): string {
  return error instanceof Error && error.message === ENCRYPTED_INPUT ? 'pdf.errorEncrypted' : 'pdf.errorGeneric'
}

/**
 * The page as a viewer shows it.
 *
 * pdf-lib draws in the page's own coordinate space, which ignores `/Rotate`
 * and the CropBox origin. Scans routinely carry `/Rotate 90`, so "bottom
 * centre" in that space lands on the wrong edge, sideways. Every overlay
 * tool positions in *displayed* space instead and maps through this: the
 * point is moved into page space and the drawn object rotated by the same
 * angle, which cancels the viewer's rotation and leaves it upright where
 * the user put it.
 */
interface DisplayFrame {
  /** Displayed size, after rotation. */
  width: number
  height: number
  /** Pass as `rotate` to draw calls so the object reads upright. */
  rotate: RotationType
  /** Displayed point (origin bottom-left, y up) to page space. */
  toPage: (x: number, y: number) => { x: number; y: number }
}

function displayFrame(page: PDFPageType, degrees: (angle: number) => RotationType): DisplayFrame {
  const box = page.getCropBox()
  const angle = ((Math.round(page.getRotation().angle) % 360) + 360) % 360
  const rotate = degrees(angle)
  const w = box.width
  const h = box.height

  if (angle === 90) {
    return { width: h, height: w, rotate, toPage: (x, y) => ({ x: box.x + w - y, y: box.y + x }) }
  }
  if (angle === 180) {
    return { width: w, height: h, rotate, toPage: (x, y) => ({ x: box.x + w - x, y: box.y + h - y }) }
  }
  if (angle === 270) {
    return { width: h, height: w, rotate, toPage: (x, y) => ({ x: box.x + y, y: box.y + h - x }) }
  }
  return { width: w, height: h, rotate, toPage: (x, y) => ({ x: box.x + x, y: box.y + y }) }
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

/** Each page's size in PDF points — what Annotate and Redact place their overlays against. */
export async function getPageSizes(file: HeldFile): Promise<{ width: number; height: number }[]> {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.load(toArrayBuffer(file.data), { ignoreEncryption: true })
  return doc.getPages().map(page => page.getSize())
}

/* ------------------------------------------------------------------ */
/* Annotate                                                             */
/* ------------------------------------------------------------------ */

interface AnnotationBase {
  /** Zero-based page index. */
  page: number
  /** Fraction of page width/height, measured from the top-left — screen convention, matching how it was drawn. */
  x: number
  y: number
}

export interface HighlightAnnotation extends AnnotationBase {
  kind: 'highlight'
  width: number
  height: number
}

export interface NoteAnnotation extends AnnotationBase {
  kind: 'note'
  text: string
}

export type Annotation = HighlightAnnotation | NoteAnnotation

export interface AnnotateResult {
  data: Uint8Array
  /** Notes that couldn't be drawn (non-Latin text) — skipped, not fatal to the rest. */
  notesSkipped: number
}

/**
 * Add highlight boxes and short text notes on top of a PDF's existing
 * content. Purely additive — every draw call here paints on top of the page,
 * nothing already on it is touched or removed, which is what makes this safe
 * to build on the public `drawRectangle`/`drawText` API rather than needing
 * the object-level surgery `compressPdf` and `redactPdf` do.
 *
 * Note text is Latin-1 only, the same limitation watermark/page-numbers/
 * header-footer already have and for the same reason (no embedded Cyrillic
 * font). A note that fails this is skipped, not fatal — one bad note
 * shouldn't discard every highlight and note around it.
 */
export async function annotatePdf(file: HeldFile, annotations: Annotation[]): Promise<AnnotateResult> {
  const { rgb, degrees } = await loadPdfLib()
  const doc = await loadEditable(file)
  const pages = doc.getPages()

  let notesSkipped = 0

  for (const annotation of annotations) {
    const page = pages[annotation.page]
    if (!page) continue
    // Fractions were measured on the rendered preview, i.e. in displayed
    // space; the frame maps them onto the page's own axes and rotation.
    const frame = displayFrame(page, degrees)
    const { width, height, rotate } = frame

    // The UI's y is measured from the top (how the overlay was drawn); PDF
    // page space measures from the bottom, and drawRectangle/drawText take
    // the *bottom* edge of what they place.
    if (annotation.kind === 'highlight') {
      const boxWidth = annotation.width * width
      const boxHeight = annotation.height * height
      const { x, y } = frame.toPage(annotation.x * width, height - annotation.y * height - boxHeight)
      page.drawRectangle({ x, y, width: boxWidth, height: boxHeight, rotate, color: rgb(1, 0.92, 0.2), opacity: 0.45 })
    } else {
      if (!isLatin1(annotation.text)) {
        notesSkipped++
        continue
      }
      const fontSize = 11
      const left = annotation.x * width
      const baseline = height - annotation.y * height - fontSize
      const box = frame.toPage(left - 3, baseline - 3)
      page.drawRectangle({
        x: box.x,
        y: box.y,
        width: Math.max(20, annotation.text.length * fontSize * 0.55),
        height: fontSize + 6,
        rotate,
        color: rgb(1, 1, 0.85),
        opacity: 0.9,
        borderColor: rgb(0.8, 0.65, 0),
        borderWidth: 0.75
      })
      const text = frame.toPage(left, baseline)
      page.drawText(annotation.text, { x: text.x, y: text.y, size: fontSize, rotate, color: rgb(0.35, 0.25, 0) })
    }
  }

  return { data: await doc.save(), notesSkipped }
}

/* ------------------------------------------------------------------ */
/* Redact (page replacement half — the rendering half lives in the      */
/* component, since rasterising a page needs pdf.js, not pdf-lib)       */
/* ------------------------------------------------------------------ */

export interface FlattenedPageImage {
  /** Zero-based page index this image replaces. */
  page: number
  data: Uint8Array
  mimeType: 'image/jpeg'
}

/**
 * Replace specific pages with flattened images, leaving every other page
 * completely untouched.
 *
 * This is what makes redaction actually safe rather than merely appearing
 * to be: a black rectangle drawn *on top of* live text (the same
 * `annotatePdf` approach above uses for highlights) still leaves that text
 * selectable and copyable underneath it — which is precisely the failure
 * mode behind real, embarrassing "redaction" incidents. The caller rasterises
 * each affected page, paints the redaction boxes directly onto those pixels
 * — so the box overwrites whatever was there before any encoding happens —
 * and hands the flattened result here. The replacement page has no text
 * layer, no annotations, no form fields: nothing behind the box to extract.
 * Pages nobody drew a box on are left exactly as they were, real text intact.
 */
export async function replacePagesWithImages(
  file: HeldFile,
  images: FlattenedPageImage[]
): Promise<Uint8Array> {
  const { degrees } = await loadPdfLib()
  const doc = await loadEditable(file)

  for (const image of images) {
    if (image.page < 0 || image.page >= doc.getPageCount()) continue
    const original = doc.getPage(image.page)
    // The raster was rendered the way a viewer shows the page, so the
    // replacement takes the *displayed* size and carries no /Rotate of its
    // own — otherwise a scanned page stored sideways comes back squashed.
    const { width, height } = displayFrame(original, degrees)

    const embedded = await doc.embedJpg(image.data)
    doc.removePage(image.page)
    const replacement = doc.insertPage(image.page, [width, height])
    replacement.drawImage(embedded, { x: 0, y: 0, width, height })
  }

  return await doc.save()
}

export async function mergePdfs(files: HeldFile[]): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const out = await PDFDocument.create()

  for (const file of files) {
    const source = await loadEditable(file)
    const pages = await out.copyPages(source, source.getPageIndices())
    for (const page of pages) out.addPage(page)
  }

  return await out.save()
}

export async function extractPages(file: HeldFile, pageIndices: number[]): Promise<Uint8Array> {
  const { PDFDocument } = await loadPdfLib()
  const source = await loadEditable(file)
  const out = await PDFDocument.create()

  const valid = pageIndices.filter(i => i >= 0 && i < source.getPageCount())
  if (!valid.length) throw new Error(EMPTY_RESULT)
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
  const { degrees } = await loadPdfLib()
  const doc = await loadEditable(file)

  const targets = pageIndices.length ? pageIndices : doc.getPageIndices()
  for (const index of targets) {
    const page = doc.getPage(index)
    // Add to the existing rotation rather than replacing it, so a page that was
    // already sideways in the source ends up where the user expects.
    const current = page.getRotation().angle
    page.setRotation(degrees((((current + turn) % 360) + 360) % 360))
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
  const source = await loadEditable(file)

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
  const { StandardFonts, rgb, degrees } = await loadPdfLib()
  const doc = await loadEditable(file)
  const font = await doc.embedFont(StandardFonts.Helvetica)

  const pages = doc.getPages()
  const margin = 28

  pages.forEach((page, index) => {
    if (options.skipFirst && index === 0) return

    const label = String(options.startAt + index)
    const width = font.widthOfTextAtSize(label, options.fontSize)
    const frame = displayFrame(page, degrees)
    const { width: pageWidth, height: pageHeight } = frame

    let x = (pageWidth - width) / 2
    let y = margin

    if (options.position === 'bottom-right') x = pageWidth - width - margin
    else if (options.position === 'bottom-left') x = margin
    else if (options.position === 'top-right') {
      x = pageWidth - width - margin
      y = pageHeight - margin - options.fontSize
    }

    page.drawText(label, {
      ...frame.toPage(x, y),
      rotate: frame.rotate,
      size: options.fontSize,
      font,
      color: rgb(0.1, 0.1, 0.1)
    })
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

  const { StandardFonts, degrees, rgb } = await loadPdfLib()
  const doc = await loadEditable(file)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)

  for (const page of doc.getPages()) {
    const frame = displayFrame(page, degrees)
    const { width, height } = frame
    const textWidth = font.widthOfTextAtSize(options.text, options.fontSize)

    // Rotate about the page centre, so the text stays centred at any angle.
    const radians = (options.angle * Math.PI) / 180
    const x = width / 2 - (textWidth / 2) * Math.cos(radians)
    const y = height / 2 - (textWidth / 2) * Math.sin(radians)

    page.drawText(options.text, {
      ...frame.toPage(x, y),
      size: options.fontSize,
      font,
      color: rgb(0.45, 0.45, 0.45),
      opacity: options.opacity,
      // The page's own rotation first, so the angle is relative to the page as seen.
      rotate: degrees(frame.rotate.angle + options.angle)
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

  // pdf-lib throws on a malformed date string, which plenty of generators
  // write; a bad date must not make the whole document unreadable.
  const iso = (read: () => Date | undefined) => {
    try {
      const date = read()
      return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : ''
    } catch {
      return ''
    }
  }

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
    created: iso(() => doc.getCreationDate()),
    modified: iso(() => doc.getModificationDate()),
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

  const { StandardFonts, rgb, degrees } = await loadPdfLib()
  const doc = await loadEditable(file)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const margin = 28

  const place = (text: string, pageWidth: number) => {
    const width = font.widthOfTextAtSize(text, options.fontSize)
    if (options.align === 'left') return margin
    if (options.align === 'right') return pageWidth - width - margin
    return (pageWidth - width) / 2
  }

  for (const page of doc.getPages()) {
    const frame = displayFrame(page, degrees)
    const { width, height, rotate } = frame
    const colour = rgb(0.25, 0.25, 0.25)

    if (options.header) {
      page.drawText(options.header, {
        ...frame.toPage(place(options.header, width), height - margin - options.fontSize),
        rotate,
        size: options.fontSize,
        font,
        color: colour
      })
    }
    if (options.footer) {
      page.drawText(options.footer, {
        ...frame.toPage(place(options.footer, width), margin),
        rotate,
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
  const doc = await loadEditable(file)

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

/**
 * Field kinds are told apart with `instanceof`, never `constructor.name`:
 * the production build minifies class names, so a name check passes in
 * `nuxt dev` and silently matches nothing once deployed.
 */
export async function readFormFields(file: HeldFile): Promise<FormField[]> {
  const { PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } = await loadPdfLib()
  const doc = await loadEditable(file)

  return doc.getForm().getFields().map(field => {
    const name = field.getName()

    if (field instanceof PDFTextField) {
      return { name, type: 'text' as const, value: field.getText() ?? '', options: [] }
    }
    if (field instanceof PDFCheckBox) {
      return { name, type: 'checkbox' as const, value: field.isChecked() ? 'on' : '', options: [] }
    }
    if (field instanceof PDFDropdown) {
      return {
        name,
        type: 'dropdown' as const,
        value: field.getSelected()[0] ?? '',
        options: field.getOptions()
      }
    }
    if (field instanceof PDFRadioGroup) {
      return {
        name,
        type: 'radio' as const,
        value: field.getSelected() ?? '',
        options: field.getOptions()
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
  const { PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } = await loadPdfLib()
  const doc = await loadEditable(file)
  const form = doc.getForm()

  for (const field of form.getFields()) {
    const name = field.getName()
    if (!(name in values)) continue
    const value = values[name] ?? ''

    try {
      if (field instanceof PDFTextField) field.setText(value)
      else if (field instanceof PDFCheckBox) {
        value ? field.check() : field.uncheck()
      } else if (field instanceof PDFDropdown && value) field.select(value)
      else if (field instanceof PDFRadioGroup && value) field.select(value)
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
  const doc = await loadEditable(file)

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
  const { degrees } = await loadPdfLib()
  const doc = await loadEditable(file)

  const png = await doc.embedPng(toArrayBuffer(placement.image))
  const page = doc.getPage(Math.min(placement.pageIndex, doc.getPageCount() - 1))
  // "From the left / from the top" mean the page as the user sees it.
  const frame = displayFrame(page, degrees)
  const { width, height } = frame

  const drawWidth = width * placement.widthRatio
  const drawHeight = drawWidth * (png.height / png.width)

  page.drawImage(png, {
    // PDF origin is bottom-left; the UI works top-down, so flip here.
    ...frame.toPage(width * placement.xRatio, height * (1 - placement.yRatio) - drawHeight),
    rotate: frame.rotate,
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
  const doc = await loadEditable(file)

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
  } catch (error) {
    // Only a password failure is reported as one; a corrupt file must not
    // send someone hunting for a password they already have right.
    if (isPasswordError(error)) throw new Error(WRONG_PASSWORD)
    throw error
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

/* ------------------------------------------------------------------ */
/* Grayscale                                                           */
/* ------------------------------------------------------------------ */

/**
 * Convert a PDF to grayscale without rasterising it.
 *
 * The obvious implementation — render each page to a canvas, desaturate,
 * rebuild — destroys the text layer: the result is no longer selectable or
 * searchable and is usually larger. This instead paints a mid-grey rectangle
 * over each page through a graphics state whose blend mode is `Saturation`.
 *
 * That blend mode takes the *saturation* of the source and the hue and
 * luminosity of what is underneath. The source is grey, so its saturation is
 * zero, and every colour beneath collapses to its own brightness. Text stays
 * text, vectors stay vectors, and the file barely grows.
 *
 * The catch is honest and worth stating on the page: this is a display-level
 * transformation. A viewer that ignores blend modes shows the original colours,
 * and the colour data is still in the file. It is the right tool for printing
 * and for cutting ink cost, not for removing colour information for good.
 */
export async function grayscalePdf(file: HeldFile): Promise<Uint8Array> {
  const {
    PDFName,
    pushGraphicsState,
    popGraphicsState,
    setGraphicsState,
    setFillingGrayscaleColor,
    rectangle,
    fill
  } = await loadPdfLib()

  const doc = await loadEditable(file)

  for (const page of doc.getPages()) {
    // The MediaBox rather than getSize(), because its origin is not always
    // (0, 0) and a rectangle drawn from zero would then sit off the page.
    const { x, y, width, height } = page.getMediaBox()

    const state = doc.context.obj({
      Type: 'ExtGState',
      BM: PDFName.of('Saturation'),
      // Fully opaque: the blend mode does the work, not transparency.
      ca: 1,
      CA: 1
    })
    const name = page.node.newExtGState('GSgray', state)

    page.pushOperators(
      pushGraphicsState(),
      setGraphicsState(name),
      setFillingGrayscaleColor(0.5),
      rectangle(x, y, width, height),
      fill(),
      popGraphicsState()
    )
  }

  return await doc.save()
}

/* ------------------------------------------------------------------ */
/* Compress                                                             */
/* ------------------------------------------------------------------ */

export interface CompressOptions {
  /** JPEG re-encode quality, 0–1. */
  quality?: number
  /** Images with a longer side above this are downsampled to it. */
  maxDimension?: number
}

export interface CompressResult {
  data: Uint8Array
  imagesCompressed: number
  imagesSkipped: number
}

/** Nothing eligible was found to shrink — the caller shows this rather than a silent no-op. */
export const NOTHING_TO_COMPRESS = 'toolkave/nothing-to-compress'

/**
 * Shrink a PDF by recompressing the raster images already embedded in it,
 * leaving every page's text and vector content completely untouched.
 *
 * The obvious approach — render each page to an image, re-encode, rebuild —
 * was rejected early (see the build-order doc): it rasterises text along with
 * everything else, so the result is no longer selectable or searchable, and a
 * text-heavy file can come out *larger*. This instead reaches into the PDF's
 * object graph, finds the Image XObjects a scan or a photo-heavy document
 * actually carries the weight in, and replaces just their compressed stream
 * data. Nothing about how the page positions or paints its content changes.
 *
 * Deliberately scoped to the case this can be fully confident about: an image
 * whose filter is already `DCTDecode` (JPEG) in `DeviceRGB` or `DeviceGray`.
 * That covers the overwhelming majority of "this PDF is huge" cases — a scan
 * or a phone photo dropped into a page — decodable natively by the browser
 * with no image-format guessing. A `FlateDecode` raw bitmap, an indexed or
 * ICC colour space, or a JPXDecode (JPEG 2000) image is left exactly as it
 * was rather than risk writing back a colour space that doesn't match what
 * canvas re-encoding actually produces. That is a real gap for something
 * scanned by unusual software, not this function reaching for every case —
 * it says so in the result rather than silently doing nothing.
 */
export async function compressPdf(
  file: HeldFile,
  options: CompressOptions = {}
): Promise<CompressResult> {
  const { quality = 0.72, maxDimension = 1600 } = options
  const { PDFName, PDFNumber, PDFArray, PDFDict, PDFStream, PDFRawStream } = await loadPdfLib()

  const doc = await loadEditable(file)
  const context = doc.context

  let imagesCompressed = 0
  let imagesSkipped = 0
  // Resource dictionaries are frequently shared between pages (and Form
  // XObjects reused across pages), so each is only visited once. Images are
  // tracked separately: a letterhead referenced from several pages' own
  // Resources would otherwise be decoded and re-encoded once per page,
  // losing quality each time.
  const visited = new Set<PDFDictType>()
  const seenImages = new Set<PDFRawStreamType>()

  const RGB_SPACE = new Set(['DeviceRGB', 'CalRGB'])
  const GRAY_SPACE = new Set(['DeviceGray', 'CalGray'])

  function colorSpaceName(spaceEntry: unknown): string | null {
    if (spaceEntry instanceof PDFName) return spaceEntry.decodeText()
    // An indirect reference to a name, or an array (ICC/indexed spaces) —
    // resolved separately below; arrays are intentionally not unwrapped here,
    // since an indexed or ICC space is exactly what gets skipped.
    return null
  }

  async function recompressImage(stream: PDFRawStreamType): Promise<boolean> {
    const dict = stream.dict
    // `/Filter /DCTDecode` and `/Filter [/DCTDecode]` are both common spellings.
    const filter = dict.lookup(PDFName.of('Filter'))
    const filterName =
      filter instanceof PDFName
        ? filter.decodeText()
        : filter instanceof PDFArray && filter.size() === 1
          ? (filter.lookupMaybe(0, PDFName)?.decodeText() ?? null)
          : null
    if (filterName !== 'DCTDecode') return false // Not already a JPEG — out of scope.

    const spaceEntry = dict.get(PDFName.of('ColorSpace'))
    const resolvedSpace = spaceEntry instanceof PDFName ? spaceEntry : context.lookupMaybe(spaceEntry, PDFName)
    const spaceName = colorSpaceName(resolvedSpace)
    const isRgb = spaceName !== null && RGB_SPACE.has(spaceName)
    const isGray = spaceName !== null && GRAY_SPACE.has(spaceName)
    if (!isRgb && !isGray) return false // Indexed/ICC/unknown — leave untouched rather than guess.
    // A /Decode array remaps sample values per component, so it would no
    // longer fit once a grey image is rewritten as RGB below.
    if (dict.has(PDFName.of('Decode'))) return false

    const originalBytes = stream.getContents()
    if (originalBytes.length < 20 * 1024) return false // Already tiny; recompressing risks looking worse for no real gain.

    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(new Blob([originalBytes as BlobPart], { type: 'image/jpeg' }))
    } catch {
      return false // Not actually a decodable JPEG despite the filter name — leave it alone.
    }

    // A soft mask or stencil mask is sized to the image it belongs to, so an
    // image that carries one keeps its dimensions and is only re-encoded.
    const hasMask = dict.has(PDFName.of('SMask')) || dict.has(PDFName.of('Mask'))
    const scale = hasMask ? 1 : Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale))
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) {
      bitmap.close()
      return false
    }
    canvasContext.imageSmoothingQuality = 'high'
    canvasContext.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
    bitmap.close()

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (!blob) return false
    const recompressed = new Uint8Array(await blob.arrayBuffer())

    // Only keep it if it actually helped — a already-compact or already
    // low-quality source can come back larger after a fresh JPEG encode.
    if (recompressed.length >= originalBytes.length) return false

    stream.updateContents(recompressed)
    dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'))
    // Any decode parameters (a /ColorTransform hint, say) described the old
    // stream; the canvas writes a plain JFIF that needs none.
    dict.delete(PDFName.of('DecodeParms'))
    dict.set(PDFName.of('Width'), PDFNumber.of(targetWidth))
    dict.set(PDFName.of('Height'), PDFNumber.of(targetHeight))
    // A downstream canvas re-encode always yields full 8-bit samples,
    // regardless of what the original bit depth happened to be.
    dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8))
    // Re-encoding through a canvas can only produce RGB pixels; a source
    // that was DeviceGray is written back as such, since canvas has no
    // grayscale JPEG output mode — the visual result is unaffected, only the
    // colour space declaration and channel count change to match reality.
    if (isGray) dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'))

    return true
  }

  async function processResources(resources: PDFDictType | undefined): Promise<void> {
    if (!resources || visited.has(resources)) return
    visited.add(resources)

    const xObjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict)
    if (!xObjects) return

    for (const [, ref] of xObjects.entries()) {
      const stream = context.lookupMaybe(ref, PDFStream)
      if (!stream) continue

      const subtype = stream.dict.get(PDFName.of('Subtype'))
      const subtypeName = subtype instanceof PDFName ? subtype.decodeText() : null

      if (subtypeName === 'Image' && stream instanceof PDFRawStream) {
        if (seenImages.has(stream)) continue
        seenImages.add(stream)
        const ok = await recompressImage(stream)
        if (ok) imagesCompressed++
        else imagesSkipped++
      } else if (subtypeName === 'Form') {
        // A Form XObject carries its own Resources, which can reference
        // further images — grouped or transformed content commonly nests
        // this way.
        const formResources = stream.dict.lookupMaybe(PDFName.of('Resources'), PDFDict)
        await processResources(formResources ?? resources)
      }
    }
  }

  for (const page of doc.getPages()) {
    await processResources(page.node.Resources())
  }

  return {
    data: await doc.save(),
    imagesCompressed,
    imagesSkipped
  }
}

/**
 * `pdf-lib` accepts an ArrayBuffer. A Uint8Array from the store may be a view
 * over a larger buffer, so slice to exactly its own bytes.
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}
