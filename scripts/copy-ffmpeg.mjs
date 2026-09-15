/**
 * Put the ffmpeg runtime where the browser can fetch it.
 *
 * ffmpeg.wasm loads its core from a URL at run time rather than through the
 * bundler, so the files have to exist as static assets. Copied from
 * node_modules at build time for the same reasons as the onnx runtime: a 31 MB
 * binary stays out of the repository, and it stays in step with the installed
 * version — a stale copy here is a version mismatch that only appears as a
 * crash in somebody's browser.
 *
 * This is the single-threaded core, deliberately. The multithreaded one is
 * faster but needs SharedArrayBuffer, which needs COOP and COEP headers, which
 * break every third-party embed on the site including ads. That trade was
 * settled in ORDER.md before any of this was written.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const FROM = path.join(ROOT, 'node_modules/@ffmpeg/core/dist/umd')
const TO = path.join(ROOT, 'public/ffmpeg')

await mkdir(TO, { recursive: true })

await copyFile(path.join(FROM, 'ffmpeg-core.js'), path.join(TO, 'ffmpeg-core.js'))
console.log('ffmpeg: ffmpeg-core.js')

/**
 * The wasm ships gzipped, and not as an optimisation.
 *
 * Cloudflare Workers refuse a static asset over 25 MiB and this one is 30.7.
 * Gzipped it is 9.7, which is both under the limit and three times less to
 * download; the browser puts it back together with DecompressionStream before
 * handing it to ffmpeg. The alternative was loading it from someone else's CDN,
 * which for a site whose whole claim is that files stay on your device would be
 * the wrong trade.
 */
const wasm = await readFile(path.join(FROM, 'ffmpeg-core.wasm'))
const packed = gzipSync(wasm, { level: 9 })
await writeFile(path.join(TO, 'ffmpeg-core.wasm.gz'), packed)
console.log(
  `ffmpeg: ffmpeg-core.wasm.gz (${(wasm.length / 1048576).toFixed(1)} MiB -> ${(packed.length / 1048576).toFixed(1)} MiB)`
)
