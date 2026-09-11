<script setup lang="ts">
import type { PageSizePreset } from '~/composables/usePdf'
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const preset = ref<PageSizePreset>('a4')
const scale = ref(100)
const meta = ref<Awaited<ReturnType<typeof readPdfMetadata>> | null>(null)
const infoError = ref(false)

const file = computed(() => store.files[0] ?? null)

watch(
  file,
  async current => {
    meta.value = null
    infoError.value = false
    if (!current) return
    try {
      meta.value = await readPdfMetadata(current)
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

const currentSize = computed(() => {
  const first = meta.value?.pageSizes[0]
  return first ? `${first.label} · ${first.width} × ${first.height} pt` : ''
})

const presets: PageSizePreset[] = ['a4', 'letter', 'legal', 'scale']

const canRun = computed(() => !!file.value && !!meta.value && !store.busy)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await resizePdfPages(file.value, preset.value, scale.value / 100)
    store.setResult({
      name: withSuffix(file.value.name, `-${preset.value === 'scale' ? `${scale.value}pct` : preset.value}`),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size
    })
  } catch (error) {
    store.error = t(pdfErrorKey(error))
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
      accept="application/pdf"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="infoError" class="text-sm text-red-700" role="alert">{{ t('pdf.errorRead') }}</p>

    <template v-else-if="file && meta">
      <p class="text-sm text-stone-500">{{ t('pdf.resize.current') }}: {{ currentSize }}</p>

      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">
          {{ t('pdf.resize.targetLabel') }}
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in presets"
            :key="option"
            class="cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium"
            :class="
              preset === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            "
          >
            <input v-model="preset" type="radio" :value="option" class="sr-only" />
            {{ t(`pdf.resize.presets.${option}`) }}
          </label>
        </div>
      </fieldset>

      <div v-if="preset === 'scale'">
        <label for="rz-scale" class="block text-sm font-medium text-stone-900">
          {{ t('pdf.resize.scale', { n: scale }) }}
        </label>
        <input
          id="rz-scale"
          v-model.number="scale"
          type="range"
          min="25"
          max="200"
          step="5"
          class="mt-2 w-full accent-ember-700"
        />
      </div>
      <p v-else class="text-sm text-stone-500">{{ t('pdf.resize.fitNote') }}</p>
    </template>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.resize.action') }}
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
