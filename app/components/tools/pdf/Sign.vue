<script setup lang="ts">
import { usePdfWorker } from '~/composables/usePdfWorker'
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * Draw a signature, then put it where it belongs.
 *
 * Placement happens on the page itself rather than through percentage
 * sliders: signing is the one job where seeing the result before committing
 * matters more than precision in the numbers. The signature is trimmed to its
 * ink first, so the box drawn on the page is exactly what the finished PDF
 * gets - not a pad with transparent margins around it.
 */
const { t } = useI18n()
const store = useFilesStore()
const { getThumbnails } = usePdfWorker()

const pageCount = ref(0)
const currentPage = ref(0)
const infoError = ref(false)

const file = computed(() => store.files[0] ?? null)

/* ---- the signature itself ---- */

const padEl = ref<HTMLCanvasElement | null>(null)
const hasInk = ref(false)
/** Bumped on every stroke, so the trimmed copy and the preview follow the ink. */
const inkVersion = ref(0)

let drawing = false
let padContext: CanvasRenderingContext2D | null = null

function setupPad() {
  const element = padEl.value
  if (!element) return

  // Resizing the backing store wipes it, and on a phone a resize fires when
  // the keyboard opens or the device turns. Keep what has been drawn so a
  // signature never silently vanishes between drawing it and placing it.
  let previous: HTMLCanvasElement | null = null
  if (hasInk.value && element.width && element.height) {
    previous = document.createElement('canvas')
    previous.width = element.width
    previous.height = element.height
    previous.getContext('2d')?.drawImage(element, 0, 0)
  }

  const ratio = window.devicePixelRatio || 1
  const rect = element.getBoundingClientRect()
  element.width = Math.round(rect.width * ratio)
  element.height = Math.round(rect.height * ratio)

  padContext = element.getContext('2d')
  if (!padContext) return
  padContext.scale(ratio, ratio)
  if (previous) padContext.drawImage(previous, 0, 0, rect.width, rect.height)
  padContext.lineWidth = 2.5
  padContext.lineCap = 'round'
  padContext.lineJoin = 'round'
  padContext.strokeStyle = '#0f172a'
}

onMounted(() => {
  setupPad()
  window.addEventListener('resize', setupPad)
})
onBeforeUnmount(() => window.removeEventListener('resize', setupPad))

function padPoint(event: PointerEvent) {
  const rect = padEl.value!.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function padDown(event: PointerEvent) {
  if (!padContext) setupPad()
  if (!padContext) return
  drawing = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  const { x, y } = padPoint(event)
  padContext.beginPath()
  padContext.moveTo(x, y)
  event.preventDefault()
}

function padMove(event: PointerEvent) {
  if (!drawing || !padContext) return
  const { x, y } = padPoint(event)
  padContext.lineTo(x, y)
  padContext.stroke()
  hasInk.value = true
}

function padUp(event: PointerEvent) {
  if (!drawing) return
  drawing = false
  inkVersion.value++
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
}

function clearInk() {
  const element = padEl.value
  if (!element || !padContext) return
  padContext.clearRect(0, 0, element.width, element.height)
  hasInk.value = false
  inkVersion.value++
}

/**
 * The pad cropped to its ink. Everything downstream - the box on the page and
 * the image embedded in the PDF - uses this, so the two cannot disagree.
 */
const trimmed = shallowRef<HTMLCanvasElement | null>(null)

function trimSignature(): HTMLCanvasElement | null {
  const source = padEl.value
  if (!source || !hasInk.value || !source.width || !source.height) return null
  const context = source.getContext('2d')
  if (!context) return null

  const { data } = context.getImageData(0, 0, source.width, source.height)
  let top = source.height
  let left = source.width
  let right = -1
  let bottom = -1
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (data[(y * source.width + x) * 4 + 3]! < 8) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0) return null

  // A few pixels of air, so the strokes are not clipped at the edge.
  const pad = 4
  left = Math.max(0, left - pad)
  top = Math.max(0, top - pad)
  right = Math.min(source.width - 1, right + pad)
  bottom = Math.min(source.height - 1, bottom + pad)

  const out = document.createElement('canvas')
  out.width = right - left + 1
  out.height = bottom - top + 1
  out.getContext('2d')?.drawImage(source, left, top, out.width, out.height, 0, 0, out.width, out.height)
  return out
}

/* ---- the page underneath ---- */

const bitmaps = new Map<number, { bitmap: ImageBitmap; width: number; height: number }>()
const loadingPage = ref(false)

function closeAllBitmaps() {
  for (const entry of bitmaps.values()) entry.bitmap.close()
  bitmaps.clear()
}
onBeforeUnmount(closeAllBitmaps)

async function ensurePageImage(page: number) {
  if (bitmaps.has(page) || !file.value) return
  loadingPage.value = true
  try {
    await getThumbnails(file.value.data, [page + 1], 900, thumb => {
      bitmaps.set(page, { bitmap: thumb.bitmap, width: thumb.width, height: thumb.height })
    })
  } catch {
    // Without the picture there is nothing to aim at; the error line covers it.
  } finally {
    loadingPage.value = false
    redraw()
  }
}

/* ---- placement: top-left corner and width, as fractions of the page ---- */

interface Placement { x: number; y: number; width: number }
const placement = ref<Placement | null>(null)
const pageEl = ref<HTMLCanvasElement | null>(null)

/** Height of the placed signature as a fraction of the page, from its aspect. */
const heightRatio = computed(() => {
  const signature = trimmed.value
  const entry = bitmaps.get(currentPage.value)
  if (!signature || !entry || !placement.value) return 0
  const widthPx = placement.value.width * entry.width
  return (widthPx * (signature.height / signature.width)) / entry.height
})

/** The committed placement in canvas pixels. */
function placedBox() {
  const entry = bitmaps.get(currentPage.value)
  const current = placement.value
  if (!entry || !current) return null
  return {
    x: current.x * entry.width,
    y: current.y * entry.height,
    width: current.width * entry.width,
    height: heightRatio.value * entry.height
  }
}

type Mode = 'draw' | 'move' | 'resize'
let mode: Mode | null = null
let anchor: { x: number; y: number } | null = null
let cursor: { x: number; y: number } | null = null

/** The rubber band while a new area is being drawn, in canvas pixels. */
function dragBox() {
  const entry = bitmaps.get(currentPage.value)
  if (mode !== 'draw' || !anchor || !cursor || !entry) return null
  const signature = trimmed.value
  const width = Math.abs(cursor.x - anchor.x) * entry.width
  return {
    x: Math.min(anchor.x, cursor.x) * entry.width,
    y: Math.min(anchor.y, cursor.y) * entry.height,
    width,
    height: signature ? width * (signature.height / signature.width) : Math.abs(cursor.y - anchor.y) * entry.height
  }
}

function redraw() {
  const canvas = pageEl.value
  if (!canvas) return
  const entry = bitmaps.get(currentPage.value)
  if (entry) {
    canvas.width = entry.width
    canvas.height = entry.height
  }
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  if (entry) context.drawImage(entry.bitmap, 0, 0)

  const box = dragBox() ?? placedBox()
  if (!box) return

  const signature = trimmed.value
  if (signature) context.drawImage(signature, box.x, box.y, box.width, box.height)

  // The frame stays visible while positioning, so the exact area is obvious
  // even where the ink is thin.
  context.strokeStyle = '#f27d14'
  context.lineWidth = Math.max(2, canvas.width / 400)
  context.setLineDash([canvas.width / 90, canvas.width / 90])
  context.strokeRect(box.x, box.y, box.width, box.height)
  context.setLineDash([])

  // Corner grip, drawn last so it sits on top of the frame.
  const grip = Math.max(10, canvas.width / 55)
  context.fillStyle = '#f27d14'
  context.fillRect(box.x + box.width - grip, box.y + box.height - grip, grip, grip)
}

watch(inkVersion, () => {
  trimmed.value = trimSignature()
  redraw()
})

watch(
  file,
  async current => {
    pageCount.value = 0
    currentPage.value = 0
    placement.value = null
    infoError.value = false
    closeAllBitmaps()
    if (!current) return
    try {
      pageCount.value = (await readPdfInfo(current)).pageCount
      // The placement canvas only exists once pageCount is set, and drawing
      // into it before Vue has patched the DOM paints into nothing.
      await nextTick()
      await ensurePageImage(0)
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

watch(currentPage, page => {
  ensurePageImage(page)
  redraw()
})

function pagePoint(event: PointerEvent) {
  const rect = pageEl.value!.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  }
}

const MIN_WIDTH = 0.04

function pageDown(event: PointerEvent) {
  if (!hasInk.value || !bitmaps.has(currentPage.value)) return
  const point = pagePoint(event)
  const current = placement.value
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()

  if (current) {
    const right = current.x + current.width
    const bottom = current.y + heightRatio.value
    const grip = 0.035
    if (point.x > right - grip && point.x < right + grip && point.y > bottom - grip && point.y < bottom + grip) {
      mode = 'resize'
      return
    }
    if (point.x >= current.x && point.x <= right && point.y >= current.y && point.y <= bottom) {
      mode = 'move'
      anchor = { x: point.x - current.x, y: point.y - current.y }
      return
    }
  }
  mode = 'draw'
  anchor = point
  cursor = point
}

function pageMove(event: PointerEvent) {
  if (!mode) return
  const point = pagePoint(event)
  const current = placement.value

  if (mode === 'draw') {
    cursor = point
  } else if (mode === 'move' && current && anchor) {
    placement.value = {
      ...current,
      x: Math.min(1 - current.width, Math.max(0, point.x - anchor.x)),
      y: Math.min(1 - heightRatio.value, Math.max(0, point.y - anchor.y))
    }
  } else if (mode === 'resize' && current) {
    placement.value = { ...current, width: Math.min(1 - current.x, Math.max(MIN_WIDTH, point.x - current.x)) }
  }
  redraw()
}

function pageUp(event: PointerEvent) {
  if (mode === 'draw' && anchor && cursor) {
    const width = Math.abs(cursor.x - anchor.x)
    const x = Math.min(anchor.x, cursor.x)
    const y = Math.min(anchor.y, cursor.y)
    // A tap rather than a drag: keep the size already chosen and just move it.
    if (width < MIN_WIDTH) {
      const kept = placement.value?.width ?? 0.28
      placement.value = { x: Math.min(1 - kept, x), y, width: kept }
    } else {
      placement.value = { x, y, width: Math.min(width, 1 - x) }
    }
  }
  mode = null
  anchor = null
  cursor = null
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  redraw()
}

/** Once there is ink and a page, offer a spot over the usual signature line. */
watch(
  [hasInk, pageCount, trimmed],
  () => {
    if (hasInk.value && pageCount.value && !placement.value) {
      placement.value = { x: 0.58, y: 0.76, width: 0.28 }
    }
    redraw()
  },
  // After the DOM is patched, so the canvas is there to draw on.
  { flush: 'post' }
)

const widthPercent = computed({
  get: () => Math.round((placement.value?.width ?? 0.28) * 100),
  set: value => {
    const current = placement.value
    if (!current) return
    placement.value = { ...current, width: Math.max(MIN_WIDTH, Math.min(1 - current.x, value / 100)) }
    redraw()
  }
})

function prevPage() {
  if (currentPage.value > 0) currentPage.value--
}
function nextPage() {
  if (currentPage.value < pageCount.value - 1) currentPage.value++
}

const canRun = computed(
  () => !!file.value && !!pageCount.value && hasInk.value && !!placement.value && !store.busy
)

async function run() {
  if (!canRun.value || !file.value || !placement.value) return
  const signature = trimmed.value ?? trimSignature()
  if (!signature) return
  store.busy = true
  store.error = null
  try {
    // Transparent PNG, so the signature sits over the page rather than in a box.
    const blob = await new Promise<Blob | null>(resolve => signature.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('canvas')

    const data = await signPdf(file.value, {
      image: new Uint8Array(await blob.arrayBuffer()),
      pageIndex: currentPage.value,
      xRatio: placement.value.x,
      yRatio: placement.value.y,
      widthRatio: placement.value.width
    })

    store.setResult({
      name: withSuffix(file.value.name, '-signed'),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size,
      note: t('pdf.sign.placedOn', { n: currentPage.value + 1 })
    })
  } catch (error) {
    store.error = t(pdfErrorKey(error))
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      v-if="!file"
      accept="application/pdf"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="infoError" class="text-sm text-red-700" role="alert">{{ t('pdf.errorRead') }}</p>

    <template v-else-if="file && pageCount">
      <div>
        <p class="mb-1 text-sm font-medium text-stone-900">
          <span class="mr-1.5 inline-flex size-5 items-center justify-center rounded-full bg-ink text-xs font-semibold text-on-ink">1</span>
          {{ t('pdf.sign.drawLabel') }}
        </p>
        <canvas
          ref="padEl"
          class="h-40 w-full touch-none rounded-lg border-2 border-dashed border-stone-300 bg-white"
          @pointerdown="padDown"
          @pointermove="padMove"
          @pointerup="padUp"
          @pointercancel="padUp"
        />
        <div class="mt-2 flex items-center justify-between gap-2">
          <p class="text-sm text-stone-500">{{ t('pdf.sign.drawHint') }}</p>
          <button
            type="button"
            :disabled="!hasInk"
            class="rounded border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            @click="clearInk"
          >
            {{ t('pdf.sign.clear') }}
          </button>
        </div>
      </div>

      <div>
        <p class="mb-1 text-sm font-medium text-stone-900">
          <span
            class="mr-1.5 inline-flex size-5 items-center justify-center rounded-full text-xs font-semibold text-white"
            :class="hasInk ? 'bg-stone-900' : 'bg-stone-300'"
          >2</span>
          {{ t('pdf.sign.placeLabel') }}
        </p>
        <p class="mb-2 text-sm text-stone-500">
          {{ hasInk ? t('pdf.sign.placeHint') : t('pdf.sign.drawFirst') }}
        </p>

        <div v-if="pageCount > 1" class="mb-2 flex items-center gap-2">
          <button
            type="button"
            class="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            :disabled="currentPage === 0"
            :aria-label="t('result.prevPage')"
            @click="prevPage"
          >
            ‹
          </button>
          <span class="text-sm text-stone-600">
            {{ t('pdf.sign.pageOf', { n: currentPage + 1, count: pageCount }) }}
          </span>
          <button
            type="button"
            class="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            :disabled="currentPage === pageCount - 1"
            :aria-label="t('result.nextPage')"
            @click="nextPage"
          >
            ›
          </button>
        </div>

        <div class="relative overflow-hidden rounded-lg border border-stone-300 bg-stone-100">
          <canvas
            ref="pageEl"
            class="block w-full touch-none"
            :class="hasInk ? 'cursor-crosshair' : 'cursor-not-allowed'"
            @pointerdown="pageDown"
            @pointermove="pageMove"
            @pointerup="pageUp"
            @pointercancel="pageUp"
          />
          <p v-if="loadingPage" class="absolute inset-0 flex items-center justify-center text-sm text-stone-500">
            {{ t('pdf.sign.loadingPreview') }}
          </p>
        </div>

        <div v-if="placement" class="mt-3">
          <label for="sg-w" class="block text-sm font-medium text-stone-900">
            {{ t('pdf.sign.width', { n: widthPercent }) }}
          </label>
          <input
            id="sg-w"
            v-model.number="widthPercent"
            type="range"
            min="5"
            max="80"
            class="mt-2 w-full accent-ember-700"
          />
        </div>
      </div>

      <p class="text-sm text-amber-800">{{ t('pdf.sign.legalNote') }}</p>
    </template>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.sign.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
        @click="store.reset()"
      >
        {{ t('result.startOver') }}
      </button>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard
      v-if="store.result"
      :result="store.result"
      @reset="store.reset()"
      @chain="store.chainResult()"
    />
  </div>
</template>
