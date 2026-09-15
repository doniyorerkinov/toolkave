<script setup lang="ts">
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Undo2 } from 'lucide-vue-next'
import {
  EXTENSION,
  MIME,
  UNSUPPORTED_OUTPUT,
  decodeImage,
  sniffImage,
  transformImage,
  type ImageFormat
} from '~/composables/useImage'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * Turn a picture the right way up.
 *
 * The preview is the picture itself drawn through the same transform the
 * export will use, not a CSS effect over the original — so what is on screen
 * is what lands in the download, quarter-turn dimension swap included.
 */
const { t } = useI18n()
const store = useFilesStore()

const rotate = ref(0)
const flipHorizontal = ref(false)
const flipVertical = ref(false)
const preview = ref<HTMLCanvasElement | null>(null)
const size = ref<{ width: number; height: number } | null>(null)

let bitmap: ImageBitmap | null = null

const file = computed(() => store.files[0] ?? null)
const touched = computed(() => rotate.value !== 0 || flipHorizontal.value || flipVertical.value)
const quarter = computed(() => rotate.value === 90 || rotate.value === 270)
const canRun = computed(() => !!file.value && !!size.value && touched.value && !store.busy)

/** The output keeps the source format; the two we cannot write become the
 * nearest thing we can — a photo to JPEG, a drawing to PNG. */
const format = computed<ImageFormat>(() => {
  const kind = file.value ? sniffImage(file.value.data) : null
  if (kind === 'png' || kind === 'webp') return kind
  if (kind === 'gif') return 'png'
  return 'jpeg'
})

const outputSize = computed(() => {
  if (!size.value) return null
  return quarter.value
    ? { width: size.value.height, height: size.value.width }
    : { width: size.value.width, height: size.value.height }
})

function draw() {
  const canvas = preview.value
  if (!canvas || !bitmap) return

  const width = quarter.value ? bitmap.height : bitmap.width
  const height = quarter.value ? bitmap.width : bitmap.height
  const scale = Math.min(1, 480 / width, 380 / height)
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))

  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.save()
  context.translate(canvas.width / 2, canvas.height / 2)
  if (rotate.value) context.rotate((rotate.value * Math.PI) / 180)
  context.scale(flipHorizontal.value ? -1 : 1, flipVertical.value ? -1 : 1)
  const drawWidth = bitmap.width * scale
  const drawHeight = bitmap.height * scale
  context.drawImage(bitmap, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  context.restore()
}

watch(
  file,
  async current => {
    bitmap?.close()
    bitmap = null
    size.value = null
    reset()
    if (!current) return
    try {
      bitmap = await decodeImage(current.data)
      size.value = { width: bitmap.width, height: bitmap.height }
      await nextTick()
      draw()
    } catch {
      store.error = t('image.errorRead')
    }
  },
  { immediate: true }
)

watch([rotate, flipHorizontal, flipVertical], draw)

function turn(degrees: number) {
  rotate.value = (rotate.value + degrees + 360) % 360
}

function reset() {
  rotate.value = 0
  flipHorizontal.value = false
  flipVertical.value = false
}

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const out = await transformImage(
      file.value,
      { rotate: rotate.value, flipHorizontal: flipHorizontal.value, flipVertical: flipVertical.value },
      format.value
    )
    store.setResult({
      name: withSuffix(file.value.name, '-rotated', EXTENSION[format.value]),
      type: MIME[format.value],
      data: out.data,
      sourceSize: file.value.size,
      note: t('image.rotate.note', { w: out.width, h: out.height })
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
      <span v-if="outputSize && touched" class="text-stone-900">
        → {{ t('image.dimensions', { w: outputSize.width, h: outputSize.height }) }}
      </span>
    </p>

    <div v-if="file && size" class="space-y-4">
      <div class="flex justify-center rounded-xl border border-stone-200 bg-stone-100 p-3">
        <canvas ref="preview" class="max-w-full rounded-sm bg-white shadow-sm" />
      </div>

      <div class="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100"
          @click="turn(-90)"
        >
          <RotateCcw :size="18" aria-hidden="true" />
          {{ t('image.rotate.left') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100"
          @click="turn(90)"
        >
          <RotateCw :size="18" aria-hidden="true" />
          {{ t('image.rotate.right') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium"
          :class="
            flipHorizontal
              ? 'border-ember-500 bg-ember-50 text-ember-900'
              : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
          "
          :aria-pressed="flipHorizontal"
          @click="flipHorizontal = !flipHorizontal"
        >
          <FlipHorizontal2 :size="18" aria-hidden="true" />
          {{ t('image.rotate.flipHorizontal') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium"
          :class="
            flipVertical
              ? 'border-ember-500 bg-ember-50 text-ember-900'
              : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
          "
          :aria-pressed="flipVertical"
          @click="flipVertical = !flipVertical"
        >
          <FlipVertical2 :size="18" aria-hidden="true" />
          {{ t('image.rotate.flipVertical') }}
        </button>
        <button
          v-if="touched"
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100"
          @click="reset"
        >
          <Undo2 :size="18" aria-hidden="true" />
          {{ t('image.rotate.reset') }}
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
        {{ store.busy ? t('image.working') : t('image.rotate.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
        @click="store.reset()"
      >
        {{ t('result.startOver') }}
      </button>
    </div>

    <p v-if="file && size && !touched" class="text-sm text-stone-500">
      {{ t('image.rotate.hint') }}
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
