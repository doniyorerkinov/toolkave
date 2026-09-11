import type { HeldFile } from '~/stores/files'

/**
 * Canvas-based image work. Everything here is browser-only and runs on demand,
 * so no decoding library is loaded until a file is actually processed.
 *
 * HEIC is the exception: no browser except Safari can decode it, so it goes
 * through `heic2any`, dynamically imported only when a HEIC file appears.
 */

export type ImageFormat = 'jpeg' | 'png' | 'webp'

export const MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
}

export const EXTENSION: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp'
}

/** Detect format from content, not filename - renamed files are common. */
export function sniffImage(data: Uint8Array): 'jpeg' | 'png' | 'webp' | 'heic' | 'gif' | null {
  if (data[0] === 0xff && data[1] === 0xd8) return 'jpeg'
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'png'
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return 'gif'

  // RIFF....WEBP
  if (
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return 'webp'
  }

  // ISO-BMFF brand at offset 4: 'ftyp' followed by heic/heix/mif1/msf1
  if (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) {
    const brand = String.fromCharCode(data[8]!, data[9]!, data[10]!, data[11]!)
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heim'].includes(brand)) return 'heic'
  }

  return null
}

/**
 * Orientation tag (1–8) from a JPEG's EXIF block, or 1 when there is none.
 *
 * Phones store the sensor's pixels as-is and record how the camera was held
 * in this tag. Browsers honour it when decoding; PDF viewers do not, so a
 * JPEG embedded byte-for-byte in a PDF shows up sideways. Reading the tag is
 * what lets the PDF tools leave the common case untouched and re-encode
 * only the photos that need turning.
 */
export function jpegOrientation(data: Uint8Array): number {
  if (data[0] !== 0xff || data[1] !== 0xd8) return 1
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  let offset = 2
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) return 1
    const marker = data[offset + 1]!
    // Start of scan or end of image: no more metadata segments.
    if (marker === 0xda || marker === 0xd9) return 1
    const length = view.getUint16(offset + 2)

    // APP1 carrying "Exif\0\0", followed by a TIFF header.
    if (marker === 0xe1 && offset + 10 <= data.length && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10
      if (tiff + 8 > data.length) return 1
      const little = view.getUint16(tiff) === 0x4949
      const ifd = tiff + view.getUint32(tiff + 4, little)
      if (ifd + 2 > data.length) return 1
      const entries = view.getUint16(ifd, little)
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12
        if (entry + 12 > data.length) return 1
        if (view.getUint16(entry, little) === 0x0112) {
          const value = view.getUint16(entry + 8, little)
          return value >= 1 && value <= 8 ? value : 1
        }
      }
      return 1
    }

    offset += 2 + length
  }
  return 1
}

/** Decode to a bitmap, converting HEIC first if needed. */
async function decode(data: Uint8Array): Promise<ImageBitmap> {
  const kind = sniffImage(data)
  let blob = new Blob([data as BlobPart])

  if (kind === 'heic') {
    if (import.meta.server) throw new Error('browser only')
    const { default: heic2any } = await import('heic2any')
    const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 })
    blob = Array.isArray(converted) ? converted[0]! : converted
  }

  // Explicit rather than relying on the default, which older engines set to
  // "none": a photo must come out the way the camera was held.
  return await createImageBitmap(blob, { imageOrientation: 'from-image' })
}

async function encode(
  bitmap: ImageBitmap,
  format: ImageFormat,
  quality: number,
  width = bitmap.width,
  height = bitmap.height
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))

  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas unavailable')

  // JPEG has no alpha channel: without this, transparent areas come out black
  // instead of white, which looks like a broken conversion.
  if (format === 'jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, MIME[format], quality)
  )
  if (!blob) throw new Error('encode failed')
  // A browser that cannot encode the requested format (Safari has no WebP
  // encoder) quietly hands back a PNG instead. Saying so beats delivering a
  // PNG with a .webp name and calling it compressed.
  if (blob.type !== MIME[format]) throw new Error(UNSUPPORTED_OUTPUT)

  return new Uint8Array(await blob.arrayBuffer())
}

/** Thrown when this browser has no encoder for the requested output format. */
export const UNSUPPORTED_OUTPUT = 'toolkave/unsupported-output'

export interface ImageResult {
  data: Uint8Array
  width: number
  height: number
}

/** Read dimensions without producing an output file. */
export async function readImageSize(file: HeldFile): Promise<{ width: number; height: number }> {
  const bitmap = await decode(file.data)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return size
}

/** Re-encode at a given quality, keeping the original dimensions. */
export async function compressImage(
  file: HeldFile,
  format: ImageFormat,
  quality: number
): Promise<ImageResult> {
  const bitmap = await decode(file.data)
  const data = await encode(bitmap, format, quality)
  const result = { data, width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return result
}

/** Resize to a target width, height, or both. Aspect ratio is kept unless both are given. */
export async function resizeImage(
  file: HeldFile,
  target: { width?: number; height?: number },
  format: ImageFormat,
  quality = 0.92
): Promise<ImageResult> {
  const bitmap = await decode(file.data)

  let width = target.width ?? 0
  let height = target.height ?? 0

  if (width && !height) height = (bitmap.height / bitmap.width) * width
  else if (height && !width) width = (bitmap.width / bitmap.height) * height
  else if (!width && !height) {
    width = bitmap.width
    height = bitmap.height
  }

  const data = await encode(bitmap, format, quality, width, height)
  const result = { data, width: Math.round(width), height: Math.round(height) }
  bitmap.close()
  return result
}

/** Convert to another format at full size. */
export async function convertImage(
  file: HeldFile,
  format: ImageFormat,
  quality = 0.92
): Promise<ImageResult> {
  return await compressImage(file, format, quality)
}

/* ------------------------------------------------------------------ */
/* Scan clean-up                                                        */
/* ------------------------------------------------------------------ */

export type ScanMode = 'colour' | 'grayscale' | 'enhance'

/** Ignore the darkest and lightest few per cent when finding the black and white points. */
const BLACK_PERCENTILE = 0.04
const WHITE_PERCENTILE = 0.92

/**
 * Clean up a photograph of a document.
 *
 * A phone photo of a printed page is a grey, unevenly lit rectangle. What
 * fixes it is not sharpening but an auto-levels pass: find where the paper and
 * the ink actually sit in the histogram, then stretch that range to the full
 * scale so the paper goes white and the text goes black.
 *
 * The percentiles matter. Taking the true minimum and maximum would key the
 * stretch to a single dust speck or a highlight, so a few per cent at each end
 * are discarded, which is what makes this robust on real photographs.
 */
export async function enhanceScan(
  file: HeldFile,
  mode: ScanMode,
  quality = 0.85
): Promise<ImageResult> {
  if (mode === 'colour') {
    const converted = await compressImage(file, 'jpeg', quality)
    return converted
  }

  const bitmap = await decode(file.data)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    throw new Error('canvas unavailable')
  }

  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = image.data
  const histogram = new Uint32Array(256)

  // Rec. 601 luma, which is what "convert to grayscale" means to a viewer.
  for (let i = 0; i < pixels.length; i += 4) {
    const grey = (pixels[i]! * 299 + pixels[i + 1]! * 587 + pixels[i + 2]! * 114) / 1000
    const level = grey < 0 ? 0 : grey > 255 ? 255 : Math.round(grey)
    pixels[i] = level
    pixels[i + 1] = level
    pixels[i + 2] = level
    histogram[level]!++
  }

  if (mode === 'enhance') {
    const total = (pixels.length / 4) | 0
    const blackTarget = total * BLACK_PERCENTILE
    const whiteTarget = total * WHITE_PERCENTILE

    let seen = 0
    let black = 0
    let white = 255
    for (let level = 0; level < 256; level++) {
      seen += histogram[level]!
      if (black === 0 && seen >= blackTarget) black = level
      if (seen >= whiteTarget) {
        white = level
        break
      }
    }

    // A flat histogram means there is nothing to stretch — a blank page, or an
    // image already at full contrast. Scaling it would only amplify noise.
    const span = white - black
    if (span > 8) {
      const lookup = new Uint8Array(256)
      for (let level = 0; level < 256; level++) {
        const scaled = ((level - black) * 255) / span
        lookup[level] = scaled < 0 ? 0 : scaled > 255 ? 255 : Math.round(scaled)
      }
      for (let i = 0; i < pixels.length; i += 4) {
        const level = lookup[pixels[i]!]!
        pixels[i] = level
        pixels[i + 1] = level
        pixels[i + 2] = level
      }
    }
  }

  context.putImageData(image, 0, 0)

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, MIME.jpeg, quality)
  )
  if (!blob) throw new Error('encode failed')

  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height
  }
}

/**
 * Normalise anything the PDF embedder cannot take directly.
 *
 * `pdf-lib` embeds only JPEG and PNG, so WebP, HEIC and GIF are re-encoded to
 * JPEG first. Files already in a supported format are passed through untouched
 * so nothing is recompressed unnecessarily.
 */
export async function normaliseForPdf(files: HeldFile[]): Promise<HeldFile[]> {
  const out: HeldFile[] = []

  for (const file of files) {
    const kind = sniffImage(file.data)
    // A JPEG whose EXIF says it was shot sideways has to be re-encoded, since
    // the embedder copies pixels as stored and PDF viewers ignore the tag.
    if (kind === 'png' || (kind === 'jpeg' && jpegOrientation(file.data) === 1)) {
      out.push(file)
      continue
    }
    if (!kind) throw new Error(`unsupported image: ${file.name}`)

    const converted = await compressImage(file, 'jpeg', 0.92)
    out.push({ ...file, data: converted.data, type: MIME.jpeg })
  }

  return out
}
