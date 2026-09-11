<script setup lang="ts">
import { parsePageRanges, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const pageCount = ref(0)
const ranges = ref('')
const infoError = ref(false)

// Split works on one file; keep only the first and read its page count.
const file = computed(() => store.files[0] ?? null)

watch(
  file,
  async current => {
    pageCount.value = 0
    infoError.value = false
    if (!current) return
    try {
      const info = await readPdfInfo(current)
      pageCount.value = info.pageCount
      if (!ranges.value) ranges.value = '1'
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

const selected = computed(() =>
  pageCount.value ? parsePageRanges(ranges.value, pageCount.value) : []
)

const canRun = computed(() => !!file.value && selected.value.length > 0 && !store.busy)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await extractPages(file.value, selected.value)
    store.setResult({
      name: withSuffix(file.value.name, '-pages'),
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
  ranges.value = ''
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

    <ShellFileList
      v-else
      :files="store.files"
      :reorderable="false"
      @remove="store.remove($event)"
    />

    <p v-if="infoError" class="text-sm text-red-700" role="alert">{{ t('pdf.errorRead') }}</p>

    <div v-else-if="file && pageCount" class="space-y-2">
      <label for="split-ranges" class="block text-sm font-medium text-stone-900">
        {{ t('pdf.split.rangesLabel', { count: pageCount }) }}
      </label>
      <input
        id="split-ranges"
        v-model="ranges"
        type="text"
        inputmode="numeric"
        :placeholder="t('pdf.split.rangesPlaceholder')"
        class="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
      />
      <p class="text-sm text-stone-500">
        {{
          selected.length
            ? t('pdf.split.selected', { n: selected.length })
            : t('pdf.split.noneSelected')
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
        {{ store.busy ? t('pdf.working') : t('pdf.split.action') }}
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
