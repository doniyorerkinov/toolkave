<script setup lang="ts">
import {
  EXTENSION,
  UNSUPPORTED_OUTPUT,
  decodeImage,
  type CropRect,
  type ImageFormat
} from '~/composables/useImage'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const width = ref<number | null>(null)
const height = ref<number | null>(null)
const keepRatio = ref(true)
const dimensions = ref<{ width: number; height: number } | null>(null)

const file = computed(() => store.files[0] ?? null)

/* ---- the picture, and the part of it being kept ---- */

/**
 * The crop, as fractions of the source rather than pixels: the preview is
 * drawn at whatever size fits the page, and fractions survive that.
 */
interface Selection { x: number; y: number; width: number; height: number }
const selection = ref<Selection | null>(null)
const cropping = ref(false)

const canvasEl = ref<HTMLCanvasElement | null>(null)
let bitmap: ImageBitmap | null = null

/** Longest side of the preview. Big enough to aim with, small enough to draw. */
const PREVIEW_MAX = 640

function releaseBitmap() {
  bitmap?.close()
  bitmap = null
}
onBeforeUnmount(releaseBitmap)

function redraw() {
  const canvas = canvasEl.value
  if (!canvas || !bitmap) return

  const scale = Math.min(1, PREVIEW_MAX / Math.max(bitmap.width, bitmap.height))
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))

  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  const box = dragBox() ?? committedBox()
  if (!cropping.value || !box) return

  // Everything outside the selection is dimmed, so the kept part reads as
  // the picture and the rest as context.
  context.fillStyle = 'rgba(12, 10, 9, 0.55)'
  context.fillRect(0, 0, canvas.width, box.y)
  context.fillRect(0, box.y + box.height, canvas.width, canvas.height - box.y - box.height)
  context.fillRect(0, box.y, box.x, box.height)
  context.fillRect(box.x + box.width, box.y, canvas.width - box.x - box.width, box.height)

  context.strokeStyle = '#f27d14'
  context.lineWidth = 2
  context.strokeRect(box.x, box.y, box.width, box.height)

  const grip = 12
  context.fillStyle = '#f27d14'
  context.fillRect(box.x + box.width - grip, box.y + box.height - grip, grip, grip)
}

function committedBox() {
  const canvas = canvasEl.value
  const current = selection.value
  if (!canvas || !current) return null
  return {
    x: current.x * canvas.width,
    y: current.y * canvas.height,
    width: current.width * canvas.width,
    height: current.height * canvas.height
  }
}

/** The crop in source pixels — what the encoder is given. */
const cropPixels = computed<CropRect | null>(() => {
  const current = selection.value
  const size = dimensions.value
  if (!cropping.value || !current || !size) return null
  return {
    x: Math.round(current.x * size.width),
    y: Math.round(current.y * size.height),
    width: Math.max(1, Math.round(current.width * size.width)),
    height: Math.max(1, Math.round(current.height * size.height))
  }
})

/* ---- drawing the selection ---- */

type Mode = 'draw' | 'move' | 'resize'
let mode: Mode | null = null
let anchor: { x: number; y: number } | null = null
let cursor: { x: number; y: number } | null = null

function dragBox() {
  const canvas = canvasEl.value
  if (mode !== 'draw' || !anchor || !cursor || !canvas) return null
  return {
    x: Math.min(anchor.x, cursor.x) * canvas.width,
    y: Math.min(anchor.y, cursor.y) * canvas.height,
    width: Math.abs(cursor.x - anchor.x) * canvas.width,
    height: Math.abs(cursor.y - anchor.y) * canvas.height
  }
}

function pointFrom(event: PointerEvent) {
  const rect = canvasEl.value!.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  }
}

const MIN_SIDE = 0.02

function onDown(event: PointerEvent) {
  if (!cropping.value || !bitmap) return
  const point = pointFrom(event)
  const current = selection.value
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()

  if (current) {
    const right = current.x + current.width
    const bottom = current.y + current.height
    const grip = 0.05
    if (point.x > right - grip && point.y > bottom - grip) {
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

function onMove(event: PointerEvent) {
  if (!mode) return
  const point = pointFrom(event)
  const current = selection.value

  if (mode === 'draw') {
    cursor = point
  } else if (mode === 'move' && current && anchor) {
    selection.value = {
      ...current,
      x: Math.min(1 - current.width, Math.max(0, point.x - anchor.x)),
      y: Math.min(1 - current.height, Math.max(0, point.y - anchor.y))
    }
  } else if (mode === 'resize' && current) {
    selection.value = {
      ...current,
      width: Math.min(1 - current.x, Math.max(MIN_SIDE, point.x - current.x)),
      height: Math.min(1 - current.y, Math.max(MIN_SIDE, point.y - current.y))
    }
  }
  redraw()
}

function onUp(event: PointerEvent) {
  if (mode === 'draw' && anchor && cursor) {
    const box = {
      x: Math.min(anchor.x, cursor.x),
      y: Math.min(anchor.y, cursor.y),
      width: Math.abs(cursor.x - anchor.x),
      height: Math.abs(cursor.y - anchor.y)
    }
    // A tap rather than a drag leaves the selection alone.
    if (box.width > MIN_SIDE && box.height > MIN_SIDE) selection.value = box
  }
  mode = null
  anchor = null
  cursor = null
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  syncTargetToSelection()
  redraw()
}

/** After a selection changes, the output defaults to the crop's own size. */
function syncTargetToSelection() {
  const crop = cropPixels.value
  if (!crop) return
  width.value = crop.width
  height.value = crop.height
}

function selectAll() {
  selection.value = { x: 0, y: 0, width: 1, height: 1 }
  syncTargetToSelection()
  redraw()
}

watch(cropping, on => {
  if (on && !selection.value) {
    // Open with a centred selection rather than nothing to grab.
    selection.value = { x: 0.15, y: 0.15, width: 0.7, height: 0.7 }
    syncTargetToSelection()
  }
  if (!on && dimensions.value) {
    width.value = dimensions.value.width
    height.value = dimensions.value.height
  }
  redraw()
})

/* ---- the file, and the numbers that come out ---- */

watch(
  file,
  async current => {
    dimensions.value = null
    width.value = null
    height.value = null
    selection.value = null
    cropping.value = false
    releaseBitmap()
    if (!current) return
    try {
      bitmap = await decodeImage(current.data)
      dimensions.value = { width: bitmap.width, height: bitmap.height }
      width.value = bitmap.width
      height.value = bitmap.height
      await nextTick()
      redraw()
    } catch {
      store.error = t('image.errorRead')
    }
  },
  { immediate: true }
)

/** Aspect ratio of whatever is being resized: the crop if there is one. */
const ratio = computed(() => {
  const crop = cropPixels.value
  if (crop) return crop.width / crop.height
  return dimensions.value ? dimensions.value.width / dimensions.value.height : 1
})

function onWidth(value: number) {
  width.value = value || null
  if (keepRatio.value && value) height.value = Math.round(value / ratio.value)
}

function onHeight(value: number) {
  height.value = value || null
  if (keepRatio.value && value) width.value = Math.round(value * ratio.value)
}

/** Keep the source format so a resize does not silently change file type. */
const outputFormat = computed<ImageFormat>(() => {
  const kind = file.value ? sniffImage(file.value.data) : null
  if (kind === 'png') return 'png'
  if (kind === 'webp') return 'webp'
  return 'jpeg'
})

const canRun = computed(
  () => !!file.value && !!dimensions.value && !!width.value && !!height.value && !store.busy
)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const crop = cropPixels.value
    const out = await resizeImage(
      file.value,
      { width: width.value!, height: height.value! },
      outputFormat.value,
      0.92,
      crop ?? undefined
    )
    store.setResult({
      name: withSuffix(file.value.name, `-${out.width}x${out.height}`, EXTENSION[outputFormat.value]),
      type: `image/${outputFormat.value}`,
      data: out.data,
      sourceSize: file.value.size,
      // Both previews scale to fit, so only the numbers show the resize.
      note: crop
        ? t('image.resize.cropNote', { w: crop.width, h: crop.height, ow: out.width, oh: out.height })
        : dimensions.value
          ? `${dimensions.value.width} × ${dimensions.value.height} px → ${out.width} × ${out.height} px`
          : undefined
    })
  } catch (error) {
    store.error =
      error instanceof Error && error.message === UNSUPPORTED_OUTPUT
        ? t('image.errorFormatUnsupported', { format: outputFormat.value.toUpperCase() })
        : t('image.errorGeneric')
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}

const presets = [25, 50, 75]
function applyPreset(percent: number) {
  const base = cropPixels.value ?? dimensions.value
  if (!base) return
  width.value = Math.round((base.width * percent) / 100)
  height.value = Math.round((base.height * percent) / 100)
}
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

    <p v-if="dimensions" class="text-sm text-stone-500">
      {{ t('image.original') }}: {{ dimensions.width }} × {{ dimensions.height }} ·
      {{ formatBytes(file!.size) }}
    </p>

    <div v-if="file && dimensions" class="space-y-4">
      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">
          {{ t('image.resize.partLabel') }}
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in [false, true]"
            :key="String(option)"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="cropping === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'"
          >
            <input v-model="cropping" type="radio" :value="option" class="sr-only" />
            {{ option ? t('image.resize.partCrop') : t('image.resize.partWhole') }}
          </label>
        </div>
      </fieldset>

      <div class="overflow-hidden rounded-lg border border-stone-300 bg-stone-100">
        <canvas
          ref="canvasEl"
          class="mx-auto block max-w-full touch-none"
          :class="cropping ? 'cursor-crosshair' : ''"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
        />
      </div>

      <div v-if="cropping" class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-stone-600">
          <span v-if="cropPixels">
            {{ t('image.resize.selected') }}: {{ cropPixels.width }} × {{ cropPixels.height }} px
          </span>
          <span v-else>{{ t('image.resize.cropHint') }}</span>
        </p>
        <button type="button" class="text-sm font-medium text-ember-700 hover:underline" @click="selectAll">
          {{ t('image.resize.selectAll') }}
        </button>
      </div>
      <p v-if="cropping" class="text-sm text-stone-500">{{ t('image.resize.cropHint') }}</p>

      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="rs-w" class="block text-sm font-medium text-stone-900">
            {{ t('image.resize.width') }}
          </label>
          <input
            id="rs-w"
            :value="width"
            type="number"
            min="1"
            class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
            @input="onWidth(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div>
          <label for="rs-h" class="block text-sm font-medium text-stone-900">
            {{ t('image.resize.height') }}
          </label>
          <input
            id="rs-h"
            :value="height"
            type="number"
            min="1"
            class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
            @input="onHeight(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>

      <label class="flex items-center gap-2 text-sm text-stone-700">
        <input v-model="keepRatio" type="checkbox" class="size-4 accent-ember-700" />
        {{ t('image.resize.keepRatio') }}
      </label>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="preset in presets"
          :key="preset"
          type="button"
          class="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
          @click="applyPreset(preset)"
        >
          {{ preset }}%
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
        {{ store.busy ? t('image.working') : t('image.resize.action') }}
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
