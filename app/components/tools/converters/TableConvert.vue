<script setup lang="ts">
import { gridToCsv, type Grid } from '~/utils/table'
import { gridToJsonText, jsonTextToGrid, readCsv, readWorkbook, writeWorkbook } from '~/composables/useSheet'
import { encodingName } from '~/utils/encoding'
import { useFilesStore } from '~/stores/files'

/**
 * CSV, JSON and Excel in every direction, from one component.
 *
 * Each pair is a separate search query and so gets its own page, but they are
 * all the same operation: read the input into a grid of strings, write the
 * grid back out in the other format.
 */
type Format = 'csv' | 'json' | 'xlsx'
const props = defineProps<{ from: Format; to: Format }>()

const { t } = useI18n()
const store = useFilesStore()

const jsonInput = ref('')
const grid = ref<Grid>([])
const sheetNames = ref<string[]>([])
const sheets = ref<Record<string, Grid>>({})
const activeSheet = ref('')
const sourceEncoding = ref<string | null>(null)
const delimiter = ref<string | null>(null)
const warnings = ref<string[]>([])
const error = ref<string | null>(null)

/* Options */
const hasHeader = ref(true)
const typedValues = ref(true)
const outputDelimiter = ref(',')
const excelBom = ref(true)

const ACCEPT: Record<Format, string> = {
  csv: 'text/csv,text/plain,.csv,.tsv,.txt',
  json: 'application/json,.json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls'
}

const file = computed(() => store.files[0] ?? null)
/** JSON is typed in; the other two are dropped as a file. */
const fileInput = computed(() => props.from !== 'json')

const preview = computed(() => grid.value.slice(0, 21))
const rowCount = computed(() => Math.max(0, grid.value.length - (hasHeader.value ? 1 : 0)))

const jsonOutput = computed(() =>
  props.to === 'json' && grid.value.length
    ? gridToJsonText(grid.value, { header: hasHeader.value, typed: typedValues.value })
    : ''
)

watch(activeSheet, name => {
  if (name && sheets.value[name]) grid.value = sheets.value[name]
})

watch(jsonInput, value => {
  if (props.from !== 'json') return
  error.value = null
  if (!value.trim()) {
    grid.value = []
    return
  }
  try {
    const parsed = jsonTextToGrid(value)
    grid.value = parsed.grid
    // A shape that is not an array of objects still converts, but the columns
    // will not be what the user expects, so say so rather than guessing.
    warnings.value = parsed.tabular ? [] : [t('table.notTabular')]
  } catch (thrown) {
    grid.value = []
    error.value = t('table.invalidJson', { message: (thrown as Error).message })
  }
})

watch(
  file,
  async current => {
    grid.value = []
    sheetNames.value = []
    sheets.value = {}
    activeSheet.value = ''
    sourceEncoding.value = null
    delimiter.value = null
    warnings.value = []
    error.value = null
    if (!current) return

    store.busy = true
    try {
      if (props.from === 'csv') {
        const result = await readCsv(current.data)
        grid.value = result.grid
        sourceEncoding.value = encodingName(result.encoding)
        delimiter.value = result.delimiter === '\t' ? 'Tab' : result.delimiter
        warnings.value = result.warnings
      } else if (props.from === 'xlsx') {
        const result = await readWorkbook(current.data)
        if (!result.sheets.length) throw new Error('EMPTY')
        sheets.value = result.grids
        sheetNames.value = result.sheets.map(sheet => sheet.name)
        activeSheet.value = sheetNames.value[0] ?? ''
      } else {
        const text = new TextDecoder().decode(current.data)
        jsonInput.value = text
      }
    } catch {
      error.value = t('table.errorRead')
    } finally {
      store.busy = false
    }
  },
  { immediate: true }
)

function baseName(): string {
  const name = file.value?.name ?? 'data'
  return name.replace(/\.[^.]+$/, '')
}

async function save() {
  if (!grid.value.length) return
  store.busy = true
  error.value = null

  try {
    if (props.to === 'json') {
      store.setResult({
        name: `${baseName()}.json`,
        type: 'application/json;charset=utf-8',
        data: new TextEncoder().encode(jsonOutput.value),
        sourceSize: file.value?.size ?? 0
      })
    } else if (props.to === 'csv') {
      const text = gridToCsv(grid.value, outputDelimiter.value, excelBom.value)
      store.setResult({
        name: `${baseName()}.csv`,
        type: 'text/csv;charset=utf-8',
        data: new TextEncoder().encode(text),
        sourceSize: file.value?.size ?? 0
      })
    } else {
      const data = await writeWorkbook({ [activeSheet.value || 'Sheet1']: grid.value })
      store.setResult({
        name: `${baseName()}.xlsx`,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        data,
        sourceSize: file.value?.size ?? 0
      })
    }
  } catch {
    error.value = t('table.errorWrite')
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}

function reset() {
  store.reset()
  jsonInput.value = ''
  grid.value = []
}
</script>

<template>
  <div class="space-y-4">
    <!-- Input -->
    <template v-if="fileInput">
      <ShellFileDropzone v-if="!file" :accept="ACCEPT[from]" :multiple="false" @files="onFiles($event)" />
      <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />
    </template>

    <div v-else>
      <label for="tbl-json" class="mb-1 block text-sm font-medium text-stone-700">
        {{ t('table.jsonInput') }}
      </label>
      <textarea
        id="tbl-json"
        v-model="jsonInput"
        rows="10"
        spellcheck="false"
        placeholder='[{"name": "Иван", "age": 30}]'
        class="w-full resize-y rounded-lg border border-stone-300 bg-white p-3 font-mono text-sm text-stone-900 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
      />
    </div>

    <p
      v-if="sourceEncoding || delimiter"
      class="rounded-lg border border-ember-200 bg-ember-50 px-3 py-2 text-sm text-ember-900"
    >
      {{ t('table.detected', { encoding: sourceEncoding, delimiter }) }}
    </p>

    <div v-if="sheetNames.length > 1">
      <label for="tbl-sheet" class="mb-1 block text-sm font-medium text-stone-700">
        {{ t('table.sheet') }}
      </label>
      <select
        id="tbl-sheet"
        v-model="activeSheet"
        class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
      >
        <option v-for="name in sheetNames" :key="name" :value="name">{{ name }}</option>
      </select>
    </div>

    <!-- Options -->
    <div v-if="grid.length" class="flex flex-wrap items-center gap-4 rounded-lg border border-stone-200 p-3">
      <label class="flex items-center gap-2 text-sm text-stone-700">
        <input v-model="hasHeader" type="checkbox" class="rounded border-stone-300" />
        {{ t('table.hasHeader') }}
      </label>

      <label v-if="to === 'json'" class="flex items-center gap-2 text-sm text-stone-700">
        <input v-model="typedValues" type="checkbox" class="rounded border-stone-300" />
        {{ t('table.typedValues') }}
      </label>

      <template v-if="to === 'csv'">
        <label class="flex items-center gap-2 text-sm text-stone-700">
          {{ t('table.delimiter') }}
          <select v-model="outputDelimiter" class="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm">
            <option value=",">,</option>
            <option value=";">;</option>
            <option value="&#9;">Tab</option>
            <option value="|">|</option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-sm text-stone-700">
          <input v-model="excelBom" type="checkbox" class="rounded border-stone-300" />
          {{ t('table.excelBom') }}
        </label>
      </template>
    </div>

    <ul v-if="warnings.length" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
    </ul>

    <p v-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>

    <!-- Preview -->
    <div v-if="preview.length" class="space-y-2">
      <p class="text-sm font-medium text-stone-700">
        {{ t('table.preview', { rows: rowCount, columns: grid[0]?.length ?? 0 }) }}
      </p>
      <div class="overflow-x-auto rounded-lg border border-stone-200">
        <table class="w-full text-left text-xs">
          <tbody>
            <tr
              v-for="(row, rowIndex) in preview"
              :key="rowIndex"
              :class="hasHeader && rowIndex === 0 ? 'bg-stone-100 font-semibold' : rowIndex % 2 ? 'bg-stone-50' : ''"
            >
              <td
                v-for="(cell, cellIndex) in row"
                :key="cellIndex"
                class="max-w-[16rem] truncate border-b border-stone-100 px-2 py-1"
              >
                {{ cell }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="grid.length > 21" class="text-xs text-stone-500">
        {{ t('table.previewTruncated', { total: grid.length }) }}
      </p>
    </div>

    <div v-if="to === 'json' && jsonOutput" class="space-y-2">
      <label for="tbl-out" class="block text-sm font-medium text-stone-700">{{ t('table.jsonOutput') }}</label>
      <textarea
        id="tbl-out"
        :value="jsonOutput"
        rows="10"
        readonly
        spellcheck="false"
        class="w-full resize-y rounded-lg border border-stone-300 bg-stone-50 p-3 font-mono text-xs text-stone-900"
      />
    </div>

    <div v-if="grid.length" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="store.busy"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="save"
      >
        {{ store.busy ? t('table.working') : t(`table.action.${to}`) }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
        @click="reset"
      >
        {{ t('result.startOver') }}
      </button>
    </div>

    <ShellResultCard
      v-if="store.result"
      :result="store.result"
      @reset="reset"
      @chain="store.chainResult()"
    />
  </div>
</template>
