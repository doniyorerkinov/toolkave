<script setup lang="ts">
import { usePdfWorker } from '~/composables/usePdfWorker'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()
const { extractText } = usePdfWorker()

const output = ref('')
const copied = ref(false)
const progress = ref(0)
const total = ref(0)

const file = computed(() => store.files[0] ?? null)
const canRun = computed(() => !!file.value && !store.busy)

watch(file, () => {
  output.value = ''
})

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  progress.value = 0
  total.value = 0

  const pages: string[] = []
  try {
    await extractText(
      file.value.data,
      page => {
        pages[page.page - 1] = page.text
      },
      { onProgress: (done, pageTotal) => { progress.value = done; total.value = pageTotal } }
    )
    output.value = pages.join('\n\n').trim()
    if (!output.value) store.error = t('pdf.toText.empty')
  } catch (error) {
    store.error = t(pdfErrorKey(error))
  } finally {
    store.busy = false
  }
}

function save() {
  if (!output.value || !file.value) return
  store.setResult({
    name: file.value.name.replace(/\.pdf$/i, '') + '.txt',
    type: 'text/plain;charset=utf-8',
    data: new TextEncoder().encode(output.value),
    sourceSize: file.value.size
  })
}

function onFiles(files: File[]) {
  store.reset()
  output.value = ''
  store.add(files.slice(0, 1))
}

async function copyOutput() {
  if (!output.value) return
  try {
    await navigator.clipboard.writeText(output.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Blocked by permissions or an insecure context; the text is selectable.
  }
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone v-if="!file" accept="application/pdf" :multiple="false" @files="onFiles($event)" />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.toText.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
        @click="store.reset()"
      >
        {{ t('result.startOver') }}
      </button>
    </div>

    <div v-if="store.busy && total" class="space-y-1">
      <div class="h-2 w-full overflow-hidden rounded-full bg-stone-200">
        <div class="h-full rounded-full bg-ember-600 transition-all" :style="{ width: `${(progress / total) * 100}%` }" />
      </div>
      <p class="text-xs text-stone-500">{{ t('pdf.toText.progress', { done: progress, total }) }}</p>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <div v-if="output" class="space-y-2">
      <label for="pdf-to-text-out" class="block text-sm font-medium text-stone-700">{{ t('pdf.toText.result') }}</label>
      <textarea
        id="pdf-to-text-out"
        :value="output"
        rows="14"
        readonly
        spellcheck="false"
        class="w-full resize-y rounded-lg border border-stone-300 bg-white p-3 font-mono text-xs text-stone-900"
      />
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg bg-ember-700 px-4 py-2 text-sm font-medium text-white hover:bg-ember-800"
          @click="copyOutput"
        >
          {{ copied ? t('docs.copied') : t('docs.copy') }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          @click="save"
        >
          {{ t('docs.saveFile') }}
        </button>
      </div>
    </div>

    <ShellResultCard v-if="store.result" :result="store.result" @reset="store.reset()" @chain="store.chainResult()" />
  </div>
</template>
