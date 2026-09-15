<script setup lang="ts">
import { NUMBER_STYLES, UNSUPPORTED_TEXT, isLatin1, type NumberPosition, type NumberStyle } from '~/composables/usePdf'
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const position = ref<NumberPosition>('bottom-center')
const style = ref<NumberStyle>('plain')
const startAt = ref(1)
const fontSize = ref(11)
/** Millimetres in the UI — what people measure margins in — points in the PDF. */
const marginMm = ref(15)
const label = ref('')
const skipFirst = ref(false)
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

const positions: NumberPosition[] = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']

const labelUnsupported = computed(() => label.value.length > 0 && !isLatin1(label.value))

const canRun = computed(() => !!file.value && !!pageCount.value && !labelUnsupported.value && !store.busy)

/**
 * The placement preview: the top or bottom half of an A4 sheet, in
 * millimetres, with the number drawn at true scale — so what the slider
 * says is what the page shows. The style cards show the styles up close.
 */
const MM_PER_PT = 25.4 / 72
const preview = computed(() => {
  const [vertical, horizontal] = position.value.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right']
  const size = fontSize.value * MM_PER_PT
  const cap = size * 0.72
  const sample = `${label.value.trim() ? `${label.value.trim()} ` : ''}${Math.max(1, startAt.value || 1)}${style.value === 'fraction' ? ` / ${Math.max(pageCount.value, 1)}` : ''}`
  const width = sample.length * size * 0.56
  const x = horizontal === 'left' ? marginMm.value : horizontal === 'right' ? 210 - marginMm.value - width : (210 - width) / 2
  // SVG y grows downward; the baseline sits `margin` from the nearest edge.
  const baseline = vertical === 'bottom' ? 297 - marginMm.value : marginMm.value + cap
  return {
    viewBox: vertical === 'bottom' ? '0 148.5 210 148.5' : '0 0 210 148.5',
    sample,
    size,
    x,
    baseline,
    width,
    cap,
    rule: style.value === 'rule' ? { y: vertical === 'bottom' ? baseline - size * 1.25 : baseline + size * 0.55, x1: marginMm.value, x2: 210 - marginMm.value } : null,
    circle: style.value === 'circle' ? { cx: x + width / 2, cy: baseline - cap / 2, rx: Math.max(width, cap) / 2 + size * 0.5, ry: cap / 2 + size * 0.5 } : null,
    box: style.value === 'box' ? { x: x - size * 0.45, y: baseline - cap - size * 0.36, w: width + size * 0.9, h: cap + size * 0.72 } : null
  }
})

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await addPageNumbers(file.value, {
      position: position.value,
      style: style.value,
      // `v-model.number` yields '' for a cleared field, which would number from "0".
      startAt: Number.isFinite(startAt.value) ? startAt.value : 1,
      fontSize: fontSize.value,
      margin: marginMm.value / MM_PER_PT,
      skipFirst: skipFirst.value,
      label: label.value
    })
    store.setResult({
      name: withSuffix(file.value.name, '-numbered'),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size
    })
  } catch (error) {
    store.error =
      error instanceof Error && error.message === UNSUPPORTED_TEXT
        ? t('pdf.pageNumbers.unsupportedText')
        : t(pdfErrorKey(error))
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
    <ShellFileDropzone v-if="!file" accept="application/pdf" :multiple="false" @files="onFiles($event)" />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="infoError" class="text-sm text-red-700" role="alert">{{ t('pdf.errorRead') }}</p>

    <div v-else-if="file && pageCount" class="space-y-5">
      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('pdf.pageNumbers.styleLabel') }}</legend>
        <div class="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <label
            v-for="option in NUMBER_STYLES"
            :key="option"
            class="cursor-pointer rounded-lg border p-2 text-center text-xs font-medium transition"
            :class="style === option ? 'border-ember-500 bg-ember-50 text-ember-900 ring-2 ring-ember-200' : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'"
          >
            <input v-model="style" type="radio" :value="option" class="sr-only" />
            <svg viewBox="0 0 84 44" class="mx-auto mb-1 h-11 w-full" aria-hidden="true">
              <line v-if="option === 'rule'" x1="10" y1="13" x2="74" y2="13" stroke="#a8a29e" stroke-width="1" />
              <ellipse v-if="option === 'circle'" cx="42" cy="25" rx="13" ry="11" fill="#e7e5e4" />
              <rect v-if="option === 'box'" x="29" y="13" width="26" height="24" fill="none" stroke="#a8a29e" stroke-width="1" />
              <text x="42" :y="option === 'rule' ? 34 : 30" font-size="15" font-family="Helvetica, Arial, sans-serif" fill="#1c1917" text-anchor="middle">
                {{ option === 'fraction' ? '7 / 12' : '7' }}
              </text>
            </svg>
            {{ t(`pdf.pageNumbers.styles.${option}`) }}
          </label>
        </div>
      </fieldset>

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('pdf.pageNumbers.positionLabel') }}</legend>
          <!-- Laid out like the page itself: top row, bottom row. -->
          <div class="grid grid-cols-3 gap-1 rounded-lg border border-stone-300 bg-white p-1">
            <label
              v-for="option in positions"
              :key="option"
              class="cursor-pointer rounded-md px-2 py-3 text-center text-xs font-medium transition"
              :class="position === option ? 'bg-ember-500 text-white' : 'text-stone-600 hover:bg-ember-100'"
            >
              <input v-model="position" type="radio" :value="option" class="sr-only" />
              {{ t(`pdf.pageNumbers.positions.${option}`) }}
            </label>
          </div>
        </fieldset>

        <div>
          <p class="mb-2 text-sm font-medium text-stone-900">{{ t('pdf.pageNumbers.preview') }}</p>
          <svg :viewBox="preview.viewBox" class="w-full rounded border border-stone-300 bg-white shadow-sm" aria-hidden="true">
            <line
              x1="0" :y1="preview.viewBox.startsWith('0 0') ? 148.5 : 148.5" x2="210" :y2="preview.viewBox.startsWith('0 0') ? 148.5 : 148.5"
              stroke="#d6d3d1" stroke-width="0.4" stroke-dasharray="2 2"
            />
            <line v-if="preview.rule" :x1="preview.rule.x1" :y1="preview.rule.y" :x2="preview.rule.x2" :y2="preview.rule.y" stroke="#9e9e9e" stroke-width="0.25" />
            <ellipse v-if="preview.circle" :cx="preview.circle.cx" :cy="preview.circle.cy" :rx="preview.circle.rx" :ry="preview.circle.ry" fill="#e8e8e8" />
            <rect v-if="preview.box" :x="preview.box.x" :y="preview.box.y" :width="preview.box.w" :height="preview.box.h" fill="none" stroke="#9e9e9e" stroke-width="0.3" />
            <text :x="preview.x" :y="preview.baseline" :font-size="preview.size" font-family="Helvetica, Arial, sans-serif" fill="#1a1a1a">{{ preview.sample }}</text>
          </svg>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="pn-margin" class="block text-sm font-medium text-stone-900">{{ t('pdf.pageNumbers.margin', { n: marginMm }) }}</label>
          <input id="pn-margin" v-model.number="marginMm" type="range" min="5" max="40" class="mt-3 w-full accent-ember-700" />
        </div>
        <div>
          <label for="pn-size" class="block text-sm font-medium text-stone-900">{{ t('pdf.pageNumbers.fontSize', { n: fontSize }) }}</label>
          <input id="pn-size" v-model.number="fontSize" type="range" min="8" max="24" class="mt-3 w-full accent-ember-700" />
        </div>
        <div>
          <label for="pn-start" class="block text-sm font-medium text-stone-900">{{ t('pdf.pageNumbers.startAt') }}</label>
          <input id="pn-start" v-model.number="startAt" type="number" min="0" class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200" />
        </div>
        <div>
          <label for="pn-label" class="block text-sm font-medium text-stone-900">{{ t('pdf.pageNumbers.label') }}</label>
          <input
            id="pn-label" v-model="label" type="text" maxlength="24" :placeholder="t('pdf.pageNumbers.labelPlaceholder')"
            class="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-ember-200"
            :class="labelUnsupported ? 'border-red-400' : 'border-stone-300 focus:border-ember-500'"
          />
          <p v-if="labelUnsupported" class="mt-1 text-sm text-red-700" role="alert">{{ t('pdf.pageNumbers.unsupportedText') }}</p>
        </div>
      </div>

      <label class="flex items-center gap-2 text-sm text-stone-700">
        <input v-model="skipFirst" type="checkbox" class="size-4 accent-ember-700" />
        {{ t('pdf.pageNumbers.skipFirst') }}
      </label>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button" :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.pageNumbers.action') }}
      </button>
      <button type="button" class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-ember-100" @click="store.reset()">
        {{ t('result.startOver') }}
      </button>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard v-if="store.result" :result="store.result" @reset="store.reset()" @chain="store.chainResult()" />
  </div>
</template>
