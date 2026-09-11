<script setup lang="ts">
import { EXTENSION, UNSUPPORTED_OUTPUT, type ImageFormat } from '~/composables/useImage'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const width = ref<number | null>(null)
const height = ref<number | null>(null)
const keepRatio = ref(true)
const dimensions = ref<{ width: number; height: number } | null>(null)

const file = computed(() => store.files[0] ?? null)

watch(
  file,
  async current => {
    dimensions.value = null
    width.value = null
    height.value = null
    if (!current) return
    try {
      const size = await readImageSize(current)
      dimensions.value = size
      width.value = size.width
      height.value = size.height
    } catch {
      store.error = t('image.errorRead')
    }
  },
  { immediate: true }
)

const ratio = computed(() =>
  dimensions.value ? dimensions.value.width / dimensions.value.height : 1
)

function onWidth(value: number) {
  width.value = value || null
  if (keepRatio.value && value) height.value = Math.round(value / ratio.value)
}

function onHeight(value: number) {
  height.value = value || null
  if (keepRatio.value && value) width.value = Math.round(value * ratio.value)
}

/** Keep the source format so a resize does not silently change file type. */
const outputFormat = computed<ImageFormat>(() => {
  const kind = file.value ? sniffImage(file.value.data) : null
  if (kind === 'png') return 'png'
  if (kind === 'webp') return 'webp'
  return 'jpeg'
})

const canRun = computed(
  () => !!file.value && !!dimensions.value && !!width.value && !!height.value && !store.busy
)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const out = await resizeImage(
      file.value,
      { width: width.value!, height: height.value! },
      outputFormat.value
    )
    store.setResult({
      name: withSuffix(file.value.name, `-${out.width}x${out.height}`, EXTENSION[outputFormat.value]),
      type: `image/${outputFormat.value}`,
      data: out.data,
      sourceSize: file.value.size
    })
  } catch (error) {
    store.error =
      error instanceof Error && error.message === UNSUPPORTED_OUTPUT
        ? t('image.errorFormatUnsupported', { format: outputFormat.value.toUpperCase() })
        : t('image.errorGeneric')
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}

const presets = [25, 50, 75]
function applyPreset(percent: number) {
  if (!dimensions.value) return
  width.value = Math.round((dimensions.value.width * percent) / 100)
  height.value = Math.round((dimensions.value.height * percent) / 100)
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
      {{ t('image.original') }}: {{ dimensions.width }} × {{ dimensions.height }} ·
      {{ formatBytes(file!.size) }}
    </p>

    <div v-if="file && dimensions" class="space-y-3">
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="rs-w" class="block text-sm font-medium text-stone-900">
            {{ t('image.resize.width') }}
          </label>
          <input
            id="rs-w"
            :value="width"
            type="number"
            min="1"
            class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
            @input="onWidth(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div>
          <label for="rs-h" class="block text-sm font-medium text-stone-900">
            {{ t('image.resize.height') }}
          </label>
          <input
            id="rs-h"
            :value="height"
            type="number"
            min="1"
            class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
            @input="onHeight(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>

      <label class="flex items-center gap-2 text-sm text-stone-700">
        <input v-model="keepRatio" type="checkbox" class="size-4 accent-ember-700" />
        {{ t('image.resize.keepRatio') }}
      </label>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="preset in presets"
          :key="preset"
          type="button"
          class="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
          @click="applyPreset(preset)"
        >
          {{ preset }}%
        </button>
      </div>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('image.working') : t('image.resize.action') }}
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
