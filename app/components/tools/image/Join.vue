<script setup lang="ts">
import {
  EXTENSION,
  MIME,
  UNSUPPORTED_OUTPUT,
  buildCollage,
  decodeImage,
  joinImages,
  type ImageFormat,
  type JoinOptions
} from '~/composables/useImage'
import { ASPECTS, LAYOUTS } from '~/data/layouts'
import { formatBytes } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * Several pictures into one — in a line, in a grid, or in a layout where
 * one of them is the main one.
 *
 * The layout preview is tap-to-swap rather than drag-and-drop: a drag that
 * also has to work on a phone is a much larger thing to get right, and
 * tapping two cells is not worse. The file list above still drags, for
 * anyone who prefers that.
 */
const { t } = useI18n()
const store = useFilesStore()

type Mode = JoinOptions['direction'] | 'layout'

const mode = ref<Mode>('layout')
const columns = ref(2)
const gap = ref(0)
const background = ref('#ffffff')
const format = ref<ImageFormat>('jpeg')

const layoutId = ref('big-left')
const aspectId = ref('square')
const rounded = ref(0)
/** Which cell is waiting for a partner to swap with. */
const picked = ref<number | null>(null)

const canvas = ref<HTMLCanvasElement | null>(null)
const bitmaps = shallowRef<ImageBitmap[]>([])

const files = computed(() => store.files)
const layout = computed(() => LAYOUTS.find(entry => entry.id === layoutId.value) ?? LAYOUTS[0]!)
const aspect = computed(() => ASPECTS.find(entry => entry.id === aspectId.value)?.value ?? 1)
/** Only layouts we have enough pictures for; more than enough is fine. */
const usable = computed(() => LAYOUTS.filter(entry => entry.cells.length <= files.value.length))
const spare = computed(() => Math.max(0, files.value.length - layout.value.cells.length))

const canRun = computed(
  () =>
    files.value.length >= 2 &&
    !store.busy &&
    (mode.value !== 'layout' || files.value.length >= layout.value.cells.length)
)

/** Decode once and keep them: the preview redraws on every setting change. */
watch(
  files,
  async list => {
    for (const bitmap of bitmaps.value) bitmap.close()
    bitmaps.value = []
    if (!list.length) return
    try {
      bitmaps.value = await Promise.all(list.map(file => decodeImage(file.data)))
    } catch {
      store.error = t('image.errorRead')
      return
    }
    if (!usable.value.some(entry => entry.id === layoutId.value)) {
      layoutId.value = usable.value.at(-1)?.id ?? 'pair'
    }
    await nextTick()
    paint()
  },
  { deep: true, immediate: true }
)

watch([mode, layoutId, aspectId, gap, background, rounded, picked], () => nextTick().then(paint))

/** The preview, drawn with the same rules as the export at a smaller size. */
function paint() {
  const el = canvas.value
  if (!el || mode.value !== 'layout' || !bitmaps.value.length) return
  const room = Math.max(240, Math.min(520, el.parentElement?.clientWidth ?? 520))
  const width = Math.round(aspect.value >= 1 ? room : room * aspect.value)
  const height = Math.round(width / aspect.value)
  el.width = width
  el.height = height

  const context = el.getContext('2d')
  if (!context) return
  context.fillStyle = background.value
  context.fillRect(0, 0, width, height)

  const short = Math.min(width, height)
  const space = (gap.value / 100) * short * 0.5
  const radius = (rounded.value / 100) * short * 0.5

  layout.value.cells.forEach((cell, index) => {
    const bitmap = bitmaps.value[index]
    const left = cell.x * width + space
    const top = cell.y * height + space
    const cellWidth = cell.w * width - space * 2
    const cellHeight = cell.h * height - space * 2
    if (cellWidth <= 0 || cellHeight <= 0) return

    context.save()
    context.beginPath()
    if (radius > 0 && 'roundRect' in context) {
      context.roundRect(left, top, cellWidth, cellHeight, Math.min(radius, cellWidth / 2, cellHeight / 2))
    } else {
      context.rect(left, top, cellWidth, cellHeight)
    }
    context.clip()
    if (bitmap) {
      const cover = Math.max(cellWidth / bitmap.width, cellHeight / bitmap.height)
      const drawWidth = bitmap.width * cover
      const drawHeight = bitmap.height * cover
      context.drawImage(
        bitmap,
        left + (cellWidth - drawWidth) / 2,
        top + (cellHeight - drawHeight) / 2,
        drawWidth,
        drawHeight
      )
    } else {
      context.fillStyle = '#e7e5e4'
      context.fillRect(left, top, cellWidth, cellHeight)
    }
    context.restore()

    // The cell waiting to be swapped is marked, and every cell carries its
    // number so the list above and the picture agree on what is what.
    if (picked.value === index) {
      context.strokeStyle = '#c2410c'
      context.lineWidth = 4
      context.strokeRect(left + 2, top + 2, cellWidth - 4, cellHeight - 4)
    }
    context.fillStyle = 'rgba(28, 25, 23, 0.65)'
    context.beginPath()
    context.arc(left + 16, top + 16, 12, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#ffffff'
    context.font = '600 13px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(String(index + 1), left + 16, top + 17)
  })
}

/** Which cell a click landed in. */
function cellAt(event: PointerEvent): number {
  const el = canvas.value
  if (!el) return -1
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return -1
  const x = (event.clientX - rect.left) / rect.width
  const y = (event.clientY - rect.top) / rect.height
  return layout.value.cells.findIndex(
    cell => x >= cell.x && x <= cell.x + cell.w && y >= cell.y && y <= cell.y + cell.h
  )
}

function onCanvasClick(event: PointerEvent) {
  const index = cellAt(event)
  if (index < 0) return
  if (picked.value === null) {
    picked.value = index
    return
  }
  if (picked.value !== index) store.swap(picked.value, index)
  picked.value = null
}

async function run() {
  if (!canRun.value) return
  store.busy = true
  store.error = null
  try {
    const out =
      mode.value === 'layout'
        ? await buildCollage(
            [...files.value],
            {
              cells: layout.value.cells,
              aspect: aspect.value,
              gap: (gap.value / 100) * 0.5,
              background: background.value,
              radius: (rounded.value / 100) * 0.5
            },
            format.value,
            0.92
          )
        : await joinImages(
            [...files.value],
            { direction: mode.value, columns: columns.value, gap: gap.value, background: background.value },
            format.value,
            0.92
          )
    store.setResult({
      name: `joined.${EXTENSION[format.value]}`,
      type: MIME[format.value],
      data: out.data,
      sourceSize: files.value.reduce((sum, file) => sum + file.size, 0),
      note: t('image.join.note', {
        n: mode.value === 'layout' ? layout.value.cells.length : files.value.length,
        w: out.width,
        h: out.height
      })
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

function onFiles(chosen: File[]) {
  store.add(chosen)
}

onBeforeUnmount(() => {
  for (const bitmap of bitmaps.value) bitmap.close()
})
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
      :multiple="true"
      @files="onFiles($event)"
    />
    <ShellFileList
      v-if="files.length"
      :files="files"
      :reorderable="true"
      @remove="store.remove($event)"
      @move="(from, to) => store.move(from, to)"
    />

    <p v-if="files.length" class="text-sm text-stone-500">
      {{ t('image.join.count', { n: files.length }) }} ·
      {{ formatBytes(files.reduce((sum, file) => sum + file.size, 0)) }}
    </p>

    <div v-if="files.length >= 2" class="space-y-4">
      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('image.join.directionLabel') }}</legend>
        <div class="flex flex-wrap items-center gap-2">
          <label
            v-for="option in (['layout', 'row', 'column', 'grid'] as Mode[])"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="
              mode === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            "
          >
            <input v-model="mode" type="radio" :value="option" class="sr-only" />
            {{ t(`image.join.direction.${option}`) }}
          </label>
          <label v-if="mode === 'grid'" class="flex items-center gap-2 text-sm text-stone-700">
            <span>{{ t('image.join.columns') }}</span>
            <input
              v-model.number="columns"
              type="number"
              min="1"
              :max="Math.max(1, files.length)"
              class="w-20 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm"
            />
          </label>
        </div>
        <p class="mt-2 text-sm text-stone-500">{{ t(`image.join.hint.${mode}`) }}</p>
      </fieldset>

      <template v-if="mode === 'layout'">
        <div class="flex justify-center rounded-xl border border-stone-200 bg-stone-100 p-3">
          <canvas
            ref="canvas"
            class="max-w-full cursor-pointer touch-none rounded-sm shadow-sm select-none"
            @pointerdown.prevent="onCanvasClick"
          />
        </div>
        <p class="text-center text-sm text-stone-500">
          {{ picked === null ? t('image.join.swapHint') : t('image.join.swapPicked', { n: picked + 1 }) }}
        </p>
        <p v-if="spare" class="text-center text-sm text-amber-800">
          {{ t('image.join.spare', { n: spare }) }}
        </p>

        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('image.join.layoutLabel') }}</legend>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="entry in usable"
              :key="entry.id"
              type="button"
              class="rounded-lg border p-1.5"
              :class="
                layoutId === entry.id ? 'border-ember-500 bg-ember-50' : 'border-stone-300 bg-white hover:bg-stone-50'
              "
              :aria-label="t(`image.join.layout.${entry.id}`)"
              :title="t(`image.join.layout.${entry.id}`)"
              :aria-pressed="layoutId === entry.id"
              @click="layoutId = entry.id"
            >
              <svg viewBox="0 0 40 40" class="size-10" aria-hidden="true">
                <rect
                  v-for="(cell, index) in entry.cells"
                  :key="index"
                  :x="cell.x * 40 + 1"
                  :y="cell.y * 40 + 1"
                  :width="Math.max(0, cell.w * 40 - 2)"
                  :height="Math.max(0, cell.h * 40 - 2)"
                  rx="2"
                  :fill="layoutId === entry.id ? '#c2410c' : '#a8a29e'"
                />
              </svg>
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('image.join.aspectLabel') }}</legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="entry in ASPECTS"
              :key="entry.id"
              class="cursor-pointer rounded-lg border px-3.5 py-2 text-sm font-medium"
              :class="
                aspectId === entry.id
                  ? 'border-ember-500 bg-ember-50 text-ember-900'
                  : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              "
            >
              <input v-model="aspectId" type="radio" :value="entry.id" class="sr-only" />
              {{ t(`image.join.aspect.${entry.id}`) }}
            </label>
          </div>
        </fieldset>
      </template>

      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <label for="join-gap" class="block text-sm font-medium text-stone-900">
            {{ mode === 'layout' ? t('image.join.gapPercent', { n: gap }) : t('image.join.gap', { n: gap }) }}
          </label>
          <input
            id="join-gap"
            v-model.number="gap"
            type="range"
            min="0"
            :max="mode === 'layout' ? 12 : 80"
            class="mt-2 w-full accent-ember-700"
          />
        </div>
        <div v-if="mode === 'layout'">
          <label for="join-round" class="block text-sm font-medium text-stone-900">
            {{ t('image.join.rounded', { n: rounded }) }}
          </label>
          <input id="join-round" v-model.number="rounded" type="range" min="0" max="12" class="mt-2 w-full accent-ember-700" />
        </div>
        <div v-if="gap > 0 || mode === 'grid' || mode === 'layout'">
          <label for="join-background" class="block text-sm font-medium text-stone-900">
            {{ t('image.join.backgroundLabel') }}
          </label>
          <input
            id="join-background"
            v-model="background"
            type="color"
            class="mt-2 h-10 w-20 cursor-pointer rounded border border-stone-300 bg-white"
          />
        </div>
        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('image.formatLabel') }}</legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="option in (['jpeg', 'png', 'webp'] as ImageFormat[])"
              :key="option"
              class="cursor-pointer rounded-lg border px-3.5 py-2 text-sm font-medium"
              :class="
                format === option
                  ? 'border-ember-500 bg-ember-50 text-ember-900'
                  : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              "
            >
              <input v-model="format" type="radio" :value="option" class="sr-only" />
              {{ option.toUpperCase() }}
            </label>
          </div>
        </fieldset>
      </div>
    </div>

    <div v-if="files.length" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('image.working') : t('image.join.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
        @click="store.reset()"
      >
        {{ t('result.startOver') }}
      </button>
    </div>

    <p v-if="files.length === 1" class="text-sm text-stone-500">{{ t('image.join.needTwo') }}</p>
    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard v-if="store.result" :result="store.result" @reset="store.reset()" @chain="store.chainResult()" />
  </div>
</template>
