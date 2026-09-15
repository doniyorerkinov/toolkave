/** A table as rows of cells. Declared here so nothing in `shared` reaches
 * into `app`: the Worker imports this file and must not pull the site in. */
export type Grid = string[][]

/**
 * Generating PDFs that contain real, selectable text — for tables and for
 * converted Word documents.
 *
 * This does not use `pdf-lib` like the rest of the PDF tools. The fonts built
 * into the PDF format are WinAnsi-encoded, so they cannot draw a single
 * Cyrillic character, and the whole point of these tools is Russian and Uzbek
 * documents. `pdfmake` carries Roboto, which covers Russian, Ukrainian and
 * Uzbek Cyrillic (Ўў Ҳҳ Ққ Ғғ) as well as ₽ and №, and it brings a line and
 * page breaking engine that would otherwise have to be written here.
 */

export type PageSize = 'A4' | 'LETTER' | 'A3'
export type Orientation = 'portrait' | 'landscape'

export interface DocPdfOptions {
  pageSize?: PageSize
  orientation?: Orientation
  fontSize?: number
  margin?: number
  title?: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type PdfContent = any
/**
 * pdfmake 0.3 returns promises. The widely-copied 0.2 form —
 * `createPdf(dd).getBuffer(buffer => …)` — still type-checks against the
 * community typings but never calls back, so the tool hangs with no error.
 */
type PdfMakeModule = {
  fonts: Record<string, Record<string, string>>
  addVirtualFileSystem?: (vfs: Record<string, string>) => void
  vfs?: Record<string, string>
  createPdf: (definition: PdfContent) => { getBuffer: () => Promise<Uint8Array> }
}

let pdfMakePromise: Promise<PdfMakeModule> | null = null

async function loadPdfMake(): Promise<PdfMakeModule> {
  // Cached: the fonts are 850 KB and re-registering them on every conversion
  // would repeat that work for no reason.
  pdfMakePromise ??= (async () => {
    if (import.meta.server) throw new Error('browser only')
    // Extensions spelled out: Node's ESM resolver, used by the test scripts,
    // does not add one, and the package has no `exports` map to do it either.
    const [pdfMakeImport, vfsImport] = await Promise.all([
      import('pdfmake/build/pdfmake.js'),
      import('pdfmake/build/vfs_fonts.js')
    ])

    const pdfMake = ((pdfMakeImport as any).default ?? pdfMakeImport) as PdfMakeModule
    const vfs = ((vfsImport as any).default ?? vfsImport) as Record<string, string>

    if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(vfs)
    else pdfMake.vfs = vfs

    pdfMake.fonts = {
      Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-MediumItalic.ttf'
      }
    }

    return pdfMake
  })()

  return pdfMakePromise
}

/**
 * Roboto has no U+02BB, the modifier letter Uzbek uses in oʻzbek and gʻalaba.
 * The typographic left quote is visually all but identical and is what most
 * Uzbek text on the web uses anyway, so substituting it is better than
 * printing a missing-glyph box.
 */
export function normaliseForFont(text: string): string {
  return text.replace(/ʻ/g, '‘').replace(/ʼ/g, '’')
}

async function render(definition: PdfContent): Promise<Uint8Array> {
  const pdfMake = await loadPdfMake()
  const buffer = await pdfMake.createPdf(definition).getBuffer()
  // Node hands back a Buffer here and the browser a Uint8Array; the copy
  // normalises both to something the file store and download path accept.
  return new Uint8Array(buffer)
}

function baseDefinition(options: DocPdfOptions, content: PdfContent): PdfContent {
  const { pageSize = 'A4', orientation = 'portrait', fontSize = 10, margin = 40, title } = options
  return {
    pageSize,
    pageOrientation: orientation,
    pageMargins: [margin, margin, margin, margin],
    info: title ? { Title: title } : undefined,
    defaultStyle: { font: 'Roboto', fontSize, lineHeight: 1.25 },
    content
  }
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

export interface TablePdfOptions extends DocPdfOptions {
  /** Treat the first row as a repeating header. */
  header?: boolean
  /** Draw the grid lines. */
  borders?: boolean
  /** Shade alternate rows, which makes wide tables far easier to follow. */
  zebra?: boolean
}

/** Columns beyond this are unreadable in portrait at any sane font size. */
export const WIDE_TABLE_COLUMNS = 8

export async function gridToPdf(grid: Grid, options: TablePdfOptions = {}): Promise<Uint8Array> {
  const { header = true, borders = true, zebra = true, fontSize = 9, ...rest } = options

  if (!grid.length) throw new Error('EMPTY_TABLE')

  const width = grid.reduce((max, row) => Math.max(max, row.length), 0)
  const body = grid.map((row, rowIndex) =>
    Array.from({ length: width }, (_unused, column) => ({
      text: normaliseForFont(row[column] ?? ''),
      bold: header && rowIndex === 0,
      // Cells are given no explicit width so pdfmake distributes the page
      // between them; long values wrap rather than being cut off.
      noWrap: false
    }))
  )

  const content = {
    table: {
      headerRows: header ? 1 : 0,
      // '*' shares the available width evenly and keeps the table inside the
      // page, which 'auto' does not once a column holds a long value.
      widths: Array(width).fill('*'),
      body,
      dontBreakRows: false
    },
    layout: {
      hLineWidth: () => (borders ? 0.5 : 0),
      vLineWidth: () => (borders ? 0.5 : 0),
      hLineColor: () => '#cbd5e1',
      vLineColor: () => '#cbd5e1',
      fillColor: (rowIndex: number) => {
        if (header && rowIndex === 0) return '#e2e8f0'
        if (zebra && rowIndex % 2 === 1) return '#f8fafc'
        return null
      },
      paddingTop: () => 4,
      paddingBottom: () => 4
    }
  }

  return render(baseDefinition({ fontSize, ...rest }, [content]))
}

/* ------------------------------------------------------------------ */
/* HTML                                                                */
/* ------------------------------------------------------------------ */

const HEADING_SIZES: Record<string, number> = { h1: 20, h2: 16, h3: 14, h4: 12, h5: 11, h6: 10 }

interface InlineStyle {
  bold?: boolean
  italics?: boolean
  decoration?: 'underline'
  link?: string
}

/** Data URIs pdfmake can actually embed. */
function usableImage(source: string): boolean {
  return /^data:image\/(png|jpe?g);base64,/i.test(source)
}

function collectInline(node: Node, style: InlineStyle, out: PdfContent[]): void {
  if (node.nodeType === 3) {
    const text = node.textContent ?? ''
    if (text) out.push({ text: normaliseForFont(text), ...style })
    return
  }
  if (node.nodeType !== 1) return

  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()

  if (tag === 'br') {
    out.push({ text: '\n' })
    return
  }
  if (tag === 'img') {
    // Images cannot sit inside a text run, so they are emitted separately by
    // the block walker; skipped here.
    return
  }

  const next: InlineStyle = { ...style }
  if (tag === 'strong' || tag === 'b') next.bold = true
  if (tag === 'em' || tag === 'i') next.italics = true
  if (tag === 'u' || tag === 'ins') next.decoration = 'underline'
  if (tag === 'a') {
    const href = element.getAttribute('href')
    if (href && /^(https?:|mailto:)/i.test(href)) next.link = href
  }

  for (const child of Array.from(element.childNodes)) collectInline(child, next, out)
}

function inlineContent(element: HTMLElement): PdfContent[] {
  const runs: PdfContent[] = []
  for (const child of Array.from(element.childNodes)) collectInline(child, {}, runs)
  return runs.length ? runs : [{ text: '' }]
}

function listItems(list: HTMLElement, walk: (element: HTMLElement) => PdfContent[]): PdfContent[] {
  return Array.from(list.children)
    .filter(child => child.tagName.toLowerCase() === 'li')
    .map(item => {
      const element = item as HTMLElement
      const nested = Array.from(element.children).filter(child =>
        ['ul', 'ol'].includes(child.tagName.toLowerCase())
      )
      if (!nested.length) return { text: inlineContent(element) }
      // A nested list becomes a stack so the sub-items keep their own bullets.
      return { stack: walk(element) }
    })
}

/**
 * Rows and cells are read with `querySelectorAll` rather than the `.rows` and
 * `.cells` shortcuts. Those are convenience properties that not every DOM
 * implementation provides, and the traversal is the same either way.
 */
function tableRows(table: HTMLElement): HTMLElement[][] {
  return Array.from(table.querySelectorAll('tr')).map(row =>
    Array.from(row.querySelectorAll('th, td')) as HTMLElement[]
  )
}

function tableBody(table: HTMLElement): PdfContent {
  const rows = tableRows(table)
  if (!rows.length) return { text: '' }

  const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
  const body = rows.map(row => {
    const cells = row.map(cell => ({
      text: inlineContent(cell),
      bold: cell.tagName.toLowerCase() === 'th'
    }))
    while (cells.length < width) cells.push({ text: [{ text: '' }], bold: false })
    return cells
  })

  const hasHeader = (rows[0] ?? []).some(cell => cell.tagName.toLowerCase() === 'th')

  return {
    table: { headerRows: hasHeader ? 1 : 0, widths: Array(width).fill('*'), body },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#cbd5e1',
      vLineColor: () => '#cbd5e1'
    },
    margin: [0, 6, 0, 6]
  }
}

/**
 * Walk a block element into pdfmake content.
 *
 * Only the elements mammoth actually produces are handled. That is a short
 * list by design — mammoth maps Word styles onto semantic HTML rather than
 * trying to reproduce Word's layout — so this stays a converter rather than
 * a browser engine.
 */
function walkBlocks(container: HTMLElement, contentWidth: number): PdfContent[] {
  const out: PdfContent[] = []

  const walk = (element: HTMLElement): PdfContent[] => walkBlocks(element, contentWidth)

  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === 3) {
      const text = (child.textContent ?? '').trim()
      if (text) out.push({ text: normaliseForFont(text), margin: [0, 0, 0, 6] })
      continue
    }
    if (child.nodeType !== 1) continue

    const element = child as HTMLElement
    const tag = element.tagName.toLowerCase()

    if (tag in HEADING_SIZES) {
      out.push({
        text: inlineContent(element),
        fontSize: HEADING_SIZES[tag],
        bold: true,
        margin: [0, tag === 'h1' ? 0 : 10, 0, 6]
      })
      continue
    }

    switch (tag) {
      case 'p': {
        const image = element.querySelector('img')
        // Word wraps a picture in its own paragraph. Emitting the image as a
        // block keeps it from being swallowed by an empty text run.
        if (image && !(element.textContent ?? '').trim()) {
          const source = image.getAttribute('src') ?? ''
          if (usableImage(source)) out.push({ image: source, fit: [contentWidth, 700], margin: [0, 6, 0, 6] })
          continue
        }
        out.push({ text: inlineContent(element), margin: [0, 0, 0, 6] })
        break
      }
      case 'ul':
        out.push({ ul: listItems(element, walk), margin: [0, 0, 0, 6] })
        break
      case 'ol':
        out.push({ ol: listItems(element, walk), margin: [0, 0, 0, 6] })
        break
      case 'table':
        out.push(tableBody(element))
        break
      case 'blockquote':
        out.push({
          text: inlineContent(element),
          italics: true,
          margin: [20, 4, 0, 8],
          color: '#475569'
        })
        break
      case 'hr':
        out.push({
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: contentWidth, y2: 0, lineWidth: 0.5, lineColor: '#cbd5e1' }],
          margin: [0, 8, 0, 8]
        })
        break
      case 'img': {
        const source = element.getAttribute('src') ?? ''
        if (usableImage(source)) out.push({ image: source, fit: [contentWidth, 700], margin: [0, 6, 0, 6] })
        break
      }
      case 'pre':
        out.push({
          text: normaliseForFont(element.textContent ?? ''),
          preserveLeadingSpaces: true,
          margin: [0, 4, 0, 8]
        })
        break
      case 'script':
      case 'style':
        break
      default:
        // Divs, sections and spans that reached block level: descend.
        out.push(...walkBlocks(element, contentWidth))
    }
  }

  return out
}

/** Usable width in points, page width minus both margins. */
const PAGE_WIDTHS: Record<PageSize, Record<Orientation, number>> = {
  A4: { portrait: 595, landscape: 842 },
  LETTER: { portrait: 612, landscape: 792 },
  A3: { portrait: 842, landscape: 1191 }
}

/**
 * How to turn an HTML string into something walkable.
 *
 * The browser has `DOMParser`; a Cloudflare Worker has no DOM at all. Rather
 * than branch on the environment, the environment supplies the parser — the
 * same shape as `setPdfFontSource` above, and the reason this file can be
 * imported by both the site and the bot.
 */
type HtmlParser = (html: string) => { body?: unknown; documentElement?: unknown } | null

let parseHtml: HtmlParser = html => new DOMParser().parseFromString(html, 'text/html')

export function setHtmlParser(parser: HtmlParser): void {
  parseHtml = parser
}

export async function htmlToPdf(html: string, options: DocPdfOptions = {}): Promise<Uint8Array> {
  const { pageSize = 'A4', orientation = 'portrait', margin = 40 } = options
  const contentWidth = PAGE_WIDTHS[pageSize][orientation] - margin * 2

  // Mammoth returns a fragment, not a document. A browser's parser would
  // silently wrap it in <html><body>; not every DOM implementation does, and
  // some keep only the first element. Wrapping explicitly removes the doubt.
  const wrapped = /<(html|body)[\s>]/i.test(html) ? html : `<!doctype html><html><body>${html}</body></html>`
  const parsed = parseHtml(wrapped)
  if (!parsed) throw new Error('EMPTY_DOCUMENT')
  const root = parsed.body ?? parsed.documentElement
  if (!root) throw new Error('EMPTY_DOCUMENT')

  const content = walkBlocks(root as HTMLElement, contentWidth)

  if (!content.length) throw new Error('EMPTY_DOCUMENT')

  return render(baseDefinition({ fontSize: 11, ...options }, content))
}
