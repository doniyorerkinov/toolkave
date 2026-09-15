<script setup lang="ts">
import { Trash2, X } from 'lucide-vue-next'
import { readableOn, rgbToHex, rgbToHsl, type Rgb } from '~~/shared/colour'
import { BY_HEX } from '~~/shared/colour-names'
import { decodeImage } from '~/composables/useImage'
import { formatBytes } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * Taking a colour out of a picture.
 *
 * Two things people mean by this, so both are here: the handful of colours a
 * photograph is actually made of, worked out automatically, and the one
 * specific pixel someone wants — that shirt, that logo, that sky.
 *
 * The loupe is not decoration. At any size a browser can show a photo,
 * clicking on "the red bit" is a guess about which pixel you got; magnifying
 * the neighbourhood turns it into a choice.
 */
const { t } = useI18n()
const { copied, copy } = useCopy()
const store = useFilesStore()

const canvas = ref<HTMLCanvasElement | null>(null)
const loupe = ref<HTMLCanvasElement | null>(null)
const size = ref<{ width: number; height: number } | null>(null)
const palette = ref<Rgb[]>([])
const picked = ref<Rgb[]>([])
const hovered = ref<Rgb | null>(null)
/** Where the loupe sits, in displayed pixels. */
const cursor = ref<{ x: number; y: number } | null>(null)
const busy = ref(false)

let bitmap: ImageBitmap | null = null
/** Full resolution, kept for reading pixels; the visible canvas is smaller. */
let source: HTMLCanvasElement | null = null
let scale = 1

const file = computed(() => store.files[0] ?? null)

const LOUPE = 108
const ZOOM = 10

function release() {
  if (source) {
    source.width = 0
    source.height = 0
    source = null
  }
  bitmap?.close()
  bitmap = null
}

watch(
  file,
  async current => {
    release()
    size.value = null
    palette.value = []
    picked.value = []
    hovered.value = null
    cursor.value = null
    if (!current) return
    busy.value = true
    try {
      bitmap = await decodeImage(current.data)
      size.value = { width: bitmap.width, height: bitmap.height }

      source = document.createElement('canvas')
      source.width = bitmap.width
      source.height = bitmap.height
      const context = source.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('canvas unavailable')
      context.drawImage(bitmap, 0, 0)

      const room = Math.max(240, Math.min(640, canvas.value?.parentElement?.clientWidth ?? 640))
      scale = Math.max(bitmap.width / room, bitmap.height / 520, 1)
      await nextTick()
      const el = canvas.value
      if (el) {
        el.width = Math.round(bitmap.width / scale)
        el.height = Math.round(bitmap.height / scale)
        el.getContext('2d')?.drawImage(bitmap, 0, 0, el.width, el.height)
      }
      palette.value = await paletteFromImage(bitmap, 6)
    } catch {
      store.error = t('image.errorRead')
    } finally {
      busy.value = false
    }
  },
  { immediate: true }
)

/** The displayed point, and the source pixel under it. */
function sample(event: PointerEvent): { display: { x: number; y: number }; rgb: Rgb } | null {
  const el = canvas.value
  if (!el || !source) return null
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const x = (event.clientX - rect.left) / rect.width
  const y = (event.clientY - rect.top) / rect.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return null

  const sourceX = Math.min(source.width - 1, Math.max(0, Math.floor(x * source.width)))
  const sourceY = Math.min(source.height - 1, Math.max(0, Math.floor(y * source.height)))
  const context = source.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  const data = context.getImageData(sourceX, sourceY, 1, 1).data
  return {
    display: { x: x * el.width, y: y * el.height },
    rgb: { r: data[0]!, g: data[1]!, b: data[2]! }
  }
}

function drawLoupe(point: { x: number; y: number }) {
  const el = loupe.value
  if (!el || !source) return
  const context = el.getContext('2d')
  if (!context) return
  const span = LOUPE / ZOOM
  const centreX = (point.x / (canvas.value?.width ?? 1)) * source.width
  const centreY = (point.y / (canvas.value?.height ?? 1)) * source.height

  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, LOUPE, LOUPE)
  context.drawImage(source, centreX - span / 2, centreY - span / 2, span, span, 0, 0, LOUPE, LOUPE)

  // The pixel actually under the cursor, boxed so there is no ambiguity.
  context.strokeStyle = '#ffffff'
  context.lineWidth = 2
  context.strokeRect(LOUPE / 2 - ZOOM / 2, LOUPE / 2 - ZOOM / 2, ZOOM, ZOOM)
  context.strokeStyle = '#1c1917'
  context.lineWidth = 1
  context.strokeRect(LOUPE / 2 - ZOOM / 2 - 1, LOUPE / 2 - ZOOM / 2 - 1, ZOOM + 2, ZOOM + 2)
}

function onMove(event: PointerEvent) {
  const hit = sample(event)
  if (!hit) return
  hovered.value = hit.rgb
  cursor.value = hit.display
  drawLoupe(hit.display)
}

function onLeave() {
  hovered.value = null
  cursor.value = null
}

function onPick(event: PointerEvent) {
  const hit = sample(event)
  if (!hit) return
  const hex = rgbToHex(hit.rgb)
  // Keep the newest first and never the same colour twice.
  picked.value = [hit.rgb, ...picked.value.filter(entry => rgbToHex(entry) !== hex)].slice(0, 12)
  copy(hex)
}

const shown = computed(() => hovered.value ?? picked.value[0] ?? palette.value[0] ?? null)

const codes = computed(() => {
  const rgb = shown.value
  if (!rgb) return []
  const hsl = rgbToHsl(rgb)
  return [
    rgbToHex(rgb),
    `rgb(${rgb.r} ${rgb.g} ${rgb.b})`,
    `hsl(${Math.round(hsl.h)} ${Math.round(hsl.s * 100)}% ${Math.round(hsl.l * 100)}%)`
  ]
})

/** Black or white over the big swatch, whichever survives on it. */
const readableOnShown = computed(() => readableOn(shown.value ?? { r: 255, g: 255, b: 255 }))

const shownName = computed(() => (shown.value ? BY_HEX[rgbToHex(shown.value)] : undefined))

/** Everything collected, as something you can paste into a stylesheet. */
const asCss = computed(() =>
  picked.value
    .map((entry, index) => `  --colour-${index + 1}: ${rgbToHex(entry)};`)
    .join('\n')
)

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}

onBeforeUnmount(release)
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      v-if="!file"
      accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="size" class="text-sm text-stone-500">
      {{ t('image.dimensions', { w: size.width, h: size.height }) }} · {{ formatBytes(file!.size) }}
    </p>
    <p v-if="busy" class="text-sm text-stone-600">{{ t('colour.fromImage.reading') }}</p>

    <div v-if="file && size" class="space-y-5">
      <div class="relative flex justify-center rounded-xl border border-stone-200 bg-stone-100 p-3">
        <canvas
          ref="canvas"
          class="max-w-full cursor-crosshair touch-none rounded-sm shadow-sm select-none"
          @pointermove="onMove"
          @pointerdown.prevent="onPick"
          @pointerleave="onLeave"
        />

        <!-- The loupe follows the cursor but never leaves the picture. -->
        <div
          v-show="cursor"
          class="pointer-events-none absolute overflow-hidden rounded-full border-2 border-white shadow-lg ring-1 ring-stone-900/20"
          :style="{
            width: LOUPE + 'px',
            height: LOUPE + 'px',
            left: 'calc(' + (cursor?.x ?? 0) + 'px + 0.75rem)',
            top: 'calc(' + (cursor?.y ?? 0) + 'px + 0.75rem)',
            transform: 'translate(-50%, -130%)'
          }"
        >
          <canvas ref="loupe" :width="LOUPE" :height="LOUPE" class="block" />
        </div>
      </div>

      <p class="text-center text-sm text-stone-500">{{ t('colour.fromImage.hint') }}</p>

      <div v-if="shown" class="grid gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
        <div class="flex min-h-24 items-end rounded-xl p-3 shadow-sm" :style="{ backgroundColor: codes[0] }">
          <span class="font-mono text-sm font-bold" :style="{ color: rgbToHex(readableOnShown) }">
            {{ codes[0] }}
            <span v-if="shownName" class="block text-xs font-normal opacity-75">{{ shownName }}</span>
          </span>
        </div>
        <div class="flex flex-col gap-1.5">
          <button
            v-for="code in codes"
            :key="code"
            type="button"
            class="truncate rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 text-start font-mono text-sm text-stone-800 hover:border-ember-400 hover:bg-white"
            @click="copy(code)"
          >
            {{ copied === code ? t('colour.copied') : code }}
          </button>
        </div>
      </div>

      <section v-if="palette.length">
        <h2 class="mb-2 text-sm font-semibold text-stone-900">{{ t('colour.fromImage.main') }}</h2>
        <div class="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          <ShellSwatch v-for="(entry, i) in palette" :key="i" :colour="entry" size="sm" show-name />
        </div>
      </section>

      <section v-if="picked.length">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold text-stone-900">
            {{ t('colour.fromImage.picked', { n: picked.length }) }}
          </h2>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
              @click="copy(asCss, 'css')"
            >
              {{ copied === 'css' ? t('colour.copied') : t('colour.fromImage.copyCss') }}
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
              @click="picked = []"
            >
              <Trash2 :size="15" aria-hidden="true" />
              {{ t('colour.fromImage.clear') }}
            </button>
          </div>
        </div>
        <div class="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-12">
          <div v-for="(entry, i) in picked" :key="rgbToHex(entry) + i" class="relative">
            <ShellSwatch :colour="entry" size="sm" />
            <button
              type="button"
              class="absolute end-0.5 top-0.5 rounded bg-black/40 p-0.5 text-white opacity-0 transition hover:bg-black/70 focus:opacity-100 group-hover:opacity-100"
              :class="'opacity-60'"
              :aria-label="t('colour.fromImage.remove')"
              @click="picked = picked.filter((_, index) => index !== i)"
            >
              <X :size="11" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
