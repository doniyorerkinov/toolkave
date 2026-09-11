<script setup lang="ts">
import type { PageFit } from '~/composables/usePdf'
import { toolPath, tools, type Locale } from '~/data/tools'
import { useFilesStore } from '~/stores/files'

/**
 * One component, several registry entries.
 *
 * "JPG to PDF", "PNG to PDF" and the catch-all "Image to PDF" are the same
 * function but different search queries, so each gets its own page and its
 * own content. The registry entry supplies `accept` through `config`;
 * nothing here is per-format except which files the dropzone will take.
 */
const props = withDefaults(defineProps<{ accept?: string }>(), {
  accept: 'image/jpeg,image/png'
})

const { t, locale } = useI18n()
const store = useFilesStore()
const router = useRouter()

const fit = ref<PageFit>('a4')

/**
 * Phone photos are 3–5 MB each and, embedded as they are, seven of them make
 * a 12 MB PDF nobody can email. "Smaller" is the default because that is
 * what people actually want; "original" is there for the few who need every
 * pixel, and says what it costs.
 */
type SizeMode = 'smaller' | 'original'
const size = ref<SizeMode>('smaller')
const SMALLER = { maxDimension: 2000, quality: 0.82 }

/** The single-format pages offer the catch-all page, and take the files along. */
const anyFormatPath = computed(() => {
  if (props.accept.includes('image/gif')) return null // already the catch-all
  const tool = tools.find(candidate => candidate.id === 'image-to-pdf')
  if (!tool || !(tool.published || import.meta.dev)) return null
  return toolPath(tool, locale.value as Locale) ?? null
})

function switchToAnyFormat() {
  if (!anyFormatPath.value) return
  // Releasing ownership makes the files a hand-off: the destination adopts
  // them instead of clearing them, and the leave-page prompt stays quiet.
  if (store.files.length) store.ownerToolId = null
  router.push(anyFormatPath.value)
}

const canRun = computed(() => store.hasFiles && !store.busy)

/** The registry's `maxFiles`; the dropzone only caps a single drop, not the running total. */
const MAX_FILES = 100

function onFiles(files: File[]) {
  store.add(files.slice(0, Math.max(0, MAX_FILES - store.files.length)))
}

async function run() {
  if (!canRun.value) return
  store.busy = true
  store.error = null
  try {
    const sourceSize = store.totalSize
    // pdf-lib embeds only JPEG and PNG, so WebP and HEIC are re-encoded first;
    // "smaller" also downscales photos. Files that need nothing pass through.
    const ready = await normaliseForPdf(store.files, size.value === 'smaller' ? SMALLER : {})
    const data = await imagesToPdf(ready, fit.value)
    store.setResult({
      name: 'toolkave.pdf',
      type: 'application/pdf',
      data,
      sourceSize
    })
  } catch {
    store.error = t('pdf.imagesToPdf.errorUnsupported')
  } finally {
    store.busy = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone :accept="accept" multiple :max-files="MAX_FILES" @files="onFiles($event)" />

    <p v-if="anyFormatPath" class="text-sm text-stone-600">
      {{ t('pdf.imagesToPdf.anyFormat') }}
      <button type="button" class="font-semibold text-ember-700 hover:underline" @click="switchToAnyFormat">
        {{ t('tools.image-to-pdf.name') }} →
      </button>
    </p>

    <ShellFileList
      :files="store.files"
      @remove="store.remove($event)"
      @move="(from, to) => store.move(from, to)"
    />

    <div v-if="store.hasFiles" class="grid gap-4 sm:grid-cols-2">
      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">
          {{ t('pdf.imagesToPdf.fitLabel') }}
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in (['a4', 'image'] as PageFit[])"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="fit === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'"
          >
            <input v-model="fit" type="radio" :value="option" class="sr-only" />
            {{ t(`pdf.imagesToPdf.fit.${option}`) }}
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">
          {{ t('pdf.imagesToPdf.sizeLabel') }}
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in (['smaller', 'original'] as SizeMode[])"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="size === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'"
          >
            <input v-model="size" type="radio" :value="option" class="sr-only" />
            {{ t(`pdf.imagesToPdf.size.${option}`) }}
          </label>
        </div>
        <p class="mt-2 text-xs text-stone-500">{{ t(`pdf.imagesToPdf.sizeHint.${size}`) }}</p>
      </fieldset>
    </div>

    <div v-if="store.hasFiles" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.imagesToPdf.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
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
