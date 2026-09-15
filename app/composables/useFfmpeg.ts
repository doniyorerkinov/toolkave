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
  listDir: (path: string) => Promise<{ name: string; isDir: boolean }[]>
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
    // The core must be the ESM build. @ffmpeg/ffmpeg starts its worker with
    // `type: "module"` unconditionally, a module worker has no
    // `importScripts`, so the worker falls through to `await import(coreURL)`
    // and takes `.default` from it. The UMD build has no default export and
    // the worker throws "failed to import ffmpeg-core.js" — which is what it
    // did here, on every browser, until `scripts/copy-ffmpeg.mjs` was pointed
    // at `dist/esm`. Nothing about that failure is visible in the arguments or
    // the UI, so it is worth knowing where it comes from.
    //
    // Both go in as blob URLs. The wasm has to: it is stored gzipped because
    // Cloudflare refuses a static asset over 25 MiB and this one is 30.7, so
    // what ffmpeg gets handed is bytes this tab decompressed, not a URL. The
    // core JS follows the same path for symmetry, and because the pairing is
    // what the `mainScriptUrlOrBlob` hack in the core expects.
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
  /**
   * The input file's bytes and a name ffmpeg can key on; the extension matters.
   * Kept singular for the tools that only ever take one file.
   */
  input?: { name: string; data: Uint8Array }
  /** Several inputs, in order. They become `-i a -i b` and the filter graph indexes them that way. */
  inputs?: { name: string; data: Uint8Array }[]
  /**
   * Options placed before `-i`, which ffmpeg applies to reading the input
   * rather than writing the output - `-t` here bounds how much is decoded.
   */
  beforeInput?: string[]
  /**
   * Seconds of output this job is expected to produce, when that is less than
   * the file. Progress is measured against it instead of the input duration,
   * so a bar for "the first minute of a two-hour video" reaches 100%.
   */
  span?: number
  /** Output file name. Its extension chooses the container. */
  output: string
  /** Arguments between input and output, e.g. ['-crf', '28']. */
  args: string[]
  /** 0–1 as the encode proceeds, where ffmpeg can tell. */
  onProgress?: (fraction: number) => void
}

const files = (job: MediaJob) => job.inputs ?? (job.input ? [job.input] : [])

export function useFfmpeg() {
  /** 'idle' | 'loading' the 31 MB core | 'running' the encode. */
  const phase = ref<'idle' | 'loading' | 'running'>('idle')
  const progress = ref(0)
  const ready = shallowRef(Boolean(instance?.loaded))

  /**
   * Everything the three public calls have in common: get the core up, write
   * the inputs, run, and clean the filesystem out again whatever happened.
   *
   * Deleting matters. The FS persists for the life of the tab, so a visitor
   * converting five videos without it would hold all five plus their outputs
   * in memory at once — and on a phone that is the difference between a slow
   * tool and a killed tab.
   */
  async function withFfmpeg<T>(
    job: MediaJob,
    collect: (ffmpeg: FFmpegInstance) => Promise<T>,
    extraArgs: string[] = []
  ): Promise<T> {
    phase.value = instance?.loaded ? 'running' : 'loading'
    progress.value = 0

    const ffmpeg = await boot()
    ready.value = true
    phase.value = 'running'

    const onProgress = (payload: { progress: number; time?: number }) => {
      // ffmpeg reports beyond 1 on some inputs; clamping keeps a progress bar
      // from running off the end of its track. `time` is microseconds of output.
      const raw = job.span && typeof payload.time === 'number' ? payload.time / 1e6 / job.span : payload.progress
      const fraction = Math.max(0, Math.min(1, raw))
      progress.value = fraction
      job.onProgress?.(fraction)
    }
    ffmpeg.on('progress', onProgress as (payload: never) => void)

    // The tail of ffmpeg's own output, kept for the console when a run fails.
    // The page can only say "something went wrong"; this is what went wrong.
    const log: string[] = []
    const onLog = (payload: { message: string }) => {
      log.push(payload.message)
      if (log.length > 80) log.shift()
    }
    ffmpeg.on('log', onLog as (payload: never) => void)

    const written = files(job)
    const command = [...(job.beforeInput ?? []), ...written.flatMap(file => ['-i', file.name]), ...job.args, ...extraArgs]
    try {
      // `.slice()` is not defensive tidiness, it is required. writeFile
      // *transfers* the buffer into the worker, which detaches the caller's
      // copy - so the second press of the button on the same file would fail
      // with "An ArrayBuffer is detached and could not be cloned", and the
      // file would have to be added again. Every media tool depends on this.
      for (const file of written) await ffmpeg.writeFile(file.name, file.data.slice())
      const code = await ffmpeg.exec(command)
      if (code !== 0) throw new Error('FFMPEG_FAILED')
      return await collect(ffmpeg)
    } catch (error) {
      console.warn('[ffmpeg] failed:', error instanceof Error ? error.message : error, '\ncommand:', command.join(' '), '\n' + log.slice(-40).join('\n'))
      // Our own sentinels mean ffmpeg ran and disagreed; anything else came up
      // from the worker - a wasm trap such as "memory access out of bounds" -
      // and the core is corrupt from here on. Keeping it would fail every
      // later run in this tab for no visible reason, so it is thrown away and
      // the next job boots a fresh one.
      if (!(error instanceof Error && error.message.startsWith('FFMPEG_'))) {
        try { ffmpeg.terminate() } catch { /* already gone */ }
        instance = null
        ready.value = false
        throw new Error('FFMPEG_CRASHED')
      }
      throw error
    } finally {
      ffmpeg.off('log', onLog as (payload: never) => void)
      ffmpeg.off('progress', onProgress as (payload: never) => void)
      // Best effort: a file that was never written cannot be deleted, and a
      // failed cleanup must not replace the real error with its own.
      for (const file of written) await ffmpeg.deleteFile(file.name).catch(() => {})
      phase.value = 'idle'
      progress.value = 0
    }
  }

  /** One conversion, start to finish, producing one file. */
  async function run(job: MediaJob): Promise<Uint8Array> {
    return await withFfmpeg(
      job,
      async ffmpeg => {
        try {
          const out = await ffmpeg.readFile(job.output)
          if (typeof out === 'string') throw new Error('FFMPEG_FAILED')
          if (!out.byteLength) throw new Error('FFMPEG_EMPTY')
          return out
        } finally {
          await ffmpeg.deleteFile(job.output).catch(() => {})
        }
      },
      [job.output]
    )
  }

  /**
   * One conversion producing many files, for the tools that split something up.
   *
   * `job.output` is an ffmpeg output pattern like `frame-%04d.png`; what comes
   * back is every file the run actually created, in name order. The pattern
   * cannot be turned back into a list of names — only ffmpeg knows how many
   * frames it wrote — so the directory is read afterwards and matched on the
   * fixed part of the pattern.
   */
  async function runMany(job: MediaJob): Promise<{ name: string; data: Uint8Array }[]> {
    const stem = job.output.split('%')[0] ?? job.output
    return await withFfmpeg(
      job,
      async ffmpeg => {
        const entries = await ffmpeg.listDir('/')
        const names = entries
          .filter(entry => !entry.isDir && entry.name.startsWith(stem))
          .map(entry => entry.name)
          .sort()
        const out: { name: string; data: Uint8Array }[] = []
        try {
          for (const name of names) {
            const data = await ffmpeg.readFile(name)
            if (typeof data !== 'string' && data.byteLength) out.push({ name, data })
          }
        } finally {
          for (const name of names) await ffmpeg.deleteFile(name).catch(() => {})
        }
        if (!out.length) {
          console.warn('[ffmpeg] no output matched', stem, '- directory holds:', entries.map(entry => entry.name).join(', '))
          throw new Error('FFMPEG_EMPTY')
        }
        return out
      },
      [job.output]
    )
  }

  /**
   * What ffmpeg can tell us about a file, without converting it.
   *
   * `ffmpeg -i file` with no output prints the stream table and then exits
   * non-zero complaining that no output was given — that non-zero is the
   * normal, successful outcome here, so this cannot go through `run`. The
   * information arrives as log lines rather than a return value, so they are
   * collected as they come.
   */
  async function probe(input: { name: string; data: Uint8Array }): Promise<string[]> {
    phase.value = instance?.loaded ? 'running' : 'loading'
    const ffmpeg = await boot()
    ready.value = true
    phase.value = 'running'

    const lines: string[] = []
    const onLog = (payload: { message: string }) => lines.push(payload.message)
    ffmpeg.on('log', onLog as (payload: never) => void)
    try {
      // Copied for the same reason as in `withFfmpeg`: probing a file must not
      // consume it, or the conversion that follows has nothing to work on.
      await ffmpeg.writeFile(input.name, input.data.slice())
      await ffmpeg.exec(['-hide_banner', '-i', input.name])
      return lines
    } finally {
      ffmpeg.off('log', onLog as (payload: never) => void)
      await ffmpeg.deleteFile(input.name).catch(() => {})
      phase.value = 'idle'
    }
  }

  return { run, runMany, probe, phase, progress, ready }
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
