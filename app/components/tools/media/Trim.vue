<script setup lang="ts">
/**
 * Cut a piece out of a video or an audio file.
 *
 * The times are typed rather than dragged on a waveform: drawing a waveform
 * means decoding the whole file before the user has chosen anything, which on
 * a phone with a 200 MB video is the slowest possible way to start. A
 * `<video>` or `<audio>` element plays the file natively for free, so the
 * preview is the browser's own player with "use current time" buttons beside
 * the fields.
 */
import { AUDIO_TYPES, inputName, trimArgs, VIDEO_TYPES } from '~~/shared/media'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const props = defineProps<{ kind: 'video' | 'audio' }>()

const { t } = useI18n()
const store = useFilesStore()
const { run, phase, progress } = useFfmpeg()

const start = ref(0)
const end = ref(10)
const accurate = ref(true)
const duration = ref(0)
const player = ref<HTMLMediaElement | null>(null)

const file = computed(() => store.files[0] ?? null)
const canRun = computed(() => !!file.value && !store.busy && end.value > start.value)

/**
 * A blob URL for the native player, revoked when the file changes: without
 * that, opening five videos in a row holds five of them in memory.
 */
const preview = shallowRef<string | null>(null)
watch(
  file,
  current => {
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = current ? URL.createObjectURL(new Blob([current.data as BlobPart], { type: current.type })) : null
    start.value = 0
    end.value = 10
    duration.value = 0
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  if (preview.value) URL.revokeObjectURL(preview.value)
})

function onLoaded() {
  const length = player.value?.duration
  if (!length || !Number.isFinite(length)) return
  duration.value = length
  end.value = Math.min(length, 10)
}

const useCurrent = (which: 'start' | 'end') => {
  const at = player.value?.currentTime
  if (at === undefined) return
  if (which === 'start') start.value = Math.min(at, end.value - 0.1)
  else end.value = Math.max(at, start.value + 0.1)
}

const outputName = computed(() =>
  withSuffix(file.value?.name ?? 'clip', '-clip', props.kind === 'video' ? 'mp4' : 'mp3')
)

async function go() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await run({
      input: { name: inputName(file.value.name, props.kind === 'video' ? 'input.mp4' : 'input.mp3'), data: file.value.data },
      output: outputName.value,
      args: trimArgs({ start: start.value, end: end.value, accurate: accurate.value, audioOnly: props.kind === 'audio' })
    })
    store.setResult({
      name: outputName.value,
      type: props.kind === 'video' ? 'video/mp4' : 'audio/mpeg',
      data,
      sourceSize: file.value.size
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
    <ShellFileDropzone
      v-if="!file"
      :accept="(kind === 'video' ? VIDEO_TYPES : AUDIO_TYPES).join(',')"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <div v-if="file && preview" class="space-y-4">
      <p class="text-sm text-stone-500">{{ formatBytes(file.size) }}</p>

      <video
        v-if="kind === 'video'"
        ref="player"
        :src="preview"
        controls
        class="max-h-80 w-full rounded-lg bg-ink"
        @loadedmetadata="onLoaded"
      />
      <audio v-else ref="player" :src="preview" controls class="w-full" @loadedmetadata="onLoaded" />

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="trim-start" class="block text-sm font-medium text-stone-900">{{ t('media.start') }}</label>
          <div class="mt-2 flex items-center gap-2">
            <input
              id="trim-start"
              v-model.number="start"
              type="number"
              min="0"
              step="0.1"
              :max="duration || undefined"
              class="w-28 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              @click="useCurrent('start')"
            >
              {{ t('media.useCurrent') }}
            </button>
          </div>
        </div>
        <div>
          <label for="trim-end" class="block text-sm font-medium text-stone-900">{{ t('media.end') }}</label>
          <div class="mt-2 flex items-center gap-2">
            <input
              id="trim-end"
              v-model.number="end"
              type="number"
              min="0"
              step="0.1"
              :max="duration || undefined"
              class="w-28 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              @click="useCurrent('end')"
            >
              {{ t('media.useCurrent') }}
            </button>
          </div>
        </div>
      </div>

      <label v-if="kind === 'video'" class="flex items-start gap-2 text-sm text-stone-700">
        <input v-model="accurate" type="checkbox" class="mt-0.5 accent-ember-700" />
        <span>{{ t('media.accurate') }}</span>
      </label>

      <ToolsMediaProgress :phase="phase" :progress="progress" />

      <button
        type="button"
        class="rounded-lg bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-700 disabled:opacity-50"
        :disabled="!canRun"
        @click="go"
      >
        {{ t('media.action.trim') }}
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
