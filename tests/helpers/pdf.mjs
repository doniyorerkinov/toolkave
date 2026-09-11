/**
 * Shared harness for the PDF tests.
 *
 * The composables are imported straight from `app/` (Node strips the types),
 * so what runs here is the code the site ships, not a copy. Output PDFs are
 * rendered with pdf.js on an `@napi-rs/canvas` surface and asserted on
 * pixels: "the page number is at the bottom centre" is checked by looking,
 * not by re-deriving the coordinates the code under test used.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..')
const app = relative => import(pathToFileURL(path.join(ROOT, 'app', relative)).href)

export const pdf = await app('composables/usePdf.ts')
// In the browser the Unicode font is fetched from the site; here it is read from disk.
pdf.setPdfFontSource(async () => {
  const bytes = fs.readFileSync(path.join(ROOT, 'public/fonts/roboto-regular.ttf'))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
})
export const image = await app('composables/useImage.ts')
export const lib = await import('@cantoo/pdf-lib')
export const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

/** What the file store hands to every PDF function. */
export const held = (data, name = 'file.pdf') => ({ id: name, name, size: data.byteLength, type: 'application/pdf', data })

export const ROTATIONS = [0, 90, 180, 270]

/** Blank portrait pages, one per /Rotate value — a sideways scan as pdf-lib sees it. */
export async function rotatedPages({ width = 400, height = 600, mark = false } = {}) {
  const doc = await lib.PDFDocument.create()
  for (const angle of ROTATIONS) {
    const page = doc.addPage([width, height])
    page.setRotation(lib.degrees(angle))
    // A page-space marker in the top-left, so a rendered page reveals its orientation.
    if (mark) page.drawRectangle({ x: 20, y: height - 120, width: 100, height: 100, color: lib.rgb(0, 0, 0) })
  }
  return await doc.save()
}

/** A JPEG worth compressing: noisy enough not to collapse to a few kilobytes. */
export function noisyJpeg(width = 1200, height = 900, quality = 95) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgb(${Math.floor(rand() * 255)},${Math.floor(rand() * 255)},${Math.floor(rand() * 255)})`
    ctx.fillRect(rand() * width, rand() * height, 4 + rand() * 60, 4 + rand() * 60)
  }
  return new Uint8Array(canvas.toBuffer('image/jpeg', quality))
}

/** Solid opaque rectangle — the least ambiguous thing to place and look for. */
export function solidPng(width = 240, height = 90, color = '#c00') {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  return new Uint8Array(canvas.toBuffer('image/png'))
}

/** Render every page the way a viewer shows it (so /Rotate is applied). */
export async function render(bytes, scale = 1) {
  const task = pdfjs.getDocument({ data: bytes.slice() })
  const doc = await task.promise
  const pages = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height))
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise
    pages.push({ canvas, rotate: page.rotate, width: canvas.width, height: canvas.height })
  }
  await task.destroy()
  return pages
}

/** Text of every page, joined — for "the text layer survived" assertions. */
export async function pageTexts(bytes) {
  const task = pdfjs.getDocument({ data: bytes.slice() })
  const doc = await task.promise
  const out = []
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    out.push(content.items.map(item => item.str ?? '').join(''))
  }
  await task.destroy()
  return out
}

const isInk = (data, i) => data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235

/** Fraction of non-white pixels inside a canvas-space box [x0, y0, x1, y1]. */
export function inkFraction(canvas, [x0, y0, x1, y1]) {
  const w = Math.max(1, Math.round(x1 - x0))
  const h = Math.max(1, Math.round(y1 - y0))
  const data = canvas.getContext('2d').getImageData(Math.round(x0), Math.round(y0), w, h).data
  let ink = 0
  for (let i = 0; i < data.length; i += 4) if (isInk(data, i)) ink++
  return ink / (w * h)
}

/** Fraction of non-white pixels that fall outside every given box. */
export function inkOutside(canvas, boxes) {
  const { width, height } = canvas
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
  let stray = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (!isInk(data, i)) continue
      if (!boxes.some(([x0, y0, x1, y1]) => x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1)) stray++
    }
  }
  return stray / (width * height)
}

/** Contact sheet, written only on request, so a failing placement can be looked at. */
export function artifact(name, pages) {
  if (!process.env.TOOLKAVE_TEST_ARTIFACTS) return
  const gap = 12
  const width = pages.reduce((sum, p) => sum + p.canvas.width + gap, gap)
  const height = Math.max(...pages.map(p => p.canvas.height)) + gap * 2
  const sheet = createCanvas(width, height)
  const ctx = sheet.getContext('2d')
  ctx.fillStyle = '#cbd5e1'
  ctx.fillRect(0, 0, width, height)
  let x = gap
  for (const p of pages) { ctx.drawImage(p.canvas, x, gap); x += p.canvas.width + gap }
  const dir = path.join(ROOT, 'tests', '.artifacts')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${name}.png`), sheet.toBuffer('image/png'))
}

/**
 * The two browser globals the image code paths reach for, backed by the same
 * canvas library. Returns an uninstaller: pdf.js must not see a fake
 * `document` while it renders, so tests install this around the call that
 * needs it and remove it again.
 */
export function installBrowserShims() {
  const previous = { createImageBitmap: globalThis.createImageBitmap, document: globalThis.document }
  globalThis.createImageBitmap = async blob => {
    const bitmap = await loadImage(Buffer.from(await blob.arrayBuffer()))
    bitmap.close = () => {}
    return bitmap
  }
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') throw new Error(`shim: unexpected element ${tag}`)
      const canvas = createCanvas(1, 1)
      canvas.toBlob = (callback, type = 'image/png', quality) => {
        // The browser's quality is 0–1; napi-canvas takes 0–100.
        const buffer = type === 'image/jpeg' ? canvas.toBuffer('image/jpeg', Math.round((quality ?? 0.92) * 100)) : canvas.toBuffer('image/png')
        callback(new Blob([buffer], { type }))
      }
      return canvas
    }
  }
  return () => {
    globalThis.createImageBitmap = previous.createImageBitmap
    globalThis.document = previous.document
  }
}
