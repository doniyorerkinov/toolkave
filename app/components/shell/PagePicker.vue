<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { usePdfWorker } from '~/composables/usePdfWorker'
import { formatPageRanges, parsePageRanges } from '~/utils/formatters'
import type { HeldFile } from '~/stores/files'

/**
 * A visual page picker for a PDF, backed by real thumbnails rendered off the
 * main thread in `pdf.worker.ts`.
 *
 * The range-text field is kept, not replaced — typing "1-5, 8" is still the
 * fastest way to select pages for anyone who already knows the numbers, and
 * it works instantly whether or not the thumbnails underneath have finished
 * loading. The grid is the part that is new: click a page, or shift-click for
 * a run of them, and the text field updates to match. Either input is a
 * source of truth for the other.
 *
 * Selection is zero-based page indices throughout, matching
 * `parsePageRanges`/`formatPageRanges` and what `rotatePdf`/`removePdfPages`/
 * `extractPages` already expect — so a caller can drop this in without a
 * conversion at the boundary.
 */

const props = withDefaults(
  defineProps<{
    file: HeldFile
    pageCount: number
    modelValue: number[]
    /** Label above the range field; callers phrase this per tool ("Pages to rotate", "Pages to remove"…). */
    rangeLabel?: string
    rangePlaceholder?: string
    /** Cap on how many pages get a thumbnail rendered. Selection past this limit still works via the text field. */
    maxThumbnails?: number
  }>(),
  { rangeLabel: '', rangePlaceholder: 'e.g. 1-3, 5, 8-10', maxThumbnails: 300 }
)

const emit = defineEmits<{ 'update:modelValue': [number[]] }>()

const { t } = useI18n()
const { getThumbnails } = usePdfWorker()

const rangeText = ref(formatPageRanges(props.modelValue))
const selected = ref(new Set(props.modelValue))
const lastClicked = ref<number | null>(null)

const thumbnailsEnabled = computed(() => props.pageCount > 0 && props.pageCount <= props.maxThumbnails)
const loaded = ref(0)
const total = ref(0)
const loadError = ref(false)

interface Thumbnail {
  bitmap: ImageBitmap
  width: number
  height: number
}
const thumbnails = shallowRef(new Map<number, Thumbnail>())
const thumbCanvases = new Map<number, HTMLCanvasElement>()

function syncFromSelection() {
  rangeText.value = formatPageRanges([...selected.value])
  emit('update:modelValue', [...selected.value].sort((a, b) => a - b))
}

function onRangeInput() {
  selected.value = new Set(props.pageCount ? parsePageRanges(rangeText.value, props.pageCount) : [])
  emit('update:modelValue', [...selected.value].sort((a, b) => a - b))
}

function toggle(index: number, event?: MouseEvent) {
  const next = new Set(selected.value)

  if (event?.shiftKey && lastClicked.value !== null) {
    const [lo, hi] = lastClicked.value <= index ? [lastClicked.value, index] : [index, lastClicked.value]
    const addRange = !next.has(index)
    for (let i = lo; i <= hi; i++) {
      if (addRange) next.add(i)
      else next.delete(i)
    }
  } else if (next.has(index)) {
    next.delete(index)
  } else {
    next.add(index)
  }

  lastClicked.value = index
  selected.value = next
  syncFromSelection()
}

function selectAll() {
  selected.value = new Set(Array.from({ length: props.pageCount }, (_unused, i) => i))
  syncFromSelection()
}

function selectNone() {
  selected.value = new Set()
  syncFromSelection()
}

function drawThumbnail(index: number, entry: Thumbnail) {
  const canvas = thumbCanvases.get(index)
  if (!canvas) return
  canvas.width = entry.width
  canvas.height = entry.height
  const context = canvas.getContext('2d')
  context?.drawImage(entry.bitmap, 0, 0)
}

/** Vue's function-ref callback type is wider than what a plain `<canvas>` can be. */
function registerCanvas(index: number, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLCanvasElement) {
    thumbCanvases.set(index, el)
    const entry = thumbnails.value.get(index)
    if (entry) drawThumbnail(index, entry)
  } else {
    thumbCanvases.delete(index)
  }
}

function closeAllBitmaps() {
  for (const entry of thumbnails.value.values()) entry.bitmap.close()
  thumbnails.value = new Map()
}

async function loadThumbnails() {
  closeAllBitmaps()
  loaded.value = 0
  total.value = props.pageCount
  loadError.value = false

  if (!thumbnailsEnabled.value) return

  const pages = Array.from({ length: props.pageCount }, (_unused, i) => i + 1)
  try {
    await getThumbnails(
      props.file.data,
      pages,
      // Backing-store size, not CSS size: rendered at 2x the ~90px grid cell
      // so the thumbnail is still sharp on a high-DPI screen.
      220,
      page => {
        const index = page.page - 1
        thumbnails.value.set(index, { bitmap: page.bitmap, width: page.width, height: page.height })
        // Map identity is unchanged (mutated in place) — triggers Vue's
        // shallowRef tracking explicitly rather than cloning on every page.
        triggerRef(thumbnails)
        drawThumbnail(index, thumbnails.value.get(index)!)
      },
      { onProgress: done => (loaded.value = done) }
    )
  } catch {
    loadError.value = true
  }
}

watch(() => [props.file, props.pageCount] as const, loadThumbnails, { immediate: true })

watch(
  () => props.modelValue,
  next => {
    const incoming = new Set(next)
    const same = incoming.size === selected.value.size && [...incoming].every(i => selected.value.has(i))
    if (same) return
    selected.value = incoming
    rangeText.value = formatPageRanges(next)
  }
)

onBeforeUnmount(closeAllBitmaps)
</script>

<template>
  <div class="space-y-3">
    <div>
      <label v-if="rangeLabel" for="page-picker-range" class="mb-1 block text-sm font-medium text-stone-900">
        {{ rangeLabel }}
      </label>
      <input
        id="page-picker-range"
        v-model="rangeText"
        type="text"
        inputmode="numeric"
        :placeholder="rangePlaceholder"
        class="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 outline-none focus:border-ember-500 focus:ring-2 focus:ring-ember-200"
        @input="onRangeInput"
      />
    </div>

    <div v-if="thumbnailsEnabled" class="space-y-2">
      <div class="flex items-center justify-between gap-2">
        <div class="flex gap-2">
          <button
            type="button"
            class="-my-2 rounded px-2 py-2 text-xs font-medium text-ember-700 hover:underline"
            @click="selectAll"
          >
            {{ t('pagePicker.selectAll') }}
          </button>
          <button
            type="button"
            class="-my-2 rounded px-2 py-2 text-xs font-medium text-ember-700 hover:underline"
            @click="selectNone"
          >
            {{ t('pagePicker.selectNone') }}
          </button>
        </div>
        <span v-if="loaded < total" class="text-xs text-stone-500">
          {{ t('pagePicker.loading', { done: loaded, total }) }}
        </span>
      </div>

      <div
        class="scroll-thin grid max-h-96 grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-stone-200 p-2 sm:grid-cols-4 md:grid-cols-5"
      >
        <button
          v-for="index in pageCount"
          :key="index - 1"
          type="button"
          role="checkbox"
          :aria-checked="selected.has(index - 1)"
          :aria-label="t('pagePicker.page', { n: index })"
          class="group relative flex aspect-3/4 items-center justify-center overflow-hidden rounded-md border-2 bg-stone-50 transition"
          :class="
            selected.has(index - 1)
              ? 'border-ember-600 ring-2 ring-ember-200'
              : 'border-stone-200 hover:border-ember-300'
          "
          @click="toggle(index - 1, $event)"
        >
          <canvas :ref="el => registerCanvas(index - 1, el)" class="max-h-full max-w-full object-contain" />
          <span
            class="absolute right-1 top-1 rounded bg-white/90 px-1 text-[10px] font-medium text-stone-600"
          >{{ index }}</span>
          <span
            v-if="selected.has(index - 1)"
            class="absolute inset-0 flex items-center justify-center bg-ember-600/20"
            aria-hidden="true"
          >
            <span class="rounded-full bg-ember-600 p-1 text-white">
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5">
                <path
                  fill-rule="evenodd"
                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0L3.3 9.5a1 1 0 1 1 1.4-1.4l3.9 3.9 6.7-6.7a1 1 0 0 1 1.4 0Z"
                  clip-rule="evenodd"
                />
              </svg>
            </span>
          </span>
        </button>
      </div>
    </div>

    <p v-else-if="pageCount > maxThumbnails" class="text-xs text-stone-500">
      {{ t('pagePicker.tooManyPages', { max: maxThumbnails }) }}
    </p>
    <p v-if="loadError" class="text-xs text-amber-700">{{ t('pagePicker.loadError') }}</p>
  </div>
</template>
