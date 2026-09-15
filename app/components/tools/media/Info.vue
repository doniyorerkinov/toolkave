<script setup lang="ts">
/**
 * What is actually in this file — the page people land on when something will
 * not play.
 *
 * Two levels, because they cost wildly different amounts. The browser already
 * knows the duration and the picture size the moment it has read the header,
 * and that answers most of the question for nothing. The codec, the bitrate
 * and the channel layout only ffmpeg can say, and asking costs the 31 MB
 * download — so that is a second, optional button rather than something the
 * page does on arrival.
 */
import {MEDIA_MAX_SIZE, AUDIO_TYPES, inputName, readProbe, VIDEO_TYPES, type MediaInfo } from '~~/shared/media'
import { formatBytes } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()
const { probe, phase, progress } = useFfmpeg()

const file = computed(() => store.files[0] ?? null)

/** What the browser can tell us for free. */
const native = ref<{ duration: number | null; width: number; height: number; audio: boolean } | null>(null)
/** What ffmpeg can tell us, once somebody asks. */
const deep = ref<MediaInfo | null>(null)

const preview = shallowRef<string | null>(null)
const isVideo = computed(() => (file.value?.type ?? '').startsWith('video/'))

watch(
  file,
  current => {
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = current ? URL.createObjectURL(new Blob([current.data as BlobPart], { type: current.type })) : null
    native.value = null
    deep.value = null
    if (current) void readNatively(current.type)
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  if (preview.value) URL.revokeObjectURL(preview.value)
})

/**
 * Load just the header into an off-screen media element and read what it knows.
 *
 * `preload="metadata"` is the whole trick: the browser fetches enough of the
 * file to answer and stops, so this is instant even on a 2 GB video.
 */
function readNatively(type: string) {
  const url = preview.value
  if (!url) return
  const element = document.createElement(type.startsWith('video/') ? 'video' : 'audio') as HTMLVideoElement
  element.preload = 'metadata'
  element.src = url
  element.onloadedmetadata = () => {
    native.value = {
      duration: Number.isFinite(element.duration) ? element.duration : null,
      width: element.videoWidth || 0,
      height: element.videoHeight || 0,
      // Chrome and Firefox expose these under different names, and neither is
      // standard; absent both, we simply do not claim to know.
      audio: Boolean(
        (element as unknown as { mozHasAudio?: boolean }).mozHasAudio ??
        (element as unknown as { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount
      )
    }
  }
  element.onerror = () => { native.value = null }
}

async function readDeeply() {
  if (!file.value || store.busy) return
  store.busy = true
  store.error = null
  try {
    const lines = await probe({
      name: inputName(file.value.name, isVideo.value ? 'input.mp4' : 'input.mp3'),
      data: file.value.data.slice()
    })
    const info = readProbe(lines)
    if (!info.streams.length) throw new Error('FFMPEG_FAILED')
    deep.value = info
  } catch (error) {
    store.error = error instanceof Error && error.message === 'FFMPEG_FAILED' ? t('media.errorFailed') : t('media.errorGeneric')
  } finally {
    store.busy = false
  }
}

const clock = (seconds: number) => {
  const whole = Math.floor(seconds)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`
}

function onFiles(files: File[]) {
  store.reset()
  store.add(files.slice(0, 1))
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      :max-size="MEDIA_MAX_SIZE"
      v-if="!file"
      :accept="[...VIDEO_TYPES, ...AUDIO_TYPES].join(',')"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <div v-if="file" class="space-y-4">
      <dl class="grid gap-px overflow-hidden rounded-lg border border-stone-300 bg-stone-300 sm:grid-cols-2">
        <div class="bg-white p-3">
          <dt class="text-xs font-medium uppercase tracking-wide text-stone-500">{{ t('media.infoName') }}</dt>
          <dd class="mt-0.5 break-all text-sm text-stone-900">{{ file.name }}</dd>
        </div>
        <div class="bg-white p-3">
          <dt class="text-xs font-medium uppercase tracking-wide text-stone-500">{{ t('media.infoSize') }}</dt>
          <dd class="mt-0.5 text-sm text-stone-900">{{ formatBytes(file.size) }}</dd>
        </div>
        <div class="bg-white p-3">
          <dt class="text-xs font-medium uppercase tracking-wide text-stone-500">{{ t('media.infoType') }}</dt>
          <dd class="mt-0.5 text-sm text-stone-900">{{ file.type || t('media.infoUnknown') }}</dd>
        </div>
        <div class="bg-white p-3">
          <dt class="text-xs font-medium uppercase tracking-wide text-stone-500">{{ t('media.infoDuration') }}</dt>
          <dd class="mt-0.5 text-sm text-stone-900">
            {{ native?.duration ? clock(native.duration) : t('media.infoUnknown') }}
          </dd>
        </div>
        <div v-if="native?.width" class="bg-white p-3">
          <dt class="text-xs font-medium uppercase tracking-wide text-stone-500">{{ t('media.infoResolution') }}</dt>
          <dd class="mt-0.5 text-sm text-stone-900">{{ native.width }} × {{ native.height }}</dd>
        </div>
        <div v-if="native?.width && native?.duration" class="bg-white p-3">
          <dt class="text-xs font-medium uppercase tracking-wide text-stone-500">{{ t('media.infoAverage') }}</dt>
          <dd class="mt-0.5 text-sm text-stone-900">
            {{ Math.round((file.size * 8) / native.duration / 1000).toLocaleString() }} kb/s
          </dd>
        </div>
      </dl>

      <!-- Everything above came free. Everything below costs 31 MB, so it asks. -->
      <div v-if="!deep">
        <p class="text-sm text-stone-600">{{ t('media.infoDeepHint') }}</p>
        <ToolsMediaProgress :phase="phase" :progress="progress" />
        <button
          type="button"
          class="mt-3 rounded-lg bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-700 disabled:opacity-50"
          :disabled="store.busy"
          @click="readDeeply"
        >
          {{ t('media.action.probe') }}
        </button>
      </div>

      <div v-else class="space-y-3">
        <div class="overflow-x-auto rounded-lg border border-stone-300">
          <table class="w-full text-left text-sm">
            <thead class="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th scope="col" class="px-3 py-2 font-medium">{{ t('media.infoStream') }}</th>
                <th scope="col" class="px-3 py-2 font-medium">{{ t('media.infoCodec') }}</th>
                <th scope="col" class="px-3 py-2 font-medium">{{ t('media.infoDetails') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-200">
              <tr v-for="(streamInfo, index) in deep.streams" :key="index">
                <td class="px-3 py-2 align-top font-medium text-stone-900">{{ t(`media.stream.${streamInfo.kind}`) }}</td>
                <td class="px-3 py-2 align-top text-stone-900">{{ streamInfo.codec }}</td>
                <td class="px-3 py-2 align-top text-stone-600">
                  <span v-if="streamInfo.size">{{ streamInfo.size }}</span>
                  <span v-if="streamInfo.fps"> · {{ streamInfo.fps }} fps</span>
                  <span v-if="streamInfo.sampleRate"> · {{ (streamInfo.sampleRate / 1000).toFixed(1) }} kHz</span>
                  <span v-if="streamInfo.channels"> · {{ streamInfo.channels }}</span>
                  <span v-if="streamInfo.bitrate"> · {{ streamInfo.bitrate }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="deep.container" class="text-sm text-stone-600">
          {{ t('media.infoContainer', { name: deep.container }) }}
        </p>
      </div>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>
  </div>
</template>
