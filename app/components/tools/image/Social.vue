<script setup lang="ts">
import {
  EXTENSION,
  MIME,
  UNSUPPORTED_OUTPUT,
  fitToSize,
  resizeImage,
  type Backdrop,
  type ImageFormat
} from '~/composables/useImage'
import { useCropFrame } from '~/composables/useCropFrame'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * The exact pixel sizes the platforms ask for.
 *
 * Every one of these is a number someone would otherwise have to look up,
 * and each platform re-crops anything that arrives at the wrong shape —
 * usually through the middle of a face.
 */
const { t } = useI18n()
const store = useFilesStore()

interface Preset {
  id: string
  group: string
  width: number
  height: number
}

const PRESETS: Preset[] = [
  { id: 'youtube-thumbnail', group: 'youtube', width: 1280, height: 720 },
  { id: 'youtube-banner', group: 'youtube', width: 2560, height: 1440 },
  { id: 'instagram-square', group: 'instagram', width: 1080, height: 1080 },
  { id: 'instagram-portrait', group: 'instagram', width: 1080, height: 1350 },
  { id: 'instagram-story', group: 'instagram', width: 1080, height: 1920 },
  { id: 'telegram-channel', group: 'telegram', width: 512, height: 512 },
  { id: 'facebook-cover', group: 'facebook', width: 820, height: 312 },
  { id: 'facebook-post', group: 'facebook', width: 1200, height: 630 },
  { id: 'x-header', group: 'x', width: 1500, height: 500 },
  { id: 'x-post', group: 'x', width: 1600, height: 900 },
  { id: 'linkedin-banner', group: 'linkedin', width: 1584, height: 396 },
  { id: 'og-image', group: 'web', width: 1200, height: 630 }
]

const GROUPS = ['youtube', 'instagram', 'telegram', 'facebook', 'x', 'linkedin', 'web'] as const

const presetId = ref('youtube-thumbnail')
const mode = ref<'fill' | 'fit'>('fill')
const backdrop = ref<Backdrop>('blur')
const format = ref<ImageFormat>('jpeg')

const file = computed(() => store.files[0] ?? null)
const preset = computed(() => PRESETS.find(entry => entry.id === presetId.value) ?? PRESETS[0]!)
const ratio = computed(() => (mode.value === 'fill' ? preset.value.width / preset.value.height : null))

const byGroup = computed(() =>
  GROUPS.map(group => ({ group, presets: PRESETS.filter(entry => entry.group === group) }))
)

const { canvas, source, cursor, load, rect, handlers, paint } = useCropFrame({
  ratio,
  draw(context, box) {
    if (mode.value === 'fit') return
    const el = context.canvas
    context.fillStyle = 'rgba(28, 25, 23, 0.55)'
    context.beginPath()
    context.rect(0, 0, el.width, el.height)
    context.rect(box.x, box.y + box.height, box.width, -box.height)
    context.fill('evenodd')

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

/** Enlarging past the source is allowed, but it should not be a surprise. */
const upscaling = computed(
  () =>
    !!source.value &&
    (preset.value.width > source.value.width || preset.value.height > source.value.height)
)

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
watch(mode, paint)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const target = { width: preset.value.width, height: preset.value.height }
    const out =
      mode.value === 'fill'
        ? await resizeImage(file.value, target, format.value, 0.92, rect())
        : await fitToSize(file.value, target, backdrop.value, format.value, 0.92)

    store.setResult({
      name: withSuffix(file.value.name, `-${preset.value.id}`, EXTENSION[format.value]),
      type: MIME[format.value],
      data: out.data,
      sourceSize: file.value.size,
      note: t('image.social.note', {
        name: t(`image.social.preset.${preset.value.id}`),
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
      <div class="space-y-3">
        <p class="text-sm font-medium text-stone-900">{{ t('image.social.sizeLabel') }}</p>
        <div v-for="row in byGroup" :key="row.group" class="flex flex-wrap items-center gap-2">
          <span class="w-20 shrink-0 text-xs tracking-wide text-stone-500 uppercase">
            {{ t(`image.social.group.${row.group}`) }}
          </span>
          <label
            v-for="option in row.presets"
            :key="option.id"
            class="cursor-pointer rounded-lg border px-3 py-1.5 text-sm"
            :class="
              presetId === option.id
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            "
          >
            <input v-model="presetId" type="radio" :value="option.id" class="sr-only" />
            <span class="font-medium">{{ t(`image.social.preset.${option.id}`) }}</span>
            <span class="ml-1.5 text-xs tabular-nums opacity-60">{{ option.width }}×{{ option.height }}</span>
          </label>
        </div>
      </div>

      <div class="flex justify-center rounded-xl border border-stone-200 bg-stone-100 p-3">
        <canvas
          ref="canvas"
          class="max-w-full touch-none rounded-sm bg-white shadow-sm select-none"
          :style="{ cursor: mode === 'fill' ? cursor : 'default' }"
          v-bind="mode === 'fill' ? handlers : {}"
        />
      </div>

      <p v-if="mode === 'fill'" class="text-center text-sm text-stone-500">
        {{ t('image.social.frameHint') }}
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">
            {{ t('image.social.modeLabel') }}
          </legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="option in (['fill', 'fit'] as const)"
              :key="option"
              class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
              :class="
                mode === option
                  ? 'border-ember-500 bg-ember-50 text-ember-900'
                  : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              "
            >
              <input v-model="mode" type="radio" :value="option" class="sr-only" />
              {{ t(`image.social.mode.${option}`) }}
            </label>
          </div>
        </fieldset>

        <fieldset v-if="mode === 'fit'">
          <legend class="mb-2 block text-sm font-medium text-stone-900">
            {{ t('image.social.backdropLabel') }}
          </legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="option in (['blur', 'white', 'black'] as Backdrop[])"
              :key="option"
              class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
              :class="
                backdrop === option
                  ? 'border-ember-500 bg-ember-50 text-ember-900'
                  : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              "
            >
              <input v-model="backdrop" type="radio" :value="option" class="sr-only" />
              {{ t(`image.social.backdrop.${option}`) }}
            </label>
          </div>
        </fieldset>

        <fieldset v-else>
          <legend class="mb-2 block text-sm font-medium text-stone-900">
            {{ t('image.formatLabel') }}
          </legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="option in (['jpeg', 'png', 'webp'] as ImageFormat[])"
              :key="option"
              class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
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

      <p v-if="upscaling" class="text-sm text-amber-800">
        {{ t('image.social.upscaling', { w: preset.width, h: preset.height }) }}
      </p>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('image.working') : t('image.social.action') }}
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
