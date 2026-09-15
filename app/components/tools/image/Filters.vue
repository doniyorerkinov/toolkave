<script setup lang="ts">
import { EXTENSION, MIME, decodeImage, sniffImage, type ImageFormat } from '~/composables/useImage'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * Colour adjustments, applied once to the pixels.
 *
 * The preview and the export share a single filter string handed to the
 * canvas, so the browser does the work in both places and there is no second
 * implementation to drift from what is on screen.
 */
const { t } = useI18n()
const store = useFilesStore()

interface Preset {
  id: string
  grayscale: number
  sepia: number
  brightness: number
  contrast: number
  saturate: number
}

const PRESETS: Preset[] = [
  { id: 'none', grayscale: 0, sepia: 0, brightness: 100, contrast: 100, saturate: 100 },
  { id: 'mono', grayscale: 100, sepia: 0, brightness: 100, contrast: 105, saturate: 100 },
  { id: 'document', grayscale: 100, sepia: 0, brightness: 108, contrast: 175, saturate: 100 },
  { id: 'sepia', grayscale: 0, sepia: 80, brightness: 104, contrast: 100, saturate: 110 },
  { id: 'vivid', grayscale: 0, sepia: 0, brightness: 102, contrast: 112, saturate: 145 },
  { id: 'faded', grayscale: 0, sepia: 12, brightness: 106, contrast: 88, saturate: 78 }
]

const grayscale = ref(0)
const sepia = ref(0)
const brightness = ref(100)
const contrast = ref(100)
const saturate = ref(100)

const canvas = ref<HTMLCanvasElement | null>(null)
const size = ref<{ width: number; height: number } | null>(null)

let bitmap: ImageBitmap | null = null

const file = computed(() => store.files[0] ?? null)
const format = computed<ImageFormat>(() => {
  const detected = file.value ? sniffImage(file.value.data) : null
  return detected === 'png' || detected === 'webp' ? detected : 'jpeg'
})

/** One string, used for the preview and for the saved file alike. */
const filter = computed(
  () =>
    `grayscale(${grayscale.value}%) sepia(${sepia.value}%) brightness(${brightness.value}%) ` +
    `contrast(${contrast.value}%) saturate(${saturate.value}%)`
)

const touched = computed(
  () =>
    grayscale.value !== 0 ||
    sepia.value !== 0 ||
    brightness.value !== 100 ||
    contrast.value !== 100 ||
    saturate.value !== 100
)
const canRun = computed(() => !!file.value && !!size.value && touched.value && !store.busy)

const active = computed(
  () =>
    PRESETS.find(
      preset =>
        preset.grayscale === grayscale.value &&
        preset.sepia === sepia.value &&
        preset.brightness === brightness.value &&
        preset.contrast === contrast.value &&
        preset.saturate === saturate.value
    )?.id ?? null
)

function apply(preset: Preset) {
  grayscale.value = preset.grayscale
  sepia.value = preset.sepia
  brightness.value = preset.brightness
  contrast.value = preset.contrast
  saturate.value = preset.saturate
}

function draw(context: CanvasRenderingContext2D, width: number, height: number) {
  if (!bitmap) return
  context.clearRect(0, 0, width, height)
  if (format.value === 'jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
  }
  context.filter = filter.value
  context.drawImage(bitmap, 0, 0, width, height)
  context.filter = 'none'
}

function paint() {
  const el = canvas.value
  if (!el) return
  const context = el.getContext('2d')
  if (context) draw(context, el.width, el.height)
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
      const room = Math.max(240, Math.min(560, canvas.value?.parentElement?.clientWidth ?? 560))
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

watch([grayscale, sepia, brightness, contrast, saturate], paint)

async function run() {
  if (!canRun.value || !file.value || !bitmap) return
  store.busy = true
  store.error = null
  try {
    const out = document.createElement('canvas')
    out.width = bitmap.width
    out.height = bitmap.height
    const context = out.getContext('2d')
    if (!context) throw new Error('canvas unavailable')
    draw(context, out.width, out.height)
    const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, MIME[format.value], 0.92))
    if (!blob) throw new Error('encode failed')
    store.setResult({
      name: withSuffix(file.value.name, '-adjusted', EXTENSION[format.value]),
      type: MIME[format.value],
      data: new Uint8Array(await blob.arrayBuffer()),
      sourceSize: file.value.size,
      note: active.value && active.value !== 'none' ? t(`image.filters.preset.${active.value}`) : t('image.filters.custom')
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

      <div class="flex flex-wrap gap-2">
        <button
          v-for="preset in PRESETS"
          :key="preset.id"
          type="button"
          class="rounded-lg border px-3.5 py-2 text-sm font-medium"
          :class="
            active === preset.id
              ? 'border-ember-500 bg-ember-50 text-ember-900'
              : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
          "
          :aria-pressed="active === preset.id"
          @click="apply(preset)"
        >
          {{ t(`image.filters.preset.${preset.id}`) }}
        </button>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <label for="f-brightness" class="block text-sm font-medium text-stone-900">
            {{ t('image.filters.brightness', { n: brightness }) }}
          </label>
          <input id="f-brightness" v-model.number="brightness" type="range" min="30" max="180" class="mt-2 w-full accent-ember-700" />
        </div>
        <div>
          <label for="f-contrast" class="block text-sm font-medium text-stone-900">
            {{ t('image.filters.contrast', { n: contrast }) }}
          </label>
          <input id="f-contrast" v-model.number="contrast" type="range" min="30" max="220" class="mt-2 w-full accent-ember-700" />
        </div>
        <div>
          <label for="f-saturate" class="block text-sm font-medium text-stone-900">
            {{ t('image.filters.saturation', { n: saturate }) }}
          </label>
          <input id="f-saturate" v-model.number="saturate" type="range" min="0" max="220" class="mt-2 w-full accent-ember-700" />
        </div>
      </div>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('image.working') : t('image.filters.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
        @click="store.reset()"
      >
        {{ t('result.startOver') }}
      </button>
    </div>

    <p v-if="file && size && !touched" class="text-sm text-stone-500">{{ t('image.filters.hint') }}</p>
    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard v-if="store.result" :result="store.result" @reset="store.reset()" @chain="store.chainResult()" />
  </div>
</template>
