<script setup lang="ts">
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const fieldCount = ref<number | null>(null)
const infoError = ref(false)

const file = computed(() => store.files[0] ?? null)

watch(
  file,
  async current => {
    fieldCount.value = null
    infoError.value = false
    if (!current) return
    try {
      fieldCount.value = (await readFormFields(current)).length
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

const canRun = computed(() => !!file.value && fieldCount.value !== null && !store.busy)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await flattenPdf(file.value)
    store.setResult({
      name: withSuffix(file.value.name, '-flattened'),
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
      v-else-if="fieldCount === 0"
      class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
    >
      {{ t('pdf.flatten.noFields') }}
    </p>
    <p
      v-else-if="fieldCount"
      class="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900"
    >
      {{ t('pdf.flatten.foundFields', { n: fieldCount }) }}
    </p>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.flatten.action') }}
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
