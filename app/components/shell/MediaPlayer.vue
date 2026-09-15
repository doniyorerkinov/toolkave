<script setup lang="ts">
import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-vue-next'

/**
 * The site's own video and audio player.
 *
 * The browser's built-in controls are a grey pill that belongs to Chrome, not
 * to this page — wrong shape, wrong colour, and a different wrong in every
 * browser. Everything here is one `<video>` or `<audio>` element with
 * `controls` left off and our own row underneath, so a result looks like part
 * of the site whichever browser opened it.
 *
 * The scrub bar is a real `<input type="range">` rather than a styled div,
 * which is the whole reason it can be driven from the keyboard and read by a
 * screen reader without any of that being written by hand. `accent-color` is
 * how every other slider on the site is coloured, so it matches those too.
 */
const props = withDefaults(
  defineProps<{
    src: string
    kind: 'video' | 'audio'
    /** Shown to assistive technology; the file name in practice. */
    label?: string
    /**
     * Applied to the picture itself rather than the frame around it, for the
     * one caller that needs it: the rotate tool previews a turn with a CSS
     * transform, and a transform on the wrapper would take the controls with it.
     */
    mediaStyle?: Record<string, string>
  }>(),
  { label: '', mediaStyle: undefined }
)

const emit = defineEmits<{ loaded: [number]; error: [] }>()

const { t } = useI18n()

const media = ref<HTMLMediaElement | null>(null)
const playing = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const muted = ref(false)

/**
 * True while the scrub handle is held. Without it the element's own
 * `timeupdate` keeps writing the slider back to where playback actually is,
 * and the handle fights the finger dragging it.
 */
const scrubbing = ref(false)

/** Where the bar should sit: the drag position while dragging, else playback. */
const position = ref(0)
watch(currentTime, value => {
  if (!scrubbing.value) position.value = value
})

const known = computed(() => Number.isFinite(duration.value) && duration.value > 0)

function onLoaded() {
  const element = media.value
  if (!element) return
  duration.value = Number.isFinite(element.duration) ? element.duration : 0
  emit('loaded', duration.value)
}

function toggle() {
  const element = media.value
  if (!element) return
  if (element.paused) void element.play()
  else element.pause()
}

function onScrub(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  position.value = value
  // Seek live while dragging: a scrub that only lands on release makes finding
  // a moment in a long file guesswork.
  if (media.value) media.value.currentTime = value
}

function toggleMute() {
  const element = media.value
  if (!element) return
  element.muted = !element.muted
  muted.value = element.muted
}

function onVolume(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  volume.value = value
  if (!media.value) return
  media.value.volume = value
  // Dragging the slider up off zero should unmute, or the sound stays off and
  // the control looks broken.
  media.value.muted = value === 0
  muted.value = media.value.muted
}

function fullscreen() {
  const element = media.value
  if (element && 'requestFullscreen' in element) void element.requestFullscreen().catch(() => {})
}

/** Space and Enter on the player itself, the way a play button should behave. */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== ' ' && event.key !== 'Enter') return
  event.preventDefault()
  toggle()
}

/** m:ss, or h:mm:ss once there is an hour to show. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

// A new file in the same player: start from the beginning rather than from
// wherever the last one happened to be paused.
watch(
  () => props.src,
  () => {
    playing.value = false
    currentTime.value = 0
    position.value = 0
    duration.value = 0
  }
)

defineExpose({
  currentTime,
  duration,
  play: () => media.value?.play(),
  pause: () => media.value?.pause(),
  seek: (to: number) => {
    if (media.value) media.value.currentTime = to
  },
  /** Play from `from` and stop at `to` — previewing a cut without making one. */
  playRange: (from: number, to: number) => {
    const element = media.value
    if (!element) return
    element.currentTime = from
    void element.play()
    const stop = () => {
      if (element.currentTime < to) return
      element.pause()
      element.removeEventListener('timeupdate', stop)
    }
    element.addEventListener('timeupdate', stop)
  }
})
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-stone-300 bg-ink">
    <!--
      bg-ink, not a stone value: the stone ramp turns over in dark mode, so
      bg-stone-900 would make these letterbox bars nearly white on exactly the
      theme where black matters most.
    -->
    <video
      v-if="kind === 'video'"
      ref="media"
      :src="src"
      :aria-label="label || undefined"
      :style="mediaStyle"
      class="block max-h-80 w-full cursor-pointer bg-ink transition-transform"
      playsinline
      preload="metadata"
      tabindex="0"
      @click="toggle"
      @keydown="onKeydown"
      @loadedmetadata="onLoaded"
      @timeupdate="currentTime = media?.currentTime ?? 0"
      @play="playing = true"
      @pause="playing = false"
      @ended="playing = false"
      @error="emit('error')"
    />
    <audio
      v-else
      ref="media"
      :src="src"
      :aria-label="label || undefined"
      class="hidden"
      preload="metadata"
      @loadedmetadata="onLoaded"
      @timeupdate="currentTime = media?.currentTime ?? 0"
      @play="playing = true"
      @pause="playing = false"
      @ended="playing = false"
      @error="emit('error')"
    />

    <div class="flex items-center gap-3 px-3 py-2.5">
      <button
        type="button"
        class="flex size-9 shrink-0 items-center justify-center rounded-full bg-ember-600 text-white transition hover:bg-ember-500 focus-visible:ring-2 focus-visible:ring-ember-300 focus-visible:outline-none"
        :aria-label="playing ? t('player.pause') : t('player.play')"
        @click="toggle"
      >
        <Pause v-if="playing" :size="16" aria-hidden="true" />
        <Play v-else :size="16" class="ms-0.5" aria-hidden="true" />
      </button>

      <!-- Tabular figures, or the whole row twitches sideways once a second. -->
      <span class="shrink-0 font-mono text-xs tabular-nums text-on-ink-dim">
        {{ clock(position) }} / {{ known ? clock(duration) : '--:--' }}
      </span>

      <input
        type="range"
        class="h-1.5 min-w-0 flex-1 cursor-pointer accent-ember-500"
        min="0"
        :max="known ? duration : 0"
        step="0.1"
        :value="position"
        :disabled="!known"
        :aria-label="t('player.seek')"
        :aria-valuetext="clock(position)"
        @input="onScrub"
        @pointerdown="scrubbing = true"
        @pointerup="scrubbing = false"
        @keydown.left="scrubbing = false"
        @keydown.right="scrubbing = false"
      />

      <button
        type="button"
        class="flex size-8 shrink-0 items-center justify-center rounded-lg text-on-ink-dim transition hover:bg-ember-500/20 hover:text-on-ink focus-visible:ring-2 focus-visible:ring-ember-300 focus-visible:outline-none"
        :aria-label="muted ? t('player.unmute') : t('player.mute')"
        @click="toggleMute"
      >
        <VolumeX v-if="muted || volume === 0" :size="16" aria-hidden="true" />
        <Volume2 v-else :size="16" aria-hidden="true" />
      </button>

      <!-- Hidden on a phone, where the hardware buttons are the volume control. -->
      <input
        type="range"
        class="hidden h-1.5 w-16 shrink-0 cursor-pointer accent-ember-500 sm:block"
        min="0"
        max="1"
        step="0.05"
        :value="muted ? 0 : volume"
        :aria-label="t('player.volume')"
        @input="onVolume"
      />

      <button
        v-if="kind === 'video'"
        type="button"
        class="flex size-8 shrink-0 items-center justify-center rounded-lg text-on-ink-dim transition hover:bg-ember-500/20 hover:text-on-ink focus-visible:ring-2 focus-visible:ring-ember-300 focus-visible:outline-none"
        :aria-label="t('player.fullscreen')"
        @click="fullscreen"
      >
        <Maximize :size="16" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
