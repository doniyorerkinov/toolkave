<script setup lang="ts">
/**
 * A picture given an edge, and then a thickness.
 *
 * Most people have their logo as a PNG rather than an SVG, and a PNG has no
 * outlines to extrude - only pixels, and an edge that exists wherever they
 * stop. So the shape is traced out of the image first and then handed to the
 * same machinery the SVG tool uses, which is why a photograph is not what
 * this is for: tracing a face produces its silhouette, correctly, and a
 * silhouette is a blob.
 *
 * The silhouette is drawn on screen before anything is extruded, because the
 * threshold is a judgement call and a slider with no visible consequence is
 * just guessing.
 */
import { buildModel, DEFAULTS, type Model, type Outline } from '~~/shared/svg3d'
import { buildMask, hasTransparency, toOutlines, traceLoops, type MaskSource } from '~~/shared/trace'
import { exportModel, FORMATS, type ModelFormat } from '~/composables/useSvg3d'
import { decodeImage } from '~/composables/useImage'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

/** Tracing is pixel work, and the cost of it is the pixel count. */
const WORKING_SIZE = 720

const EDGES = {
  sharp: { smooth: 0, maxCut: 0, tolerance: 0 },
  soft: { smooth: 2, maxCut: 1, tolerance: 0.8 },
  round: { smooth: 3, maxCut: 3, tolerance: 1.8 }
} as const
type Edge = keyof typeof EDGES

const source = ref<MaskSource>('alpha')
const threshold = ref(128)
const edge = ref<Edge>('soft')
const speck = ref(6)

const size = ref(DEFAULTS.size)
const depth = ref(DEFAULTS.depth)
const bevelled = ref(false)
const plated = ref(false)
const plate = ref(1.6)
const format = ref<ModelFormat>('stl')

const model = shallowRef<Model | null>(null)
const shapes = ref(0)
const reading = ref(false)
const failed = ref(false)

/** The decoded picture, kept out of Vue: it is a megabyte of pixels, not state. */
const picture = shallowRef<{ pixels: Uint8ClampedArray; width: number; height: number } | null>(null)
const colour = ref('#8c8c8c')
const maskCanvas = ref<HTMLCanvasElement | null>(null)

const file = computed(() => store.files[0] ?? null)
const parts = computed(() => model.value?.parts ?? null)
const bevel = computed(() => (bevelled.value ? Math.min(0.6, depth.value / 4) : 0))

const options = computed(() => ({
  size: size.value,
  depth: depth.value,
  bevel: bevel.value,
  base: plated.value ? plate.value : 0,
  baseMargin: DEFAULTS.baseMargin
}))

/**
 * The image at a size worth tracing, and the average colour of it.
 *
 * Scaled down because the trace follows pixels: at full resolution a photo
 * produces a border tens of thousands of points long and a wait to match,
 * and none of that detail survives being 60 mm wide in plastic.
 */
async function read() {
  picture.value = null
  model.value = null
  if (!file.value) return

  reading.value = true
  store.error = null
  try {
    const bitmap = await decodeImage(file.value.data)
    const scale = Math.min(1, WORKING_SIZE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('canvas unavailable')
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const { data } = context.getImageData(0, 0, width, height)
    picture.value = { pixels: data, width, height }
    // Transparency is the author saying where the artwork ends. Without it,
    // the best guess is that the artwork is the dark part.
    source.value = hasTransparency(data) ? 'alpha' : 'dark'
    // The preview canvas only exists once the file is in, so the first trace
    // has to wait for it or its drawing goes nowhere.
    await nextTick()
    retrace()
  } catch {
    store.error = t('image.png3d.readFailed')
  } finally {
    reading.value = false
  }
}

/**
 * The colour of the artwork, so the preview and the GLB look like the logo.
 *
 * Averaged over the traced region rather than the whole picture: a logo on a
 * white background is mostly white background, and averaging that gives grey
 * every time regardless of what was drawn.
 */
function averageColour(pixels: Uint8ClampedArray, mask: Uint8Array): string {
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const p = i * 4
    r += pixels[p]!; g += pixels[p + 1]!; b += pixels[p + 2]!; n++
  }
  if (!n) return '#8c8c8c'
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

const outlines = shallowRef<Outline[]>([])

/** Pixels to shapes. The expensive half, and the only half the sliders above change. */
function retrace() {
  const current = picture.value
  if (!current) return
  const mask = buildMask(current.pixels, current.width, current.height, {
    source: source.value,
    threshold: threshold.value
  })
  colour.value = averageColour(current.pixels, mask)
  outlines.value = toOutlines(traceLoops(mask, current.width, current.height), {
    minArea: speck.value * speck.value,
    ...EDGES[edge.value]
  })
  shapes.value = outlines.value.length
  store.error = outlines.value.length ? null : t('image.png3d.nothingFound')
  paint()
  extrude()
}

/** Shapes to a solid. Cheap, so the size and thickness sliders can follow the hand. */
function extrude() {
  const current = picture.value
  model.value = current && outlines.value.length
    ? buildModel([{ colour: colour.value, outlines: outlines.value }], options.value)
    : null
}

/**
 * What was found, drawn over the picture it came from.
 *
 * The finished outlines rather than the raw mask, so smoothing and speck
 * removal are visible too - otherwise the preview promises detail the model
 * does not have.
 */
function paint() {
  const current = picture.value
  const canvas = maskCanvas.value
  if (!current || !canvas) return
  canvas.width = current.width
  canvas.height = current.height
  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = colour.value
  const path = new Path2D()
  for (const outline of outlines.value) {
    ring(path, outline.outer)
    for (const hole of outline.holes) ring(path, hole)
  }
  // Even-odd, so a hole is a hole whichever way round it was wound.
  context.fill(path, 'evenodd')
}

function ring(path: Path2D, points: { x: number; y: number }[]) {
  if (!points.length) return
  path.moveTo(points[0]!.x, -points[0]!.y)
  for (let i = 1; i < points.length; i++) path.lineTo(points[i]!.x, -points[i]!.y)
  path.closePath()
}

async function download() {
  if (!parts.value || !file.value || store.busy) return
  store.busy = true
  store.error = null
  try {
    const data = await exportModel(parts.value, format.value)
    const measured = model.value!.size
    store.setResult({
      name: withSuffix(file.value.name, '', FORMATS[format.value].extension),
      type: FORMATS[format.value].mime,
      data,
      sourceSize: file.value.size,
      note: t('model.note', {
        w: measured.x.toFixed(1),
        h: measured.y.toFixed(1),
        d: measured.z.toFixed(1),
        n: model.value!.triangles.toLocaleString()
      })
    })
  } catch {
    store.error = t('model.exportFailed')
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}

let timer: ReturnType<typeof setTimeout> | undefined
const after = (work: () => void) => {
  clearTimeout(timer)
  timer = setTimeout(work, 140)
}

watch(file, read, { immediate: true })
watch([source, threshold, edge, speck], () => after(retrace))
watch(options, () => after(extrude))
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      v-if="!file"
      accept="image/png,image/jpeg,image/webp"
      :multiple="false"
      :max-size="30 * 1024 * 1024"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <template v-if="file">
      <ShellModelViewer :parts="parts" @error="failed = true" />

      <p v-if="failed" class="text-sm text-red-700" role="alert">{{ t('model.noWebgl') }}</p>

      <p v-else-if="model" class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500">
        <span class="tabular-nums">
          {{ model.size.x.toFixed(1) }} × {{ model.size.y.toFixed(1) }} × {{ model.size.z.toFixed(1) }} mm
        </span>
        <span class="tabular-nums">{{ t('model.triangles', { n: model.triangles.toLocaleString() }) }}</span>
        <span class="tabular-nums">{{ t('image.png3d.shapes', { n: shapes }) }}</span>
      </p>
      <p v-else-if="reading" class="text-sm text-stone-500">{{ t('image.png3d.reading') }}</p>

      <div class="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <p class="text-sm font-medium text-stone-900">{{ t('image.png3d.traceLabel') }}</p>

        <div class="flex justify-center rounded-lg checkerboard p-2">
          <canvas ref="maskCanvas" class="max-h-44 max-w-full object-contain" />
        </div>
        <p class="text-xs text-stone-500">{{ t('image.png3d.traceNote') }}</p>

        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in (['alpha', 'dark', 'light'] as MaskSource[])"
            :key="option"
            class="cursor-pointer rounded-lg border px-3.5 py-2 text-sm font-medium"
            :class="
              source === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
            "
          >
            <input v-model="source" type="radio" :value="option" class="sr-only" />
            {{ t(`image.png3d.source.${option}`) }}
          </label>
        </div>

        <label class="block">
          <span class="mb-1.5 flex items-baseline justify-between text-sm text-stone-700">
            {{ source === 'alpha' ? t('image.png3d.alphaCut') : t('image.png3d.brightnessCut') }}
            <span class="tabular-nums text-stone-500">{{ threshold }}</span>
          </span>
          <input v-model.number="threshold" type="range" min="4" max="250" step="2" class="w-full accent-ember-700" />
        </label>

        <label class="block">
          <span class="mb-1.5 flex items-baseline justify-between text-sm text-stone-700">
            {{ t('image.png3d.speckLabel') }}
            <span class="tabular-nums text-stone-500">{{ speck }} px</span>
          </span>
          <input v-model.number="speck" type="range" min="0" max="40" step="1" class="w-full accent-ember-700" />
          <span class="mt-1 block text-xs text-stone-500">{{ t('image.png3d.speckNote') }}</span>
        </label>
      </div>

      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('image.png3d.edgeLabel') }}</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in (['sharp', 'soft', 'round'] as Edge[])"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="
              edge === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
            "
          >
            <input v-model="edge" type="radio" :value="option" class="sr-only" />
            {{ t(`image.png3d.edges.${option}`) }}
          </label>
        </div>
        <p class="mt-2 text-xs text-stone-500">{{ t('image.png3d.edgeNote') }}</p>
      </fieldset>

      <ShellModelOptions
        v-model:size="size"
        v-model:depth="depth"
        v-model:bevelled="bevelled"
        v-model:plated="plated"
        v-model:plate="plate"
        v-model:format="format"
        :model="model"
        :busy="store.busy"
        @build="download"
        @reset="store.reset()"
      />
    </template>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard v-if="store.result" :result="store.result" @reset="store.reset()" @chain="store.chainResult()" />
  </div>
</template>

<style scoped>
/* So a transparent logo reads as transparent rather than as white artwork. */
.checkerboard {
  background-image:
    linear-gradient(45deg, #e7e5e4 25%, transparent 25%),
    linear-gradient(-45deg, #e7e5e4 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e7e5e4 75%),
    linear-gradient(-45deg, transparent 75%, #e7e5e4 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-color: #ffffff;
}
</style>
