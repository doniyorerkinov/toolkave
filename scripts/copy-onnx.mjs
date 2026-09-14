/**
 * Put the WebAssembly runtime where the browser can fetch it.
 *
 * onnxruntime loads its .wasm at run time from a URL rather than through the
 * bundler, so the file has to exist as a static asset. Copying it from
 * node_modules at build time keeps a 14 MB binary out of the repository and
 * keeps it in step with the installed version — a stale copy here would be a
 * version mismatch that only shows up as a crash in someone's browser.
 */
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')
const FROM = path.join(ROOT, 'node_modules/onnxruntime-web/dist')
const TO = path.join(ROOT, 'public/onnx')

const FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']

await mkdir(TO, { recursive: true })
for (const name of FILES) {
  await copyFile(path.join(FROM, name), path.join(TO, name))
  console.log(`onnx: ${name}`)
}
