/// <reference lib="webworker" />
/**
 * Renders PDF pages off the main thread.
 *
 * Named `web-workers/`, not `workers/` — this project deploys to Cloudflare
 * *Workers*, and the two must never be confused in a path or a search.
 *
 * Everything here — parsing and rasterising — happens inside this one worker,
 * using `OffscreenCanvas` for the render step. pdf.js is still told where its
 * own worker script lives (`GlobalWorkerOptions.workerSrc`); it spawns that as
 * a nested worker for parsing, which every evergreen browser supports. The
 * alternative — leaving `workerSrc` unset so pdf.js falls back to running
 * synchronously in the calling context — relies on an internal fallback path
 * pdf.js itself only documents as a last resort, so the real worker is used.
 */
import { GlobalWorkerOptions, getDocument, type PDFDocumentLoadingTask, type PDFDocumentProxy } from 'pdfjs-dist'
// Vite's `?url` suffix resolves to the built asset's URL rather than its
// contents — exactly what `workerSrc` needs to hand pdf.js a real worker file.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import type { PdfWorkerRequest, PdfWorkerResponse } from './pdf-protocol'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/**
 * A handful of pdf.js code paths — font glyph caching among them — still call
 * `document.createElement('canvas')` rather than constructing an
 * `OffscreenCanvas` directly, a holdover from before OffscreenCanvas existed.
 * There is no `document` inside a worker, so this stands in for just enough
 * of one to satisfy those call sites.
 */
const documentShim = {
  createElement(name: string) {
    return name === 'canvas' ? new OffscreenCanvas(1, 1) : null
  }
} as unknown as Document

function post(message: PdfWorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer)
}

/**
 * `destroy()` — which frees the parsed document and its worker-side state —
 * lives on the loading task, not on the `PDFDocumentProxy` it resolves to, so
 * both are returned; letting the task get garbage-collected instead leaks
 * everything pdf.js allocated for the document.
 */
async function loadDocument(
  pdfBytes: Uint8Array
): Promise<{ doc: PDFDocumentProxy; task: PDFDocumentLoadingTask }> {
  // pdf.js detaches and takes ownership of the buffer it is handed. Copying
  // first means the caller's own Uint8Array is still valid afterwards — it is
  // not consumed by handing it to the worker.
  const task = getDocument({ data: pdfBytes.slice(), ownerDocument: documentShim })
  const doc = await task.promise
  return { doc, task }
}

interface RenderedPage {
  canvas: OffscreenCanvas
  width: number
  height: number
}

/** Render one page, scaled so its longer side is `maxDimension` device pixels. */
async function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  maxDimension: number
): Promise<RenderedPage> {
  const page = await doc.getPage(pageNumber)
  try {
    const base = page.getViewport({ scale: 1 })
    const scale = maxDimension / Math.max(base.width, base.height)
    const viewport = page.getViewport({ scale })

    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(viewport.width)),
      Math.max(1, Math.round(viewport.height))
    )
    const context = canvas.getContext('2d')
    if (!context) throw new Error('OffscreenCanvas 2d context unavailable')

    // `canvas` is typed for an HTMLCanvasElement, which an OffscreenCanvas is
    // not. pdf.js's own docs say to pass `canvas: null` and rely on
    // `canvasContext` when the context has to be used directly, which is
    // exactly this case.
    await page.render({ canvas: null, canvasContext: context as unknown as CanvasRenderingContext2D, viewport })
      .promise
    return { canvas, width: canvas.width, height: canvas.height }
  } finally {
    // Frees the page's cached operator list and fonts; without it a
    // many-page document keeps every page's render data in memory at once.
    page.cleanup()
  }
}

async function handleThumbnails(request: Extract<PdfWorkerRequest, { kind: 'thumbnails' }>): Promise<void> {
  const { doc, task } = await loadDocument(request.pdfBytes)
  try {
    for (let i = 0; i < request.pages.length; i++) {
      const pageNumber = request.pages[i]!
      const { canvas, width, height } = await renderPage(doc, pageNumber, request.maxDimension)
      // Zero-copy handoff: the bitmap's pixel buffer moves to the main
      // thread instead of being cloned.
      const bitmap = canvas.transferToImageBitmap()
      post({ id: request.id, kind: 'thumbnail', page: pageNumber, bitmap, width, height }, [bitmap])
      post({ id: request.id, kind: 'progress', done: i + 1, total: request.pages.length })
    }
    post({ id: request.id, kind: 'done', pageCount: doc.numPages })
  } finally {
    await task.destroy()
  }
}

async function handleRasterize(request: Extract<PdfWorkerRequest, { kind: 'rasterize' }>): Promise<void> {
  const { doc, task } = await loadDocument(request.pdfBytes)
  try {
    for (let i = 0; i < request.pages.length; i++) {
      const pageNumber = request.pages[i]!
      const { canvas, width, height } = await renderPage(doc, pageNumber, request.maxDimension)
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: request.quality })
      const data = new Uint8Array(await blob.arrayBuffer())
      post({ id: request.id, kind: 'raster', page: pageNumber, data, width, height }, [data.buffer])
      post({ id: request.id, kind: 'progress', done: i + 1, total: request.pages.length })
    }
    post({ id: request.id, kind: 'done', pageCount: doc.numPages })
  } finally {
    await task.destroy()
  }
}

async function handleText(request: Extract<PdfWorkerRequest, { kind: 'text' }>): Promise<void> {
  const { doc, task } = await loadDocument(request.pdfBytes)
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      let text: string
      try {
        const content = await page.getTextContent()
        // `hasEOL` is pdf.js's own line-break signal, read from the PDF's
        // actual text-positioning operators — not a guess from coordinates.
        // Word gaps are another matter: justified and kerned text positions
        // each word as its own item with no space character between them,
        // so a horizontal gap wider than a sliver of the font size gets one.
        text = ''
        let previous: TextItem | null = null
        for (const item of content.items) {
          if (!('str' in item)) continue
          if (previous && !previous.hasEOL && previous.str && item.str) {
            const gap = item.transform[4]! - (previous.transform[4]! + previous.width)
            const size = Math.hypot(previous.transform[0]!, previous.transform[1]!) || 1
            if (gap > size * 0.15 && !/\s$/.test(previous.str) && !/^\s/.test(item.str)) text += ' '
          }
          text += item.str + (item.hasEOL ? '\n' : '')
          previous = item
        }
      } finally {
        page.cleanup()
      }
      post({ id: request.id, kind: 'text', page: pageNumber, text })
      post({ id: request.id, kind: 'progress', done: pageNumber, total: doc.numPages })
    }
    post({ id: request.id, kind: 'done', pageCount: doc.numPages })
  } finally {
    await task.destroy()
  }
}

self.onmessage = async (event: MessageEvent<PdfWorkerRequest>) => {
  const request = event.data
  try {
    if (request.kind === 'thumbnails') await handleThumbnails(request)
    else if (request.kind === 'rasterize') await handleRasterize(request)
    else await handleText(request)
  } catch (error) {
    post({ id: request.id, kind: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
