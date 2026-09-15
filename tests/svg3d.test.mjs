/**
 * The arithmetic between a flat drawing and a printable solid.
 *
 * A wrong number here does not throw. It produces a model that renders
 * beautifully, downloads without complaint, and turns out to be mirrored, or
 * 40 mm when 60 mm was asked for, or a shell with no floor — which is
 * discovered by the person who printed it, not by the person who built it.
 * So the finished geometry is measured rather than trusted.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Shape, Vector2, BufferGeometry, BufferAttribute } from 'three'

register('./helpers/alias-loader.mjs', import.meta.url)
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const svg3d = await import(pathToFileURL(path.join(ROOT, 'shared/svg3d.ts')).href)

/** A square of the given size with its corner at the origin, as SVG sees it. */
const square = (size) =>
  new Shape([new Vector2(0, 0), new Vector2(size, 0), new Vector2(size, size), new Vector2(0, size)])

const layer = (shape, colour = '#000000') => ({
  colour,
  outlines: [svg3d.outlineOf(shape, 12)]
})

/** The box a set of parts occupies, read off the triangles. */
function box(parts) {
  const b = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity }
  for (const part of parts) {
    const position = part.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      b.minX = Math.min(b.minX, position.getX(i)); b.maxX = Math.max(b.maxX, position.getX(i))
      b.minY = Math.min(b.minY, position.getY(i)); b.maxY = Math.max(b.maxY, position.getY(i))
      b.minZ = Math.min(b.minZ, position.getZ(i)); b.maxZ = Math.max(b.maxZ, position.getZ(i))
    }
  }
  return b
}

test('the drawing comes out the right way up, not mirrored', () => {
  // SVG counts Y downwards. A shape drawn from y=0 to y=10 is 10 units BELOW
  // its origin on screen, so in a Y-up world it has to land below it too.
  const outline = svg3d.outlineOf(square(10), 12)
  const ys = outline.outer.map(p => p.y)
  assert.equal(Math.min(...ys), -10)
  assert.ok(Math.max(...ys) === 0, 'the top edge lands on the origin')

  // X is untouched: flipping both axes would be a rotation, and the logo
  // would come out looking right while being back to front.
  const xs = outline.outer.map(p => p.x)
  assert.equal(Math.min(...xs), 0)
  assert.equal(Math.max(...xs), 10)
})

test('the model is the size that was asked for, in millimetres', () => {
  // A wide drawing: 200 units across, 100 tall, in arbitrary SVG coordinates.
  const wide = new Shape([new Vector2(0, 0), new Vector2(200, 0), new Vector2(200, 100), new Vector2(0, 100)])
  const model = svg3d.buildModel([layer(wide)], { ...svg3d.DEFAULTS, size: 60, depth: 3, bevel: 0, base: 0 })

  assert.ok(Math.abs(model.size.x - 60) < 0.01, 'the longest side is what gets the requested size')
  assert.ok(Math.abs(model.size.y - 30) < 0.01, 'and the other side keeps the proportion')
  assert.ok(Math.abs(model.size.z - 3) < 0.01, 'thickness is millimetres, not a fraction of the width')
})

test('a bevel eats into the thickness rather than adding to it', () => {
  const plain = svg3d.buildModel([layer(square(10))], { ...svg3d.DEFAULTS, size: 40, depth: 3, bevel: 0 })
  const chamfered = svg3d.buildModel([layer(square(10))], { ...svg3d.DEFAULTS, size: 40, depth: 3, bevel: 0.6 })

  assert.ok(Math.abs(chamfered.size.z - plain.size.z) < 0.01, '3 mm with a chamfer is still 3 mm')
  // And the chamfer must not fatten the outline: a logo has to stay its size.
  assert.ok(Math.abs(chamfered.size.x - 40) < 0.01, 'the widest point is still the drawn outline')
  assert.ok(chamfered.triangles > plain.triangles, 'a chamfer is more triangles, or it was not applied')
})

test('the model sits on the bed instead of straddling it', () => {
  const model = svg3d.buildModel([layer(square(10))], { ...svg3d.DEFAULTS, size: 40, depth: 3, base: 0 })
  assert.ok(Math.abs(box(model.parts).minZ) < 0.001, 'z=0 is the bed; a model centred on it prints half-buried')

  const plated = svg3d.buildModel([layer(square(10))], { ...svg3d.DEFAULTS, size: 40, depth: 3, base: 2, baseMargin: 3 })
  const bounds = box(plated.parts)
  assert.ok(Math.abs(bounds.minZ) < 0.001, 'the plate is what now touches the bed')
  assert.ok(Math.abs(bounds.maxZ - 5) < 0.01, 'and the artwork is raised clear of it')
  assert.ok(Math.abs(bounds.maxX - (20 + 3)) < 0.01, 'the plate sticks out by the margin asked for')
})

test('holes stay holes', () => {
  const ring = square(10)
  ring.holes.push(new Shape([new Vector2(3, 3), new Vector2(7, 3), new Vector2(7, 7), new Vector2(3, 7)]))
  const solid = svg3d.buildModel([layer(ring)], { ...svg3d.DEFAULTS, size: 40, depth: 2 })
  const filled = svg3d.buildModel([layer(square(10))], { ...svg3d.DEFAULTS, size: 40, depth: 2 })

  // A hole is more triangles, not fewer: the wall around it has to be built.
  assert.ok(solid.triangles > filled.triangles, 'the counter of an O cannot be quietly filled in')
})

/**
 * Whether a mesh is actually a solid.
 *
 * A closed surface has every edge shared by exactly two triangles — one
 * opening is a hole a slicer has to guess how to fill. And the signed volume
 * comes out positive only when the triangles face outwards, which is how a
 * model that looks right but is inside out gets caught.
 */
function inspect(geometry) {
  const position = geometry.getAttribute('position')
  const key = (i) =>
    `${Math.round(position.getX(i) * 1e4)}:${Math.round(position.getY(i) * 1e4)}:${Math.round(position.getZ(i) * 1e4)}`

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

  return {
    triangles: position.count / 3,
    openEdges: [...edges.values()].filter(n => n !== 2).length,
    volume
  }
}

test('a stroke becomes a closed solid, not a sheet', () => {
  // Two triangles making a 10x10 square, which is what a stroke ribbon is
  // made of — three.js can outline a stroke but the result is flat.
  const flat = new BufferGeometry()
  flat.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 0, 0, 10, 0, 0, 10, 10, 0,
    0, 0, 0, 10, 10, 0, 0, 10, 0
  ]), 3))

  const solid = svg3d.thicken(flat, 2)
  const report = inspect(solid)

  // 2 lids, 2 floor, and four sides of two triangles each.
  assert.equal(report.triangles, 12, 'a box has twelve triangles; more means the interior edge got a wall')
  assert.equal(report.openEdges, 0, 'a sheet has open edges, a solid has none')
  assert.ok(Math.abs(report.volume - 200) < 0.01, '10 x 10 x 2 mm, facing outwards')
})

test('a stroke solid survives triangles wound either way', () => {
  // Nothing guarantees a stroke ribbon arrives consistently wound. If that is
  // not corrected, half the lids face down and the walls lean inwards.
  const mixed = new BufferGeometry()
  mixed.setAttribute('position', new BufferAttribute(new Float32Array([
    0, 0, 0, 10, 0, 0, 10, 10, 0,
    0, 0, 0, 0, 10, 0, 10, 10, 0
  ]), 3))

  const report = inspect(svg3d.thicken(mixed, 2))
  assert.equal(report.openEdges, 0)
  assert.ok(report.volume > 0, 'a negative volume means the model is inside out')
})

test('an extruded logo is a printable solid', () => {
  const ring = square(10)
  ring.holes.push(new Shape([new Vector2(3, 3), new Vector2(7, 3), new Vector2(7, 7), new Vector2(3, 7)]))
  const model = svg3d.buildModel([layer(ring)], { ...svg3d.DEFAULTS, size: 40, depth: 2, bevel: 0, base: 0 })

  const report = inspect(model.parts[0].geometry)
  assert.equal(report.openEdges, 0, 'an extruded outline has to close, hole and all')
  // 40 mm square, 16 mm square hole, 2 mm thick.
  assert.ok(Math.abs(report.volume - (40 * 40 - 16 * 16) * 2) < 1, 'the hole is missing from the volume')
})

test('a chamfer does not sink the model into the bed, or into its own plate', () => {
  // three.js hangs the lower half of a bevel below z=0. Left alone, a
  // chamfered badge prints from below the bed and loses the chamfer's worth
  // of height where it disappears into the backing plate.
  const bare = svg3d.buildModel([layer(square(10))], { ...svg3d.DEFAULTS, size: 40, depth: 3, bevel: 0.6, base: 0 })
  assert.ok(Math.abs(box(bare.parts).minZ) < 0.001, 'nothing may hang below the bed')
  assert.ok(Math.abs(bare.size.z - 3) < 0.01)

  const plated = svg3d.buildModel([layer(square(10))], { ...svg3d.DEFAULTS, size: 40, depth: 3, bevel: 0.6, base: 1.6 })
  assert.ok(Math.abs(plated.size.z - 4.6) < 0.01, 'a 3 mm badge on a 1.6 mm plate is 4.6 mm, chamfer or not')

  // The artwork is the second part; the plate is unshifted in at the front.
  assert.ok(Math.abs(box([plated.parts[1]]).minZ - 1.6) < 0.01, 'the artwork starts exactly where the plate ends')
})

test('shapes painted over each other stack instead of fighting', () => {
  // SVG paints in order: a white dot drawn over a black disc hides it. Raised
  // to identical heights they would coexist and flicker wherever they meet.
  const black = layer(square(10), '#000000')
  const white = { colour: '#ffffff', outlines: [svg3d.outlineOf(square(4), 12)] }
  const model = svg3d.buildModel([black, white], { ...svg3d.DEFAULTS, size: 40, depth: 3, bevel: 0, base: 0 })

  const first = box([model.parts[0]])
  const second = box([model.parts[1]])
  assert.ok(second.maxZ > first.maxZ, 'the later colour has to sit on top')
  assert.ok(second.maxZ - first.maxZ < 0.05, 'but by less than any printer could resolve')
  assert.ok(Math.abs(second.minZ - first.minZ) < 0.001, 'and not by floating off the bed')
})
