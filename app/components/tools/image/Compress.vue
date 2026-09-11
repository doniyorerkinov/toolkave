<script setup lang="ts">
import { EXTENSION, UNSUPPORTED_OUTPUT, type ImageFormat } from '~/composables/useImage'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const quality = ref(75)
const format = ref<ImageFormat>('jpeg')
const dimensions = ref<{ width: number; height: number } | null>(null)

const file = computed(() => store.files[0] ?? null)

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
    const out = await compressImage(file.value, format.value, quality.value / 100)
    store.setResult({
      name: withSuffix(file.value.name, '-compressed', EXTENSION[format.value]),
      type: `image/${format.value}`,
      data: out.data,
      sourceSize: file.value.size
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

    <p v-if="dimensions" class="text-sm text-stone-500">
      {{ t('image.dimensions', { w: dimensions.width, h: dimensions.height }) }} ·
      {{ formatBytes(file!.size) }}
    </p>

    <div v-if="file && dimensions" class="space-y-4">
      <div>
        <label for="img-quality" class="block text-sm font-medium text-stone-900">
          {{ t('image.quality', { n: quality }) }}
        </label>
        <input
          id="img-quality"
          v-model.number="quality"
          type="range"
          min="10"
          max="100"
          class="mt-2 w-full accent-ember-700"
          :disabled="format === 'png'"
        />
        <p v-if="format === 'png'" class="mt-1 text-xs text-stone-500">
          {{ t('image.pngLossless') }}
        </p>
      </div>

      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">
          {{ t('image.formatLabel') }}
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in (['jpeg', 'webp', 'png'] as ImageFormat[])"
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

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('image.working') : t('image.compress.action') }}
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
