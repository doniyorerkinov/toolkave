import type { CropRect } from '~/composables/useImage'
import { decodeImage } from '~/composables/useImage'

/**
 * A rectangle dragged over a picture.
 *
 * Three tools now let someone choose part of an image with a mouse or a
 * finger, and each of them needs the same unglamorous half: decode, fit the
 * canvas to the space available, map pointer positions back to source
 * pixels, move the frame, resize it from a corner without letting it escape
 * the picture. Only the drawing differs, so only the drawing is left to the
 * caller.
 */

export type Grip = 'nw' | 'ne' | 'sw' | 'se'

const CURSOR: Record<Grip, string> = {
  nw: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  se: 'nwse-resize'
}

export interface CropFrameOptions {
  /** Width over height the frame is locked to; null leaves it free. */
  ratio: Ref<number | null> | ComputedRef<number | null>
  /** Radius of the corner grips, in displayed pixels. */
  handle?: number
  /** Longest displayed edge, before the container's width is taken into account. */
  maxWidth?: number
  maxHeight?: number
  /** Called after every change, with the frame in displayed pixels. */
  draw: (context: CanvasRenderingContext2D, box: CropRect) => void
}

export function useCropFrame(options: CropFrameOptions) {
  const handle = options.handle ?? 11
  const canvas = ref<HTMLCanvasElement | null>(null)
  const source = ref<{ width: number; height: number } | null>(null)
  const frame = ref<CropRect>({ x: 0, y: 0, width: 0, height: 0 })
  const cursor = ref('move')

  let bitmap: ImageBitmap | null = null
  /** Source pixels per displayed pixel. */
  let scale = 1

  /** Source rectangle → displayed rectangle. */
  function toDisplay(rect: CropRect): CropRect {
    return {
      x: rect.x / scale,
      y: rect.y / scale,
      width: rect.width / scale,
      height: rect.height / scale
    }
  }

  function paint() {
    const el = canvas.value
    if (!el || !bitmap) return
    const context = el.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, el.width, el.height)
    context.drawImage(bitmap, 0, 0, el.width, el.height)
    options.draw(context, toDisplay(frame.value))
  }

  /** The largest frame of the required shape that fits, centred. */
  function refit() {
    if (!bitmap) return
    const ratio = options.ratio.value
    if (!ratio) {
      frame.value = { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
      return
    }
    let width = bitmap.width
    let height = width / ratio
    if (height > bitmap.height) {
      height = bitmap.height
      width = height * ratio
    }
    frame.value = {
      x: (bitmap.width - width) / 2,
      y: (bitmap.height - height) / 2,
      width,
      height
    }
  }

  /** Takes anything carrying image bytes, so a caller may hand over a
   * rasterised copy of something the browser cannot decode directly. */
  async function load(file: { data: Uint8Array } | null) {
    bitmap?.close()
    bitmap = null
    source.value = null
    if (!file) return
    bitmap = await decodeImage(file.data)
    source.value = { width: bitmap.width, height: bitmap.height }
    const room = Math.max(240, Math.min(options.maxWidth ?? 560, canvas.value?.parentElement?.clientWidth ?? 560))
    scale = Math.max(bitmap.width / room, bitmap.height / (options.maxHeight ?? 520), 1)
    await nextTick()
    if (canvas.value) {
      canvas.value.width = Math.round(bitmap.width / scale)
      canvas.value.height = Math.round(bitmap.height / scale)
    }
    refit()
    paint()
  }

  interface Drag {
    grip: Grip | null
    originX: number
    originY: number
    start: CropRect
  }
  let drag: Drag | null = null

  /** Pointer position in source pixels, or null when the canvas has no size. */
  function at(event: PointerEvent): { x: number; y: number } | null {
    const el = canvas.value
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    return {
      x: ((event.clientX - rect.left) / rect.width) * el.width * scale,
      y: ((event.clientY - rect.top) / rect.height) * el.height * scale
    }
  }

  function gripAt(x: number, y: number): Grip | null {
    const reach = (handle / 2 + 5) * scale
    const box = frame.value
    const near = (px: number, py: number) => Math.hypot(x - px, y - py) <= reach
    if (near(box.x, box.y)) return 'nw'
    if (near(box.x + box.width, box.y)) return 'ne'
    if (near(box.x, box.y + box.height)) return 'sw'
    if (near(box.x + box.width, box.y + box.height)) return 'se'
    return null
  }

  /**
   * Resize from a corner. The opposite corner is the anchor, so the frame
   * follows the pointer; when a shape is locked, the frame shrinks to stay
   * inside the picture rather than having an edge clamped, which would
   * quietly change its proportions.
   */
  function resizeFrom(grip: Grip, point: { x: number; y: number }) {
    if (!bitmap || !drag) return
    const start = drag.start
    const anchorX = grip === 'nw' || grip === 'sw' ? start.x + start.width : start.x
    const anchorY = grip === 'nw' || grip === 'ne' ? start.y + start.height : start.y
    const ratio = options.ratio.value

    let width = Math.abs(point.x - anchorX)
    let height = Math.abs(point.y - anchorY)
    if (ratio) {
      if (width / ratio > height) width = height * ratio
      height = width / ratio
    }

    let left = grip === 'nw' || grip === 'sw' ? anchorX - width : anchorX
    let top = grip === 'nw' || grip === 'ne' ? anchorY - height : anchorY

    const shrink = Math.max(
      1,
      left < 0 ? width / (width + left) : 1,
      top < 0 ? height / (height + top) : 1,
      left + width > bitmap.width ? width / (bitmap.width - left) : 1,
      top + height > bitmap.height ? height / (bitmap.height - top) : 1
    )
    if (!Number.isFinite(shrink) || shrink <= 0) return
    width /= shrink
    height /= shrink
    if (width < 40 || height < 40) return

    left = grip === 'nw' || grip === 'sw' ? anchorX - width : anchorX
    top = grip === 'nw' || grip === 'ne' ? anchorY - height : anchorY
    frame.value = { x: left, y: top, width, height }
  }

  function onPointerDown(event: PointerEvent) {
    const point = at(event)
    if (!point || !bitmap) return
    // Otherwise the browser starts its own image drag halfway through ours.
    event.preventDefault()
    canvas.value?.setPointerCapture(event.pointerId)
    drag = { grip: gripAt(point.x, point.y), originX: point.x, originY: point.y, start: { ...frame.value } }
  }

  function onPointerMove(event: PointerEvent) {
    const point = at(event)
    if (!point || !bitmap) return
    if (!drag) {
      const grip = gripAt(point.x, point.y)
      cursor.value = grip ? CURSOR[grip] : 'move'
      return
    }
    if (drag.grip) {
      resizeFrom(drag.grip, point)
      return
    }
    const start = drag.start
    frame.value = {
      ...start,
      x: Math.min(Math.max(0, start.x + point.x - drag.originX), bitmap.width - start.width),
      y: Math.min(Math.max(0, start.y + point.y - drag.originY), bitmap.height - start.height)
    }
  }

  function onPointerUp(event: PointerEvent) {
    canvas.value?.releasePointerCapture(event.pointerId)
    drag = null
  }

  /** The frame rounded to whole source pixels, ready to hand to a crop. */
  function rect(): CropRect {
    return {
      x: Math.round(frame.value.x),
      y: Math.round(frame.value.y),
      width: Math.round(frame.value.width),
      height: Math.round(frame.value.height)
    }
  }

  watch(frame, paint, { deep: true })
  watch(options.ratio, () => {
    refit()
    paint()
  })
  onBeforeUnmount(() => bitmap?.close())

  return {
    canvas,
    source,
    frame,
    cursor,
    load,
    refit,
    paint,
    rect,
    toDisplay,
    handlers: {
      onPointerdown: onPointerDown,
      onPointermove: onPointerMove,
      onPointerup: onPointerUp,
      onPointercancel: onPointerUp
    }
  }
}
