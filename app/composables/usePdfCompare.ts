/**
 * Page-level comparison between two PDFs' extracted text.
 *
 * Pure and framework-free on purpose — the classification logic (identical /
 * changed / added / removed) is exactly the part worth getting right and
 * testing directly, separately from the worker calls and the UI built on it.
 */

export type PageDiffStatus = 'identical' | 'changed' | 'added' | 'removed'

export interface PageComparison {
  /** 1-indexed. */
  page: number
  status: PageDiffStatus
  textA: string
  textB: string
}

/**
 * Whitespace differences between two extractions of the same visual content
 * are common — pdf.js's own line-break heuristic can place a space slightly
 * differently — and are not what "changed" should mean here. Comparison uses
 * this; the raw text (not this) is what gets shown and diffed on screen.
 */
function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function comparePages(pagesA: string[], pagesB: string[]): PageComparison[] {
  const count = Math.max(pagesA.length, pagesB.length)
  const out: PageComparison[] = []

  for (let i = 0; i < count; i++) {
    const inA = i < pagesA.length
    const inB = i < pagesB.length
    const textA = pagesA[i] ?? ''
    const textB = pagesB[i] ?? ''

    let status: PageDiffStatus
    if (!inB) status = 'removed' // Page exists only in A.
    else if (!inA) status = 'added' // Page exists only in B.
    else status = normalise(textA) === normalise(textB) ? 'identical' : 'changed'

    out.push({ page: i + 1, status, textA, textB })
  }

  return out
}

export interface CompareSummary {
  identical: number
  changed: number
  added: number
  removed: number
}

export function summarise(comparisons: PageComparison[]): CompareSummary {
  const summary: CompareSummary = { identical: 0, changed: 0, added: 0, removed: 0 }
  for (const item of comparisons) summary[item.status]++
  return summary
}
