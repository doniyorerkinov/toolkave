<script setup lang="ts">
/**
 * Four ways of changing a video that are not about size or format: turning it
 * the right way up, taking the sound off, lowering the resolution, and fitting
 * it into the shape a social platform wants.
 *
 * One component for the same reason as Video.vue — the file handling, the
 * 31 MB first load, the progress bar and the failure wording are identical,
 * and the only real difference is a line of ffmpeg arguments.
 */
import {
  inputName,
  muteArgs,
  resizeArgs,
  RESOLUTIONS,
  rotateArgs,
  socialArgs,
  SOCIAL_SIZES,
  VIDEO_TYPES,
  type Orientation,
  type Resolution,
  type SocialFit,
  type SocialPreset
} from '~~/shared/media'
import { formatBytes, withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const props = defineProps<{ mode: 'rotate' | 'mute' | 'resize' | 'social' }>()

const { t } = useI18n()
const store = useFilesStore()
const { run, phase, progress } = useFfmpeg()

const orientation = ref<Orientation>('right')
const height = ref<Resolution>(720)
const preset = ref<SocialPreset>('story')
const fit = ref<SocialFit>('blur')

const file = computed(() => store.files[0] ?? null)
const canRun = computed(() => !!file.value && !store.busy)

/**
 * The source, played by the browser itself, so the rotation can be previewed
 * with a CSS transform before anything is encoded. Seeing which way "left"
 * turns it is worth more than any wording, and it costs nothing: no frame is
 * decoded by us and the 31 MB core is still untouched at this point.
 */
const preview = shallowRef<string | null>(null)
watch(
  file,
  current => {
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = current ? URL.createObjectURL(new Blob([current.data as BlobPart], { type: current.type })) : null
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  if (preview.value) URL.revokeObjectURL(preview.value)
})

const PREVIEW_TRANSFORM: Record<Orientation, string> = {
  right: 'rotate(90deg)',
  left: 'rotate(-90deg)',
  half: 'rotate(180deg)',
  hflip: 'scaleX(-1)',
  vflip: 'scaleY(-1)'
}

/** A quarter turn swaps the box the video sits in, so the preview has to shrink to fit. */
const quarterTurn = computed(() => orientation.value === 'right' || orientation.value === 'left')

/**
 * Muting is the one mode that keeps the original container.
 *
 * It copies the picture rather than re-encoding it, and a copy only works
 * while the codec still suits the box it is going into — forcing MP4 here
 * would break every WebM and make an instant operation a slow one.
 */
const outputName = computed(() => {
  const name = file.value?.name ?? 'video.mp4'
  if (props.mode === 'mute') {
    const extension = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase() ?? 'mp4'
    return withSuffix(name, '-muted', extension)
  }
  if (props.mode === 'rotate') return withSuffix(name, '-rotated', 'mp4')
  if (props.mode === 'resize') return withSuffix(name, `-${height.value}p`, 'mp4')
  return withSuffix(name, `-${preset.value}`, 'mp4')
})

const outputType = computed(() =>
  props.mode === 'mute' ? (file.value?.type || 'video/mp4') : 'video/mp4'
)

function args(): string[] {
  if (props.mode === 'rotate') return rotateArgs(orientation.value)
  if (props.mode === 'mute') return muteArgs()
  if (props.mode === 'resize') return resizeArgs(height.value)
  return socialArgs(preset.value, fit.value)
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
      sourceSize: file.value.size,
      note: props.mode === 'mute' ? t('media.muteNote') : undefined
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
      :accept="VIDEO_TYPES.join(',')"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <p v-if="file" class="text-sm text-stone-500">{{ formatBytes(file.size) }}</p>

    <div v-if="file" class="space-y-4">
      <!-- Rotate: the picture itself answers "which way is left?" -->
      <div v-if="mode === 'rotate'" class="space-y-3">
        <div class="overflow-hidden rounded-lg border border-stone-300 bg-stone-900">
          <div class="mx-auto flex h-64 items-center justify-center">
            <video
              v-if="preview"
              :src="preview"
              class="max-h-full max-w-full transition-transform duration-200"
              :class="quarterTurn ? 'max-h-[14rem] w-auto' : ''"
              :style="{ transform: PREVIEW_TRANSFORM[orientation], maxHeight: quarterTurn ? '14rem' : '16rem' }"
              muted
              playsinline
              controls
            />
          </div>
        </div>

        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('media.rotateLabel') }}</legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="option in (['right', 'left', 'half', 'hflip', 'vflip'] as Orientation[])"
              :key="option"
              class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
              :class="orientation === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'"
            >
              <input v-model="orientation" type="radio" :value="option" class="sr-only" />
              {{ t(`media.rotate.${option}`) }}
            </label>
          </div>
        </fieldset>
      </div>

      <p v-if="mode === 'mute'" class="text-sm text-stone-600">{{ t('media.muteNote') }}</p>

      <fieldset v-if="mode === 'resize'">
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('media.resizeLabel') }}</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in RESOLUTIONS"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="height === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'"
          >
            <input v-model.number="height" type="radio" :value="option" class="sr-only" />
            {{ option }}p
          </label>
        </div>
        <p class="mt-2 text-sm text-stone-600">{{ t('media.resizeNote') }}</p>
      </fieldset>

      <div v-if="mode === 'social'" class="space-y-4">
        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('media.socialLabel') }}</legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="option in (['story', 'square', 'portrait', 'wide'] as SocialPreset[])"
              :key="option"
              class="cursor-pointer rounded-lg border px-4 py-2 text-left text-sm font-medium"
              :class="preset === option ? 'border-ember-500 bg-ember-50 text-ember-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'"
            >
              <input v-model="preset" type="radio" :value="option" class="sr-only" />
              <span class="block">{{ t(`media.social.${option}`) }}</span>
              <span class="block text-xs font-normal opacity-70">
                {{ SOCIAL_SIZES[option].w }} × {{ SOCIAL_SIZES[option].h }}
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('media.fitLabel') }}</legend>
          <div class="space-y-2">
            <label
              v-for="option in (['blur', 'pad', 'crop'] as SocialFit[])"
              :key="option"
              class="flex cursor-pointer items-start gap-2 text-sm text-stone-700"
            >
              <input v-model="fit" type="radio" :value="option" class="mt-0.5 accent-ember-700" />
              <span>{{ t(`media.fit.${option}`) }}</span>
            </label>
          </div>
        </fieldset>
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

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard
      v-if="store.result"
      :result="store.result"
      @reset="store.reset()"
      @chain="store.chainResult()"
    />
  </div>
</template>
