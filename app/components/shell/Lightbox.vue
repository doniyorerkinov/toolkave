<script setup lang="ts">
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { usePdfWorker } from '~/composables/usePdfWorker'
import type { ToolResult } from '~/stores/files'

/**
 * A page of the result, big enough to read.
 *
 * Thumbnails prove the page count; they cannot prove that a footer says the
 * right thing. This renders the chosen page at screen resolution off the
 * main thread and shows it in an overlay — fit to the screen, one tap to
 * enlarge and pan. Rendered pages are kept while the overlay is open, so
 * paging back is instant.
 */
const props = defineProps<{
  result: ToolResult
  pageCount: number
  /** Zero-based page shown; null while closed. */
  page: number | null
  /** An image result is shown from its object URL instead of being rendered. */
  imageUrl?: string
}>()
const emit = defineEmits<{ 'update:page': [page: number | null] }>()

const { t } = useI18n()
const { getThumbnails } = usePdfWorker()

interface Rendered {
  bitmap: ImageBitmap
  width: number
  height: number
}
const cache = new Map<number, Rendered>()
const canvas = ref<HTMLCanvasElement | null>(null)
const closeButton = ref<HTMLElement | null>(null)
const rendering = ref(false)
const zoomed = ref(false)
/** CSS width of the page when enlarged: its bitmap at one device pixel each. */
const zoomWidth = ref(0)

const open = computed(() => props.page !== null)
const hasPrev = computed(() => props.page !== null && props.page > 0)
const hasNext = computed(() => props.page !== null && props.page < props.pageCount - 1)

/**
 * Rendered 1.5× the screen's long side so the enlarged view still has real
 * pixels, capped where mobile canvases start to fail. A phone at 3× gets
 * the cap; a desktop at 1× gets about 2900 px for a portrait page; a
 * hidden or zero-sized viewport still gets a readable page.
 */
function renderSize() {
  const dpr = window.devicePixelRatio || 1
  const screen = Math.max(window.innerWidth, window.innerHeight) * dpr * 1.5
  return Math.min(3200, Math.max(1200, Math.round(screen)))
}

function paint(index: number) {
  const entry = cache.get(index)
  const el = canvas.value
  if (!entry || !el) return
  el.width = entry.width
  el.height = entry.height
  el.getContext('2d')?.drawImage(entry.bitmap, 0, 0)
  zoomWidth.value = Math.round(entry.width / (window.devicePixelRatio || 1))
}

let token = 0

async function render(index: number): Promise<void> {
  if (cache.has(index) || props.imageUrl) return
  await getThumbnails(props.result.data, [index + 1], renderSize(), page => {
    cache.set(index, { bitmap: page.bitmap, width: page.width, height: page.height })
  })
}

async function show(index: number) {
  const mine = ++token
  rendering.value = !cache.has(index)
  try {
    await render(index)
  } catch {
    // Left blank: the thumbnails already showed the page rendered fine.
  }
  if (mine !== token) return
  rendering.value = false
  await nextTick()
  paint(index)
  // The neighbour is rendered while the reader looks at this one.
  if (index + 1 < props.pageCount) render(index + 1).catch(() => {})
}

function clearCache() {
  for (const entry of cache.values()) entry.bitmap.close()
  cache.clear()
}

function close() {
  emit('update:page', null)
}
function go(delta: number) {
  if (props.page === null) return
  const next = props.page + delta
  if (next >= 0 && next < props.pageCount) emit('update:page', next)
}

let previouslyFocused: HTMLElement | null = null

watch(
  () => props.page,
  async (page, previous) => {
    if (page === null) {
      if (previous !== null && previous !== undefined) {
        document.documentElement.style.overflow = ''
        previouslyFocused?.focus()
        previouslyFocused = null
      }
      return
    }
    if (previous === null || previous === undefined) {
      previouslyFocused = document.activeElement as HTMLElement | null
      document.documentElement.style.overflow = 'hidden'
      zoomed.value = false
      await nextTick()
      closeButton.value?.focus()
    }
    show(page)
  },
  { immediate: true }
)

watch(() => props.result, clearCache)

function onKeydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    go(-1)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    go(1)
  }
}

let touchX: number | null = null
function onTouchStart(event: TouchEvent) {
  touchX = zoomed.value ? null : (event.touches[0]?.clientX ?? null)
}
function onTouchEnd(event: TouchEvent) {
  if (touchX === null) return
  const dx = (event.changedTouches[0]?.clientX ?? touchX) - touchX
  touchX = null
  if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (open.value) document.documentElement.style.overflow = ''
  clearCache()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      role="dialog"
      aria-modal="true"
      :aria-label="t('result.preview')"
      class="fixed inset-0 z-50 flex flex-col bg-stone-950/95 text-white"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <div class="flex items-center justify-between gap-3 px-3 py-2 sm:px-4">
        <p class="min-w-0 truncate text-sm text-stone-300">
          <span class="font-medium text-white">{{ result.name }}</span>
          <span v-if="pageCount > 1" class="ml-2 tabular-nums">
            {{ t('result.pageOf', { n: (page ?? 0) + 1, total: pageCount }) }}
          </span>
        </p>
        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="rounded-lg p-2 text-stone-300 hover:bg-white/10 hover:text-white"
            :aria-label="zoomed ? t('result.zoomOut') : t('result.zoomIn')"
            :title="zoomed ? t('result.zoomOut') : t('result.zoomIn')"
            @click="zoomed = !zoomed"
          >
            <ZoomOut v-if="zoomed" :size="22" aria-hidden="true" />
            <ZoomIn v-else :size="22" aria-hidden="true" />
          </button>
          <button
            ref="closeButton"
            type="button"
            class="rounded-lg p-2 text-stone-300 hover:bg-white/10 hover:text-white"
            :aria-label="t('result.close')"
            :title="t('result.close')"
            @click="close"
          >
            <X :size="22" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        class="scroll-thin relative flex min-h-0 flex-1 overflow-auto p-2 sm:p-4"
        :class="zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'"
        @click.self="close"
      >
        <img
          v-if="imageUrl"
          :src="imageUrl"
          :alt="result.name"
          class="m-auto rounded-sm bg-white shadow-2xl"
          :class="zoomed ? 'max-w-none' : 'max-h-full max-w-full object-contain'"
          :style="zoomed ? 'width: 200%' : ''"
          @click="zoomed = !zoomed"
        />
        <canvas
          v-else
          ref="canvas"
          class="m-auto rounded-sm bg-white shadow-2xl"
          :class="[zoomed ? 'max-w-none' : 'max-h-full max-w-full object-contain', rendering ? 'invisible' : '']"
          :style="zoomed && zoomWidth ? `width: ${zoomWidth}px; height: auto` : 'width: auto; height: auto'"
          @click="zoomed = !zoomed"
        />
        <p v-if="rendering" class="absolute inset-0 flex items-center justify-center text-sm text-stone-300">
          {{ t('result.rendering') }}
        </p>
      </div>

      <template v-if="pageCount > 1">
        <button
          type="button"
          :disabled="!hasPrev"
          class="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-white hover:bg-black/70 disabled:opacity-30 sm:left-4"
          :aria-label="t('result.prevPage')"
          @click="go(-1)"
        >
          <ChevronLeft :size="24" aria-hidden="true" />
        </button>
        <button
          type="button"
          :disabled="!hasNext"
          class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-white hover:bg-black/70 disabled:opacity-30 sm:right-4"
          :aria-label="t('result.nextPage')"
          @click="go(1)"
        >
          <ChevronRight :size="24" aria-hidden="true" />
        </button>
      </template>
    </div>
  </Teleport>
</template>
