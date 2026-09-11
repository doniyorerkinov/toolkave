/**
 * Word documents, Markdown and HTML.
 *
 * `mammoth` reads .docx by mapping Word's styles onto a small set of semantic
 * elements rather than trying to reproduce Word's layout. That is the right
 * trade for this site: the output is clean, predictable HTML that the other
 * converters here can rely on.
 *
 * .doc (the pre-2007 binary format) is a completely different container and is
 * not supported by anything that runs in a browser. Callers check for it and
 * say so rather than failing with a parse error.
 */

/**
 * Prebuilt browser bundle: the default entry reaches for `fs` under a bundler.
 * The extension is spelled out because Node's ESM resolver, which the test
 * scripts use, does not add one.
 */
async function loadMammoth() {
  // Browser only. `import.meta.server` is a build-time constant, so in the server
  // build this throws before the import and Rollup drops the import as dead code:
  // the Worker bundle never carries the library, and never has to parse it.
  if (import.meta.server) throw new Error('browser only')
  return (await import('mammoth/mammoth.browser.js')).default
}

/** The magic bytes of the old binary .doc container. */
export function isLegacyDoc(data: Uint8Array): boolean {
  return (
    data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0 &&
    data[4] === 0xa1 && data[5] === 0xb1 && data[6] === 0x1a && data[7] === 0xe1
  )
}

/** .docx is a zip, so it starts with the local file header signature. */
export function isDocx(data: Uint8Array): boolean {
  return data[0] === 0x50 && data[1] === 0x4b && (data[2] === 0x03 || data[2] === 0x05 || data[2] === 0x07)
}

export interface DocxHtmlResult {
  html: string
  /** Style mappings mammoth could not honour. Informational, not errors. */
  messages: string[]
}

function toBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

export async function docxToHtml(data: Uint8Array): Promise<DocxHtmlResult> {
  const mammoth = await loadMammoth()
  const result = await mammoth.convertToHtml(
    { arrayBuffer: toBuffer(data) },
    {
      // Word's own heading styles, plus the Russian-locale names, which are
      // what documents written in a localised Word actually carry.
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Название'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Подзаголовок'] => h2:fresh",
        "p[style-name='Quote'] => blockquote:fresh",
        "p[style-name='Цитата'] => blockquote:fresh"
      ]
    }
  )
  return {
    html: result.value,
    messages: (result.messages ?? []).map(message => message.message)
  }
}

export async function docxToText(data: Uint8Array): Promise<string> {
  const mammoth = await loadMammoth()
  const result = await mammoth.extractRawText({ arrayBuffer: toBuffer(data) })
  return result.value
}

/* ------------------------------------------------------------------ */
/* Markdown                                                            */
/* ------------------------------------------------------------------ */

/**
 * Render a GitHub-flavoured table in one go.
 *
 * Turndown has no table support of its own, and the usual plugin builds tables
 * cell by cell through rules that fight anything nested inside them. Handling
 * the whole element at once is both shorter and more predictable, and tables
 * are common enough in Word documents to be worth getting right.
 */
function renderTable(table: HTMLElement, inline: (node: Node) => string): string {
  // querySelectorAll rather than the `.rows`/`.cells` shortcuts, which are
  // convenience properties some DOM implementations do not provide.
  const rows = Array.from(table.querySelectorAll('tr'))
  if (!rows.length) return ''

  const grid = rows.map(row =>
    Array.from(row.querySelectorAll('th, td')).map(cell =>
      inline(cell).replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|').trim()
    )
  )
  const width = grid.reduce((max, row) => Math.max(max, row.length), 0)
  if (!width) return ''

  const pad = (row: string[]) => {
    const filled = [...row, ...Array(Math.max(0, width - row.length)).fill('')]
    return `| ${filled.join(' | ')} |`
  }

  // Markdown tables must have a header row. If the document's table has no
  // <th>, the first row is promoted rather than emitting an invalid table.
  const [head = [], ...body] = grid
  return ['', pad(head), `| ${Array(width).fill('---').join(' | ')} |`, ...body.map(pad), ''].join('\n')
}

async function makeTurndown() {
  if (import.meta.server) throw new Error('browser only')
  const { default: TurndownService } = await import('turndown')

  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*'
  })

  service.addRule('tables', {
    filter: 'table',
    replacement: (_content, node) =>
      renderTable(node as HTMLElement, child => service.turndown((child as HTMLElement).innerHTML ?? ''))
  })

  // Word emits <u> for underline, which has no Markdown equivalent. Dropping
  // the tag keeps the text rather than losing the run entirely.
  service.addRule('underline', {
    filter: ['u'],
    replacement: content => content
  })

  /*
   * Turndown pads list markers out to a fixed width — "-   item", "1.  item".
   * That is valid Markdown and renders identically, but it is not what anyone
   * expects to see in an exported file, and it survives into anything the user
   * pastes it into. This is Turndown's own rule with the padding reduced to a
   * single space and continuation lines indented to match.
   */
  service.addRule('listItem', {
    filter: 'li',
    replacement: (content, node) => {
      const body = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(/\n/gm, '\n  ')

      const parent = node.parentNode as HTMLElement | null
      let prefix = `${service.options.bulletListMarker} `

      if (parent && parent.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? 1)
        const index = Array.prototype.indexOf.call(parent.children, node)
        prefix = `${(Number.isFinite(start) ? start : 1) + index}. `
      }

      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '')
    }
  })

  // Turndown's default is to pass the *contents* of these through as text, so
  // converting a page that contains a script would paste its source into the
  // Markdown. Remove the elements outright.
  service.remove(['script', 'style', 'noscript', 'iframe'])

  return service
}

export async function htmlToMarkdown(html: string): Promise<string> {
  const service = await makeTurndown()
  return service.turndown(html)
}

export async function markdownToHtml(markdown: string): Promise<string> {
  if (import.meta.server) throw new Error('browser only')
  const { marked } = await import('marked')
  const html = await marked.parse(markdown, { gfm: true, breaks: false })
  return html
}

export async function docxToMarkdown(data: Uint8Array): Promise<string> {
  const { html } = await docxToHtml(data)
  return htmlToMarkdown(html)
}

/* ------------------------------------------------------------------ */
/* Safe preview                                                        */
/* ------------------------------------------------------------------ */

/**
 * Sanitise HTML before it is rendered into the page.
 *
 * The HTML comes from the visitor's own file, so this is not protecting them
 * from a third party — it is making sure a document that happens to contain a
 * script tag cannot execute inside the tool while they are previewing it.
 */
export async function sanitiseHtml(html: string): Promise<string> {
  if (import.meta.server) throw new Error('browser only')
  const { default: DOMPurify } = await import('dompurify')
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}
