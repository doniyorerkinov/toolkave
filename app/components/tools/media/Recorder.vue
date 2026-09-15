<script setup lang="ts">
/**
 * Record the screen, or record a voice, using nothing but the browser.
 *
 * Every other tool on this page is ffmpeg and a 31 MB download. This one is
 * `MediaRecorder`, which every current browser already has: recording starts
 * the instant permission is given, and the result is a finished file with no
 * encoding step at all. That is worth the separate component — wiring it
 * through the ffmpeg machinery would add thirty megabytes to a tool that needs
 * none of it.
 *
 * What comes out is WebM nearly everywhere and MP4 on Safari, because that is
 * what each browser can encode natively. Converting is a separate tool, which
 * the result card offers as the next step.
 */
import { useFilesStore } from '~/stores/files'

const props = defineProps<{ source: 'screen' | 'mic' }>()

const { t } = useI18n()
const store = useFilesStore()

const state = ref<'idle' | 'recording'>('idle')
const seconds = ref(0)
const level = ref(0)
const withMic = ref(true)

let recorder: MediaRecorder | null = null
let stream: MediaStream | null = null
let ticker: ReturnType<typeof setInterval> | null = null
let audioContext: AudioContext | null = null
let meter: number | null = null

/**
 * The best container this browser will actually encode.
 *
 * `isTypeSupported` is the only honest way to ask: passing an unsupported type
 * to MediaRecorder throws on some browsers and is silently ignored on others,
 * which produces a file with the wrong extension and no way to tell.
 */
function pickType(): string {
  const wanted = props.source === 'screen'
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return wanted.find(type => MediaRecorder.isTypeSupported(type)) ?? ''
}

const extensionFor = (type: string) =>
  type.includes('mp4') ? (props.source === 'screen' ? 'mp4' : 'm4a')
    : type.includes('ogg') ? 'ogg'
      : props.source === 'screen' ? 'webm' : 'weba'

/** A live level bar, so a silent microphone is obvious before the recording ends. */
function startMeter(source: MediaStream) {
  if (props.source !== 'mic' || !source.getAudioTracks().length) return
  audioContext = new AudioContext()
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = 512
  audioContext.createMediaStreamSource(source).connect(analyser)
  const data = new Uint8Array(analyser.frequencyBinCount)
  const read = () => {
    analyser.getByteTimeDomainData(data)
    let peak = 0
    for (const sample of data) peak = Math.max(peak, Math.abs(sample - 128))
    level.value = Math.min(1, peak / 96)
    meter = requestAnimationFrame(read)
  }
  read()
}

function cleanup() {
  if (ticker) { clearInterval(ticker); ticker = null }
  if (meter !== null) { cancelAnimationFrame(meter); meter = null }
  if (audioContext) { void audioContext.close(); audioContext = null }
  stream?.getTracks().forEach(track => track.stop())
  stream = null
  recorder = null
  level.value = 0
}

onBeforeUnmount(cleanup)

async function start() {
  store.error = null
  store.setResult(null)
  try {
    stream = props.source === 'screen'
      // `audio: true` asks for the tab or system sound. Chrome offers it, Firefox
      // and Safari mostly do not, and neither refuses the request over it — so a
      // silent screen recording is a browser limitation rather than a failure.
      ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: withMic.value })
      : await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (error) {
    store.error = t(
      error instanceof DOMException && error.name === 'NotAllowedError' ? 'media.recordDenied' : 'media.recordUnavailable'
    )
    return
  }

  const type = pickType()
  const chunks: BlobPart[] = []
  recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
  recorder.onstop = async () => {
    const produced = recorder?.mimeType || type || 'video/webm'
    const blob = new Blob(chunks, { type: produced })
    cleanup()
    state.value = 'idle'
    if (!blob.size) { store.error = t('media.recordEmpty'); return }
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    store.setResult({
      name: `${props.source === 'screen' ? 'screen' : 'voice'}-${stamp}.${extensionFor(produced)}`,
      type: produced.split(';')[0] ?? produced,
      data: new Uint8Array(await blob.arrayBuffer()),
      sourceSize: 0
    })
  }

  // Stopping the share from the browser's own bar ends the track, not the
  // recorder; without this the timer keeps running over a dead stream.
  stream.getTracks().forEach(track => track.addEventListener('ended', () => stop()))

  seconds.value = 0
  ticker = setInterval(() => { seconds.value += 1 }, 1000)
  startMeter(stream)
  recorder.start(1000)
  state.value = 'recording'
}

function stop() {
  if (recorder?.state === 'recording') {
    recorder.stop()
    return
  }
  // Reached when the stream died before anything was captured — the share was
  // cancelled at once, or the permission led to a device that is not actually
  // there. Falling quietly back to the start button would look like the button
  // did nothing, so it says so instead.
  cleanup()
  state.value = 'idle'
  if (!store.result) store.error = t('media.recordEmpty')
}

const clock = computed(() => {
  const value = seconds.value
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
})
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-lg border border-stone-300 bg-stone-50 p-6 text-center">
      <p v-if="state === 'idle'" class="text-sm text-stone-600">
        {{ t(source === 'screen' ? 'media.recordScreenHint' : 'media.recordMicHint') }}
      </p>

      <div v-else class="space-y-3">
        <p class="font-mono text-3xl font-semibold text-stone-900" role="timer">{{ clock }}</p>
        <p class="flex items-center justify-center gap-2 text-sm font-medium text-red-700">
          <span class="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
          {{ t('media.recording') }}
        </p>

        <!-- A silent microphone is otherwise only discovered after the fact. -->
        <div v-if="source === 'mic'" class="mx-auto h-2 w-48 overflow-hidden rounded-full bg-stone-300">
          <div
            class="h-full rounded-full bg-ember-600 transition-[width] duration-75"
            :style="{ width: `${Math.max(2, level * 100)}%` }"
          />
        </div>
      </div>

      <label v-if="state === 'idle' && source === 'screen'" class="mt-4 flex items-center justify-center gap-2 text-sm text-stone-700">
        <input v-model="withMic" type="checkbox" class="accent-ember-700" />
        <span>{{ t('media.recordWithSound') }}</span>
      </label>

      <button
        v-if="state === 'idle'"
        type="button"
        class="mt-4 rounded-lg bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ember-700"
        @click="start"
      >
        {{ t(source === 'screen' ? 'media.action.recordScreen' : 'media.action.recordVoice') }}
      </button>
      <button
        v-else
        type="button"
        class="mt-4 rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700"
        @click="stop"
      >
        {{ t('media.stopRecording') }}
      </button>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard v-if="store.result" :result="store.result" @reset="store.reset()" @chain="store.chainResult()" />
  </div>
</template>
