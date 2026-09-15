<script setup lang="ts">
import { docxToText, isDocx, isLegacyDoc } from '~~/shared/docx'
import { detectEncoding } from '~/utils/encoding'

/**
 * `documents` adds a file picker for .docx and .txt. Counting words in a Word
 * document is a separate search query from counting pasted text, so it gets
 * its own page — but it is the same counting logic, so it is a flag on this
 * component rather than a second one.
 */
const props = defineProps<{ documents?: boolean }>()

const { t } = useI18n()

const text = ref('')
const copied = ref(false)
const loading = ref(false)
const loadError = ref<string | null>(null)
const loadedName = ref<string | null>(null)

async function loadFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  loading.value = true
  loadError.value = null
  loadedName.value = null

  try {
    const data = new Uint8Array(await file.arrayBuffer())

    if (isLegacyDoc(data)) {
      loadError.value = t('docs.legacyDoc')
    } else if (isDocx(data)) {
      text.value = await docxToText(data)
      loadedName.value = file.name
    } else {
      // A plain-text file may well be windows-1251, so detect rather than
      // assume UTF-8 and count a page of replacement characters.
      text.value = detectEncoding(data).best.text
      loadedName.value = file.name
    }
  } catch {
    loadError.value = t('docs.errorRead')
  } finally {
    loading.value = false
    // Cleared so choosing the same file twice still fires a change event.
    input.value = ''
  }
}

/**
 * Counting is alphabet-independent: splitting on whitespace works the same for
 * Latin, Cyrillic and mixed text. `Intl.Segmenter` is deliberately not used —
 * whitespace splitting is what the FAQ documents, and it matches what users
 * expect from a word count.
 */
const stats = computed(() => {
  const value = text.value
  const trimmed = value.trim()

  const words = trimmed ? trimmed.split(/\s+/).length : 0
  const characters = value.length
  const charactersNoSpaces = value.replace(/\s/g, '').length

  const sentences = trimmed ? (trimmed.match(/[^.!?…]+[.!?…]+(\s|$)|[^.!?…]+$/g)?.length ?? 0) : 0

  const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter(p => p.trim().length > 0).length : 0

  return { words, characters, charactersNoSpaces, sentences, paragraphs }
})

const readingTime = computed(() => {
  if (stats.value.words === 0) return '—'
  const minutes = stats.value.words / 200
  if (minutes < 1) return t('wordCounter.lessThanAMinute')
  return `${Math.round(minutes)} ${t('wordCounter.minutesShort')}`
})

const metrics = computed(() => [
  { key: 'words', label: t('wordCounter.words'), value: stats.value.words, primary: true },
  { key: 'characters', label: t('wordCounter.characters'), value: stats.value.characters },
  {
    key: 'charactersNoSpaces',
    label: t('wordCounter.charactersNoSpaces'),
    value: stats.value.charactersNoSpaces
  },
  { key: 'sentences', label: t('wordCounter.sentences'), value: stats.value.sentences },
  { key: 'paragraphs', label: t('wordCounter.paragraphs'), value: stats.value.paragraphs },
  { key: 'readingTime', label: t('wordCounter.readingTime'), value: readingTime.value }
])

async function copyText() {
  if (!text.value) return
  try {
    await navigator.clipboard.writeText(text.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard can be blocked by permissions or an insecure context; the
    // text is still selectable by hand, so fail quietly.
  }
}
</script>

<template>
  <div>
    <div v-if="props.documents" class="mb-3 space-y-2">
      <label
        class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
      >
        <input
          type="file"
          accept=".docx,.txt,.md,.csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          class="sr-only"
          @change="loadFile"
        />
        {{ loading ? t('wordCounter.loading') : t('wordCounter.chooseFile') }}
      </label>
      <p v-if="loadedName" class="text-xs text-stone-500">
        {{ t('wordCounter.loadedFrom', { name: loadedName }) }}
      </p>
      <p v-if="loadError" class="text-sm text-red-700" role="alert">{{ loadError }}</p>
    </div>

    <label for="wc-input" class="sr-only">{{ t('wordCounter.placeholder') }}</label>
    <textarea
      id="wc-input"
      v-model="text"
      :placeholder="t('wordCounter.placeholder')"
      rows="10"
      spellcheck="false"
      class="w-full resize-y rounded-lg border border-stone-300 bg-white p-3 text-base leading-relaxed text-stone-900 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
    />

    <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div
        v-for="metric in metrics"
        :key="metric.key"
        class="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2"
        :class="metric.primary ? 'border-ember-200 bg-ember-50' : ''"
      >
        <dt class="text-xs tracking-wide text-stone-500 uppercase">{{ metric.label }}</dt>
        <dd
          class="mt-0.5 text-xl font-semibold tabular-nums"
          :class="metric.primary ? 'text-ember-900' : 'text-stone-900'"
        >
          {{ metric.value }}
        </dd>
      </div>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!text"
        class="rounded-lg bg-ember-700 px-4 py-2 text-sm font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="copyText"
      >
        {{ copied ? t('wordCounter.copied') : t('wordCounter.copy') }}
      </button>
      <button
        type="button"
        :disabled="!text"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400"
        @click="text = ''"
      >
        {{ t('wordCounter.clear') }}
      </button>
    </div>
  </div>
</template>
