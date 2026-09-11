import {
  guessDelimiter,
  gridToJson,
  jsonToGrid,
  rectangular,
  type Delimiter,
  type Grid
} from '~/utils/table'
import { detectEncoding } from '~/utils/encoding'

/**
 * CSV, JSON and Excel, all going through the `Grid` shape in `utils/table`.
 *
 * Both libraries are dynamically imported so a visitor to any other tool never
 * downloads them — SheetJS alone is close to a megabyte.
 */

export interface ReadCsvResult {
  grid: Grid
  delimiter: Delimiter
  /** Which character set the bytes turned out to be in. */
  encoding: string
  /** Parser complaints worth surfacing; the grid is still usable. */
  warnings: string[]
}

/**
 * Read delimited text from raw bytes.
 *
 * The encoding is detected rather than assumed. A CSV exported from 1C or an
 * older Excel is very often windows-1251, and reading it as UTF-8 turns every
 * Cyrillic column into replacement characters before the parser even starts.
 */
export async function readCsv(data: Uint8Array): Promise<ReadCsvResult> {
  // Browser only (see loadPdfLib in usePdf.ts): Rollup cannot even parse
  // papaparse's worker shim, so it must never reach the server bundle.
  if (import.meta.server) throw new Error('browser only')
  const { default: Papa } = await import('papaparse')

  const { best } = detectEncoding(data)
  const text = best.text
  const delimiter = guessDelimiter(text.slice(0, 64 * 1024))

  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    // Drops the blank row a trailing newline produces. A blank line inside a
    // quoted field is part of that field and is not affected.
    skipEmptyLines: true
  })

  const warnings = (parsed.errors ?? [])
    .slice(0, 5)
    .map(error => `${error.type}: ${error.message}${error.row === undefined ? '' : ` (row ${error.row + 1})`}`)

  return {
    grid: rectangular(parsed.data.map(row => row.map(cell => cell ?? ''))),
    delimiter,
    encoding: best.label,
    warnings
  }
}

export interface SheetInfo {
  name: string
  rows: number
  columns: number
}

export interface ReadWorkbookResult {
  sheets: SheetInfo[]
  /** Grid per sheet name, in the workbook's own order. */
  grids: Record<string, Grid>
}

/**
 * Read every sheet of an Excel workbook.
 *
 * Cells come back as formatted text (`raw: false`), so a date shows the date
 * the author saw rather than the serial number underneath it, and a long
 * account number keeps its digits instead of turning into scientific notation.
 */
export async function readWorkbook(data: Uint8Array): Promise<ReadWorkbookResult> {
  if (import.meta.server) throw new Error('browser only')
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellNF: false })

  const sheets: SheetInfo[] = []
  const grids: Record<string, Grid> = {}

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false
    })
    const grid = rectangular(rows.map(row => row.map(cell => (cell == null ? '' : String(cell)))))
    grids[name] = grid
    sheets.push({ name, rows: grid.length, columns: grid[0]?.length ?? 0 })
  }

  return { sheets, grids }
}

/** Build an .xlsx workbook from one or more grids. */
export async function writeWorkbook(grids: Record<string, Grid>): Promise<Uint8Array> {
  if (import.meta.server) throw new Error('browser only')
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()

  for (const [name, grid] of Object.entries(grids)) {
    const sheet = XLSX.utils.aoa_to_sheet(grid)
    // Excel rejects sheet names over 31 characters and the characters in the
    // class below, so a name taken from a filename has to be cleaned first.
    const safe = (name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || 'Sheet1')
    XLSX.utils.book_append_sheet(workbook, sheet, safe)
  }

  const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true })
  return new Uint8Array(out as ArrayBuffer)
}

/* ------------------------------------------------------------------ */
/* Conversions                                                         */
/* ------------------------------------------------------------------ */

export interface CsvToJsonOptions {
  header?: boolean
  typed?: boolean
  indent?: number
}

export function gridToJsonText(grid: Grid, options: CsvToJsonOptions = {}): string {
  const { indent = 2, ...rest } = options
  return JSON.stringify(gridToJson(grid, rest), null, indent)
}

export interface JsonParseResult {
  grid: Grid
  tabular: boolean
}

/** Parse JSON text into a grid, throwing a message the UI can show as-is. */
export function jsonTextToGrid(text: string): JsonParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Invalid JSON')
  }
  return jsonToGrid(parsed)
}
