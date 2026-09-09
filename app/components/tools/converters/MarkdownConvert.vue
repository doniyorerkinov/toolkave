<script setup lang="ts">
import { htmlToMarkdown, markdownToHtml, sanitiseHtml } from '~/composables/useDocx'

/** One component, two pages: Markdown to HTML and HTML to Markdown. */
const props = defineProps<{ from: 'markdown' | 'html' }>()

const { t } = useI18n()

const input = ref('')
const output = ref('')
const preview = ref('')
const showPreview = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const copied = ref(false)

const SAMPLES = {
  markdown: '# Заголовок\n\nТекст с **жирным** и *курсивом*.\n\n- пункт один\n- пункт два\n',
  html: '<h1>Заголовок</h1>\n<p>Текст с <strong>жирным</strong> и <em>курсивом</em>.</p>\n'
} as const

/**
 * Debounced rather than converted on every keystroke: both directions parse
 * the whole document, and a long paste would otherwise re-parse on every
 * character typed after it.
 */
let timer: ReturnType<typeof setTimeout> | undefined

watch(input, () => {
  clearTimeout(timer)
  timer = setTimeout(convert, 200)
})

onBeforeUnmount(() => clearTimeout(timer))

async function convert() {
  const value = input.value
  if (!value.trim()) {
    output.value = ''
    preview.value = ''
    return
  }

  busy.value = true
  error.value = null
  try {
    if (props.from === 'markdown') {
      output.value = await markdownToHtml(value)
      preview.value = await sanitiseHtml(output.value)
    } else {
      output.value = await htmlToMarkdown(value)
      // The preview shows the Markdown rendered back, which is the only way to
      // see whether anything was lost in the conversion.
      preview.value = await sanitiseHtml(await markdownToHtml(output.value))
    }
  } catch {
    error.value = t('markdown.errorGeneric')
  } finally {
    busy.value = false
  }
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

function download() {
  const extension = props.from === 'markdown' ? 'html' : 'md'
  const type = props.from === 'markdown' ? 'text/html' : 'text/markdown'
  const blob = new Blob([output.value], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `converted.${extension}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 lg:grid-cols-2">
      <div>
        <label for="md-in" class="mb-1 block text-sm font-medium text-slate-700">
          {{ t(`markdown.input.${from}`) }}
        </label>
        <textarea
          id="md-in"
          v-model="input"
          rows="16"
          spellcheck="false"
          :placeholder="SAMPLES[from]"
          class="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
        <button
          v-if="!input"
          type="button"
          class="mt-1 text-xs text-sky-700 hover:underline"
          @click="input = SAMPLES[from]"
        >
          {{ t('markdown.trySample') }}
        </button>
      </div>

      <div>
        <div class="mb-1 flex items-center justify-between gap-2">
          <label for="md-out" class="text-sm font-medium text-slate-700">
            {{ t(`markdown.output.${from}`) }}
          </label>
          <button
            v-if="output"
            type="button"
            class="text-xs text-sky-700 hover:underline"
            @click="showPreview = !showPreview"
          >
            {{ showPreview ? t('markdown.showSource') : t('markdown.showPreview') }}
          </button>
        </div>

        <!-- eslint-disable-next-line vue/no-v-html -- sanitised above -->
        <div
          v-if="showPreview"
          class="prose-sm h-[26rem] overflow-auto rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_table]:w-full [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_th]:border [&_th]:border-slate-200 [&_th]:px-2"
          v-html="preview"
        />
        <textarea
          v-else
          id="md-out"
          :value="output"
          rows="16"
          readonly
          spellcheck="false"
          class="w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-sm text-slate-900"
        />
      </div>
    </div>

    <p v-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!output || busy"
        class="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="copyOutput"
      >
        {{ copied ? t('markdown.copied') : t('markdown.copy') }}
      </button>
      <button
        type="button"
        :disabled="!output || busy"
        class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        @click="download"
      >
        {{ t('markdown.download') }}
      </button>
      <button
        type="button"
        :disabled="!input"
        class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        @click="input = ''"
      >
        {{ t('markdown.clear') }}
      </button>
    </div>
  </div>
</template>
