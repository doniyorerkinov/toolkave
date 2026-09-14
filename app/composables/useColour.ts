import { rgbToHex, rgbToLab, type Rgb } from '~~/shared/colour'

/**
 * The parts of colour work that need a browser.
 *
 * The maths lives in `shared/colour.ts` where it can be tested; this is the
 * clipboard, the screen eyedropper and reading pixels out of a picture.
 */

/** A tiny shared "copied!" state, so every swatch behaves the same way. */
export function useCopy(resetAfter = 1200) {
  const copied = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  async function copy(text: string, key = text) {
    try {
      await navigator.clipboard.writeText(text)
      copied.value = key
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => (copied.value = null), resetAfter)
    } catch {
      copied.value = null
    }
  }

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return { copied, copy }
}

/**
 * Sampling a pixel from anywhere on screen, including outside the browser.
 *
 * Chromium only, and there is no polyfill worth having — a page cannot see
 * the screen without the browser's help. Feature-detected so the button is
 * simply absent elsewhere rather than present and broken.
 */
export const canEyedrop = () => import.meta.client && 'EyeDropper' in window

export async function pickFromScreen(): Promise<Rgb | null> {
  if (!canEyedrop()) return null
  try {
    const Dropper = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } })
      .EyeDropper
    const { sRGBHex } = await new Dropper().open()
    const hex = sRGBHex.replace('#', '')
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    }
  } catch {
    // Cancelling the picker rejects, which is not an error worth showing.
    return null
  }
}

/**
 * The colours a picture is actually made of.
 *
 * k-means rather than "count the most common hex values": a photograph has
 * almost no repeated pixels, so counting exact matches returns noise. The
 * clustering runs in Lab, where the distance between two colours matches how
 * different they look, which is the whole point of asking.
 */
export async function paletteFromImage(bitmap: ImageBitmap, count = 6): Promise<Rgb[]> {
  // A few thousand pixels decide this as well as a few million, and the
  // difference is between instant and a frozen tab.
  const size = 160
  const scale = Math.min(size / bitmap.width, size / bitmap.height, 1)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('canvas unavailable')
  context.drawImage(bitmap, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height).data
  canvas.width = 0
  canvas.height = 0

  const points: { rgb: Rgb; lab: [number, number, number] }[] = []
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3]! < 128) continue
    const rgb = { r: pixels[i]!, g: pixels[i + 1]!, b: pixels[i + 2]! }
    const lab = rgbToLab(rgb)
    points.push({ rgb, lab: [lab.l, lab.a, lab.b] })
  }
  if (!points.length) return []

  // Seeded deterministically: the same picture gives the same palette twice,
  // which matters when someone re-runs it expecting to get their colours back.
  const centres: [number, number, number][] = []
  for (let i = 0; i < count; i++) {
    const point = points[Math.floor((i / count) * points.length)]!
    centres.push([...point.lab])
  }

  const assignment = new Array<number>(points.length).fill(0)
  for (let round = 0; round < 12; round++) {
    let moved = false
    for (let i = 0; i < points.length; i++) {
      const lab = points[i]!.lab
      let best = 0
      let bestDistance = Infinity
      for (let c = 0; c < centres.length; c++) {
        const centre = centres[c]!
        const distance =
          (lab[0] - centre[0]) ** 2 + (lab[1] - centre[1]) ** 2 + (lab[2] - centre[2]) ** 2
        if (distance < bestDistance) {
          bestDistance = distance
          best = c
        }
      }
      if (assignment[i] !== best) {
        assignment[i] = best
        moved = true
      }
    }
    if (!moved && round) break

    const sums = centres.map(() => [0, 0, 0, 0])
    for (let i = 0; i < points.length; i++) {
      const bucket = sums[assignment[i]!]!
      const lab = points[i]!.lab
      bucket[0]! += lab[0]!
      bucket[1]! += lab[1]!
      bucket[2]! += lab[2]!
      bucket[3]! += 1
    }
    for (let c = 0; c < centres.length; c++) {
      const bucket = sums[c]!
      if (!bucket[3]) continue
      centres[c] = [bucket[0]! / bucket[3]!, bucket[1]! / bucket[3]!, bucket[2]! / bucket[3]!]
    }
  }

  // Each cluster is represented by a real pixel from the picture, not by the
  // average — an average of a cluster can be a colour the photo never had.
  const sized = centres.map((centre, index) => {
    let best: Rgb | null = null
    let bestDistance = Infinity
    let weight = 0
    for (let i = 0; i < points.length; i++) {
      if (assignment[i] !== index) continue
      weight++
      const lab = points[i]!.lab
      const distance =
        (lab[0] - centre[0]!) ** 2 + (lab[1] - centre[1]!) ** 2 + (lab[2] - centre[2]!) ** 2
      if (distance < bestDistance) {
        bestDistance = distance
        best = points[i]!.rgb
      }
    }
    return { rgb: best, weight }
  })

  const seen = new Set<string>()
  return sized
    .filter(entry => entry.rgb && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map(entry => entry.rgb!)
    .filter(rgb => {
      const hex = rgbToHex(rgb)
      if (seen.has(hex)) return false
      seen.add(hex)
      return true
    })
}
