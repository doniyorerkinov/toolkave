/**
 * Repairing text that was decoded with the wrong character set.
 *
 * The problem this solves is everywhere in the Russian- and Uzbek-speaking web:
 * a file was written in windows-1251, KOI8-R or CP866 and then read as
 * something else, so "Привет" arrives as "ÐŸÑ€Ð¸Ð²ÐµÑ‚", "Ïðèâåò" or a wall of
 * box-drawing characters.
 *
 * The model is always the same. What you see is
 *
 *     seen = decodeAs(WRONG, bytesOf(original, RIGHT))
 *
 * so the repair is to run it backwards:
 *
 *     original = decodeAs(RIGHT, bytesOf(seen, WRONG))
 *
 * We do not know WRONG or RIGHT, so every plausible pair is tried and the
 * results are scored. Nothing here is specific to a browser — `nuxt build`
 * and the test scripts run it under Node.
 */

/** Single-byte character sets worth considering, by WHATWG label. */
export const SINGLE_BYTE_ENCODINGS = [
  'windows-1251',
  'windows-1252',
  'koi8-r',
  'koi8-u',
  'ibm866',
  'iso-8859-5',
  'x-mac-cyrillic',
  'windows-1254'
] as const

export type SingleByteEncoding = (typeof SINGLE_BYTE_ENCODINGS)[number]

/**
 * Encodings a file's bytes might genuinely be in. `latin1` is listed
 * separately from `windows-1252` on purpose: the Encoding Standard makes
 * "iso-8859-1" an alias of windows-1252, but real Latin-1 maps 0x80–0x9F to
 * control characters, and that difference is exactly where mojibake lives.
 */
export const DECODE_CANDIDATES = ['utf-8', ...SINGLE_BYTE_ENCODINGS, 'latin1'] as const

/** Encodings the text may have been *misread* as. */
export const MISREAD_CANDIDATES = [
  'windows-1252',
  'latin1',
  'windows-1251',
  'koi8-r',
  'ibm866',
  'x-mac-cyrillic',
  'windows-1254'
] as const

/* ------------------------------------------------------------------ */
/* Byte-level codecs                                                    */
/* ------------------------------------------------------------------ */

/**
 * Reverse lookup tables are derived from the platform's own decoder rather
 * than hard-coded, so an encode is always the exact inverse of the matching
 * decode and there is no 2000-line table to get wrong.
 */
const reverseTables = new Map<string, Map<number, number>>()

const ALL_BYTES = (() => {
  const bytes = new Uint8Array(256)
  for (let i = 0; i < 256; i++) bytes[i] = i
  return bytes
})()

/** True Latin-1: byte value is the code point, all 256 defined. */
function latin1Decode(bytes: Uint8Array): string {
  let out = ''
  // Chunked so a large file cannot blow the argument limit of String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return out
}

export function decodeBytes(bytes: Uint8Array, label: string): string | null {
  if (label === 'latin1') return latin1Decode(bytes)
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    // The runtime does not know this encoding. Callers drop the candidate.
    return null
  }
}

/** Strict UTF-8: returns null instead of substituting U+FFFD. */
export function decodeUtf8Strict(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function reverseTable(label: string): Map<number, number> | null {
  const cached = reverseTables.get(label)
  if (cached) return cached

  const decoded = decodeBytes(ALL_BYTES, label)
  if (decoded === null || decoded.length !== 256) return null

  const table = new Map<number, number>()
  for (let byte = 0; byte < 256; byte++) {
    const cp = decoded.charCodeAt(byte)
    // A byte the decoder could not map. Nothing should encode back to it.
    if (cp === 0xfffd) continue
    // First byte wins, so an ambiguous mapping stays deterministic.
    if (!table.has(cp)) table.set(cp, byte)
  }
  reverseTables.set(label, table)
  return table
}

/**
 * Encode text back to bytes under a single-byte character set.
 * Returns null if any character has no representation — which is the natural
 * way a wrong guess eliminates itself.
 */
export function encodeToBytes(text: string, label: string): Uint8Array | null {
  if (label === 'utf-8') return new TextEncoder().encode(text)

  const table = reverseTable(label)
  if (!table) return null

  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const byte = table.get(text.charCodeAt(i))
    if (byte === undefined) return null
    out[i] = byte
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Scoring                                                              */
/* ------------------------------------------------------------------ */

/**
 * How much a character looks like real prose in the languages this site
 * serves. Positive is plausible, negative is a symptom of a wrong decode.
 *
 * Cyrillic scores marginally above ASCII so that a genuine repair wins
 * against text that merely stayed readable, and the replacement character
 * and C0/C1 controls carry enough weight that one of them sinks a candidate.
 */
function charWeight(cp: number): number {
  // Replacement character: proof the decode already failed.
  if (cp === 0xfffd) return -8

  // Tab, newline, carriage return.
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d) return 1
  // Other C0 controls do not belong in text.
  if (cp < 0x20) return -6
  // ASCII printable.
  if (cp <= 0x7e) return 1
  if (cp === 0x7f) return -6
  // C1 controls: the classic tell of Latin-1 mojibake.
  if (cp <= 0x9f) return -4

  // Cyrillic proper.
  if (cp >= 0x0410 && cp <= 0x044f) return 1.2 // А–я
  if (cp === 0x0401 || cp === 0x0451) return 1.2 // Ё ё
  if (cp >= 0x0400 && cp <= 0x045f) return 1.1 // Ukrainian, Belarusian, Serbian
  if (cp >= 0x0460 && cp <= 0x04ff) return 0.2 // historic and minority letters

  // Uzbek Latin needs the modifier letters in oʻ and gʻ.
  if (cp === 0x02bb || cp === 0x02bc) return 1.2

  switch (cp) {
    case 0x00a0: return 0.5 // no-break space
    case 0x00ab: case 0x00bb: return 1 // « »
    case 0x00b0: return 0.6 // degree
    case 0x2116: return 1 // №
    case 0x20bd: case 0x20ac: case 0x00a3: return 0.8 // ₽ € £
    default: break
  }

  // Typographic punctuation.
  if (cp >= 0x2010 && cp <= 0x2015) return 1 // dashes
  if (cp >= 0x2018 && cp <= 0x201f) return 1 // quotes
  if (cp === 0x2026 || cp === 0x2022) return 1 // … •

  // Accented Latin. Legitimate in European text, but in ru/uz/en input it is
  // usually the residue of a bad decode, so it is mildly discouraged.
  if (cp >= 0x00c0 && cp <= 0x00ff) return -0.2
  // The rest of Latin-1 punctuation block: ¡¢¤¦§¨©¬­®¯±²³µ¶·¸¹¼½¾¿
  if (cp >= 0x00a1 && cp <= 0x00bf) return -0.9

  // Box drawing and block elements: what CP866 turns into when misread.
  if (cp >= 0x2500 && cp <= 0x259f) return -3
  // Private use.
  if (cp >= 0xe000 && cp <= 0xf8ff) return -4

  // Latin Extended-A/B: wrong Central-European code page.
  if (cp >= 0x0100 && cp <= 0x024f) return -0.6

  // CJK, Arabic, Hebrew, Greek and so on. Real text, just not what we expect,
  // so neutral rather than penalised.
  return 0
}

/** Mean per-character plausibility. Empty text scores 0. */
export function scoreText(text: string): number {
  if (!text.length) return 0
  let total = 0
  for (let i = 0; i < text.length; i++) total += charWeight(text.charCodeAt(i))
  return total / text.length
}

/* ------------------------------------------------------------------ */
/* Structural defects                                                   */
/* ------------------------------------------------------------------ */

/**
 * Per-character plausibility alone is not enough, and the case that breaks it
 * matters: UTF-8 Cyrillic read as windows-1251 turns "Привет" into
 * "РџСЂРёРІРµС‚", which is *also* made of Cyrillic letters and scores just as
 * well. What separates them is structure — capitals in the middle of words,
 * symbols wedged between letters, one letter repeating far too often.
 *
 * Defects are counted absolutely rather than averaged, because damage is
 * often confined to a few characters in an otherwise clean line ("oʻzbek"
 * becoming "oÊ»zbek"). A mean would dilute that to nothing.
 */

function isLatinLetter(cp: number): boolean {
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return true
  // Latin-1 letters, minus the × and ÷ sitting inside the range.
  if (cp >= 0xc0 && cp <= 0xff) return cp !== 0xd7 && cp !== 0xf7
  if (cp >= 0x100 && cp <= 0x24f) return true
  return false
}

function isCyrillicLetter(cp: number): boolean {
  if (cp >= 0x400 && cp <= 0x481) return true
  if (cp >= 0x48a && cp <= 0x4ff) return true
  return false
}

function isLetter(cp: number): boolean {
  return isLatinLetter(cp) || isCyrillicLetter(cp)
}

function isUpperLetter(cp: number): boolean {
  if (cp >= 0x41 && cp <= 0x5a) return true
  if (cp >= 0xc0 && cp <= 0xde && cp !== 0xd7) return true
  if (cp >= 0x400 && cp <= 0x42f) return true // Ѐ–Я
  if (cp >= 0x460 && cp <= 0x481) return cp % 2 === 0
  return false
}

function isLowerLetter(cp: number): boolean {
  return isLetter(cp) && !isUpperLetter(cp)
}

/**
 * Characters that legitimately appear inside a word: apostrophes, hyphens,
 * and the modifier letters Uzbek needs for oʻ and gʻ.
 */
function allowedInsideWord(cp: number): boolean {
  return (
    cp === 0x27 || cp === 0x2d || cp === 0x60 ||
    cp === 0x2010 || cp === 0x2011 || cp === 0x2013 || cp === 0x2014 ||
    cp === 0x2018 || cp === 0x2019 ||
    cp === 0x02bb || cp === 0x02bc ||
    (cp >= 0x30 && cp <= 0x39)
  )
}

export interface TextQuality {
  /** Mean per-character plausibility. */
  plausibility: number
  /** Absolute count of structural defects in the assessed text. */
  defects: number
  /**
   * Defects per character. Comparisons use the rate, not the count: undoing a
   * UTF-8 misreading halves the length, so counts from different candidates
   * are not measuring the same thing.
   */
  defectRate: number
  /** Single value used for ranking candidates against each other. */
  rank: number
}

export function assessText(text: string): TextQuality {
  const plausibility = scoreText(text)
  if (!text.length) return { plausibility: 0, defects: 0, defectRate: 0, rank: 0 }

  let defects = 0
  const letterCounts = new Map<number, number>()
  let letters = 0

  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i)
    const prev = i > 0 ? text.charCodeAt(i - 1) : -1
    const next = i + 1 < text.length ? text.charCodeAt(i + 1) : -1

    if (cp === 0xfffd) defects++
    else if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) defects++
    else if (cp >= 0x7f && cp <= 0x9f) defects++

    if (isLetter(cp)) {
      letters++
      // Case-insensitive tally: "Р" and "р" are the same evidence of a
      // lead byte showing through, and acronyms should not skew it.
      const key = cp >= 0x430 && cp <= 0x44f ? cp - 0x20 : cp >= 0x61 && cp <= 0x7a ? cp - 0x20 : cp
      letterCounts.set(key, (letterCounts.get(key) ?? 0) + 1)

      // A capital immediately after a lower-case letter. Real prose does not
      // do this; every UTF-8-through-a-single-byte-codepage artefact does.
      if (isUpperLetter(cp) && prev >= 0 && isLowerLetter(prev)) defects++

      // Latin and Cyrillic inside one word.
      if (prev >= 0 && isLetter(prev) && isLatinLetter(cp) !== isLatinLetter(prev)) defects++
    } else if (
      cp >= 0xa0 &&
      !allowedInsideWord(cp) &&
      prev >= 0 && isLetter(prev) &&
      next >= 0 && isLetter(next)
    ) {
      // A non-ASCII symbol wedged between two letters — µ, », ‚, ° and friends.
      defects++
    }
  }

  // One letter dominating the text. In Russian the most frequent letter is
  // about 11% of all letters; UTF-8 lead bytes showing through as Р or С push
  // a single letter past a third.
  if (letters >= 20) {
    let top = 0
    for (const count of letterCounts.values()) top = Math.max(top, count)
    const share = top / letters
    if (share > 0.22) defects += Math.round((share - 0.22) * letters)
  }

  const defectRate = defects / text.length
  return { plausibility, defects, defectRate, rank: plausibility - 3 * defectRate }
}

/**
 * Long inputs are scored on a sample. Mojibake is uniform across a file, so
 * a few thousand characters decide it just as well as a few million, and the
 * paste box has to stay responsive while someone types.
 */
const SCORE_SAMPLE = 4000

/**
 * Three slices rather than the first N characters: a document often opens with
 * a Latin header or a run of numbers that says nothing about the body.
 */
function sliceSample(text: string, per: number): string {
  if (text.length <= per * 3) return text
  const step = Math.floor(text.length / 3)
  return (
    text.slice(0, per) + text.slice(step, step + per) + text.slice(step * 2, step * 2 + per)
  )
}

function sample(text: string): string {
  return sliceSample(text, SCORE_SAMPLE)
}

/**
 * The search evaluates a few thousand candidates, so it works on a much
 * smaller excerpt than scoring does. Mojibake is uniform across a document —
 * 1200 characters identify it as well as a megabyte.
 */
function searchProbe(text: string): string {
  return sliceSample(text, 400)
}

function assessSampled(text: string): TextQuality {
  return assessText(sample(text))
}

function scoreSampled(text: string): number {
  return assessSampled(text).rank
}

/* ------------------------------------------------------------------ */
/* Repairing pasted text                                                */
/* ------------------------------------------------------------------ */

export interface RepairCandidate {
  /** What the bytes actually were. */
  actual: string
  /** What they had been read as, when the fix is a round trip. */
  misread?: string
  text: string
  score: number
  quality: TextQuality
}

export interface RepairResult {
  /** Best guess, or the input unchanged when nothing beats it. */
  text: string
  /** False when the input already looked like ordinary text. */
  changed: boolean
  best: RepairCandidate | null
  /** Alternatives, best first, so the user can override a wrong guess. */
  candidates: RepairCandidate[]
  originalScore: number
}

/**
 * A candidate has to be clearly better, not merely different. Without a
 * margin, text that is already correct gets "repaired" into nonsense that
 * happens to score a hair higher.
 */
const IMPROVEMENT_MARGIN = 0.15

/** How far plausibility may drop when a candidate removes structural defects. */
const PLAUSIBILITY_TOLERANCE = 0.25

/**
 * Two independent grounds for accepting a repair:
 *
 * 1. It removes structural damage — capitals inside words, symbols between
 *    letters — without making the text materially less plausible. This is
 *    what catches damage confined to a handful of characters.
 * 2. It is simply far more plausible, which is the obvious case where the
 *    input is a wall of accented Latin or replacement characters.
 */
function isImprovement(candidate: TextQuality, current: TextQuality): boolean {
  if (
    candidate.defectRate < current.defectRate &&
    candidate.plausibility >= current.plausibility - PLAUSIBILITY_TOLERANCE
  ) {
    return true
  }
  return candidate.plausibility > current.plausibility + IMPROVEMENT_MARGIN
}

/** One reversal: bytes that were really `actual` had been read as `misread`. */
export interface RepairStep {
  misread: string
  actual: string
}

/** Undo one misreading. Null when the text cannot have come through it. */
function applyStep(text: string, step: RepairStep): string | null {
  const bytes = encodeToBytes(text, step.misread)
  // The text contains characters this encoding cannot represent, so it was
  // never read through it.
  if (!bytes) return null
  // A strict decode for UTF-8: if the bytes are not valid UTF-8 then this pair
  // is simply wrong, and scoring a string full of U+FFFD wastes time.
  return step.actual === 'utf-8' ? decodeUtf8Strict(bytes) : decodeBytes(bytes, step.actual)
}

function applyChain(text: string, steps: RepairStep[]): string | null {
  let current = text
  for (const step of steps) {
    const next = applyStep(current, step)
    if (next === null) return null
    current = next
  }
  return current
}

interface Reversal {
  step: RepairStep
  text: string
  quality: TextQuality
}

/** Every one-step round trip that produces different, decodable text. */
function roundTrips(text: string): Reversal[] {
  const out: Reversal[] = []

  for (const misread of MISREAD_CANDIDATES) {
    for (const actual of DECODE_CANDIDATES) {
      if (actual === misread) continue
      const step = { misread, actual }
      const decoded = applyStep(text, step)
      if (decoded === null || decoded === text) continue
      out.push({ step, text: decoded, quality: assessText(decoded) })
    }
  }

  return out
}

/**
 * Repair text that has already been decoded into a string — the paste box case.
 *
 * Doubly-mangled text (a file mis-decoded, saved, and mis-decoded again) is
 * common enough to be worth the extra passes, so the search repeats on the
 * winner while each pass keeps improving things.
 */
/** Fewest defects wins; plausibility settles ties. */
function betterFinal(a: TextQuality, b: TextQuality): boolean {
  if (a.defectRate !== b.defectRate) return a.defectRate < b.defectRate
  return a.plausibility > b.plausibility
}

interface SearchNode {
  text: string
  quality: TextQuality
  steps: RepairStep[]
}

/** How many branches survive each level of the search. */
const BEAM_BY_RANK = 8
const BEAM_BY_DEFECTS = 8
const BEAM_TOTAL = 24

/**
 * Keep a level's most promising nodes.
 *
 * Three selections, unioned, because no single measure is trustworthy in the
 * middle of a chain:
 *
 * - the most plausible-looking results,
 * - the structurally cleanest results, and
 * - every node reached by a successful strict UTF-8 decode. Arbitrary bytes
 *   essentially never decode as valid UTF-8 by accident, so that alone is
 *   strong evidence, even when the text it produces looks terrible.
 */
function prune(nodes: SearchNode[]): SearchNode[] {
  const byRank = [...nodes].sort((a, b) => b.quality.rank - a.quality.rank).slice(0, BEAM_BY_RANK)
  const byDefects = [...nodes]
    .sort((a, b) => a.quality.defectRate - b.quality.defectRate)
    .slice(0, BEAM_BY_DEFECTS)
  const viaUtf8 = nodes.filter(node => node.steps[node.steps.length - 1]!.actual === 'utf-8')

  const kept: SearchNode[] = []
  const seen = new Set<string>()
  for (const node of [...viaUtf8, ...byRank, ...byDefects]) {
    if (seen.has(node.text)) continue
    seen.add(node.text)
    kept.push(node)
    if (kept.length >= BEAM_TOTAL) break
  }
  return kept
}

/**
 * Search for the chain of reversals that best explains the damage.
 *
 * Deliberately not a hill climb. Text that was mangled twice has a first step
 * which looks *worse* than where it started by every local measure — a page of
 * accented Latin — while a wrong first step produces real Cyrillic letters and
 * scores beautifully. Requiring each step to be an improvement therefore walks
 * straight past the answer, so the search explores without a gate and applies
 * the acceptance test only to the final result.
 */
function searchChain(probe: string, maxDepth: number): SearchNode | null {
  const start: SearchNode = { text: probe, quality: assessText(probe), steps: [] }
  let frontier: SearchNode[] = [start]
  let best: SearchNode | null = null
  const visited = new Set<string>([probe])

  for (let depth = 0; depth < maxDepth; depth++) {
    const produced: SearchNode[] = []

    for (const node of frontier) {
      for (const reversal of roundTrips(node.text)) {
        // Encodings overlap heavily — latin1 and windows-1252 agree on most
        // bytes — so the same text turns up along many paths.
        if (visited.has(reversal.text)) continue
        visited.add(reversal.text)
        produced.push({
          text: reversal.text,
          quality: reversal.quality,
          steps: [...node.steps, reversal.step]
        })
      }
    }

    if (!produced.length) break

    for (const node of produced) {
      if (!best || betterFinal(node.quality, best.quality)) best = node
    }
    frontier = prune(produced)
  }

  // Nothing is rewritten unless the end result is genuinely better than what
  // arrived. This is the only place the acceptance test is applied.
  if (!best || !isImprovement(best.quality, start.quality)) return null
  return best
}

function describeChain(steps: RepairStep[]): { actual: string; misread?: string } {
  const first = steps[0]!
  if (steps.length === 1) return { actual: first.actual, misread: first.misread }
  // Report the whole chain when more than one pass was needed, otherwise the
  // label claims a single conversion that would not reproduce the result.
  return { actual: steps.map(s => `${s.actual} read as ${s.misread}`).join(', then ') }
}

export function repairText(input: string, maxPasses = 3): RepairResult {
  const originalQuality = assessSampled(input)
  const originalScore = originalQuality.rank

  // The search runs on an excerpt and the winning chain is then replayed over
  // the whole input, so the paste box stays responsive on large documents.
  const probe = searchProbe(input)

  // Alternatives for the user to override a wrong guess with, materialised
  // against the full text rather than the sample.
  const alternatives: RepairCandidate[] = []
  for (const reversal of roundTrips(probe).sort(
    (a, b) => b.quality.rank - a.quality.rank || a.quality.defects - b.quality.defects
  )) {
    if (alternatives.length >= 6) break
    const text = probe === input ? reversal.text : applyStep(input, reversal.step)
    if (text === null) continue
    alternatives.push({
      actual: reversal.step.actual,
      misread: reversal.step.misread,
      text,
      score: reversal.quality.rank,
      quality: reversal.quality
    })
  }

  const found = probe.length ? searchChain(probe, maxPasses) : null
  const repaired = found ? applyChain(input, found.steps) : null

  if (!found || repaired === null || repaired === input) {
    return { text: input, changed: false, best: null, candidates: alternatives, originalScore }
  }

  return {
    text: repaired,
    changed: true,
    best: { ...describeChain(found.steps), text: repaired, score: found.quality.rank, quality: found.quality },
    candidates: alternatives,
    originalScore
  }
}

/* ------------------------------------------------------------------ */
/* Detecting the encoding of a file                                     */
/* ------------------------------------------------------------------ */

export interface DetectedEncoding {
  label: string
  text: string
  score: number
  defects: number
  /** Set when the bytes carried a byte-order mark, which settles it outright. */
  fromBom?: boolean
}

export interface DetectResult {
  best: DetectedEncoding
  candidates: DetectedEncoding[]
}

function described(label: string, text: string, fromBom?: boolean): DetectedEncoding {
  const quality = assessSampled(text)
  return { label, text, score: quality.rank, defects: quality.defects, fromBom }
}

function readBom(bytes: Uint8Array): DetectedEncoding | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const text = decodeBytes(bytes.subarray(3), 'utf-8')
    if (text !== null) return described('utf-8', text, true)
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const text = decodeBytes(bytes.subarray(2), 'utf-16le')
    if (text !== null) return described('utf-16le', text, true)
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const text = decodeBytes(bytes.subarray(2), 'utf-16be')
    if (text !== null) return described('utf-16be', text, true)
  }
  return null
}

/**
 * Work out which character set a file's raw bytes are in.
 *
 * This is the lossless half of the tool. When the actual bytes are available
 * there is no round trip to invert: each candidate simply decodes them, and
 * the most plausible reading wins.
 */
export function detectEncoding(bytes: Uint8Array): DetectResult {
  const bom = readBom(bytes)
  if (bom) return { best: bom, candidates: [bom] }

  const candidates: DetectedEncoding[] = []

  // Valid UTF-8 is treated as a real answer rather than one guess among many:
  // arbitrary bytes almost never decode cleanly as UTF-8 by accident, so the
  // bonus breaks ties in its favour on short or ambiguous input.
  const utf8 = decodeUtf8Strict(bytes)
  if (utf8 !== null) {
    const entry = described('utf-8', utf8)
    candidates.push({ ...entry, score: entry.score + 0.25 })
  }

  for (const label of [...SINGLE_BYTE_ENCODINGS, 'latin1']) {
    const text = decodeBytes(bytes, label)
    if (text === null) continue
    candidates.push(described(label, text))
  }

  candidates.sort((a, b) => b.score - a.score || a.defects - b.defects)

  // Fall back to a lossy UTF-8 read rather than throwing, so a file of pure
  // binary still produces something the page can show.
  const fallback: DetectedEncoding = {
    label: 'utf-8',
    text: decodeBytes(bytes, 'utf-8') ?? '',
    score: 0,
    defects: 0
  }

  return { best: candidates[0] ?? fallback, candidates: candidates.slice(0, 6) }
}

/**
 * Full file repair: decode the bytes, then check whether the result is itself
 * mojibake. A file can be valid UTF-8 and still be wrong — that is exactly
 * what happens when someone opens a windows-1251 file in the wrong editor and
 * saves it back out.
 */
export function repairFile(bytes: Uint8Array): {
  text: string
  detected: string
  repaired: boolean
  candidates: DetectedEncoding[]
} {
  const { best, candidates } = detectEncoding(bytes)
  const repair = repairText(best.text)

  return {
    text: repair.changed ? repair.text : best.text,
    detected: best.label,
    repaired: repair.changed,
    candidates
  }
}

/** Human-readable name for an encoding label. */
export function encodingName(label: string): string {
  const names: Record<string, string> = {
    'utf-8': 'UTF-8',
    'utf-16le': 'UTF-16 LE',
    'utf-16be': 'UTF-16 BE',
    'windows-1251': 'Windows-1251 (Cyrillic)',
    'windows-1252': 'Windows-1252 (Western)',
    'windows-1254': 'Windows-1254 (Turkish)',
    'koi8-r': 'KOI8-R',
    'koi8-u': 'KOI8-U',
    ibm866: 'CP866 (DOS Cyrillic)',
    'iso-8859-5': 'ISO 8859-5',
    'x-mac-cyrillic': 'Mac Cyrillic',
    latin1: 'ISO 8859-1 (Latin-1)'
  }
  return names[label] ?? label
}
