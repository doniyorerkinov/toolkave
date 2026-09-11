<script setup lang="ts">
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

// Cross-tool cleanup is handled by store.claim() in ToolShell, so results
// survive a language switch on the same tool.
const canRun = computed(() => store.files.length >= 2 && !store.busy)

/** The registry's `maxFiles`; the dropzone only caps a single drop, not the running total. */
const MAX_FILES = 50

function onFiles(files: File[]) {
  store.add(files.slice(0, Math.max(0, MAX_FILES - store.files.length)))
}

async function run() {
  if (!canRun.value) return
  store.busy = true
  store.error = null
  try {
    const sourceSize = store.totalSize
    const data = await mergePdfs(store.files)
    store.setResult({
      name: withSuffix(store.files[0]?.name ?? 'document', '-merged'),
      type: 'application/pdf',
      data,
      sourceSize
    })
  } catch (error) {
    store.error = t(pdfErrorKey(error))
  } finally {
    store.busy = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone accept="application/pdf" multiple :max-files="MAX_FILES" @files="onFiles($event)" />

    <ShellFileList
      :files="store.files"
      @remove="store.remove($event)"
      @move="(from, to) => store.move(from, to)"
    />

    <p v-if="store.files.length === 1" class="text-sm text-stone-500">
      {{ t('pdf.merge.needTwo') }}
    </p>

    <div v-if="store.hasFiles" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.merge.action') }}
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
