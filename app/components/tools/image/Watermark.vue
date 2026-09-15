<script setup lang="ts">
import { EXTENSION, MIME, decodeImage, sniffImage, type ImageFormat } from '~/composables/useImage'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * A mark laid over a picture, drawn into it.
 *
 * The preview is the real thing at display scale and the export repeats the
 * same drawing at full size, so what someone lines up is what they get. Size
 * and margin are fractions of the picture rather than pixels, which is the
 * only way one setting works for both a phone photo and a scan.
 */
const { t } = useI18n()
const store = useFilesStore()

type Placement = 'nw' | 'n' | 'ne' | 'w' | 'c' | 'e' | 'sw' | 's' | 'se' | 'tile'

const PLACEMENTS: Placement[][] = [
  ['nw', 'n', 'ne'],
  ['w', 'c', 'e'],
  ['sw', 's', 'se']
]

const kind = ref<'text' | 'image'>('text')
const text = ref('')
const colour = ref('#ffffff')
const opacity = ref(55)
const scale = ref(6)
const rotation = ref(0)
const placement = ref<Placement>('se')
const margin = ref(4)

const canvas = ref<HTMLCanvasElement | null>(null)
const size = ref<{ width: number; height: number } | null>(null)

let bitmap: ImageBitmap | null = null
let mark: ImageBitmap | null = null
const markName = ref<string | null>(null)

const file = computed(() => store.files[0] ?? null)
const format = computed<ImageFormat>(() => {
  const detected = file.value ? sniffImage(file.value.data) : null
  if (detected === 'png' || detected === 'webp') return detected
  if (detected === 'gif') return 'png'
  return 'jpeg'
})
const ready = computed(() => (kind.value === 'text' ? text.value.trim().length > 0 : !!markName.value))
const canRun = computed(() => !!file.value && !!size.value && ready.value && !store.busy)

/**
 * Draw the picture and the mark onto a context of any size.
 *
 * `width` and `height` are the context's, and every measurement is taken
 * from them, so calling this on a 600 px preview and on a 4000 px original
 * produces the same picture at two resolutions.
 */
function compose(context: CanvasRenderingContext2D, width: number, height: number) {
  if (!bitmap) return
  context.clearRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)

  const short = Math.min(width, height)
  const gap = (margin.value / 100) * short
  context.save()
  context.globalAlpha = opacity.value / 100

  /** The mark's own size, before it is placed. */
  let markWidth = 0
  let markHeight = 0
  if (kind.value === 'text') {
    const fontSize = Math.max(8, (scale.value / 100) * short)
    context.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`
    context.textBaseline = 'middle'
    context.textAlign = 'center'
    markWidth = context.measureText(text.value).width
    markHeight = fontSize
  } else if (mark) {
    markWidth = (scale.value / 100) * short * (mark.width / Math.min(mark.width, mark.height))
    markHeight = (scale.value / 100) * short * (mark.height / Math.min(mark.width, mark.height))
  }

  const draw = (centreX: number, centreY: number) => {
    context.save()
    context.translate(centreX, centreY)
    if (rotation.value) context.rotate((rotation.value * Math.PI) / 180)
    if (kind.value === 'text') {
      context.fillStyle = colour.value
      context.fillText(text.value, 0, 0)
    } else if (mark) {
      context.drawImage(mark, -markWidth / 2, -markHeight / 2, markWidth, markHeight)
    }
    context.restore()
  }

  if (placement.value === 'tile') {
    // Spaced by the mark's own size so the pattern never overlaps itself,
    // and offset row by row so it does not read as a grid.
    const stepX = markWidth + gap * 2
    const stepY = markHeight + gap * 2
    let row = 0
    for (let y = stepY / 2; y < height + stepY; y += stepY) {
      for (let x = (row % 2 ? stepX / 2 : 0) - stepX; x < width + stepX; x += stepX) {
        draw(x + stepX / 2, y)
      }
      row++
    }
  } else {
    // The placement is a compass point: "nw" is both north and west, "c" is
    // neither, so each axis is decided independently.
    const spot = placement.value
    const x = spot.includes('w')
      ? gap + markWidth / 2
      : spot.includes('e')
        ? width - gap - markWidth / 2
        : width / 2
    const y = spot.includes('n')
      ? gap + markHeight / 2
      : spot.includes('s')
        ? height - gap - markHeight / 2
        : height / 2
    draw(x, y)
  }

  context.restore()
}

function paint() {
  const el = canvas.value
  if (!el || !bitmap) return
  const context = el.getContext('2d')
  if (context) compose(context, el.width, el.height)
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
      if (!text.value) text.value = t('image.watermark.sample')
      paint()
    } catch {
      store.error = t('image.errorRead')
    }
  },
  { immediate: true }
)

watch([kind, text, colour, opacity, scale, rotation, placement, margin, markName], paint)

async function onMark(event: Event) {
  const chosen = (event.target as HTMLInputElement).files?.[0]
  if (!chosen) return
  try {
    mark?.close()
    mark = await createImageBitmap(chosen)
    markName.value = chosen.name
    kind.value = 'image'
    paint()
  } catch {
    store.error = t('image.errorRead')
  }
}

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
    compose(context, out.width, out.height)
    const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, MIME[format.value], 0.92))
    if (!blob) throw new Error('encode failed')
    store.setResult({
      name: withSuffix(file.value.name, '-watermarked', EXTENSION[format.value]),
      type: MIME[format.value],
      data: new Uint8Array(await blob.arrayBuffer()),
      sourceSize: file.value.size,
      note: t(`image.watermark.note.${placement.value === 'tile' ? 'tiled' : 'placed'}`)
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

onBeforeUnmount(() => {
  bitmap?.close()
  mark?.close()
})
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

      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('image.watermark.kindLabel') }}</legend>
        <div class="flex flex-wrap items-center gap-2">
          <label
            v-for="option in (['text', 'image'] as const)"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="
              kind === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
            "
          >
            <input v-model="kind" type="radio" :value="option" class="sr-only" />
            {{ t(`image.watermark.kind.${option}`) }}
          </label>
        </div>
      </fieldset>

      <div v-if="kind === 'text'" class="grid gap-4 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label for="wm-text" class="block text-sm font-medium text-stone-900">
            {{ t('image.watermark.textLabel') }}
          </label>
          <input
            id="wm-text"
            v-model="text"
            type="text"
            maxlength="80"
            class="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2"
          />
        </div>
        <div>
          <label for="wm-colour" class="block text-sm font-medium text-stone-900">
            {{ t('image.watermark.colourLabel') }}
          </label>
          <input
            id="wm-colour"
            v-model="colour"
            type="color"
            class="mt-2 h-10 w-20 cursor-pointer rounded border border-stone-300 bg-white"
          />
        </div>
      </div>

      <div v-else>
        <label class="block text-sm font-medium text-stone-900">{{ t('image.watermark.logoLabel') }}</label>
        <input
          type="file"
          accept="image/png,image/webp,image/jpeg,image/svg+xml"
          class="mt-2 block w-full text-sm text-stone-700 file:mr-3 file:rounded-lg file:border file:border-stone-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-ember-100"
          @change="onMark"
        />
        <p class="mt-1 text-xs text-stone-500">{{ t('image.watermark.logoHint') }}</p>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <label for="wm-size" class="block text-sm font-medium text-stone-900">
            {{ t('image.watermark.size', { n: scale }) }}
          </label>
          <input id="wm-size" v-model.number="scale" type="range" min="2" max="30" class="mt-2 w-full accent-ember-700" />
        </div>
        <div>
          <label for="wm-opacity" class="block text-sm font-medium text-stone-900">
            {{ t('image.watermark.opacity', { n: opacity }) }}
          </label>
          <input id="wm-opacity" v-model.number="opacity" type="range" min="5" max="100" class="mt-2 w-full accent-ember-700" />
        </div>
        <div>
          <label for="wm-rotation" class="block text-sm font-medium text-stone-900">
            {{ t('image.watermark.rotation', { n: rotation }) }}
          </label>
          <input id="wm-rotation" v-model.number="rotation" type="range" min="-90" max="90" step="5" class="mt-2 w-full accent-ember-700" />
        </div>
      </div>

      <div class="flex flex-wrap items-start gap-6">
        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('image.watermark.placeLabel') }}</legend>
          <div class="inline-grid grid-cols-3 gap-1 rounded-lg border border-stone-300 bg-white p-1">
            <button
              v-for="spot in PLACEMENTS.flat()"
              :key="spot"
              type="button"
              class="size-9 rounded"
              :class="placement === spot ? 'bg-ember-700' : 'bg-stone-100 hover:bg-ember-200'"
              :aria-label="t(`image.watermark.place.${spot}`)"
              :title="t(`image.watermark.place.${spot}`)"
              :aria-pressed="placement === spot"
              @click="placement = spot"
            >
              <span class="sr-only">{{ t(`image.watermark.place.${spot}`) }}</span>
            </button>
          </div>
          <button
            type="button"
            class="mt-2 w-full rounded-lg border px-3 py-2 text-sm font-medium"
            :class="
              placement === 'tile'
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
            "
            :aria-pressed="placement === 'tile'"
            @click="placement = 'tile'"
          >
            {{ t('image.watermark.place.tile') }}
          </button>
        </fieldset>

        <div class="min-w-48 flex-1">
          <label for="wm-margin" class="block text-sm font-medium text-stone-900">
            {{ t('image.watermark.margin', { n: margin }) }}
          </label>
          <input id="wm-margin" v-model.number="margin" type="range" min="0" max="15" class="mt-2 w-full accent-ember-700" />
          <p class="mt-1 text-xs text-stone-500">{{ t('image.watermark.marginHint') }}</p>
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
        {{ store.busy ? t('image.working') : t('image.watermark.action') }}
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
