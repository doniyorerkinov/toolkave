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

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const out = await convertImage(file.value, props.to, quality.value / 100)
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

    <p v-if="dimensions" class="text-sm text-slate-500">
      {{ t('image.dimensions', { w: dimensions.width, h: dimensions.height }) }} ·
      {{ formatBytes(file!.size) }}
    </p>

    <div v-if="file && dimensions && lossy">
      <label for="cv-quality" class="block text-sm font-medium text-slate-900">
        {{ t('image.quality', { n: quality }) }}
      </label>
      <input
        id="cv-quality"
        v-model.number="quality"
        type="range"
        min="10"
        max="100"
        class="mt-2 w-full accent-sky-700"
      />
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('image.working') : t('image.convert.action', { format: to.toUpperCase() }) }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
