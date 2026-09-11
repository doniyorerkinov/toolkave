<script setup lang="ts">
import { enhanceScan, MIME, type ScanMode } from '~/composables/useImage'
import type { HeldFile } from '~/stores/files'
import { useFilesStore } from '~/stores/files'

/**
 * Phone photographs of paper into a single PDF.
 *
 * The web counterpart of the bot: the same job people currently do by emailing
 * themselves photos. What makes it worth using over "JPG to PDF" is the
 * clean-up pass — a raw photo of a page is grey and unevenly lit, and an
 * auto-levels stretch is what turns it into something that looks scanned.
 */

const { t } = useI18n()
const store = useFilesStore()

const mode = ref<ScanMode>('enhance')
const progress = ref(0)

const canRun = computed(() => store.files.length > 0 && !store.busy)

async function run() {
  if (!canRun.value) return
  store.busy = true
  store.error = null
  progress.value = 0

  try {
    const prepared: HeldFile[] = []
    for (const [index, file] of store.files.entries()) {
      const cleaned = await enhanceScan(file, mode.value)
      prepared.push({ ...file, data: cleaned.data, type: MIME.jpeg })
      progress.value = Math.round(((index + 1) / store.files.length) * 100)
    }

    const data = await imagesToPdf(prepared, 'a4')
    store.setResult({
      name: 'scan.pdf',
      type: 'application/pdf',
      data,
      sourceSize: store.totalSize
    })
  } catch (error) {
    store.error = t(pdfErrorKey(error))
  } finally {
    store.busy = false
  }
}

/** The registry's `maxFiles`; the dropzone only caps a single drop, not the running total. */
const MAX_FILES = 50

function onFiles(files: File[]) {
  store.add(files.slice(0, Math.max(0, MAX_FILES - store.files.length)))
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
      :multiple="true"
      :max-files="50"
      @files="onFiles($event)"
    />

    <!-- Reorderable: page order is the whole point when photographing a document. -->
    <ShellFileList
      v-if="store.files.length"
      :files="store.files"
      :reorderable="true"
      @remove="store.remove($event)"
      @move="(from, to) => store.move(from, to)"
    />

    <fieldset v-if="store.files.length">
      <legend class="mb-2 text-sm font-medium text-stone-700">{{ t('scan.mode') }}</legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in (['enhance', 'grayscale', 'colour'] as ScanMode[])"
          :key="option"
          type="button"
          :aria-pressed="mode === option"
          class="rounded-lg border px-3 py-1.5 text-sm font-medium transition"
          :class="
            mode === option
              ? 'border-ember-600 bg-ember-50 text-ember-900'
              : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
          "
          @click="mode = option"
        >
          {{ t(`scan.modes.${option}`) }}
        </button>
      </div>
      <p class="mt-2 text-xs text-stone-500">{{ t(`scan.modeHint.${mode}`) }}</p>
    </fieldset>

    <div v-if="store.busy && progress" class="space-y-1">
      <div class="h-2 w-full overflow-hidden rounded-full bg-stone-200">
        <div class="h-full rounded-full bg-ember-600 transition-all" :style="{ width: `${progress}%` }" />
      </div>
      <p class="text-xs text-stone-500">{{ t('scan.progress', { percent: progress }) }}</p>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <div v-if="store.files.length" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('scan.action', { n: store.files.length }) }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
        @click="store.reset()"
      >
        {{ t('result.startOver') }}
      </button>
    </div>

    <ShellResultCard
      v-if="store.result"
      :result="store.result"
      @reset="store.reset()"
      @chain="store.chainResult()"
    />
  </div>
</template>
