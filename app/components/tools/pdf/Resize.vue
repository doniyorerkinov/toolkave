<script setup lang="ts">
import { PAPER, type PageSizePreset } from '~/composables/usePdf'
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const preset = ref<PageSizePreset>('a4')
const scale = ref(100)
const meta = ref<Awaited<ReturnType<typeof readPdfMetadata>> | null>(null)
const infoError = ref(false)

const file = computed(() => store.files[0] ?? null)

const presets: PageSizePreset[] = ['a4', 'letter', 'legal', 'scale']
const PAPER_PRESETS = ['a4', 'letter', 'legal'] as const

/** Page sizes come back rounded, so a point of slack is a match, not a change. */
const SAME = 1

interface PageSize { width: number; height: number }

/** What `page` becomes under `option`, in that page's own orientation. */
function targetFor(option: PageSizePreset, page: PageSize): PageSize {
  if (option === 'scale') {
    const factor = scale.value / 100
    return { width: Math.round(page.width * factor), height: Math.round(page.height * factor) }
  }
  const [width, height] = PAPER[option]
  const [tw, th] = page.width > page.height ? [height, width] : [width, height]
  return { width: Math.round(tw), height: Math.round(th) }
}

function changes(option: PageSizePreset, page: PageSize): boolean {
  const target = targetFor(option, page)
  return Math.abs(target.width - page.width) > SAME || Math.abs(target.height - page.height) > SAME
}

watch(
  file,
  async current => {
    meta.value = null
    infoError.value = false
    if (!current) return
    try {
      const info = await readPdfMetadata(current)
      meta.value = info
      // Most PDFs are already A4, where the default choice would do nothing at
      // all - and a page that comes back the same size reads as a broken tool.
      // Start on a size that actually changes something.
      if (preset.value !== 'scale' && !info.pageSizes.some(page => changes(preset.value, page))) {
        preset.value =
          PAPER_PRESETS.find(option => info.pageSizes.some(page => changes(option, page))) ?? preset.value
      }
    } catch {
      infoError.value = true
    }
  },
  { immediate: true }
)

const firstPage = computed(() => meta.value?.pageSizes[0] ?? null)

const currentSize = computed(() => {
  const first = firstPage.value
  return first ? `${first.label} · ${first.width} × ${first.height} pt` : ''
})

/** Dimensions of each paper preset, shown on its chip. */
const presetSize: Record<string, string> = Object.fromEntries(
  PAPER_PRESETS.map(option => [option, `${Math.round(PAPER[option][0])} × ${Math.round(PAPER[option][1])} pt`])
)

const newSize = computed(() => {
  const first = firstPage.value
  if (!first) return ''
  const target = targetFor(preset.value, first)
  return `${target.width} × ${target.height} pt`
})

/** Nothing to do: every page is already the size it would be resized to. */
const noChange = computed(() => {
  const pages = meta.value?.pageSizes ?? []
  return pages.length > 0 && !pages.some(page => changes(preset.value, page))
})

const canRun = computed(() => !!file.value && !!meta.value && !noChange.value && !store.busy)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await resizePdfPages(file.value, preset.value, scale.value / 100)
    const label = preset.value === 'scale' ? '' : `${t(`pdf.resize.presets.${preset.value}`)} `
    store.setResult({
      name: withSuffix(file.value.name, `-${preset.value === 'scale' ? `${scale.value}pct` : preset.value}`),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size,
      // The pages look identical in any viewer that fits them to the window,
      // so the result has to say what actually changed.
      note: firstPage.value ? `${currentSize.value} → ${label}${newSize.value}` : undefined
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

    <template v-else-if="file && meta">
      <p class="text-sm text-stone-500">{{ t('pdf.resize.current') }}: {{ currentSize }}</p>

      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">
          {{ t('pdf.resize.targetLabel') }}
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in presets"
            :key="option"
            class="cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium"
            :class="
              preset === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            "
          >
            <input v-model="preset" type="radio" :value="option" class="sr-only" />
            {{ t(`pdf.resize.presets.${option}`) }}
            <span v-if="presetSize[option]" class="block text-xs font-normal opacity-70">
              {{ presetSize[option] }}
            </span>
          </label>
        </div>
      </fieldset>

      <div v-if="preset === 'scale'">
        <label for="rz-scale" class="block text-sm font-medium text-stone-900">
          {{ t('pdf.resize.scale', { n: scale }) }}
        </label>
        <input
          id="rz-scale"
          v-model.number="scale"
          type="range"
          min="25"
          max="200"
          step="5"
          class="mt-2 w-full accent-ember-700"
        />
      </div>

      <p v-if="noChange" class="text-sm text-amber-700">{{ t('pdf.resize.noChange') }}</p>
      <template v-else>
        <p class="text-sm font-medium text-stone-900">{{ t('pdf.resize.newSize') }}: {{ newSize }}</p>
        <p v-if="preset !== 'scale'" class="text-sm text-stone-500">{{ t('pdf.resize.fitNote') }}</p>
      </template>
    </template>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.resize.action') }}
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
