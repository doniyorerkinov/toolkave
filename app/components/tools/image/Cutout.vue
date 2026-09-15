<script setup lang="ts">
import {
  applyMask,
  cutoutCached,
  cutoutConfidence,
  cutoutReady,
  maskFromConfidence,
  prepareCutout,
  release,
  type CutoutProgress
} from '~/composables/useCutout'
import { decodeImage } from '~/composables/useImage'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * Removing a background, with the model running on this device.
 *
 * The download starts when the page opens rather than when a file arrives,
 * so it overlaps with the person choosing a photo instead of following it.
 * Nothing is faked: the bar shows real bytes, it says the download happens
 * once, and on a second visit — when the model is already cached — it never
 * appears at all.
 */
const { t } = useI18n()
const store = useFilesStore()

type Backdrop = 'transparent' | 'colour' | 'blur'

const backdrop = ref<Backdrop>('transparent')
const colour = ref('#ffffff')
/** Below 0.5 keeps more of the edge, above it cuts tighter. */
const edge = ref(45)

const progress = ref<CutoutProgress | null>(null)
const loadFailed = ref(false)
const preparing = ref(false)
/** True when the model was already on the device when the page opened. */
const wasCached = ref(false)
/** True on a connection the browser has told us to go easy on. */
const metered = ref(false)

const canvas = ref<HTMLCanvasElement | null>(null)
const size = ref<{ width: number; height: number } | null>(null)
const cutMs = ref<number | null>(null)

let bitmap: ImageBitmap | null = null
/**
 * False once this page has been left. Two seconds of inference outlives a
 * click on another tool, and the store is shared — without this, work
 * started here finishes on somebody else's page and writes its result,
 * its error, or a stuck busy flag over what they are doing.
 */
let alive = true
/**
 * Held in a ref because the preview and the save button are computed from
 * whether it exists — a plain variable changes without anything noticing,
 * which shows up as the work finishing and the page not reacting.
 * `shallowRef` because a typed array has nothing worth making reactive
 * inside it and tracking a million numbers would be a waste.
 */
const confidence = shallowRef<Float32Array | null>(null)

const file = computed(() => store.files[0] ?? null)
const ready = computed(() => cutoutReady.value)
const hasCut = computed(() => !!confidence.value && !!size.value)
const canRun = computed(() => hasCut.value && !store.busy)

/** The band handed to the mask: the slider moves both ends together. */
const band = computed(() => {
  const centre = edge.value / 100
  return { low: Math.max(0.02, centre - 0.3), high: Math.min(0.98, centre + 0.3) }
})

function start() {
  if (preparing.value || cutoutReady.value) return
  preparing.value = true
  loadFailed.value = false
  prepareCutout(update => {
    progress.value = update
  })
    .catch(() => {
      loadFailed.value = true
    })
    .finally(() => {
      preparing.value = false
      progress.value = null
    })
}

onMounted(async () => {
  wasCached.value = await cutoutCached()
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection
  metered.value = !!connection?.saveData
  // On a connection the person has asked us to spare, the several megabytes
  // wait until they ask for them.
  if (!metered.value || wasCached.value) start()
})

/** What is behind the subject, as the compositor wants it. */
function chosenBackdrop() {
  if (backdrop.value === 'colour') return { kind: 'colour' as const, colour: colour.value }
  return backdrop.value === 'blur' ? { kind: 'blur' as const } : { kind: 'transparent' as const }
}

/**
 * Draw the preview at the size it is shown.
 *
 * Composing at the photo's own size and scaling the result down was doing
 * about fifteen megabytes of work per slider move on a 12-megapixel photo,
 * half a second each, and leaving the canvases behind — thirty moves took
 * the tab from 150 MB to 615 MB and stayed there. Nothing on screen is
 * better for it: the preview is 500 pixels wide either way.
 */
function paint() {
  const el = canvas.value
  if (!el || !bitmap || !confidence.value || !size.value) return
  const room = Math.max(240, Math.min(560, el.parentElement?.clientWidth ?? 560))
  const factor = Math.max(size.value.width / room, size.value.height / 460, 1)
  const width = Math.max(1, Math.round(size.value.width / factor))
  const height = Math.max(1, Math.round(size.value.height / factor))

  const preview = maskFromConfidence(confidence.value, width, height, band.value.low, band.value.high)
  const composed = applyMask(bitmap, preview, chosenBackdrop(), width, height)
  el.width = width
  el.height = height
  const context = el.getContext('2d')
  if (context) {
    context.clearRect(0, 0, width, height)
    context.drawImage(composed, 0, 0)
  }
  release(composed)
}

async function cut() {
  if (!bitmap) return
  store.busy = true
  store.error = null
  try {
    const result = await cutoutConfidence(bitmap, update => {
      progress.value = update
    })
    if (!alive) return
    confidence.value = result.confidence
    cutMs.value = Math.round(result.ms)
    await nextTick()
    paint()
  } catch {
    if (alive) store.error = t('image.cutout.errorRun')
  } finally {
    progress.value = null
    if (alive) store.busy = false
  }
}

watch(
  file,
  async current => {
    bitmap?.close()
    bitmap = null
    confidence.value = null
    size.value = null
    cutMs.value = null
    if (!current) return
    try {
      bitmap = await decodeImage(current.data)
      size.value = { width: bitmap.width, height: bitmap.height }
    } catch {
      store.error = t('image.errorRead')
      return
    }
    start()
    await cut()
  },
  { immediate: true }
)

watch([backdrop, colour, edge], paint)

async function save() {
  if (!canRun.value || !file.value || !bitmap || !confidence.value || !size.value) return
  store.busy = true
  store.error = null
  try {
    // The only place the full resolution is paid for, once, on the way out.
    const { width, height } = size.value
    const mask = maskFromConfidence(confidence.value, width, height, band.value.low, band.value.high)
    const composed = applyMask(bitmap, mask, chosenBackdrop(), width, height)
    // PNG only where transparency is the point. Once something opaque is
    // behind the subject the picture is a photograph again, and a PNG of a
    // photograph runs to megabytes for nothing.
    const transparent = backdrop.value === 'transparent'
    const type = transparent ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob | null>(resolve => composed.toBlob(resolve, type, 0.92))
    release(composed)
    if (!blob) throw new Error('encode failed')
    if (!alive) return
    store.setResult({
      name: withSuffix(file.value.name, '-cutout', transparent ? 'png' : 'jpg'),
      type,
      data: new Uint8Array(await blob.arrayBuffer()),
      sourceSize: file.value.size,
      note: t(`image.cutout.note.${backdrop.value}`)
    })
  } catch {
    if (alive) store.error = t('image.errorGeneric')
  } finally {
    if (alive) store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}

onBeforeUnmount(() => {
  alive = false
  bitmap?.close()
  bitmap = null
  confidence.value = null
  // Anything this page started and has not finished belongs to nobody now.
  progress.value = null
  store.busy = false
})
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="progress && progress.stage !== 'running' && !wasCached"
      class="rounded-xl border border-stone-200 bg-stone-50 p-4"
    >
      <p class="text-sm font-medium text-stone-900">{{ t('image.cutout.loading') }}</p>
      <div class="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
        <div
          class="h-full rounded-full bg-ember-700 transition-[width] duration-200"
          :style="{ width: `${Math.round((progress.fraction ?? 0) * 100)}%` }"
        />
      </div>
      <p class="mt-2 text-xs text-stone-500">
        {{
          t('image.cutout.loadingBytes', {
            done: formatBytes(progress.loadedBytes ?? 0),
            total: formatBytes(progress.totalBytes ?? 0)
          })
        }}
        · {{ t('image.cutout.onceOnly') }}
      </p>
    </div>

    <div v-if="metered && !ready && !preparing" class="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p class="text-sm text-amber-900">{{ t('image.cutout.metered') }}</p>
      <button
        type="button"
        class="mt-2 rounded-lg border border-amber-400 bg-white px-3.5 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
        @click="start"
      >
        {{ t('image.cutout.meteredAction') }}
      </button>
    </div>

    <p v-if="loadFailed" class="text-sm text-red-700" role="alert">{{ t('image.cutout.errorLoad') }}</p>

    <ShellFileDropzone
      v-if="!file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="size" class="text-sm text-stone-500">
      {{ t('image.dimensions', { w: size.width, h: size.height }) }} · {{ formatBytes(file!.size) }}
      <span v-if="cutMs"> · {{ t('image.cutout.took', { ms: cutMs }) }}</span>
    </p>

    <p v-if="file && store.busy && !hasCut" class="text-sm text-stone-600">
      {{ progress?.stage === 'running' ? t('image.cutout.running') : t('image.cutout.preparing') }}
    </p>

    <div v-if="file && hasCut" class="space-y-4">
      <div class="flex justify-center rounded-xl border border-stone-200 bg-stone-100 p-3">
        <canvas ref="canvas" class="checkerboard max-w-full rounded-sm shadow-sm" />
      </div>

      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">
          {{ t('image.cutout.backdropLabel') }}
        </legend>
        <div class="flex flex-wrap items-center gap-2">
          <label
            v-for="option in (['transparent', 'colour', 'blur'] as Backdrop[])"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="
              backdrop === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
            "
          >
            <input v-model="backdrop" type="radio" :value="option" class="sr-only" />
            {{ t(`image.cutout.backdrop.${option}`) }}
          </label>
          <input
            v-if="backdrop === 'colour'"
            v-model="colour"
            type="color"
            class="h-9 w-14 cursor-pointer rounded border border-stone-300 bg-white"
            :aria-label="t('image.cutout.backdrop.colour')"
          />
        </div>
      </fieldset>

      <div>
        <label for="cut-edge" class="block text-sm font-medium text-stone-900">
          {{ t('image.cutout.edgeLabel') }}
        </label>
        <input id="cut-edge" v-model.number="edge" type="range" min="20" max="80" class="mt-2 w-full accent-ember-700" />
        <div class="flex justify-between text-xs text-stone-500">
          <span>{{ t('image.cutout.edgeKeep') }}</span>
          <span>{{ t('image.cutout.edgeTight') }}</span>
        </div>
        <p class="mt-1 text-xs text-stone-500">{{ t('image.cutout.edgeHint') }}</p>
      </div>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="save"
      >
        {{ store.busy ? t('image.working') : t('image.cutout.action') }}
      </button>
      <button
        v-if="hasCut"
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
        :disabled="store.busy"
        @click="cut"
      >
        {{ t('image.cutout.again') }}
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

<style scoped>
/* Transparency has to look like transparency, or the whole tool is unreadable. */
.checkerboard {
  background-image:
    linear-gradient(45deg, #d6d3d1 25%, transparent 25%),
    linear-gradient(-45deg, #d6d3d1 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #d6d3d1 75%),
    linear-gradient(-45deg, transparent 75%, #d6d3d1 75%);
  background-size: 18px 18px;
  background-position: 0 0, 0 9px, 9px -9px, -9px 0;
  background-color: #ffffff;
}
</style>
