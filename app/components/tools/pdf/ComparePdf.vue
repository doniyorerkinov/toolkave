<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { diffWords } from 'diff'
import { usePdfWorker } from '~/composables/usePdfWorker'
import { comparePages, summarise, type PageComparison } from '~/composables/usePdfCompare'
import type { HeldFile } from '~/stores/files'

/**
 * Page-by-page comparison of two PDFs.
 *
 * Deliberately outside the shared file store: the store is built around one
 * tool owning one set of inputs (`store.claim`), and this tool genuinely
 * needs two independent files side by side, kept apart even if they happen
 * to be the same document at two versions. Its own local state, not the
 * global one, is the right call here.
 *
 * Comparison runs on extracted text per page, not a pixel diff — cheap
 * enough to run on every page of a long document without rendering any of
 * them, and it is what actually answers "what changed" rather than merely
 * "do these pixels differ." Thumbnails are rendered afterwards, only for the
 * pages flagged as changed, so a visual check is still one click away
 * without paying to render every unchanged page.
 */

const { t } = useI18n()
const { extractText, getThumbnails } = usePdfWorker()

const fileA = ref<HeldFile | null>(null)
const fileB = ref<HeldFile | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)
const progress = ref(0)
const progressTotal = ref(0)

const comparisons = ref<PageComparison[]>([])
const expanded = ref<Set<number>>(new Set())

const summary = computed(() => (comparisons.value.length ? summarise(comparisons.value) : null))
const canRun = computed(() => !!fileA.value && !!fileB.value && !busy.value)

/**
 * Runs text extraction and reports combined progress across both documents.
 * `progressTotal` isn't known until each `extractText` call reports its own
 * page count on its first progress tick, so the running total is corrected
 * as those arrive rather than assumed up front.
 */
async function extractPages(file: HeldFile, onPage: () => void): Promise<string[]> {
  const pages: string[] = []
  let knownTotal = 0

  await extractText(
    file.data,
    page => {
      pages[page.page - 1] = page.text
      onPage()
    },
    {
      onProgress: (_done, total) => {
        progressTotal.value += total - knownTotal
        knownTotal = total
      }
    }
  )

  return pages
}

async function run() {
  if (!canRun.value || !fileA.value || !fileB.value) return
  busy.value = true
  error.value = null
  comparisons.value = []
  expanded.value = new Set()
  progress.value = 0
  progressTotal.value = 0

  try {
    const [pagesA, pagesB] = await Promise.all([
      extractPages(fileA.value, () => progress.value++),
      extractPages(fileB.value, () => progress.value++)
    ])

    comparisons.value = comparePages(pagesA, pagesB)
    // If every page is identical, comparisons.value still populates and the
    // summary line says so — that is the answer, not an error state.
  } catch {
    error.value = t('pdf.compare.errorGeneric')
  } finally {
    busy.value = false
  }
}

function toggle(page: number) {
  const next = new Set(expanded.value)
  if (next.has(page)) next.delete(page)
  else next.add(page)
  expanded.value = next
}

/* ---- thumbnails for changed pages only ---- */

interface ThumbPair {
  a?: { bitmap: ImageBitmap; width: number; height: number }
  b?: { bitmap: ImageBitmap; width: number; height: number }
}
const thumbs = shallowRef(new Map<number, ThumbPair>())
const thumbCanvases = new Map<string, HTMLCanvasElement>()
const thumbsRequested = ref(false)

function drawThumb(key: string, entry: { bitmap: ImageBitmap; width: number; height: number }) {
  const canvas = thumbCanvases.get(key)
  if (!canvas) return
  canvas.width = entry.width
  canvas.height = entry.height
  canvas.getContext('2d')?.drawImage(entry.bitmap, 0, 0)
}

function registerThumbCanvas(page: number, side: 'a' | 'b', el: Element | ComponentPublicInstance | null) {
  const key = `${page}-${side}`
  if (el instanceof HTMLCanvasElement) {
    thumbCanvases.set(key, el)
    const pair = thumbs.value.get(page)
    const entry = side === 'a' ? pair?.a : pair?.b
    if (entry) drawThumb(key, entry)
  } else {
    thumbCanvases.delete(key)
  }
}

async function loadThumbnailsForChangedPages() {
  if (thumbsRequested.value || !fileA.value || !fileB.value) return
  thumbsRequested.value = true

  const pages = comparisons.value.filter(item => item.status === 'changed').map(item => item.page)
  if (!pages.length) return

  // A page flagged "changed" might still be past the end of one document
  // (an "added"/"removed" page is never flagged "changed", so this can only
  // happen if a page has real content on both sides — which is exactly the
  // case this renders thumbnails for), so no further filtering is needed
  // before asking each document for the same page-number list.
  await Promise.all([
    getThumbnails(fileA.value.data, pages, 260, page => {
      const pair = thumbs.value.get(page.page) ?? {}
      pair.a = { bitmap: page.bitmap, width: page.width, height: page.height }
      thumbs.value.set(page.page, pair)
      triggerRef(thumbs)
      drawThumb(`${page.page}-a`, pair.a)
    }).catch(() => {}),
    getThumbnails(fileB.value.data, pages, 260, page => {
      const pair = thumbs.value.get(page.page) ?? {}
      pair.b = { bitmap: page.bitmap, width: page.width, height: page.height }
      thumbs.value.set(page.page, pair)
      triggerRef(thumbs)
      drawThumb(`${page.page}-b`, pair.b)
    }).catch(() => {})
  ])
}

watch(comparisons, list => {
  if (list.length) loadThumbnailsForChangedPages()
})

function closeAllThumbs() {
  for (const pair of thumbs.value.values()) {
    pair.a?.bitmap.close()
    pair.b?.bitmap.close()
  }
  thumbs.value = new Map()
}
onBeforeUnmount(closeAllThumbs)

function onFilesA(files: File[]) {
  loadHeldFile(files[0]).then(held => { fileA.value = held })
}
function onFilesB(files: File[]) {
  loadHeldFile(files[0]).then(held => { fileB.value = held })
}
async function loadHeldFile(file?: File): Promise<HeldFile | null> {
  if (!file) return null
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: file.name,
    size: file.size,
    type: file.type,
    data: new Uint8Array(await file.arrayBuffer())
  }
}

function reset() {
  fileA.value = null
  fileB.value = null
  comparisons.value = []
  closeAllThumbs()
  thumbsRequested.value = false
  error.value = null
}

const STATUS_STYLE: Record<PageComparison['status'], string> = {
  identical: 'border-slate-200 bg-slate-50 text-slate-600',
  changed: 'border-amber-300 bg-amber-50 text-amber-900',
  added: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  removed: 'border-red-300 bg-red-50 text-red-900'
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <p class="mb-1 text-sm font-medium text-slate-700">{{ t('pdf.compare.documentA') }}</p>
        <ShellFileDropzone v-if="!fileA" accept="application/pdf" :multiple="false" @files="onFilesA($event)" />
        <div v-else class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <p class="truncate font-medium">{{ fileA.name }}</p>
          <button type="button" class="mt-1 text-xs text-sky-700 hover:underline" @click="fileA = null">
            {{ t('pdf.compare.change') }}
          </button>
        </div>
      </div>
      <div>
        <p class="mb-1 text-sm font-medium text-slate-700">{{ t('pdf.compare.documentB') }}</p>
        <ShellFileDropzone v-if="!fileB" accept="application/pdf" :multiple="false" @files="onFilesB($event)" />
        <div v-else class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <p class="truncate font-medium">{{ fileB.name }}</p>
          <button type="button" class="mt-1 text-xs text-sky-700 hover:underline" @click="fileB = null">
            {{ t('pdf.compare.change') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="fileA && fileB" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-sky-700 px-5 py-2.5 font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        @click="run"
      >
        {{ busy ? t('pdf.compare.working') : t('pdf.compare.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        @click="reset"
      >
        {{ t('result.startOver') }}
      </button>
    </div>

    <div v-if="busy && progressTotal" class="space-y-1">
      <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div class="h-full rounded-full bg-sky-600 transition-all" :style="{ width: `${(progress / progressTotal) * 100}%` }" />
      </div>
      <p class="text-xs text-slate-500">{{ t('pdf.compare.progress', { done: progress, total: progressTotal }) }}</p>
    </div>

    <p v-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>

    <div v-if="summary" class="space-y-3">
      <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        {{
          t('pdf.compare.summary', {
            identical: summary.identical,
            changed: summary.changed,
            added: summary.added,
            removed: summary.removed
          })
        }}
      </p>

      <ul class="space-y-2">
        <li v-for="item in comparisons" :key="item.page" class="overflow-hidden rounded-lg border" :class="STATUS_STYLE[item.status]">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium"
            :disabled="item.status !== 'changed'"
            @click="toggle(item.page)"
          >
            <span>{{ t('pdf.compare.page', { n: item.page }) }} — {{ t(`pdf.compare.status.${item.status}`) }}</span>
            <span v-if="item.status === 'changed'" class="text-xs underline">
              {{ expanded.has(item.page) ? t('pdf.compare.hide') : t('pdf.compare.show') }}
            </span>
          </button>

          <div v-if="item.status === 'changed' && expanded.has(item.page)" class="space-y-3 border-t border-current/20 bg-white p-3">
            <div v-if="thumbs.get(item.page)" class="grid grid-cols-2 gap-3">
              <canvas :ref="el => registerThumbCanvas(item.page, 'a', el)" class="w-full rounded border border-slate-200" />
              <canvas :ref="el => registerThumbCanvas(item.page, 'b', el)" class="w-full rounded border border-slate-200" />
            </div>
            <p class="whitespace-pre-wrap wrap-break-word font-mono text-xs leading-relaxed text-slate-800">
              <template v-for="(part, index) in diffWords(item.textA, item.textB)" :key="index">
                <span
                  v-if="part.removed"
                  class="bg-red-100 text-red-800 line-through decoration-red-400"
                >{{ part.value }}</span>
                <span
                  v-else-if="part.added"
                  class="bg-emerald-100 text-emerald-800"
                >{{ part.value }}</span>
                <span v-else>{{ part.value }}</span>
              </template>
            </p>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
