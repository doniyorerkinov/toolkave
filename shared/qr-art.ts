/**
 * Putting a logo and a caption on a QR code without stopping it scanning.
 *
 * A QR code carries enough redundancy to survive damage — that is what the
 * error-correction level buys — so a logo in the middle is not a trick, it
 * is spending a budget. The budget is real and finite: cover too much and
 * the code stops reading, silently, on somebody else's phone after it has
 * been printed. Hence the caps below rather than a free-for-all slider.
 *
 * The drawing is written against the bits of a 2D context both a browser
 * and node-canvas provide, so the same code that renders the download can
 * be run in a test and the result decoded back.
 */

/** Only what this module actually touches, so a test canvas satisfies it. */
export interface DrawTarget {
  canvas: { width: number; height: number }
  fillStyle: string
  font: string
  textAlign: string
  textBaseline: string
  fillRect: (x: number, y: number, w: number, h: number) => void
  fillText: (text: string, x: number, y: number) => void
  drawImage: (image: never, ...args: number[]) => void
  beginPath: () => void
  closePath: () => void
  fill: () => void
  save: () => void
  restore: () => void
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => void
  measureText: (text: string) => { width: number }
}

export interface QrArtOptions {
  /** The rendered QR, already square and including its quiet zone. */
  qr: unknown
  qrSize: number
  /** Optional mark for the middle. Anything with intrinsic dimensions. */
  logo?: { image: unknown; width: number; height: number } | null
  /**
   * Logo width as a share of the code's width. Capped, not trusted: past
   * about a quarter even level H starts failing on worn prints and bad
   * cameras.
   */
  logoScale?: number
  above?: string
  below?: string
  textColour?: string
  background?: string
  /** Pixels per text line, derived from the code size when absent. */
  fontSize?: number
}

/**
 * How far the logo slider goes.
 *
 * Not a safety limit — the safety comes from reading the finished code back
 * with a decoder and saying so. A fixed cap has to assume the worst payload
 * anyone will ever enter, which means everybody else gets a logo smaller
 * than their code could carry. Measured failure points, covering the centre
 * with a solid disc and decoding it back:
 *
 *     payload   L     M     Q     H
 *     short    19%   25%   28%   39%
 *     typical  22%   31%   41%   49%
 *     long     27%   38%   47%   52%
 *
 * So the room available depends entirely on what is encoded. The slider
 * goes to 40% — past where a short payload gives out and short of where a
 * long one does — and the checker decides which side of the line you are on.
 * Level H is forced whenever a logo is present, since L gives up at 19%.
 */
export const MAX_LOGO_SCALE = 0.4

export interface QrArtLayout {
  width: number
  height: number
  qrX: number
  qrY: number
  aboveY: number
  belowY: number
  fontSize: number
  pad: number
}

/**
 * Where everything sits.
 *
 * Captions are placed outside the code entirely rather than over its quiet
 * zone — the four-module margin is part of the specification, and scanners
 * that need it are exactly the cheap ones most likely to be pointed at this.
 */
export function layout(options: QrArtOptions): QrArtLayout {
  const size = options.qrSize
  const fontSize = options.fontSize ?? Math.round(size * 0.055)
  const pad = Math.round(fontSize * 0.7)
  const band = (text?: string) => (text?.trim() ? fontSize + pad : 0)

  const top = band(options.above)
  const bottom = band(options.below)
  return {
    width: size,
    height: size + top + bottom,
    qrX: 0,
    qrY: top,
    aboveY: top / 2,
    belowY: top + size + bottom / 2,
    fontSize,
    pad
  }
}

function roundedRect(
  context: DrawTarget,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
  context.fill()
}

/** Draw the finished thing. The caller owns the canvas and its size. */
export function drawQrArt(context: DrawTarget, options: QrArtOptions): QrArtLayout {
  const plan = layout(options)
  const background = options.background ?? '#ffffff'

  context.fillStyle = background
  context.fillRect(0, 0, plan.width, plan.height)
  context.drawImage(options.qr as never, plan.qrX, plan.qrY, options.qrSize, options.qrSize)

  if (options.logo) {
    const scale = Math.min(MAX_LOGO_SCALE, Math.max(0.05, options.logoScale ?? 0.2))
    const box = options.qrSize * scale
    const { width, height } = options.logo
    const fit = Math.min(box / width, box / height)
    const drawWidth = width * fit
    const drawHeight = height * fit

    const centreX = plan.qrX + options.qrSize / 2
    const centreY = plan.qrY + options.qrSize / 2
    // A pad of clean background behind the mark: a logo sitting directly on
    // the modules leaves half-covered squares around its edge, which reads
    // worse than a slightly larger clear area.
    const padding = Math.round(box * 0.12)
    const plateWidth = drawWidth + padding * 2
    const plateHeight = drawHeight + padding * 2
    context.save()
    context.fillStyle = background
    roundedRect(
      context,
      centreX - plateWidth / 2,
      centreY - plateHeight / 2,
      plateWidth,
      plateHeight,
      Math.round(plateWidth * 0.14)
    )
    context.restore()

    context.drawImage(
      options.logo.image as never,
      centreX - drawWidth / 2,
      centreY - drawHeight / 2,
      drawWidth,
      drawHeight
    )
  }

  const colour = options.textColour ?? '#1c1917'
  context.fillStyle = colour
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `600 ${plan.fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`

  if (options.above?.trim()) context.fillText(options.above.trim(), plan.width / 2, plan.aboveY)
  if (options.below?.trim()) context.fillText(options.below.trim(), plan.width / 2, plan.belowY)

  return plan
}
