<script setup lang="ts">
import { docxToHtml, isDocx, isLegacyDoc } from '~~/shared/docx'
import { htmlToPdf, type Orientation, type PageSize } from '~~/shared/doc-pdf'
import { useFilesStore } from '~/stores/files'

/**
 * Word to PDF, entirely in the browser.
 *
 * This re-lays the document out rather than reproducing Word's own layout —
 * headings, paragraphs, emphasis, lists, tables and images are carried across,
 * but page breaks land where the new layout puts them. Anything depending on
 * Word's exact pagination (headers, footers, footnotes, columns) does not
 * survive, and the FAQ says so plainly.
 */

const { t } = useI18n()
const store = useFilesStore()

const pageSize = ref<PageSize>('A4')
const orientation = ref<Orientation>('portrait')
const notes = ref<string[]>([])

const file = computed(() => store.files[0] ?? null)
const legacy = computed(() => !!file.value && isLegacyDoc(file.value.data))
const unreadable = computed(() => !!file.value && !legacy.value && !isDocx(file.value.data))
const canRun = computed(() => !!file.value && !legacy.value && !unreadable.value && !store.busy)

watch(file, () => {
  notes.value = []
})

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  notes.value = []

  try {
    const { html, messages } = await docxToHtml(file.value.data)
    notes.value = [...new Set(messages)].slice(0, 5)

    const data = await htmlToPdf(html, {
      pageSize: pageSize.value,
      orientation: orientation.value,
      title: file.value.name.replace(/\.docx?$/i, '')
    })

    store.setResult({
      name: file.value.name.replace(/\.docx?$/i, '') + '.pdf',
      type: 'application/pdf',
      data,
      sourceSize: file.value.size
    })
  } catch (thrown) {
    store.error =
      thrown instanceof Error && thrown.message === 'EMPTY_DOCUMENT'
        ? t('docs.empty')
        : t('docs.errorConvert')
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
      accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="legacy" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {{ t('docs.legacyDoc') }}
    </p>
    <p
      v-else-if="unreadable"
      class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      {{ t('docs.notDocx') }}
    </p>

    <div v-if="file && !legacy && !unreadable" class="flex flex-wrap gap-4">
      <label class="flex items-center gap-2 text-sm text-stone-700">
        {{ t('docs.pageSize') }}
        <select v-model="pageSize" class="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
          <option value="A4">A4</option>
          <option value="LETTER">Letter</option>
          <option value="A3">A3</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm text-stone-700">
        {{ t('docs.orientation') }}
        <select v-model="orientation" class="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm">
          <option value="portrait">{{ t('docs.portrait') }}</option>
          <option value="landscape">{{ t('docs.landscape') }}</option>
        </select>
      </label>
    </div>

    <p class="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
      {{ t('docs.layoutNotice') }}
    </p>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('docs.working') : t('docs.action.pdf') }}
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

    <ul v-if="notes.length" class="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
      <li v-for="note in notes" :key="note">{{ note }}</li>
    </ul>

    <ShellResultCard
      v-if="store.result"
      :result="store.result"
      @reset="store.reset()"
      @chain="store.chainResult()"
    />
  </div>
</template>
