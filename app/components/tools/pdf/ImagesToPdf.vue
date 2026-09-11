<script setup lang="ts">
import type { PageFit } from '~/composables/usePdf'
import { useFilesStore } from '~/stores/files'

/**
 * One component, several registry entries.
 *
 * "JPG to PDF" and "PNG to PDF" are the same function but different search
 * queries, so each gets its own page and its own content. The registry entry
 * supplies `accept` through `config`; nothing here is per-format except which
 * files the dropzone will take.
 */
const props = withDefaults(defineProps<{ accept?: string }>(), {
  accept: 'image/jpeg,image/png'
})

const { t } = useI18n()
const store = useFilesStore()

const fit = ref<PageFit>('a4')

const canRun = computed(() => store.hasFiles && !store.busy)

/** The registry's `maxFiles`; the dropzone only caps a single drop, not the running total. */
const MAX_FILES = 100

function onFiles(files: File[]) {
  store.add(files.slice(0, Math.max(0, MAX_FILES - store.files.length)))
}

async function run() {
  if (!canRun.value) return
  store.busy = true
  store.error = null
  try {
    const sourceSize = store.totalSize
    // pdf-lib embeds only JPEG and PNG, so WebP and HEIC are re-encoded first.
    // Files already in a supported format pass through untouched.
    const ready = await normaliseForPdf(store.files)
    const data = await imagesToPdf(ready, fit.value)
    store.setResult({
      name: 'toolkave.pdf',
      type: 'application/pdf',
      data,
      sourceSize
    })
  } catch {
    store.error = t('pdf.imagesToPdf.errorUnsupported')
  } finally {
    store.busy = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone :accept="accept" multiple :max-files="MAX_FILES" @files="onFiles($event)" />

    <ShellFileList
      :files="store.files"
      @remove="store.remove($event)"
      @move="(from, to) => store.move(from, to)"
    />

    <fieldset v-if="store.hasFiles">
      <legend class="mb-2 block text-sm font-medium text-slate-900">
        {{ t('pdf.imagesToPdf.fitLabel') }}
      </legend>
      <div class="flex flex-wrap gap-2">
        <label
          v-for="option in (['a4', 'image'] as PageFit[])"
          :key="option"
          class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
          :class="
            fit === option
              ? 'border-sky-500 bg-sky-50 text-sky-900'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          "
        >
          <input v-model="fit" type="radio" :value="option" class="sr-only" />
          {{ t(`pdf.imagesToPdf.fit.${option}`) }}
        </label>
      </div>
    </fieldset>

    <div v-if="store.hasFiles" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.imagesToPdf.action') }}
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
