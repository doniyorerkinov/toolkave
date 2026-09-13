<script setup lang="ts">
import {
  EXTENSION,
  MIME,
  PRINT_DPI,
  buildPhotoSheet,
  decodeImage,
  mmToPx,
  resizeImage,
  type CropRect
} from '~/composables/useImage'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * A document photo, cut to a country's millimetres.
 *
 * The frame is locked to the standard's ratio and carries the head guides
 * the standard actually specifies, because the reason these photos get
 * rejected is almost never the size in millimetres — it is that the head is
 * too small, too large, or not centred.
 */
const { t } = useI18n()
const store = useFilesStore()

interface DocSize {
  id: string
  width: number
  height: number
}

/** Millimetres, as written in the rules that ask for them. */
const SIZES: DocSize[] = [
  { id: '35x45', width: 35, height: 45 },
  { id: '30x40', width: 30, height: 40 },
  { id: '35x40', width: 35, height: 40 },
  { id: '33x48', width: 33, height: 48 },
  { id: '2x2in', width: 50.8, height: 50.8 },
  { id: '50x70', width: 50, height: 70 }
]

const PAPERS = {
  '10x15': { width: 100, height: 150 },
  a4: { width: 210, height: 297 }
}

const sizeId = ref('35x45')
const output = ref<'single' | 'sheet'>('sheet')
const paper = ref<keyof typeof PAPERS>('10x15')
const guides = ref(true)

const canvas = ref<HTMLCanvasElement | null>(null)
const source = ref<{ width: number; height: number } | null>(null)
const hoverCursor = ref('move')

let bitmap: ImageBitmap | null = null
/** Source pixels per displayed pixel. */
let scale = 1

const file = computed(() => store.files[0] ?? null)
const size = computed(() => SIZES.find(entry => entry.id === sizeId.value) ?? SIZES[0]!)
const ratio = computed(() => size.value.width / size.value.height)
const pixels = computed(() => ({
  width: mmToPx(size.value.width),
  height: mmToPx(size.value.height)
}))

/** The part of the source that becomes the photo, in source pixels. */
const frame = ref<CropRect>({ x: 0, y: 0, width: 0, height: 0 })
const canRun = computed(() => !!file.value && frame.value.width > 0 && !store.busy)

/** The largest frame of the right shape that fits, centred on the picture. */
function fitFrame() {
  if (!bitmap) return
  let width = bitmap.width
  let height = width / ratio.value
  if (height > bitmap.height) {
    height = bitmap.height
    width = height * ratio.value
  }
  frame.value = {
    x: (bitmap.width - width) / 2,
    y: (bitmap.height - height) / 2,
    width,
    height
  }
}

/**
 * Where the head belongs inside the frame, as a fraction of its height.
 * Every standard says roughly the same thing in different words: the head
 * fills about three quarters of the picture and sits a little below the top.
 */
const HEAD_TOP = 0.12
const HEAD_BOTTOM = 0.86
const HANDLE = 11

function paint() {
  const el = canvas.value
  if (!el || !bitmap) return
  const context = el.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, el.width, el.height)
  context.drawImage(bitmap, 0, 0, el.width, el.height)

  const box = {
    x: frame.value.x / scale,
    y: frame.value.y / scale,
    width: frame.value.width / scale,
    height: frame.value.height / scale
  }

  // Everything outside the frame is dimmed so the photo reads as the photo.
  context.fillStyle = 'rgba(28, 25, 23, 0.55)'
  context.beginPath()
  context.rect(0, 0, el.width, el.height)
  context.rect(box.x, box.y + box.height, box.width, -box.height)
  context.fill('evenodd')

  if (guides.value) {
    context.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    context.lineWidth = 1
    context.setLineDash([6, 4])
    for (const fraction of [HEAD_TOP, HEAD_BOTTOM]) {
      const y = box.y + box.height * fraction
      context.beginPath()
      context.moveTo(box.x, y)
      context.lineTo(box.x + box.width, y)
      context.stroke()
    }
    const centre = box.x + box.width / 2
    context.beginPath()
    context.moveTo(centre, box.y)
    context.lineTo(centre, box.y + box.height)
    context.stroke()
    context.setLineDash([])
  }

  context.strokeStyle = '#ffffff'
  context.lineWidth = 2
  context.strokeRect(box.x, box.y, box.width, box.height)

  // Corner grips, drawn inside the frame so they never leave the canvas.
  context.fillStyle = '#ffffff'
  context.strokeStyle = '#c2410c'
  context.lineWidth = 2
  for (const [cx, cy] of [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height]
  ] as const) {
    context.beginPath()
    context.arc(cx, cy, HANDLE / 2, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  }
}

watch(
  file,
  async current => {
    bitmap?.close()
    bitmap = null
    source.value = null
    if (!current) return
    try {
      bitmap = await decodeImage(current.data)
      source.value = { width: bitmap.width, height: bitmap.height }
      const room = Math.max(240, Math.min(560, canvas.value?.parentElement?.clientWidth ?? 560))
      scale = Math.max(bitmap.width / room, bitmap.height / 520, 1)
      await nextTick()
      if (canvas.value) {
        canvas.value.width = Math.round(bitmap.width / scale)
        canvas.value.height = Math.round(bitmap.height / scale)
      }
      fitFrame()
      paint()
    } catch {
      store.error = t('image.errorRead')
    }
  },
  { immediate: true }
)

watch(sizeId, () => {
  fitFrame()
  paint()
})
watch([guides, frame], paint, { deep: true })

type Grip = 'nw' | 'ne' | 'sw' | 'se'
interface Drag {
  grip: Grip | null
  originX: number
  originY: number
  start: CropRect
}
let drag: Drag | null = null

function at(event: PointerEvent): { x: number; y: number } | null {
  const el = canvas.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return {
    x: ((event.clientX - rect.left) / rect.width) * el.width * scale,
    y: ((event.clientY - rect.top) / rect.height) * el.height * scale
  }
}

/** Which corner grip a point is on, if any. */
function gripAt(x: number, y: number): Grip | null {
  const reach = (HANDLE / 2 + 5) * scale
  const box = frame.value
  const near = (px: number, py: number) => Math.hypot(x - px, y - py) <= reach
  if (near(box.x, box.y)) return 'nw'
  if (near(box.x + box.width, box.y)) return 'ne'
  if (near(box.x, box.y + box.height)) return 'sw'
  if (near(box.x + box.width, box.y + box.height)) return 'se'
  return null
}

const CURSOR: Record<Grip, string> = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize' }

function onPointerDown(event: PointerEvent) {
  const point = at(event)
  if (!point || !bitmap) return
  canvas.value?.setPointerCapture(event.pointerId)
  drag = { grip: gripAt(point.x, point.y), originX: point.x, originY: point.y, start: { ...frame.value } }
}

/**
 * Resize from a corner, keeping the standard's shape and staying inside the
 * picture. The corner opposite the one being dragged is the anchor, so the
 * frame grows towards the pointer the way a selection is expected to.
 */
function resizeFrom(grip: Grip, point: { x: number; y: number }) {
  if (!bitmap) return
  const start = drag!.start
  const anchorX = grip === 'nw' || grip === 'sw' ? start.x + start.width : start.x
  const anchorY = grip === 'nw' || grip === 'ne' ? start.y + start.height : start.y

  let width = Math.abs(point.x - anchorX)
  let height = width / ratio.value
  if (height > Math.abs(point.y - anchorY) * 1.0) {
    // Follow whichever axis the pointer moved less on, so the frame never
    // outruns the corner being dragged.
    height = Math.abs(point.y - anchorY)
    width = height * ratio.value
  }

  const left = grip === 'nw' || grip === 'sw' ? anchorX - width : anchorX
  const top = grip === 'nw' || grip === 'ne' ? anchorY - height : anchorY

  // Shrink to fit rather than clamping the edges, which would change the shape.
  const overflow = Math.max(
    1,
    left < 0 ? width / (width + left) : 1,
    top < 0 ? height / (height + top) : 1,
    left + width > bitmap.width ? width / (bitmap.width - left) : 1,
    top + height > bitmap.height ? height / (bitmap.height - top) : 1
  )
  width /= overflow
  height /= overflow
  const minimum = 40
  if (width < minimum || height < minimum) return

  frame.value = {
    x: grip === 'nw' || grip === 'sw' ? anchorX - width : anchorX,
    y: grip === 'nw' || grip === 'ne' ? anchorY - height : anchorY,
    width,
    height
  }
}

function onPointerMove(event: PointerEvent) {
  const point = at(event)
  if (!point || !bitmap) return

  if (!drag) {
    const grip = gripAt(point.x, point.y)
    hoverCursor.value = grip ? CURSOR[grip] : 'move'
    return
  }

  if (drag.grip) {
    resizeFrom(drag.grip, point)
    return
  }

  const start = drag.start
  frame.value = {
    ...start,
    x: Math.min(Math.max(0, start.x + point.x - drag.originX), bitmap.width - start.width),
    y: Math.min(Math.max(0, start.y + point.y - drag.originY), bitmap.height - start.height)
  }
}

function onPointerUp(event: PointerEvent) {
  canvas.value?.releasePointerCapture(event.pointerId)
  drag = null
}

const sheetCount = computed(() => {
  const sheet = PAPERS[paper.value]
  const across = Math.floor((sheet.width - 8 + 2) / (size.value.width + 2))
  const down = Math.floor((sheet.height - 8 + 2) / (size.value.height + 2))
  return Math.max(0, across) * Math.max(0, down)
})

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const photo = await resizeImage(
      file.value,
      pixels.value,
      'jpeg',
      0.95,
      {
        x: Math.round(frame.value.x),
        y: Math.round(frame.value.y),
        width: Math.round(frame.value.width),
        height: Math.round(frame.value.height)
      }
    )

    if (output.value === 'single') {
      store.setResult({
        name: withSuffix(file.value.name, '-photo', EXTENSION.jpeg),
        type: MIME.jpeg,
        data: photo.data,
        sourceSize: file.value.size,
        note: t('image.passport.noteSingle', {
          size: t(`image.passport.size.${size.value.id}`),
          w: pixels.value.width,
          h: pixels.value.height,
          dpi: PRINT_DPI
        })
      })
      return
    }

    const sheet = await buildPhotoSheet(photo.data, {
      paper: PAPERS[paper.value],
      photo: size.value,
      gap: 2,
      margin: 4
    })
    store.setResult({
      name: withSuffix(file.value.name, '-photo-sheet', EXTENSION.jpeg),
      type: MIME.jpeg,
      data: sheet.data,
      sourceSize: file.value.size,
      note: t('image.passport.noteSheet', {
        n: sheet.count,
        size: t(`image.passport.size.${size.value.id}`),
        paper: t(`image.passport.paper.${paper.value}`)
      })
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

    <p v-if="source" class="text-sm text-stone-500">
      {{ t('image.dimensions', { w: source.width, h: source.height }) }} · {{ formatBytes(file!.size) }}
    </p>

    <div v-if="file && source" class="space-y-4">
      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">
          {{ t('image.passport.sizeLabel') }}
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in SIZES"
            :key="option.id"
            class="cursor-pointer rounded-lg border px-3.5 py-2 text-sm"
            :class="
              sizeId === option.id
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            "
          >
            <input v-model="sizeId" type="radio" :value="option.id" class="sr-only" />
            <span class="font-medium">{{ t(`image.passport.size.${option.id}`) }}</span>
            <span class="mt-0.5 block text-xs opacity-70">{{ t(`image.passport.use.${option.id}`) }}</span>
          </label>
        </div>
      </fieldset>

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

      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-stone-500">{{ t('image.passport.frameHint') }}</p>
        <label class="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
          <input v-model="guides" type="checkbox" class="size-4 accent-ember-700" />
          {{ t('image.passport.showGuides') }}
        </label>
      </div>

      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">
          {{ t('image.passport.outputLabel') }}
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in (['sheet', 'single'] as const)"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="
              output === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            "
          >
            <input v-model="output" type="radio" :value="option" class="sr-only" />
            {{ t(`image.passport.output.${option}`) }}
          </label>
        </div>
      </fieldset>

      <fieldset v-if="output === 'sheet'">
        <legend class="mb-2 block text-sm font-medium text-stone-900">
          {{ t('image.passport.paperLabel') }}
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in (['10x15', 'a4'] as const)"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="
              paper === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            "
          >
            <input v-model="paper" type="radio" :value="option" class="sr-only" />
            {{ t(`image.passport.paper.${option}`) }}
          </label>
        </div>
        <p class="mt-2 text-sm text-stone-500">{{ t('image.passport.fits', { n: sheetCount }) }}</p>
      </fieldset>

      <p v-if="output === 'single'" class="text-sm text-stone-500">
        {{ t('image.passport.singleHint', { w: pixels.width, h: pixels.height, dpi: PRINT_DPI }) }}
      </p>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('image.working') : t('image.passport.action') }}
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
