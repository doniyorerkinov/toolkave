<script setup lang="ts">
/**
 * Join several clips, or several recordings, into one.
 *
 * The hard part is not the joining, it is that ffmpeg's `concat` filter
 * refuses inputs that differ in size, frame rate or sample rate — and clips
 * from two different phones differ in all three. So everything is normalised
 * into one common shape first, which is also why this always re-encodes and
 * takes about as long as the total running time.
 *
 * The audio question is settled by asking rather than guessing: `concat` fails
 * outright if one input in a batch has no sound, so each file is probed first
 * and a batch containing a silent clip is joined as video only. Probing costs
 * nothing extra — it reads the headers with the same engine the merge needs
 * loaded anyway.
 */
import { AUDIO_TYPES, inputNames, mergeAudioArgs, mergeVideoArgs, VIDEO_TYPES } from '~~/shared/media'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const props = defineProps<{ kind: 'video' | 'audio' }>()

const { t } = useI18n()
const store = useFilesStore()
const { run, probe, phase, progress } = useFfmpeg()

const height = ref(720)

const files = computed(() => store.files)
const canRun = computed(() => files.value.length >= 2 && !store.busy)

const outputName = computed(() =>
  withSuffix(files.value[0]?.name ?? 'merged', '-merged', props.kind === 'video' ? 'mp4' : 'mp3')
)

/** Set when a silent clip forced the whole batch to be joined without sound. */
const droppedAudio = ref(false)

async function go() {
  if (!canRun.value) return
  store.busy = true
  store.error = null
  droppedAudio.value = false
  try {
    const names = inputNames(files.value.map(file => file.name), props.kind === 'video' ? 'input.mp4' : 'input.mp3')
    const inputs = files.value.map((file, index) => ({ name: names[index] as string, data: file.data }))

    let args: string[]
    if (props.kind === 'audio') {
      args = mergeAudioArgs(inputs.length)
    } else {
      // Probe copies are needed because writeFile transfers the buffer and
      // leaves the original detached; the merge still has to read them after.
      const hasAudio: boolean[] = []
      for (const input of inputs) {
        const lines = await probe({ name: `probe-${input.name}`, data: input.data.slice() })
        hasAudio.push(lines.some(line => /Stream #\d+:\d+.*: Audio:/.test(line)))
      }
      const audio = hasAudio.every(Boolean)
      droppedAudio.value = !audio
      args = mergeVideoArgs({ count: inputs.length, height: height.value, audio })
    }

    const data = await run({ inputs, output: outputName.value, args })
    store.setResult({
      name: outputName.value,
      type: props.kind === 'video' ? 'video/mp4' : 'audio/mpeg',
      data,
      sourceSize: files.value.reduce((total, file) => total + file.size, 0),
      note: droppedAudio.value ? t('media.mergeSilentNote') : undefined
    })
  } catch (error) {
    store.error = error instanceof Error && error.message === 'FFMPEG_FAILED' ? t('media.errorMerge') : t('media.errorGeneric')
  } finally {
    store.busy = false
  }
}

function onFiles(incoming: File[]) {
  store.error = null
  store.add(incoming.slice(0, 10 - files.value.length))
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      :accept="(kind === 'video' ? VIDEO_TYPES : AUDIO_TYPES).join(',')"
      :multiple="true"
      @files="onFiles($event)"
    />

    <!-- Order is the whole point of this tool, so the list stays draggable. -->
    <ShellFileList v-if="files.length" :files="files" :reorderable="true" @remove="store.remove($event)" @move="(from, to) => store.move(from, to)" />

    <p v-if="files.length" class="text-sm text-stone-500">
      {{ t('media.mergeCount', { n: files.length }) }} · {{ formatBytes(files.reduce((total, file) => total + file.size, 0)) }}
    </p>
    <p v-if="files.length === 1" class="text-sm text-stone-600">{{ t('media.mergeNeedTwo') }}</p>

    <div v-if="files.length >= 2" class="space-y-4">
      <div v-if="kind === 'video'">
        <label for="merge-height" class="block text-sm font-medium text-stone-900">{{ t('media.mergeHeightLabel') }}</label>
        <ShellSelect
          id="merge-height"
          v-model.number="height"
          class="mt-2"
          :options="[1080, 720, 480, 360].map(value => ({ value, label: `${value}p` }))"
        />
        <p class="mt-2 text-sm text-stone-600">{{ t('media.mergeHeightNote') }}</p>
      </div>

      <ToolsMediaProgress :phase="phase" :progress="progress" />

      <button
        type="button"
        class="rounded-lg bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-700 disabled:opacity-50"
        :disabled="!canRun"
        @click="go"
      >
        {{ t('media.action.merge') }}
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
