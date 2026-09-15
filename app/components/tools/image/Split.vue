<script setup lang="ts">
import { EXTENSION, MIME, decodeImage, sniffImage, splitImage, type ImageFormat } from '~/composables/useImage'
import { zipFiles } from '~/composables/useZip'
import { formatBytes } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * One picture cut into a grid.
 *
 * The pieces are named by row and column, because a folder of nine files
 * called "part 1" through "part 9" is useless the moment you have to post
 * them in the right order.
 */
const { t } = useI18n()
const store = useFilesStore()

const PRESETS = [
  { id: '3x3', rows: 3, columns: 3 },
  { id: '3x1', rows: 1, columns: 3 },
  { id: '2x2', rows: 2, columns: 2 },
  { id: '1x2', rows: 2, columns: 1 }
]

const rows = ref(3)
const columns = ref(3)
const canvas = ref<HTMLCanvasElement | null>(null)
const size = ref<{ width: number; height: number } | null>(null)

let bitmap: ImageBitmap | null = null

const file = computed(() => store.files[0] ?? null)
const pieces = computed(() => rows.value * columns.value)
const format = computed<ImageFormat>(() => {
  const detected = file.value ? sniffImage(file.value.data) : null
  return detected === 'png' || detected === 'webp' ? detected : 'jpeg'
})
const pieceSize = computed(() =>
  size.value
    ? { width: Math.floor(size.value.width / columns.value), height: Math.floor(size.value.height / rows.value) }
    : null
)
const canRun = computed(() => !!file.value && pieces.value > 1 && !store.busy)

function paint() {
  const el = canvas.value
  if (!el || !bitmap) return
  const context = el.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, el.width, el.height)
  context.drawImage(bitmap, 0, 0, el.width, el.height)

  context.strokeStyle = '#ffffff'
  context.lineWidth = 2
  context.setLineDash([7, 5])
  for (let column = 1; column < columns.value; column++) {
    const x = (el.width / columns.value) * column
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, el.height)
    context.stroke()
  }
  for (let row = 1; row < rows.value; row++) {
    const y = (el.height / rows.value) * row
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(el.width, y)
    context.stroke()
  }
  context.setLineDash([])
}

watch(
  file,
  async current => {
    bitmap?.close()
    bitmap = null
    size.value = null
    if (!current) return
    try {
      bitmap = await decodeImage(current.data)
      size.value = { width: bitmap.width, height: bitmap.height }
      const room = Math.max(240, Math.min(520, canvas.value?.parentElement?.clientWidth ?? 520))
      const factor = Math.max(bitmap.width / room, bitmap.height / 460, 1)
      await nextTick()
      if (canvas.value) {
        canvas.value.width = Math.round(bitmap.width / factor)
        canvas.value.height = Math.round(bitmap.height / factor)
      }
      paint()
    } catch {
      store.error = t('image.errorRead')
    }
  },
  { immediate: true }
)

watch([rows, columns], paint)

function usePreset(preset: (typeof PRESETS)[number]) {
  rows.value = preset.rows
  columns.value = preset.columns
}

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const parts = await splitImage(file.value, rows.value, columns.value, format.value)
    store.setResult({
      name: 'pieces.zip',
      type: 'application/zip',
      data: await zipFiles(parts.map(part => ({ name: part.name, data: part.data }))),
      sourceSize: file.value.size,
      note: t('image.split.note', { n: parts.length, w: parts[0]!.width, h: parts[0]!.height })
    })
  } catch {
    store.error = t('image.errorGeneric')
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
        <canvas ref="canvas" class="max-w-full rounded-sm bg-white shadow-sm" />
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <div v-for="preset in PRESETS" :key="preset.id">
          <button
            type="button"
            class="rounded-lg border px-3.5 py-2 text-sm font-medium"
            :class="
              rows === preset.rows && columns === preset.columns
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
            "
            @click="usePreset(preset)"
          >
            {{ t(`image.split.preset.${preset.id}`) }}
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-4">
        <div>
          <label for="split-rows" class="block text-sm font-medium text-stone-900">{{ t('image.split.rows') }}</label>
          <input
            id="split-rows"
            v-model.number="rows"
            type="number"
            min="1"
            max="10"
            class="mt-2 w-24 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label for="split-columns" class="block text-sm font-medium text-stone-900">
            {{ t('image.split.columns') }}
          </label>
          <input
            id="split-columns"
            v-model.number="columns"
            type="number"
            min="1"
            max="10"
            class="mt-2 w-24 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        <p v-if="pieceSize" class="pb-2 text-sm text-stone-500">
          {{ t('image.split.willBe', { n: pieces, w: pieceSize.width, h: pieceSize.height }) }}
        </p>
      </div>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('image.working') : t('image.split.action') }}
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

    <ShellResultCard v-if="store.result" :result="store.result" @reset="store.reset()" @chain="store.chainResult()" />
  </div>
</template>
