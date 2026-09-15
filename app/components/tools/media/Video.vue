<script setup lang="ts">
/**
 * Four video tools, one component, chosen by the registry's `config.mode`.
 *
 * They differ only in which arguments go to ffmpeg and what the output is
 * called; the file handling, the 31 MB first load, the progress bar and the
 * failure wording are identical, and three copies of that would be three
 * places to fix the next bug in it.
 */
import { compressVideoArgs, extractAudioArgs, gifArgs, inputName, toMp4Args, VIDEO_TYPES, type VideoQuality } from '~~/shared/media'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const props = defineProps<{ mode: 'compress' | 'mp4' | 'gif' | 'mp3' }>()

const { t } = useI18n()
const store = useFilesStore()
const { run, phase, progress } = useFfmpeg()

const quality = ref<VideoQuality>('telegram')
const fps = ref(12)
const gifWidth = ref(480)
const bitrate = ref('192k')

const file = computed(() => store.files[0] ?? null)
const canRun = computed(() => !!file.value && !store.busy)

/**
 * A .mkv or .webm already holding H.264 and AAC only needs a new container,
 * which takes a second instead of minutes. Deciding that properly means
 * probing the streams; ffmpeg.wasm can, but the probe costs the same 31 MB
 * load as the conversion. So the choice is offered instead, with the trade
 * stated: try the fast one, fall back if the result will not play.
 */
const remux = ref(false)

const outputName = computed(() => {
  const name = file.value?.name ?? 'video.mp4'
  if (props.mode === 'compress') return withSuffix(name, '-compressed', 'mp4')
  if (props.mode === 'mp4') return withSuffix(name, '', 'mp4')
  if (props.mode === 'gif') return withSuffix(name, '', 'gif')
  return withSuffix(name, '', 'mp3')
})

const outputType = computed(() =>
  props.mode === 'gif' ? 'image/gif' : props.mode === 'mp3' ? 'audio/mpeg' : 'video/mp4'
)

function args(): string[] {
  if (props.mode === 'compress') return compressVideoArgs(quality.value)
  if (props.mode === 'mp4') return toMp4Args(remux.value)
  if (props.mode === 'gif') return gifArgs({ fps: fps.value, width: gifWidth.value })
  return extractAudioArgs(bitrate.value)
}

async function go() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await run({
      input: { name: inputName(file.value.name), data: file.value.data },
      output: outputName.value,
      args: args()
    })
    store.setResult({
      name: outputName.value,
      type: outputType.value,
      data,
      sourceSize: file.value.size
    })
  } catch (error) {
    // ffmpeg's own diagnostics go to a log nobody reads; what a person needs
    // is whether to try a different setting or a different file.
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
      :accept="VIDEO_TYPES.join(',')"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="file" class="text-sm text-stone-500">{{ formatBytes(file.size) }}</p>

    <div v-if="file" class="space-y-4">
      <fieldset v-if="mode === 'compress'">
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('media.qualityLabel') }}</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in (['telegram', 'email', 'balanced', 'high'] as VideoQuality[])"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="quality === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'"
          >
            <input v-model="quality" type="radio" :value="option" class="sr-only" />
            {{ t(`media.quality.${option}`) }}
          </label>
        </div>
      </fieldset>

      <label v-if="mode === 'mp4'" class="flex items-start gap-2 text-sm text-stone-700">
        <input v-model="remux" type="checkbox" class="mt-0.5 accent-ember-700" />
        <span>{{ t('media.remux') }}</span>
      </label>

      <div v-if="mode === 'gif'" class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="gif-fps" class="block text-sm font-medium text-stone-900">{{ t('media.fps', { n: fps }) }}</label>
          <input id="gif-fps" v-model.number="fps" type="range" min="5" max="24" class="mt-2 w-full accent-ember-700" />
        </div>
        <div>
          <label for="gif-width" class="block text-sm font-medium text-stone-900">{{ t('media.width', { n: gifWidth }) }}</label>
          <input id="gif-width" v-model.number="gifWidth" type="range" min="240" max="960" step="40" class="mt-2 w-full accent-ember-700" />
        </div>
      </div>

      <div v-if="mode === 'mp3'">
        <label for="mp3-bitrate" class="block text-sm font-medium text-stone-900">{{ t('media.bitrateLabel') }}</label>
        <ShellSelect
          id="mp3-bitrate"
          v-model="bitrate"
          class="mt-2"
          :options="['320k', '192k', '128k', '96k'].map(value => ({ value, label: value.replace('k', ' kbps') }))"
        />
      </div>

      <ToolsMediaProgress :phase="phase" :progress="progress" />

      <button
        type="button"
        class="rounded-lg bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-700 disabled:opacity-50"
        :disabled="!canRun"
        @click="go"
      >
        {{ t(`media.action.${mode}`) }}
      </button>
    </div>
  </div>
</template>
