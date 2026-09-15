<script setup lang="ts">
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const selected = ref<number[]>([])
const pageCount = ref(0)
const infoError = ref(false)

const file = computed(() => store.files[0] ?? null)

watch(
  file,
  async current => {
    pageCount.value = 0
    infoError.value = false
    if (!current) return
    try {
      pageCount.value = (await readPdfInfo(current)).pageCount
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

const remaining = computed(() => pageCount.value - selected.value.length)

/** Removing every page would produce a zero-page PDF, which is not a valid document. */
const wouldEmpty = computed(() => pageCount.value > 0 && remaining.value === 0)

const canRun = computed(
  () => !!file.value && selected.value.length > 0 && !wouldEmpty.value && !store.busy
)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await removePdfPages(file.value, selected.value)
    store.setResult({
      name: withSuffix(file.value.name, '-pages-removed'),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size
    })
  } catch (e) {
    store.error = e instanceof Error && e.message === EMPTY_RESULT
      ? t('pdf.removePages.wouldEmpty')
      : t(pdfErrorKey(e))
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  selected.value = []
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

    <div v-else-if="file && pageCount" class="space-y-1">
      <ShellPagePicker
        v-model="selected"
        :file="file"
        :page-count="pageCount"
        :range-label="t('pdf.removePages.rangesLabel', { count: pageCount })"
        :range-placeholder="t('pdf.removePages.rangesPlaceholder')"
      />
      <p v-if="wouldEmpty" class="text-sm text-red-700">
        {{ t('pdf.removePages.wouldEmpty') }}
      </p>
      <p v-else class="text-sm text-stone-500">
        {{
          selected.length
            ? t('pdf.removePages.summary', { removed: selected.length, left: remaining })
            : t('pdf.removePages.noneSelected')
        }}
      </p>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.removePages.action') }}
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

    <ShellResultCard
      v-if="store.result"
      :result="store.result"
      @reset="store.reset()"
      @chain="store.chainResult()"
    />
  </div>
</template>
