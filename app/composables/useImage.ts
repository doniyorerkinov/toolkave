import type { HeldFile } from '~/stores/files'

/**
 * Canvas-based image work. Everything here is browser-only and runs on demand,
 * so no decoding library is loaded until a file is actually processed.
 *
 * HEIC is the exception: no browser except Safari can decode it, so it goes
 * through libheif compiled to WebAssembly, imported only when a HEIC file
 * actually appears.
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

/**
 * HEIC decoded to raw pixels by libheif.
 *
 * The obvious library, heic2any, is a 2020 build of libheif that cannot read
 * what current iPhones write: 10-bit (`heix`) images and the HDR gain maps
 * (`tmap`) Apple has shipped since iOS 17. On a real camera roll that was a
 * quarter of the photos, each failing with no way to tell which. This build
 * reads all of them, and about five times faster.
 */
async function decodeHeic(data: Uint8Array): Promise<ImageBitmap> {
  if (import.meta.server) throw new Error('browser only')
  // The package's default entry is CommonJS wrapping a 2 MB emscripten bundle,
  // which Vite's dependency optimiser refuses to pre-bundle (it answers 504
  // and the import fails at runtime). This is the same build as an ES module.
  const { default: createLibheif } = await import('libheif-js/libheif-wasm/libheif-bundle.mjs')
  const libheif = await createLibheif()

  const images = new libheif.HeifDecoder().decode(data)
  const image = images[0]
  if (!image) throw new Error('heic: no image inside')

  // libheif applies the file's own rotation and mirror properties while
  // decoding, so these dimensions are already the upright ones.
  const width = image.get_width()
  const height = image.get_height()
  const pixels = new ImageData(width, height)
  await new Promise<void>((resolve, reject) => {
    image.display(pixels, result => (result ? resolve() : reject(new Error('heic: decode failed'))))
  })
  return await createImageBitmap(pixels)
}

/**
 * Decode to a bitmap, converting HEIC first if needed.
 *
 * Exported because a tool that lets someone choose part of a picture has to
 * show them the picture, and an `<img>` cannot display the HEIC these tools
 * accept.
 */
export async function decodeImage(data: Uint8Array): Promise<ImageBitmap> {
  return await decode(data)
}

async function decode(data: Uint8Array): Promise<ImageBitmap> {
  const kind = sniffImage(data)
  if (kind === 'heic') return await decodeHeic(data)

  // Explicit rather than relying on the default, which older engines set to
  // "none": a photo must come out the way the camera was held.
  return await createImageBitmap(new Blob([data as BlobPart]), { imageOrientation: 'from-image' })
}

/**
 * The part of the source to keep, in pixels. Absent means all of it.
 */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

async function encode(
  bitmap: ImageBitmap,
  format: ImageFormat,
  quality: number,
  width = bitmap.width,
  height = bitmap.height,
  crop?: CropRect,
  /** Palette size for PNG output. Undefined or 0 keeps every colour. */
  colours?: number
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
  if (crop) {
    // Source rectangle first, destination second: the chosen part of the
    // picture is stretched to fill the whole output.
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height)
  } else {
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  }

  /**
   * PNG stores every pixel exactly, which makes a photograph several times
   * larger than the JPEG it came from. Reducing it to a palette is the only
   * way a PNG of a photo gets small — the same trick pngquant does — and it
   * has to be asked for, because the whole point of choosing PNG is usually
   * that nothing is thrown away.
   */
  if (format === 'png' && colours) {
    if (import.meta.server) throw new Error('browser only')
    // The package publishes its API as a default export from CommonJS, so the
    // namespace is unwrapped rather than destructured.
    const module = await import('@pdf-lib/upng')
    const upng = (module as unknown as { default?: typeof module }).default ?? module
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    const out = upng.encode([pixels.data.buffer as ArrayBuffer], canvas.width, canvas.height, colours)
    return new Uint8Array(out)
  }

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
  quality: number,
  colours?: number
): Promise<ImageResult> {
  const bitmap = await decode(file.data)
  const data = await encode(bitmap, format, quality, bitmap.width, bitmap.height, undefined, colours)
  const result = { data, width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return result
}

/**
 * Resize to a target width, height, or both, optionally keeping only part of
 * the source. Aspect ratio is kept unless both dimensions are given — and
 * when a crop is supplied it is the crop's ratio that is followed, since that
 * is the picture the person chose.
 */
export async function resizeImage(
  file: HeldFile,
  target: { width?: number; height?: number },
  format: ImageFormat,
  quality = 0.92,
  crop?: CropRect
): Promise<ImageResult> {
  const bitmap = await decode(file.data)

  const sourceWidth = crop?.width ?? bitmap.width
  const sourceHeight = crop?.height ?? bitmap.height

  let width = target.width ?? 0
  let height = target.height ?? 0

  if (width && !height) height = (sourceHeight / sourceWidth) * width
  else if (height && !width) width = (sourceWidth / sourceHeight) * height
  else if (!width && !height) {
    width = sourceWidth
    height = sourceHeight
  }

  const data = await encode(bitmap, format, quality, width, height, crop)
  const result = { data, width: Math.round(width), height: Math.round(height) }
  bitmap.close()
  return result
}

export interface Transform {
  /** Clockwise, in degrees: 0, 90, 180 or 270. */
  rotate: number
  flipHorizontal: boolean
  flipVertical: boolean
}

/**
 * Turn or mirror a picture.
 *
 * Rotating by a quarter turn swaps the canvas dimensions, and the transform
 * is applied about the centre so the picture lands where it should rather
 * than off the edge.
 */
export async function transformImage(
  file: HeldFile,
  transform: Transform,
  format: ImageFormat,
  quality = 0.92
): Promise<ImageResult> {
  const bitmap = await decode(file.data)
  const quarter = transform.rotate === 90 || transform.rotate === 270
  const width = quarter ? bitmap.height : bitmap.width
  const height = quarter ? bitmap.width : bitmap.height

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('canvas unavailable')
  }

  if (format === 'jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
  }

  context.translate(width / 2, height / 2)
  if (transform.rotate) context.rotate((transform.rotate * Math.PI) / 180)
  context.scale(transform.flipHorizontal ? -1 : 1, transform.flipVertical ? -1 : 1)
  context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
  bitmap.close()

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, MIME[format], quality))
  if (!blob) throw new Error('encode failed')
  if (blob.type !== MIME[format]) throw new Error(UNSUPPORTED_OUTPUT)

  return { data: new Uint8Array(await blob.arrayBuffer()), width, height }
}

/**
 * Convert to another format at full size. `colours` only means anything for
 * PNG output, where it trades exactness for a file a fraction of the size.
 */
export async function convertImage(
  file: HeldFile,
  format: ImageFormat,
  quality = 0.92,
  colours?: number
): Promise<ImageResult> {
  return await compressImage(file, format, quality, colours)
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
export interface NormaliseOptions {
  /**
   * Longest side photos are downscaled to. A 12-megapixel phone photo is
   * 4000 px across and 3–5 MB; at 2000 px it is a fifth of that and still
   * sharp on paper. Undefined keeps every pixel — and every megabyte.
   */
  maxDimension?: number
  /** JPEG quality for anything re-encoded, 0–1. */
  quality?: number
}

export interface NormaliseResult {
  /** The files that could be read, ready to embed. */
  ready: HeldFile[]
  /** Names of the files that could not be, in the order they were given. */
  failed: string[]
}

/**
 * Prepare a batch for the PDF embedder.
 *
 * One unreadable file does not sink the batch. A phone camera roll is a mixed
 * bag - a HEIC the decoder cannot handle, a download that finished half-way -
 * and thirty photos are too many to bisect by hand. Everything readable is
 * returned; what failed comes back by name, for the caller to say so plainly.
 */
export async function normaliseForPdf(
  files: HeldFile[],
  options: NormaliseOptions = {},
  /** Called after each file, so a long batch can show where it has got to. */
  onProgress?: (done: number, total: number) => void
): Promise<NormaliseResult> {
  const { maxDimension, quality = 0.92 } = options
  const shrink = maxDimension !== undefined
  const out: HeldFile[] = []
  const failed: string[] = []

  for (const [index, file] of files.entries()) {
    try {
      out.push(await prepareForPdf(file, shrink ? maxDimension : undefined, quality))
    } catch (error) {
      // The name is all the page can usefully say; the reason is worth seeing
      // while developing, where a decoder regression would otherwise look
      // like "some photos just do not work".
      if (import.meta.dev) console.warn('[toolkave] could not prepare', file.name, error)
      failed.push(file.name)
    }
    onProgress?.(index + 1, files.length)
    // One turn of the event loop between photos, so the progress line repaints
    // instead of the whole page freezing until the last one is done.
    await new Promise(resolve => setTimeout(resolve))
  }

  return { ready: out, failed }
}

async function prepareForPdf(
  file: HeldFile,
  maxDimension: number | undefined,
  quality: number
): Promise<HeldFile> {
  const shrink = maxDimension !== undefined
  const kind = sniffImage(file.data)
  if (!kind) throw new Error(`unsupported image: ${file.name}`)

  let target: { width?: number; height?: number } | null = null
  if (shrink) {
    const { width, height } = await readImageSize(file)
    if (Math.max(width, height) > maxDimension) {
      target = width >= height ? { width: maxDimension } : { height: maxDimension }
    }
  }

  // Lossless stays lossless: a screenshot is only ever downscaled, never
  // turned into a JPEG that would blur its text.
  if (kind === 'png') {
    return target ? { ...file, data: (await resizeImage(file, target, 'png')).data } : file
  }

  // A JPEG is copied byte-for-byte unless it has to be re-encoded: a smaller
  // file was asked for, or its EXIF says it was shot sideways (the embedder
  // copies pixels as stored and PDF viewers ignore the tag).
  if (kind === 'jpeg' && !shrink && jpegOrientation(file.data) === 1) return file

  const converted = target
    ? await resizeImage(file, target, 'jpeg', quality)
    : await compressImage(file, 'jpeg', quality)
  return { ...file, data: converted.data, type: MIME.jpeg }
}

export type RedactMode = 'pixelate' | 'blur'

/**
 * How coarse the covering is, as the number of blocks across the shorter
 * side of the area. Fewer blocks means less left to read; counting blocks
 * rather than pixels means a small face and a large one are hidden equally.
 */
export const REDACT_BLOCKS = [20, 14, 10, 7, 5] as const

/**
 * Cover one area of a canvas so that what was there cannot be read back.
 *
 * The area is destroyed in place, not painted over: the pixels are thrown
 * away and replaced with the average of each block. That is the difference
 * between a redaction and a sticker, and it is why this has to happen to the
 * image data rather than in the browser's display layer.
 */
export function redactArea(
  context: CanvasRenderingContext2D,
  rect: CropRect,
  mode: RedactMode,
  strength: number
) {
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  const x = Math.round(rect.x)
  const y = Math.round(rect.y)
  const blocks = REDACT_BLOCKS[Math.min(REDACT_BLOCKS.length - 1, Math.max(0, strength - 1))]!

  if (mode === 'blur') {
    // A blur drawn from a cut-out pulls in the transparent pixels beyond its
    // edges and leaves a dark rim, so the source is a margin wider than the
    // area and only the middle is kept.
    const radius = Math.max(2, Math.min(width, height) / blocks)
    const margin = Math.ceil(radius * 3)
    const scratch = document.createElement('canvas')
    scratch.width = width + margin * 2
    scratch.height = height + margin * 2
    const scratchContext = scratch.getContext('2d')
    if (!scratchContext) return
    scratchContext.drawImage(
      context.canvas,
      x - margin, y - margin, scratch.width, scratch.height,
      0, 0, scratch.width, scratch.height
    )
    scratchContext.filter = `blur(${radius}px)`
    scratchContext.drawImage(scratch, 0, 0)
    context.drawImage(scratch, margin, margin, width, height, x, y, width, height)
    return
  }

  const columns = Math.max(1, Math.round(blocks * Math.max(1, width / Math.min(width, height))))
  const rows = Math.max(1, Math.round(blocks * Math.max(1, height / Math.min(width, height))))
  const scratch = document.createElement('canvas')
  scratch.width = columns
  scratch.height = rows
  const scratchContext = scratch.getContext('2d')
  if (!scratchContext) return
  // Down to one pixel per block — the browser averages — and straight back up
  // with smoothing off, so each block is a flat square.
  scratchContext.drawImage(context.canvas, x, y, width, height, 0, 0, columns, rows)
  context.imageSmoothingEnabled = false
  context.drawImage(scratch, 0, 0, columns, rows, x, y, width, height)
  context.imageSmoothingEnabled = true
}

/** Apply every covering to the picture at full size and encode the result. */
export async function redactImage(
  file: HeldFile,
  regions: CropRect[],
  mode: RedactMode,
  strength: number,
  format: ImageFormat,
  quality = 0.92
): Promise<ImageResult> {
  const bitmap = await decode(file.data)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('canvas unavailable')
  }

  if (format === 'jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  for (const region of regions) redactArea(context, region, mode, strength)

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, MIME[format], quality))
  if (!blob) throw new Error('encode failed')
  if (blob.type !== MIME[format]) throw new Error(UNSUPPORTED_OUTPUT)
  return { data: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
}

/** Print resolution for document photos. Below this, print shops complain. */
export const PRINT_DPI = 300

export function mmToPx(mm: number, dpi = PRINT_DPI): number {
  return Math.round((mm / 25.4) * dpi)
}

export interface SheetOptions {
  /** Paper size in millimetres. */
  paper: { width: number; height: number }
  /** One photo's size in millimetres. */
  photo: { width: number; height: number }
  /** Gap between photos and margin from the paper edge, in millimetres. */
  gap: number
  margin: number
}

/**
 * Lay copies of one photo out on a sheet of paper, with cutting guides.
 *
 * A print shop charges for one 10×15 print whether it carries one photo or
 * eight, so the sheet is what makes six passport photos cost the price of
 * one. The guides are hairlines just outside each photo rather than borders
 * on it, so cutting along them leaves no line behind.
 */
export async function buildPhotoSheet(
  photo: Uint8Array,
  options: SheetOptions,
  format: ImageFormat = 'jpeg',
  quality = 0.95
): Promise<ImageResult & { count: number }> {
  const bitmap = await decode(photo)
  const canvas = document.createElement('canvas')
  canvas.width = mmToPx(options.paper.width)
  canvas.height = mmToPx(options.paper.height)
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('canvas unavailable')
  }
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  const cellWidth = mmToPx(options.photo.width)
  const cellHeight = mmToPx(options.photo.height)
  const gap = mmToPx(options.gap)
  const margin = mmToPx(options.margin)
  const usableWidth = canvas.width - margin * 2
  const usableHeight = canvas.height - margin * 2
  const columns = Math.max(0, Math.floor((usableWidth + gap) / (cellWidth + gap)))
  const rows = Math.max(0, Math.floor((usableHeight + gap) / (cellHeight + gap)))

  // Centre the block of photos rather than crowding one edge.
  const blockWidth = columns * cellWidth + Math.max(0, columns - 1) * gap
  const blockHeight = rows * cellHeight + Math.max(0, rows - 1) * gap
  const left = Math.round((canvas.width - blockWidth) / 2)
  const top = Math.round((canvas.height - blockHeight) / 2)

  context.strokeStyle = '#c8c8c8'
  context.lineWidth = 1
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = left + column * (cellWidth + gap)
      const y = top + row * (cellHeight + gap)
      context.drawImage(bitmap, x, y, cellWidth, cellHeight)
      context.strokeRect(x - 0.5, y - 0.5, cellWidth + 1, cellHeight + 1)
    }
  }
  bitmap.close()

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, MIME[format], quality))
  if (!blob) throw new Error('encode failed')
  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
    count: rows * columns
  }
}

export type Backdrop = 'white' | 'black' | 'blur'

/**
 * Place the whole picture inside an exact size without cropping anything.
 *
 * A tall photo put into a wide banner has to have something either side.
 * Bars are honest but ugly; a blown-up blurred copy of the picture itself is
 * what every video app does, and it reads as deliberate.
 */
export async function fitToSize(
  file: HeldFile,
  target: { width: number; height: number },
  backdrop: Backdrop,
  format: ImageFormat,
  quality = 0.92
): Promise<ImageResult> {
  const bitmap = await decode(file.data)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(target.width)
  canvas.height = Math.round(target.height)
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('canvas unavailable')
  }

  if (backdrop === 'blur') {
    const cover = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height)
    const width = bitmap.width * cover
    const height = bitmap.height * cover
    context.filter = `blur(${Math.max(8, Math.round(Math.min(canvas.width, canvas.height) / 18))}px)`
    context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
    context.filter = 'none'
  } else {
    context.fillStyle = backdrop === 'black' ? '#000000' : '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  const fit = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height)
  const width = bitmap.width * fit
  const height = bitmap.height * fit
  context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, MIME[format], quality))
  if (!blob) throw new Error('encode failed')
  if (blob.type !== MIME[format]) throw new Error(UNSUPPORTED_OUTPUT)
  return { data: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
}

/**
 * The drawn size an SVG claims, from its own attributes.
 *
 * Many icons are exported with only a viewBox and no width or height, which
 * makes their intrinsic size zero in some browsers; falling back to the
 * viewBox keeps the shape right, and a square is the last resort.
 */
function svgSize(text: string): { width: number; height: number } {
  const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i.exec(text)
  if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) }
  const width = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i.exec(text)
  const height = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i.exec(text)
  if (width && height) return { width: Number(width[1]), height: Number(height[1]) }
  return { width: 512, height: 512 }
}

export function isSvg(data: Uint8Array): boolean {
  const head = new TextDecoder('utf-8').decode(data.subarray(0, 400)).trimStart()
  return head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!DOCTYPE svg')
}

/**
 * Draw an SVG at a chosen pixel size.
 *
 * The size is written into the markup rather than applied when drawing,
 * because a browser rasterises an SVG at its own declared size first and
 * then scales that bitmap — which throws away the one advantage a vector
 * had. Loaded through an `img`, the SVG runs no scripts and fetches nothing.
 */
export async function renderSvg(
  data: Uint8Array,
  target?: { width: number; height: number }
): Promise<ImageBitmap> {
  if (import.meta.server) throw new Error('browser only')
  const text = new TextDecoder('utf-8').decode(data as BufferSource)
  const natural = svgSize(text)
  const size = target ?? natural
  const sized = text.replace(
    /<svg\b([^>]*)>/i,
    (match, attributes: string) =>
      `<svg${attributes.replace(/\s(width|height)\s*=\s*(["'])[^"']*\2/gi, '')} width="${size.width}" height="${size.height}">`
  )

  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.decoding = 'sync'
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(size.width))
    canvas.height = Math.max(1, Math.round(size.height))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas unavailable')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await createImageBitmap(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** An SVG rasterised to PNG bytes, so the rest of the pipeline can take it. */
export async function svgToPng(
  data: Uint8Array,
  target?: { width: number; height: number }
): Promise<ImageResult> {
  const bitmap = await renderSvg(data, target)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('canvas unavailable')
  }
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, MIME.png))
  if (!blob) throw new Error('encode failed')
  return { data: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
}
