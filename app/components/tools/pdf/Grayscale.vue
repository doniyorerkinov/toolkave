<script setup lang="ts">
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const pageCount = ref<number | null>(null)
const infoError = ref(false)

const file = computed(() => store.files[0] ?? null)
const canRun = computed(() => !!file.value && !infoError.value && !store.busy)

watch(
  file,
  async current => {
    pageCount.value = null
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

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await grayscalePdf(file.value)
    store.setResult({
      name: withSuffix(file.value.name, '-grayscale'),
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
    <p
      v-else-if="pageCount"
      class="rounded-lg border border-ember-200 bg-ember-50 px-3 py-2 text-sm text-ember-900"
    >
      {{ t('pdf.grayscale.pages', { n: pageCount }) }}
    </p>

    <!--
      Said up front, not buried in the FAQ: the colour data is still in the
      file. Anyone reaching for this to strip colour permanently needs to know
      that before they send the result somewhere.
    -->
    <p class="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
      {{ t('pdf.grayscale.notice') }}
    </p>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.grayscale.action') }}
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
