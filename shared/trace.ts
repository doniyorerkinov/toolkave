/**
 * Finding the shape in a picture.
 *
 * A PNG has no outlines - it has pixels, and the edge of a logo is only the
 * place where they stop. Turning that into something extrudable means three
 * separate jobs, each of which has a way of going quietly wrong:
 *
 *   1. Deciding which pixels count. Transparency if the file has any, a
 *      brightness threshold if it does not.
 *   2. Walking the border of that region. Done by cancelling out every edge
 *      shared by two chosen pixels, exactly as the wall-building in
 *      `svg3d.ts` does - what survives is the silhouette, and it survives as
 *      closed loops without anyone having to know what the shape was.
 *   3. Working out which loops are holes. A loop inside an odd number of
 *      other loops is a hole; the letter B has two, and the counter of an
 *      O inside a ring is a shape again.
 *
 * All of it is pure arithmetic on a mask, so all of it can be measured.
 */
import { Vector2 } from 'three'
import { signedArea, type Outline } from './svg3d'

/** What decides whether a pixel is part of the shape. */
export type MaskSource = 'alpha' | 'light' | 'dark'

export interface MaskOptions {
  source: MaskSource
  /** 0-255. Alpha above it, or brightness above/below it, depending on source. */
  threshold: number
}

/**
 * The pixels that are part of the shape, one byte each.
 *
 * Alpha is the honest source when a file has it: it is the author saying
 * where the artwork ends. Brightness is a guess, and a good one only for
 * artwork that is dark on white or the reverse - which is why the tool asks
 * rather than deciding.
 */
export function buildMask(pixels: Uint8ClampedArray, width: number, height: number, options: MaskOptions): Uint8Array {
  const mask = new Uint8Array(width * height)
  const cut = options.threshold

  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const alpha = pixels[p + 3]!
    if (options.source === 'alpha') {
      mask[i] = alpha > cut ? 1 : 0
      continue
    }
    // A transparent pixel has no colour worth reading - whatever is in the
    // RGB channels behind full transparency is undefined, and often black,
    // which would trace the whole canvas as a dark shape.
    if (alpha < 8) {
      mask[i] = 0
      continue
    }
    const light = (pixels[p]! * 299 + pixels[p + 1]! * 587 + pixels[p + 2]! * 114) / 1000
    mask[i] = (options.source === 'light' ? light > cut : light < cut) ? 1 : 0
  }

  return mask
}

/** True if any pixel is even slightly transparent, which decides the default source. */
export function hasTransparency(pixels: Uint8ClampedArray): boolean {
  for (let p = 3; p < pixels.length; p += 4) if (pixels[p]! < 250) return true
  return false
}

/** A corner of the pixel grid, as one number. */
const stride = (width: number) => width + 1

/**
 * The border of the chosen region, as closed loops of grid corners.
 *
 * Every chosen pixel contributes its four edges, and an edge given by two
 * neighbouring pixels cancels out. What is left is exactly the boundary -
 * outer loops and hole loops together, each already closed, with no need to
 * know in advance how many there are or where they start.
 *
 * Coordinates are grid corners, so a single pixel at (0,0) traces the square
 * from (0,0) to (1,1). That keeps the shape the size of the picture rather
 * than half a pixel smaller on every side.
 */
export function traceLoops(mask: Uint8Array, width: number, height: number): number[][] {
  const step = stride(width)
  const pending = new Map<number, number[]>()

  const drop = (from: number, to: number): boolean => {
    const list = pending.get(from)
    if (!list) return false
    const at = list.indexOf(to)
    if (at === -1) return false
    list.splice(at, 1)
    if (!list.length) pending.delete(from)
    return true
  }

  const add = (from: number, to: number) => {
    // The same edge from the other side means two chosen pixels share it, so
    // it is inside the shape rather than on its border.
    if (drop(to, from)) return
    const list = pending.get(from)
    if (list) list.push(to)
    else pending.set(from, [to])
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue
      const a = y * step + x
      const b = a + 1
      const c = b + step
      const d = a + step
      add(a, b)
      add(b, c)
      add(c, d)
      add(d, a)
    }
  }

  const loops: number[][] = []
  while (pending.size) {
    const start = pending.keys().next().value as number
    const points: number[] = []
    let at = start

    for (;;) {
      const list = pending.get(at)
      if (!list || !list.length) break
      const next = list.shift()!
      if (!list.length) pending.delete(at)
      points.push(at % step, Math.floor(at / step))
      at = next
      if (at === start) break
    }

    if (points.length >= 6) loops.push(points)
  }

  return loops
}

/** Twice the signed area of a flat [x,y,x,y] loop. Sign is the winding. */
export function loopArea(points: number[]): number {
  let total = 0
  const n = points.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    total += points[j * 2]! * points[i * 2 + 1]! - points[i * 2]! * points[j * 2 + 1]!
  }
  return total / 2
}

/** Ray casting, for deciding which loop sits inside which. */
export function contains(loop: number[], x: number, y: number): boolean {
  let inside = false
  const n = loop.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = loop[i * 2]!, yi = loop[i * 2 + 1]!
    const xj = loop[j * 2]!, yj = loop[j * 2 + 1]!
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Corners rounded off, by cutting each of them.
 *
 * A traced edge is a staircase, because pixels are squares - and a staircase
 * extruded is a staircase you can feel with a thumbnail. Chaikin replaces
 * every corner with two points a quarter of the way along each side, which
 * after a couple of passes reads as a curve. Artwork that is meant to have
 * square corners should have none of this, which is why it is a control
 * rather than something applied on the way past.
 */
export function chaikin(points: number[], passes: number, maxCut = Infinity): number[] {
  let current = points
  for (let pass = 0; pass < passes; pass++) {
    const n = current.length / 2
    if (n < 4) return current
    const next = new Array<number>(n * 4)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const ax = current[i * 2]!, ay = current[i * 2 + 1]!
      const bx = current[j * 2]!, by = current[j * 2 + 1]!
      // Plain Chaikin cuts a quarter off both ends of every edge, which is
      // right for a staircase step a pixel long and ruinous for the side of
      // a square: the corners of a logo would come back rounded off. Capping
      // the cut at a couple of pixels smooths what is an artefact of square
      // pixels and leaves what the artwork actually says.
      const span = Math.hypot(bx - ax, by - ay)
      const t = span > 0 ? Math.min(0.25, maxCut / span) : 0.25
      next[i * 4] = ax + (bx - ax) * t
      next[i * 4 + 1] = ay + (by - ay) * t
      next[i * 4 + 2] = ax + (bx - ax) * (1 - t)
      next[i * 4 + 3] = ay + (by - ay) * (1 - t)
    }
    current = next
  }
  return current
}

/** Douglas-Peucker over one open run, returning the indices worth keeping. */
function keepBetween(points: number[], first: number, last: number, tolerance: number, keep: Uint8Array) {
  const stack: [number, number][] = [[first, last]]
  const n = points.length / 2

  while (stack.length) {
    const [from, to] = stack.pop()!
    const ax = points[(from % n) * 2]!, ay = points[(from % n) * 2 + 1]!
    const bx = points[(to % n) * 2]!, by = points[(to % n) * 2 + 1]!
    const dx = bx - ax, dy = by - ay
    const span = Math.hypot(dx, dy)

    let worst = -1
    let farthest = tolerance
    for (let i = from + 1; i < to; i++) {
      const px = points[(i % n) * 2]!, py = points[(i % n) * 2 + 1]!
      const away = span > 0
        ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / span
        : Math.hypot(px - ax, py - ay)
      if (away > farthest) { farthest = away; worst = i }
    }

    if (worst === -1) continue
    keep[worst % n] = 1
    stack.push([from, worst], [worst, to])
  }
}

/**
 * The same loop with the points that were not earning their place removed.
 *
 * Every point is a vertex in the download, and a traced logo arrives with one
 * per pixel of its border - tens of thousands of them, describing straight
 * lines one step at a time. Two anchors rather than one, because a loop has
 * no natural beginning and cutting it open at an arbitrary point flattens
 * whatever corner happened to be there.
 */
export function simplify(points: number[], tolerance: number): number[] {
  const n = points.length / 2
  if (n < 8 || tolerance <= 0) return points

  let opposite = 0
  let farthest = -1
  for (let i = 1; i < n; i++) {
    const away = Math.hypot(points[i * 2]! - points[0]!, points[i * 2 + 1]! - points[1]!)
    if (away > farthest) { farthest = away; opposite = i }
  }

  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[opposite] = 1
  keepBetween(points, 0, opposite, tolerance, keep)
  keepBetween(points, opposite, n, tolerance, keep)

  const out: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i * 2]!, points[i * 2 + 1]!)
  return out.length >= 6 ? out : points
}

export interface TraceOptions {
  /** Loops smaller than this, in square pixels, are noise rather than shape. */
  minArea: number
  /** Chaikin passes. Zero keeps the pixel staircase, which pixel art wants. */
  smooth: number
  /** How far, in pixels, a corner may be rounded. Keeps real corners sharp. */
  maxCut?: number
  /** How far a point may be from the line it sits on before it is dropped. */
  tolerance: number
}

/** More than this and the model is noise, whatever the picture looked like. */
const MAX_LOOPS = 400

/**
 * Loops sorted into shapes and the holes inside them.
 *
 * Nesting is what tells a hole from a shape, and it has to count rather than
 * assume: a loop inside one other loop is a hole, but a loop inside two is an
 * island in a lake - the middle of a letter O drawn inside a ring is solid
 * again. Each hole belongs to the smallest loop that contains it, or every
 * counter in a word would be assigned to the outermost shape on the page.
 */
export function toOutlines(loops: number[][], options: TraceOptions): Outline[] {
  // Measured once. A noisy threshold can produce tens of thousands of loops,
  // and `loopArea` inside a sort comparator would walk every one of them
  // O(n log n) times.
  const kept = loops
    .map(loop => ({ loop, size: Math.abs(loopArea(loop)) }))
    .filter(entry => entry.size >= options.minArea)
    .sort((a, b) => b.size - a.size)
    .slice(0, MAX_LOOPS)
    .map(entry => simplify(chaikin(simplify(entry.loop, 0.4), options.smooth, options.maxCut ?? 1), options.tolerance))
    .filter(loop => loop.length >= 6)

  /** A point safely inside its own loop, for testing against the others. */
  const probes = kept.map(loop => {
    const n = loop.length / 2
    let cx = 0, cy = 0
    for (let i = 0; i < n; i++) { cx += loop[i * 2]!; cy += loop[i * 2 + 1]! }
    cx /= n; cy /= n
    return [loop[0]! + (cx - loop[0]!) * 0.001, loop[1]! + (cy - loop[1]!) * 0.001] as const
  })

  // Sorted largest first, so only the loops before this one can contain it -
  // nothing is enclosed by something smaller than itself.
  const parents = kept.map((_, i) => {
    let depth = 0
    let parent = -1
    for (let j = 0; j < i; j++) {
      if (!contains(kept[j]!, probes[i]![0], probes[i]![1])) continue
      depth++
      // The last container found is the smallest, the list being descending.
      parent = j
    }
    return { depth, parent }
  })

  const flip = (loop: number[]): Vector2[] => {
    const out: Vector2[] = []
    for (let i = 0; i < loop.length; i += 2) out.push(new Vector2(loop[i]!, -loop[i + 1]!))
    return out
  }

  const outlines: Outline[] = []
  const index = new Map<number, number>()

  for (let i = 0; i < kept.length; i++) {
    if (parents[i]!.depth % 2 !== 0) continue
    index.set(i, outlines.length)
    outlines.push({ outer: flip(kept[i]!), holes: [] })
  }

  for (let i = 0; i < kept.length; i++) {
    const { depth, parent } = parents[i]!
    if (depth % 2 === 0 || parent === -1) continue
    const at = index.get(parent)
    if (at === undefined) continue
    const outline = outlines[at]!
    const hole = flip(kept[i]!)
    // Opposite winding to the shape it is cut from, or the wall around it is
    // built facing inwards - the same trap the SVG side fell into.
    const sign = Math.sign(signedArea(outline.outer))
    outline.holes.push(Math.sign(signedArea(hole)) === sign ? hole.reverse() : hole)
  }

  return outlines
}

/** Pixels in, shapes out. */
export function trace(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mask: MaskOptions,
  options: TraceOptions
): Outline[] {
  return toOutlines(traceLoops(buildMask(pixels, width, height, mask), width, height), options)
}
