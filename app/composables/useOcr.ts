import type { HeldFile } from '~/stores/files'

/**
 * Reading text out of images with Tesseract.
 *
 * The interesting part for this site is the language set. Most browser OCR
 * tools ship English and stop; Russian is common enough to find, and Uzbek —
 * in both the Latin and Cyrillic alphabets — essentially is not. Tesseract has
 * trained data for all four, so the tool that nobody builds is mostly a matter
 * of wiring the right models up.
 *
 * The engine and the language models are fetched from a public CDN the first
 * time they are needed and then cached by the browser. Recognition itself runs
 * on the device: the image is never uploaded anywhere.
 */

export const OCR_LANGUAGES = ['eng', 'rus', 'uzb', 'uzb_cyrl'] as const
export type OcrLanguage = (typeof OCR_LANGUAGES)[number]

/** Roughly how much has to be downloaded per language, for the UI to warn with. */
export const LANGUAGE_DOWNLOAD_MB: Record<OcrLanguage, number> = {
  eng: 3,
  rus: 2.7,
  uzb: 3.1,
  uzb_cyrl: 0.9
}

export interface OcrProgress {
  /** Tesseract's own stage name, e.g. "recognizing text". */
  stage: string
  /** 0–1 within the current stage. */
  progress: number
}

export interface OcrResult {
  text: string
  /** Mean confidence over recognised words, 0–100. */
  confidence: number
  words: number
}

/**
 * Formats the browser can hand to a canvas. HEIC is excluded deliberately —
 * it would need the heic2any conversion first, and the OCR tools accept
 * screenshots and scans rather than phone-camera originals.
 */
export const OCR_ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp']

/** Below this, upscaling meaningfully improves recognition. */
const MIN_WORKING_EDGE = 1600
const MAX_SCALE = 3

/**
 * Enlarge small images before recognition.
 *
 * Tesseract wants glyphs around 30 px tall. Screenshots and web images are
 * usually well under that, and upscaling them is the single change that most
 * improves the result — far more than any thresholding we could do here, since
 * Tesseract already binarises internally.
 */
async function prepare(data: Uint8Array, type: string): Promise<Blob> {
  const blob = new Blob([data as BlobPart], { type })

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    // Let Tesseract try to decode it itself rather than failing here.
    return blob
  }

  const longest = Math.max(bitmap.width, bitmap.height)
  if (longest >= MIN_WORKING_EDGE) {
    bitmap.close()
    return blob
  }

  const scale = Math.min(MAX_SCALE, MIN_WORKING_EDGE / longest)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return blob
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const upscaled = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  return upscaled ?? blob
}

export async function recogniseImage(
  file: HeldFile,
  languages: OcrLanguage[],
  onProgress?: (progress: OcrProgress) => void
): Promise<OcrResult> {
  if (!languages.length) throw new Error('NO_LANGUAGE')

  if (import.meta.server) throw new Error('browser only')
  const { createWorker } = await import('tesseract.js')
  const image = await prepare(file.data, file.type || 'image/png')

  const worker = await createWorker(languages, 1, {
    logger: message => {
      if (!onProgress) return
      onProgress({ stage: message.status, progress: message.progress ?? 0 })
    }
  })

  try {
    const { data } = await worker.recognize(image)

    // Words live under blocks → paragraphs → lines. Averaging their scores is
    // a truer reading than the page-level number, which a single confidently
    // recognised heading can drag upwards over a page of unreadable body text.
    let total = 0
    let count = 0
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          for (const word of line.words) {
            total += word.confidence
            count++
          }
        }
      }
    }

    return {
      text: data.text ?? '',
      confidence: Math.round(count ? total / count : (data.confidence ?? 0)),
      words: count
    }
  } finally {
    // Always terminated: each worker holds the language models in memory, and
    // leaking one per run would exhaust a phone within a few images.
    await worker.terminate()
  }
}
