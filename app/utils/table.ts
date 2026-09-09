/**
 * Tabular data as a plain grid of strings, and the conversions between that
 * grid and JSON.
 *
 * Every table tool on the site funnels through this one shape: CSV, Excel and
 * JSON all become `string[][]`, so a converter is a pair of adapters rather
 * than a new implementation each time. Nothing here touches a library or the
 * DOM, which keeps it testable under Node.
 */

export type Grid = string[][]

/** A JSON value we are prepared to put in a cell. */
type Scalar = string | number | boolean | null

/* ------------------------------------------------------------------ */
/* Delimiters                                                          */
/* ------------------------------------------------------------------ */

export const DELIMITERS = [',', ';', '\t', '|'] as const
export type Delimiter = (typeof DELIMITERS)[number]

/**
 * Guess the column separator.
 *
 * Semicolons matter more than they look: Excel in a Russian or Uzbek locale
 * writes CSV with semicolons, because the comma is the decimal separator. A
 * comma-only reader mangles every such file into a single column.
 *
 * The test is not "which character is most common" but "which character gives
 * the most consistent column count", which is what actually distinguishes a
 * separator from punctuation inside the text.
 */
export function guessDelimiter(sample: string): Delimiter {
  const lines = sample.split(/\r\n|\r|\n/).filter(line => line.trim().length).slice(0, 20)
  if (!lines.length) return ','

  let best: Delimiter = ','
  let bestScore = -Infinity

  for (const delimiter of DELIMITERS) {
    const counts = lines.map(line => countOutsideQuotes(line, delimiter))
    const first = counts[0] ?? 0
    if (first === 0) continue

    const consistent = counts.filter(count => count === first).length / counts.length
    // Consistency decides; the raw count only breaks ties between separators
    // that are equally consistent.
    const score = consistent * 100 + Math.min(first, 20)
    if (score > bestScore) {
      bestScore = score
      best = delimiter
    }
  }

  return best
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // A doubled quote inside a quoted field is an escaped quote, not a close.
      if (inQuotes && line[i + 1] === '"') i++
      else inQuotes = !inQuotes
    } else if (ch === delimiter && !inQuotes) {
      count++
    }
  }
  return count
}

/* ------------------------------------------------------------------ */
/* Grid helpers                                                        */
/* ------------------------------------------------------------------ */

/** Pad every row to the widest, so downstream code can index safely. */
export function rectangular(grid: Grid): Grid {
  const width = grid.reduce((max, row) => Math.max(max, row.length), 0)
  return grid.map(row => (row.length === width ? row : [...row, ...Array(width - row.length).fill('')]))
}

/** Drop rows that are entirely empty — a trailing newline produces one. */
export function dropEmptyRows(grid: Grid): Grid {
  return grid.filter(row => row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''))
}

/**
 * Make header names usable as object keys: trimmed, non-empty, and unique.
 * Duplicated headers are real in exported spreadsheets and would otherwise
 * silently overwrite each other.
 */
export function normaliseHeaders(row: string[]): string[] {
  const seen = new Map<string, number>()
  return row.map((raw, index) => {
    const base = String(raw ?? '').trim() || `column${index + 1}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}_${count + 1}`
  })
}

/* ------------------------------------------------------------------ */
/* Grid → JSON                                                          */
/* ------------------------------------------------------------------ */

export interface GridToJsonOptions {
  /** Treat the first row as column names. */
  header?: boolean
  /** Convert "42" to 42 and "true" to true. */
  typed?: boolean
}

/**
 * Text that looks like a number but must stay text. Leading zeros carry
 * meaning in phone numbers, postcodes and account numbers, and turning
 * "007" into 7 quietly corrupts the data.
 */
function looksNumeric(value: string): boolean {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return false
  if (/^-?0\d/.test(value)) return false
  return Number.isFinite(Number(value))
}

export function coerce(value: string, typed: boolean): Scalar {
  if (!typed) return value
  const trimmed = value.trim()
  if (trimmed === '') return ''
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if (looksNumeric(trimmed)) return Number(trimmed)
  return value
}

export function gridToJson(grid: Grid, options: GridToJsonOptions = {}): unknown {
  const { header = true, typed = true } = options
  const rows = dropEmptyRows(rectangular(grid))
  if (!rows.length) return []

  if (!header) return rows.map(row => row.map(cell => coerce(cell, typed)))

  const headers = normaliseHeaders(rows[0]!)
  return rows.slice(1).map(row => {
    const record: Record<string, Scalar> = {}
    headers.forEach((name, index) => {
      record[name] = coerce(row[index] ?? '', typed)
    })
    return record
  })
}

/* ------------------------------------------------------------------ */
/* JSON → grid                                                          */
/* ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  // An array of scalars reads better joined than as JSON.
  if (Array.isArray(value) && value.every(item => item === null || typeof item !== 'object')) {
    return value.map(item => (item === null ? '' : String(item))).join(', ')
  }
  return JSON.stringify(value)
}

/**
 * Flatten nested objects into dotted column names, which is what every
 * spreadsheet export does and what users expect back.
 */
function flatten(value: Record<string, unknown>, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [key, item] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key
    if (isPlainObject(item)) flatten(item, name, out)
    else out[name] = item
  }
  return out
}

export interface JsonToGridResult {
  grid: Grid
  /** False when the input was not a shape that maps onto a table. */
  tabular: boolean
}

export function jsonToGrid(value: unknown): JsonToGridResult {
  // A single object is one row, which is more useful than refusing.
  if (isPlainObject(value)) return jsonToGrid([value])

  if (!Array.isArray(value)) {
    return { grid: [['value'], [cellText(value)]], tabular: false }
  }

  if (!value.length) return { grid: [], tabular: true }

  // An array of arrays is already a grid.
  if (value.every(row => Array.isArray(row))) {
    return { grid: (value as unknown[][]).map(row => row.map(cellText)), tabular: true }
  }

  // An array of scalars becomes a single column.
  if (value.every(item => !isPlainObject(item))) {
    return { grid: [['value'], ...value.map(item => [cellText(item)])], tabular: false }
  }

  const flattened: Record<string, unknown>[] = value.map(item =>
    isPlainObject(item) ? flatten(item) : { value: item }
  )

  // Column order follows first appearance across all rows, so a key present
  // only in later records still gets a column instead of being dropped.
  const columns: string[] = []
  const seen = new Set<string>()
  for (const row of flattened) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue
      seen.add(key)
      columns.push(key)
    }
  }

  return {
    grid: [columns, ...flattened.map(row => columns.map(key => cellText(row[key])))],
    tabular: true
  }
}

/* ------------------------------------------------------------------ */
/* CSV text                                                            */
/* ------------------------------------------------------------------ */

/**
 * Serialise a grid to delimited text.
 *
 * Quoting follows RFC 4180: quote when the value contains the delimiter, a
 * quote or a line break, and double any quote inside. A leading BOM is offered
 * because Excel on Windows reads a UTF-8 CSV as the local code page without
 * it, which is the single most common way Cyrillic CSV files arrive broken.
 */
export function gridToCsv(grid: Grid, delimiter: string = ',', bom = false): string {
  const needsQuotes = new RegExp(`["${escapeForClass(delimiter)}\\r\\n]`)
  const body = grid
    .map(row =>
      row
        .map(cell => {
          const text = cell ?? ''
          return needsQuotes.test(text) ? `"${text.replace(/"/g, '""')}"` : text
        })
        .join(delimiter)
    )
    .join('\r\n')
  return bom ? `﻿${body}` : body
}

function escapeForClass(text: string): string {
  return text.replace(/[\\\]^-]/g, match => `\\${match}`)
}
