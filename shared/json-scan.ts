/**
 * Finding out exactly where a JSON document goes wrong.
 *
 * `JSON.parse` throws, but what it says depends on the engine and recent
 * versions of V8 stopped reporting a position at all — leaving "Unexpected
 * token '}'" and a 400-line file to search by eye. A validator whose whole
 * job is to point at the problem cannot be built on that, so this walks the
 * text itself and reports a line, a column, and what it expected instead.
 *
 * Deliberately accepts exactly what JSON.parse accepts: no comments, no
 * trailing commas, no single quotes. Being lenient here would mean telling
 * someone their file is fine when their parser will reject it.
 */

export interface JsonError {
  message: string
  /** 1-based. */
  line: number
  column: number
  index: number
  /** The offending text, for pointing at it. */
  snippet: string
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r'])
const DIGITS = new Set('0123456789')

export function findJsonError(text: string): JsonError | null {
  let at = 0

  const fail = (message: string, index = at): JsonError => {
    const position = Math.min(index, text.length)
    const before = text.slice(0, position)
    const line = before.split('\n').length
    const column = position - before.lastIndexOf('\n')
    const lineText = text.split('\n')[line - 1] ?? ''
    return { message, line, column, index: position, snippet: lineText.trim().slice(0, 120) }
  }

  const skip = () => {
    while (at < text.length && WHITESPACE.has(text[at]!)) at++
  }

  const literal = (word: string): JsonError | null => {
    if (text.startsWith(word, at)) {
      at += word.length
      return null
    }
    return fail(`Expected ${word}`)
  }

  const string = (): JsonError | null => {
    // Where a key belongs, these two mistakes deserve their own words
    // rather than a generic complaint about a missing quote.
    if (text[at] === "'") return fail('JSON strings use double quotes, not single')
    if (text[at] === '/') return fail('JSON has no comments')
    if (text[at] !== '"') return fail('Expected a string in double quotes')
    at++
    while (at < text.length) {
      const char = text[at]!
      if (char === '"') {
        at++
        return null
      }
      if (char === '\\') {
        const escape = text[at + 1]
        if (escape === undefined) return fail('The string ends in the middle of an escape')
        if (!'"\\/bfnrtu'.includes(escape)) return fail(`\\${escape} is not a valid escape`, at)
        if (escape === 'u') {
          const digits = text.slice(at + 2, at + 6)
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) return fail('\\u needs four hex digits', at)
          at += 6
          continue
        }
        at += 2
        continue
      }
      // Control characters have to be escaped; a raw newline inside a string
      // is the single most common way a hand-edited file breaks.
      if (char < ' ') {
        return fail(char === '\n' ? 'A string cannot span lines — use \\n' : 'Unescaped control character in a string')
      }
      at++
    }
    return fail('The string is never closed')
  }

  const number = (): JsonError | null => {
    const start = at
    if (text[at] === '-') at++
    if (text[at] === '0') at++
    else if (DIGITS.has(text[at] ?? '')) while (DIGITS.has(text[at] ?? '')) at++
    else return fail('Expected a digit', start)

    if (text[at] === '.') {
      at++
      if (!DIGITS.has(text[at] ?? '')) return fail('Expected a digit after the decimal point')
      while (DIGITS.has(text[at] ?? '')) at++
    }
    if (text[at] === 'e' || text[at] === 'E') {
      at++
      if (text[at] === '+' || text[at] === '-') at++
      if (!DIGITS.has(text[at] ?? '')) return fail('Expected a digit in the exponent')
      while (DIGITS.has(text[at] ?? '')) at++
    }
    return null
  }

  const value = (depth: number): JsonError | null => {
    if (depth > 500) return fail('Nested too deeply')
    skip()
    const char = text[at]
    if (char === undefined) return fail('The document ends before a value')

    if (char === '{') {
      at++
      skip()
      if (text[at] === '}') {
        at++
        return null
      }
      for (;;) {
        skip()
        if (text[at] === '}') return fail('Trailing comma before }')
        const key = string()
        if (key) return key
        skip()
        if (text[at] !== ':') return fail('Expected : after the key')
        at++
        const nested = value(depth + 1)
        if (nested) return nested
        skip()
        if (text[at] === ',') {
          at++
          continue
        }
        if (text[at] === '}') {
          at++
          return null
        }
        return fail(text[at] === undefined ? 'The object is never closed' : 'Expected , or } after the value')
      }
    }

    if (char === '[') {
      at++
      skip()
      if (text[at] === ']') {
        at++
        return null
      }
      for (;;) {
        skip()
        if (text[at] === ']') return fail('Trailing comma before ]')
        const item = value(depth + 1)
        if (item) return item
        skip()
        if (text[at] === ',') {
          at++
          continue
        }
        if (text[at] === ']') {
          at++
          return null
        }
        return fail(text[at] === undefined ? 'The array is never closed' : 'Expected , or ] after the item')
      }
    }

    if (char === '"') return string()
    if (char === 't') return literal('true')
    if (char === 'f') return literal('false')
    if (char === 'n') return literal('null')
    if (char === '-' || DIGITS.has(char)) return number()
    if (char === "'") return fail('JSON strings use double quotes, not single')
    if (char === '/') return fail('JSON has no comments')
    return fail(`Unexpected ${JSON.stringify(char)}`)
  }

  if (!text.trim()) return { message: 'Nothing to check', line: 1, column: 1, index: 0, snippet: '' }

  const problem = value(0)
  if (problem) return problem
  skip()
  if (at < text.length) return fail('Extra content after the end of the document')
  return null
}
