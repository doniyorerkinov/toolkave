<script setup lang="ts">
import {
  EXTENSION,
  MIME,
  PRINT_DPI,
  buildPhotoSheet,
  mmToPx,
  resizeImage
} from '~/composables/useImage'
import { useCropFrame } from '~/composables/useCropFrame'
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

const file = computed(() => store.files[0] ?? null)
const size = computed(() => SIZES.find(entry => entry.id === sizeId.value) ?? SIZES[0]!)
const ratio = computed(() => size.value.width / size.value.height)
const pixels = computed(() => ({
  width: mmToPx(size.value.width),
  height: mmToPx(size.value.height)
}))

/**
 * Where the head belongs inside the frame, as a fraction of its height.
 * Every standard says roughly the same thing in different words: the head
 * fills about three quarters of the picture and sits a little below the top.
 */
const HEAD_TOP = 0.12
const HEAD_BOTTOM = 0.86

const { canvas, source, cursor, load, rect, handlers, paint } = useCropFrame({
  ratio,
  draw(context, box) {
    const el = context.canvas
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

    context.fillStyle = '#ffffff'
    context.strokeStyle = '#c2410c'
    for (const [cx, cy] of [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x, box.y + box.height],
      [box.x + box.width, box.y + box.height]
    ] as const) {
      context.beginPath()
      context.arc(cx, cy, 5.5, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    }
  }
})

const canRun = computed(() => !!file.value && !!source.value && !store.busy)

watch(
  file,
  async current => {
    try {
      await load(current)
    } catch {
      store.error = t('image.errorRead')
    }
  },
  { immediate: true }
)
watch(guides, paint)

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
    const photo = await resizeImage(file.value, pixels.value, 'jpeg', 0.95, rect())

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
                : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
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
          :style="{ cursor }"
          v-bind="handlers"
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
                : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
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
                : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
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
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
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
