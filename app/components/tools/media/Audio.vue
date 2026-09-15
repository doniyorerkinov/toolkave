<script setup lang="ts">
/**
 * Three audio tools behind one component: convert, normalise, and the
 * Telegram voice message nobody can play outside Telegram.
 *
 * The third is the same call as the first with the format fixed, and it exists
 * as its own page because "ogg to mp3" is what people search for after being
 * sent a voice note they need to keep.
 */
import { AUDIO_TYPES, convertAudioArgs, inputName, normaliseArgs, type AudioFormat } from '~~/shared/media'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const props = defineProps<{ mode: 'convert' | 'normalise' | 'voice' }>()

const { t } = useI18n()
const store = useFilesStore()
const { run, phase, progress } = useFfmpeg()

const format = ref<AudioFormat>('mp3')
const target = computed<AudioFormat>(() => (props.mode === 'convert' ? format.value : 'mp3'))

const file = computed(() => store.files[0] ?? null)
const canRun = computed(() => !!file.value && !store.busy)

const outputName = computed(() =>
  withSuffix(file.value?.name ?? 'audio', props.mode === 'normalise' ? '-normalised' : '', target.value)
)

const MIME: Record<AudioFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac'
}

async function go() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await run({
      input: { name: inputName(file.value.name, 'input.mp3'), data: file.value.data },
      output: outputName.value,
      args: props.mode === 'normalise' ? normaliseArgs() : convertAudioArgs(target.value)
    })
    store.setResult({
      name: outputName.value,
      type: MIME[target.value],
      data,
      sourceSize: file.value.size,
      note: props.mode === 'normalise' ? t('media.normalisedNote') : undefined
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
      :accept="AUDIO_TYPES.join(',') + ',video/mp4,video/webm,.opus,.oga'"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="file" class="text-sm text-stone-500">{{ formatBytes(file.size) }}</p>

    <div v-if="file" class="space-y-4">
      <fieldset v-if="mode === 'convert'">
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('media.formatLabel') }}</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in (['mp3', 'wav', 'ogg', 'm4a', 'flac'] as AudioFormat[])"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="format === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'"
          >
            <input v-model="format" type="radio" :value="option" class="sr-only" />
            {{ option.toUpperCase() }}
          </label>
        </div>
      </fieldset>

      <p v-if="mode === 'normalise'" class="text-sm text-stone-600">{{ t('media.normaliseNote') }}</p>

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

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard
      v-if="store.result"
      :result="store.result"
      @reset="store.reset()"
      @chain="store.chainResult()"
    />
  </div>
</template>
