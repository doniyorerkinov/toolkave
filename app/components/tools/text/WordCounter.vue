<script setup lang="ts">
const { t } = useI18n()

const text = ref('')
const copied = ref(false)

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
    <label for="wc-input" class="sr-only">{{ t('wordCounter.placeholder') }}</label>
    <textarea
      id="wc-input"
      v-model="text"
      :placeholder="t('wordCounter.placeholder')"
      rows="10"
      spellcheck="false"
      class="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-base leading-relaxed text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
    />

    <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div
        v-for="metric in metrics"
        :key="metric.key"
        class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
        :class="metric.primary ? 'border-sky-200 bg-sky-50' : ''"
      >
        <dt class="text-xs tracking-wide text-slate-500 uppercase">{{ metric.label }}</dt>
        <dd
          class="mt-0.5 text-xl font-semibold tabular-nums"
          :class="metric.primary ? 'text-sky-900' : 'text-slate-900'"
        >
          {{ metric.value }}
        </dd>
      </div>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!text"
        class="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="copyText"
      >
        {{ copied ? t('wordCounter.copied') : t('wordCounter.copy') }}
      </button>
      <button
        type="button"
        :disabled="!text"
        class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        @click="text = ''"
      >
        {{ t('wordCounter.clear') }}
      </button>
    </div>
  </div>
</template>
