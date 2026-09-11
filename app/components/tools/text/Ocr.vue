<script setup lang="ts">
import { LANGUAGE_DOWNLOAD_MB, OCR_ACCEPTED, OCR_LANGUAGES, recogniseImage, type OcrLanguage } from '~/composables/useOcr'
import { downloadBytes } from '~/utils/download'
import { useFilesStore } from '~/stores/files'

const props = withDefaults(defineProps<{ defaultLanguages?: OcrLanguage[] }>(), {
  defaultLanguages: () => ['rus', 'eng']
})

const { t } = useI18n()
const store = useFilesStore()

const languages = ref<OcrLanguage[]>([...props.defaultLanguages])
const text = ref('')
const confidence = ref<number | null>(null)
const stage = ref<string | null>(null)
const progress = ref(0)
const copied = ref(false)

const file = computed(() => store.files[0] ?? null)
const canRun = computed(() => !!file.value && languages.value.length > 0 && !store.busy)

/**
 * The models are a real download on a phone. Showing the size up front is
 * more honest than a spinner that sits there for a minute on a slow
 * connection, and it makes the cost of adding a second language obvious.
 */
const downloadSize = computed(() =>
  languages.value.reduce((sum, code) => sum + LANGUAGE_DOWNLOAD_MB[code], 0).toFixed(1)
)

function toggle(code: OcrLanguage) {
  languages.value = languages.value.includes(code)
    ? languages.value.filter(item => item !== code)
    : [...languages.value, code]
}

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  text.value = ''
  confidence.value = null
  progress.value = 0

  try {
    const result = await recogniseImage(file.value, languages.value, update => {
      stage.value = update.stage
      progress.value = Math.round(update.progress * 100)
    })
    text.value = result.text.trim()
    confidence.value = result.confidence
    if (!text.value) store.error = t('ocr.noText')
  } catch {
    store.error = t('ocr.errorGeneric')
  } finally {
    store.busy = false
    stage.value = null
  }
}

function onFiles(files: File[]) {
  store.reset()
  text.value = ''
  confidence.value = null
  store.add(files.slice(0, 1))
}

function download() {
  const name = `${(file.value?.name ?? 'text').replace(/\.[^.]+$/, '')}.txt`
  downloadBytes(text.value, name, 'text/plain;charset=utf-8')
}

async function copyText() {
  if (!text.value) return
  try {
    await navigator.clipboard.writeText(text.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Blocked by permissions or an insecure context; the text is selectable.
  }
}

/** Below this, the reading is usually not worth trusting without a check. */
const LOW_CONFIDENCE = 70
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      v-if="!file"
      :accept="OCR_ACCEPTED.join(',')"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <fieldset>
      <legend class="mb-2 text-sm font-medium text-slate-700">{{ t('ocr.languages') }}</legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="code in OCR_LANGUAGES"
          :key="code"
          type="button"
          :aria-pressed="languages.includes(code)"
          class="rounded-lg border px-3 py-1.5 text-sm font-medium transition"
          :class="
            languages.includes(code)
              ? 'border-sky-600 bg-sky-50 text-sky-900'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          "
          @click="toggle(code)"
        >
          {{ t(`ocr.language.${code}`) }}
        </button>
      </div>
      <p class="mt-2 text-xs text-slate-500">
        {{ languages.length ? t('ocr.downloadNote', { size: downloadSize }) : t('ocr.pickOne') }}
      </p>
    </fieldset>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('ocr.working') : t('ocr.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        @click="store.reset()"
      >
        {{ t('result.startOver') }}
      </button>
    </div>

    <div v-if="store.busy" class="space-y-1">
      <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div class="h-full rounded-full bg-sky-600 transition-all" :style="{ width: `${progress}%` }" />
      </div>
      <p class="text-xs text-slate-500">{{ stage }} — {{ progress }}%</p>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <div v-if="text" class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <label for="ocr-out" class="text-sm font-medium text-slate-700">{{ t('ocr.result') }}</label>
        <span
          v-if="confidence !== null"
          class="text-xs"
          :class="confidence < LOW_CONFIDENCE ? 'text-amber-700' : 'text-slate-500'"
        >
          {{ t('ocr.confidence', { value: confidence }) }}
        </span>
      </div>

      <p
        v-if="confidence !== null && confidence < LOW_CONFIDENCE"
        class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      >
        {{ t('ocr.lowConfidence') }}
      </p>

      <textarea
        id="ocr-out"
        v-model="text"
        rows="12"
        spellcheck="false"
        class="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
      />

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
          @click="copyText"
        >
          {{ copied ? t('ocr.copied') : t('ocr.copy') }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="download"
        >
          {{ t('ocr.download') }}
        </button>
      </div>
    </div>
  </div>
</template>
