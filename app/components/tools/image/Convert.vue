<script setup lang="ts">
import { EXTENSION, UNSUPPORTED_OUTPUT, type ImageFormat } from '~/composables/useImage'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * One component, one page per conversion pair.
 *
 * "PNG to JPG" and "WebP to JPG" are the same canvas operation but different
 * search queries, so the registry supplies `accept` and `to` through `config`
 * and each gets its own page.
 */
const props = withDefaults(
  defineProps<{
    accept?: string
    to?: ImageFormat
  }>(),
  {
    accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif',
    to: 'jpeg'
  }
)

const { t } = useI18n()
const store = useFilesStore()

const quality = ref(92)
const dimensions = ref<{ width: number; height: number } | null>(null)

const file = computed(() => store.files[0] ?? null)
const lossy = computed(() => props.to !== 'png')

watch(
  file,
  async current => {
    dimensions.value = null
    if (!current) return
    try {
      dimensions.value = await readImageSize(current)
    } catch {
      store.error = t('image.errorRead')
    }
  },
  { immediate: true }
)

const canRun = computed(() => !!file.value && !!dimensions.value && !store.busy)

/**
 * PNG stores every pixel exactly, so a photograph that JPEG squeezed into
 * 4 MB comes back as 20-something. That is the format working correctly, but
 * arriving at a five-times-larger download with no warning reads as a
 * failure — so say it before the button is pressed, and again afterwards if
 * the file really did grow.
 */
const photoToPng = computed(() => !lossy.value && props.accept.includes('jpeg'))

/**
 * PNG output only: exact keeps every colour, smaller reduces to a palette.
 * A photograph typically goes from twenty-odd megabytes to four.
 */
const pngSize = ref<'exact' | 'smaller'>('exact')
const PALETTE = 256

const grew = computed(() => {
  const result = store.result
  if (!result) return false
  return result.data.byteLength > result.sourceSize * 1.2
})

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const out = await convertImage(
      file.value,
      props.to,
      quality.value / 100,
      !lossy.value && pngSize.value === 'smaller' ? PALETTE : undefined
    )
    store.setResult({
      name: withSuffix(file.value.name, '', EXTENSION[props.to]),
      type: `image/${props.to}`,
      data: out.data,
      sourceSize: file.value.size
    })
  } catch (error) {
    store.error =
      error instanceof Error && error.message === UNSUPPORTED_OUTPUT
        ? t('image.errorFormatUnsupported', { format: props.to.toUpperCase() })
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
      :accept="accept"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="dimensions" class="text-sm text-stone-500">
      {{ t('image.dimensions', { w: dimensions.width, h: dimensions.height }) }} ·
      {{ formatBytes(file!.size) }}
    </p>

    <fieldset v-if="file && !lossy">
      <legend class="mb-2 block text-sm font-medium text-stone-900">
        {{ t('image.convert.pngSizeLabel') }}
      </legend>
      <div class="flex flex-wrap gap-2">
        <label
          v-for="option in (['exact', 'smaller'] as const)"
          :key="option"
          class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
          :class="pngSize === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'"
        >
          <input v-model="pngSize" type="radio" :value="option" class="sr-only" />
          {{ t(`image.convert.pngSize.${option}`) }}
        </label>
      </div>
      <p class="mt-2 text-xs text-stone-500">{{ t(`image.convert.pngSizeHint.${pngSize}`) }}</p>
    </fieldset>

    <p v-if="photoToPng && pngSize === 'exact'" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      {{ t('image.convert.pngGrows') }}
    </p>

    <div v-if="file && dimensions && lossy">
      <label for="cv-quality" class="block text-sm font-medium text-stone-900">
        {{ t('image.quality', { n: quality }) }}
      </label>
      <input
        id="cv-quality"
        v-model.number="quality"
        type="range"
        min="10"
        max="100"
        class="mt-2 w-full accent-ember-700"
      />
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('image.working') : t('image.convert.action', { format: to.toUpperCase() }) }}
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

    <p v-if="grew" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      {{ lossy ? t('image.convert.lossyGrewNote') : t('image.convert.pngGrewNote') }}
    </p>

    <ShellResultCard
      v-if="store.result"
      :result="store.result"
      @reset="store.reset()"
      @chain="store.chainResult()"
    />
  </div>
</template>
