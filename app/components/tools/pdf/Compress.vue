<script setup lang="ts">
import { withSuffix } from '~/utils/formatters'
import { useFilesStore } from '~/stores/files'

const { t } = useI18n()
const store = useFilesStore()

const level = ref<'light' | 'balanced' | 'strong'>('balanced')
const lastRun = ref<{ imagesCompressed: number; imagesSkipped: number } | null>(null)

const LEVELS: Record<typeof level.value, { quality: number; maxDimension: number }> = {
  light: { quality: 0.8, maxDimension: 2000 },
  balanced: { quality: 0.65, maxDimension: 1600 },
  strong: { quality: 0.5, maxDimension: 1200 }
}

const file = computed(() => store.files[0] ?? null)
const canRun = computed(() => !!file.value && !store.busy)

async function run() {
  if (!canRun.value || !file.value) return
  store.busy = true
  store.error = null
  lastRun.value = null

  try {
    const { data, imagesCompressed, imagesSkipped } = await compressPdf(file.value, LEVELS[level.value])
    lastRun.value = { imagesCompressed, imagesSkipped }

    if (imagesCompressed === 0) {
      store.error = t('pdf.compress.nothingToCompress')
      return
    }

    store.setResult({
      name: withSuffix(file.value.name, '-compressed'),
      type: 'application/pdf',
      data,
      sourceSize: file.value.size
    })
  } catch (error) {
    store.error = t(pdfErrorKey(error))
  } finally {
    store.busy = false
  }
}

function onFiles(files: File[]) {
  store.reset()
  lastRun.value = null
  store.add(files.slice(0, 1))
}
</script>

<template>
  <div class="space-y-4">
    <ShellFileDropzone
      v-if="!file"
      accept="application/pdf"
      :multiple="false"
      @files="onFiles($event)"
    />
    <ShellFileList v-else :files="store.files" :reorderable="false" @remove="store.remove($event)" />

    <fieldset v-if="file">
      <legend class="mb-2 text-sm font-medium text-stone-700">{{ t('pdf.compress.level') }}</legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in (['light', 'balanced', 'strong'] as const)"
          :key="option"
          type="button"
          :aria-pressed="level === option"
          class="rounded-lg border px-3 py-1.5 text-sm font-medium transition"
          :class="
            level === option
              ? 'border-ember-600 bg-ember-50 text-ember-900'
              : 'border-stone-300 bg-white text-stone-700 hover:bg-ember-100'
          "
          @click="level = option"
        >
          {{ t(`pdf.compress.levels.${option}`) }}
        </button>
      </div>
    </fieldset>

    <!--
      Said up front: this recompresses images, not text. A text-only PDF is
      already small, and pretending otherwise would be exactly the kind of
      "looks like it worked" result that erodes trust in the tool.
    -->
    <p class="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
      {{ t('pdf.compress.notice') }}
    </p>

    <div v-if="file" class="flex flex-wrap gap-2">
      <button
        type="button"
        :disabled="!canRun"
        class="rounded-lg bg-ember-700 px-5 py-2.5 font-medium text-white hover:bg-ember-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        @click="run"
      >
        {{ store.busy ? t('pdf.working') : t('pdf.compress.action') }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-ember-100"
        @click="store.reset()"
      >
        {{ t('result.startOver') }}
      </button>
    </div>

    <p v-if="store.error" class="text-sm text-red-700" role="alert">{{ store.error }}</p>

    <p
      v-if="lastRun && lastRun.imagesCompressed > 0"
      class="text-sm text-stone-500"
    >
      {{ t('pdf.compress.summary', { compressed: lastRun.imagesCompressed, skipped: lastRun.imagesSkipped }) }}
    </p>

    <ShellResultCard
      v-if="store.result"
      :result="store.result"
      @reset="store.reset()"
      @chain="store.chainResult()"
    />
  </div>
</template>
