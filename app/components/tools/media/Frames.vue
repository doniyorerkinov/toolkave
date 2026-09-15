<script setup lang="ts">
/**
 * Still images out of a video: a thumbnail, or a contact sheet of the whole
 * thing.
 *
 * The output is a zip, because the answer is nearly always more than one file
 * and a browser cannot hand over a folder. The frame cap is the important
 * control: `fps=25` on a ten-minute lecture is fifteen thousand PNGs, which
 * fills memory long before it finishes and produces something nobody wanted.
 */
import { MEDIA_MAX_SIZE, framesArgs, framesSpan, inputName, VIDEO_TYPES } from '~~/shared/media'
import { convertImage } from '~/composables/useImage'
import { zipFiles } from '~/composables/useZip'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()
const { runMany, phase, progress } = useFfmpeg()

/** Seconds between frames, which is the way round people think about it. */
const every = ref(1)
const width = ref(1280)
const limit = ref(60)
const format = ref<'jpg' | 'png'>('jpg')

const file = computed(() => store.files[0] ?? null)
const canRun = computed(() => !!file.value && !store.busy)

const outputName = computed(() => withSuffix(file.value?.name ?? 'video', '-frames', 'zip'))

/** How many frames this will actually produce, so the cap is not a surprise. */
const duration = ref(0)
const expected = computed(() => {
  if (!duration.value) return null
  return Math.min(limit.value, Math.max(1, Math.floor(duration.value / every.value)))
})
const capped = computed(() => expected.value !== null && expected.value === limit.value)

const preview = shallowRef<string | null>(null)
watch(
  file,
  current => {
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = current ? URL.createObjectURL(new Blob([current.data as BlobPart], { type: current.type })) : null
    duration.value = 0
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  if (preview.value) URL.revokeObjectURL(preview.value)
})


async function go() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const fps = 1 / every.value
    const span = framesSpan({ fps, limit: limit.value })
    // ffmpeg always hands back PNG; its JPEG encoder crashes this wasm core
    // on some sources (see framesArgs). JPG, when asked for, is made here by
    // the browser's own encoder, which is fast and does not take the engine
    // down with it.
    const frames = await runMany({
      input: { name: inputName(file.value.name), data: file.value.data },
      output: 'frame-%04d.png',
      // Read only as much of the file as the cap can use; see framesSpan.
      beforeInput: ['-t', String(span)],
      span,
      args: framesArgs({ fps, width: width.value, limit: limit.value })
    })

    const images: { name: string; data: Uint8Array }[] = []
    for (const frame of frames) {
      if (format.value === 'png') {
        images.push(frame)
        continue
      }
      // One at a time: sixty decoded bitmaps held at once is the kind of thing
      // that ends a phone tab.
      const held = { id: frame.name, name: frame.name, size: frame.data.byteLength, type: 'image/png', data: frame.data }
      const jpeg = await convertImage(held, 'jpeg', 0.9)
      images.push({ name: frame.name.replace(/\.png$/, '.jpg'), data: jpeg.data })
    }

    store.setResult({
      name: outputName.value,
      type: 'application/zip',
      data: await zipFiles(images),
      sourceSize: file.value.size,
      note: t('media.framesNote', { n: images.length })
    })
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
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone :max-size="MEDIA_MAX_SIZE" v-if="!file" :accept="VIDEO_TYPES.join(',')" :multiple="false" @files="onFiles($event)" />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="file" class="text-sm text-stone-500">{{ formatBytes(file.size) }}</p>

    <div v-if="file" class="space-y-4">
      <ShellMediaPlayer
        v-if="preview"
        :src="preview"
        kind="video"
        :label="file.name"
        @loaded="duration = $event"
      />

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="every" class="block text-sm font-medium text-stone-900">{{ t('media.everyLabel', { n: every }) }}</label>
          <input id="every" v-model.number="every" type="range" min="0.5" max="30" step="0.5" class="mt-2 w-full accent-ember-700" />
        </div>
        <div>
          <label for="limit" class="block text-sm font-medium text-stone-900">{{ t('media.limitLabel', { n: limit }) }}</label>
          <input id="limit" v-model.number="limit" type="range" min="1" max="300" step="1" class="mt-2 w-full accent-ember-700" />
        </div>
        <div>
          <label for="frame-width" class="block text-sm font-medium text-stone-900">{{ t('media.width', { n: width }) }}</label>
          <input id="frame-width" v-model.number="width" type="range" min="320" max="1920" step="80" class="mt-2 w-full accent-ember-700" />
        </div>
        <div>
          <label for="frame-format" class="block text-sm font-medium text-stone-900">{{ t('media.formatLabel') }}</label>
          <ShellSelect
            id="frame-format"
            v-model="format"
            class="mt-2"
            :options="[{ value: 'jpg', label: t('media.frameJpg') }, { value: 'png', label: t('media.framePng') }]"
          />
        </div>
      </div>

      <p v-if="expected" class="text-sm text-stone-600">
        {{ t('media.framesExpected', { n: expected }) }}
        <span v-if="capped" class="text-stone-500">· {{ t('media.framesCapped') }}</span>
      </p>

      <ToolsMediaProgress :phase="phase" :progress="progress" />

      <button
        type="button"
        class="rounded-lg bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-700 disabled:opacity-50"
        :disabled="!canRun"
        @click="go"
      >
        {{ t('media.action.frames') }}
      </button>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard v-if="store.result" :result="store.result" @reset="store.reset()" @chain="store.chainResult()" />
  </div>
</template>
