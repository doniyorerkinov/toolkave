<script setup lang="ts">
import type { Grid } from '~/utils/table'
import { readCsv, readWorkbook } from '~/composables/useSheet'
import { gridToPdf, WIDE_TABLE_COLUMNS, type Orientation, type PageSize } from '~/composables/useDocPdf'
import { encodingName } from '~/utils/encoding'
import { useFilesStore } from '~/stores/files'

/** One component, two pages: CSV to PDF and Excel to PDF. */
const props = defineProps<{ from: 'csv' | 'xlsx' }>()

const { t } = useI18n()
const store = useFilesStore()

const grid = ref<Grid>([])
const sheetNames = ref<string[]>([])
const sheets = ref<Record<string, Grid>>({})
const activeSheet = ref('')
const sourceEncoding = ref<string | null>(null)

const pageSize = ref<PageSize>('A4')
const orientation = ref<Orientation>('portrait')
const header = ref(true)
const zebra = ref(true)
const fontSize = ref(9)

const file = computed(() => store.files[0] ?? null)
const columns = computed(() => grid.value[0]?.length ?? 0)
const canRun = computed(() => grid.value.length > 0 && !store.busy)

/**
 * A wide table in portrait is unreadable at any font size, and it is the most
 * common thing to get wrong here, so the suggestion appears before the user
 * generates a PDF rather than after.
 */
const suggestLandscape = computed(
  () => columns.value > WIDE_TABLE_COLUMNS && orientation.value === 'portrait'
)

watch(activeSheet, name => {
  if (name && sheets.value[name]) grid.value = sheets.value[name]
})

watch(
  file,
  async current => {
    grid.value = []
    sheetNames.value = []
    sheets.value = {}
    activeSheet.value = ''
    sourceEncoding.value = null
    store.error = null
    if (!current) return

    store.busy = true
    try {
      if (props.from === 'csv') {
        const result = await readCsv(current.data)
        grid.value = result.grid
        sourceEncoding.value = encodingName(result.encoding)
      } else {
        const result = await readWorkbook(current.data)
        sheets.value = result.grids
        sheetNames.value = result.sheets.map(sheet => sheet.name)
        activeSheet.value = sheetNames.value[0] ?? ''
      }
    } catch {
      store.error = t('table.errorRead')
    } finally {
      store.busy = false
    }
  },
  { immediate: true }
)

async function run() {
  if (!canRun.value) return
  store.busy = true
  store.error = null

  try {
    const data = await gridToPdf(grid.value, {
      pageSize: pageSize.value,
      orientation: orientation.value,
      header: header.value,
      zebra: zebra.value,
      fontSize: fontSize.value,
      title: file.value?.name
    })

    store.setResult({
      name: (file.value?.name ?? 'table').replace(/\.[^.]+$/, '') + '.pdf',
      type: 'application/pdf',
      data,
      sourceSize: file.value?.size ?? 0
    })
  } catch {
    store.error = t('table.errorWrite')
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}

const ACCEPT = {
  csv: 'text/csv,text/plain,.csv,.tsv,.txt',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls'
} as const
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone v-if="!file" :accept="ACCEPT[from]" :multiple="false" @files="onFiles($event)" />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="sourceEncoding" class="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
      {{ t('table.detectedEncoding', { encoding: sourceEncoding }) }}
    </p>

    <div v-if="sheetNames.length > 1">
      <label for="ttp-sheet" class="mb-1 block text-sm font-medium text-slate-700">{{ t('table.sheet') }}</label>
      <select
        id="ttp-sheet"
        v-model="activeSheet"
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option v-for="name in sheetNames" :key="name" :value="name">{{ name }}</option>
      </select>
    </div>

    <div v-if="grid.length" class="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 p-3">
      <label class="flex items-center gap-2 text-sm text-slate-700">
        {{ t('docs.pageSize') }}
        <select v-model="pageSize" class="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <option value="A4">A4</option>
          <option value="LETTER">Letter</option>
          <option value="A3">A3</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-700">
        {{ t('docs.orientation') }}
        <select v-model="orientation" class="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <option value="portrait">{{ t('docs.portrait') }}</option>
          <option value="landscape">{{ t('docs.landscape') }}</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-700">
        {{ t('table.fontSize') }}
        <input
          v-model.number="fontSize"
          type="number"
          min="6"
          max="16"
          class="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input v-model="header" type="checkbox" class="rounded border-slate-300" />
        {{ t('table.repeatHeader') }}
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-700">
        <input v-model="zebra" type="checkbox" class="rounded border-slate-300" />
        {{ t('table.zebra') }}
      </label>
    </div>

    <p
      v-if="suggestLandscape"
      class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      {{ t('table.wideHint', { columns }) }}
      <button type="button" class="font-medium underline" @click="orientation = 'landscape'">
        {{ t('table.useLandscape') }}
      </button>
    </p>

    <div v-if="grid.length" class="space-y-2">
      <p class="text-sm font-medium text-slate-700">
        {{ t('table.preview', { rows: Math.max(0, grid.length - (header ? 1 : 0)), columns }) }}
      </p>
      <div class="overflow-x-auto rounded-lg border border-slate-200">
        <table class="w-full text-left text-xs">
          <tbody>
            <tr
              v-for="(row, rowIndex) in grid.slice(0, 11)"
              :key="rowIndex"
              :class="header && rowIndex === 0 ? 'bg-slate-100 font-semibold' : rowIndex % 2 ? 'bg-slate-50' : ''"
            >
              <td
                v-for="(cell, cellIndex) in row"
                :key="cellIndex"
                class="max-w-[16rem] truncate border-b border-slate-100 px-2 py-1"
              >
                {{ cell }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('table.working') : t('table.action.pdf') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
