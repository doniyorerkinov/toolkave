<script setup lang="ts">
/**
 * A logo, or a line of text, burned into a video.
 *
 * Two things make this less work than it looks. The mark is positioned in
 * percentages of the video's width, so the same numbers drive a live CSS
 * preview over the player and the ffmpeg overlay - what you arrange is what
 * gets encoded, with no second guess about where it landed.
 *
 * And text is drawn to a PNG here rather than by ffmpeg. `drawtext` needs a
 * font file compiled into the core, which would mean shipping a typeface and
 * still offering only that one; a canvas uses the fonts already on the device
 * and hands ffmpeg the same kind of image a logo upload does. One overlay
 * path, two ways of filling it.
 */
import { inputName, MEDIA_MAX_SIZE, VIDEO_TYPES, watermarkArgs, WATERMARK_POSITIONS, type WatermarkPosition } from '~~/shared/media'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()
const { run, phase, progress } = useFfmpeg()

const mode = ref<'logo' | 'text'>('logo')
const position = ref<WatermarkPosition>('bottom-right')
/** Mark width and edge gap, both as a percentage of the video's width. */
const size = ref(18)
const margin = ref(4)
const opacity = ref(70)

const text = ref('')
const textColour = ref('#ffffff')

const file = computed(() => store.files[0] ?? null)
const video = ref({ width: 0, height: 0 })

/** The uploaded logo, kept out of the store: it is not the file being worked on. */
const logo = shallowRef<{ name: string; data: Uint8Array; url: string } | null>(null)
onBeforeUnmount(() => {
  if (logo.value) URL.revokeObjectURL(logo.value.url)
  if (markPng.value) URL.revokeObjectURL(markPng.value.url)
  if (preview.value) URL.revokeObjectURL(preview.value)
  if (markTimer) clearTimeout(markTimer)
})

function onLogo(files: File[]) {
  const picked = files[0]
  if (!picked) return
  void picked.arrayBuffer().then(buffer => {
    if (logo.value) URL.revokeObjectURL(logo.value.url)
    const data = new Uint8Array(buffer)
    logo.value = { name: picked.name, data, url: URL.createObjectURL(new Blob([data as BlobPart], { type: picked.type })) }
  })
}

/**
 * The mark as a picture, whichever way it was made.
 *
 * Text is rendered to the same PNG the encode will use rather than drawn as
 * styled HTML, so the preview cannot flatter the result: what is on screen is
 * the file. Regenerated when anything that changes the drawing changes.
 */
const markPng = shallowRef<{ data: Uint8Array; url: string } | null>(null)
let markTimer: ReturnType<typeof setTimeout> | null = null

async function renderText() {
  if (mode.value !== 'text' || !text.value.trim() || !video.value.width) {
    if (markPng.value) URL.revokeObjectURL(markPng.value.url)
    markPng.value = null
    return
  }
  const data = await textToPng()
  if (markPng.value) URL.revokeObjectURL(markPng.value.url)
  markPng.value = { data, url: URL.createObjectURL(new Blob([data as BlobPart], { type: 'image/png' })) }
}

watch([mode, text, textColour, size, () => video.value.width], () => {
  if (markTimer) clearTimeout(markTimer)
  markTimer = setTimeout(() => void renderText(), 150)
})

const markUrl = computed(() => (mode.value === 'logo' ? logo.value?.url : markPng.value?.url) ?? null)

const preview = shallowRef<string | null>(null)
watch(
  file,
  current => {
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = current ? URL.createObjectURL(new Blob([current.data as BlobPart], { type: current.type })) : null
    video.value = { width: 0, height: 0 }
  },
  { immediate: true }
)

/**
 * The text, as a transparent PNG at the size it will be drawn.
 *
 * Rendered at the video's own resolution rather than the preview's, so the
 * letters are as sharp as the footage allows however small the player is.
 */
async function textToPng(): Promise<Uint8Array> {
  const width = Math.max(2, Math.round((video.value.width * size.value) / 100))
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) throw new Error('canvas unavailable')

  // Find the font size whose rendered width matches the width asked for.
  probe.font = '100px sans-serif'
  const at100 = probe.measureText(text.value).width || 1
  const fontSize = Math.max(8, Math.round((width / at100) * 100))

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas unavailable')
  context.font = `bold ${fontSize}px sans-serif`
  const measured = context.measureText(text.value)
  const height = Math.ceil(fontSize * 1.35)
  canvas.width = Math.max(2, Math.ceil(measured.width) + Math.ceil(fontSize * 0.3))
  canvas.height = height

  const draw = canvas.getContext('2d')
  if (!draw) throw new Error('canvas unavailable')
  draw.font = `bold ${fontSize}px sans-serif`
  draw.textBaseline = 'middle'
  // A dark edge, so white text stays readable over a white sky.
  draw.lineWidth = Math.max(1, fontSize * 0.06)
  draw.strokeStyle = 'rgba(0,0,0,0.55)'
  draw.strokeText(text.value, fontSize * 0.15, height / 2)
  draw.fillStyle = textColour.value
  draw.fillText(text.value, fontSize * 0.15, height / 2)

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('encode failed')
  return new Uint8Array(await blob.arrayBuffer())
}

const ready = computed(() => {
  if (!file.value || store.busy || !video.value.width) return false
  return mode.value === 'logo' ? !!logo.value : text.value.trim().length > 0
})

const outputName = computed(() => withSuffix(file.value?.name ?? 'video', '-watermarked', 'mp4'))

async function go() {
  if (!ready.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    if (mode.value === 'text') await renderText()
    const mark = mode.value === 'text'
      ? { name: 'mark.png', data: (markPng.value?.data ?? new Uint8Array()).slice() }
      : { name: inputName(logo.value!.name, 'mark.png').replace(/^input\./, 'mark.'), data: logo.value!.data.slice() }

    const data = await run({
      inputs: [{ name: inputName(file.value.name), data: file.value.data }, mark],
      output: outputName.value,
      args: watermarkArgs({
        logoWidth: (video.value.width * size.value) / 100,
        margin: (video.value.width * margin.value) / 100,
        position: position.value,
        opacity: opacity.value / 100
      })
    })
    store.setResult({ name: outputName.value, type: 'video/mp4', data, sourceSize: file.value.size })
  } catch (error) {
    store.error = error instanceof Error && error.message === 'FFMPEG_FAILED' ? t('media.errorFailed') : t('media.errorGeneric')
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}

/** The same numbers the encode uses, as CSS, so the preview cannot disagree. */
const markStyle = computed(() => {
  const gap = `${margin.value}%`
  const base: Record<string, string> = { position: 'absolute', width: `${size.value}%`, opacity: String(opacity.value / 100) }
  if (position.value === 'centre') return { ...base, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  // A percentage of height in CSS, but computed from the width, so it matches
  // the single pixel margin handed to overlay.
  const ratio = video.value.height ? video.value.width / video.value.height : 1
  const vertical = `${(margin.value * ratio).toFixed(2)}%`
  if (position.value.startsWith('top')) base.top = vertical
  else base.bottom = vertical
  if (position.value.endsWith('left')) base.left = gap
  else base.right = gap
  return base
})
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      v-if="!file"
      :accept="VIDEO_TYPES.join(',')"
      :max-size="MEDIA_MAX_SIZE"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="file" class="text-sm text-stone-500">{{ formatBytes(file.size) }}</p>

    <div v-if="file" class="space-y-4">
      <!-- The mark sits over the picture in the same percentages the encode
           uses, so arranging it here is arranging it in the output. -->
      <ShellMediaPlayer
        v-if="preview"
        :src="preview"
        kind="video"
        :label="file.name"
        @meta="video = { width: $event.width, height: $event.height }"
      >
        <template #over>
          <!--
            The player's box is not the picture. A 4:3 clip inside a wide frame
            is letterboxed by object-fit, so an overlay on the element would sit
            over the black bars and lie about where the mark lands. This inner
            box is given the video's own aspect ratio and centred under the same
            rules object-fit uses, which makes it exactly the picture - and
            percentages inside it are percentages of the real frame.
          -->
          <div class="flex h-full w-full items-center justify-center">
            <div
              class="relative max-h-full max-w-full"
              :style="{ aspectRatio: video.width && video.height ? `${video.width} / ${video.height}` : undefined, height: '100%' }"
            >
              <img v-if="markUrl" :src="markUrl" :style="markStyle" alt="" />
            </div>
          </div>
        </template>
      </ShellMediaPlayer>

      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('media.markLabel') }}</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in (['logo', 'text'] as const)"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="mode === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'"
          >
            <input v-model="mode" type="radio" :value="option" class="sr-only" />
            {{ t(`media.mark.${option}`) }}
          </label>
        </div>
      </fieldset>

      <div v-if="mode === 'logo'">
        <ShellFileDropzone
          v-if="!logo"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          :multiple="false"
          @files="onLogo($event)"
        />
        <div v-else class="flex items-center gap-3 rounded-lg border border-stone-300 bg-white p-3">
          <img :src="logo.url" alt="" class="h-10 w-10 object-contain" />
          <span class="min-w-0 flex-1 truncate text-sm text-stone-700">{{ logo.name }}</span>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-sm font-medium text-stone-500 hover:bg-ember-100 hover:text-ember-800"
            @click="logo = null"
          >
            {{ t('media.markReplace') }}
          </button>
        </div>
        <p class="mt-2 text-sm text-stone-600">{{ t('media.markLogoNote') }}</p>
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label for="mark-text" class="block text-sm font-medium text-stone-900">{{ t('media.markTextLabel') }}</label>
          <input
            id="mark-text"
            v-model="text"
            type="text"
            maxlength="60"
            :placeholder="t('media.markTextPlaceholder')"
            class="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-ember-400 focus:ring-2 focus:ring-ember-200 focus:outline-none"
          />
        </div>
        <div>
          <label for="mark-colour" class="block text-sm font-medium text-stone-900">{{ t('media.colourLabel') }}</label>
          <input id="mark-colour" v-model="textColour" type="color" class="mt-2 h-9 w-14 cursor-pointer rounded border border-stone-300 bg-white" />
        </div>
      </div>

      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('media.markPosition') }}</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in WATERMARK_POSITIONS"
            :key="option"
            class="cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium"
            :class="position === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'"
          >
            <input v-model="position" type="radio" :value="option" class="sr-only" />
            {{ t(`media.position.${option}`) }}
          </label>
        </div>
      </fieldset>

      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <label for="mark-size" class="block text-sm font-medium text-stone-900">{{ t('media.markSize', { n: size }) }}</label>
          <input id="mark-size" v-model.number="size" type="range" min="3" max="60" class="mt-2 w-full accent-ember-700" />
        </div>
        <div>
          <label for="mark-opacity" class="block text-sm font-medium text-stone-900">{{ t('media.markOpacity', { n: opacity }) }}</label>
          <input id="mark-opacity" v-model.number="opacity" type="range" min="10" max="100" class="mt-2 w-full accent-ember-700" />
        </div>
        <div v-if="position !== 'centre'">
          <label for="mark-margin" class="block text-sm font-medium text-stone-900">{{ t('media.markMargin', { n: margin }) }}</label>
          <input id="mark-margin" v-model.number="margin" type="range" min="0" max="20" class="mt-2 w-full accent-ember-700" />
        </div>
      </div>

      <ToolsMediaProgress :phase="phase" :progress="progress" />

      <button
        type="button"
        class="rounded-lg bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-700 disabled:opacity-50"
        :disabled="!ready"
        @click="go"
      >
        {{ t('media.action.watermark') }}
      </button>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard v-if="store.result" :result="store.result" @reset="store.reset()" @chain="store.chainResult()" />
  </div>
</template>
