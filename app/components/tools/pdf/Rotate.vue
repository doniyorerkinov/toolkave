<script setup lang="ts">
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const turn = ref(90)
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
      // All pages start selected — rotating everything is the common case,
      // and starting from "all checked" is easier to read at a glance than a
      // blank picker that secretly also means "all".
      selected.value = Array.from({ length: pageCount.value }, (_unused, i) => i)
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

const canRun = computed(() => !!file.value && !!pageCount.value && selected.value.length > 0 && !store.busy)

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
  } catch (error) {
    store.error = t(pdfErrorKey(error))
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

    <div v-else-if="file && pageCount" class="space-y-4">
      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">
          {{ t('pdf.rotate.angleLabel') }}
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in [90, 180, 270]"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="
              turn === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
            "
          >
            <input v-model="turn" type="radio" :value="option" class="sr-only" />
            {{ t('pdf.rotate.degrees', { n: option }) }}
          </label>
        </div>
      </fieldset>

      <ShellPagePicker
        v-model="selected"
        :file="file"
        :page-count="pageCount"
        :range-label="t('pdf.rotate.pagesLabel', { count: pageCount })"
        :range-placeholder="t('pdf.rotate.pagesPlaceholder')"
      />
      <p class="text-sm text-stone-500">{{ t('pdf.rotate.selected', { n: selected.length }) }}</p>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.rotate.action') }}
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
