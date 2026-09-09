<script setup lang="ts">
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const canvas = ref<HTMLCanvasElement | null>(null)
const hasInk = ref(false)
const pageNumber = ref(1)
const xPercent = ref(60)
const yPercent = ref(80)
const widthPercent = ref(25)
const pageCount = ref(0)
const infoError = ref(false)

const file = computed(() => store.files[0] ?? null)

watch(
  file,
  async current => {
    pageCount.value = 0
    infoError.value = false
    if (!current) return
    try {
      pageCount.value = (await readPdfInfo(current)).pageCount
      pageNumber.value = 1
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

/**
 * Drawing uses Pointer Events so it works with a finger, a stylus and a mouse
 * through one code path. A signature drawn on a phone is the common case here.
 */
let drawing = false
let context: CanvasRenderingContext2D | null = null

function setupCanvas() {
  const element = canvas.value
  if (!element) return

  // Back the canvas at device resolution so the signature is not blurry.
  const ratio = window.devicePixelRatio || 1
  const rect = element.getBoundingClientRect()
  element.width = Math.round(rect.width * ratio)
  element.height = Math.round(rect.height * ratio)

  context = element.getContext('2d')
  if (!context) return
  context.scale(ratio, ratio)
  context.lineWidth = 2.5
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = '#0f172a'
}

onMounted(() => {
  setupCanvas()
  window.addEventListener('resize', setupCanvas)
})
onBeforeUnmount(() => window.removeEventListener('resize', setupCanvas))

function pointFrom(event: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function start(event: PointerEvent) {
  if (!context) setupCanvas()
  if (!context) return
  drawing = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  const { x, y } = pointFrom(event)
  context.beginPath()
  context.moveTo(x, y)
  event.preventDefault()
}

function move(event: PointerEvent) {
  if (!drawing || !context) return
  const { x, y } = pointFrom(event)
  context.lineTo(x, y)
  context.stroke()
  hasInk.value = true
}

function end(event: PointerEvent) {
  if (!drawing) return
  drawing = false
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
}

function clearInk() {
  const element = canvas.value
  if (!element || !context) return
  context.clearRect(0, 0, element.width, element.height)
  hasInk.value = false
}

const canRun = computed(() => !!file.value && !!pageCount.value && hasInk.value && !store.busy)

async function run() {
  if (!canRun.value || !file.value || !canvas.value) return
  store.busy = true
  store.error = null
  try {
    // Transparent PNG, so the signature sits over the page rather than in a box.
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.value!.toBlob(resolve, 'image/png')
    )
    if (!blob) throw new Error('canvas')

    const data = await signPdf(file.value, {
      image: new Uint8Array(await blob.arrayBuffer()),
      pageIndex: pageNumber.value - 1,
      xRatio: xPercent.value / 100,
      yRatio: yPercent.value / 100,
      widthRatio: widthPercent.value / 100
    })

    store.setResult({
      name: withSuffix(file.value.name, '-signed'),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size
    })
  } catch {
    store.error = t('pdf.errorGeneric')
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
        <p class="mb-1 text-sm font-medium text-slate-900">{{ t('pdf.sign.drawLabel') }}</p>
        <canvas
          ref="canvas"
          class="h-40 w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
          @pointerdown="start"
          @pointermove="move"
          @pointerup="end"
          @pointercancel="end"
        />
        <div class="mt-2 flex items-center justify-between gap-2">
          <p class="text-sm text-slate-500">{{ t('pdf.sign.drawHint') }}</p>
          <button
            type="button"
            :disabled="!hasInk"
            class="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            @click="clearInk"
          >
            {{ t('pdf.sign.clear') }}
          </button>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="sg-page" class="block text-sm font-medium text-slate-900">
            {{ t('pdf.sign.page', { count: pageCount }) }}
          </label>
          <input
            id="sg-page"
            v-model.number="pageNumber"
            type="number"
            min="1"
            :max="pageCount"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
        </div>
        <div>
          <label for="sg-w" class="block text-sm font-medium text-slate-900">
            {{ t('pdf.sign.width', { n: widthPercent }) }}
          </label>
          <input
            id="sg-w"
            v-model.number="widthPercent"
            type="range"
            min="10"
            max="60"
            class="mt-3 w-full accent-sky-700"
          />
        </div>
        <div>
          <label for="sg-x" class="block text-sm font-medium text-slate-900">
            {{ t('pdf.sign.fromLeft', { n: xPercent }) }}
          </label>
          <input
            id="sg-x"
            v-model.number="xPercent"
            type="range"
            min="0"
            max="90"
            class="mt-3 w-full accent-sky-700"
          />
        </div>
        <div>
          <label for="sg-y" class="block text-sm font-medium text-slate-900">
            {{ t('pdf.sign.fromTop', { n: yPercent }) }}
          </label>
          <input
            id="sg-y"
            v-model.number="yPercent"
            type="range"
            min="0"
            max="95"
            class="mt-3 w-full accent-sky-700"
          />
        </div>
      </div>

      <p class="text-sm text-amber-800">{{ t('pdf.sign.legalNote') }}</p>
    </template>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.sign.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
