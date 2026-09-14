/**
 * Separating a subject from its background, in the browser.
 *
 * The whole thing is a small neural network — u2netp, 4.4 MB — run through
 * onnxruntime's WebAssembly build. That is about 7 MB of one-time download
 * between them, which is the entire reason this can be offered at all
 * without a server: the picture never leaves the device, and the second
 * visit costs nothing because both files are cached.
 */

/** Where the model looks at the picture. Everything is resized to this. */
const SIZE = 320
const MODEL_URL = '/models/u2netp.onnx'
/** ImageNet normalisation, the values u2net was trained against. */
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

/**
 * Where the network's confidence is taken as certain.
 *
 * Stretching the output to its own range leaves the subject around 0.85
 * rather than 1, which is invisible in a greyscale mask and glaring the
 * moment it becomes opacity — the whole person comes out a ghost with the
 * background showing through their face. Anything above HIGH is solid,
 * anything below LOW is gone, and the band between them is the real edge,
 * kept soft because that band is where hair lives.
 */
const LOW = 0.15
const HIGH = 0.75

export interface CutoutProgress {
  /** 'runtime' and 'model' are downloads; 'running' is the network itself. */
  stage: 'runtime' | 'model' | 'running'
  /** 0–1 where the total is known, otherwise null. */
  fraction: number | null
  loadedBytes?: number
  totalBytes?: number
}

type Ort = typeof import('onnxruntime-web/wasm')
let ortPromise: Promise<Ort> | null = null
let sessionPromise: Promise<InferenceSessionLike> | null = null

interface InferenceSessionLike {
  inputNames: readonly string[]
  outputNames: readonly string[]
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>>
}

/** True once the model is in memory, so a second run starts instantly. */
export const cutoutReady = ref(false)

async function loadOrt(): Promise<Ort> {
  if (!ortPromise) {
    // The plain wasm entry, not the default bundle: the default pulls the
    // WebGPU-capable build, which is 26 MB of WebAssembly against 13 MB for
    // this one, to run a model small enough that the CPU is not the problem.
    ortPromise = import('onnxruntime-web/wasm').then(module => {
      const ort = (module as unknown as { default?: Ort }).default ?? module
      ort.env.wasm.wasmPaths = '/onnx/'
      // Threads need cross-origin isolation, which the site does not set;
      // one thread is enough for a 320×320 model and avoids a silent fallback.
      ort.env.wasm.numThreads = 1
      return ort
    })
  }
  return await ortPromise
}

const CACHE = 'toolkave-models-v1'

/**
 * Whether the model is already on this device.
 *
 * The answer changes what the page should say. On a first visit a few
 * megabytes are about to be fetched and pretending otherwise is rude; on
 * every visit after that the wait is under a second and a progress bar
 * claiming a download would be a lie.
 */
export async function cutoutCached(): Promise<boolean> {
  if (cutoutReady.value) return true
  try {
    const cache = await caches.open(CACHE)
    return !!(await cache.match(MODEL_URL))
  } catch {
    // Private windows and locked-down browsers refuse the Cache API; the
    // model still loads, it just is not kept.
    return false
  }
}

/** Fetch with progress, falling back to a plain read when there is no length. */
async function fetchWithProgress(
  url: string,
  stage: CutoutProgress['stage'],
  onProgress?: (progress: CutoutProgress) => void
): Promise<ArrayBuffer> {
  let cache: Cache | null = null
  try {
    cache = await caches.open(CACHE)
    const hit = await cache.match(url)
    if (hit) return await hit.arrayBuffer()
  } catch {
    cache = null
  }

  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  // Kept before the body is drained; a Response can only be read once.
  void cache?.put(url, response.clone()).catch(() => {})

  const total = Number(response.headers.get('content-length') ?? 0)
  if (!response.body || !total) return await response.arrayBuffer()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress?.({ stage, fraction: loaded / total, loadedBytes: loaded, totalBytes: total })
  }
  const out = new Uint8Array(loaded)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out.buffer
}

/**
 * Load the runtime and the model, reporting progress.
 *
 * Safe to call early and often: the work happens once and every later caller
 * waits on the same promise.
 */
export async function prepareCutout(onProgress?: (progress: CutoutProgress) => void) {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await loadOrt()
      const model = await fetchWithProgress(MODEL_URL, 'model', onProgress)
      const session = await ort.InferenceSession.create(model, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      })
      cutoutReady.value = true
      return session as unknown as InferenceSessionLike
    })()
  }
  return await sessionPromise
}

export interface CutoutResult {
  /** The network's confidence per pixel, 0–1, at the model's own 320×320. */
  confidence: Float32Array
  /** Milliseconds the network itself took. */
  ms: number
}

/**
 * Turn confidence into opacity at the picture's size.
 *
 * Separated from the network on purpose: moving the edge is then a redraw
 * rather than another two seconds of inference, which is what makes a
 * "tighter / looser" control feel like a control rather than a re-run.
 */
export function maskFromConfidence(
  confidence: Float32Array,
  width: number,
  height: number,
  low = LOW,
  high = HIGH
): Uint8ClampedArray {
  const small = document.createElement('canvas')
  small.width = SIZE
  small.height = SIZE
  const smallContext = small.getContext('2d')
  if (!smallContext) throw new Error('canvas unavailable')
  const image = smallContext.createImageData(SIZE, SIZE)
  const span = Math.max(0.01, high - low)
  for (let i = 0; i < SIZE * SIZE; i++) {
    const value = Math.round(Math.max(0, Math.min(1, (confidence[i]! - low) / span)) * 255)
    image.data[i * 4] = value
    image.data[i * 4 + 1] = value
    image.data[i * 4 + 2] = value
    image.data[i * 4 + 3] = 255
  }
  smallContext.putImageData(image, 0, 0)

  // Back up to the picture's size; the browser's smoothing is what turns the
  // 320-pixel edge into something that does not look like stairs.
  const full = document.createElement('canvas')
  full.width = width
  full.height = height
  const fullContext = full.getContext('2d', { willReadFrequently: true })
  if (!fullContext) throw new Error('canvas unavailable')
  fullContext.imageSmoothingQuality = 'high'
  fullContext.drawImage(small, 0, 0, width, height)
  const scaled = fullContext.getImageData(0, 0, width, height).data

  const mask = new Uint8ClampedArray(width * height)
  for (let i = 0; i < mask.length; i++) mask[i] = scaled[i * 4]!
  return mask
}

/**
 * Work out which pixels are the subject.
 *
 * Returns confidence rather than a finished picture so the caller can decide
 * both where the edge falls and what goes behind it.
 */
export async function cutoutConfidence(
  bitmap: ImageBitmap,
  onProgress?: (progress: CutoutProgress) => void
): Promise<CutoutResult> {
  const session = await prepareCutout(onProgress)
  onProgress?.({ stage: 'running', fraction: null })
  const ort = await loadOrt()

  const small = document.createElement('canvas')
  small.width = SIZE
  small.height = SIZE
  const context = small.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('canvas unavailable')
  context.drawImage(bitmap, 0, 0, SIZE, SIZE)
  const pixels = context.getImageData(0, 0, SIZE, SIZE).data

  // Channel-first, normalised the way the model was trained.
  const plane = SIZE * SIZE
  const input = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    input[i] = (pixels[i * 4]! / 255 - MEAN[0]!) / STD[0]!
    input[plane + i] = (pixels[i * 4 + 1]! / 255 - MEAN[1]!) / STD[1]!
    input[plane * 2 + i] = (pixels[i * 4 + 2]! / 255 - MEAN[2]!) / STD[2]!
  }

  const started = performance.now()
  const outputs = await session.run({
    [session.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE])
  })
  const ms = performance.now() - started
  const raw = outputs[session.outputNames[0]!]!.data

  // The network's output is not bounded, so it is stretched to 0–1 against
  // its own range before it means anything.
  let low = Infinity
  let high = -Infinity
  for (let i = 0; i < plane; i++) {
    const value = raw[i]!
    if (value < low) low = value
    if (value > high) high = value
  }
  const span = high - low || 1

  const confidence = new Float32Array(plane)
  for (let i = 0; i < plane; i++) confidence[i] = (raw[i]! - low) / span

  return { confidence, ms }
}

/** Paint a picture through its mask, with whatever is chosen behind it. */
export function applyMask(
  bitmap: ImageBitmap,
  mask: Uint8ClampedArray,
  backdrop: { kind: 'transparent' } | { kind: 'colour'; colour: string } | { kind: 'blur' }
): HTMLCanvasElement {
  const cut = document.createElement('canvas')
  cut.width = bitmap.width
  cut.height = bitmap.height
  const cutContext = cut.getContext('2d', { willReadFrequently: true })
  if (!cutContext) throw new Error('canvas unavailable')
  cutContext.drawImage(bitmap, 0, 0)
  const image = cutContext.getImageData(0, 0, bitmap.width, bitmap.height)
  for (let i = 0; i < mask.length; i++) image.data[i * 4 + 3] = mask[i]!
  cutContext.putImageData(image, 0, 0)

  if (backdrop.kind === 'transparent') return cut

  const out = document.createElement('canvas')
  out.width = bitmap.width
  out.height = bitmap.height
  const context = out.getContext('2d')
  if (!context) throw new Error('canvas unavailable')
  if (backdrop.kind === 'colour') {
    context.fillStyle = backdrop.colour
    context.fillRect(0, 0, out.width, out.height)
  } else {
    // The subject's own surroundings, out of focus — the portrait-mode look,
    // and the one backdrop that is guaranteed to suit the light in the photo.
    context.filter = `blur(${Math.max(6, Math.round(Math.min(out.width, out.height) / 45))}px)`
    context.drawImage(bitmap, 0, 0)
    context.filter = 'none'
  }
  context.drawImage(cut, 0, 0)
  return out
}
