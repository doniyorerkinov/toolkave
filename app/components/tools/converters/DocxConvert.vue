<script setup lang="ts">
import { docxToHtml, docxToMarkdown, docxToText, isDocx, isLegacyDoc } from '~/composables/useDocx'
import { useFilesStore } from '~/stores/files'

/** One component, three pages: .docx to plain text, to HTML and to Markdown. */
const props = defineProps<{ to: 'text' | 'html' | 'markdown' }>()

const { t } = useI18n()
const store = useFilesStore()

const output = ref('')
const notes = ref<string[]>([])
const copied = ref(false)

const file = computed(() => store.files[0] ?? null)
const legacy = computed(() => !!file.value && isLegacyDoc(file.value.data))
const unreadable = computed(() => !!file.value && !legacy.value && !isDocx(file.value.data))
const canRun = computed(() => !!file.value && !legacy.value && !unreadable.value && !store.busy)

const EXTENSIONS = { text: 'txt', html: 'html', markdown: 'md' } as const
const TYPES = {
  text: 'text/plain;charset=utf-8',
  html: 'text/html;charset=utf-8',
  markdown: 'text/markdown;charset=utf-8'
} as const

watch(file, () => {
  output.value = ''
  notes.value = []
})

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  notes.value = []

  try {
    const data = file.value.data
    if (props.to === 'text') {
      output.value = await docxToText(data)
    } else if (props.to === 'markdown') {
      output.value = await docxToMarkdown(data)
    } else {
      const result = await docxToHtml(data)
      output.value = result.html
      // Mammoth reports styles it could not map. They are not failures, but a
      // document that loses its formatting should say why.
      notes.value = [...new Set(result.messages)].slice(0, 5)
    }

    if (!output.value.trim()) store.error = t('docs.empty')
  } catch {
    store.error = t('docs.errorRead')
  } finally {
    store.busy = false
  }
}

function save() {
  if (!output.value || !file.value) return
  store.setResult({
    name: file.value.name.replace(/\.docx?$/i, '') + `.${EXTENSIONS[props.to]}`,
    type: TYPES[props.to],
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

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('docs.working') : t(`docs.action.${to}`) }}
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

    <ul v-if="notes.length" class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
      <li v-for="note in notes" :key="note">{{ note }}</li>
    </ul>

    <div v-if="output" class="space-y-2">
      <label for="docs-out" class="block text-sm font-medium text-slate-700">{{ t('docs.result') }}</label>
      <textarea
        id="docs-out"
        :value="output"
        rows="14"
        readonly
        spellcheck="false"
        class="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900"
      />
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
          @click="copyOutput"
        >
          {{ copied ? t('docs.copied') : t('docs.copy') }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="save"
        >
          {{ t('docs.saveFile') }}
        </button>
      </div>
    </div>

    <ShellResultCard
      v-if="store.result"
      :result="store.result"
      @reset="store.reset()"
      @chain="store.chainResult()"
    />
  </div>
</template>
