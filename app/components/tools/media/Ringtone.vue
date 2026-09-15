<script setup lang="ts">
/**
 * A ringtone out of a song, which is a thing people pay for.
 *
 * The whole of what the paid apps do is here: cut up to forty seconds, encode
 * it as AAC, and put it in an MPEG-4 container with the extension `.m4r`. An
 * `.m4r` is an `.m4a` renamed — Apple simply refuses to look at anything else.
 * There is no licensing, no account and no reason it could not run on the
 * listener's own device, which is where it runs.
 *
 * Choosing the start point is the part that actually needs care, so the
 * browser's own player does it: press play, find the chorus, press "start
 * here". Nothing is decoded by us until the cut is made.
 */
import {MEDIA_MAX_SIZE, AUDIO_TYPES, inputName, RINGTONE_MAX, ringtoneArgs, type RingtonePhone } from '~~/shared/media'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()
const { run, phase, progress } = useFfmpeg()

const phone = ref<RingtonePhone>('iphone')
const start = ref(0)
const length = ref(30)
const fadeIn = ref(0.5)
const fadeOut = ref(1.5)

const duration = ref(0)
const player = ref<{ currentTime: number; playRange: (from: number, to: number) => void } | null>(null)

const file = computed(() => store.files[0] ?? null)
const canRun = computed(() => !!file.value && !store.busy && length.value > 0)

/** The cut cannot run past the end of the song. */
const maxLength = computed(() => {
  const remaining = duration.value ? Math.max(1, duration.value - start.value) : RINGTONE_MAX
  return Math.min(RINGTONE_MAX, Math.floor(remaining))
})

watch(maxLength, max => {
  if (length.value > max) length.value = max
})

const outputName = computed(() =>
  withSuffix(file.value?.name ?? 'ringtone', '', phone.value === 'iphone' ? 'm4r' : 'mp3')
)

const preview = shallowRef<string | null>(null)
watch(
  file,
  current => {
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = current ? URL.createObjectURL(new Blob([current.data as BlobPart], { type: current.type })) : null
    start.value = 0
    duration.value = 0
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  if (preview.value) URL.revokeObjectURL(preview.value)
})

function onLoaded(total: number) {
  if (total && Number.isFinite(total)) duration.value = total
}

/** Take the start from wherever the song is currently playing. */
function startHere() {
  const at = player.value?.currentTime
  if (at === undefined) return
  start.value = Math.max(0, Math.round(at * 10) / 10)
}

/** Play exactly what will be cut, so it can be judged before encoding. */
function playSelection() {
  player.value?.playRange(start.value, start.value + length.value)
}

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

async function go() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  try {
    const data = await run({
      input: { name: inputName(file.value.name, 'input.mp3'), data: file.value.data },
      // ffmpeg is given a plain .m4a and the file is named .m4r on the way out:
      // the ipod muxer is selected by -f, and writing to an extension it does
      // not recognise is the one way this fails for no reason.
      output: phone.value === 'iphone' ? 'ringtone.m4a' : 'ringtone.mp3',
      args: ringtoneArgs({
        phone: phone.value,
        start: start.value,
        duration: length.value,
        fadeIn: fadeIn.value,
        fadeOut: fadeOut.value
      })
    })
    store.setResult({
      name: outputName.value,
      type: phone.value === 'iphone' ? 'audio/mp4' : 'audio/mpeg',
      data,
      sourceSize: file.value.size,
      note: t(phone.value === 'iphone' ? 'media.ringtoneIphoneNote' : 'media.ringtoneAndroidNote')
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
      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('media.phoneLabel') }}</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in (['iphone', 'android'] as RingtonePhone[])"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="phone === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'"
          >
            <input v-model="phone" type="radio" :value="option" class="sr-only" />
            {{ t(`media.phone.${option}`) }}
          </label>
        </div>
      </fieldset>

      <ShellMediaPlayer
        v-if="preview"
        ref="player"
        :src="preview"
        kind="audio"
        :label="file.name"
        @loaded="onLoaded"
      />

      <div class="rounded-lg border border-stone-300 bg-stone-50 p-4">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label for="start" class="block text-sm font-medium text-stone-900">{{ t('media.start') }}</label>
            <ShellNumberInput id="start" v-model="start" class="mt-1 w-28" :min="0" :max="Math.max(0, duration - 1)" :decimals="1" />
          </div>
          <button
            type="button"
            class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100"
            @click="startHere"
          >
            {{ t('media.startHere') }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-ember-100"
            @click="playSelection"
          >
            {{ t('media.playSelection') }}
          </button>
        </div>

        <div class="mt-4">
          <label for="length" class="block text-sm font-medium text-stone-900">
            {{ t('media.ringtoneLength', { n: length }) }}
          </label>
          <input id="length" v-model.number="length" type="range" min="3" :max="maxLength" step="1" class="mt-2 w-full accent-ember-700" />
          <p class="mt-1 text-xs text-stone-600">
            {{ t('media.ringtoneRange', { from: clock(start), to: clock(start + length) }) }}
            <span v-if="phone === 'iphone'"> · {{ t('media.ringtoneCap', { n: RINGTONE_MAX }) }}</span>
          </p>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="rt-fade-in" class="block text-sm font-medium text-stone-900">{{ t('media.fadeInLabel', { n: fadeIn }) }}</label>
          <input id="rt-fade-in" v-model.number="fadeIn" type="range" min="0" max="5" step="0.5" class="mt-2 w-full accent-ember-700" />
        </div>
        <div>
          <label for="rt-fade-out" class="block text-sm font-medium text-stone-900">{{ t('media.fadeOutLabel', { n: fadeOut }) }}</label>
          <input id="rt-fade-out" v-model.number="fadeOut" type="range" min="0" max="5" step="0.5" class="mt-2 w-full accent-ember-700" />
        </div>
      </div>
      <p class="text-xs text-stone-600">{{ t('media.ringtoneFadeNote') }}</p>

      <ToolsMediaProgress :phase="phase" :progress="progress" />

      <button
        type="button"
        class="rounded-lg bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-700 disabled:opacity-50"
        :disabled="!canRun"
        @click="go"
      >
        {{ t('media.action.ringtone') }}
      </button>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard v-if="store.result" :result="store.result" @reset="store.reset()" @chain="store.chainResult()" />
  </div>
</template>
