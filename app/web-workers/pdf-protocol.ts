/**
 * Message protocol between the main thread and `pdf.worker.ts`.
 *
 * Kept in its own file with no side effects so both ends can import the types
 * without pulling pdf.js itself into whichever side does the importing.
 */

export type PdfWorkerRequest =
  | { id: number; kind: 'thumbnails'; pdfBytes: Uint8Array; pages: number[]; maxDimension: number }
  | { id: number; kind: 'rasterize'; pdfBytes: Uint8Array; pages: number[]; maxDimension: number; quality: number }
  | { id: number; kind: 'text'; pdfBytes: Uint8Array }

export type PdfWorkerResponse =
  | { id: number; kind: 'progress'; done: number; total: number }
  | { id: number; kind: 'thumbnail'; page: number; bitmap: ImageBitmap; width: number; height: number }
  | { id: number; kind: 'raster'; page: number; data: Uint8Array; width: number; height: number }
  | { id: number; kind: 'text'; page: number; text: string }
  | { id: number; kind: 'done'; pageCount: number }
  | { id: number; kind: 'error'; message: string }
