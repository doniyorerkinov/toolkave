/**
 * Turning a flat drawing into a solid.
 *
 * An SVG is a set of closed outlines. A 3D model is a closed surface. The
 * distance between the two is smaller than it looks: give every outline a
 * thickness, cap it top and bottom, and you have a printable object.
 *
 * All the arithmetic lives here rather than in the component because it is
 * the part that is easy to get quietly wrong — a model that is mirrored, or
 * five times too big, still renders perfectly in the preview and only becomes
 * a problem an hour into a print. Keeping it out of the .vue file means it
 * can be asserted directly.
 *
 * Units: the SVG arrives in whatever coordinates it was drawn in, which mean
 * nothing physically. Everything here converts to millimetres as early as
 * possible, because that is the only unit a slicer, a printer or a person
 * holding the finished object cares about.
 */
import { Shape, Vector2, ExtrudeGeometry, BufferGeometry, BufferAttribute } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** A closed outline and the holes punched in it, Y already pointing up. */
export interface Outline {
  outer: Vector2[]
  holes: Vector2[][]
}

/** Everything that shares one colour, kept together so GLB can keep the colours. */
export interface Layer {
  colour: string
  outlines: Outline[]
  /**
   * Flat triangle soups, as XY pairs with Y already pointing up.
   *
   * What a stroked path becomes. A stroke has no inside to fill, so it
   * arrives already triangulated into a ribbon rather than as an outline.
   */
  meshes?: Float32Array[]
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** SVG units to millimetres, centred on the origin. */
export interface Fit {
  scale: number
  offsetX: number
  offsetY: number
}

export interface SolidOptions {
  /** Longest side of the finished model, in millimetres. */
  size: number
  /** How thick the raised artwork is, in millimetres. */
  depth: number
  /** Softened edge, in millimetres. Zero for a square edge. */
  bevel: number
  /** Backing plate thickness in millimetres. Zero for none. */
  base: number
  /** How far the plate sticks out past the artwork, in millimetres. */
  baseMargin: number
}

export const DEFAULTS: SolidOptions = {
  size: 60,
  depth: 3,
  bevel: 0,
  base: 0,
  baseMargin: 2
}

/** Below this a contour is a rounding artefact, not a shape worth extruding. */
const MIN_AREA = 1e-7

/** Twice the signed area. Sign is the winding direction; magnitude is the size. */
export function signedArea(points: Vector2[]): number {
  let total = 0
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    total += (points[j]!.x - points[i]!.x) * (points[j]!.y + points[i]!.y)
  }
  return total / 2
}

/**
 * A three.js Shape flattened into plain points, with Y turned the right way up.
 *
 * SVG counts Y downwards and 3D counts it upwards, so a model built straight
 * from SVG coordinates comes out upside down. Flipping here rather than by
 * scaling the finished mesh by -1 matters: a negative scale also turns every
 * triangle inside out, which leaves the normals pointing into the object and
 * the preview lit from within.
 *
 * `divisions` is how finely curves are sampled. It is the one control with a
 * real cost — every step is more triangles in the download.
 */
export function outlineOf(shape: Shape, divisions: number): Outline | null {
  const { shape: outer, holes } = shape.extractPoints(Math.max(1, Math.round(divisions)))
  const flip = (points: Vector2[]) => points.map(p => new Vector2(p.x, -p.y))

  const ring = flip(outer)
  if (ring.length < 3 || Math.abs(signedArea(ring)) < MIN_AREA) return null

  // A hole has to run the opposite way round to the outline it sits in. This
  // is not a convention worth respecting for its own sake: three.js only
  // corrects the winding when it has to reverse the outer contour anyway, so
  // a hole that happens to arrive wound the same way keeps it, and the wall
  // around it is built facing inwards. It looks perfect on screen, because
  // the counter of an O is lit by the surfaces around it either way, and it
  // exports as a model whose holes are inside out.
  const sign = Math.sign(signedArea(ring))

  return {
    outer: ring,
    holes: holes
      .map(flip)
      .filter(hole => hole.length >= 3 && Math.abs(signedArea(hole)) >= MIN_AREA)
      .map(hole => (Math.sign(signedArea(hole)) === sign ? [...hole].reverse() : hole))
  }
}

/** The box every outline fits inside, in SVG units. */
export function boundsOf(layers: Layer[]): Bounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const see = (x: number, y: number) => {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  for (const layer of layers) {
    for (const outline of layer.outlines) for (const point of outline.outer) see(point.x, point.y)
    for (const mesh of layer.meshes ?? []) {
      for (let i = 0; i + 1 < mesh.length; i += 2) see(mesh[i]!, mesh[i + 1]!)
    }
  }

  return minX === Infinity ? null : { minX, minY, maxX, maxY }
}

/**
 * The transform that makes the drawing a given number of millimetres across.
 *
 * Scaled by the longer side, so a wide logo and a tall one asked for the same
 * size both end up that size — asking for 60 mm and getting 60 mm of width
 * plus 140 mm of height is not what anyone means.
 */
export function fitTo(bounds: Bounds, size: number): Fit {
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  const longest = Math.max(width, height)
  const scale = longest > 0 ? size / longest : 1
  return {
    scale,
    offsetX: -(bounds.minX + width / 2),
    offsetY: -(bounds.minY + height / 2)
  }
}

/** Apply a fit to one ring, giving millimetres centred on the origin. */
export function place(points: Vector2[], fit: Fit): Vector2[] {
  return points.map(p => new Vector2((p.x + fit.offsetX) * fit.scale, (p.y + fit.offsetY) * fit.scale))
}

/** One extruded solid, kept separate per colour so GLB can keep the colours. */
export interface Part {
  colour: string
  geometry: BufferGeometry
}

export interface Model {
  parts: Part[]
  /** Finished size in millimetres, which is what a slicer will show. */
  size: { x: number; y: number; z: number }
  triangles: number
}

/**
 * Extrude settings for a given thickness.
 *
 * A bevel eats into the thickness at both ends, so the straight section has
 * to shrink to match — otherwise asking for 3 mm with a chamfer gives 4 mm,
 * and the number on screen is a lie. The bevel is also pushed inwards
 * (`bevelOffset`), which keeps the widest part of the model exactly on the
 * outline that was drawn; three.js otherwise grows the silhouette outwards
 * and the logo comes out fatter than the SVG.
 */
function extrudeSettings(depth: number, bevel: number) {
  const chamfer = Math.max(0, Math.min(bevel, depth / 2 - 0.05))
  return {
    depth: Math.max(0.05, depth - chamfer * 2),
    bevelEnabled: chamfer > 0,
    bevelThickness: chamfer,
    bevelSize: chamfer,
    bevelOffset: -chamfer,
    bevelSegments: 1,
    curveSegments: 1
  }
}

/** A rectangle with softened corners, for the backing plate. */
function plateShape(width: number, height: number): Shape {
  const radius = Math.min(4, Math.min(width, height) * 0.08)
  const x = width / 2
  const y = height / 2
  const shape = new Shape()

  if (radius <= 0.01) {
    shape.moveTo(-x, -y)
    shape.lineTo(x, -y)
    shape.lineTo(x, y)
    shape.lineTo(-x, y)
    shape.closePath()
    return shape
  }

  shape.moveTo(-x + radius, -y)
  shape.lineTo(x - radius, -y)
  shape.absarc(x - radius, -y + radius, radius, -Math.PI / 2, 0, false)
  shape.lineTo(x, y - radius)
  shape.absarc(x - radius, y - radius, radius, 0, Math.PI / 2, false)
  shape.lineTo(-x + radius, y)
  shape.absarc(-x + radius, y - radius, radius, Math.PI / 2, Math.PI, false)
  shape.lineTo(-x, -y + radius)
  shape.absarc(-x + radius, -y + radius, radius, Math.PI, Math.PI * 1.5, false)
  shape.closePath()
  return shape
}

/**
 * Every outline raised into a solid, sized in millimetres and sitting on z=0.
 *
 * Resting on zero rather than straddling it is not cosmetic: a slicer drops
 * the model onto the bed by its lowest point, and a model centred on the
 * origin appears half-buried in every preview that does not.
 */
export function buildModel(layers: Layer[], options: SolidOptions): Model | null {
  const bounds = boundsOf(layers)
  if (!bounds) return null

  const fit = fitTo(bounds, options.size)
  const base = Math.max(0, options.base)
  const parts: Part[] = []
  let order = 0

  for (const layer of layers) {
    // SVG is painted in order, so a white dot drawn over a black disc hides
    // it. In three dimensions they simply coexist, at exactly the same
    // height, and the two top faces flicker against each other wherever they
    // overlap. Each later colour is made a hundredth of a millimetre taller,
    // which restores the drawing's own stacking order for a difference no
    // printer and no eye can resolve. Bottoms stay level, so nothing is left
    // floating above the plate.
    const thickness = options.depth + order++ * 0.01
    const settings = extrudeSettings(thickness, options.bevel)
    const pieces: BufferGeometry[] = []

    for (const outline of layer.outlines) {
      const shape = new Shape(place(outline.outer, fit))
      for (const hole of outline.holes) shape.holes.push(new Shape(place(hole, fit)))
      const raised = new ExtrudeGeometry(shape, settings)
      // three.js hangs the lower half of a bevel below z=0, so a chamfered
      // model straddles the bed and, on a plate, sinks into it by the depth
      // of the chamfer - which is both height lost and a chamfer nobody will
      // ever see. Lifting by the chamfer puts the widest part of the artwork
      // exactly where the plate ends.
      raised.translate(0, 0, base + (settings.bevelEnabled ? settings.bevelThickness : 0))
      pieces.push(raised)
    }

    for (const mesh of layer.meshes ?? []) {
      const flat = new BufferGeometry()
      const xyz = new Float32Array((mesh.length / 2) * 3)
      for (let i = 0, o = 0; i + 1 < mesh.length; i += 2, o += 3) {
        xyz[o] = (mesh[i]! + fit.offsetX) * fit.scale
        xyz[o + 1] = (mesh[i + 1]! + fit.offsetY) * fit.scale
      }
      flat.setAttribute('position', new BufferAttribute(xyz, 3))
      // No bevel on a stroke, so it simply starts where the plate ends.
      pieces.push(thicken(flat, thickness, base))
    }

    if (!pieces.length) continue
    const geometry = pieces.length === 1 ? pieces[0]! : mergeGeometries(pieces, false)
    if (!geometry) continue
    parts.push({ colour: layer.colour, geometry })
  }

  if (!parts.length) return null

  if (base > 0) {
    const width = (bounds.maxX - bounds.minX) * fit.scale + options.baseMargin * 2
    const height = (bounds.maxY - bounds.minY) * fit.scale + options.baseMargin * 2
    parts.unshift({
      colour: parts[0]!.colour,
      geometry: new ExtrudeGeometry(plateShape(width, height), {
        depth: base,
        bevelEnabled: false,
        curveSegments: 8
      })
    })
  }

  let triangles = 0
  for (const part of parts) triangles += part.geometry.attributes.position!.count / 3

  return {
    parts,
    size: measure(parts),
    triangles
  }
}

/** The finished bounding box, read back from the triangles rather than assumed. */
export function measure(parts: Part[]): { x: number; y: number; z: number } {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  for (const part of parts) {
    part.geometry.computeBoundingBox()
    const box = part.geometry.boundingBox
    if (!box) continue
    minX = Math.min(minX, box.min.x); maxX = Math.max(maxX, box.max.x)
    minY = Math.min(minY, box.min.y); maxY = Math.max(maxY, box.max.y)
    minZ = Math.min(minZ, box.min.z); maxZ = Math.max(maxZ, box.max.z)
  }

  if (minX === Infinity) return { x: 0, y: 0, z: 0 }
  return { x: maxX - minX, y: maxY - minY, z: maxZ - minZ }
}

/** Two vertex indices in a fixed order, so an edge is the same edge either way round. */
function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

/**
 * Give a flat triangle mesh a thickness.
 *
 * Needed because stroked SVGs — most icon sets draw with outlines rather than
 * fills — have no fillable region at all. three.js can turn a stroke into a
 * flat ribbon of triangles, but a ribbon is not a solid: printed, it would be
 * a sheet with no depth.
 *
 * So the ribbon becomes the lid, a mirror of it becomes the floor, and the
 * gap between them is walled in. The walls only go where the mesh actually
 * ends, which is the whole trick: an edge shared by two triangles is interior
 * and gets nothing, an edge belonging to one triangle is the outside of the
 * shape. Counting edges finds the silhouette without ever knowing what the
 * shape was.
 */
export function thicken(flat: BufferGeometry, depth: number, bottom = 0): BufferGeometry {
  const source = flat.getAttribute('position')
  const keyed = new Map<string, number>()
  const points: number[] = []
  const triangles: number[][] = []

  // Vertices are merged by the cell they fall in, and the eight cells around
  // it are checked too. Without that neighbour sweep, two corners that should
  // be the same point but differ in the seventh decimal can land either side
  // of a cell boundary and stay separate - which leaves a crack in the
  // surface, invisible on screen and enough for a slicer to call the model
  // broken. A cell is a ten-thousandth of a millimetre, so nothing a printer
  // could ever resolve gets merged by accident.
  const indexOf = (x: number, y: number): number => {
    const cellX = Math.round(x * 1e4)
    const cellY = Math.round(y * 1e4)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const found = keyed.get(`${cellX + dx}:${cellY + dy}`)
        if (found !== undefined) return found
      }
    }
    const next = points.length / 2
    points.push(x, y)
    keyed.set(`${cellX}:${cellY}`, next)
    return next
  }

  for (let i = 0; i + 2 < source.count; i += 3) {
    const a = indexOf(source.getX(i), source.getY(i))
    const b = indexOf(source.getX(i + 1), source.getY(i + 1))
    const c = indexOf(source.getX(i + 2), source.getY(i + 2))
    if (a === b || b === c || a === c) continue

    // Wind every triangle the same way, or half the lids face downwards and
    // the walls built from their edges lean the wrong way.
    const area =
      (points[b * 2]! - points[a * 2]!) * (points[c * 2 + 1]! - points[a * 2 + 1]!) -
      (points[c * 2]! - points[a * 2]!) * (points[b * 2 + 1]! - points[a * 2 + 1]!)
    if (Math.abs(area) < 1e-9) continue
    triangles.push(area > 0 ? [a, b, c] : [a, c, b])
  }

  const shared = new Map<string, number>()
  for (const [a, b, c] of triangles) {
    for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
      const key = edgeKey(from!, to!)
      shared.set(key, (shared.get(key) ?? 0) + 1)
    }
  }

  const rim: number[][] = []
  for (const [a, b, c] of triangles) {
    for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
      if (shared.get(edgeKey(from!, to!)) === 1) rim.push([from!, to!])
    }
  }

  const top = bottom + depth
  const out = new Float32Array((triangles.length * 2 + rim.length * 2) * 9)
  let at = 0
  const put = (index: number, z: number) => {
    out[at++] = points[index * 2]!
    out[at++] = points[index * 2 + 1]!
    out[at++] = z
  }

  for (const [a, b, c] of triangles) {
    put(a!, top); put(b!, top); put(c!, top)
    put(c!, bottom); put(b!, bottom); put(a!, bottom)
  }
  for (const [a, b] of rim) {
    put(a!, bottom); put(b!, bottom); put(b!, top)
    put(a!, bottom); put(b!, top); put(a!, top)
  }

  const solid = new BufferGeometry()
  solid.setAttribute('position', new BufferAttribute(out, 3))
  solid.computeVertexNormals()
  return solid
}
