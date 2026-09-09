<script setup lang="ts">
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

// Each tool page starts clean; chaining explicitly repopulates the store.
onBeforeUnmount(() => store.setResult(null))

const canRun = computed(() => store.files.length >= 2 && !store.busy)

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
  } catch {
    store.error = t('pdf.errorGeneric')
  } finally {
    store.busy = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone accept="application/pdf" multiple @files="store.add($event)" />

    <ShellFileList
      :files="store.files"
      @remove="store.remove($event)"
      @move="(from, to) => store.move(from, to)"
    />

    <p v-if="store.files.length === 1" class="text-sm text-slate-500">
      {{ t('pdf.merge.needTwo') }}
    </p>

    <div v-if="store.hasFiles" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.merge.action') }}
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
