<script setup lang="ts">
/**
 * A picture of the sound.
 *
 * `showwavespic` draws the whole file in one pass, which makes this one of the
 * cheaper things ffmpeg does — useful for a podcast thumbnail, a cover image,
 * or just seeing where in a two-hour recording anybody actually spoke.
 *
 * The colour picker is deliberate: the common use is putting this on top of
 * something else, and a waveform in the wrong orange is no use at all.
 */
import { AUDIO_TYPES, inputName, waveformArgs } from '~~/shared/media'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()
const { run, phase, progress } = useFfmpeg()

const width = ref(1600)
const height = ref(400)
const colour = ref('#c2410c')
const split = ref(false)

const file = computed(() => store.files[0] ?? null)
const canRun = computed(() => !!file.value && !store.busy)
const outputName = computed(() => withSuffix(file.value?.name ?? 'audio', '-waveform', 'png'))

async function go() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await run({
      input: { name: inputName(file.value.name, 'input.mp3'), data: file.value.data },
      output: outputName.value,
      args: waveformArgs({ width: width.value, height: height.value, colour: colour.value, split: split.value })
    })
    store.setResult({ name: outputName.value, type: 'image/png', data, sourceSize: file.value.size })
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
      :accept="AUDIO_TYPES.join(',') + ',.opus,.oga'"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="file" class="text-sm text-stone-500">{{ formatBytes(file.size) }}</p>

    <div v-if="file" class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="wave-width" class="block text-sm font-medium text-stone-900">{{ t('media.width', { n: width }) }}</label>
          <input id="wave-width" v-model.number="width" type="range" min="400" max="3000" step="100" class="mt-2 w-full accent-ember-700" />
        </div>
        <div>
          <label for="wave-height" class="block text-sm font-medium text-stone-900">{{ t('media.heightLabel', { n: height }) }}</label>
          <input id="wave-height" v-model.number="height" type="range" min="100" max="800" step="50" class="mt-2 w-full accent-ember-700" />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <label for="wave-colour" class="text-sm font-medium text-stone-900">{{ t('media.colourLabel') }}</label>
          <input id="wave-colour" v-model="colour" type="color" class="h-9 w-14 cursor-pointer rounded border border-stone-300 bg-white" />
        </div>
        <label class="flex items-center gap-2 text-sm text-stone-700">
          <input v-model="split" type="checkbox" class="accent-ember-700" />
          <span>{{ t('media.splitChannels') }}</span>
        </label>
      </div>

      <ToolsMediaProgress :phase="phase" :progress="progress" />

      <button
        type="button"
        class="rounded-lg bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-700 disabled:opacity-50"
        :disabled="!canRun"
        @click="go"
      >
        {{ t('media.action.waveform') }}
      </button>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard v-if="store.result" :result="store.result" @reset="store.reset()" @chain="store.chainResult()" />
  </div>
</template>
