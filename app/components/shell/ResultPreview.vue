<script setup lang="ts">
import { usePdfWorker } from '~/composables/usePdfWorker'
import type { ToolResult } from '~/stores/files'

/**
 * What the result looks like, before it is downloaded.
 *
 * A PDF result gets page thumbnails rendered off the main thread — the first
 * few straight away, the rest on request, so a 200-page merge does not spend
 * a minute rendering pages nobody asked to see. An image result is simply
 * shown.
 *
 * Video and audio get a player, because the alternative is downloading a file
 * to find out whether the cut landed in the right place or the compression
 * went too far — and then doing it again. The browser plays the bytes we
 * already hold, so this costs one object URL and no decoding of our own.
 *
 * Anything else (text, zip, spreadsheets) has no useful picture.
 */
const props = defineProps<{ result: ToolResult }>()

const { t } = useI18n()
const { getThumbnails } = usePdfWorker()

const INITIAL = 8
const MAX = 300

const isPdf = computed(() => props.result.type === 'application/pdf')
const isImage = computed(() => props.result.type.startsWith('image/'))
const isVideo = computed(() => props.result.type.startsWith('video/'))
const isAudio = computed(() => props.result.type.startsWith('audio/'))
const isMedia = computed(() => isVideo.value || isAudio.value)

const pageCount = ref(0)
const shown = ref(0)
const loading = ref(false)
const failed = ref(false)
const imageUrl = ref('')
const mediaUrl = ref('')

/**
 * Set when the browser will not play what we produced.
 *
 * Most results are H.264 in MP4 or MP3, which play everywhere. A few are not:
 * muting keeps the original container, so the result of muting a Matroska file
 * is a Matroska file, and whether that plays depends on the browser. The file
 * is still correct — it simply cannot be previewed here, and saying so is
 * better than leaving a dead player on the page.
 */
const unplayable = ref(false)

interface Thumbnail {
  bitmap: ImageBitmap
  width: number
  height: number
}
const thumbnails = shallowRef(new Map<number, Thumbnail>())
const canvases = new Map<number, HTMLCanvasElement>()

/** Zero-based page open in the lightbox; a thumbnail is a button that sets it. */
const openPage = ref<number | null>(null)

function draw(index: number) {
  const canvas = canvases.get(index)
  const entry = thumbnails.value.get(index)
  if (!canvas || !entry) return
  canvas.width = entry.width
  canvas.height = entry.height
  canvas.getContext('2d')?.drawImage(entry.bitmap, 0, 0)
}

function register(index: number, el: unknown) {
  if (el instanceof HTMLCanvasElement) {
    canvases.set(index, el)
    draw(index)
  } else {
    canvases.delete(index)
  }
}

function clear() {
  for (const entry of thumbnails.value.values()) entry.bitmap.close()
  thumbnails.value = new Map()
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
  if (mediaUrl.value) URL.revokeObjectURL(mediaUrl.value)
  mediaUrl.value = ''
  unplayable.value = false
  pageCount.value = 0
  shown.value = 0
  failed.value = false
  openPage.value = null
}

/** Render pages `from`..`to` (zero-based, exclusive end). */
async function render(from: number, to: number) {
  const pages = Array.from({ length: to - from }, (_unused, i) => from + i + 1)
  if (!pages.length) return
  loading.value = true
  try {
    await getThumbnails(props.result.data, pages, 220, page => {
      thumbnails.value.set(page.page - 1, { bitmap: page.bitmap, width: page.width, height: page.height })
      triggerRef(thumbnails)
      draw(page.page - 1)
    })
    shown.value = Math.max(shown.value, to)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

async function load(result: ToolResult) {
  clear()
  if (isImage.value) {
    imageUrl.value = URL.createObjectURL(new Blob([result.data as BlobPart], { type: result.type }))
    return
  }
  if (isMedia.value) {
    mediaUrl.value = URL.createObjectURL(new Blob([result.data as BlobPart], { type: result.type }))
    return
  }
  if (!isPdf.value) return
  try {
    const info = await readPdfInfo({ id: 'result', name: result.name, size: result.data.byteLength, type: result.type, data: result.data })
    pageCount.value = info.pageCount
    await render(0, Math.min(INITIAL, info.pageCount))
  } catch {
    failed.value = true
  }
}

function showAll() {
  render(shown.value, Math.min(pageCount.value, MAX))
}

watch(() => props.result, load, { immediate: true })
onBeforeUnmount(clear)
</script>

<template>
  <div v-if="isImage || isMedia || (isPdf && !failed && pageCount)" class="mt-4 border-t border-emerald-200 pt-3">
    <div class="flex items-center justify-between gap-2">
      <p class="text-xs font-semibold tracking-wide text-emerald-800 uppercase">
        {{ t('result.preview') }}
        <span v-if="isPdf" class="font-normal normal-case tracking-normal text-emerald-700">
          · {{ t('result.pages', { n: pageCount }) }}
        </span>
      </p>
      <span v-if="loading" class="text-xs text-emerald-700">{{ t('result.rendering') }}</span>
    </div>

    <!-- Check the result before saving it, in the site's own player. -->
    <ShellMediaPlayer
      v-if="isMedia && !unplayable"
      :key="mediaUrl"
      class="mt-2"
      :src="mediaUrl"
      :kind="isVideo ? 'video' : 'audio'"
      :label="result.name"
      @error="unplayable = true"
    />
    <p v-else-if="isMedia" class="mt-2 text-sm text-emerald-800">{{ t('result.cannotPlay') }}</p>

    <button
      v-if="isImage"
      type="button"
      class="mt-2 block cursor-zoom-in rounded-lg focus-visible:ring-2 focus-visible:ring-ember-300 focus-visible:outline-none"
      :aria-label="t('result.openPage', { n: 1 })"
      @click="openPage = 0"
    >
      <img
        :src="imageUrl"
        :alt="result.name"
        class="max-h-80 rounded-lg border border-stone-200 bg-white object-contain"
      />
    </button>

    <template v-else-if="isPdf">
      <div class="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
        <button
          v-for="index in shown"
          :key="index - 1"
          type="button"
          class="relative flex aspect-3/4 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border border-stone-200 bg-white hover:border-ember-400 hover:ring-2 hover:ring-ember-200 focus-visible:ring-2 focus-visible:ring-ember-300 focus-visible:outline-none"
          :aria-label="t('result.openPage', { n: index })"
          @click="openPage = index - 1"
        >
          <canvas :ref="el => register(index - 1, el)" class="max-h-full max-w-full object-contain" />
          <span class="absolute right-1 top-1 rounded bg-white/90 px-1 text-[10px] font-medium text-stone-600">{{ index }}</span>
        </button>
      </div>
      <button
        v-if="shown < Math.min(pageCount, MAX) && !loading"
        type="button"
        class="mt-2 text-sm font-semibold text-ember-700 hover:underline"
        @click="showAll"
      >
        {{ t('result.showAllPages', { n: Math.min(pageCount, MAX) }) }}
      </button>
    </template>

    <ShellLightbox
      v-if="!isMedia"
      :result="result"
      :page-count="isImage ? 1 : pageCount"
      :image-url="isImage ? imageUrl : undefined"
      :page="openPage"
      @update:page="openPage = $event"
    />
  </div>
</template>
