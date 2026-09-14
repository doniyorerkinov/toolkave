<script setup lang="ts">
import { buildIco } from '~~/shared/ico'
import { decodeImage, isSvg, renderSvg, svgToPng } from '~/composables/useImage'
import { useCropFrame } from '~/composables/useCropFrame'
import { zipFiles } from '~/composables/useZip'
import { formatBytes } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * A favicon is not one image.
 *
 * Browsers pick from whatever the file offers — 16 px in a tab, 32 px on a
 * bookmark bar, 180 px on an iPhone home screen — and one large image left
 * to the browser to shrink comes out muddy at the size people actually see.
 * So every size is drawn separately, from the original, at that size.
 */
const { t } = useI18n()
const store = useFilesStore()

/** Inside the .ico, and as separate PNGs alongside it. */
const ICO_SIZES = [16, 32, 48]
const PNG_SIZES = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' }
]

const background = ref<'transparent' | 'white' | 'custom'>('transparent')
const colour = ref('#c2410c')
const padding = ref(0)

const file = computed(() => store.files[0] ?? null)
/** The picture to work from: an SVG is rasterised large first. */
const working = ref<Uint8Array | null>(null)
const ratio = computed<number | null>(() => 1)

const { canvas, source, cursor, load, rect, handlers } = useCropFrame({
  ratio,
  maxWidth: 420,
  maxHeight: 420,
  draw(context, box) {
    const el = context.canvas
    context.fillStyle = 'rgba(28, 25, 23, 0.55)'
    context.beginPath()
    context.rect(0, 0, el.width, el.height)
    context.rect(box.x, box.y + box.height, box.width, -box.height)
    context.fill('evenodd')
    context.strokeStyle = '#ffffff'
    context.lineWidth = 2
    context.strokeRect(box.x, box.y, box.width, box.height)
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#c2410c'
    for (const [cx, cy] of [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x, box.y + box.height],
      [box.x + box.width, box.y + box.height]
    ] as const) {
      context.beginPath()
      context.arc(cx, cy, 5.5, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    }
  }
})

const canRun = computed(() => !!working.value && !!source.value && !store.busy)
const fill = computed(() =>
  background.value === 'transparent' ? null : background.value === 'white' ? '#ffffff' : colour.value
)

/** The live previews beside the canvas, at the sizes that matter. */
const previews = ref<{ size: number; url: string }[]>([])

watch(
  file,
  async current => {
    for (const preview of previews.value) URL.revokeObjectURL(preview.url)
    previews.value = []
    working.value = null
    if (!current) return
    try {
      working.value = isSvg(current.data) ? (await svgToPng(current.data, { width: 1024, height: 1024 })).data : current.data
      await load({ data: working.value })
    } catch {
      store.error = t('image.errorRead')
    }
  },
  { immediate: true }
)

/**
 * Draw one square icon from the chosen area of the source.
 *
 * Every size is drawn from the original rather than from the previous size,
 * so a 16 px icon is a 16 px rendering of the artwork and not a shrunken
 * 512 px one.
 */
async function drawIcon(size: number, transparent: boolean): Promise<Blob> {
  const bitmap = isSvg(file.value!.data)
    ? await renderSvg(file.value!.data, { width: size * 4, height: size * 4 })
    : await decodeImage(working.value!)
  const canvasEl = document.createElement('canvas')
  canvasEl.width = size
  canvasEl.height = size
  const context = canvasEl.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('canvas unavailable')
  }
  const colourFill = transparent ? null : (fill.value ?? '#ffffff')
  if (colourFill) {
    context.fillStyle = colourFill
    context.fillRect(0, 0, size, size)
  }
  const inset = Math.round((size * padding.value) / 100)
  const box = rect()
  const scaleX = isSvg(file.value!.data) ? bitmap.width / source.value!.width : 1
  context.drawImage(
    bitmap,
    box.x * scaleX, box.y * scaleX, box.width * scaleX, box.height * scaleX,
    inset, inset, size - inset * 2, size - inset * 2
  )
  bitmap.close()
  const blob = await new Promise<Blob | null>(resolve => canvasEl.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('encode failed')
  return blob
}

/**
 * Redraw the small previews whenever anything that affects them changes.
 *
 * Several of these can be in flight at once — the frame is set a tick after
 * the picture, and every slider move starts another — so each run carries a
 * token and a run that has been overtaken throws its work away rather than
 * clearing what a newer one has already drawn.
 */
let previewRun = 0

async function refreshPreviews() {
  const mine = ++previewRun
  const box = rect()
  if (!working.value || !source.value || box.width < 1 || box.height < 1) return
  try {
    const made = await Promise.all(
      [16, 32, 180].map(async size => ({
        size,
        url: URL.createObjectURL(await drawIcon(size, background.value === 'transparent' && size !== 180))
      }))
    )
    if (mine !== previewRun) {
      for (const preview of made) URL.revokeObjectURL(preview.url)
      return
    }
    for (const preview of previews.value) URL.revokeObjectURL(preview.url)
    previews.value = made
  } catch {
    if (mine === previewRun) previews.value = []
  }
}

watch([working, source, background, colour, padding], refreshPreviews)
watch(() => rect(), refreshPreviews, { deep: true })

const manifest = computed(() =>
  JSON.stringify(
    {
      icons: [
        { src: '/icon-192.png', type: 'image/png', sizes: '192x192' },
        { src: '/icon-512.png', type: 'image/png', sizes: '512x512' }
      ]
    },
    null,
    2
  )
)

const SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const transparent = background.value === 'transparent'
    const ico = await Promise.all(
      ICO_SIZES.map(async size => ({
        size,
        png: new Uint8Array(await (await drawIcon(size, transparent)).arrayBuffer())
      }))
    )
    const entries = [
      { name: 'favicon.ico', data: buildIco(ico) },
      ...(await Promise.all(
        ICO_SIZES.map(async size => ({
          name: `favicon-${size}x${size}.png`,
          data: new Uint8Array(await (await drawIcon(size, transparent)).arrayBuffer())
        }))
      )),
      ...(await Promise.all(
        PNG_SIZES.map(async entry => ({
          name: entry.name,
          // An iPhone composites a transparent home-screen icon onto black,
          // which is almost never what the artwork was drawn for.
          data: new Uint8Array(
            await (await drawIcon(entry.size, transparent && entry.name !== 'apple-touch-icon.png')).arrayBuffer()
          )
        }))
      )),
      { name: 'site.webmanifest', data: new TextEncoder().encode(manifest.value) },
      { name: 'how-to-use.txt', data: new TextEncoder().encode(`${t('image.favicon.readme')}\n\n${SNIPPET}\n`) }
    ]

    store.setResult({
      name: 'favicon.zip',
      type: 'application/zip',
      data: await zipFiles(entries),
      sourceSize: file.value.size,
      note: t('image.favicon.note', { n: entries.length })
    })
  } catch {
    store.error = t('image.errorGeneric')
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}

onBeforeUnmount(() => {
  for (const preview of previews.value) URL.revokeObjectURL(preview.url)
})
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      v-if="!file"
      accept="image/jpeg,image/png,image/webp,image/svg+xml,.svg"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="source" class="text-sm text-stone-500">
      {{ t('image.dimensions', { w: source.width, h: source.height }) }} · {{ formatBytes(file!.size) }}
    </p>

    <div v-if="file && source" class="space-y-4">
      <div class="flex flex-wrap items-start justify-center gap-6 rounded-xl border border-stone-200 bg-stone-100 p-3">
        <canvas
          ref="canvas"
          class="max-w-full touch-none rounded-sm bg-white shadow-sm select-none"
          :style="{ cursor }"
          v-bind="handlers"
        />
        <div v-if="previews.length" class="flex items-end gap-4 pt-2">
          <div v-for="preview in previews" :key="preview.size" class="text-center">
            <div class="flex h-[72px] items-end justify-center">
              <img
                :src="preview.url"
                :alt="`${preview.size}px`"
                :width="Math.min(preview.size, 72)"
                :height="Math.min(preview.size, 72)"
                class="rounded-sm shadow-sm"
                style="image-rendering: pixelated"
              />
            </div>
            <p class="mt-1 text-xs text-stone-500 tabular-nums">{{ preview.size }} px</p>
          </div>
        </div>
      </div>

      <p class="text-center text-sm text-stone-500">{{ t('image.favicon.frameHint') }}</p>

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">
            {{ t('image.favicon.backgroundLabel') }}
          </legend>
          <div class="flex flex-wrap items-center gap-2">
            <label
              v-for="option in (['transparent', 'white', 'custom'] as const)"
              :key="option"
              class="cursor-pointer rounded-lg border px-3.5 py-2 text-sm font-medium"
              :class="
                background === option
                  ? 'border-ember-500 bg-ember-50 text-ember-900'
                  : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              "
            >
              <input v-model="background" type="radio" :value="option" class="sr-only" />
              {{ t(`image.favicon.background.${option}`) }}
            </label>
            <input
              v-if="background === 'custom'"
              v-model="colour"
              type="color"
              class="h-9 w-12 cursor-pointer rounded border border-stone-300 bg-white"
              :aria-label="t('image.favicon.background.custom')"
            />
          </div>
        </fieldset>

        <div>
          <label for="favicon-padding" class="block text-sm font-medium text-stone-900">
            {{ t('image.favicon.padding', { n: padding }) }}
          </label>
          <input
            id="favicon-padding"
            v-model.number="padding"
            type="range"
            min="0"
            max="25"
            step="1"
            class="mt-2 w-full accent-ember-700"
          />
          <p class="mt-1 text-xs text-stone-500">{{ t('image.favicon.paddingHint') }}</p>
        </div>
      </div>
    </div>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('image.working') : t('image.favicon.action') }}
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

    <details v-if="store.result" class="rounded-xl border border-stone-200 bg-white p-4">
      <summary class="cursor-pointer text-sm font-medium text-stone-900">
        {{ t('image.favicon.snippetLabel') }}
      </summary>
      <pre class="scroll-thin mt-3 overflow-x-auto rounded-lg bg-ink p-3 text-xs text-on-ink"><code>{{ SNIPPET }}</code></pre>
    </details>
  </div>
</template>
