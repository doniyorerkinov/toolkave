<script setup lang="ts">
import { EXTENSION, MIME, isSvg, renderSvg, type ImageFormat } from '~/composables/useImage'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * A vector drawn at a size you choose.
 *
 * The point of doing this in a browser rather than with a converter is that
 * the browser is the thing that knows how to draw SVG, so the result matches
 * what the file looks like on a web page rather than a second engine's
 * interpretation of it.
 */
const { t } = useI18n()
const store = useFilesStore()

const MULTIPLIERS = [1, 2, 4] as const

const multiplier = ref<number>(2)
const custom = ref<number | null>(null)
const transparent = ref(true)
const format = ref<ImageFormat>('png')
const natural = ref<{ width: number; height: number } | null>(null)
const previewUrl = ref<string | null>(null)

const file = computed(() => store.files[0] ?? null)
const isVector = computed(() => !!file.value && isSvg(file.value.data))

/** The size to draw at: a multiple of the SVG's own, or an exact width. */
const target = computed(() => {
  if (!natural.value) return null
  if (custom.value && custom.value > 0) {
    const scale = custom.value / natural.value.width
    return { width: Math.round(custom.value), height: Math.round(natural.value.height * scale) }
  }
  return {
    width: Math.round(natural.value.width * multiplier.value),
    height: Math.round(natural.value.height * multiplier.value)
  }
})

const canRun = computed(() => !!file.value && isVector.value && !!target.value && !store.busy)

watch(
  file,
  async current => {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = null
    natural.value = null
    if (!current) return
    if (!isSvg(current.data)) {
      store.error = t('image.svg.notSvg')
      return
    }
    try {
      const bitmap = await renderSvg(current.data)
      natural.value = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      previewUrl.value = URL.createObjectURL(new Blob([current.data as BlobPart], { type: 'image/svg+xml' }))
    } catch {
      store.error = t('image.errorRead')
    }
  },
  { immediate: true }
)

async function run() {
  if (!canRun.value || !file.value || !target.value) return
  store.busy = true
  store.error = null
  try {
    const bitmap = await renderSvg(file.value.data, target.value)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas unavailable')
    if (!transparent.value || format.value === 'jpeg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(bitmap, 0, 0)
    bitmap.close()

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, MIME[format.value], 0.95))
    if (!blob) throw new Error('encode failed')
    store.setResult({
      name: withSuffix(file.value.name, '', EXTENSION[format.value]),
      type: MIME[format.value],
      data: new Uint8Array(await blob.arrayBuffer()),
      sourceSize: file.value.size,
      note: t('image.svg.note', { w: canvas.width, h: canvas.height })
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
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone v-if="!file" accept="image/svg+xml,.svg" :multiple="false" @files="onFiles($event)" />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="natural" class="text-sm text-stone-500">
      {{ t('image.svg.naturalSize', { w: natural.width, h: natural.height }) }} ·
      {{ formatBytes(file!.size) }}
    </p>

    <div v-if="file && natural" class="space-y-4">
      <div class="flex justify-center rounded-xl border border-stone-200 bg-stone-100 p-4">
        <img
          v-if="previewUrl"
          :src="previewUrl"
          :alt="file!.name"
          class="max-h-72 max-w-full rounded-sm"
          :class="transparent ? 'checkerboard' : 'bg-white'"
        />
      </div>

      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('image.svg.sizeLabel') }}</legend>
        <div class="flex flex-wrap items-center gap-2">
          <label
            v-for="option in MULTIPLIERS"
            :key="option"
            class="cursor-pointer rounded-lg border px-3.5 py-2 text-sm"
            :class="
              !custom && multiplier === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
            "
            @click="custom = null"
          >
            <input v-model.number="multiplier" type="radio" :value="option" class="sr-only" />
            <span class="font-medium">{{ option }}×</span>
            <span class="ml-1.5 text-xs tabular-nums opacity-60">
              {{ Math.round(natural.width * option) }}×{{ Math.round(natural.height * option) }}
            </span>
          </label>
          <label class="flex items-center gap-2 text-sm text-stone-700">
            <span>{{ t('image.svg.customWidth') }}</span>
            <input
              v-model.number="custom"
              type="number"
              min="1"
              max="8000"
              class="w-24 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm"
              :placeholder="String(natural.width)"
            />
          </label>
        </div>
        <p v-if="target" class="mt-2 text-sm text-stone-500">
          {{ t('image.svg.willBe', { w: target.width, h: target.height }) }}
        </p>
      </fieldset>

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('image.formatLabel') }}</legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="option in (['png', 'webp', 'jpeg'] as ImageFormat[])"
              :key="option"
              class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
              :class="
                format === option
                  ? 'border-ember-500 bg-ember-50 text-ember-900'
                  : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
              "
            >
              <input v-model="format" type="radio" :value="option" class="sr-only" />
              {{ option.toUpperCase() }}
            </label>
          </div>
        </fieldset>
        <div>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
            <input v-model="transparent" type="checkbox" :disabled="format === 'jpeg'" class="size-4 accent-ember-700" />
            {{ t('image.svg.transparent') }}
          </label>
          <p v-if="format === 'jpeg'" class="mt-1 text-xs text-stone-500">{{ t('image.svg.jpegOpaque') }}</p>
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
        {{ store.busy ? t('image.working') : t('image.svg.action') }}
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

<style scoped>
/* The usual grey chequerboard, so transparency reads as transparency. */
.checkerboard {
  background-image:
    linear-gradient(45deg, #e7e5e4 25%, transparent 25%),
    linear-gradient(-45deg, #e7e5e4 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e7e5e4 75%),
    linear-gradient(-45deg, transparent 75%, #e7e5e4 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-color: #ffffff;
}
</style>
