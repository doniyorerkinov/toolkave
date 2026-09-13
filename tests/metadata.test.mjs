/**
 * What a photo tells about you, and whether we can take it back out.
 *
 * The fixtures are built byte by byte rather than checked in as sample
 * photos: a hand-written EXIF block is the only way to assert that a
 * specific latitude comes back as a specific number, and it keeps the repo
 * free of someone's actual holiday snap.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

register('./helpers/alias-loader.mjs', import.meta.url)
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const { readMetadata, stripMetadata } = await import(
  pathToFileURL(path.join(ROOT, 'shared/image-metadata.ts')).href
)

/** Build a little-endian TIFF block with an IFD0 and a GPS IFD. */
function exifBlock() {
  const out = []
  const u16 = n => out.push(n & 0xff, (n >> 8) & 0xff)
  const u32 = n => out.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff)

  out.push(0x49, 0x49) // "II" — little-endian
  u16(42)
  u32(8) // IFD0 starts right after the header

  // Values longer than four bytes live past the two directories. IFD0 has
  // three entries (12 bytes each) plus count and next-pointer: 8 + 2 + 36 + 4.
  const heap = 50
  const makeAt = heap
  const modelAt = makeAt + 6 // "Apple\0"
  const gpsIfdAt = modelAt + 9 // "iPhone 12\0" is 10, rounded below

  u16(3) // three entries in IFD0
  u16(0x010f); u16(2); u32(6); u32(makeAt) // Make
  u16(0x0110); u16(2); u32(10); u32(modelAt) // Model
  u16(0x8825); u16(4); u32(1); u32(gpsIfdAt + 1) // GPS pointer
  u32(0) // no IFD1

  assert.equal(out.length, heap, 'header and IFD0 must end exactly at the heap')
  for (const c of 'Apple\0') out.push(c.charCodeAt(0))
  for (const c of 'iPhone 12\0') out.push(c.charCodeAt(0))

  // GPS IFD: 41.2995 N, 69.2401 E — Tashkent, to the second.
  const gpsStart = out.length
  const rationalsAt = gpsStart + 2 + 4 * 12 + 4
  u16(4)
  u16(0x0001); u16(2); u32(2); u32(0x004e) // "N\0", inline
  u16(0x0002); u16(5); u32(3); u32(rationalsAt) // latitude
  u16(0x0003); u16(2); u32(2); u32(0x0045) // "E\0", inline
  u16(0x0004); u16(5); u32(3); u32(rationalsAt + 24) // longitude
  u32(0)

  assert.equal(out.length, rationalsAt, 'GPS IFD must end exactly at its rationals')
  // 41° 17' 58.2" and 69° 14' 24.36", each as numerator/denominator.
  for (const [n, d] of [[41, 1], [17, 1], [582, 10], [69, 1], [14, 1], [2436, 100]]) {
    u32(n)
    u32(d)
  }
  return Uint8Array.from(out)
}

/** A JPEG that decodes to nothing but carries a full set of segments. */
function jpeg({ exif = true, comment = true, icc = true } = {}) {
  const parts = [[0xff, 0xd8]]
  if (exif) {
    const block = exifBlock()
    const length = block.length + 8
    parts.push([0xff, 0xe1, length >> 8, length & 0xff, ...'Exif'.split('').map(c => c.charCodeAt(0)), 0, 0, ...block])
  }
  if (icc) {
    const tag = [...'ICC_PROFILE\0'].map(c => c.charCodeAt(0))
    parts.push([0xff, 0xe2, 0, tag.length + 2 + 4, ...tag, 1, 2, 3, 4])
  }
  if (comment) {
    const text = [...'made with something'].map(c => c.charCodeAt(0))
    parts.push([0xff, 0xfe, 0, text.length + 2, ...text])
  }
  // A start-of-scan and some stand-in entropy data, then end-of-image.
  parts.push([0xff, 0xda, 0, 8, 1, 1, 0, 0, 0, 0])
  parts.push([0x12, 0x34, 0x56, 0x78, 0xff, 0xd9])
  return Uint8Array.from(parts.flat())
}

test('a photo gives up where it was taken', () => {
  const meta = readMetadata(jpeg())
  assert.equal(meta.make, 'Apple')
  assert.equal(meta.model, 'iPhone 12')
  assert.ok(meta.gps, 'GPS should be found')
  assert.ok(Math.abs(meta.gps.latitude - 41.2995) < 0.0001, `latitude was ${meta.gps?.latitude}`)
  assert.ok(Math.abs(meta.gps.longitude - 69.2401) < 0.0001, `longitude was ${meta.gps?.longitude}`)
  assert.ok(meta.bytes > 0)
  assert.equal(meta.supported, true)
})

test('stripping removes the notes and keeps the picture byte for byte', () => {
  const original = jpeg()
  const { data, removed } = stripMetadata(original)
  assert.ok(removed > 0)
  assert.deepEqual(readMetadata(data), { bytes: 0, supported: true })

  // The scan is the last six bytes; they must survive unchanged.
  assert.deepEqual([...data.subarray(-6)], [0x12, 0x34, 0x56, 0x78, 0xff, 0xd9])
  assert.equal(data.length, original.length - removed)
})

test('the colour profile stays, the comment goes', () => {
  const { data } = stripMetadata(jpeg())
  const text = Buffer.from(data).toString('latin1')
  assert.ok(text.includes('ICC_PROFILE'), 'APP2 colour profile must be kept')
  assert.ok(!text.includes('made with something'), 'the comment must be removed')
  assert.ok(!text.includes('Apple'), 'the camera make must be removed')
})

test('a clean file is handed back untouched', () => {
  const clean = jpeg({ exif: false, comment: false })
  const { data, removed } = stripMetadata(clean)
  assert.equal(removed, 0)
  assert.equal(data, clean, 'the same array should come back, not a copy')
})

test('a PNG loses its text chunks and keeps its pixels', () => {
  const crc = () => [0, 0, 0, 0] // not checked by the walker
  const chunk = (type, payload) => {
    const length = payload.length
    return [
      (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff,
      ...[...type].map(c => c.charCodeAt(0)), ...payload, ...crc()
    ]
  }
  const text = [...'Software\0Adobe Photoshop'].map(c => c.charCodeAt(0))
  const png = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    ...chunk('tEXt', text),
    ...chunk('iCCP', [1, 2, 3]),
    ...chunk('IDAT', [9, 9, 9, 9]),
    ...chunk('IEND', [])
  ])

  assert.equal(readMetadata(png).software, 'Adobe Photoshop')
  const { data, removed } = stripMetadata(png)
  assert.equal(removed, text.length + 12)
  const after = Buffer.from(data).toString('latin1')
  assert.ok(!after.includes('Photoshop'))
  assert.ok(after.includes('iCCP'), 'the colour profile chunk must survive')
  assert.ok(after.includes('IDAT'), 'the pixels must survive')
})

test('an unknown format says so rather than pretending', () => {
  const meta = readMetadata(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))
  assert.equal(meta.supported, false)
  assert.equal(meta.bytes, 0)
})
