<script setup lang="ts">
import { UNSUPPORTED_TEXT, isLatin1 } from '~/composables/usePdf'
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const text = ref('CONFIDENTIAL')
const fontSize = ref(48)
const opacity = ref(25)
const angle = ref(45)
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

/**
 * The built-in PDF fonts are WinAnsi-encoded, so Cyrillic text cannot be drawn
 * without embedding a font file. Warn before running rather than failing after.
 */
const textUnsupported = computed(() => text.value.length > 0 && !isLatin1(text.value))

const canRun = computed(
  () => !!file.value && !!pageCount.value && !!text.value.trim() && !textUnsupported.value && !store.busy
)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await addWatermark(file.value, {
      text: text.value,
      fontSize: fontSize.value,
      opacity: opacity.value / 100,
      angle: angle.value
    })
    store.setResult({
      name: withSuffix(file.value.name, '-watermarked'),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size
    })
  } catch (e) {
    store.error =
      e instanceof Error && e.message === UNSUPPORTED_TEXT
        ? t('pdf.watermark.unsupportedText')
        : t('pdf.errorGeneric')
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

    <div v-else-if="file && pageCount" class="space-y-4">
      <div>
        <label for="wm-text" class="block text-sm font-medium text-slate-900">
          {{ t('pdf.watermark.textLabel') }}
        </label>
        <input
          id="wm-text"
          v-model="text"
          type="text"
          maxlength="60"
          class="mt-1 w-full rounded-lg border px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
          :class="textUnsupported ? 'border-red-400' : 'border-slate-300 focus:border-sky-500'"
        />
        <p v-if="textUnsupported" class="mt-1 text-sm text-red-700" role="alert">
          {{ t('pdf.watermark.unsupportedText') }}
        </p>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div>
          <label for="wm-size" class="block text-sm font-medium text-slate-900">
            {{ t('pdf.watermark.fontSize', { n: fontSize }) }}
          </label>
          <input
            id="wm-size"
            v-model.number="fontSize"
            type="range"
            min="12"
            max="120"
            class="mt-2 w-full accent-sky-700"
          />
        </div>
        <div>
          <label for="wm-opacity" class="block text-sm font-medium text-slate-900">
            {{ t('pdf.watermark.opacity', { n: opacity }) }}
          </label>
          <input
            id="wm-opacity"
            v-model.number="opacity"
            type="range"
            min="5"
            max="100"
            class="mt-2 w-full accent-sky-700"
          />
        </div>
        <div>
          <label for="wm-angle" class="block text-sm font-medium text-slate-900">
            {{ t('pdf.watermark.angle', { n: angle }) }}
          </label>
          <input
            id="wm-angle"
            v-model.number="angle"
            type="range"
            min="0"
            max="90"
            step="15"
            class="mt-2 w-full accent-sky-700"
          />
        </div>
      </div>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.watermark.action') }}
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
