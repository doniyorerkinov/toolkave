/**
 * Three.js, loaded only by the page that needs it.
 *
 * The library and its loaders are a few hundred kilobytes — nothing next to
 * ffmpeg, but far too much to put in the bundle every page downloads for the
 * sake of one tool. Everything here is behind a dynamic import, so the cost
 * lands on the person who asked for a 3D model and nobody else.
 */
import type { Layer, Part } from '~~/shared/svg3d'
import { outlineOf } from '~~/shared/svg3d'

export type ModelFormat = 'stl' | 'glb' | 'obj'

export const FORMATS: Record<ModelFormat, { mime: string; extension: string }> = {
  stl: { mime: 'model/stl', extension: 'stl' },
  glb: { mime: 'model/gltf-binary', extension: 'glb' },
  obj: { mime: 'text/plain', extension: 'obj' }
}

export interface SvgScene {
  layers: Layer[]
  /** What the drawing is made of, so the tool can say so rather than guess. */
  hasFill: boolean
  hasStroke: boolean
}

let three: typeof import('three') | null = null

export async function loadThree() {
  if (!three) three = await import('three')
  return three
}

/**
 * The drawing, read as outlines.
 *
 * Fills become outlines to extrude. Strokes are a separate problem: a stroked
 * path has no inside, so there is nothing to fill — three.js can widen the
 * line into a ribbon of triangles, which is flat, and `thicken` turns that
 * into a solid later. Most icon sets draw with strokes, so leaving them out
 * would mean the tool failing on the files people are most likely to try.
 */
export async function parseSvg(text: string, options: { strokes: boolean; divisions: number }): Promise<SvgScene> {
  const T = await loadThree()
  const { SVGLoader } = await import('three/addons/loaders/SVGLoader.js')

  const parsed = new SVGLoader().parse(text)
  const byColour = new Map<string, Layer>()
  let hasFill = false
  let hasStroke = false

  const layerFor = (colour: string): Layer => {
    let layer = byColour.get(colour)
    if (!layer) {
      layer = { colour, outlines: [], meshes: [] }
      byColour.set(colour, layer)
    }
    return layer
  }

  for (const path of parsed.paths) {
    const style = path.userData?.style ?? {}
    const filled = style.fill && style.fill !== 'none' && style.fillOpacity !== 0
    const stroked = style.stroke && style.stroke !== 'none' && style.strokeOpacity !== 0

    if (filled) {
      hasFill = true
      const colour = `#${path.color.getHexString()}`
      for (const shape of path.toShapes(true)) {
        const outline = outlineOf(shape, options.divisions)
        if (outline) layerFor(colour).outlines.push(outline)
      }
    }

    if (stroked) {
      hasStroke = true
      if (options.strokes) {
        const colour = `#${new T.Color().setStyle(style.stroke).getHexString()}`
        for (const subPath of path.subPaths) {
          const points = subPath.getPoints(options.divisions)
          if (points.length < 2) continue
          const ribbon = SVGLoader.pointsToStroke(points, style, options.divisions)
          if (!ribbon) continue
          layerFor(colour).meshes!.push(flatten(ribbon.getAttribute('position')))
          ribbon.dispose()
        }
      }
    }
  }

  return {
    layers: [...byColour.values()].filter(l => l.outlines.length || l.meshes!.length),
    hasFill,
    hasStroke
  }
}

/** A stroke ribbon as XY pairs, with the same Y flip every outline gets. */
function flatten(position: { count: number; getX(i: number): number; getY(i: number): number }): Float32Array {
  const xy = new Float32Array(position.count * 2)
  for (let i = 0; i < position.count; i++) {
    xy[i * 2] = position.getX(i)
    xy[i * 2 + 1] = -position.getY(i)
  }
  return xy
}

/**
 * The parts as a scene object, coloured, for both the preview and the export.
 *
 * One mesh per colour rather than one per shape: a logo can be hundreds of
 * separate outlines, and drawing each one on its own turns a smooth preview
 * into a slideshow. It also means a multi-coloured drawing arrives in Blender
 * with its colours still separable instead of fused into one grey lump.
 */
export async function buildGroup(parts: Part[]) {
  const T = await loadThree()
  const group = new T.Group()

  for (const part of parts) {
    const material = new T.MeshStandardMaterial({
      color: new T.Color(part.colour),
      roughness: 0.45,
      metalness: 0.05
    })
    const mesh = new T.Mesh(part.geometry, material)
    // OBJ writes the object name into the file, and an unnamed mesh arrives
    // in Blender's outliner as a blank entry.
    mesh.name = part.colour.replace('#', 'part-')
    group.add(mesh)
  }

  return group
}

/**
 * The model as a file.
 *
 * The three formats disagree about the world, so each is corrected on the way
 * out rather than left for the person who opens it. STL and OBJ are what
 * slicers read, they have no units, and every slicer on earth assumes
 * millimetres and Z upwards — which is exactly how the model was built, so
 * they go out untouched. glTF is the opposite: it is metres, Y upwards, and a
 * 60 mm badge exported without correcting that arrives sixty metres tall and
 * lying on its face.
 */
export async function exportModel(parts: Part[], format: ModelFormat): Promise<Uint8Array> {
  const T = await loadThree()
  const group = await buildGroup(parts)

  if (format === 'glb') {
    group.rotation.x = -Math.PI / 2
    group.scale.setScalar(0.001)
  }
  group.updateMatrixWorld(true)

  try {
    if (format === 'stl') {
      const { STLExporter } = await import('three/addons/exporters/STLExporter.js')
      // Documented as returning an ArrayBuffer; actually returns a DataView.
      // `new Uint8Array(aDataView)` does not throw, it just produces nothing,
      // so trusting the documentation here writes a zero-byte STL.
      const output = new STLExporter().parse(group, { binary: true }) as unknown as DataView
      return new Uint8Array(output.buffer, output.byteOffset, output.byteLength)
    }

    if (format === 'obj') {
      const { OBJExporter } = await import('three/addons/exporters/OBJExporter.js')
      return new TextEncoder().encode(new OBJExporter().parse(group))
    }

    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
    const glb = await new GLTFExporter().parseAsync(group, { binary: true })
    return new Uint8Array(glb as ArrayBuffer)
  } finally {
    group.traverse(child => {
      const mesh = child as InstanceType<typeof T.Mesh>
      if (mesh.material) (mesh.material as { dispose(): void }).dispose()
    })
    group.clear()
  }
}
