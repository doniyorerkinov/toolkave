<script setup lang="ts">
/**
 * Three edits to an audio file: make it smaller, take the dead air out, and
 * ease it in and out instead of starting flat.
 *
 * All three need the file's duration, and none of them should pay for it. The
 * browser's own `<audio>` element reports it as soon as it has read the
 * header, long before anything is decoded — so the element that lets somebody
 * listen to what they are about to edit is also where the fade-out learns
 * where the end is.
 */
import {
  MEDIA_MAX_SIZE,
  AUDIO_BITRATES,
  AUDIO_TYPES,
  compressAudioArgs,
  fadeArgs,
  inputName,
  silenceArgs,
  type AudioBitrate,
  type SilenceMode
} from '~~/shared/media'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const props = defineProps<{ mode: 'compress' | 'silence' | 'fade' }>()

const { t } = useI18n()
const store = useFilesStore()
const { run, phase, progress } = useFfmpeg()

const bitrate = ref<AudioBitrate>('128k')
const mono = ref(true)
const silenceMode = ref<SilenceMode>('ends')
const threshold = ref(-50)
const keep = ref(0.5)
const fadeIn = ref(2)
const fadeOut = ref(3)

const duration = ref(0)
const player = ref<HTMLMediaElement | null>(null)

const file = computed(() => store.files[0] ?? null)
const canRun = computed(() => !!file.value && !store.busy)

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

function onLoaded() {
  const length = player.value?.duration
  if (!length || !Number.isFinite(length)) return
  duration.value = length
  // A three-second fade on a two-second clip is not a fade; keep the defaults
  // proportionate to what was actually loaded.
  fadeIn.value = Math.min(fadeIn.value, Math.floor(length / 4))
  fadeOut.value = Math.min(fadeOut.value, Math.floor(length / 4))
}

const SUFFIX = { compress: '-small', silence: '-tightened', fade: '-faded' } as const
const outputName = computed(() => withSuffix(file.value?.name ?? 'audio', SUFFIX[props.mode], 'mp3'))

function args(): string[] {
  if (props.mode === 'compress') return compressAudioArgs({ bitrate: bitrate.value, mono: mono.value })
  if (props.mode === 'silence') return silenceArgs({ mode: silenceMode.value, threshold: threshold.value, keep: keep.value })
  return fadeArgs({ fadeIn: fadeIn.value, fadeOut: fadeOut.value, duration: duration.value })
}

async function go() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await run({
      input: { name: inputName(file.value.name, 'input.mp3'), data: file.value.data },
      output: outputName.value,
      args: args()
    })
    store.setResult({
      name: outputName.value,
      type: 'audio/mpeg',
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
      :max-size="MEDIA_MAX_SIZE"
      v-if="!file"
      :accept="AUDIO_TYPES.join(',') + ',.opus,.oga'"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="file" class="text-sm text-stone-500">{{ formatBytes(file.size) }}</p>

    <div v-if="file" class="space-y-4">
      <audio
        v-if="preview"
        ref="player"
        :src="preview"
        class="w-full"
        controls
        preload="metadata"
        @loadedmetadata="onLoaded"
      />

      <fieldset v-if="mode === 'compress'">
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('media.bitrateLabel') }}</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in AUDIO_BITRATES"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="bitrate === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'"
          >
            <input v-model="bitrate" type="radio" :value="option" class="sr-only" />
            {{ option.replace('k', ' kbps') }}
          </label>
        </div>
        <label class="mt-3 flex items-start gap-2 text-sm text-stone-700">
          <input v-model="mono" type="checkbox" class="mt-0.5 accent-ember-700" />
          <span>{{ t('media.monoNote') }}</span>
        </label>
      </fieldset>

      <div v-if="mode === 'silence'" class="space-y-4">
        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('media.silenceLabel') }}</legend>
          <div class="space-y-2">
            <label
              v-for="option in (['ends', 'all'] as SilenceMode[])"
              :key="option"
              class="flex cursor-pointer items-start gap-2 text-sm text-stone-700"
            >
              <input v-model="silenceMode" type="radio" :value="option" class="mt-0.5 accent-ember-700" />
              <span>{{ t(`media.silence.${option}`) }}</span>
            </label>
          </div>
        </fieldset>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="threshold" class="block text-sm font-medium text-stone-900">
              {{ t('media.thresholdLabel', { n: threshold }) }}
            </label>
            <input id="threshold" v-model.number="threshold" type="range" min="-70" max="-20" step="5" class="mt-2 w-full accent-ember-700" />
            <p class="mt-1 text-xs text-stone-600">{{ t('media.thresholdNote') }}</p>
          </div>
          <div v-if="silenceMode === 'all'">
            <label for="keep" class="block text-sm font-medium text-stone-900">
              {{ t('media.keepLabel', { n: keep.toFixed(1) }) }}
            </label>
            <input id="keep" v-model.number="keep" type="range" min="0.2" max="3" step="0.1" class="mt-2 w-full accent-ember-700" />
            <p class="mt-1 text-xs text-stone-600">{{ t('media.keepNote') }}</p>
          </div>
        </div>
      </div>

      <div v-if="mode === 'fade'" class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="fade-in" class="block text-sm font-medium text-stone-900">{{ t('media.fadeInLabel', { n: fadeIn }) }}</label>
          <input id="fade-in" v-model.number="fadeIn" type="range" min="0" max="15" class="mt-2 w-full accent-ember-700" />
        </div>
        <div>
          <label for="fade-out" class="block text-sm font-medium text-stone-900">{{ t('media.fadeOutLabel', { n: fadeOut }) }}</label>
          <input id="fade-out" v-model.number="fadeOut" type="range" min="0" max="15" class="mt-2 w-full accent-ember-700" />
        </div>
      </div>

      <ToolsMediaProgress :phase="phase" :progress="progress" />

      <button
        type="button"
        class="rounded-lg bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-700 disabled:opacity-50"
        :disabled="!canRun"
        @click="go"
      >
        {{ t(`media.action.${mode === 'compress' ? 'audioCompress' : mode}`) }}
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
