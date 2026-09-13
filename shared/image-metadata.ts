/**
 * Reading and removing the notes a camera hides inside a picture.
 *
 * A photo carries far more than pixels: where it was taken to within a few
 * metres, which phone took it, that phone's serial number, and the exact
 * second. Every social network strips this on upload, which is precisely why
 * people never learn it is there — until they send the original by email.
 *
 * Removal here is byte surgery on the container, never a re-encode: the
 * compressed image data is copied through untouched, so the result is
 * pixel-for-pixel the original minus its notes. Anything that affects how
 * the picture *looks* — colour profiles, transparency, animation — is kept.
 */

export interface GpsPosition {
  latitude: number
  longitude: number
  /** Metres above sea level, when the camera recorded it. */
  altitude?: number
}

export interface Metadata {
  gps?: GpsPosition
  make?: string
  model?: string
  lens?: string
  serial?: string
  lensSerial?: string
  software?: string
  artist?: string
  copyright?: string
  /** As written in the file: "2024:06:11 18:42:07". */
  taken?: string
  /** Bytes that removal would take out. */
  bytes: number
  /** True when the format is one we can strip. */
  supported: boolean
}

type Container = 'jpeg' | 'png' | 'webp' | null

function container(data: Uint8Array): Container {
  if (data[0] === 0xff && data[1] === 0xd8) return 'jpeg'
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'png'
  if (
    data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
    data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50
  ) return 'webp'
  return null
}

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 }

/** A TIFF block: the header says which way round the numbers are. */
class Tiff {
  view: DataView
  little: boolean

  constructor(view: DataView) {
    this.view = view
    this.little = view.getUint16(0, false) === 0x4949
  }

  short(offset: number) {
    return this.view.getUint16(offset, this.little)
  }
  long(offset: number) {
    return this.view.getUint32(offset, this.little)
  }
  rational(offset: number) {
    const denominator = this.long(offset + 4)
    return denominator === 0 ? 0 : this.long(offset) / denominator
  }
  signedRational(offset: number) {
    const denominator = this.view.getInt32(offset + 4, this.little)
    return denominator === 0 ? 0 : this.view.getInt32(offset, this.little) / denominator
  }
}

interface Entry {
  type: number
  count: number
  /** Where the value lives — inline bytes are copied to their own offset. */
  offset: number
}

function readIfd(tiff: Tiff, start: number): Map<number, Entry> {
  const entries = new Map<number, Entry>()
  if (start + 2 > tiff.view.byteLength) return entries
  const count = tiff.short(start)
  for (let i = 0; i < count; i++) {
    const at = start + 2 + i * 12
    if (at + 12 > tiff.view.byteLength) break
    const tag = tiff.short(at)
    const type = tiff.short(at + 2)
    const length = tiff.long(at + 4)
    const size = (TYPE_SIZE[type] ?? 0) * length
    const offset = size > 4 ? tiff.long(at + 8) : at + 8
    if (size && offset + size <= tiff.view.byteLength) entries.set(tag, { type, count: length, offset })
  }
  return entries
}

function ascii(tiff: Tiff, entry: Entry | undefined): string | undefined {
  if (!entry || entry.type !== 2) return undefined
  let out = ''
  for (let i = 0; i < entry.count; i++) {
    const code = tiff.view.getUint8(entry.offset + i)
    if (!code) break
    out += String.fromCharCode(code)
  }
  out = out.trim()
  return out || undefined
}

/** Degrees, minutes and seconds as three rationals, plus N/S/E/W. */
function coordinate(tiff: Tiff, value: Entry | undefined, ref: Entry | undefined): number | undefined {
  if (!value || value.type !== 5 || value.count < 3) return undefined
  const degrees = tiff.rational(value.offset)
  const minutes = tiff.rational(value.offset + 8)
  const seconds = tiff.rational(value.offset + 16)
  let result = degrees + minutes / 60 + seconds / 3600
  const direction = ascii(tiff, ref)
  if (direction === 'S' || direction === 'W') result = -result
  return Number.isFinite(result) ? result : undefined
}

/** Pull the human-readable fields out of a TIFF block. */
function readExif(block: Uint8Array, into: Metadata) {
  if (block.byteLength < 8) return
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength)
  const order = view.getUint16(0, false)
  if (order !== 0x4949 && order !== 0x4d4d) return
  const tiff = new Tiff(view)
  if (tiff.short(2) !== 42) return

  const zero = readIfd(tiff, tiff.long(4))
  into.make = ascii(tiff, zero.get(0x010f))
  into.model = ascii(tiff, zero.get(0x0110))
  into.software = ascii(tiff, zero.get(0x0131))
  into.artist = ascii(tiff, zero.get(0x013b))
  into.copyright = ascii(tiff, zero.get(0x8298))

  const exifPointer = zero.get(0x8769)
  if (exifPointer) {
    const exif = readIfd(tiff, tiff.long(exifPointer.offset))
    into.taken = ascii(tiff, exif.get(0x9003)) ?? ascii(tiff, zero.get(0x0132))
    into.lens = ascii(tiff, exif.get(0xa434))
    into.serial = ascii(tiff, exif.get(0xa431))
    into.lensSerial = ascii(tiff, exif.get(0xa435))
  } else {
    into.taken = ascii(tiff, zero.get(0x0132))
  }

  const gpsPointer = zero.get(0x8825)
  if (!gpsPointer) return
  const gps = readIfd(tiff, tiff.long(gpsPointer.offset))
  const latitude = coordinate(tiff, gps.get(0x0002), gps.get(0x0001))
  const longitude = coordinate(tiff, gps.get(0x0004), gps.get(0x0003))
  if (latitude === undefined || longitude === undefined) return
  if (!latitude && !longitude) return

  const position: GpsPosition = { latitude, longitude }
  const altitude = gps.get(0x0006)
  if (altitude && altitude.type === 5) {
    const metres = tiff.rational(altitude.offset)
    const below = gps.get(0x0005)
    const sign = below && tiff.view.getUint8(below.offset) === 1 ? -1 : 1
    if (Number.isFinite(metres)) position.altitude = Math.round(metres * sign)
  }
  into.gps = position
}

/** A half-open byte range that removal would delete. */
type Range = [start: number, end: number]

interface Scan {
  meta: Metadata
  drop: Range[]
  /** Set when the container needs fixing up after bytes are removed. */
  container: Container
}

const EXIF_PREFIX = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]

function startsWith(data: Uint8Array, at: number, bytes: number[] | string): boolean {
  const codes = typeof bytes === 'string' ? [...bytes].map(c => c.charCodeAt(0)) : bytes
  for (let i = 0; i < codes.length; i++) if (data[at + i] !== codes[i]) return false
  return true
}

function fourCC(data: Uint8Array, at: number): string {
  return String.fromCharCode(data[at]!, data[at + 1]!, data[at + 2]!, data[at + 3]!)
}

/**
 * JPEG is a chain of marker segments before the compressed scan. Anything
 * after the start-of-scan marker is the picture itself and is left alone.
 */
function scanJpeg(data: Uint8Array, scan: Scan) {
  let at = 2
  while (at + 4 <= data.length) {
    if (data[at] !== 0xff) break
    const marker = data[at + 1]!
    // Markers that stand alone, with no length and no payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2
      continue
    }
    // The scan, and everything after it, is image data.
    if (marker === 0xda) break
    const length = (data[at + 2]! << 8) | data[at + 3]!
    const end = at + 2 + length
    if (length < 2 || end > data.length) break
    const payload = at + 4

    let drop = false
    if (marker === 0xe1) {
      drop = true
      if (startsWith(data, payload, EXIF_PREFIX)) {
        readExif(data.subarray(payload + 6, end), scan.meta)
      }
    } else if (marker === 0xe2) {
      // APP2 is usually the colour profile, which must stay. The other common
      // occupant is Apple's multi-picture index, which is metadata.
      drop = startsWith(data, payload, 'MPF\0')
    } else if ((marker >= 0xe3 && marker <= 0xed) || marker === 0xfe) {
      drop = true
    }
    if (drop) scan.drop.push([at, end])
    at = end
  }
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'])

function pngText(data: Uint8Array, start: number, end: number, type: string, meta: Metadata) {
  if (type === 'zTXt') return
  let split = start
  while (split < end && data[split] !== 0) split++
  const keyword = new TextDecoder('latin1').decode(data.subarray(start, split))
  // iTXt adds compression flag, method and two null-terminated language tags.
  let from = split + 1
  if (type === 'iTXt') {
    if (data[from] === 1) return
    from += 2
    for (let skipped = 0; skipped < 2 && from < end; from++) if (data[from] === 0) skipped++
  }
  const value = new TextDecoder(type === 'iTXt' ? 'utf-8' : 'latin1').decode(data.subarray(from, end)).trim()
  if (!value) return
  if (keyword === 'Software' && !meta.software) meta.software = value
  else if (keyword === 'Author' && !meta.artist) meta.artist = value
  else if (keyword === 'Copyright' && !meta.copyright) meta.copyright = value
  else if (keyword === 'Creation Time' && !meta.taken) meta.taken = value
}

function scanPng(data: Uint8Array, scan: Scan) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let at = 8
  while (at + 8 <= data.length) {
    const length = view.getUint32(at, false)
    const type = fourCC(data, at + 4)
    const end = at + 12 + length
    if (end > data.length) break
    if (type === 'eXIf') readExif(data.subarray(at + 8, at + 8 + length), scan.meta)
    else if (type === 'tEXt' || type === 'iTXt') pngText(data, at + 8, at + 8 + length, type, scan.meta)
    if (PNG_DROP.has(type)) scan.drop.push([at, end])
    if (type === 'IEND') break
    at = end
  }
}

function scanWebp(data: Uint8Array, scan: Scan) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let at = 12
  while (at + 8 <= data.length) {
    const type = fourCC(data, at)
    const length = view.getUint32(at + 4, true)
    // Chunks are padded to an even length; the pad byte belongs to the chunk.
    const end = at + 8 + length + (length % 2)
    if (end > data.length + 1) break
    if (type === 'EXIF') {
      const from = startsWith(data, at + 8, EXIF_PREFIX) ? at + 14 : at + 8
      readExif(data.subarray(from, at + 8 + length), scan.meta)
    }
    if (type === 'EXIF' || type === 'XMP ') scan.drop.push([at, Math.min(end, data.length)])
    at = end
  }
}

/** What a picture is carrying, without changing it. */
export function readMetadata(data: Uint8Array): Metadata {
  return inspect(data).meta
}

function inspect(data: Uint8Array): Scan {
  const kind = container(data)
  const scan: Scan = { meta: { bytes: 0, supported: kind !== null }, drop: [], container: kind }
  try {
    if (kind === 'jpeg') scanJpeg(data, scan)
    else if (kind === 'png') scanPng(data, scan)
    else if (kind === 'webp') scanWebp(data, scan)
  } catch {
    // A malformed file gives up whatever was read before the damage; the
    // ranges collected so far are still safe to remove.
  }
  scan.meta.bytes = scan.drop.reduce((total, [start, end]) => total + (end - start), 0)
  return scan
}

/**
 * Remove every note, keeping the picture itself byte-identical.
 *
 * Returns the original array untouched when there is nothing to remove, so a
 * clean file is never needlessly rewritten.
 */
export function stripMetadata(data: Uint8Array): { data: Uint8Array; removed: number } {
  const scan = inspect(data)
  if (!scan.drop.length) return { data, removed: 0 }

  scan.drop.sort((a, b) => a[0] - b[0])
  const out = new Uint8Array(data.length - scan.meta.bytes)
  let written = 0
  let from = 0
  for (const [start, end] of scan.drop) {
    out.set(data.subarray(from, start), written)
    written += start - from
    from = end
  }
  out.set(data.subarray(from), written)

  if (scan.container === 'webp') fixWebp(out)
  return { data: out, removed: scan.meta.bytes }
}

/**
 * RIFF records its own length, and the extended-format chunk announces which
 * optional chunks exist. Both have to be told that the notes are gone, or
 * strict decoders go looking for chunks that are no longer there.
 */
function fixWebp(out: Uint8Array) {
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
  view.setUint32(4, out.length - 8, true)
  if (out.length >= 21 && fourCC(out, 12) === 'VP8X') {
    // Flags byte: bit 3 marks EXIF, bit 2 marks XMP.
    out[20] = out[20]! & ~0b00001100
  }
}
