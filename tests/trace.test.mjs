/**
 * Reading a shape out of pixels.
 *
 * The failures here are all quiet ones. A hole that is not recognised as a
 * hole fills in; a hole inside a hole that IS recognised as one eats the
 * island in the middle; a smoothing pass that drifts shrinks the logo by a
 * millimetre. None of it throws, and all of it is visible only once the
 * thing has been printed - so the shapes are measured instead.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

register('./helpers/alias-loader.mjs', import.meta.url)
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const trace = await import(pathToFileURL(path.join(ROOT, 'shared/trace.ts')).href)
const svg3d = await import(pathToFileURL(path.join(ROOT, 'shared/svg3d.ts')).href)

/** An RGBA image of the given size, opaque black wherever `inside` says so. */
function picture(width, height, inside) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4
      if (inside(x, y)) { pixels[p] = pixels[p + 1] = pixels[p + 2] = 0; pixels[p + 3] = 255 }
      else { pixels[p] = pixels[p + 1] = pixels[p + 2] = 255; pixels[p + 3] = 0 }
    }
  }
  return pixels
}

const ALPHA = { source: 'alpha', threshold: 128 }
const SHARP = { minArea: 4, smooth: 0, tolerance: 0 }

const inBox = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1

test('a block of pixels becomes one loop the size of the block', () => {
  const pixels = picture(20, 20, inBox(5, 5, 15, 15))
  const mask = trace.buildMask(pixels, 20, 20, ALPHA)
  const loops = trace.traceLoops(mask, 20, 20)

  assert.equal(loops.length, 1, 'one block, one border')
  // Corners, not pixel centres: a 10 pixel wide block is 10 units wide, not 9.
  assert.equal(Math.abs(trace.loopArea(loops[0])), 100)
})

test('a hole is a hole, and an island inside it is not', () => {
  // A ring, with a smaller solid block floating in the middle of its hole.
  const ring = (x, y) => inBox(2, 2, 22, 22)(x, y) && !inBox(6, 6, 18, 18)(x, y)
  const island = inBox(9, 9, 15, 15)
  const pixels = picture(24, 24, (x, y) => ring(x, y) || island(x, y))

  const outlines = trace.trace(pixels, 24, 24, ALPHA, SHARP)

  // Two shapes: the ring, and the island that happens to sit inside its hole.
  // Counting nesting rather than assuming is the whole point - one level in
  // is a hole, two levels in is solid again.
  assert.equal(outlines.length, 2, 'the island must not be swallowed as a hole')
  const withHole = outlines.find(o => o.holes.length === 1)
  assert.ok(withHole, 'the ring keeps its hole')
  assert.equal(outlines.filter(o => o.holes.length === 0).length, 1, 'the island has no hole of its own')
})

test('a hole runs the opposite way round to the shape it is cut from', () => {
  const pixels = picture(24, 24, (x, y) => inBox(2, 2, 22, 22)(x, y) && !inBox(8, 8, 16, 16)(x, y))
  const [outline] = trace.trace(pixels, 24, 24, ALPHA, SHARP)

  assert.equal(outline.holes.length, 1)
  const outer = Math.sign(svg3d.signedArea(outline.outer))
  const hole = Math.sign(svg3d.signedArea(outline.holes[0]))
  assert.notEqual(outer, hole, 'same winding builds the wall around the hole facing inwards')
})

test('transparency and brightness are different questions', () => {
  // White artwork on a transparent background: by alpha it is a shape, by
  // darkness it is nothing at all.
  const pixels = new Uint8ClampedArray(8 * 8 * 4)
  for (let i = 0; i < 64; i++) {
    const inside = i % 8 >= 2 && i % 8 < 6 && Math.floor(i / 8) >= 2 && Math.floor(i / 8) < 6
    pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = 255
    pixels[i * 4 + 3] = inside ? 255 : 0
  }
  const byAlpha = trace.buildMask(pixels, 8, 8, { source: 'alpha', threshold: 128 })
  const byDark = trace.buildMask(pixels, 8, 8, { source: 'dark', threshold: 128 })

  assert.equal(byAlpha.reduce((a, b) => a + b, 0), 16, 'alpha finds the white square')
  assert.equal(byDark.reduce((a, b) => a + b, 0), 0, 'darkness finds nothing, and must not read behind transparency')
  assert.equal(trace.hasTransparency(pixels), true)
})

/** Whether an exported mesh is a closed solid, and how much of it there is. */
function inspect(geometry) {
  const position = geometry.getAttribute('position')
  const key = (i) => [0, 1, 2].map(a => Math.round(position.getComponent(i, a) * 1e4)).join(':')
  const edges = new Map()
  let volume = 0

  for (let i = 0; i < position.count; i += 3) {
    const corner = [key(i), key(i + 1), key(i + 2)]
    for (let e = 0; e < 3; e++) {
      const pair = [corner[e], corner[(e + 1) % 3]].sort().join('|')
      edges.set(pair, (edges.get(pair) ?? 0) + 1)
    }
    const [ax, ay, az] = [position.getX(i), position.getY(i), position.getZ(i)]
    const [bx, by, bz] = [position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1)]
    const [cx, cy, cz] = [position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2)]
    volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6
  }

  return { openEdges: [...edges.values()].filter(n => n !== 2).length, volume }
}

test('a traced picture reaches the same printable solid an SVG would', () => {
  // A ring: 20 pixels across with a 12 pixel hole, scaled so it is 40 mm wide.
  const pixels = picture(24, 24, (x, y) => inBox(2, 2, 22, 22)(x, y) && !inBox(6, 6, 18, 18)(x, y))
  const outlines = trace.trace(pixels, 24, 24, ALPHA, SHARP)
  const model = svg3d.buildModel([{ colour: '#000000', outlines }], {
    ...svg3d.DEFAULTS, size: 40, depth: 2, bevel: 0, base: 0
  })

  const report = inspect(model.parts[0].geometry)
  assert.equal(report.openEdges, 0, 'pixels in, watertight solid out')
  // 40 mm outside, 24 mm hole, 2 mm thick.
  assert.ok(Math.abs(report.volume - (40 * 40 - 24 * 24) * 2) < 1, `volume was ${report.volume}`)
})

test('simplifying a straight edge keeps its corners where they were', () => {
  const pixels = picture(20, 20, inBox(5, 5, 15, 15))
  const [loop] = trace.traceLoops(trace.buildMask(pixels, 20, 20, ALPHA), 20, 20)
  const simple = trace.simplify(loop, 0.5)

  assert.equal(simple.length / 2, 4, 'a square needs four points, not forty')
  assert.equal(Math.abs(trace.loopArea(simple)), 100, 'and the same four the square had')
})

test('smoothing rounds the staircase without shrinking the artwork', () => {
  const pixels = picture(40, 40, (x, y) => Math.hypot(x - 20, y - 20) < 15)
  const mask = trace.buildMask(pixels, 40, 40, ALPHA)
  const [stepped] = trace.traceLoops(mask, 40, 40)
  const [rounded] = trace.toOutlines(trace.traceLoops(mask, 40, 40), { minArea: 4, smooth: 2, tolerance: 0.6 })

  const before = Math.abs(trace.loopArea(stepped))
  const after = Math.abs(svg3d.signedArea(rounded.outer))
  assert.ok(Math.abs(after - before) / before < 0.03, `smoothing moved the edge by ${Math.abs(after - before) / before}`)
  assert.ok(rounded.outer.length < stepped.length / 2 / 3, 'and it should cost far fewer points than the staircase')
})

test('specks are dropped before they become slivers of plastic', () => {
  // One real shape and a scatter of single stray pixels, as an antialiased
  // or noisy picture produces by the hundred.
  const noise = new Set(['3,3', '30,4', '5,31', '33,33', '18,2'])
  const pixels = picture(36, 36, (x, y) => inBox(10, 10, 26, 26)(x, y) || noise.has(`${x},${y}`))

  const loose = trace.trace(pixels, 36, 36, ALPHA, { minArea: 0, smooth: 0, tolerance: 0 })
  const clean = trace.trace(pixels, 36, 36, ALPHA, SHARP)

  assert.equal(loose.length, 6, 'without a floor, every stray pixel is a shape')
  assert.equal(clean.length, 1, 'with one, only the artwork survives')
})

test('smoothing rounds the staircase but not the corners of a square', () => {
  // The distinction is scale, not angle: a staircase step is a pixel long,
  // the side of a logo is hundreds. Rounding both equally turns a square
  // badge into a lozenge, which is a change nobody asked for.
  const pixels = picture(60, 60, inBox(10, 10, 50, 50))
  const loops = trace.traceLoops(trace.buildMask(pixels, 60, 60, ALPHA), 60, 60)
  const [rounded] = trace.toOutlines(loops, { minArea: 4, smooth: 2, tolerance: 0.6 })

  const area = Math.abs(svg3d.signedArea(rounded.outer))
  assert.ok(Math.abs(area - 1600) / 1600 < 0.02, `a 40 x 40 square lost ${(1600 - area).toFixed(1)} units to smoothing`)

  // The corner should still be a corner: some point within a pixel of it.
  const corner = rounded.outer.some(p => Math.abs(p.x - 10) < 1.5 && Math.abs(p.y + 10) < 1.5)
  assert.ok(corner, 'the corner has been rounded away')
})
