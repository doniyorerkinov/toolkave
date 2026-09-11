<script setup lang="ts">
import { isLatin1 } from '~/composables/usePdf'
import { usePdfWorker } from '~/composables/usePdfWorker'
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'
import type { Annotation, HighlightAnnotation, NoteAnnotation } from '~/composables/usePdf'

/**
 * Highlights and short text notes drawn directly on the rendered page, then
 * baked in as real page content — additive only, nothing already on the page
 * is touched. (Redaction is deliberately a separate tool: hiding sensitive
 * content safely needs a different, more conservative mechanism than drawing
 * on top of live text — see RedactPdf.)
 */

const { t } = useI18n()
const store = useFilesStore()
const { getThumbnails } = usePdfWorker()

const pageCount = ref(0)
const currentPage = ref(0) // zero-based
const infoError = ref(false)
const mode = ref<'highlight' | 'note'>('highlight')
const annotations = ref<Annotation[]>([])
const notesSkippedLast = ref(0)

/* ---- background thumbnail per page, cached ----
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
    annotations.value = []
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
    // Drawing still works without a background image; the user just loses
    // the visual reference and places shapes by feel.
  } finally {
    loadingPage.value = false
    redraw()
  }
}

watch(currentPage, page => {
  ensurePageImage(page)
  redraw()
})

/* ---- canvas: background + existing shapes + live drag ---- */

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
  if (entry) {
    context.drawImage(entry.bitmap, 0, 0, canvas.width, canvas.height)
  } else {
    context.fillStyle = '#f1f5f9'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  for (const annotation of annotations.value) {
    if (annotation.page !== currentPage.value) continue
    if (annotation.kind === 'highlight') drawHighlight(context, canvas, annotation)
    else drawNoteMarker(context, canvas, annotation)
  }

  if (mode.value === 'highlight' && dragStart && dragCurrent) {
    drawHighlight(context, canvas, boxFromDrag(dragStart, dragCurrent))
  }
}

function drawHighlight(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  box: Pick<HighlightAnnotation, 'x' | 'y' | 'width' | 'height'>
) {
  context.fillStyle = 'rgba(255, 224, 40, 0.45)'
  context.strokeStyle = 'rgba(217, 160, 0, 0.8)'
  context.lineWidth = 1.5
  const x = box.x * canvas.width
  const y = box.y * canvas.height
  const width = box.width * canvas.width
  const height = box.height * canvas.height
  context.fillRect(x, y, width, height)
  context.strokeRect(x, y, width, height)
}

function drawNoteMarker(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, note: NoteAnnotation) {
  const x = note.x * canvas.width
  const y = note.y * canvas.height
  context.fillStyle = '#f59e0b'
  context.beginPath()
  context.arc(x, y, 6, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = '#78350f'
  context.lineWidth = 1
  context.stroke()
}

function boxFromDrag(a: { x: number; y: number }, b: { x: number; y: number }) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  }
}

function pointFromEvent(event: PointerEvent): { x: number; y: number } {
  const canvas = canvasEl.value!
  const rect = canvas.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  }
}

const MIN_BOX_SIZE = 0.01

function onPointerDown(event: PointerEvent) {
  if (!bitmaps.has(currentPage.value)) return
  if (mode.value === 'note') {
    pendingNote.value = pointFromEvent(event)
    noteText.value = ''
    return
  }
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
    annotations.value = [...annotations.value, { kind: 'highlight', page: currentPage.value, ...box }]
  }
  dragStart = null
  dragCurrent = null
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  redraw()
}

/* ---- note placement ---- */

const pendingNote = ref<{ x: number; y: number } | null>(null)
const noteText = ref('')
const noteTooLong = computed(() => noteText.value.length > 140)
const noteInvalidChars = computed(() => !!noteText.value && !isLatin1(noteText.value))

function confirmNote() {
  if (!pendingNote.value || !noteText.value.trim() || noteInvalidChars.value || noteTooLong.value) return
  annotations.value = [
    ...annotations.value,
    { kind: 'note', page: currentPage.value, x: pendingNote.value.x, y: pendingNote.value.y, text: noteText.value.trim() }
  ]
  pendingNote.value = null
  noteText.value = ''
  redraw()
}

function cancelNote() {
  pendingNote.value = null
  noteText.value = ''
}

/* ---- page-level list management ---- */

const onThisPage = computed(() => annotations.value.filter(a => a.page === currentPage.value))

function removeAnnotation(target: Annotation) {
  annotations.value = annotations.value.filter(a => a !== target)
  redraw()
}

function clearPage() {
  annotations.value = annotations.value.filter(a => a.page !== currentPage.value)
  redraw()
}

watch(mode, () => {
  pendingNote.value = null
})

/* ---- apply ---- */

const canRun = computed(() => !!file.value && annotations.value.length > 0 && !store.busy)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const result = await annotatePdf(file.value, annotations.value)
    notesSkippedLast.value = result.notesSkipped
    store.setResult({
      name: withSuffix(file.value.name, '-annotated'),
      type: 'application/pdf',
      data: result.data,
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
  annotations.value = []
  store.add(files.slice(0, 1))
}

function prevPage() {
  if (currentPage.value > 0) currentPage.value--
}
function nextPage() {
  if (currentPage.value < pageCount.value - 1) currentPage.value++
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone v-if="!file" accept="application/pdf" :multiple="false" @files="onFiles($event)" />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="infoError" class="text-sm text-red-700" role="alert">{{ t('pdf.errorRead') }}</p>

    <template v-else-if="file && pageCount">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            :disabled="currentPage === 0"
            @click="prevPage"
          >
            ‹
          </button>
          <span class="text-sm text-stone-600">{{ t('pdf.annotate.page', { n: currentPage + 1, count: pageCount }) }}</span>
          <button
            type="button"
            class="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            :disabled="currentPage === pageCount - 1"
            @click="nextPage"
          >
            ›
          </button>
        </div>

        <div class="flex gap-1 rounded-lg bg-stone-100 p-1">
          <button
            v-for="option in (['highlight', 'note'] as const)"
            :key="option"
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-medium transition"
            :class="mode === option ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'"
            @click="mode = option"
          >
            {{ t(`pdf.annotate.mode.${option}`) }}
          </button>
        </div>
      </div>

      <div class="relative overflow-hidden rounded-lg border border-stone-300 bg-stone-100">
        <canvas
          ref="canvasEl"
          class="block w-full touch-none"
          :class="mode === 'note' ? 'cursor-crosshair' : 'cursor-crosshair'"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        />
        <p v-if="loadingPage" class="absolute inset-0 flex items-center justify-center text-sm text-stone-500">
          {{ t('pdf.annotate.loadingPreview') }}
        </p>
      </div>

      <div v-if="pendingNote" class="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <label for="annotate-note-text" class="block text-sm font-medium text-amber-900">
          {{ t('pdf.annotate.noteLabel') }}
        </label>
        <input
          id="annotate-note-text"
          v-model="noteText"
          type="text"
          maxlength="140"
          class="w-full rounded-lg border border-amber-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          @keyup.enter="confirmNote"
        />
        <p v-if="noteInvalidChars" class="text-xs text-red-700">{{ t('pdf.annotate.latinOnly') }}</p>
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="!noteText.trim() || noteInvalidChars || noteTooLong"
            class="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-stone-300"
            @click="confirmNote"
          >
            {{ t('pdf.annotate.addNote') }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
            @click="cancelNote"
          >
            {{ t('pdf.annotate.cancelNote') }}
          </button>
        </div>
      </div>

      <div v-if="onThisPage.length" class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600">
          <span>{{ t('pdf.annotate.onThisPage', { n: onThisPage.length }) }}</span>
          <button type="button" class="text-xs font-medium text-ember-700 hover:underline" @click="clearPage">
            {{ t('pdf.annotate.clearPage') }}
          </button>
        </div>
        <ul class="space-y-1">
          <li
            v-for="(annotation, index) in onThisPage"
            :key="index"
            class="flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-600"
          >
            <span class="truncate">
              {{ annotation.kind === 'highlight' ? t('pdf.annotate.mode.highlight') : `${t('pdf.annotate.mode.note')}: ${annotation.text}` }}
            </span>
            <button type="button" class="shrink-0 text-red-600 hover:underline" @click="removeAnnotation(annotation)">
              {{ t('pdf.annotate.remove') }}
            </button>
          </li>
        </ul>
      </div>
    </template>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.annotate.action', { n: annotations.length }) }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
        @click="store.reset()"
      >
        {{ t('result.startOver') }}
      </button>
    </div>

    <p v-if="notesSkippedLast > 0" class="text-sm text-amber-800">
      {{ t('pdf.annotate.notesSkipped', { n: notesSkippedLast }) }}
    </p>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard
      v-if="store.result"
      :result="store.result"
      @reset="store.reset()"
      @chain="store.chainResult()"
    />
  </div>
</template>
