/** Human-readable file size. Locale-independent so it needs no translation. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** Swap or append a file extension: "report.pdf" -> "report-merged.pdf". */
export function withSuffix(name: string, suffix: string, extension = 'pdf'): string {
  const base = name.replace(/\.[^.]+$/, '')
  return `${base}${suffix}.${extension}`
}

/**
 * Parse a page-range expression such as "1-3, 5, 8-10" into zero-based indices.
 * Out-of-range and malformed parts are ignored rather than thrown, so a partly
 * typed expression keeps working while the user is still editing it.
 */
export function parsePageRanges(input: string, pageCount: number): number[] {
  const pages = new Set<number>()

  for (const part of input.split(',')) {
    const chunk = part.trim()
    if (!chunk) continue

    const range = chunk.match(/^(\d+)\s*-\s*(\d+)$/)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (!start || !end) continue
      const [lo, hi] = start <= end ? [start, end] : [end, start]
      for (let page = lo; page <= hi; page++) {
        if (page >= 1 && page <= pageCount) pages.add(page - 1)
      }
      continue
    }

    const single = chunk.match(/^(\d+)$/)
    if (single) {
      const page = Number(single[1])
      if (page >= 1 && page <= pageCount) pages.add(page - 1)
    }
  }

  return [...pages].sort((a, b) => a - b)
}
