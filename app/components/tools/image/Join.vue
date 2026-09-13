<script setup lang="ts">
import { EXTENSION, MIME, UNSUPPORTED_OUTPUT, joinImages, type ImageFormat, type JoinOptions } from '~/composables/useImage'
import { formatBytes } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

/**
 * Several pictures side by side, one file out.
 *
 * The order is the order in the list, which can be dragged — the same
 * arrangement the PDF tools use, so nobody has to learn a second one.
 */
const { t } = useI18n()
const store = useFilesStore()

const direction = ref<JoinOptions['direction']>('row')
const columns = ref(2)
const gap = ref(0)
const background = ref('#ffffff')
const format = ref<ImageFormat>('jpeg')

const files = computed(() => store.files)
const canRun = computed(() => files.value.length >= 2 && !store.busy)

async function run() {
  if (!canRun.value) return
  store.busy = true
  store.error = null
  try {
    const out = await joinImages(
      [...files.value],
      { direction: direction.value, columns: columns.value, gap: gap.value, background: background.value },
      format.value,
      0.92
    )
    store.setResult({
      name: `joined.${EXTENSION[format.value]}`,
      type: MIME[format.value],
      data: out.data,
      sourceSize: files.value.reduce((sum, file) => sum + file.size, 0),
      note: t('image.join.note', { n: files.value.length, w: out.width, h: out.height })
    })
  } catch (error) {
    store.error =
      error instanceof Error && error.message === UNSUPPORTED_OUTPUT
        ? t('image.errorFormatUnsupported', { format: format.value.toUpperCase() })
        : t('image.errorGeneric')
  } finally {
    store.busy = false
  }
}

function onFiles(chosen: File[]) {
  store.add(chosen)
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
      :multiple="true"
      @files="onFiles($event)"
    />
    <ShellFileList
      v-if="files.length"
      :files="files"
      :reorderable="true"
      @remove="store.remove($event)"
      @move="(from, to) => store.move(from, to)"
    />

    <p v-if="files.length" class="text-sm text-stone-500">
      {{ t('image.join.count', { n: files.length }) }} ·
      {{ formatBytes(files.reduce((sum, file) => sum + file.size, 0)) }}
    </p>

    <div v-if="files.length >= 2" class="space-y-4">
      <fieldset>
        <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('image.join.directionLabel') }}</legend>
        <div class="flex flex-wrap items-center gap-2">
          <label
            v-for="option in (['row', 'column', 'grid'] as JoinOptions['direction'][])"
            :key="option"
            class="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium"
            :class="
              direction === option
                ? 'border-ember-500 bg-ember-50 text-ember-900'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            "
          >
            <input v-model="direction" type="radio" :value="option" class="sr-only" />
            {{ t(`image.join.direction.${option}`) }}
          </label>
          <label v-if="direction === 'grid'" class="flex items-center gap-2 text-sm text-stone-700">
            <span>{{ t('image.join.columns') }}</span>
            <input
              v-model.number="columns"
              type="number"
              min="1"
              :max="Math.max(1, files.length)"
              class="w-20 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm"
            />
          </label>
        </div>
        <p class="mt-2 text-sm text-stone-500">{{ t(`image.join.hint.${direction}`) }}</p>
      </fieldset>

      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <label for="join-gap" class="block text-sm font-medium text-stone-900">
            {{ t('image.join.gap', { n: gap }) }}
          </label>
          <input id="join-gap" v-model.number="gap" type="range" min="0" max="80" class="mt-2 w-full accent-ember-700" />
        </div>
        <div v-if="gap > 0 || direction === 'grid'">
          <label for="join-background" class="block text-sm font-medium text-stone-900">
            {{ t('image.join.backgroundLabel') }}
          </label>
          <input
            id="join-background"
            v-model="background"
            type="color"
            class="mt-2 h-10 w-20 cursor-pointer rounded border border-stone-300 bg-white"
          />
        </div>
        <fieldset>
          <legend class="mb-2 block text-sm font-medium text-stone-900">{{ t('image.formatLabel') }}</legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="option in (['jpeg', 'png', 'webp'] as ImageFormat[])"
              :key="option"
              class="cursor-pointer rounded-lg border px-3.5 py-2 text-sm font-medium"
              :class="
                format === option
                  ? 'border-ember-500 bg-ember-50 text-ember-900'
                  : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              "
            >
              <input v-model="format" type="radio" :value="option" class="sr-only" />
              {{ option.toUpperCase() }}
            </label>
          </div>
        </fieldset>
      </div>
    </div>

    <div v-if="files.length" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('image.working') : t('image.join.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
        @click="store.reset()"
      >
        {{ t('result.startOver') }}
      </button>
    </div>

    <p v-if="files.length === 1" class="text-sm text-stone-500">{{ t('image.join.needTwo') }}</p>
    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <ShellResultCard v-if="store.result" :result="store.result" @reset="store.reset()" @chain="store.chainResult()" />
  </div>
</template>
