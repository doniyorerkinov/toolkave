<script setup lang="ts">
import { usePdfWorker } from '~/composables/usePdfWorker'
import { zipFiles } from '~/composables/useZip'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()
const { rasterizePages } = usePdfWorker()

const pageCount = ref(0)
const selected = ref<number[]>([])
const infoError = ref(false)

const maxDimension = ref(1600)
const quality = ref(0.85)

const progress = ref(0)
const total = ref(0)

const file = computed(() => store.files[0] ?? null)

watch(
  file,
  async current => {
    pageCount.value = 0
    selected.value = []
    infoError.value = false
    if (!current) return
    try {
      pageCount.value = (await readPdfInfo(current)).pageCount
      // Everything selected by default: exporting the whole document is the
      // common case, and the picker makes it obvious what will happen.
      selected.value = Array.from({ length: pageCount.value }, (_unused, i) => i)
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

const canRun = computed(() => !!file.value && selected.value.length > 0 && !store.busy)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  progress.value = 0
  total.value = selected.value.length

  const baseName = file.value.name.replace(/\.pdf$/i, '') || 'page'
  const pagesOneIndexed = [...selected.value].sort((a, b) => a - b).map(i => i + 1)
  // Zero-padded so a 100-page export still sorts correctly in a file manager.
  const pad = String(pageCount.value).length

  try {
    const pages: { name: string; data: Uint8Array }[] = []
    await rasterizePages(
      file.value.data,
      pagesOneIndexed,
      maxDimension.value,
      quality.value,
      page => pages.push({ name: `${baseName}-${String(page.page).padStart(pad, '0')}.jpg`, data: page.data }),
      { onProgress: done => (progress.value = done) }
    )

    if (pages.length === 1) {
      store.setResult({
        name: pages[0]!.name,
        type: 'image/jpeg',
        data: pages[0]!.data,
        sourceSize: file.value.size
      })
    } else {
      const zipped = await zipFiles(pages)
      store.setResult({
        name: `${baseName}-jpg.zip`,
        type: 'application/zip',
        data: zipped,
        sourceSize: file.value.size
      })
    }
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
    <ShellFileDropzone v-if="!file" accept="application/pdf" :multiple="false" @files="onFiles($event)" />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="infoError" class="text-sm text-red-700" role="alert">{{ t('pdf.errorRead') }}</p>

    <div v-else-if="file && pageCount" class="space-y-4">
      <ShellPagePicker
        v-model="selected"
        :file="file"
        :page-count="pageCount"
        :range-label="t('pdf.toJpg.pagesLabel', { count: pageCount })"
        range-placeholder="1-3, 5, 8-10"
      />

      <div class="flex flex-wrap items-center gap-4 rounded-lg border border-stone-200 p-3">
        <label class="flex items-center gap-2 text-sm text-stone-700">
          {{ t('pdf.toJpg.size') }}
          <select v-model.number="maxDimension" class="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
            <option :value="800">{{ t('pdf.toJpg.sizeSmall') }}</option>
            <option :value="1600">{{ t('pdf.toJpg.sizeMedium') }}</option>
            <option :value="2500">{{ t('pdf.toJpg.sizeLarge') }}</option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-sm text-stone-700">
          {{ t('pdf.toJpg.quality') }}
          <input v-model.number="quality" type="range" min="0.5" max="0.95" step="0.05" class="w-28" />
          <span class="tabular-nums text-stone-500">{{ Math.round(quality * 100) }}%</span>
        </label>
      </div>

      <p v-if="selected.length > 1" class="text-xs text-stone-500">{{ t('pdf.toJpg.zipNote') }}</p>
    </div>

    <div v-if="store.busy && total" class="space-y-1">
      <div class="h-2 w-full overflow-hidden rounded-full bg-stone-200">
        <div class="h-full rounded-full bg-ember-600 transition-all" :style="{ width: `${(progress / total) * 100}%` }" />
      </div>
      <p class="text-xs text-stone-500">{{ t('pdf.toJpg.progress', { done: progress, total }) }}</p>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.toJpg.action', { n: selected.length }) }}
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
      :chainable="store.result.type !== 'application/zip'"
      @reset="store.reset()"
      @chain="store.chainResult()"
    />
  </div>
</template>
