/**
 * The .ico container, checked against what a browser reads back out of it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

register('./helpers/alias-loader.mjs', import.meta.url)
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const { buildIco } = await import(pathToFileURL(path.join(ROOT, 'shared/ico.ts')).href)

const png = n => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, ...Array(n).fill(7)])

test('the directory points at each image', () => {
  const entries = [
    { size: 16, png: png(20) },
    { size: 32, png: png(40) },
    { size: 48, png: png(60) }
  ]
  const ico = buildIco(entries)
  const view = new DataView(ico.buffer)

  assert.equal(view.getUint16(0, true), 0)
  assert.equal(view.getUint16(2, true), 1, 'type 1 is an icon')
  assert.equal(view.getUint16(4, true), 3)

  entries.forEach((entry, index) => {
    const at = 6 + index * 16
    assert.equal(ico[at], entry.size, `entry ${index} width`)
    assert.equal(ico[at + 1], entry.size, `entry ${index} height`)
    const length = view.getUint32(at + 8, true)
    const offset = view.getUint32(at + 12, true)
    assert.equal(length, entry.png.length)
    assert.deepEqual([...ico.subarray(offset, offset + length)], [...entry.png])
  })
  const payload = entries.reduce((sum, e) => sum + e.png.length, 0)
  assert.equal(ico.length, 6 + 3 * 16 + payload)
})

test('256 is written as zero, the format having no other way to say it', () => {
  const ico = buildIco([{ size: 256, png: png(10) }])
  assert.equal(ico[6], 0)
  assert.equal(ico[7], 0)
})

test('an empty icon is refused rather than written', () => {
  assert.throws(() => buildIco([]), /at least one/)
})
