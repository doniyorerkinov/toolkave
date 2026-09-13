/**
 * Packing several PNGs into one .ico file.
 *
 * A favicon is not one image. Browsers pick from whatever the file offers —
 * 16 px in a tab, 32 px on a bookmark bar, 48 px in a Windows shortcut — and
 * a single large image scaled down by the browser comes out muddy at 16 px,
 * which is the size people actually see.
 *
 * Since Windows Vista an icon entry may hold a PNG as-is rather than the old
 * BMP-with-mask layout, which every browser in use understands. That keeps
 * this to a header and a directory.
 */

export interface IcoEntry {
  /** Square edge in pixels, 1–256. */
  size: number
  /** The PNG for that size, already encoded. */
  png: Uint8Array
}

const HEADER = 6
const DIRECTORY_ENTRY = 16

export function buildIco(entries: IcoEntry[]): Uint8Array {
  if (!entries.length) throw new Error('an icon needs at least one image')

  const total = HEADER + entries.length * DIRECTORY_ENTRY + entries.reduce((sum, e) => sum + e.png.length, 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)

  // ICONDIR: reserved, type 1 (icon, as opposed to 2 for a cursor), count.
  view.setUint16(0, 0, true)
  view.setUint16(2, 1, true)
  view.setUint16(4, entries.length, true)

  let offset = HEADER + entries.length * DIRECTORY_ENTRY
  entries.forEach((entry, index) => {
    const at = HEADER + index * DIRECTORY_ENTRY
    // A 256 px image is written as 0: the field is one byte and 256 does not
    // fit, so the format spends its only escape hatch on the largest size.
    out[at] = entry.size >= 256 ? 0 : entry.size
    out[at + 1] = entry.size >= 256 ? 0 : entry.size
    out[at + 2] = 0 // not a palette
    out[at + 3] = 0
    view.setUint16(at + 4, 1, true) // colour planes
    view.setUint16(at + 6, 32, true) // bits per pixel
    view.setUint32(at + 8, entry.png.length, true)
    view.setUint32(at + 12, offset, true)
    out.set(entry.png, offset)
    offset += entry.png.length
  })

  return out
}
