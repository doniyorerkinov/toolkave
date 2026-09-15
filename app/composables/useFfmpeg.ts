/**
 * ffmpeg, in the browser, on demand.
 *
 * The core is 31 MB. That is the largest thing this site ever asks a browser
 * to fetch, so nothing here runs until somebody picks a file: the import, the
 * download and the instantiation all happen inside `run`, never at page load.
 * Core Web Vitals across the site sit at a 356 ms P75 LCP, and a 31 MB fetch
 * on page load would destroy that on exactly the pages worth ranking.
 *
 * Single-threaded core, deliberately. The multithreaded build is two to four
 * times faster and needs SharedArrayBuffer, which needs COOP and COEP
 * response headers, which break third-party embeds including ads. Slower
 * encodes with a working site beats fast encodes with no revenue.
 *
 * Loaded once per tab and kept: a second conversion should not re-download
 * 31 MB, and the browser cache makes the second *visit* free as well.
 */
import { ref, shallowRef } from 'vue'

type FFmpegInstance = {
  loaded: boolean
  load: (config: { coreURL: string; wasmURL: string }) => Promise<void>
  writeFile: (name: string, data: Uint8Array) => Promise<void>
  readFile: (name: string) => Promise<Uint8Array | string>
  deleteFile: (name: string) => Promise<void>
  exec: (args: string[]) => Promise<number>
  on: (event: string, handler: (payload: never) => void) => void
  off: (event: string, handler: (payload: never) => void) => void
  terminate: () => void
}

/** Unpacked once per tab; the blob outlives every tool the visitor opens. */
let wasmUrl: string | null = null

const GZIP_MAGIC = [0x1f, 0x8b]
const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d]

const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((byte, i) => bytes[i] === byte)

/**
 * Fetch the core and hand back a URL ffmpeg can load, compressed or not.
 *
 * The file is stored gzipped, but whether it arrives that way is not ours to
 * decide: a server that recognises the `.gz` extension sets
 * `Content-Encoding: gzip` and the browser silently unpacks it before we see a
 * byte, while one that treats it as an opaque download does not. Nitro's dev
 * server does the first, so decompressing unconditionally worked in neither
 * place reliably. Sniffing the first two bytes settles it wherever this runs.
 */
async function unpackWasm(): Promise<string> {
  if (wasmUrl) return wasmUrl

  const response = await fetch('/ffmpeg/ffmpeg-core.wasm.gz')
  if (!response.ok) throw new Error('FFMPEG_CORE_UNAVAILABLE')

  let buffer = await response.arrayBuffer()
  const head = new Uint8Array(buffer.slice(0, 4))

  if (startsWith(head, GZIP_MAGIC)) {
    // Still compressed, so this browser did not do it for us.
    if (typeof DecompressionStream !== 'function') throw new Error('FFMPEG_CORE_UNAVAILABLE')
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
    buffer = await new Response(stream).arrayBuffer()
  } else if (!startsWith(head, WASM_MAGIC)) {
    // Neither gzip nor wasm: something served us a page, not the core.
    throw new Error('FFMPEG_CORE_UNAVAILABLE')
  }

  wasmUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/wasm' }))
  return wasmUrl
}

/** One instance per tab, shared by every tool the visitor opens. */
let instance: FFmpegInstance | null = null
let loading: Promise<FFmpegInstance> | null = null

async function boot(onProgress?: (fraction: number) => void): Promise<FFmpegInstance> {
  if (instance?.loaded) return instance
  if (loading) return await loading

  loading = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const ffmpeg = new FFmpeg() as unknown as FFmpegInstance

    // Self-hosted rather than from a CDN: served from our own origin with a
    // year-long immutable cache, and nothing about a tool whose whole claim is
    // that files stay on your device should depend on a third party.
    //
    // Both go in as blob URLs. ffmpeg runs its core inside a worker it creates
    // from a blob, and a blob worker has an opaque origin, so a path like
    // `/ffmpeg/ffmpeg-core.js` has nothing to resolve against and the import
    // fails. The wasm is a blob for a second reason as well: it is stored
    // gzipped, because Cloudflare refuses a static asset over 25 MiB and this
    // one is 30.7.
    const { toBlobURL } = await import('@ffmpeg/util')
    await ffmpeg.load({
      coreURL: await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
      wasmURL: await unpackWasm()
    })
    instance = ffmpeg
    onProgress?.(1)
    return ffmpeg
  })()

  try {
    return await loading
  } finally {
    loading = null
  }
}

export interface MediaJob {
  /** The input file's bytes and a name ffmpeg can key on; the extension matters. */
  input: { name: string; data: Uint8Array }
  /** Output file name. Its extension chooses the container. */
  output: string
  /** Arguments between input and output, e.g. ['-crf', '28']. */
  args: string[]
  /** 0–1 as the encode proceeds, where ffmpeg can tell. */
  onProgress?: (fraction: number) => void
}

export function useFfmpeg() {
  /** 'idle' | 'loading' the 31 MB core | 'running' the encode. */
  const phase = ref<'idle' | 'loading' | 'running'>('idle')
  const progress = ref(0)
  const ready = shallowRef(Boolean(instance?.loaded))

  /**
   * One conversion, start to finish.
   *
   * Files are written into ffmpeg's in-memory filesystem, converted, read back
   * and deleted. Deleting matters: the FS persists for the life of the tab, so
   * a visitor converting five videos without it would hold all five plus their
   * outputs in memory at once.
   */
  async function run(job: MediaJob): Promise<Uint8Array> {
    phase.value = instance?.loaded ? 'running' : 'loading'
    progress.value = 0

    const ffmpeg = await boot()
    ready.value = true
    phase.value = 'running'

    const onProgress = (payload: { progress: number }) => {
      // ffmpeg reports beyond 1 on some inputs; clamping keeps a progress bar
      // from running off the end of its track.
      const fraction = Math.max(0, Math.min(1, payload.progress))
      progress.value = fraction
      job.onProgress?.(fraction)
    }
    ffmpeg.on('progress', onProgress as (payload: never) => void)

    try {
      await ffmpeg.writeFile(job.input.name, job.input.data)
      const code = await ffmpeg.exec(['-i', job.input.name, ...job.args, job.output])
      if (code !== 0) throw new Error('FFMPEG_FAILED')

      const out = await ffmpeg.readFile(job.output)
      if (typeof out === 'string') throw new Error('FFMPEG_FAILED')
      if (!out.byteLength) throw new Error('FFMPEG_EMPTY')
      return out
    } finally {
      ffmpeg.off('progress', onProgress as (payload: never) => void)
      // Best effort: a file that was never written cannot be deleted, and a
      // failed cleanup must not replace the real error with its own.
      await ffmpeg.deleteFile(job.input.name).catch(() => {})
      await ffmpeg.deleteFile(job.output).catch(() => {})
      phase.value = 'idle'
      progress.value = 0
    }
  }

  return { run, phase, progress, ready }
}

/** Seconds as ffmpeg wants them on the command line. */
export function timecode(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const h = String(Math.floor(whole / 3600)).padStart(2, '0')
  const m = String(Math.floor((whole % 3600) / 60)).padStart(2, '0')
  const s = String(whole % 60).padStart(2, '0')
  const ms = String(Math.round((seconds - whole) * 1000)).padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}
