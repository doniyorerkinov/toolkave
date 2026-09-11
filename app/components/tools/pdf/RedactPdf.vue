<script setup lang="ts">
import { usePdfWorker } from '~/composables/usePdfWorker'
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * Permanently blacks out an area of a page.
 *
 * The one thing a redaction tool must never do is leave the hidden content
 * recoverable — a black box drawn *on top of* live text still leaves that
 * text selectable and copyable underneath it, which is the exact failure
 * behind real, public redaction mistakes. So this does not draw on top of
 * the page's real content the way Annotate does. Instead: any page with a
 * redaction box gets rendered to a flat image with the box painted directly
 * onto those pixels *before* anything is re-encoded, and that image replaces
 * the entire page — text layer, form fields, everything. There is nothing
 * left behind the box to extract. Pages nobody drew a box on are left
 * completely untouched, real text intact.
 *
 * The cost of that guarantee is real and is stated on the page rather than
 * hidden: a redacted page's text stops being selectable and searchable,
 * because it is no longer text. That is the trade a genuine redaction tool
 * has to make.
 */

const { t } = useI18n()
const store = useFilesStore()
// One worker instance for both calls — a second usePdfWorker() would spin up
// a second Worker for no reason.
const { rasterizePages, getThumbnails } = usePdfWorker()

const pageCount = ref(0)
const currentPage = ref(0)
const infoError = ref(false)
const progress = ref(0)
const progressTotal = ref(0)

interface Box {
  x: number
  y: number
  width: number
  height: number
}
const boxesByPage = ref(new Map<number, Box[]>())

/* ---- background preview per page ----
 * Declared before the file watcher below, which calls closeAllBitmaps() as
 * soon as it runs — with {immediate: true} that happens synchronously during
 * setup, so the Map it closes over has to already exist by then. */

const bitmaps = new Map<number, { bitmap: ImageBitmap; width: number; height: number }>()
const loadingPage = ref(false)

function closeAllBitmaps() {
  for (const entry of bitmaps.values()) entry.bitmap.close()
  bitmaps.clear()
}
onBeforeUnmount(closeAllBitmaps)

const file = computed(() => store.files[0] ?? null)

watch(
  file,
  async current => {
    pageCount.value = 0
    currentPage.value = 0
    boxesByPage.value = new Map()
    infoError.value = false
    closeAllBitmaps()
    if (!current) return
    try {
      pageCount.value = (await readPdfInfo(current)).pageCount
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

async function ensurePageImage(page: number) {
  if (bitmaps.has(page) || !file.value) return
  loadingPage.value = true
  try {
    await getThumbnails(file.value.data, [page + 1], 900, thumb => {
      bitmaps.set(page, { bitmap: thumb.bitmap, width: thumb.width, height: thumb.height })
    })
  } catch {
    // Drawing still works without the preview image underneath.
  } finally {
    loadingPage.value = false
    redraw()
  }
}

watch(currentPage, page => {
  ensurePageImage(page)
  redraw()
})

/* ---- canvas: background + boxes, solid black — what you see is exactly what gets baked in ---- */

const canvasEl = ref<HTMLCanvasElement | null>(null)
let dragStart: { x: number; y: number } | null = null
let dragCurrent: { x: number; y: number } | null = null

function fitCanvasToImage() {
  const canvas = canvasEl.value
  const entry = bitmaps.get(currentPage.value)
  if (!canvas || !entry) return
  canvas.width = entry.width
  canvas.height = entry.height
}

function redraw() {
  const canvas = canvasEl.value
  if (!canvas) return
  fitCanvasToImage()
  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, canvas.width, canvas.height)
  const entry = bitmaps.get(currentPage.value)
  if (entry) context.drawImage(entry.bitmap, 0, 0, canvas.width, canvas.height)
  else {
    context.fillStyle = '#f1f5f9'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  context.fillStyle = '#000000'
  for (const box of boxesByPage.value.get(currentPage.value) ?? []) {
    context.fillRect(box.x * canvas.width, box.y * canvas.height, box.width * canvas.width, box.height * canvas.height)
  }
  if (dragStart && dragCurrent) {
    const box = boxFromDrag(dragStart, dragCurrent)
    context.fillRect(box.x * canvas.width, box.y * canvas.height, box.width * canvas.width, box.height * canvas.height)
  }
}

function boxFromDrag(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
}

function pointFromEvent(event: PointerEvent) {
  const rect = canvasEl.value!.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  }
}

const MIN_BOX_SIZE = 0.01

function onPointerDown(event: PointerEvent) {
  if (!bitmaps.has(currentPage.value)) return
  dragStart = pointFromEvent(event)
  dragCurrent = dragStart
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}
function onPointerMove(event: PointerEvent) {
  if (!dragStart) return
  dragCurrent = pointFromEvent(event)
  redraw()
}
function onPointerUp(event: PointerEvent) {
  if (!dragStart || !dragCurrent) return
  const box = boxFromDrag(dragStart, dragCurrent)
  if (box.width > MIN_BOX_SIZE && box.height > MIN_BOX_SIZE) {
    const next = new Map(boxesByPage.value)
    next.set(currentPage.value, [...(next.get(currentPage.value) ?? []), box])
    boxesByPage.value = next
  }
  dragStart = null
  dragCurrent = null
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  redraw()
}

const onThisPage = computed(() => boxesByPage.value.get(currentPage.value) ?? [])
const totalBoxes = computed(() => [...boxesByPage.value.values()].reduce((sum, list) => sum + list.length, 0))
const affectedPageCount = computed(() => [...boxesByPage.value.values()].filter(list => list.length > 0).length)

function undoLast() {
  const current = boxesByPage.value.get(currentPage.value)
  if (!current?.length) return
  const next = new Map(boxesByPage.value)
  next.set(currentPage.value, current.slice(0, -1))
  boxesByPage.value = next
  redraw()
}
function clearPage() {
  const next = new Map(boxesByPage.value)
  next.delete(currentPage.value)
  boxesByPage.value = next
  redraw()
}

function prevPage() {
  if (currentPage.value > 0) currentPage.value--
}
function nextPage() {
  if (currentPage.value < pageCount.value - 1) currentPage.value++
}

/* ---- apply: rasterise affected pages, paint boxes onto real pixels, replace those pages ---- */

const RASTER_DIMENSION = 2000
const canRun = computed(() => !!file.value && totalBoxes.value > 0 && !store.busy)

async function paintBoxes(jpegBytes: Uint8Array, boxes: Box[]): Promise<Uint8Array> {
  const blob = new Blob([jpegBytes as BlobPart], { type: 'image/jpeg' })
  const bitmap = await createImageBitmap(blob)

  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas unavailable')

  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  // Painted directly onto the decoded pixels, before any re-encoding — the
  // box overwrites whatever was there, not merely covers it.
  context.fillStyle = '#000000'
  for (const box of boxes) {
    context.fillRect(box.x * canvas.width, box.y * canvas.height, box.width * canvas.width, box.height * canvas.height)
  }

  const outBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  if (!outBlob) throw new Error('encode failed')
  return new Uint8Array(await outBlob.arrayBuffer())
}

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  progress.value = 0
  progressTotal.value = affectedPageCount.value

  try {
    const affectedPages = [...boxesByPage.value.entries()]
      .filter(([, boxes]) => boxes.length > 0)
      .map(([page]) => page)
      .sort((a, b) => a - b)

    const rasterised = new Map<number, { data: Uint8Array; width: number; height: number }>()
    await rasterizePages(
      file.value.data,
      affectedPages.map(page => page + 1),
      RASTER_DIMENSION,
      0.92,
      raster => rasterised.set(raster.page - 1, raster),
      { onProgress: done => (progress.value = done) }
    )

    const images = []
    for (const page of affectedPages) {
      const raster = rasterised.get(page)
      const boxes = boxesByPage.value.get(page) ?? []
      if (!raster || !boxes.length) continue
      const data = await paintBoxes(raster.data, boxes)
      images.push({ page, data, mimeType: 'image/jpeg' as const })
    }

    const data = await replacePagesWithImages(file.value, images)
    store.setResult({
      name: withSuffix(file.value.name, '-redacted'),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size
    })
  } catch (error) {
    store.error = t(pdfErrorKey(error))
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  boxesByPage.value = new Map()
  store.add(files.slice(0, 1))
}
</script>

<template>
  <div class="space-y-4">
    <!--
      The single most important sentence on this page. It goes first, before
      the file is even chosen, not folded into the FAQ where it is easy to
      skip — a redaction tool's limitations have to be seen, not discovered.
    -->
    <p class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {{ t('pdf.redact.safetyNotice') }}
    </p>

    <ShellFileDropzone v-if="!file" accept="application/pdf" :multiple="false" @files="onFiles($event)" />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="infoError" class="text-sm text-red-700" role="alert">{{ t('pdf.errorRead') }}</p>

    <template v-else-if="file && pageCount">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
          :disabled="currentPage === 0"
          @click="prevPage"
        >
          ‹
        </button>
        <span class="text-sm text-stone-600">{{ t('pdf.redact.page', { n: currentPage + 1, count: pageCount }) }}</span>
        <button
          type="button"
          class="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
          :disabled="currentPage === pageCount - 1"
          @click="nextPage"
        >
          ›
        </button>
      </div>

      <div class="relative overflow-hidden rounded-lg border border-stone-300 bg-stone-100">
        <canvas
          ref="canvasEl"
          class="block w-full touch-none cursor-crosshair"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        />
        <p v-if="loadingPage" class="absolute inset-0 flex items-center justify-center text-sm text-stone-500">
          {{ t('pdf.redact.loadingPreview') }}
        </p>
      </div>

      <div v-if="onThisPage.length" class="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600">
        <span>{{ t('pdf.redact.onThisPage', { n: onThisPage.length }) }}</span>
        <div class="flex gap-3">
          <button type="button" class="text-xs font-medium text-ember-700 hover:underline" @click="undoLast">
            {{ t('pdf.redact.undo') }}
          </button>
          <button type="button" class="text-xs font-medium text-ember-700 hover:underline" @click="clearPage">
            {{ t('pdf.redact.clearPage') }}
          </button>
        </div>
      </div>
    </template>

    <div v-if="store.busy && progressTotal" class="space-y-1">
      <div class="h-2 w-full overflow-hidden rounded-full bg-stone-200">
        <div class="h-full rounded-full bg-ember-600 transition-all" :style="{ width: `${(progress / progressTotal) * 100}%` }" />
      </div>
      <p class="text-xs text-stone-500">{{ t('pdf.redact.progress', { done: progress, total: progressTotal }) }}</p>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-red-700 px-5 py-2.5 font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.redact.action', { n: totalBoxes }) }}
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
