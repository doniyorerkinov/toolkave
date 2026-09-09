import type { PdfWorkerRequest, PdfWorkerResponse } from '~/web-workers/pdf-protocol'

/**
 * Main-thread side of `pdf.worker.ts`.
 *
 * One worker per composable instance, created lazily on first use and torn
 * down when the calling component's effect scope ends — a tool page that
 * never touches a multi-page PDF never pays for pdf.js at all, and one that
 * does gets the worker cleaned up automatically when it navigates away,
 * without every component having to remember to do it.
 */

export interface PageThumbnail {
  page: number
  bitmap: ImageBitmap
  width: number
  height: number
}

export interface RasterPage {
  page: number
  data: Uint8Array
  width: number
  height: number
}

export interface PageText {
  page: number
  text: string
}

export interface ProgressHandlers {
  onProgress?: (done: number, total: number) => void
}

let nextId = 1

export function usePdfWorker() {
  let worker: Worker | null = null
  // Keyed by request id, so calls issued back to back (or genuinely in
  // parallel) each resolve against their own responses rather than racing.
  const pending = new Map<number, { resolve: (pageCount: number) => void; reject: (error: Error) => void }>()

  function ensureWorker(): Worker {
    if (worker) return worker

    worker = new Worker(new URL('~/web-workers/pdf.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<PdfWorkerResponse>) => {
      const message = event.data
      const entry = pending.get(message.id)
      if (!entry) return // Response to a call this instance no longer cares about.

      if (message.kind === 'done') {
        pending.delete(message.id)
        entry.resolve(message.pageCount)
      } else if (message.kind === 'error') {
        pending.delete(message.id)
        entry.reject(new Error(message.message))
      }
      // 'progress', 'thumbnail', 'raster' and 'text' are handled by the
      // per-call listener installed in `send()` below, not here.
    }
    worker.onerror = event => {
      // A worker-level error (e.g. the script itself failed to load) has no
      // request id to key off, so every outstanding call fails together.
      for (const [id, entry] of pending) {
        entry.reject(new Error(event.message || 'PDF worker failed'))
        pending.delete(id)
      }
    }

    return worker
  }

  function send<M extends PdfWorkerResponse>(
    request: PdfWorkerRequest,
    onMessage: (message: M) => void,
    progress?: ProgressHandlers
  ): Promise<number> {
    const instance = ensureWorker()

    return new Promise<number>((resolve, reject) => {
      pending.set(request.id, { resolve, reject })

      const listener = (event: MessageEvent<PdfWorkerResponse>) => {
        const message = event.data
        if (message.id !== request.id) return
        if (message.kind === 'progress') progress?.onProgress?.(message.done, message.total)
        else if (message.kind !== 'done' && message.kind !== 'error') onMessage(message as M)
        if (message.kind === 'done' || message.kind === 'error') instance.removeEventListener('message', listener)
      }
      instance.addEventListener('message', listener)

      instance.postMessage(request)
    })
  }

  /** Render pages to small bitmaps for a visual page picker. */
  function getThumbnails(
    pdfBytes: Uint8Array,
    pages: number[],
    maxDimension: number,
    onPage: (thumbnail: PageThumbnail) => void,
    progress?: ProgressHandlers
  ): Promise<number> {
    const id = nextId++
    return send<Extract<PdfWorkerResponse, { kind: 'thumbnail' }>>(
      { id, kind: 'thumbnails', pdfBytes, pages, maxDimension },
      message => onPage({ page: message.page, bitmap: message.bitmap, width: message.width, height: message.height }),
      progress
    )
  }

  /** Render pages to full-size JPEG bytes — the PDF → JPG tool. */
  function rasterizePages(
    pdfBytes: Uint8Array,
    pages: number[],
    maxDimension: number,
    quality: number,
    onPage: (page: RasterPage) => void,
    progress?: ProgressHandlers
  ): Promise<number> {
    const id = nextId++
    return send<Extract<PdfWorkerResponse, { kind: 'raster' }>>(
      { id, kind: 'rasterize', pdfBytes, pages, maxDimension, quality },
      message => onPage({ page: message.page, data: message.data, width: message.width, height: message.height }),
      progress
    )
  }

  /** Extract each page's text — the PDF → text tool. */
  function extractText(
    pdfBytes: Uint8Array,
    onPage: (page: PageText) => void,
    progress?: ProgressHandlers
  ): Promise<number> {
    const id = nextId++
    return send<Extract<PdfWorkerResponse, { kind: 'text' }>>(
      { id, kind: 'text', pdfBytes },
      message => onPage({ page: message.page, text: message.text }),
      progress
    )
  }

  function terminate(): void {
    worker?.terminate()
    worker = null
    for (const [id, entry] of pending) {
      entry.reject(new Error('PDF worker terminated'))
      pending.delete(id)
    }
  }

  // Runs when the component (or composable) that called `usePdfWorker()`
  // tears down — a route change away from the tool, in practice — so a
  // worker never outlives the page that started it.
  if (getCurrentScope()) onScopeDispose(terminate)

  return { getThumbnails, rasterizePages, extractText, terminate }
}
