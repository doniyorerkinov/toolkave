/**
 * The small, exact conversions behind the developer tools.
 *
 * Each one is a pure function over a string, which is what makes them worth
 * separating: the interesting part is never the UI, it is the edge case. A
 * case converter that mangles an acronym, a base converter that silently
 * truncates past 2^53, a JWT decoder that trusts a signature it never checked
 * — these are the things a test catches and a demo does not.
 */

/* ---------------------------------- case --------------------------------- */

export type CaseStyle = 'camel' | 'pascal' | 'snake' | 'kebab' | 'constant' | 'title' | 'sentence' | 'lower' | 'upper'

/**
 * Split an identifier into words, whatever convention it arrived in.
 *
 * The acronym rule is the whole difficulty: `parseHTMLDocument` is three words,
 * not two, and the boundary sits before the last capital of a run rather than
 * after the first. Written out because getting it wrong is invisible until
 * someone converts `getURLPath` and gets `get_u_r_l_path`.
 */
export function words(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}

export function toCase(input: string, style: CaseStyle): string {
  const parts = words(input)
  if (!parts.length) return ''
  const lower = parts.map(part => part.toLowerCase())
  const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

  switch (style) {
    case 'camel':
      return lower.map((word, i) => (i ? capitalise(word) : word)).join('')
    case 'pascal':
      return lower.map(capitalise).join('')
    case 'snake':
      return lower.join('_')
    case 'kebab':
      return lower.join('-')
    case 'constant':
      return lower.join('_').toUpperCase()
    case 'title':
      return lower.map(capitalise).join(' ')
    case 'sentence':
      return capitalise(lower.join(' '))
    case 'lower':
      return lower.join(' ')
    case 'upper':
      return lower.join(' ').toUpperCase()
  }
}

/* ---------------------------------- bases -------------------------------- */

export interface BaseResult {
  value: bigint
  binary: string
  octal: string
  decimal: string
  hex: string
}

/**
 * Bases through BigInt, not Number.
 *
 * `parseInt('9007199254740993', 10)` is already wrong, and a developer
 * converting a 64-bit id — a Telegram chat id, a Twitter snowflake — is
 * exactly who reaches for a base converter. Silent rounding would be worse
 * than refusing.
 */
export function convertBase(input: string, from: number): BaseResult | null {
  const cleaned = input.trim().replace(/^[+]/, '').replace(/[\s_]/g, '')
  if (!cleaned) return null

  const negative = cleaned.startsWith('-')
  const digits = (negative ? cleaned.slice(1) : cleaned).toLowerCase()
  if (!digits) return null

  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'.slice(0, from)
  let value = 0n
  for (const character of digits) {
    const digit = alphabet.indexOf(character)
    if (digit === -1) return null
    value = value * BigInt(from) + BigInt(digit)
  }
  if (negative) value = -value

  return {
    value,
    binary: value.toString(2),
    octal: value.toString(8),
    decimal: value.toString(10),
    hex: value.toString(16)
  }
}

/* ----------------------------------- URL --------------------------------- */

/**
 * `encodeURIComponent` escapes everything a query value needs escaping, and
 * leaves `!'()*` alone, which RFC 3986 says are reserved. Encoding them too
 * means a value survives every server that reads the spec strictly.
 */
export function encodeComponent(input: string): string {
  return encodeURIComponent(input).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

export function decodeComponent(input: string): { text: string; error: boolean } {
  try {
    // A lone `%` or a truncated escape throws; the caller needs to say so
    // rather than show the input unchanged and look like it did nothing.
    return { text: decodeURIComponent(input.replace(/\+/g, ' ')), error: false }
  } catch {
    return { text: input, error: true }
  }
}

/* ----------------------------------- JWT --------------------------------- */

export interface JwtParts {
  header: unknown
  payload: unknown
  signature: string
  /** Claims worth reading back in words rather than as epoch seconds. */
  issuedAt: Date | null
  expiresAt: Date | null
  notBefore: Date | null
  expired: boolean | null
}

/** base64url, which is base64 with two characters swapped and no padding. */
function fromBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
  const full = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  const binary = atob(full)
  // The payload is UTF-8; atob gives bytes, so a name with a non-ASCII
  // character comes out mangled unless it is decoded properly.
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const asDate = (value: unknown): Date | null =>
  typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000) : null

/**
 * Decode a JWT. Decode, not verify.
 *
 * Verifying needs the signing key, which is on a server and must never be in
 * a browser. Anything claiming to "validate" a token in a web page is either
 * lying or asking for your secret. The tool says so on the page: this shows
 * what the token contains, and the contents are not evidence of anything.
 */
export function decodeJwt(token: string): JwtParts | null {
  const segments = token.trim().split('.')
  if (segments.length !== 3) return null

  try {
    const header = JSON.parse(fromBase64Url(segments[0]!))
    const payload = JSON.parse(fromBase64Url(segments[1]!)) as Record<string, unknown>
    const expiresAt = asDate(payload.exp)
    return {
      header,
      payload,
      signature: segments[2]!,
      issuedAt: asDate(payload.iat),
      expiresAt,
      notBefore: asDate(payload.nbf),
      expired: expiresAt ? expiresAt.getTime() < Date.now() : null
    }
  } catch {
    return null
  }
}

/* ---------------------------------- epoch -------------------------------- */

export interface EpochReading {
  date: Date
  /** Which unit the number was read as, since both are common and ambiguous. */
  unit: 'seconds' | 'milliseconds'
}

/**
 * A bare number is ambiguous: 1758000000 is September 2026 in seconds and
 * three weeks after 1970 in milliseconds. Ten digits or fewer is read as
 * seconds, which is right for every timestamp between 1973 and 5138.
 */
export function readEpoch(input: string): EpochReading | null {
  const cleaned = input.trim().replace(/[\s_,]/g, '')
  if (!/^-?\d+$/.test(cleaned)) return null

  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null

  const unit = cleaned.replace('-', '').length > 10 ? 'milliseconds' : 'seconds'
  const date = new Date(unit === 'seconds' ? value * 1000 : value)
  return Number.isNaN(date.getTime()) ? null : { date, unit }
}

/* ---------------------------------- cron --------------------------------- */

const FIELD_NAMES = ['minute', 'hour', 'day of the month', 'month', 'day of the week'] as const

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const RANGES: Record<(typeof FIELD_NAMES)[number], [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  'day of the month': [1, 31],
  month: [1, 12],
  'day of the week': [0, 7]
}

/**
 * Check one cron field and say what it means.
 *
 * Deliberately strict about ranges, because the failure a cron expression
 * actually produces is not a syntax error: it is a job that quietly never
 * runs. `0 25 * * *` is accepted by some parsers and fires never.
 */
function readField(field: string, name: (typeof FIELD_NAMES)[number]): { ok: boolean; text: string } {
  const [min, max] = RANGES[name]
  const parts = field.split(',')

  for (const part of parts) {
    const [range, step] = part.split('/')
    if (step !== undefined && !/^\d+$/.test(step)) return { ok: false, text: `${name}: "${part}" is not a step` }
    if (range === '*' || range === '?') continue
    const bounds = range!.split('-')
    for (const bound of bounds) {
      if (!/^\d+$/.test(bound)) return { ok: false, text: `${name}: "${bound}" is not a number` }
      const value = Number(bound)
      if (value < min || value > max) return { ok: false, text: `${name}: ${value} is outside ${min}-${max}` }
    }
  }
  return { ok: true, text: '' }
}

export interface CronReading {
  ok: boolean
  /** One sentence, in plain words. */
  description: string
  fields: { name: string; value: string }[]
}

export function readCron(expression: string): CronReading {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) {
    return {
      ok: false,
      description: `A cron line has five fields; this one has ${fields.length}.`,
      fields: []
    }
  }

  for (let i = 0; i < 5; i++) {
    const check = readField(fields[i]!, FIELD_NAMES[i]!)
    if (!check.ok) return { ok: false, description: check.text, fields: [] }
  }

  const [minute, hour, dom, month, dow] = fields as [string, string, string, string, string]

  const every = (field: string, unit: string) => {
    if (field === '*') return `every ${unit}`
    if (field.startsWith('*/')) return `every ${field.slice(2)} ${unit}s`
    if (field.includes(',')) return `${unit}s ${field.split(',').join(', ')}`
    if (field.includes('-')) return `${unit}s ${field.replace('-', ' through ')}`
    return `${unit} ${field}`
  }

  const time =
    minute !== '*' && hour !== '*' && !/[*,/-]/.test(minute) && !/[*,/-]/.test(hour)
      ? `at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
      : `${every(minute, 'minute')}, ${every(hour, 'hour')}`

  const day =
    dow !== '*'
      ? /^\d$/.test(dow)
        ? `on ${DAYS[Number(dow) % 7]}`
        : `on ${every(dow, 'weekday')}`
      : dom !== '*'
        ? `on ${every(dom, 'day')} of the month`
        : 'every day'

  const when = month !== '*' ? (/^\d+$/.test(month) ? ` in ${MONTHS[Number(month) - 1]}` : ` in ${every(month, 'month')}`) : ''

  return {
    ok: true,
    description: `Runs ${time}, ${day}${when}.`,
    fields: FIELD_NAMES.map((name, i) => ({ name, value: fields[i]! }))
  }
}
