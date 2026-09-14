/**
 * Comparing two JSON documents by what they mean, not by how they are typed.
 *
 * A line diff on JSON is mostly noise: reformatting, key order and trailing
 * commas all show up as differences while an actual changed value hides
 * among them. This walks both documents and reports the paths where they
 * genuinely disagree.
 */

import { findJsonError } from '~~/shared/json-scan'

export type ChangeKind = 'added' | 'removed' | 'changed'

export interface Change {
  /** Dotted path with bracketed indices, e.g. `user.roles[2]`. */
  path: string
  kind: ChangeKind
  left?: unknown
  right?: unknown
}

export interface DiffResult {
  changes: Change[]
  /** Leaf values present and equal in both. */
  same: number
  /** Leaf values considered, counting each side's extras once. */
  total: number
  /** 0–1. One means the documents mean the same thing. */
  similarity: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function join(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`
  // Keys that are not plain identifiers are quoted, so the path can be pasted.
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? path
      ? `${path}.${key}`
      : key
    : `${path}[${JSON.stringify(key)}]`
}

/** Every leaf under a value, so an added subtree counts as more than one. */
function countLeaves(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + countLeaves(item), 0) || 1
  if (isObject(value)) {
    const keys = Object.keys(value)
    return keys.length ? keys.reduce((sum, key) => sum + countLeaves(value[key]), 0) : 1
  }
  return 1
}

/**
 * Compare two parsed documents.
 *
 * Arrays are compared position by position. Matching them up cleverly — by
 * an id field, or by finding the longest common subsequence — sounds better
 * until it guesses wrong, and a diff that silently re-pairs your items is
 * worse than one that says plainly that index 3 changed.
 */
export function diffJson(left: unknown, right: unknown): DiffResult {
  const changes: Change[] = []
  let same = 0
  let total = 0

  const walk = (a: unknown, b: unknown, path: string) => {
    if (Object.is(a, b)) {
      const leaves = countLeaves(a)
      same += leaves
      total += leaves
      return
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      const length = Math.max(a.length, b.length)
      for (let i = 0; i < length; i++) {
        const here = join(path, i)
        if (i >= a.length) {
          changes.push({ path: here, kind: 'added', right: b[i] })
          total += countLeaves(b[i])
        } else if (i >= b.length) {
          changes.push({ path: here, kind: 'removed', left: a[i] })
          total += countLeaves(a[i])
        } else {
          walk(a[i], b[i], here)
        }
      }
      return
    }

    if (isObject(a) && isObject(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const here = join(path, key)
        const inLeft = Object.hasOwn(a, key)
        const inRight = Object.hasOwn(b, key)
        if (!inLeft) {
          changes.push({ path: here, kind: 'added', right: b[key] })
          total += countLeaves(b[key])
        } else if (!inRight) {
          changes.push({ path: here, kind: 'removed', left: a[key] })
          total += countLeaves(a[key])
        } else {
          walk(a[key], b[key], here)
        }
      }
      return
    }

    // Two different values, or two different shapes entirely.
    changes.push({ path: path || '(root)', kind: 'changed', left: a, right: b })
    total += Math.max(countLeaves(a), countLeaves(b))
  }

  walk(left, right, '')

  // Paths sort so that a parent is listed before its children.
  changes.sort((a, b) => a.path.localeCompare(b.path))
  return { changes, same, total, similarity: total ? same / total : 1 }
}

export interface ParseFailure {
  message: string
  /** 1-based. */
  line: number
  column: number
  snippet: string
}

/**
 * Parse, and on failure say where.
 *
 * The position comes from our own scanner rather than from the thrown error:
 * recent V8 stopped reporting one at all, and every engine words it
 * differently, which is no basis for a tool whose job is to point at the
 * problem.
 */
export function parseJson(text: string): { value: unknown; error: null } | { value: null; error: ParseFailure } {
  const problem = findJsonError(text)
  if (problem) {
    return {
      value: null,
      error: { message: problem.message, line: problem.line, column: problem.column, snippet: problem.snippet }
    }
  }
  try {
    return { value: JSON.parse(text), error: null }
  } catch (error) {
    // The scanner passed it, so this is something the grammar allows but the
    // engine will not build — in practice, a number it cannot represent.
    return {
      value: null,
      error: {
        message: error instanceof Error ? error.message : 'Invalid JSON',
        line: 1,
        column: 1,
        snippet: ''
      }
    }
  }
}
