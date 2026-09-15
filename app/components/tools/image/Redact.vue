<script setup lang="ts">
import { Trash2, Undo2 } from 'lucide-vue-next'
import {
  EXTENSION,
  MIME,
  UNSUPPORTED_OUTPUT,
  decodeImage,
  redactArea,
  redactImage,
  sniffImage,
  type CropRect,
  type ImageFormat,
  type RedactMode
} from '~/composables/useImage'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * Cover faces, plates and addresses by drawing over them.
 *
 * The preview shows the covering already applied rather than a grey box, so
 * what is on screen is what the file will contain — the distinction that
 * matters, because a redaction drawn on top of an intact picture is not a
 * redaction at all.
 */
const { t } = useI18n()
const store = useFilesStore()

const mode = ref<RedactMode>('pixelate')
const strength = ref(3)
const regions = ref<CropRect[]>([])
const canvas = ref<HTMLCanvasElement | null>(null)
const size = ref<{ width: number; height: number } | null>(null)
const hoverCursor = ref('crosshair')

let bitmap: ImageBitmap | null = null
/** Source pixels per displayed pixel, so drawings map back to the original. */
let scale = 1

const file = computed(() => store.files[0] ?? null)
const canRun = computed(() => !!file.value && regions.value.length > 0 && !store.busy)

const format = computed<ImageFormat>(() => {
  const kind = file.value ? sniffImage(file.value.data) : null
  if (kind === 'png' || kind === 'webp') return kind
  if (kind === 'gif') return 'png'
  return 'jpeg'
})

/** Source rectangle → display rectangle. */
function toDisplay(rect: CropRect): CropRect {
  return { x: rect.x / scale, y: rect.y / scale, width: rect.width / scale, height: rect.height / scale }
}

const BADGE = 11

function paint() {
  const el = canvas.value
  if (!el || !bitmap) return
  const context = el.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, el.width, el.height)
  context.drawImage(bitmap, 0, 0, el.width, el.height)

  for (const region of regions.value) {
    const box = toDisplay(region)
    if (box.width < 2 || box.height < 2) continue
    redactArea(context, box, mode.value, strength.value)
    context.strokeStyle = '#c2410c'
    context.lineWidth = 1.5
    context.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1)
    // A cross in the top-right corner removes the area it sits on.
    context.fillStyle = '#c2410c'
    context.beginPath()
    context.arc(box.x + box.width - BADGE, box.y + BADGE, BADGE, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = '#ffffff'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(box.x + box.width - BADGE - 4, box.y + BADGE - 4)
    context.lineTo(box.x + box.width - BADGE + 4, box.y + BADGE + 4)
    context.moveTo(box.x + box.width - BADGE + 4, box.y + BADGE - 4)
    context.lineTo(box.x + box.width - BADGE - 4, box.y + BADGE + 4)
    context.stroke()
  }

  // Drawn last so it sits over everything, and never covered up itself.
  if (draft.value) {
    const box = toDisplay(draft.value)
    context.setLineDash([5, 4])
    context.strokeStyle = '#c2410c'
    context.lineWidth = 1.5
    context.strokeRect(box.x, box.y, box.width, box.height)
    context.setLineDash([])
  }
}

const draft = ref<CropRect | null>(null)

watch(
  file,
  async current => {
    bitmap?.close()
    bitmap = null
    regions.value = []
    draft.value = null
    size.value = null
    if (!current) return
    try {
      bitmap = await decodeImage(current.data)
      size.value = { width: bitmap.width, height: bitmap.height }
      const el = canvas.value
      const room = Math.max(240, Math.min(640, el?.parentElement?.clientWidth ?? 640))
      scale = Math.max(bitmap.width / room, bitmap.height / 520, 1)
      await nextTick()
      if (canvas.value) {
        canvas.value.width = Math.round(bitmap.width / scale)
        canvas.value.height = Math.round(bitmap.height / scale)
      }
      paint()
    } catch {
      store.error = t('image.errorRead')
    }
  },
  { immediate: true }
)

watch([mode, strength, regions], paint, { deep: true })
interface Drag {
  /** Where the gesture started, in source pixels. */
  originX: number
  originY: number
  /** Set when an existing area is being moved rather than a new one drawn. */
  moving: number | null
  startRect: CropRect | null
}
let drag: Drag | null = null

/** Pointer position in source pixels, or null when the canvas has no size. */
function at(event: PointerEvent): { x: number; y: number } | null {
  const el = canvas.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const x = ((event.clientX - rect.left) / rect.width) * el.width * scale
  const y = ((event.clientY - rect.top) / rect.height) * el.height * scale
  return { x, y }
}

/** The area under a point, latest first so the topmost one wins. */
function hit(x: number, y: number): number {
  for (let i = regions.value.length - 1; i >= 0; i--) {
    const region = regions.value[i]!
    if (x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height) return i
  }
  return -1
}

/** Whether a point is on an area's remove badge. */
function onBadge(index: number, x: number, y: number): boolean {
  const box = toDisplay(regions.value[index]!)
  const centreX = box.x + box.width - BADGE
  const centreY = box.y + BADGE
  return Math.hypot(x / scale - centreX, y / scale - centreY) <= BADGE + 2
}

function onPointerDown(event: PointerEvent) {
  const point = at(event)
  if (!point || !bitmap) return
  const index = hit(point.x, point.y)

  if (index >= 0 && onBadge(index, point.x, point.y)) {
    regions.value.splice(index, 1)
    return
  }

  canvas.value?.setPointerCapture(event.pointerId)
  drag =
    index >= 0
      ? { originX: point.x, originY: point.y, moving: index, startRect: { ...regions.value[index]! } }
      : { originX: point.x, originY: point.y, moving: null, startRect: null }
  if (index < 0) draft.value = { x: point.x, y: point.y, width: 0, height: 0 }
}

function onPointerMove(event: PointerEvent) {
  const point = at(event)
  if (!point || !bitmap) return

  if (!drag) {
    const index = hit(point.x, point.y)
    hoverCursor.value =
      index < 0 ? 'crosshair' : onBadge(index, point.x, point.y) ? 'pointer' : 'move'
    return
  }

  if (drag.moving !== null && drag.startRect) {
    const start = drag.startRect
    regions.value[drag.moving] = {
      ...start,
      x: Math.min(Math.max(0, start.x + point.x - drag.originX), bitmap.width - start.width),
      y: Math.min(Math.max(0, start.y + point.y - drag.originY), bitmap.height - start.height)
    }
    return
  }

  const x = Math.min(Math.max(0, point.x), bitmap.width)
  const y = Math.min(Math.max(0, point.y), bitmap.height)
  draft.value = {
    x: Math.min(drag.originX, x),
    y: Math.min(drag.originY, y),
    width: Math.abs(x - drag.originX),
    height: Math.abs(y - drag.originY)
  }
  paint()
}

function onPointerUp(event: PointerEvent) {
  canvas.value?.releasePointerCapture(event.pointerId)
  const pending = draft.value
  draft.value = null
  drag = null
  // A tap with no drag is not an area; the threshold is in source pixels so
  // it scales with the picture rather than with the screen.
  const minimum = size.value ? Math.max(8, Math.min(size.value.width, size.value.height) / 40) : 8
  if (pending && pending.width >= minimum && pending.height >= minimum) regions.value.push(pending)
  else paint()
}

function undo() {
  regions.value.pop()
}
function clearAll() {
  regions.value = []
}

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const out = await redactImage(
      file.value,
      [...regions.value],
      mode.value,
      strength.value,
      format.value
    )
    store.setResult({
      name: withSuffix(file.value.name, '-hidden', EXTENSION[format.value]),
      type: MIME[format.value],
      data: out.data,
      sourceSize: file.value.size,
      note: t('image.redact.note', { n: regions.value.length })
    })
  } catch (error) {
    store.error =
      error instanceof Error && error.message === UNSUPPORTED_OUTPUT
        ? t('image.errorFormatUnsupported', { format: format.value.toUpperCase() })
        : t('image.errorGeneric')
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}

onBeforeUnmount(() => bitmap?.close())
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      v-if="!file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="size" class="text-sm text-stone-500">
      {{ t('image.dimensions', { w: size.width, h: size.height }) }} · {{ formatBytes(file!.size) }}
    </p>

    <div v-if="file && size" class="space-y-4">
      <div class="flex justify-center rounded-xl border border-stone-200 bg-stone-100 p-3">
        <canvas
          ref="canvas"
          class="max-w-full touch-none rounded-sm bg-white shadow-sm select-none"
          :style="{ cursor: hoverCursor }"
          @pointerdown.prevent="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        />
      </div>

      <p class="text-center text-sm text-stone-500">
        {{ regions.length ? t('image.redact.countHint', { n: regions.length }) : t('image.redact.drawHint') }}
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">
            {{ t('image.redact.modeLabel') }}
          </legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="option in (['pixelate', 'blur'] as RedactMode[])"
              :key="option"
              class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
              :class="
                mode === option
                  ? 'border-ember-500 bg-ember-50 text-ember-900'
                  : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
              "
            >
              <input v-model="mode" type="radio" :value="option" class="sr-only" />
              {{ t(`image.redact.mode.${option}`) }}
            </label>
          </div>
        </fieldset>

        <div>
          <label for="redact-strength" class="block text-sm font-medium text-stone-900">
            {{ t('image.redact.strength') }}
          </label>
          <input
            id="redact-strength"
            v-model.number="strength"
            type="range"
            min="1"
            max="5"
            step="1"
            class="mt-2 w-full accent-ember-700"
          />
          <div class="flex justify-between text-xs text-stone-500">
            <span>{{ t('image.redact.lighter') }}</span>
            <span>{{ t('image.redact.heavier') }}</span>
          </div>
        </div>
      </div>

      <div v-if="regions.length" class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100"
          @click="undo"
        >
          <Undo2 :size="18" aria-hidden="true" />
          {{ t('image.redact.undo') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100"
          @click="clearAll"
        >
          <Trash2 :size="18" aria-hidden="true" />
          {{ t('image.redact.clear') }}
        </button>
      </div>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('image.working') : t('image.redact.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
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
