<script setup lang="ts">
import { parsePageRanges, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const turn = ref(90)
const ranges = ref('')
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

// Empty means every page, which is what most people want from a rotate tool.
const selected = computed(() =>
  ranges.value.trim() && pageCount.value ? parsePageRanges(ranges.value, pageCount.value) : []
)

const canRun = computed(
  () => !!file.value && !!pageCount.value && !store.busy && (!ranges.value.trim() || selected.value.length > 0)
)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await rotatePdf(file.value, turn.value, selected.value)
    store.setResult({
      name: withSuffix(file.value.name, '-rotated'),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size
    })
  } catch {
    store.error = t('pdf.errorGeneric')
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
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="infoError" class="text-sm text-red-700" role="alert">{{ t('pdf.errorRead') }}</p>

    <div v-else-if="file && pageCount" class="space-y-4">
      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-slate-900">
          {{ t('pdf.rotate.angleLabel') }}
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in [90, 180, 270]"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="
              turn === option
                ? 'border-sky-500 bg-sky-50 text-sky-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            "
          >
            <input v-model="turn" type="radio" :value="option" class="sr-only" />
            {{ t('pdf.rotate.degrees', { n: option }) }}
          </label>
        </div>
      </fieldset>

      <div class="space-y-1">
        <label for="rotate-ranges" class="block text-sm font-medium text-slate-900">
          {{ t('pdf.rotate.pagesLabel', { count: pageCount }) }}
        </label>
        <input
          id="rotate-ranges"
          v-model="ranges"
          type="text"
          :placeholder="t('pdf.rotate.pagesPlaceholder')"
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
        <p class="text-sm text-slate-500">
          {{
            ranges.trim()
              ? t('pdf.rotate.selected', { n: selected.length })
              : t('pdf.rotate.allPages')
          }}
        </p>
      </div>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.rotate.action') }}
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
